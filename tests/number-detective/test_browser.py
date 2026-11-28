import functools
import http.server
import os
from pathlib import Path
import threading
import unittest
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args): pass

class NumberDetectiveTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=ROOT))
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.url = os.environ.get('NUMBER_GAME_URL', f'http://127.0.0.1:{cls.server.server_port}/games/number-detective/')
        cls.pw = sync_playwright().start()
        engine = os.environ.get('GAME_BROWSER', 'chromium')
        options = {'headless': True}
        executable = os.environ.get('CHROMIUM_EXECUTABLE' if engine == 'chromium' else 'WEBKIT_EXECUTABLE')
        if executable: options['executable_path'] = executable
        if engine == 'chromium': options['args'] = ['--no-sandbox']
        if os.environ.get('NUMBER_GAME_URL') and os.environ.get('HTTPS_PROXY'):
            options['proxy'] = {'server': os.environ['HTTPS_PROXY']}
        cls.browser = getattr(cls.pw, engine).launch(**options)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close(); cls.pw.stop(); cls.server.shutdown(); cls.server.server_close()

    def setUp(self):
        self.page = self.browser.new_page(viewport={'width': 390, 'height': 844}, has_touch=True)
        self.errors = []
        self.page.on('pageerror', lambda error: self.errors.append(str(error)))
        self.page.add_init_script("if (!localStorage.getItem('number-detective-no-seed') && !localStorage.getItem('number-detective-v1')) localStorage.setItem('number-detective-v1', JSON.stringify({answer:'123', guesses:[], revealed:false}))")
        self.page.goto(self.url + "play.html?variant=number")

    def tearDown(self):
        try: self.assertEqual(self.errors, [])
        finally: self.page.close()

    def guess(self, value):
        self.page.locator('#guess').fill(value)
        self.page.locator('#checkGuess').click()

    def test_feedback_validation_and_duplicate_guesses(self):
        for invalid in ['12', '112', 'abc']:
            self.guess(invalid)
            expect(self.page.locator('#history tr')).to_have_count(0)
            expect(self.page.locator('#guess')).to_have_attribute('aria-invalid', 'true')
        self.guess('132')
        expect(self.page.locator('#history tr').first.locator('.right')).to_have_text('1')
        expect(self.page.locator('#history tr').first.locator('.wrong')).to_have_text('2')
        self.guess('132')
        expect(self.page.locator('#history tr')).to_have_count(1)
        expect(self.page.locator('#message')).to_contain_text('already tried')
        self.guess('456')
        expect(self.page.locator('#history tr').first.locator('.right')).to_have_text('0')
        expect(self.page.locator('#history tr').first.locator('.wrong')).to_have_text('0')

    def test_touch_keypad_win_refresh_and_replay(self):
        p = self.page
        p.locator('[data-digit="4"]').click(); p.locator('#backspace').click()
        expect(p.locator('#guess')).to_have_value('')
        for digit in '123': p.locator(f'[data-digit="{digit}"]').click()
        p.locator('#checkGuess').click()
        expect(p.locator('#resultTitle')).to_have_text('You cracked the code!')
        expect(p.locator('#resultDetail')).to_contain_text('1 guess')
        expect(p.locator('#guessForm')).to_be_hidden()
        p.reload()
        expect(p.locator('#resultTitle')).to_have_text('You cracked the code!')
        p.locator('#playAgain').click()
        expect(p.locator('#guessForm')).to_be_visible()
        expect(p.locator('#history tr')).to_have_count(0)
        self.assertTrue(p.evaluate("NumberDetective.isValidCode(JSON.parse(localStorage.getItem('number-detective-v1')).answer)"))

    def test_leading_zero_keyboard_and_saved_history(self):
        p = self.page
        p.evaluate("localStorage.setItem('number-detective-v1', JSON.stringify({answer:'012', guesses:['210'], revealed:false}))")
        p.reload()
        expect(p.locator('#history tr').first.locator('.right')).to_have_text('1')
        expect(p.locator('#history tr').first.locator('.wrong')).to_have_text('2')
        p.locator('#guess').fill('012'); p.locator('#guess').press('Enter')
        expect(p.locator('#resultDetail')).to_contain_text('012')
        expect(p.locator('#resultDetail')).to_contain_text('2 guesses')

    def test_confirm_cancel_new_game_and_reveal(self):
        p = self.page
        self.guess('456')
        p.locator('#newGame').click(); p.locator('#cancelAction').click()
        expect(p.locator('#history tr')).to_have_count(1)
        p.locator('#reveal').click(); p.locator('#confirmDialog').press('Escape')
        expect(p.locator('#result')).to_be_hidden()
        p.locator('#reveal').click(); p.locator('#confirmAction').click()
        expect(p.locator('#resultTitle')).to_have_text('The code was 123.')
        expect(p.locator('#guessForm')).to_be_hidden()
        p.locator('#newGame').click()
        expect(p.locator('#history tr')).to_have_count(0)

    def test_invalid_storage_and_blocked_storage_are_playable(self):
        p = self.page
        for state in ['bad json', '{"answer":"111","guesses":[],"revealed":false}', '{"answer":"123","guesses":["123","456"],"revealed":false}']:
            p.evaluate('(value) => localStorage.setItem("number-detective-v1", value)', state)
            p.reload()
            expect(p.locator('#setupForm')).to_be_visible()
            p.locator('#setupForm button[type=submit]').click()
            expect(p.locator('#guessForm')).to_be_visible()
            expect(p.locator('#history tr')).to_have_count(0)
        p.add_init_script("Storage.prototype.getItem=()=>{throw Error('blocked')};Storage.prototype.setItem=()=>{throw Error('blocked')}")
        p.reload(); p.locator('#setupForm button[type=submit]').click(); self.guess('123')
        expect(p.locator('#history tr')).to_have_count(1)

    def test_layout_and_library_link(self):
        p = self.page
        for width, height in [(320, 740), (390, 844), (768, 1024), (1280, 900)]:
            p.set_viewport_size({'width': width, 'height': height})
            self.assertTrue(p.evaluate('document.documentElement.scrollWidth <= innerWidth'))
        p.set_viewport_size({'width': 1280, 'height': 900})
        if not os.environ.get('NUMBER_GAME_URL'):
            p.screenshot(path='/tmp/number-detective-desktop.png', full_page=True)
            p.set_viewport_size({'width': 390, 'height': 844})
            p.screenshot(path='/tmp/number-detective-phone.png', full_page=True)
        p.locator('.library').click()
        p.wait_for_url('**/EUVDBD/' if os.environ.get('NUMBER_GAME_URL') else f'http://127.0.0.1:{self.server.server_port}/')
        expect(p.locator('a[href$="games/number-detective/"]')).to_be_visible()

    def seed_players(self, count, guesses=None):
        players = ['Alice', 'Bob', 'Chris', 'Dana', 'Eli'][:count]
        self.page.evaluate('(state) => localStorage.setItem("number-detective-v1", JSON.stringify(state))',
                           {'answer': '123', 'guesses': guesses or [], 'players': players, 'revealed': False})
        self.page.reload()
        return players

    def test_two_to_five_players_turns_winner_and_replay(self):
        p = self.page
        for count in range(2, 6):
            with self.subTest(players=count):
                players = self.seed_players(count)
                expect(p.locator('#currentPlayer')).to_have_text('Alice’s turn')
                self.guess('112')
                expect(p.locator('#currentPlayer')).to_have_text('Alice’s turn')
                self.guess('456')
                expect(p.locator('#currentPlayer')).to_have_text('Bob’s turn')
                expect(p.locator('#history tr').first.locator('.history-player')).to_have_text('Alice')
                self.guess('456')
                expect(p.locator('#currentPlayer')).to_have_text('Bob’s turn')
                p.reload()
                expect(p.locator('#currentPlayer')).to_have_text('Bob’s turn')
                self.guess('123')
                expect(p.locator('#resultTitle')).to_have_text('Bob wins!')
                expect(p.locator('#history tr').first.locator('.history-player')).to_have_text('Bob')
                expect(p.locator('#guessForm')).to_be_hidden()
                p.reload()
                expect(p.locator('#resultTitle')).to_have_text('Bob wins!')
                p.locator('#playAgain').click()
                expect(p.locator('#currentPlayer')).to_have_text('Alice’s turn')
                expect(p.locator('#history tr')).to_have_count(0)
                self.assertEqual(p.evaluate("JSON.parse(localStorage.getItem('number-detective-v1')).players"), players)

    def test_full_round_rotation_and_shared_clues(self):
        p = self.page
        for count in range(1, 6):
            with self.subTest(players=count):
                players = self.seed_players(count)
                for index, code in enumerate(['456', '789', '045', '678', '890'][:count]):
                    self.guess(code)
                    expected = 'Your turn' if count == 1 else f'{players[(index + 1) % count]}’s turn'
                    expect(p.locator('#currentPlayer')).to_have_text(expected)
                    expect(p.locator('#history tr')).to_have_count(index + 1)
                if count > 1: expect(p.locator('#roundLabel')).to_have_text('4 PTS')
                self.guess('123')
                expect(p.locator('#resultTitle')).to_have_text('You cracked the code!' if count == 1 else 'Alice wins!')

    def test_player_setup_names_and_solo_option(self):
        p = self.page
        p.evaluate("localStorage.setItem('number-detective-no-seed','1'); localStorage.removeItem('number-detective-v1')")
        p.reload()
        expect(p.locator('#setupForm')).to_be_visible()
        self.assertEqual(p.locator('#playerCount option').evaluate_all('(options) => options.map(option => option.value)'), ['1','2','3','4','5'])
        p.locator('#playerCount').select_option('5')
        for i, name in enumerate(['Alice', 'Bob', 'Chris', 'Dana', 'Eli']):
            p.locator('#playerNames input').nth(i).fill(name)
        p.locator('#playerCount').select_option('2')
        p.locator('#playerCount').select_option('5')
        self.assertEqual(p.locator('#playerNames input').evaluate_all('(inputs) => inputs.map(input => input.value)'), ['Alice','Bob','Chris','Dana','Eli'])
        p.reload()
        expect(p.locator('#playerCount')).to_have_value('5')
        expect(p.locator('#playerNames input').nth(4)).to_have_value('Eli')
        p.locator('#setupForm button[type=submit]').click()
        expect(p.locator('#currentPlayer')).to_have_text('Alice’s turn')
        p.locator('#changePlayers').click()
        p.locator('#playerCount').select_option('1')
        p.locator('#setupForm button[type=submit]').click()
        expect(p.locator('#currentPlayer')).to_have_text('Your turn')
        expect(p.locator('#roundLabel')).to_have_text('SOLO')

    def test_duplicate_names_and_multiplayer_reveal(self):
        p = self.page
        p.locator('#changePlayers').click()
        p.locator('#playerCount').select_option('2')
        for input in p.locator('#playerNames input').all(): input.fill('Sam')
        p.locator('#setupForm button[type=submit]').click()
        expect(p.locator('#currentPlayer')).to_have_text('Sam (1)’s turn')
        self.assertEqual(p.evaluate("JSON.parse(localStorage.getItem('number-detective-v1')).players"), ['Sam (1)', 'Sam (2)'])
        p.locator('#reveal').click(); p.locator('#confirmAction').click()
        expect(p.locator('#resultDetail')).to_contain_text('No winner')
        expect(p.locator('#guessForm')).to_be_hidden()

    def test_change_players_confirmation_and_long_name_layout(self):
        p = self.page
        self.seed_players(5)
        self.guess('456')
        p.locator('#changePlayers').click(); p.locator('#cancelAction').click()
        expect(p.locator('#currentPlayer')).to_have_text('Bob’s turn')
        p.locator('#changePlayers').click(); p.locator('#confirmAction').click()
        expect(p.locator('#setupForm')).to_be_visible()
        p.locator('#playerNames input').nth(0).fill('<b>Alice</b>')
        p.locator('#playerNames input').nth(1).fill('VeryLongPlayerNameXX')
        p.locator('#setupForm button[type=submit]').click()
        expect(p.locator('#currentPlayer')).to_have_text('<b>Alice</b>’s turn')
        expect(p.locator('#currentPlayer b')).to_have_count(0)
        self.guess('456')
        self.guess('789')
        for width in [320, 390, 768, 1280]:
            p.set_viewport_size({'width': width, 'height': 900})
            self.assertTrue(p.evaluate('document.documentElement.scrollWidth <= innerWidth'))

    def seed_points(self, count=2, guesses=None, balances=None):
        players = ['Alice', 'Bob', 'Chris', 'Dana', 'Eli'][:count]
        self.page.evaluate('(state) => localStorage.setItem("number-detective-v1", JSON.stringify(state))',
                           {'answer': '123', 'guesses': guesses or [], 'players': players, 'revealed': False,
                            'pointsVersion': 1, 'startingPoints': balances or [5] * count, 'scoringFrom': 0})
        self.page.reload()

    def balances(self):
        return self.page.locator('#pointsList .points-balance').all_text_contents()

    def wrong_codes(self, count):
        return [str(n).zfill(3) for n in range(1000) if len(set(str(n).zfill(3))) == 3 and str(n).zfill(3) != '123'][:count]

    def test_points_accumulate_across_wins_next_rounds_and_reload(self):
        p = self.page
        self.seed_points()
        self.assertEqual(self.balances(), ['5 pts', '5 pts'])
        self.guess('112')
        self.assertEqual(self.balances(), ['5 pts', '5 pts'])
        self.guess('456')
        self.assertEqual(self.balances(), ['4 pts', '5 pts'])
        self.guess('456')
        self.assertEqual(self.balances(), ['4 pts', '5 pts'])
        self.guess('123')
        expect(p.locator('#resultTitle')).to_have_text('Bob wins!')
        self.assertEqual(self.balances(), ['4 pts', '9 pts'])
        p.reload()
        self.assertEqual(self.balances(), ['4 pts', '9 pts'])
        p.locator('#playAgain').click()
        self.assertEqual(self.balances(), ['9 pts', '14 pts'])
        p.reload()
        self.assertEqual(self.balances(), ['9 pts', '14 pts'])
        answer = p.evaluate("JSON.parse(localStorage.getItem('number-detective-v1')).answer")
        self.guess(answer)
        self.assertEqual(self.balances(), ['13 pts', '14 pts'])
        p.locator('#playAgain').click()
        self.assertEqual(self.balances(), ['18 pts', '19 pts'])

    def test_zero_points_skip_and_actual_player_history(self):
        p = self.page
        self.seed_points(count=5, balances=[0, 2, 0, 1, 0])
        expect(p.locator('#currentPlayer')).to_have_text('Bob’s turn')
        expect(p.locator('#pointsList li[data-player="0"]')).to_contain_text('Out this round')
        self.guess('456')
        expect(p.locator('#currentPlayer')).to_have_text('Dana’s turn')
        self.guess('789')
        expect(p.locator('#currentPlayer')).to_have_text('Bob’s turn')
        expect(p.locator('#history .history-player')).to_have_text(['Dana', 'Bob'])
        p.reload()
        expect(p.locator('#currentPlayer')).to_have_text('Bob’s turn')
        self.guess('045')
        expect(p.locator('#resultTitle')).to_have_text('Everyone is out of points.')
        expect(p.locator('#guessForm')).to_be_hidden()
        self.assertEqual(self.balances(), ['0 pts'] * 5)
        p.locator('#playAgain').click()
        self.assertEqual(self.balances(), ['5 pts'] * 5)

    def test_last_point_win_and_all_players_exhausted(self):
        p = self.page
        self.seed_points(guesses=self.wrong_codes(9))
        self.assertEqual(self.balances(), ['0 pts', '1 pts'])
        self.guess('123')
        expect(p.locator('#resultTitle')).to_have_text('Bob wins!')
        self.assertEqual(self.balances(), ['0 pts', '5 pts'])
        p.locator('#playAgain').click()
        self.assertEqual(self.balances(), ['5 pts', '10 pts'])
        for count in [2, 5]:
            self.seed_points(count, self.wrong_codes(count * 5 - 1))
            self.guess(self.wrong_codes(count * 5)[-1])
            expect(p.locator('#resultTitle')).to_have_text('Everyone is out of points.')
            expect(p.locator('#recordNotice')).to_be_hidden()
            p.reload()
            expect(p.locator('#resultTitle')).to_have_text('Everyone is out of points.')
            p.locator('#playAgain').click()
            self.assertEqual(self.balances(), ['5 pts'] * count)

    def test_reveal_keeps_remaining_points_and_solo_has_no_costs(self):
        p = self.page
        self.seed_points(balances=[8, 13])
        self.guess('456')
        p.locator('#reveal').click(); p.locator('#confirmAction').click()
        self.assertEqual(self.balances(), ['7 pts', '13 pts'])
        p.locator('#playAgain').click()
        self.assertEqual(self.balances(), ['12 pts', '18 pts'])
        self.seed_points(1, self.wrong_codes(12))
        expect(p.locator('#pointsBoard')).to_be_hidden()
        expect(p.locator('#guessForm')).to_be_visible()
        self.guess('123')
        expect(p.locator('#resultTitle')).to_have_text('You cracked the code!')

    def test_best_record_counts_everyones_guesses_and_only_improves(self):
        p = self.page
        self.seed_points(3, self.wrong_codes(4))
        self.guess('123')
        expect(p.locator('#bestRecordCount')).to_have_text('5 total guesses')
        expect(p.locator('#bestRecordOwner')).to_have_text('Bob · 3 players')
        expect(p.locator('#recordNotice')).to_contain_text('New best')
        p.reload()
        expect(p.locator('#bestRecordCount')).to_have_text('5 total guesses')
        self.seed_points(1, self.wrong_codes(5))
        self.guess('123')
        expect(p.locator('#bestRecordCount')).to_have_text('5 total guesses')
        self.seed_points(2, self.wrong_codes(4))
        self.guess('123')
        expect(p.locator('#recordNotice')).to_be_hidden()
        expect(p.locator('#bestRecordOwner')).to_have_text('Bob · 3 players')
        self.seed_points(1, self.wrong_codes(2))
        self.guess('123')
        expect(p.locator('#bestRecordCount')).to_have_text('3 total guesses')
        expect(p.locator('#recordNotice')).to_be_visible()
        self.seed_points(5, self.wrong_codes(1))
        self.guess('123')
        expect(p.locator('#bestRecordCount')).to_have_text('2 total guesses')
        expect(p.locator('#bestRecordOwner')).to_have_text('Bob · 5 players')
        p.reload()
        expect(p.locator('#bestRecordCount')).to_have_text('2 total guesses')

    def test_point_save_validation_and_legacy_clue_migration(self):
        p = self.page
        self.seed_points(2, self.wrong_codes(12))
        # The invalid overdrawn log is rejected instead of producing negatives.
        expect(p.locator('#setupForm')).to_be_visible()
        self.seed_players(2, self.wrong_codes(12))
        self.assertEqual(self.balances(), ['5 pts', '5 pts'])
        expect(p.locator('#history tr')).to_have_count(12)
        self.guess('123')
        self.assertEqual(self.balances(), ['9 pts', '5 pts'])
        p.locator('#changePlayers').click()
        p.locator('#setupForm button[type=submit]').click()
        self.assertEqual(self.balances(), ['5 pts', '5 pts'])

if __name__ == '__main__': unittest.main()
