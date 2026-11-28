/* Original letter Bulls and Cows with duplicate-aware scoring. */
(() => {
  'use strict';
  function createEngine(entries) {
  if (!Array.isArray(entries) || !entries.length || entries.some(entry => !entry || !/^[a-z]{2,8}$/.test(entry.answer))
    || new Set(entries.map(entry => entry.answer)).size !== entries.length) throw new Error('Invalid answer bank.');
  const bank = entries.map(entry => Object.freeze({...entry}));
  const isValidCode = value => typeof value === 'string' && /^[a-z]{2,8}$/.test(value);
  const isAnswer = value => bank.some(entry => entry.answer === value);
  const answerInfo = value => bank.find(entry => entry.answer === value);
  const lengths = [...new Set(bank.map(entry => entry.answer.length))].sort((a, b) => a - b);
  function scoreGuess(answer, guess) {
    if (!isValidCode(answer) || !isValidCode(guess) || answer.length !== guess.length) throw new Error('Use matching letter counts.');
    let exact = 0, misplaced = 0;
    const remainingAnswer = {}, remainingGuess = {};
    for (let i = 0; i < answer.length; i++) {
      if (answer[i] === guess[i]) exact++;
      else {
        remainingAnswer[answer[i]] = (remainingAnswer[answer[i]] || 0) + 1;
        remainingGuess[guess[i]] = (remainingGuess[guess[i]] || 0) + 1;
      }
    }
    for (const letter of Object.keys(remainingGuess)) misplaced += Math.min(remainingGuess[letter], remainingAnswer[letter] || 0);
    return {exact, misplaced};
  }
  function randomBelow(limit) {
    const values = new Uint32Array(1);
    const ceiling = 4294967296 - (4294967296 % limit);
    do { globalThis.crypto.getRandomValues(values); } while (values[0] >= ceiling);
    return values[0] % limit;
  }
  function createCode(length = 0, pick = randomBelow) {
    const choices = bank.filter(entry => !length || entry.answer.length === length);
    if (!choices.length) throw new Error('No answers at this length.');
    return choices[pick(choices.length)].answer;
  }
  // Reconstruct turns and balances from the starting balances and guess log.
  // This keeps reloads from charging twice or awarding a win twice.
  function evaluateRound({answer, guesses, playerCount, startingPoints = Array(playerCount).fill(5), scoringFrom = 0}) {
    if (!isValidCode(answer) || !Number.isInteger(playerCount) || playerCount < 1 || playerCount > 5
      || !Array.isArray(guesses) || !guesses.every(guess => isValidCode(guess) && guess.length === answer.length) || new Set(guesses).size !== guesses.length
      || !Array.isArray(startingPoints) || startingPoints.length !== playerCount
      || !startingPoints.every(points => Number.isSafeInteger(points) && points >= 0 && points <= Number.MAX_SAFE_INTEGER - 30)
      || !Number.isInteger(scoringFrom) || scoringFrom < 0 || scoringFrom > guesses.length) throw new Error('Invalid round.');
    const competitive = playerCount > 1, points = [...startingPoints], actors = [];
    const next = start => {
      if (!competitive) return 0;
      for (let step = 0; step < playerCount; step++) {
        const index = (start + step) % playerCount;
        if (points[index] > 0) return index;
      }
      return null;
    };
    let current = scoringFrom > 0 ? 0 : next(0), winner = null;
    for (let index = 0; index < guesses.length; index++) {
      if (winner !== null || current === null) throw new Error('Guess after round ended.');
      const legacyGuess = index < scoringFrom;
      const actor = legacyGuess ? index % playerCount : current;
      actors.push(actor);
      if (competitive && !legacyGuess) points[actor]--;
      if (guesses[index] === answer) {
        winner = actor;
        if (competitive) points[actor] += 5;
        current = null;
      } else current = index + 1 < scoringFrom ? (actor + 1) % playerCount : next((actor + 1) % playerCount);
    }
    return {points, actors, current, winner, exhausted: competitive && current === null && winner === null};
  }
  function nextRoundPoints(points) {
    if (!Array.isArray(points) || points.length < 2 || points.length > 5
      || !points.every(value => Number.isSafeInteger(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER - 30)) throw new Error('Invalid balances.');
    return points.map(value => value + 5);
  }
  return Object.freeze({isValidCode, isAnswer, answerInfo, lengths: Object.freeze(lengths), scoreGuess, createCode, evaluateRound, nextRoundPoints});
  }
  const api = Object.freeze({createEngine});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.LetterPuzzle = api;
})();
