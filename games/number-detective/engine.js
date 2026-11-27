/* Original three-digit Bulls and Cows rules. No third-party dependencies. */
(() => {
  'use strict';
  const isValidCode = value => typeof value === 'string' && /^\d{3}$/.test(value) && new Set(value).size === 3;
  function scoreGuess(answer, guess) {
    if (!isValidCode(answer) || !isValidCode(guess)) throw new Error('Use three different digits.');
    let exact = 0, shared = 0;
    for (let i = 0; i < 3; i++) {
      if (answer[i] === guess[i]) exact++;
      if (answer.includes(guess[i])) shared++;
    }
    return {exact, misplaced: shared - exact};
  }
  function randomBelow(limit) {
    const values = new Uint32Array(1);
    const ceiling = 4294967296 - (4294967296 % limit);
    do { globalThis.crypto.getRandomValues(values); } while (values[0] >= ceiling);
    return values[0] % limit;
  }
  function createCode(pick = randomBelow) {
    const digits = Array.from('0123456789');
    for (let i = digits.length - 1; i > 0; i--) {
      const j = pick(i + 1);
      [digits[i], digits[j]] = [digits[j], digits[i]];
    }
    return digits.slice(0, 3).join('');
  }
  // Reconstruct turns and balances from the starting balances and guess log.
  // This keeps reloads from charging twice or awarding a win twice.
  function evaluateRound({answer, guesses, playerCount, startingPoints = Array(playerCount).fill(5), scoringFrom = 0}) {
    if (!isValidCode(answer) || !Number.isInteger(playerCount) || playerCount < 1 || playerCount > 5
      || !Array.isArray(guesses) || !guesses.every(isValidCode) || new Set(guesses).size !== guesses.length
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
  const api = Object.freeze({isValidCode, scoreGuess, createCode, evaluateRound, nextRoundPoints});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.NumberDetective = api;
})();
