import os
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'number-detective'))
from playwright.sync_api import expect
from browser_support import DetectiveBrowserCase

CASES=[('pinyin','pinyin-detective','mian','main',2,2),('english','word-detective','dinosaur','diansour',5,3)]

class LetterDetectiveTests(DetectiveBrowserCase):
    def test_examples_uppercase_invalid_and_repeated_letters(self):
        p=self.page
        for variant,slug,answer,guess,exact,misplaced in CASES:
            self.start(variant)
            self.guess('a'*(len(answer)-1));self.assertEqual(self.balances(),[5,5])
            self.guess('1'*len(answer));self.assertEqual(self.balances(),[5,5])
            self.guess(guess.upper())
            expect(p.locator('#latestCode')).to_have_text(guess)
            expect(p.locator('#latestRight')).to_have_text(str(exact));expect(p.locator('#latestWrong')).to_have_text(str(misplaced))
            self.guess(guess);self.assertEqual(self.balances(),[4,5])
            self.guess(('a' if variant=='pinyin' else 'd')*len(answer))
            expect(p.locator('#latestRight')).to_have_text('1');expect(p.locator('#latestWrong')).to_have_text('0')

    def test_keypad_solve_points_refill_and_chinese_meaning(self):
        p=self.page
        for variant,slug,answer,guess,*_ in CASES:
            self.start(variant);expect(p.locator('#answerMeaning')).to_be_hidden()
            self.guess(guess)
            p.locator('[data-letter="z"]').click();p.locator('#backspace').click()
            for letter in answer:p.locator(f'[data-letter="{letter}"]').click()
            p.locator('#checkGuess').click();expect(p.locator('#resultTitle')).to_have_text('Bob wins!')
            self.assertEqual(self.balances(),[4,9])
            expect(p.locator('#bestRecordCount')).to_have_text('2 total guesses')
            if variant=='pinyin':expect(p.locator('#answerMeaning')).to_contain_text('面')
            p.locator('#playAgain').click();self.assertEqual(self.balances(),[9,14])

    def test_any_default_length_choices_and_solo(self):
        p=self.page
        for variant,slug,answer,*_ in CASES:
            p.goto(self.url+'play.html?variant='+variant)
            expect(p.locator('#puzzleLength')).to_have_value('0')
            lengths=p.locator('#puzzleLength option').evaluate_all('(options)=>options.map(option=>option.value)')
            for length in lengths:
                p.locator('#playerCount').select_option('1');p.locator('#puzzleLength').select_option(length);p.locator('#startCompetition').click()
                actual=int(p.locator('#guess').get_attribute('maxlength'))
                if length!='0':self.assertEqual(actual,int(length))
                self.assertLessEqual(actual,8)
                expect(p.locator('#pointsBoard')).to_be_hidden()
                p.locator('#backToDetectives').click();expect(p.locator('#puzzleLength')).to_have_value('0')

    def test_all_player_counts_and_no_round_resume_between_variants(self):
        p=self.page
        for variant,slug,answer,*_ in CASES:
            for count in range(1,6):
                self.start(variant,count)
                for letter in 'abcde'[:count]:self.guess(letter*len(answer))
                expect(p.locator('#currentPlayer')).to_have_text('Your turn' if count==1 else 'Alice’s turn')
                self.guess(answer);expect(p.locator('#resultTitle')).to_have_text(('You solved the pinyin!' if variant=='pinyin' else 'You found the word!') if count==1 else 'Alice wins!')
            self.start(variant);self.guess('z'*len(answer))
            self.assertIsNone(p.evaluate('(key)=>localStorage.getItem(key)',slug+'-v1'))
            p.locator('#backToDetectives').click();p.locator('.menu-back').click()
            p.get_by_role('button',name='Chinese pinyin' if variant=='pinyin' else 'English words',exact=True).click()
            expect(p.locator('#setupScreen')).to_be_visible();expect(p.locator('#resumeGame,#savedGamePanel')).to_have_count(0)
            p.locator('#startCompetition').click();self.assertEqual(self.balances(),[5,5])
            expect(p.locator('#history tr')).to_have_count(0)

    def test_best_records_are_retained_and_separate(self):
        p=self.page
        for variant,slug,answer,guess,*_ in CASES:
            self.start(variant);self.guess(guess);self.guess(answer)
            expect(p.locator('#bestRecordCount')).to_have_text('2 total guesses')
            p.reload();expect(p.locator('#setupScreen')).to_be_visible()
            p.locator('#startCompetition').click();expect(p.locator('#bestRecordCount')).to_have_text('2 total guesses')
            self.guess(answer);expect(p.locator('#bestRecordCount')).to_have_text('1 total guess')
        self.assertEqual(p.evaluate("JSON.parse(localStorage.getItem('pinyin-detective-best-v1')).guesses"),1)
        self.assertEqual(p.evaluate("JSON.parse(localStorage.getItem('word-detective-best-v1')).guesses"),1)

    def test_three_screen_navigation_back_is_visible_and_no_resume_controls(self):
        p=self.page;p.goto(self.url)
        expect(p.locator('button')).to_have_count(3)
        expect(p.get_by_role('link',name='← All games',exact=True)).to_be_visible()
        for name,variant in [('Numbers','number'),('Chinese pinyin','pinyin'),('English words','english')]:
            p.get_by_role('button',name=name,exact=True).click()
            expect(p.locator('#setupTitle')).to_have_text('Set up your game');expect(p.locator('#gameScreen')).to_be_hidden()
            expect(p.locator('#resumeGame,#savedGamePanel')).to_have_count(0)
            p.locator('#startCompetition').click();expect(p.locator('#setupScreen')).to_be_hidden()
            p.locator('.page-footer').scroll_into_view_if_needed()
            box=p.locator('#backToDetectives').bounding_box();self.assertGreaterEqual(box['y'],0)
            p.locator('#backToDetectives').click();expect(p.locator('#setupScreen')).to_be_visible()
            expect(p.locator('#history tr')).to_have_count(0)
            p.locator('.menu-back').click()
        p.get_by_role('link',name='← All games',exact=True).click()
        expect(p.get_by_role('heading',name='🎪 EUVDBD Game Library',exact=True)).to_be_visible()

    def test_layout_and_big_feedback(self):
        p=self.page
        for variant,slug,answer,guess,*_ in CASES:
            self.start(variant,count=5)
            for width,height in [(320,740),(390,844),(768,1024),(1280,900)]:
                p.set_viewport_size({'width':width,'height':height});self.assertTrue(p.evaluate('document.documentElement.scrollWidth<=innerWidth'))
            p.set_viewport_size({'width':390,'height':844});self.guess(guess)
            box=p.locator('#latestFeedback').bounding_box();self.assertGreaterEqual(box['y'],0);self.assertLessEqual(box['y']+box['height'],844)
            p.locator('#backToDetectives').click()
            if not os.environ.get('NUMBER_GAME_URL'):p.screenshot(path='/tmp/detective-no-resume-setup.png',full_page=True)

    def test_blocked_storage_still_plays(self):
        self.context.add_init_script("Storage.prototype.getItem=()=>{throw Error('blocked')};Storage.prototype.setItem=()=>{throw Error('blocked')};Storage.prototype.removeItem=()=>{throw Error('blocked')}")
        self.start('english');self.guess('diansour');expect(self.page.locator('#history tr')).to_have_count(1)

    def test_start_waits_for_initialization(self):
        p=self.page;pending=[]
        p.route('**/app.js?*',lambda route:pending.append(route))
        p.goto(self.url+'play.html?variant=number',wait_until='commit')
        expect(p.locator('#startCompetition')).to_be_disabled()
        p.locator('#startCompetition').evaluate('(button)=>button.click()')
        self.assertIn('variant=number',p.url);self.assertTrue(pending)
        pending[0].continue_();expect(p.locator('#startCompetition')).to_be_enabled()
        p.locator('#startCompetition').click();expect(p.locator('#gameScreen')).to_be_visible()

if __name__=='__main__':unittest.main()
