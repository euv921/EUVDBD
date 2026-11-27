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
        self.page.add_init_script("if (!localStorage.getItem('number-detective-v1')) localStorage.setItem('number-detective-v1', JSON.stringify({answer:'123', guesses:[], revealed:false}))")
        self.page.goto(self.url)

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
            expect(p.locator('#guessForm')).to_be_visible()
            expect(p.locator('#history tr')).to_have_count(0)
        p.add_init_script("Storage.prototype.getItem=()=>{throw Error('blocked')};Storage.prototype.setItem=()=>{throw Error('blocked')}")
        p.reload(); self.guess('123')
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

if __name__ == '__main__': unittest.main()
