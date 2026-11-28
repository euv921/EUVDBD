import functools
import http.server
import os
from pathlib import Path
import threading
import unittest
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
CASES = [('pinyin', 'pinyin-detective', 'mian', 'main', 2, 2),
         ('english', 'word-detective', 'dinosaur', 'diansour', 5, 3)]

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args): pass

class LetterDetectiveTests(unittest.TestCase):
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
        self.context = self.browser.new_context(viewport={'width': 390, 'height': 844}, has_touch=True)
        self.page = self.context.new_page()
        self.errors = []
        self.page.on('pageerror', lambda error: self.errors.append(str(error)))

    def tearDown(self):
        try: self.assertEqual(self.errors, [])
        finally: self.context.close()

    def open_variant(self, variant, slug, answer, count=2, guesses=None, balances=None, seed=True):
        self.page.goto(self.url + 'play.html?variant=' + variant + '&screen=game')
        if seed:
            state = {'answer':answer,'guesses':guesses or [],'players':['Alice','Bob','Chris','Dana','Eli'][:count],
                     'revealed':False,'pointsVersion':1,'startingPoints':balances or [5]*count,'scoringFrom':0,'selectedLength':len(answer)}
            self.page.evaluate('([key,state]) => localStorage.setItem(key,JSON.stringify(state))', [slug+'-v1',state])
            self.page.reload()
        self.assertIn('play.html?variant=' + variant, self.page.url)
        expect(self.page.locator('.variant-menu')).to_have_count(0)

    def start_from_setup(self):
        self.page.locator('#setupForm button[type=submit]').click()
        if self.page.locator('#confirmDialog').is_visible():
            self.page.locator('#confirmAction').click()

    def guess(self, value):
        self.page.locator('#guess').fill(value); self.page.locator('#checkGuess').click()

    def balances(self): return self.page.locator('#pointsList .points-balance').all_text_contents()

    def test_examples_uppercase_errors_and_repeated_letters(self):
        p = self.page
        for variant, slug, answer, guess, exact, misplaced in CASES:
            with self.subTest(variant=variant):
                self.open_variant(variant,slug,answer)
                expect(p.locator('#wordLength')).to_contain_text(str(len(answer)))
                self.guess('a'*(len(answer)-1))
                self.assertEqual(self.balances(), ['5 pts','5 pts'])
                self.guess('1'*len(answer))
                self.assertEqual(self.balances(), ['5 pts','5 pts'])
                self.guess(guess.upper())
                expect(p.locator('#latestCode')).to_have_text(guess)
                expect(p.locator('#latestRight')).to_have_text(str(exact))
                expect(p.locator('#latestWrong')).to_have_text(str(misplaced))
                self.assertEqual(self.balances(), ['4 pts','5 pts'])
                self.guess(guess)
                expect(p.locator('#message')).to_contain_text('already tried')
                self.assertEqual(self.balances(), ['4 pts','5 pts'])
                self.guess(('a' if variant=='pinyin' else 'd')*len(answer))
                expect(p.locator('#latestRight')).to_have_text('1')
                expect(p.locator('#latestWrong')).to_have_text('0')

    def test_letter_keypad_win_refill_and_chinese_reveal(self):
        p = self.page
        for variant,slug,answer,guess,*_ in CASES:
            self.open_variant(variant,slug,answer)
            expect(p.locator('#answerMeaning')).to_be_hidden()
            p.locator('[data-letter="z"]').click();p.locator('#backspace').click()
            expect(p.locator('#guess')).to_have_value('')
            self.guess(guess)
            for letter in answer:p.locator(f'[data-letter="{letter}"]').click()
            p.locator('#checkGuess').click()
            expect(p.locator('#resultTitle')).to_have_text('Bob wins!')
            self.assertEqual(self.balances(), ['4 pts','9 pts'])
            expect(p.locator('#bestRecordCount')).to_have_text('2 total guesses')
            if variant=='pinyin':
                expect(p.locator('#answerMeaning')).to_contain_text('面')
                expect(p.locator('#answerMeaning')).to_contain_text('face')
            p.reload()
            self.assertEqual(self.balances(), ['4 pts','9 pts'])
            p.locator('#playAgain').click()
            self.assertEqual(self.balances(), ['9 pts','14 pts'])
            state=p.evaluate('(key)=>JSON.parse(localStorage.getItem(key))',slug+'-v1')
            self.assertEqual(len(state['answer']), len(answer))
            self.assertTrue(state['answer'].isalpha())

    def test_length_menu_fresh_setup_and_solo(self):
        p = self.page
        for variant,slug,answer,*_ in CASES:
            self.open_variant(variant,slug,answer,seed=False)
            p.evaluate('(key)=>localStorage.removeItem(key)',slug+'-v1');p.reload()
            expect(p.locator('#setupForm')).to_be_visible()
            p.locator('#playerCount').select_option('1')
            lengths=p.locator('#puzzleLength option').evaluate_all('(options)=>options.map(option=>option.value)')
            self.assertIn(str(len(answer)),lengths)
            for length in lengths:
                p.locator('#puzzleLength').select_option(length)
                self.start_from_setup()
                state=p.evaluate('(key)=>JSON.parse(localStorage.getItem(key))',slug+'-v1')
                if length!='0':self.assertEqual(len(state['answer']), int(length))
                self.assertLessEqual(len(state['answer']),8)
                expect(p.locator('#pointsBoard')).to_be_hidden()
                expect(p.locator('#wordLength')).to_contain_text(str(len(state['answer'])))
                self.guess(state['answer'].upper())
                expect(p.locator('#resultTitle')).to_have_text('You solved the pinyin!' if variant=='pinyin' else 'You found the word!')
                p.locator('#backToDetectives').click()

    def test_menu_switch_preserves_numeric_and_letter_puzzles_separately(self):
        p=self.page
        self.open_variant('number','number-detective','123')
        self.guess('132')
        p.locator('#backToDetectives').click();p.locator('.menu-back').click();p.get_by_role('button',name='Chinese pinyin',exact=True).click();p.wait_for_url('**play.html?variant=pinyin*')
        expect(p.locator('#setupForm')).to_be_visible()
        p.locator('#puzzleLength').select_option('4')
        self.start_from_setup()
        self.guess('zzzz')
        p.locator('#backToDetectives').click();p.locator('.menu-back').click();p.get_by_role('button',name='English words',exact=True).click();p.wait_for_url('**play.html?variant=english*')
        expect(p.locator('#puzzleLength')).to_have_value('0')
        p.locator('#puzzleLength').select_option('8')
        self.start_from_setup()
        self.guess('zzzzzzzz')
        p.locator('#backToDetectives').click();p.locator('.menu-back').click();p.get_by_role('button',name='Numbers',exact=True).click();p.wait_for_url('**play.html?variant=number*')
        p.locator('#resumeGame').click()
        expect(p.locator('#latestCode')).to_have_text('132')
        expect(p.locator('#latestRight')).to_have_text('1')
        expect(p.locator('#latestWrong')).to_have_text('2')
        self.assertEqual(self.balances(),['4 pts','5 pts'])
        p.locator('#backToDetectives').click();p.locator('.menu-back').click();p.get_by_role('button',name='Chinese pinyin',exact=True).click();p.wait_for_url('**play.html?variant=pinyin*')
        p.locator('#resumeGame').click()
        expect(p.locator('#latestCode')).to_have_text('zzzz')
        expect(p.locator('#variantWord')).to_have_text('Pinyin')
        p.locator('#backToDetectives').click();p.locator('.menu-back').click();p.get_by_role('button',name='English words',exact=True).click();p.wait_for_url('**play.html?variant=english*')
        p.locator('#resumeGame').click()
        expect(p.locator('#latestCode')).to_have_text('zzzzzzzz')
        expect(p.locator('#variantWord')).to_have_text('Word')

    def test_all_player_counts_rotation_and_points_exhaustion(self):
        p=self.page
        for variant,slug,answer,*_ in CASES:
            for count in range(1,6):
                self.open_variant(variant,slug,answer,count)
                wrong=['a'*len(answer),'b'*len(answer),'c'*len(answer),'d'*len(answer),'e'*len(answer)]
                for index, code in enumerate(wrong[:count]):
                    self.guess(code)
                    expect(p.locator('#history tr')).to_have_count(index+1)
                expect(p.locator('#currentPlayer')).to_have_text('Your turn' if count==1 else 'Alice’s turn')
            self.open_variant(variant,slug,answer,2,balances=[1,1])
            self.guess('z'*len(answer));self.guess('x'*len(answer))
            expect(p.locator('#resultTitle')).to_have_text('Everyone is out of points.')
            expect(p.locator('#guessForm')).to_be_hidden()
            p.locator('#playAgain').click()
            self.assertEqual(self.balances(),['5 pts','5 pts'])

    def test_layouts_long_words_and_large_feedback(self):
        p=self.page
        for variant,slug,answer,guess,*_ in CASES:
            self.open_variant(variant,slug,answer,count=5)
            for width,height in [(320,740),(390,844),(768,1024),(1280,900)]:
                p.set_viewport_size({'width':width,'height':height})
                self.assertTrue(p.evaluate('document.documentElement.scrollWidth<=innerWidth'))
            p.set_viewport_size({'width':390,'height':844})
            self.guess(guess)
            box=p.locator('#latestFeedback').bounding_box()
            self.assertGreaterEqual(box['y'],0);self.assertLessEqual(box['y']+box['height'],844)
            self.assertTrue(p.evaluate('document.documentElement.scrollWidth<=innerWidth'))
            if not os.environ.get('NUMBER_GAME_URL'):
                p.screenshot(path='/tmp/detective-'+variant+'-phone.png')
            self.guess(answer)
            expect(p.locator('#resultTitle')).to_have_text('Bob wins!')

    def test_saved_wrong_length_is_rejected_and_reveal_is_not_a_record(self):
        p=self.page
        for variant,slug,answer,*_ in CASES:
            self.open_variant(variant,slug,answer)
            p.evaluate('(key)=>{const state=JSON.parse(localStorage.getItem(key));state.guesses=["aa"];localStorage.setItem(key,JSON.stringify(state))}',slug+'-v1')
            p.reload();expect(p.locator('#setupForm')).to_be_visible()
            self.start_from_setup()
            p.locator('#reveal').click();p.locator('#confirmAction').click()
            expect(p.locator('#recordNotice')).to_be_hidden()
            expect(p.locator('#bestRecordCount')).to_have_text('No record yet')
            if variant=='pinyin':expect(p.locator('#answerMeaning')).to_be_visible()

    def test_blocked_storage_still_plays(self):
        p=self.page
        p.add_init_script("Storage.prototype.getItem=()=>{throw Error('blocked')};Storage.prototype.setItem=()=>{throw Error('blocked')};Storage.prototype.removeItem=()=>{throw Error('blocked')}")
        p.goto(self.url+'play.html?variant=english')
        p.locator('#puzzleLength').select_option('8')
        self.start_from_setup()
        expect(p.locator('#guessForm')).to_be_visible()
        self.guess('zzzzzzzz')
        expect(p.locator('#history tr')).to_have_count(1)

    def test_first_screen_title_and_three_buttons_then_separate_game(self):
        p=self.page
        p.goto(self.url)
        p.evaluate("localStorage.setItem('number-detective-variant','english')")
        p.reload()
        expect(p.locator('h1')).to_contain_text('Number & Word')
        expect(p.locator('h1')).to_contain_text('Detective.')
        self.assertEqual(p.locator('form').inner_text().splitlines(), ['Numbers','Chinese pinyin','English words'])
        expect(p.locator('button')).to_have_count(3)
        expect(p.locator('select, input:not([type=hidden]), a')).to_have_count(0)
        for width,height in [(320,740),(390,844),(768,1024),(1280,900)]:
            p.set_viewport_size({'width':width,'height':height})
            for button in p.locator('button').all():
                box=button.bounding_box()
                self.assertGreaterEqual(box['y'],0);self.assertLessEqual(box['y']+box['height'],height)
            self.assertTrue(p.evaluate('document.documentElement.scrollWidth<=innerWidth'))
        if not os.environ.get('NUMBER_GAME_URL'):
            p.set_viewport_size({'width':390,'height':844})
            p.screenshot(path='/tmp/detective-clean-menu.png')
        for name,variant in [('Numbers','number'),('Chinese pinyin','pinyin'),('English words','english')]:
            p.get_by_role('button',name=name,exact=True).click()
            p.wait_for_url('**play.html?variant='+variant+'*')
            expect(p.locator('#setupForm')).to_be_visible()
            expect(p.locator('.variant-menu, .variant-buttons')).to_have_count(0)
            expect(p.locator('#gameScreen')).to_be_hidden()
            if variant != 'number': expect(p.locator('#puzzleLength')).to_have_value('0')
            self.start_from_setup()
            expect(p.locator('#setupScreen')).to_be_hidden()
            expect(p.locator('#gameScreen')).to_be_visible()
            expect(p.locator('#changePlayers')).to_have_count(0)
            p.locator('#backToDetectives').click()
            expect(p.locator('#setupScreen')).to_be_visible()
            expect(p.locator('#gameScreen')).to_be_hidden()
            p.locator('.menu-back').click()
            expect(p.locator('button')).to_have_count(3)

    def test_sticky_back_resume_browser_history_and_any_length_defaults(self):
        p=self.page
        for variant,slug,answer,guess,*_ in CASES:
            self.open_variant(variant,slug,answer)
            self.guess(guess)
            expect(p.locator('#setupScreen')).to_be_hidden()
            p.locator('.page-footer').scroll_into_view_if_needed()
            box=p.locator('#backToDetectives').bounding_box()
            self.assertGreaterEqual(box['y'],0)
            self.assertLessEqual(box['y']+box['height'],p.viewport_size['height'])
            p.locator('#backToDetectives').click()
            expect(p.locator('#setupScreen')).to_be_visible()
            expect(p.locator('#gameScreen')).to_be_hidden()
            expect(p.locator('#puzzleLength')).to_have_value('0')
            expect(p.locator('#resumeGame')).to_be_visible()
            p.locator('#resumeGame').click()
            self.assertEqual(self.balances(),['4 pts','5 pts'])
            expect(p.locator('#latestCode')).to_have_text(guess)
            p.go_back()
            expect(p.locator('#setupScreen')).to_be_visible()
            p.go_forward()
            expect(p.locator('#gameScreen')).to_be_visible()
            self.assertEqual(self.balances(),['4 pts','5 pts'])
            self.guess(answer)
            p.locator('#backToDetectives').click()
            expect(p.locator('#puzzleLength')).to_have_value('0')
            p.locator('#resumeGame').click()
            p.locator('#playAgain').click()
            state=p.evaluate('(key)=>JSON.parse(localStorage.getItem(key))',slug+'-v1')
            self.assertEqual(len(state['answer']),len(answer))
            self.assertEqual(state['selectedLength'],len(answer))
            self.assertEqual(self.balances(),['9 pts','14 pts'])
            p.locator('#backToDetectives').click()
            self.start_from_setup()
            state=p.evaluate('(key)=>JSON.parse(localStorage.getItem(key))',slug+'-v1')
            self.assertEqual(state['selectedLength'],0)
            self.assertEqual(self.balances(),['5 pts','5 pts'])

if __name__=='__main__':unittest.main()
