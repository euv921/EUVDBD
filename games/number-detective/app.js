(() => {
  'use strict';
  const {isValidCode, scoreGuess, createCode} = window.NumberDetective;
  const $ = id => document.getElementById(id);
  const key = 'number-detective-v1';
  let answer, guesses = [], revealed = false, pendingAction = null;
  const solved = () => guesses.at(-1) === answer;
  const finished = () => revealed || solved();
  function save() {
    try { localStorage.setItem(key, JSON.stringify({answer, guesses, revealed})); } catch (_) {}
  }
  function message(text, error = false) {
    $('message').textContent = text;
    $('message').classList.toggle('error', error);
    $('guess').setAttribute('aria-invalid', String(error));
  }
  function node(tag, text, className) {
    const element = document.createElement(tag);
    element.textContent = text;
    if (className) element.className = className;
    return element;
  }
  function render() {
    $('history').replaceChildren();
    guesses.forEach((guess, index) => {
      const score = scoreGuess(answer, guess);
      const row = document.createElement('tr');
      if (index === guesses.length - 1) row.className = 'latest';
      row.append(node('td', String(index + 1).padStart(2, '0')), node('td', guess));
      for (const [count, style] of [[score.exact, 'right'], [score.misplaced, 'wrong']]) {
        const cell = document.createElement('td');
        cell.append(node('span', count, `score ${style}`)); row.append(cell);
      }
      $('history').prepend(row);
    });
    $('empty').hidden = guesses.length > 0;
    $('historyWrap').hidden = guesses.length === 0;
    $('guessCount').textContent = `${guesses.length} ${guesses.length === 1 ? 'guess' : 'guesses'}`;
    $('attemptLabel').textContent = finished() ? 'CASE CLOSED' : `GUESS ${String(guesses.length + 1).padStart(2, '0')}`;
    $('guessForm').hidden = finished();
    $('result').hidden = !finished();
    $('reveal').hidden = finished();
    if (finished()) {
      $('resultKicker').textContent = solved() ? 'CASE CLOSED · NICELY DONE' : 'MYSTERY REVEALED';
      $('resultTitle').textContent = solved() ? 'You cracked the code!' : `The code was ${answer}.`;
      $('resultDetail').textContent = solved()
        ? `The code was ${answer}. Solved in ${guesses.length} ${guesses.length === 1 ? 'guess' : 'guesses'}. Ready for another?`
        : 'Every puzzle is a fresh start. Try a new code whenever you’re ready.';
    }
  }
  function newGame() {
    answer = createCode(); guesses = []; revealed = false;
    $('guess').value = ''; save(); render();
    message('A fresh mystery. What’s your first guess?');
  }
  function ask(title, detail, action) {
    pendingAction = action;
    $('confirmTitle').textContent = title;
    $('confirmDetail').textContent = detail;
    $('confirmAction').textContent = title.startsWith('Reveal') ? 'Reveal code' : 'New puzzle';
    $('confirmDialog').showModal();
    $('cancelAction').focus();
  }
  $('guessForm').addEventListener('submit', event => {
    event.preventDefault();
    if (finished()) return;
    const guess = $('guess').value;
    if (!/^\d{3}$/.test(guess)) { message('Enter exactly three digits from 0–9.', true); $('guess').focus(); return; }
    if (!isValidCode(guess)) { message('Use three different digits—no repeats.', true); $('guess').focus(); return; }
    if (guesses.includes(guess)) { message('You already tried that code. Use its clue to try a new one.', true); $('guess').focus(); return; }
    guesses.push(guess); save(); render();
    const score = scoreGuess(answer, guess);
    message(solved() ? `Solved! ${answer} is the code.` : `${guess}: ${score.exact} right ${score.exact === 1 ? 'spot' : 'spots'}, ${score.misplaced} wrong ${score.misplaced === 1 ? 'spot' : 'spots'}. What’s your next theory?`);
    $('guess').value = '';
    $('historyWrap').scrollTop = 0;
    if (solved()) $('resultTitle').focus();
  });
  document.querySelectorAll('[data-digit]').forEach(button => button.addEventListener('click', () => {
    if (!finished() && $('guess').value.length < 3) {
      $('guess').value += button.dataset.digit;
      message('Three different digits. Follow the clues.');
    }
  }));
  $('clear').addEventListener('click', () => { $('guess').value = ''; message('Try a different theory.'); });
  $('backspace').addEventListener('click', () => { $('guess').value = $('guess').value.slice(0, -1); message('Three different digits. Follow the clues.'); });
  $('guess').addEventListener('input', () => message('Three different digits. Follow the clues.'));
  $('newGame').addEventListener('click', () => {
    if (!finished() && guesses.length) ask('Start a new puzzle?', 'Your current code and case notes will be replaced.', newGame);
    else newGame();
  });
  $('playAgain').addEventListener('click', newGame);
  $('reveal').addEventListener('click', () => ask('Reveal the code?', 'This ends the current puzzle and shows the answer.', () => {
    revealed = true; save(); render(); message('Mystery revealed. A new puzzle is waiting.'); $('resultTitle').focus();
  }));
  $('cancelAction').addEventListener('click', () => { pendingAction = null; $('confirmDialog').close(); });
  $('confirmDialog').addEventListener('cancel', () => { pendingAction = null; });
  $('confirmAction').addEventListener('click', () => {
    const action = pendingAction; pendingAction = null; $('confirmDialog').close(); action?.();
  });
  let restored = false;
  try {
    const state = JSON.parse(localStorage.getItem(key) || 'null');
    if (state && isValidCode(state.answer) && Array.isArray(state.guesses) && state.guesses.every(isValidCode)
      && new Set(state.guesses).size === state.guesses.length && typeof state.revealed === 'boolean'
      && !state.guesses.slice(0, -1).includes(state.answer)) {
      answer = state.answer; guesses = state.guesses; revealed = state.revealed; restored = true;
    }
  } catch (_) {}
  if (restored) { render(); message(finished() ? 'Your last case is saved. Play another whenever you’re ready.' : 'Welcome back. Your code and case notes are saved.'); }
  else newGame();
})();
