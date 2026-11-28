const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createEngine} = require('../../games/number-detective/letters-engine.js');
const configs = ['pinyin', 'words'].map(name => require(`../../games/number-detective/${name}.js`));

test('banks contain unique, well-formed answers with the requested examples', () => {
  for (const config of configs) {
    const engine = createEngine(config.entries);
    assert.ok(config.entries.length >= 80);
    assert.equal(new Set(config.entries.map(entry => entry.answer)).size, config.entries.length);
    assert.ok(config.entries.every(entry => /^[a-z]{2,8}$/.test(entry.answer)));
    for (const length of engine.lengths) for (let i = 0; i < 30; i++) {
      const answer = engine.createCode(length);
      assert.equal(answer.length, length);
      assert.equal(engine.isAnswer(answer), true);
    }
    assert.throws(() => engine.createCode(9));
    if (config.type === 'pinyin') {
      assert.ok(engine.isAnswer('mian'));
      assert.ok(config.entries.every(entry => entry.hanzi && entry.meaning));
    } else {
      assert.ok(engine.isAnswer('dinosaur'));
      assert.ok(config.entries.every(entry => entry.answer.length <= 8));
    }
  }
});

test('exact, misplaced, repeated, and absent letters are counted once each', () => {
  const engine = createEngine(configs[1].entries);
  for (const [answer, guess, exact, misplaced] of [
    ['mian','main',2,2], ['dinosaur','diansour',5,3], ['dinosaur','dddddddd',1,0],
    ['banana','aaaaaa',3,0], ['banana','ananab',0,6], ['letter','teller',3,2],
    ['apple','allee',2,1], ['mian','mian',4,0], ['dinosaur','dinosaur',8,0], ['mian','zzzz',0,0]
  ]) assert.deepEqual(engine.scoreGuess(answer, guess), {exact, misplaced}, `${answer} / ${guess}`);
  assert.throws(() => engine.scoreGuess('mian', 'mia'));
  assert.throws(() => engine.scoreGuess('mian', 'mi1n'));
});

test('all repeated-letter combinations over a small alphabet match a multiset reference', () => {
  const engine = createEngine(configs[0].entries);
  for (let length = 2; length <= 5; length++) {
    const words = Array.from({length: 3 ** length}, (_, n) => n.toString(3).padStart(length,'0').replace(/[012]/g, c => 'abc'[Number(c)]));
    for (const answer of words) for (const guess of words) {
      const exact = [...answer].filter((letter, i) => letter === guess[i]).length;
      const total = [...'abc'].reduce((sum, letter) => sum + Math.min([...answer].filter(c => c === letter).length, [...guess].filter(c => c === letter).length), 0);
      assert.deepEqual(engine.scoreGuess(answer, guess), {exact, misplaced: total - exact});
    }
  }
});

test('both variants retain turn costs, bonuses, skipping, and unlimited solo', () => {
  for (const config of configs) {
    const engine = createEngine(config.entries);
    const answer = config.type === 'pinyin' ? 'mian' : 'dinosaur';
    const wrong = 'z'.repeat(answer.length);
    const state = engine.evaluateRound({answer, guesses:[wrong, answer], playerCount:2});
    assert.equal(state.winner,1);
    assert.deepEqual(state.points,[4,9]);
    assert.deepEqual(engine.nextRoundPoints(state.points),[9,14]);
    const skipped = engine.evaluateRound({answer, guesses:[wrong,answer], playerCount:3, startingPoints:[0,1,1]});
    assert.deepEqual(skipped.actors,[1,2]);
    assert.deepEqual(skipped.points,[0,0,5]);
    const solo = engine.evaluateRound({answer, guesses:[wrong,answer], playerCount:1});
    assert.equal(solo.winner,0);
    assert.deepEqual(solo.points,[5]);
    assert.throws(() => engine.evaluateRound({answer, guesses:['abc'],playerCount:2}));
  }
});
