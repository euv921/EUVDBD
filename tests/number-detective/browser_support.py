import functools
import http.server
import os
from pathlib import Path
import threading
import unittest
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[2]
# Control only answer generation in test browser contexts; no production hooks.
ANSWER_FIXTURE='''
window.__testAnswer = new URL(location.href).searchParams.get('variant') === 'pinyin' ? 'mian' : new URL(location.href).searchParams.get('variant') === 'english' ? 'dinosaur' : '123';
let numericAPI, letterAPI;
Object.defineProperty(window,'NumberDetective',{configurable:true,get:()=>numericAPI,set:api=>{
  numericAPI={...api,createCode:()=>window.__testAnswer};
}});
Object.defineProperty(window,'LetterPuzzle',{configurable:true,get:()=>letterAPI,set:api=>{
  letterAPI={...api,createEngine:entries=>{
    const engine=api.createEngine(entries);
    return {...engine,createCode:(length=0)=>engine.isAnswer(window.__testAnswer)&&(!length||window.__testAnswer.length===length)?window.__testAnswer:engine.createCode(length)};
  }};
}});
'''

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*_args):pass

class DetectiveBrowserCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(QuietHandler,directory=ROOT))
        threading.Thread(target=cls.server.serve_forever,daemon=True).start()
        cls.url=os.environ.get('NUMBER_GAME_URL',f'http://127.0.0.1:{cls.server.server_port}/games/number-detective/')
        cls.pw=sync_playwright().start()
        engine=os.environ.get('GAME_BROWSER','chromium')
        options={'headless':True}
        executable=os.environ.get('CHROMIUM_EXECUTABLE' if engine=='chromium' else 'WEBKIT_EXECUTABLE')
        if executable:options['executable_path']=executable
        if engine=='chromium':options['args']=['--no-sandbox']
        if os.environ.get('NUMBER_GAME_URL') and os.environ.get('HTTPS_PROXY'):options['proxy']={'server':os.environ['HTTPS_PROXY']}
        cls.browser=getattr(cls.pw,engine).launch(**options)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close();cls.pw.stop();cls.server.shutdown();cls.server.server_close()

    def setUp(self):
        self.context=self.browser.new_context(viewport={'width':390,'height':844},has_touch=True)
        self.context.add_init_script(ANSWER_FIXTURE)
        self.page=self.context.new_page();self.errors=[]
        self.page.on('pageerror',lambda error:self.errors.append(str(error)))

    def tearDown(self):
        try:self.assertEqual(self.errors,[])
        finally:self.context.close()

    def start(self,variant='number',count=2,names=None,length=None):
        p=self.page;p.goto(self.url+'play.html?variant='+variant)
        expect(p.locator('#setupScreen')).to_be_visible()
        expect(p.locator('#resumeGame, #savedGamePanel')).to_have_count(0)
        p.locator('#playerCount').select_option(str(count))
        chosen=names or ['Alice','Bob','Chris','Dana','Eli'][:count]
        for i,name in enumerate(chosen):p.locator('#playerNames input').nth(i).fill(name)
        if length is not None:p.locator('#puzzleLength').select_option(str(length))
        p.locator('#startCompetition').click()
        expect(p.locator('#gameScreen')).to_be_visible()

    def guess(self,value,keyboard=False):
        self.page.locator('#guess').fill(value)
        if keyboard:self.page.locator('#guess').press('Enter')
        else:self.page.locator('#checkGuess').click()

    def balances(self):
        return [int(text.split()[0]) for text in self.page.locator('#pointsList .points-balance').all_text_contents()]

    @staticmethod
    def wrong_codes(count):
        return [str(n).zfill(3) for n in range(1000) if len(set(str(n).zfill(3)))==3 and str(n).zfill(3)!='123'][:count]
