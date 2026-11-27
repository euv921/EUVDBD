const {test} = require('node:test');
const assert = require('node:assert/strict');
const {scoreGuess, isValidCode, createCode, evaluateRound, nextRoundPoints} = require('../../games/number-detective/engine.js');

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

const wrongCodes = Array.from({length: 1000}, (_, n) => String(n).padStart(3, '0')).filter(code => isValidCode(code) && code !== '123');

test('multiplayer charges guesses, pays +5 for a correct guess, and adds +5 to everyone next round', () => {
  const state = evaluateRound({answer: '123', guesses: ['456', '123'], playerCount: 2});
  assert.deepEqual(state.points, [4, 9]);
  assert.equal(state.winner, 1);
  assert.deepEqual(state.actors, [0, 1]);
  const next = nextRoundPoints(state.points);
  assert.deepEqual(next, [9, 14]);
  const following = evaluateRound({answer: '123', guesses: ['123'], playerCount: 2, startingPoints: next});
  assert.deepEqual(following.points, [13, 14]);
  assert.deepEqual(nextRoundPoints(following.points), [18, 19]);
  assert.deepEqual(evaluateRound({answer: '123', guesses: [], playerCount: 2, startingPoints: next}).points, next);
});

test('2–5 player rounds end when everyone has spent their points', () => {
  for (let playerCount = 2; playerCount <= 5; playerCount++) {
    const guesses = wrongCodes.slice(0, playerCount * 5);
    const state = evaluateRound({answer: '123', guesses, playerCount});
    assert.deepEqual(state.points, Array(playerCount).fill(0));
    assert.equal(state.exhausted, true);
    assert.equal(state.current, null);
    assert.equal(state.winner, null);
    assert.deepEqual(nextRoundPoints(state.points), Array(playerCount).fill(5));
    assert.throws(() => evaluateRound({answer: '123', guesses: [...guesses, '123'], playerCount}));
  }
});

test('zero-point players are skipped; history credits the actual guesser', () => {
  const state = evaluateRound({answer: '123', guesses: ['456', '789', '045', '123'], playerCount: 3, startingPoints: [1, 0, 5]});
  assert.deepEqual(state.actors, [0, 2, 2, 2]);
  assert.deepEqual(state.points, [0, 0, 7]);
  assert.equal(state.winner, 2);
  assert.equal(state.exhausted, false);
});

test('a correct guess on the last point still wins and earns its reward', () => {
  const state = evaluateRound({answer: '123', guesses: [...wrongCodes.slice(0, 9), '123'], playerCount: 2});
  assert.deepEqual(state.points, [0, 5]);
  assert.equal(state.winner, 1);
  assert.equal(state.exhausted, false);
});

test('solo remains unlimited and older clues can migrate without retroactive charges', () => {
  const solo = evaluateRound({answer: '123', guesses: [...wrongCodes.slice(0, 20), '123'], playerCount: 1});
  assert.deepEqual(solo.points, [5]);
  assert.equal(solo.winner, 0);
  const migrated = evaluateRound({answer: '123', guesses: [...wrongCodes.slice(0, 20), '123'], playerCount: 2, scoringFrom: 20});
  assert.deepEqual(migrated.points, [9, 5]);
  assert.equal(migrated.winner, 0);
});

test('invalid competitive saves cannot create negative balances or continue after a win', () => {
  for (const startingPoints of [[-1, 5], [1.5, 5], [5], [Infinity, 5]]) {
    assert.throws(() => evaluateRound({answer: '123', guesses: [], playerCount: 2, startingPoints}));
  }
  assert.throws(() => evaluateRound({answer: '123', guesses: ['123', '456'], playerCount: 2}));
  assert.throws(() => evaluateRound({answer: '123', guesses: ['456', '456'], playerCount: 2}));
});
