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
  const api = Object.freeze({isValidCode, scoreGuess, createCode});
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.NumberDetective = api;
})();
