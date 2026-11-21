"""Browser regressions for Mafia audio and game transitions.

Install: pip install -r tests/mafia/requirements.txt
         python -m playwright install --with-deps chromium webkit
Run:     python -m unittest discover -s tests/mafia -v
Optional: MAFIA_BROWSER=webkit, MAFIA_URL=https://.../games/mafia/
"""
import functools
import http.server
import os
from pathlib import Path
import threading
import unittest

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = Path(__file__).with_name('audio-browser.js')


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


class MafiaAudioTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=ROOT))
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = os.environ.get('MAFIA_URL', f'http://127.0.0.1:{cls.server.server_port}/games/mafia/')
        cls.pw = sync_playwright().start()
        engine = os.environ.get('MAFIA_BROWSER', 'chromium')
        options = {'headless': True}
        if engine == 'chromium' and os.environ.get('CHROMIUM_EXECUTABLE'):
            options['executable_path'] = os.environ['CHROMIUM_EXECUTABLE']
            options['args'] = ['--no-sandbox']
        if engine == 'webkit' and os.environ.get('WEBKIT_EXECUTABLE'):
            options['executable_path'] = os.environ['WEBKIT_EXECUTABLE']
        if os.environ.get('MAFIA_URL') and os.environ.get('HTTPS_PROXY'):
            options['proxy'] = {'server': os.environ['HTTPS_PROXY']}
        cls.browser = getattr(cls.pw, engine).launch(**options)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()
        cls.server.shutdown()
        cls.server.server_close()

    def setUp(self):
        self.page = self.browser.new_page(viewport={'width': 390, 'height': 844}, has_touch=True)
        self.errors = []
        self.page.on('pageerror', lambda error: self.errors.append(str(error)))
        self.page.add_init_script(path=FIXTURE)
        self.page.goto(self.url)
        self.page.clock.install()

    def tearDown(self):
        try:
            self.assertEqual(self.errors, [])
        finally:
            self.page.close()

    def advance(self, ms):
        self.page.clock.run_for(ms)
        # Flush Web Audio resume promises and real rendering threads as well.
        self.page.evaluate('() => new Promise(resolve => queueMicrotask(resolve))')

    def deal(self, count=3, language='en', simple=True):
        p = self.page
        p.locator('#playerCount').select_option(str(count))
        p.locator('#simpleMode').set_checked(simple)
        p.locator('#gameLanguage').select_option(language)
        p.locator('#setupForm button[type=submit]').click()
        return self.reveal(count)

    def reveal(self, count):
        p = self.page
        roles = {}
        for i in range(count):
            p.get_by_role('button', name='Reveal my role', exact=True).click()
            card = p.locator('.private-role').inner_text()
            role = next(role for role, zh in [('Mafia', '杀手'), ('Doctor', '医生'), ('Villager', '平民')] if role in card or zh in card)
            roles.setdefault(role, []).append(i)
            p.get_by_role('button', name='Hide & continue', exact=True).click()
        return roles

    def begin(self):
        self.page.get_by_role('button', name='Begin the first night', exact=True).click()

    def audio_running(self):
        self.page.wait_for_function("__audioTest.contexts.length && __audioTest.contexts[0].state === 'running'", timeout=5000)

    def signal(self):
        self.page.evaluate('''() => {
          const context = __audioTest.contexts[0];
          if (!window.__analyser) { window.__analyser = context.createAnalyser(); context.gains[0].connect(__analyser); }
        }''')
        # This checks actual generated audio samples, not just button state.
        self.page.wait_for_function('''() => {
          const data = new Float32Array(__analyser.fftSize);
          __analyser.getFloatTimeDomainData(data);
          return Math.max(...data.map(Math.abs)) > 0.0005;
        }''')

    def test_music_and_immediate_bilingual_host_without_previews(self):
        self.deal(language='bilingual')
        self.begin()
        self.advance(2700)
        self.audio_running()
        self.signal()
        self.assertEqual(self.page.evaluate('__audioTest.spoken.filter(u => u.volume !== 0).map(u => u.text)'),
                         ['It is night. Everyone, close your eyes.', '天黑请闭眼。'])
        self.assertEqual(self.page.locator('#testVoice').get_attribute('aria-pressed'), 'false')
        self.assertEqual(self.page.evaluate('__audioTest.session'), 'playback')

    def test_fresh_start_matrix(self):
        for language in ['en', 'zh-CN', 'bilingual']:
            for track in ['ghost', 'witch', 'forest']:
                for voice, music in [(True, True), (True, False), (False, True), (False, False)]:
                    with self.subTest(language=language, track=track, voice=voice, music=music):
                        self.page.reload()
                        self.page.locator('#voice').set_checked(voice)
                        self.page.locator('#sound').set_checked(music)
                        self.page.locator('#musicTrack').select_option(track)
                        self.deal(language=language)
                        self.begin()
                        # Narration begins directly from Begin Night, with no lead-in.
                        self.assertEqual(self.page.evaluate('__audioTest.spoken.length'), (2 if language == 'bilingual' else 1) if voice else 0)
                        self.advance(900)
                        spoken = self.page.evaluate('__audioTest.spoken')
                        self.assertEqual([u['lang'] for u in spoken], (['en-US', 'zh-CN'] if language == 'bilingual' else [language if language == 'zh-CN' else 'en-US']) if voice else [])
                        if music:
                            self.audio_running()
                            self.signal()
                            self.assertEqual(self.page.evaluate('__audioTest.contexts[0].sources.at(-1).loopStart'), 2 if track == 'witch' else 0)
                        else:
                            self.assertEqual(self.page.evaluate('__audioTest.contexts.length'), 0)
                        self.advance(5100)
                        expect(self.page.locator('#host h2')).to_contain_text('杀手请睁眼。' if language == 'zh-CN' else 'Mafia, open your eyes.')

    def test_pause_resume_and_reset_cancel_speech_and_timers(self):
        self.deal(language='bilingual')
        self.begin()
        self.advance(800)
        spoken = self.page.evaluate('__audioTest.spoken.length')
        self.page.locator('#pause').click()
        self.advance(10000)
        self.assertEqual(self.page.evaluate('__audioTest.spoken.length'), spoken)
        self.page.locator('#resume').click()
        self.assertEqual(self.page.evaluate('__audioTest.spoken.length'), spoken + 2)
        self.advance(900)
        self.audio_running()
        self.signal()
        self.page.locator('#newGame').click()
        self.page.locator('#acceptConfirm').click()
        spoken = self.page.evaluate('__audioTest.spoken.length')
        self.advance(15000)
        self.assertEqual(self.page.evaluate('__audioTest.spoken.length'), spoken)
        expect(self.page.locator('#setup')).to_be_visible()
        self.page.wait_for_function('__audioTest.contexts[0].gains[0].gain.value < .001', timeout=5000)

    def test_previews_remain_independent_during_speech(self):
        p = self.page
        p.locator('#gameLanguage').select_option('bilingual')
        p.locator('#testSound').click()
        self.audio_running()
        self.signal()
        p.locator('#testVoice').click()
        self.advance(600)
        self.audio_running()
        self.signal()
        expect(p.locator('#testVoice')).to_have_attribute('aria-pressed', 'false')
        expect(p.locator('#testSound')).to_have_attribute('aria-pressed', 'true')
        p.evaluate('__audioTest.holdSpeech = true')
        p.locator('#testVoice').click()
        expect(p.locator('#testVoice')).to_have_attribute('aria-pressed', 'true')
        p.locator('#testVoice').click()
        self.advance(600)
        self.audio_running()
        self.signal()
        expect(p.locator('#testVoice')).to_have_attribute('aria-pressed', 'false')
        p.locator('#testSound').click()
        self.advance(2000)
        p.wait_for_function('__audioTest.contexts[0].gains[0].gain.value < .001', timeout=5000)

    def test_delayed_unlock_cannot_restart_music_after_stop_or_reset(self):
        p = self.page
        p.evaluate('__audioTest.holdResume = true')
        p.locator('#testSound').click()
        p.wait_for_function('__audioTest.heldResumes.length > 0')
        p.locator('#testSound').click()
        p.evaluate('__audioTest.holdResume = false; __audioTest.heldResumes.splice(0).forEach(release => release())')
        self.advance(1000)
        self.assertEqual(p.evaluate('__audioTest.contexts[0].sources.length'), 0)
        expect(p.locator('#testSound')).to_have_attribute('aria-pressed', 'false')

    def test_volume_levels_and_audio_session_fallback(self):
        p = self.page
        for mode in ['absent', 'throws']:
            with self.subTest(audio_session=mode):
                p.reload()
                if mode == 'absent':
                    p.evaluate("Object.defineProperty(navigator, 'audioSession', {value: undefined})")
                else:
                    p.evaluate("Object.defineProperty(navigator, 'audioSession', {get() { throw new Error('Unsupported'); }})")
                p.locator('#testSound').click()
                self.audio_running()
                self.signal()
                for level, ratio in [('1', .1), ('2', .2), ('3', .3), ('4', .5), ('5', 1)]:
                    p.locator('#nightVolume').select_option(level)
                    p.wait_for_function('(target) => Math.abs(__audioTest.contexts[0].gains[0].gain.value - target) < .003', arg=.4 * ratio, timeout=5000)
                p.locator('#testSound').click()
                p.wait_for_function('__audioTest.contexts[0].gains[0].gain.value < .001', timeout=5000)

    def test_bilingual_opening_waits_for_both_languages_then_five_seconds(self):
        self.deal(language='bilingual')
        self.page.evaluate('__audioTest.holdSpeech = true')
        self.begin()
        self.advance(2100)
        self.page.evaluate('__audioTest.finish()')
        self.advance(1000)
        expect(self.page.locator('#host h2')).to_contain_text('Everyone, close your eyes.')
        self.page.evaluate('__audioTest.holdSpeech = false; __audioTest.finish()')
        self.advance(4900)
        expect(self.page.locator('#host h2')).to_contain_text('Everyone, close your eyes.')
        self.advance(300)
        expect(self.page.locator('#host h2')).to_contain_text('Mafia, open your eyes.')

    def test_simple_and_classic_results_and_replay_keep_audio_settings(self):
        p = self.page
        for simple, saved in [(True, True), (True, False), (False, False)]:
            with self.subTest(simple=simple, saved=saved):
                p.reload()
                p.locator('#musicTrack').select_option('witch')
                p.locator('#nightVolume').select_option('3')
                roles = self.deal(simple=simple, language='bilingual')
                self.begin()
                self.advance(8500)
                target = roles['Villager'][0]
                p.locator(f'.seat[data-player="{target}"]').click()
                self.advance(10500)
                save = target if saved else roles['Doctor'][0]
                p.locator(f'.seat[data-player="{save}"]').click()
                self.advance(13000)
                if simple:
                    expect(p.locator('.winner-title')).to_contain_text('Villager' if saved else 'Mafia')
                    expect(p.get_by_role('button', name='Discuss & vote', exact=True)).to_have_count(0)
                    p.get_by_role('button', name='Play again · same settings', exact=True).click()
                    self.reveal(3)
                    self.begin()
                    self.advance(2800)
                    self.audio_running()
                    self.signal()
                    expect(p.locator('#musicTrack')).to_have_value('witch')
                    expect(p.locator('#nightVolume')).to_have_value('3')
                    expect(p.locator('#gameLanguage')).to_have_value('bilingual')
                else:
                    p.get_by_role('button', name='Discuss & vote', exact=True).click()
                    p.locator(f'.seat[data-player="{roles["Mafia"][0]}"]').click()
                    p.locator('#acceptConfirm').click()
                    expect(p.locator('.winner-title')).to_contain_text('town wins')

    def test_language_names_defaults_and_guide(self):
        p = self.page
        expect(p.locator('#gameLanguage')).to_have_value('en')
        expect(p.locator('#nightVolume')).to_have_value('4')
        for i, name in enumerate(['Alice', '小明', 'Chris']):
            p.locator('#names input').nth(i).fill(name)
        p.locator('#playerCount').select_option('3')
        p.locator('#playerCount').select_option('4')
        self.assertEqual(p.locator('#names input').evaluate_all('(inputs) => inputs.slice(0,3).map(input => input.value)'), ['Alice', '小明', 'Chris'])
        p.locator('#gameLanguage').select_option('bilingual')
        p.reload()
        expect(p.locator('#gameLanguage')).to_have_value('bilingual')
        self.assertEqual(p.locator('#names input').nth(1).input_value(), '小明')
        for language in ['en', 'zh-CN', 'bilingual']:
            p.locator('#gameLanguage').select_option(language)
            self.assertNotIn('If a night choice times out', p.locator('.howto').inner_text())
            self.assertNotIn('In three-player games with Simple mode off', p.locator('.howto').inner_text())
            expect(p.locator('.howto li')).to_have_count(5)

    def test_removed_tracks_fall_back_to_attic(self):
        self.assertEqual(self.page.locator('#musicTrack option').all_text_contents(),
                         ['Ghosts in the Attic', 'Witch’s Cackle', 'Witch’s Forest'])
        for removed in ['cauldron', 'coven']:
            self.page.evaluate('(id) => localStorage.setItem("mafia-music-track", id)', removed)
            self.page.reload()
            expect(self.page.locator('#musicTrack')).to_have_value('ghost')


if __name__ == '__main__':
    unittest.main()
