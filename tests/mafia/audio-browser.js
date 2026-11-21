// Use real Web Audio output, but model iOS's speech permission and session
// interruption. Desktop TTS does not reproduce the iPhone audio session.
window.__audioTest = {contexts: [], spoken: [], primers: [], inTap: false,
  unlocked: false, interruptSpeech: true, holdSpeech: false, queue: [],
  heldResumes: [], holdResume: false, rejectResume: false, session: 'ambient'};
const test = window.__audioTest;
document.addEventListener('click', () => { test.inTap = true; }, true);
document.addEventListener('click', () => { test.inTap = false; });
Object.defineProperty(navigator, 'audioSession', {configurable: true, value: {
  get type() { return test.session; }, set type(value) { test.session = value; }
}});
const NativeContext = window.AudioContext || window.webkitAudioContext;
window.AudioContext = class extends NativeContext {
  constructor(...args) { super(...args); test.contexts.push(this); this.gains = []; this.sources = []; this.resumeCalls = 0; }
  get state() { return this.interrupted ? 'interrupted' : super.state; }
  createGain() { const gain = super.createGain(); this.gains.push(gain); return gain; }
  createBufferSource() {
    const source = super.createBufferSource(); this.sources.push(source);
    const start = source.start.bind(source);
    source.start = (...args) => { source.startedAt = performance.now(); start(...args); };
    return source;
  }
  interrupt() {
    this.interrupted = true;
    super.suspend();
    this.dispatchEvent(new Event('statechange'));
  }
  resume() {
    this.resumeCalls++;
    if (test.rejectResume) return Promise.reject(new Error('audio busy'));
    const resume = () => { this.interrupted = false; return super.resume(); };
    return test.holdResume ? new Promise(resolve => test.heldResumes.push(() => resolve(resume()))) : resume();
  }
};
window.SpeechSynthesisUtterance = class {
  constructor(text) { this.text = text; this.volume = 1; }
};
function next() {
  if (test.current || !test.queue.length) return;
  const utterance = test.current = test.queue.shift();
  if (test.interruptSpeech) test.contexts.forEach(context => context.interrupt());
  utterance.onstart?.();
  if (!test.holdSpeech) setTimeout(() => finish(), 200);
}
function finish(error) {
  const utterance = test.current;
  if (!utterance) return;
  test.current = null;
  if (error) utterance.onerror?.({error}); else utterance.onend?.();
  next();
}
test.finish = finish;
Object.defineProperty(window, 'speechSynthesis', {configurable: true, value: {
  get speaking() { return Boolean(test.current); },
  get pending() { return test.queue.length > 0; },
  getVoices: () => [{lang: 'en-US'}, {lang: 'zh-CN'}],
  speak(utterance) {
    if (test.inTap) test.unlocked = true;
    if (!test.unlocked) throw new Error('Speech needs a direct tap');
    if (!utterance.text) {
      test.primers.push({time: performance.now(), inTap: test.inTap, volume: utterance.volume});
      setTimeout(() => utterance.onend?.(), 0);
      return;
    }
    test.spoken.push({text: utterance.text, lang: utterance.lang, volume: utterance.volume, time: performance.now()});
    test.queue.push(utterance); next();
  },
  cancel() {
    const canceled = [test.current, ...test.queue].filter(Boolean);
    test.current = null; test.queue = [];
    // Real Safari delivers cancellation callbacks asynchronously.
    canceled.forEach(utterance => setTimeout(() => utterance.onerror?.({error: 'canceled'}), 0));
  }
}});
