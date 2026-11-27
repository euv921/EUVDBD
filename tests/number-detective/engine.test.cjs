const {test} = require('node:test');
const assert = require('node:assert/strict');
const {scoreGuess, isValidCode, createCode} = require('../../games/number-detective/engine.js');

test('examples, leading zero, all misplaced, and no matches', () => {
  for (const [answer, guess, exact, misplaced] of [
    ['123', '132', 1, 2], ['123', '123', 3, 0], ['123', '231', 0, 3],
    ['123', '456', 0, 0], ['123', '124', 2, 0], ['012', '210', 1, 2],
    ['012', '345', 0, 0], ['123', '012', 0, 2]
  ]) assert.deepEqual(scoreGuess(answer, guess), {exact, misplaced});
});

test('validation prevents repeats and malformed guesses', () => {
  for (const value of ['000', '112', '12', '1234', 'abc', '１２３', ' 12', 123, null]) {
    assert.equal(isValidCode(value), false);
    assert.throws(() => scoreGuess('123', value));
  }
  assert.equal(isValidCode('012'), true);
});

test('all 518,400 valid answer/guess pairs obey Bulls and Cows scoring', () => {
  const codes = Array.from({length: 1000}, (_, n) => String(n).padStart(3, '0')).filter(isValidCode);
  assert.equal(codes.length, 720);
  for (const answer of codes) for (const guess of codes) {
    const score = scoreGuess(answer, guess);
    const positions = [0, 1, 2].filter(i => answer[i] === guess[i]);
    const remainingAnswer = [...answer].filter((_, i) => !positions.includes(i));
    const remainingGuess = [...guess].filter((_, i) => !positions.includes(i));
    assert.equal(score.exact, positions.length);
    assert.equal(score.misplaced, remainingGuess.filter(digit => remainingAnswer.includes(digit)).length);
    assert.ok(score.exact + score.misplaced <= 3);
    assert.equal(score.exact === 3, answer === guess);
  }
});

test('code creation uses a changing random source and always produces valid codes', () => {
  assert.equal(createCode(() => 0), '123');
  assert.equal(createCode(limit => limit - 1), '012');
  for (let i = 0; i < 1000; i++) assert.equal(isValidCode(createCode()), true);
});
