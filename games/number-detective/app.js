(() => {
  'use strict';
  const {isValidCode, scoreGuess, createCode, evaluateRound, nextRoundPoints} = window.NumberDetective;
  const $ = id => document.getElementById(id);
  const key = 'number-detective-v1', preferencesKey = 'number-detective-players';
  const names = Array(5).fill('');
  let answer, guesses = [], players = [], revealed = false, pendingAction = null;
  let startingPoints = [], scoringFrom = 0;
  let bestRecord = null, recordBroken = false;
  const recordKey = 'number-detective-best-v1';
  const ledger = () => evaluateRound({answer, guesses, playerCount: players.length, startingPoints, scoringFrom});
  const solved = () => typeof answer === 'string' && guesses.at(-1) === answer;
  const finished = () => revealed || solved() || (players.length > 1 && ledger().exhausted);
  const turn = () => ledger().current;
  function save() {
    try { localStorage.setItem(key, JSON.stringify({answer, guesses, players, revealed, startingPoints, scoringFrom, pointsVersion: 1})); } catch (_) {}
  }
  function updateRecord() {
    if (!solved() || (bestRecord && guesses.length >= bestRecord.guesses)) return false;
    bestRecord = {guesses: guesses.length, name: players[ledger().winner], playerCount: players.length};
    try { localStorage.setItem(recordKey, JSON.stringify(bestRecord)); } catch (_) {}
    return true;
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
    $('setupHint').textContent = count === 1 ? 'Play at your own pace. Every clue brings you closer.' : 'Start with 5 points each. A guess costs 1; solving earns +5. Balances carry over between rounds.';
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
    const round = active ? ledger() : null;
    $('bestRecordCount').textContent = bestRecord ? `${bestRecord.guesses} total ${bestRecord.guesses === 1 ? 'guess' : 'guesses'}` : 'No record yet';
    $('bestRecordOwner').textContent = bestRecord ? `${bestRecord.name} · ${bestRecord.playerCount === 1 ? 'Solo' : `${bestRecord.playerCount} players`}` : 'Solve a code to set the first record.';
    $('recordNotice').hidden = !active || !solved() || !recordBroken;
    if (recordBroken && solved()) $('recordNotice').textContent = `New best: ${guesses.length} total ${guesses.length === 1 ? 'guess' : 'guesses'}!`;
    $('setupForm').hidden = active;
    for (const id of ['playHeader', 'newGame', 'message', 'changePlayers']) $(id).hidden = !active;
    $('turnInfo').hidden = !active || finished();
    $('guessForm').hidden = !active || finished();
    $('result').hidden = !active || !finished();
    $('reveal').hidden = !active || finished();
    $('pointsBoard').hidden = !active || players.length === 1;
    $('pointsList').replaceChildren();
    if (active && players.length > 1) players.forEach((name, index) => {
      const item = document.createElement('li');
      item.dataset.player = String(index);
      item.classList.toggle('no-points', round.points[index] === 0);
      item.classList.toggle('current', !finished() && round.current === index);
      item.append(node('span', name, 'points-name'), node('strong', `${round.points[index]} pts`, 'points-balance'));
      if (round.points[index] === 0) item.append(node('small', 'Out this round'));
      $('pointsList').append(item);
    });
    $('history').replaceChildren();
    guesses.forEach((guess, index) => {
      const score = scoreGuess(answer, guess), row = document.createElement('tr');
      if (index === guesses.length - 1) row.className = 'latest';
      row.append(node('td', String(index + 1).padStart(2, '0')), node('td', players[round.actors[index]], 'history-player'), node('td', guess, 'history-code'));
      for (const [count, style] of [[score.exact, 'right'], [score.misplaced, 'wrong']]) {
        const cell = document.createElement('td'); cell.append(node('span', count, `score ${style}`)); row.append(cell);
      }
      $('history').prepend(row);
    });
    $('latestFeedback').hidden = !active || guesses.length === 0;
    if (active && guesses.length) {
      const latest = guesses.at(-1), score = scoreGuess(answer, latest);
      $('latestPlayer').textContent = players.length === 1 ? 'Your latest guess' : `${players[round.actors.at(-1)]} guessed`;
      $('latestCode').textContent = latest;
      $('latestRight').textContent = score.exact;
      $('latestWrong').textContent = score.misplaced;
    }
    $('empty').hidden = guesses.length > 0; $('historyWrap').hidden = guesses.length === 0;
    $('guessCount').textContent = `${guesses.length} ${guesses.length === 1 ? 'guess' : 'guesses'}`;
    $('attemptLabel').textContent = finished() ? 'CASE CLOSED' : `GUESS ${String(guesses.length + 1).padStart(2, '0')}`;
    if (active && !finished()) {
      $('currentPlayer').textContent = players.length === 1 ? 'Your turn' : `${players[turn()]}’s turn`;
      $('roundLabel').textContent = players.length === 1 ? 'SOLO' : `${round.points[round.current]} PTS`;
    }
    if (active && finished()) {
      const winner = players[round.actors.at(-1)];
      $('resultKicker').textContent = solved() ? 'CASE CLOSED · NICELY DONE' : round.exhausted ? 'ROUND OVER · NO POINTS LEFT' : 'MYSTERY REVEALED';
      $('resultTitle').textContent = solved() ? (players.length === 1 ? 'You cracked the code!' : `${winner} wins!`) : round.exhausted ? 'Everyone is out of points.' : `The code was ${answer}.`;
      $('resultDetail').textContent = solved() ? `The code was ${answer}. Solved in ${guesses.length} ${guesses.length === 1 ? 'guess' : 'guesses'}. Ready for another?` : 'No winner this time. Start a fresh puzzle with the same players.';
      if (players.length > 1) $('resultDetail').textContent = solved()
        ? `The code was ${answer}. ${winner} earned +5 for solving and now has ${round.points[round.winner]} points. Next round adds +5 to everyone’s balance.`
        : `The code was ${answer}. No winner this round. Next round adds +5 to everyone's remaining balance.`;
      $('playAgain').textContent = players.length === 1 ? 'Play another puzzle ↗' : 'Play again · same players ↗';
    }
  }
  function newGame() {
    if (!players.length) return;
    startingPoints = players.length > 1 && isValidCode(answer)
      ? nextRoundPoints(ledger().points)
      : Array(players.length).fill(5);
    scoringFrom = 0; recordBroken = false;
    answer = createCode(); guesses = []; revealed = false;
    $('guess').value = ''; save(); render();
    message(players.length === 1 ? 'A fresh mystery. What’s your first guess?' : `${players[0]} goes first. One shared code, one guess per turn.`);
  }
  function showSetup() {
    players = []; answer = undefined; guesses = []; revealed = false; startingPoints = []; scoringFrom = 0; recordBroken = false;
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
    guesses.push(guess); recordBroken = updateRecord(); save(); render();
    const score = scoreGuess(answer, guess);
    message(solved() ? `${player} cracked ${answer}!` : ledger().exhausted ? `Everyone is out of points. The code was ${answer}.` : `${guess}: ${score.exact} right ${score.exact === 1 ? 'spot' : 'spots'}, ${score.misplaced} wrong ${score.misplaced === 1 ? 'spot' : 'spots'}. ${players.length === 1 ? 'What’s your next theory?' : `Next: ${players[turn()]} (${ledger().points[turn()]} points).`}`);
    $('guess').value = ''; $('historyWrap').scrollTop = 0;
    $('guess').blur();
    if (finished()) $('resultTitle').focus();
    (finished() ? $('result') : $('latestFeedback')).scrollIntoView({block: finished() ? 'center' : 'end', behavior: 'instant'});
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
    if (!finished() && guesses.length) ask('Change players?', 'This ends the current competition and resets points. Choose players for a new game.', showSetup, 'Change players');
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
  try {
    const record = JSON.parse(localStorage.getItem(recordKey) || 'null');
    if (record && Number.isInteger(record.guesses) && record.guesses >= 1 && record.guesses <= 720
      && Number.isInteger(record.playerCount) && record.playerCount >= 1 && record.playerCount <= 5
      && typeof record.name === 'string' && record.name.length > 0 && record.name.length <= 40) bestRecord = record;
  } catch (_) {}
  let restored = false;
  try {
    const state = JSON.parse(localStorage.getItem(key) || 'null');
    const savedPlayers = state?.players ?? ['Player 1'];
    if (state && isValidCode(state.answer) && Array.isArray(state.guesses) && state.guesses.every(isValidCode)
      && new Set(state.guesses).size === state.guesses.length && typeof state.revealed === 'boolean'
      && !state.guesses.slice(0, -1).includes(state.answer) && Array.isArray(savedPlayers) && savedPlayers.length >= 1 && savedPlayers.length <= 5
      && savedPlayers.every(name => typeof name === 'string' && name.trim().length > 0 && name.length <= 40)) {
      const balances = state.pointsVersion === 1 ? state.startingPoints : Array(savedPlayers.length).fill(5);
      // Older saves keep all their clues; charging starts with their next guess.
      const from = state.pointsVersion === 1 ? state.scoringFrom : state.guesses.length;
      evaluateRound({answer: state.answer, guesses: state.guesses, playerCount: savedPlayers.length, startingPoints: balances, scoringFrom: from});
      answer = state.answer; guesses = state.guesses; revealed = state.revealed; players = savedPlayers;
      startingPoints = balances; scoringFrom = from; restored = true;
      $('playerCount').value = String(players.length);
      players.forEach((name, i) => { if (!names[i]) names[i] = name.slice(0, 20); });
    }
  } catch (_) {}
  if (restored) recordBroken = updateRecord();
  renderNames(); render();
  if (restored) { save(); message(finished() ? 'Your last case is saved. Play another whenever you’re ready.' : `Welcome back. ${players.length === 1 ? 'Your turn.' : `${players[turn()]}’s turn.`} Your clues are saved.`); }
})();
