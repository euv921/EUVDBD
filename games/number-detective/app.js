(() => {
  'use strict';
  const {isValidCode, scoreGuess, createCode} = window.NumberDetective;
  const $ = id => document.getElementById(id);
  const key = 'number-detective-v1', preferencesKey = 'number-detective-players';
  const names = Array(5).fill('');
  let answer, guesses = [], players = [], revealed = false, pendingAction = null;
  const solved = () => typeof answer === 'string' && guesses.at(-1) === answer;
  const finished = () => revealed || solved();
  const turn = () => guesses.length % players.length;
  function save() {
    try { localStorage.setItem(key, JSON.stringify({answer, guesses, players, revealed})); } catch (_) {}
  }
  function rememberNames() {
    $('playerNames').querySelectorAll('input').forEach((input, i) => { names[i] = input.value.slice(0, 20); });
    try { localStorage.setItem(preferencesKey, JSON.stringify({count: Number($('playerCount').value), names})); } catch (_) {}
  }
  function renderNames() {
    $('playerNames').replaceChildren();
    const count = Number($('playerCount').value);
    for (let i = 0; i < count; i++) {
      const label = node('label', `Player ${i + 1}`);
      const input = document.createElement('input');
      input.type = 'text'; input.maxLength = 20; input.autocomplete = 'off';
      input.placeholder = `Player ${i + 1}`; input.value = names[i];
      input.setAttribute('aria-label', `Player ${i + 1} name`);
      label.append(input); $('playerNames').append(label);
    }
    $('setupHint').textContent = count === 1 ? 'Play at your own pace. Every clue brings you closer.' : 'Share one device. One guess per turn. Everyone sees the clues.';
  }
  function message(text, error = false) {
    $('message').textContent = text;
    $('message').classList.toggle('error', error);
    $('guess').setAttribute('aria-invalid', String(error));
  }
  function node(tag, text, className) {
    const element = document.createElement(tag); element.textContent = text;
    if (className) element.className = className;
    return element;
  }
  function render() {
    const active = players.length > 0;
    $('setupForm').hidden = active;
    for (const id of ['playHeader', 'newGame', 'message', 'changePlayers']) $(id).hidden = !active;
    $('turnInfo').hidden = !active || finished();
    $('guessForm').hidden = !active || finished();
    $('result').hidden = !active || !finished();
    $('reveal').hidden = !active || finished();
    $('history').replaceChildren();
    guesses.forEach((guess, index) => {
      const score = scoreGuess(answer, guess), row = document.createElement('tr');
      if (index === guesses.length - 1) row.className = 'latest';
      row.append(node('td', String(index + 1).padStart(2, '0')), node('td', players[index % players.length], 'history-player'), node('td', guess, 'history-code'));
      for (const [count, style] of [[score.exact, 'right'], [score.misplaced, 'wrong']]) {
        const cell = document.createElement('td'); cell.append(node('span', count, `score ${style}`)); row.append(cell);
      }
      $('history').prepend(row);
    });
    $('latestFeedback').hidden = !active || guesses.length === 0;
    if (active && guesses.length) {
      const latest = guesses.at(-1), score = scoreGuess(answer, latest);
      $('latestPlayer').textContent = players.length === 1 ? 'Your latest guess' : `${players[(guesses.length - 1) % players.length]} guessed`;
      $('latestCode').textContent = latest;
      $('latestRight').textContent = score.exact;
      $('latestWrong').textContent = score.misplaced;
    }
    $('empty').hidden = guesses.length > 0; $('historyWrap').hidden = guesses.length === 0;
    $('guessCount').textContent = `${guesses.length} ${guesses.length === 1 ? 'guess' : 'guesses'}`;
    $('attemptLabel').textContent = finished() ? 'CASE CLOSED' : `GUESS ${String(guesses.length + 1).padStart(2, '0')}`;
    if (active && !finished()) {
      $('currentPlayer').textContent = players.length === 1 ? 'Your turn' : `${players[turn()]}’s turn`;
      $('roundLabel').textContent = players.length === 1 ? 'SOLO' : `ROUND ${Math.floor(guesses.length / players.length) + 1}`;
    }
    if (active && finished()) {
      const winner = players[(guesses.length - 1) % players.length];
      $('resultKicker').textContent = solved() ? 'CASE CLOSED · NICELY DONE' : 'MYSTERY REVEALED';
      $('resultTitle').textContent = solved() ? (players.length === 1 ? 'You cracked the code!' : `${winner} wins!`) : `The code was ${answer}.`;
      $('resultDetail').textContent = solved() ? `The code was ${answer}. Solved in ${guesses.length} ${guesses.length === 1 ? 'guess' : 'guesses'}. Ready for another?` : 'No winner this time. Start a fresh puzzle with the same players.';
      $('playAgain').textContent = players.length === 1 ? 'Play another puzzle ↗' : 'Play again · same players ↗';
    }
  }
  function newGame() {
    if (!players.length) return;
    answer = createCode(); guesses = []; revealed = false;
    $('guess').value = ''; save(); render();
    message(players.length === 1 ? 'A fresh mystery. What’s your first guess?' : `${players[0]} goes first. One shared code, one guess per turn.`);
  }
  function showSetup() {
    players = []; answer = undefined; guesses = []; revealed = false;
    try { localStorage.removeItem(key); } catch (_) {}
    renderNames(); render();
  }
  function ask(title, detail, action, confirmLabel = 'New puzzle') {
    pendingAction = action; $('confirmTitle').textContent = title; $('confirmDetail').textContent = detail;
    $('confirmAction').textContent = confirmLabel; $('confirmDialog').showModal(); $('cancelAction').focus();
  }
  $('playerCount').addEventListener('change', () => { rememberNames(); renderNames(); });
  $('playerNames').addEventListener('input', rememberNames);
  $('setupForm').addEventListener('submit', event => {
    event.preventDefault(); rememberNames();
    const count = Number($('playerCount').value);
    if (!Number.isInteger(count) || count < 1 || count > 5) return;
    const chosen = names.slice(0, count).map((name, i) => name.trim() || `Player ${i + 1}`);
    players = chosen.map((name, i) => chosen.filter(other => other.toLocaleLowerCase() === name.toLocaleLowerCase()).length > 1 ? `${name} (${i + 1})` : name);
    newGame();
  });
  $('guessForm').addEventListener('submit', event => {
    event.preventDefault(); if (!players.length || finished()) return;
    const guess = $('guess').value;
    if (!/^\d{3}$/.test(guess)) { message('Enter exactly three digits from 0–9. Your turn continues.', true); $('guess').focus(); return; }
    if (!isValidCode(guess)) { message('Use three different digits—no repeats. Your turn continues.', true); $('guess').focus(); return; }
    if (guesses.includes(guess)) { message('You already tried that code. Try a new one; your turn continues.', true); $('guess').focus(); return; }
    const player = players[turn()];
    guesses.push(guess); save(); render();
    const score = scoreGuess(answer, guess);
    message(solved() ? `${player} cracked ${answer}!` : `${guess}: ${score.exact} right ${score.exact === 1 ? 'spot' : 'spots'}, ${score.misplaced} wrong ${score.misplaced === 1 ? 'spot' : 'spots'}. ${players.length === 1 ? 'What’s your next theory?' : `Next: ${players[turn()]}.`}`);
    $('guess').value = ''; $('historyWrap').scrollTop = 0;
    $('guess').blur();
    if (solved()) $('resultTitle').focus();
    (solved() ? $('result') : $('latestFeedback')).scrollIntoView({block: solved() ? 'center' : 'end', behavior: 'instant'});
  });
  document.querySelectorAll('[data-digit]').forEach(button => button.addEventListener('click', () => {
    if (players.length && !finished() && $('guess').value.length < 3) { $('guess').value += button.dataset.digit; message('Three different digits. Follow the clues.'); }
  }));
  $('clear').addEventListener('click', () => { $('guess').value = ''; message('Try a different theory.'); });
  $('backspace').addEventListener('click', () => { $('guess').value = $('guess').value.slice(0, -1); message('Three different digits. Follow the clues.'); });
  $('guess').addEventListener('input', () => message('Three different digits. Follow the clues.'));
  $('newGame').addEventListener('click', () => {
    if (!finished() && guesses.length) ask('Start a new puzzle?', 'Your current code and case notes will be replaced. Players stay the same.', newGame);
    else newGame();
  });
  $('changePlayers').addEventListener('click', () => {
    if (!finished() && guesses.length) ask('Change players?', 'This ends the current puzzle. Choose players for a new game.', showSetup, 'Change players');
    else showSetup();
  });
  $('playAgain').addEventListener('click', newGame);
  $('reveal').addEventListener('click', () => ask('Reveal the code?', 'This ends the current puzzle. No player wins if the answer is revealed.', () => {
    revealed = true; save(); render(); message('Mystery revealed. A new puzzle is waiting.'); $('resultTitle').focus();
  }, 'Reveal code'));
  $('cancelAction').addEventListener('click', () => { pendingAction = null; $('confirmDialog').close(); });
  $('confirmDialog').addEventListener('cancel', () => { pendingAction = null; });
  $('confirmAction').addEventListener('click', () => {
    const action = pendingAction; pendingAction = null; $('confirmDialog').close(); action?.();
  });
  try {
    const preferences = JSON.parse(localStorage.getItem(preferencesKey) || 'null');
    if (preferences && Number.isInteger(preferences.count) && preferences.count >= 1 && preferences.count <= 5) $('playerCount').value = String(preferences.count);
    if (Array.isArray(preferences?.names)) preferences.names.slice(0, 5).forEach((name, i) => { if (typeof name === 'string') names[i] = name.slice(0, 20); });
  } catch (_) {}
  let restored = false;
  try {
    const state = JSON.parse(localStorage.getItem(key) || 'null');
    const savedPlayers = state?.players ?? ['Player 1'];
    if (state && isValidCode(state.answer) && Array.isArray(state.guesses) && state.guesses.every(isValidCode)
      && new Set(state.guesses).size === state.guesses.length && typeof state.revealed === 'boolean'
      && !state.guesses.slice(0, -1).includes(state.answer) && Array.isArray(savedPlayers) && savedPlayers.length >= 1 && savedPlayers.length <= 5
      && savedPlayers.every(name => typeof name === 'string' && name.trim().length > 0 && name.length <= 40)) {
      answer = state.answer; guesses = state.guesses; revealed = state.revealed; players = savedPlayers; restored = true;
      $('playerCount').value = String(players.length);
      players.forEach((name, i) => { if (!names[i]) names[i] = name.slice(0, 20); });
    }
  } catch (_) {}
  renderNames(); render();
  if (restored) { save(); message(finished() ? 'Your last case is saved. Play another whenever you’re ready.' : `Welcome back. ${players.length === 1 ? 'Your turn.' : `${players[turn()]}’s turn.`} Your clues are saved.`); }
})();
