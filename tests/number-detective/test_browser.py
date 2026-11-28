import unittest
from playwright.sync_api import expect
from browser_support import DetectiveBrowserCase

class NumberDetectiveTests(DetectiveBrowserCase):
    def test_feedback_validation_and_duplicate_guesses(self):
        self.start()
        for invalid in ['12','112','abc']:
            self.guess(invalid);expect(self.page.locator('#history tr')).to_have_count(0)
            self.assertEqual(self.balances(),[5,5])
        self.guess('132')
        expect(self.page.locator('#latestRight')).to_have_text('1')
        expect(self.page.locator('#latestWrong')).to_have_text('2')
        self.assertEqual(self.balances(),[4,5])
        self.guess('132');expect(self.page.locator('#message')).to_contain_text('already tried')
        self.assertEqual(self.balances(),[4,5])

    def test_points_accumulate_across_rounds(self):
        p=self.page;self.start();self.guess('456');self.guess('123')
        expect(p.locator('#resultTitle')).to_have_text('Bob wins!')
        self.assertEqual(self.balances(),[4,9])
        p.locator('#playAgain').click();self.assertEqual(self.balances(),[9,14])
        self.guess('123');self.assertEqual(self.balances(),[13,14])
        p.locator('#playAgain').click();self.assertEqual(self.balances(),[18,19])

    def test_zero_points_skip_and_last_point_win(self):
        p=self.page;self.start();self.guess('123')
        self.assertEqual(self.balances(),[9,5])
        p.locator('#playAgain').click();self.assertEqual(self.balances(),[14,10])
        codes=self.wrong_codes(23)
        for code in codes:self.guess(code)
        self.assertEqual(self.balances(),[1,0])
        expect(p.locator('#currentPlayer')).to_have_text('Alice’s turn')
        expect(p.locator('#pointsList li[data-player="1"]')).to_contain_text('Out this round')
        expect(p.locator('#history tr').first.locator('.history-player')).to_have_text('Alice')
        self.guess('123');self.assertEqual(self.balances(),[5,0])
        expect(p.locator('#resultTitle')).to_have_text('Alice wins!')
        p.locator('#playAgain').click();self.assertEqual(self.balances(),[10,5])

    def test_all_players_run_out_and_refill(self):
        p=self.page
        for count in [2,5]:
            self.start(count=count)
            for code in self.wrong_codes(count*5):self.guess(code)
            expect(p.locator('#resultTitle')).to_have_text('Everyone is out of points.')
            self.assertEqual(self.balances(),[0]*count)
            expect(p.locator('#guessForm')).to_be_hidden()
            p.locator('#playAgain').click();self.assertEqual(self.balances(),[5]*count)

    def test_solo_and_all_player_counts(self):
        p=self.page
        for count in range(1,6):
            self.start(count=count)
            for code in self.wrong_codes(count):self.guess(code)
            expect(p.locator('#currentPlayer')).to_have_text('Your turn' if count==1 else 'Alice’s turn')
            self.guess('123')
            expect(p.locator('#resultTitle')).to_have_text('You cracked the code!' if count==1 else 'Alice wins!')
        self.start(count=1)
        for code in self.wrong_codes(12):self.guess(code)
        expect(p.locator('#pointsBoard')).to_be_hidden();expect(p.locator('#guessForm')).to_be_visible()
        self.guess('123');expect(p.locator('#resultTitle')).to_have_text('You cracked the code!')

    def test_best_record_counts_everyones_guesses_and_only_improves(self):
        p=self.page
        for count,wrong,total in [(3,4,5),(1,5,5),(2,4,5),(1,2,3),(5,1,2)]:
            self.start(count=count)
            for code in self.wrong_codes(wrong):self.guess(code)
            self.guess('123');expect(p.locator('#bestRecordCount')).to_have_text(f'{total} total guesses')
        expect(p.locator('#bestRecordOwner')).to_have_text('Bob · 5 players')
        p.reload();expect(p.locator('#bestRecordCount')).to_have_text('2 total guesses')
        expect(p.locator('#setupScreen')).to_be_visible()

    def test_no_saved_round_reload_or_back_resume_but_names_and_best_remain(self):
        p=self.page;self.start();self.guess('456')
        self.assertIsNone(p.evaluate("localStorage.getItem('number-detective-v1')"))
        p.reload();expect(p.locator('#setupScreen')).to_be_visible()
        expect(p.locator('#resumeGame, #savedGamePanel')).to_have_count(0)
        p.locator('#startCompetition').click();self.assertEqual(self.balances(),[5,5])
        self.guess('123');expect(p.locator('#bestRecordCount')).to_have_text('1 total guess')
        p.locator('#backToDetectives').click()
        expect(p.locator('#setupScreen')).to_be_visible();expect(p.locator('#gameScreen')).to_be_hidden()
        expect(p.locator('#playerNames input').first).to_have_value('Alice')
        p.go_back();expect(p.locator('#setupScreen')).to_be_visible()
        p.locator('#startCompetition').click();self.assertEqual(self.balances(),[5,5])
        expect(p.locator('#bestRecordCount')).to_have_text('1 total guess')

    def test_old_saved_round_is_removed_without_touching_preferences_or_record(self):
        p=self.page;p.goto(self.url)
        p.evaluate("localStorage.setItem('number-detective-v1',JSON.stringify({answer:'123',guesses:['456'],players:['Old player'],revealed:false}));localStorage.setItem('number-detective-best-v1',JSON.stringify({guesses:4,name:'Yuwei',playerCount:2}));localStorage.setItem('number-detective-players',JSON.stringify({count:3,names:['A','B','C']}))")
        p.goto(self.url+'play.html?variant=number&screen=game')
        expect(p.locator('#setupScreen')).to_be_visible()
        expect(p.locator('#playerCount')).to_have_value('3')
        expect(p.locator('#playerNames input').first).to_have_value('A')
        self.assertIsNone(p.evaluate("localStorage.getItem('number-detective-v1')"))
        p.locator('#startCompetition').click();expect(p.locator('#bestRecordCount')).to_have_text('4 total guesses')

    def test_touch_keyboard_leading_zero_and_reveal(self):
        p=self.page;self.start(count=1)
        p.locator('[data-digit="4"]').click();p.locator('#backspace').click();expect(p.locator('#guess')).to_have_value('')
        p.evaluate("__testAnswer='012'")
        p.locator('#newGame').click()
        for digit in '012':p.locator(f'[data-digit="{digit}"]').click()
        p.locator('#guess').press('Enter');expect(p.locator('#resultDetail')).to_contain_text('012')
        p.locator('#playAgain').click();p.locator('#reveal').click();p.locator('#cancelAction').click()
        expect(p.locator('#guessForm')).to_be_visible()
        p.locator('#reveal').click();p.locator('#confirmAction').click()
        expect(p.locator('#resultTitle')).to_have_text('The code was 012.')
        expect(p.locator('#recordNotice')).to_be_hidden()

    def test_setup_names_layout_and_library_navigation(self):
        p=self.page;p.goto(self.url+'play.html?variant=number')
        p.locator('#playerCount').select_option('5')
        for i,name in enumerate(['Alice','Bob','Chris','Dana','Eli']):p.locator('#playerNames input').nth(i).fill(name)
        p.locator('#playerCount').select_option('2');p.locator('#playerCount').select_option('5')
        expect(p.locator('#playerNames input').nth(4)).to_have_value('Eli')
        p.reload();expect(p.locator('#playerCount')).to_have_value('5')
        p.locator('#startCompetition').click()
        for width in [320,390,768,1280]:
            p.set_viewport_size({'width':width,'height':900});self.assertTrue(p.evaluate('document.documentElement.scrollWidth<=innerWidth'))
        p.locator('.library').click()
        expect(p.get_by_role('heading',name='🎪 EUVDBD Game Library',exact=True)).to_be_visible()

if __name__=='__main__':unittest.main()
