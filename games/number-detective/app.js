(() => {
  'use strict';
  const modes = {
    number: {slug: 'number-detective', type: 'number', first: 'Number', title: 'Number Detective', tagline: 'Three digits. Every clue counts.', defaultLength: 3},
    pinyin: window.PinyinDetectiveConfig,
    english: window.WordDetectiveConfig
  };
  const selected = new URL(location.href).searchParams.get('variant');
  if (!Object.hasOwn(modes, selected)) { location.replace('./'); return; }
  const config = modes[selected];
  const numeric = config.type === 'number';
  const rules = numeric ? {...window.NumberDetective, isAnswer: window.NumberDetective.isValidCode,
    answerInfo: () => null, lengths: [3], createCode: () => window.NumberDetective.createCode()} : window.LetterPuzzle.createEngine(config.entries);
  const {isValidCode, isAnswer, answerInfo, lengths, scoreGuess, createCode, evaluateRound, nextRoundPoints} = rules;
  const $ = id => document.getElementById(id);
  const key = `${config.slug}-v1`, preferencesKey = 'number-detective-players';
  const names = Array(5).fill('');
  let savedLengths = {};
  let answer, guesses = [], players = [], revealed = false, pendingAction = null;
  let startingPoints = [], scoringFrom = 0;
  let gameLength = numeric ? 3 : 0;
  let view = new URL(location.href).searchParams.get('screen') === 'game' ? 'game' : 'setup';
  let bestRecord = null, recordBroken = false;
  const recordKey = `${config.slug}-best-v1`;
  const ledger = () => evaluateRound({answer, guesses, playerCount: players.length, startingPoints, scoringFrom});
  const solved = () => typeof answer === 'string' && guesses.at(-1) === answer;
  const finished = () => revealed || solved() || (players.length > 1 && ledger().exhausted);
  const turn = () => ledger().current;
  function save() {
    try { localStorage.setItem(key, JSON.stringify({answer, guesses, players, revealed, startingPoints, scoringFrom, pointsVersion: 1, selectedLength: gameLength})); } catch (_) {}
  }
  function updateRecord() {
    if (!solved() || (bestRecord && guesses.length >= bestRecord.guesses)) return false;
    bestRecord = {guesses: guesses.length, name: players[ledger().winner], playerCount: players.length};
    try { localStorage.setItem(recordKey, JSON.stringify(bestRecord)); } catch (_) {}
    return true;
  }
  function rememberNames() {
    $('playerNames').querySelectorAll('input').forEach((input, i) => { names[i] = input.value.slice(0, 20); });
    try { localStorage.setItem(preferencesKey, JSON.stringify({count: Number($('playerCount').value), names, lengths: {...savedLengths, [selected]: Number($('puzzleLength').value)}})); } catch (_) {}
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
    const inGame = active && view === 'game';
    $('setupScreen').hidden = inGame;
    $('gameScreen').hidden = !inGame;
    $('toVariants').hidden = inGame;
    $('backToDetectives').hidden = !inGame;
    document.body.classList.toggle('game-screen', inGame);
    $('screenStep').textContent = inGame ? 'STEP 3 · SOLVE THE MYSTERY' : 'STEP 2 · GAME SETUP';
    $('savedGamePanel').hidden = !active;
    $('savedGameInfo').textContent = active ? `Saved game: ${players.join(', ')}${numeric ? '' : ` · ${answer.length} letters`}. Your guesses and points are kept.` : '';
    $('resumeGame').textContent = active && finished() ? 'View last result →' : 'Resume current game →';
    $('startCompetition').disabled = false;
    $('startCompetition').textContent = active ? 'Start a new game →' : 'Start game →';
    $('wordLength').hidden = !active || finished() || numeric;
    if (active) {
      document.documentElement.style.setProperty('--letters', String(answer.length));
      $('wordLength').textContent = `${answer.length} LETTERS · LETTERS MAY REPEAT`;
      $('guess').maxLength = answer.length;
      $('guess').placeholder = '·'.repeat(answer.length);
      $('guess').setAttribute('aria-label', `Your guess: ${answer.length} ${numeric ? 'different digits' : 'letters'}`);
      $('guess').inputMode = numeric ? 'numeric' : 'text';
      $('inputHelp').textContent = numeric ? 'Type your code or use the keypad below.' : `Enter exactly ${answer.length} letters from A–Z. Repeats allowed.`;
    }
    $('bestRecordCount').textContent = bestRecord ? `${bestRecord.guesses} total ${bestRecord.guesses === 1 ? 'guess' : 'guesses'}` : 'No record yet';
    $('bestRecordOwner').textContent = bestRecord ? `${bestRecord.name} · ${bestRecord.playerCount === 1 ? 'Solo' : `${bestRecord.playerCount} players`}` : 'Solve a puzzle to set the first record.';
    $('recordNotice').hidden = !active || !solved() || !recordBroken;
    if (recordBroken && solved()) $('recordNotice').textContent = `New best: ${guesses.length} total ${guesses.length === 1 ? 'guess' : 'guesses'}!`;
    $('setupForm').hidden = inGame;
    for (const id of ['playHeader', 'message']) $(id).hidden = !active;
    $('newGame').hidden = !inGame;
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
    $('answerMeaning').hidden = !active || !finished() || config.type !== 'pinyin';
    if (active && finished() && config.type === 'pinyin') {
      const info = answerInfo(answer);
      $('answerMeaning').textContent = info ? `${answer} · ${info.hanzi} · ${info.meaning}` : answer;
    }
    if (active && finished()) {
      const winner = players[round.actors.at(-1)];
      $('resultKicker').textContent = solved() ? 'CASE CLOSED · NICELY DONE' : round.exhausted ? 'ROUND OVER · NO POINTS LEFT' : 'MYSTERY REVEALED';
      $('resultTitle').textContent = solved() ? (players.length === 1 ? (numeric ? 'You cracked the code!' : config.type === 'pinyin' ? 'You solved the pinyin!' : 'You found the word!') : `${winner} wins!`) : round.exhausted ? 'Everyone is out of points.' : `The ${numeric ? 'code' : 'answer'} was ${answer}.`;
      $('resultDetail').textContent = solved() ? `The ${numeric ? 'code' : 'answer'} was ${answer}. Solved in ${guesses.length} ${guesses.length === 1 ? 'guess' : 'guesses'}. Ready for another?` : 'No winner this time. Start a fresh puzzle with the same players.';
      if (players.length > 1) $('resultDetail').textContent = solved()
        ? `The ${numeric ? 'code' : 'answer'} was ${answer}. ${winner} earned +5 for solving and now has ${round.points[round.winner]} points. Next round adds +5 to everyone’s balance.`
        : `The ${numeric ? 'code' : 'answer'} was ${answer}. No winner this round. Next round adds +5 to everyone's remaining balance.`;
      $('playAgain').textContent = players.length === 1 ? 'Play another puzzle ↗' : 'Play again · same players ↗';
    }
  }
  function newGame() {
    if (!players.length) return;
    startingPoints = players.length > 1 && isValidCode(answer)
      ? nextRoundPoints(ledger().points)
      : Array(players.length).fill(5);
    scoringFrom = 0; recordBroken = false;
    answer = createCode(gameLength); guesses = []; revealed = false;
    $('guess').value = ''; save(); render();
    message(players.length === 1 ? 'A fresh mystery. What’s your first guess?' : `${players[0]} goes first. One shared answer, one guess per turn.`);
  }
  function showView(next, push = true) {
    view = next === 'game' && players.length ? 'game' : 'setup';
    if (view === 'setup' && !numeric) $('puzzleLength').value = '0';
    const url = new URL(location.href); url.searchParams.set('screen', view);
    if (push) history.pushState(null, '', url.href);
    render(); window.scrollTo({top: 0, behavior: 'instant'});
    if (view === 'setup') $('setupTitle').focus({preventScroll: true});
  }
  $('backToDetectives').addEventListener('click', () => showView('setup'));
  $('resumeGame').addEventListener('click', () => showView('game'));
  window.addEventListener('popstate', () => showView(new URL(location.href).searchParams.get('screen'), false));
  function ask(title, detail, action, confirmLabel = 'New puzzle') {
    pendingAction = action; $('confirmTitle').textContent = title; $('confirmDetail').textContent = detail;
    $('confirmAction').textContent = confirmLabel; $('confirmDialog').showModal(); $('cancelAction').focus();
  }
  document.title = config.title + ' · ' + config.tagline;
  $('variantWord').textContent = config.first;
  $('tagline').textContent = config.tagline;
  const legend = document.querySelectorAll('.legend small');
  legend[0].textContent = `Correct ${numeric ? 'digit' : 'letter'}, correct position`;
  legend[1].textContent = `Correct ${numeric ? 'digit' : 'letter'}, different position`;
  document.body.classList.toggle('letter-mode', !numeric);
  $('lengthChoice').hidden = numeric;
  $('variantRules').textContent = numeric
    ? 'Find the secret code: 3 different digits from 0–9. A zero can come first. Play solo or take turns with 2–5 players. Whoever cracks the code wins.'
    : config.type === 'pinyin'
      ? 'Find a Chinese pinyin syllable, such as mian. Use plain letters without tone marks or tone numbers. At the end, see one matching Chinese character and its meaning.'
      : 'Find an English word of 3–8 letters, such as dinosaur. The exact letter count is shown when the puzzle starts.';
  $('variantExample').textContent = numeric
    ? 'If the secret is 123 and you guess 132, you get 1 right spot and 2 wrong spots.'
    : config.type === 'pinyin'
      ? 'If the answer is mian and you guess main, you get 2 right spots and 2 wrong spots.'
      : 'If the answer is dinosaur and you guess diansour, you get 5 right spots and 3 wrong spots.';
  $('variantInputRules').textContent = numeric
    ? 'Use three different digits. Each digit is counted once. Only a full match wins.'
    : 'Choose a letter count or Any length. Letters may repeat, but each occurrence counts only once. Enter exactly the shown number of letters. Guesses can be any A–Z letters, not just dictionary words. Uppercase is accepted. Only a full match wins.';
  const keyboard = $('keyboard'); keyboard.replaceChildren();
  for (const keyValue of (numeric ? '1234567890' : 'abcdefghijklmnopqrstuvwxyz')) {
    const keyButton = node('button', numeric ? keyValue : keyValue.toUpperCase());
    keyButton.type = 'button'; keyButton.dataset.key = keyValue;
    keyButton.dataset[numeric ? 'digit' : 'letter'] = keyValue;
    keyButton.setAttribute('aria-label', `${numeric ? 'Digit' : 'Letter'} ${keyValue.toUpperCase()}`);
    keyboard.append(keyButton);
  }
  const clearKey = node('button', 'Clear', 'edit-key'); clearKey.id = 'clear'; clearKey.type = 'button';
  const backKey = node('button', '⌫', 'edit-key'); backKey.id = 'backspace'; backKey.type = 'button'; backKey.setAttribute('aria-label', 'Delete last character');
  if (numeric) keyboard.insertBefore(clearKey, keyboard.lastElementChild); else keyboard.append(clearKey);
  keyboard.append(backKey);
  $('playerCount').addEventListener('change', () => { rememberNames(); renderNames(); });
  $('playerNames').addEventListener('input', rememberNames);
  $('setupForm').addEventListener('submit', event => {
    event.preventDefault(); rememberNames();
    const count = Number($('playerCount').value);
    if (!Number.isInteger(count) || count < 1 || count > 5) return;
    const chosen = names.slice(0, count).map((name, i) => name.trim() || `Player ${i + 1}`);
    const chosenPlayers = chosen.map((name, i) => chosen.filter(other => other.toLocaleLowerCase() === name.toLocaleLowerCase()).length > 1 ? `${name} (${i + 1})` : name);
    const chosenLength = Number($('puzzleLength').value);
    const start = () => {
      players = chosenPlayers; answer = undefined; guesses = []; revealed = false;
      startingPoints = []; scoringFrom = 0; recordBroken = false; gameLength = chosenLength;
      newGame(); showView('game');
    };
    if (players.length) ask('Start a new game?', 'This replaces the saved game and starts a fresh competition at 5 points each. Best records are kept.', start, 'Start new game');
    else start();
  });
  $('guessForm').addEventListener('submit', event => {
    event.preventDefault(); if (!players.length || finished()) return;
    const guess = numeric ? $('guess').value : $('guess').value.trim().toLowerCase();
    if (guess.length !== answer.length) { message(`Enter exactly ${answer.length} ${numeric ? 'digits from 0–9' : 'letters'}. Your turn continues.`, true); $('guess').focus(); return; }
    if (!isValidCode(guess)) { message(numeric ? 'Use three different digits—no repeats. Your turn continues.' : 'Use plain letters A–Z, without tone marks or numbers. Repeated letters are allowed. Your turn continues.', true); $('guess').focus(); return; }
    if (guesses.includes(guess)) { message('You already tried that guess. Try a new one; your turn continues.', true); $('guess').focus(); return; }
    const player = players[turn()];
    guesses.push(guess); recordBroken = updateRecord(); save(); render();
    const score = scoreGuess(answer, guess);
    message(solved() ? `${player} cracked ${answer}!` : ledger().exhausted ? `Everyone is out of points. The ${numeric ? 'code' : 'answer'} was ${answer}.` : `${guess}: ${score.exact} right ${score.exact === 1 ? 'spot' : 'spots'}, ${score.misplaced} wrong ${score.misplaced === 1 ? 'spot' : 'spots'}. ${players.length === 1 ? 'What’s your next theory?' : `Next: ${players[turn()]} (${ledger().points[turn()]} points).`}`);
    $('guess').value = ''; $('historyWrap').scrollTop = 0;
    $('guess').blur();
    if (finished()) $('resultTitle').focus();
    (finished() ? $('result') : $('latestFeedback')).scrollIntoView({block: finished() ? 'center' : 'end', behavior: 'instant'});
  });
  document.querySelectorAll('[data-key]').forEach(button => button.addEventListener('click', () => {
    if (players.length && !finished() && $('guess').value.length < answer.length) { $('guess').value += button.dataset.key; message('Follow the clues. What’s your next guess?'); }
  }));
  $('clear').addEventListener('click', () => { $('guess').value = ''; message('Try a different theory.'); });
  $('backspace').addEventListener('click', () => { $('guess').value = $('guess').value.slice(0, -1); message('Follow the clues. What’s your next guess?'); });
  $('guess').addEventListener('input', () => { $('guess').value = $('guess').value.toLowerCase(); message('Follow the clues. What’s your next guess?'); });
  $('newGame').addEventListener('click', () => {
    if (!finished() && guesses.length) ask('Start a new puzzle?', 'Your current answer and case notes will be replaced. Players stay the same.', newGame);
    else newGame();
  });
  $('playAgain').addEventListener('click', newGame);
  $('reveal').addEventListener('click', () => ask('Reveal the answer?', 'This ends the current puzzle. No player wins if the answer is revealed.', () => {
    revealed = true; save(); render(); message('Mystery revealed. A new puzzle is waiting.'); $('resultTitle').focus();
  }, 'Reveal answer'));
  $('cancelAction').addEventListener('click', () => { pendingAction = null; $('confirmDialog').close(); });
  $('confirmDialog').addEventListener('cancel', () => { pendingAction = null; });
  $('confirmAction').addEventListener('click', () => {
    const action = pendingAction; pendingAction = null; $('confirmDialog').close(); action?.();
  });
  $('puzzleLength').append(new Option('Any length', '0'));
  lengths.forEach(length => $('puzzleLength').append(new Option(`${length} letters`, String(length))));
  $('puzzleLength').value = String(config.defaultLength);
  $('puzzleLength').addEventListener('change', rememberNames);
  try {
    const preferences = JSON.parse(localStorage.getItem(preferencesKey) || 'null');
    if (preferences && Number.isInteger(preferences.count) && preferences.count >= 1 && preferences.count <= 5) $('playerCount').value = String(preferences.count);
    if (preferences?.lengths && typeof preferences.lengths === 'object') savedLengths = preferences.lengths;
    if (Array.isArray(preferences?.names)) preferences.names.slice(0, 5).forEach((name, i) => { if (typeof name === 'string') names[i] = name.slice(0, 20); });
  } catch (_) {}
  try {
    const record = JSON.parse(localStorage.getItem(recordKey) || 'null');
    if (record && Number.isInteger(record.guesses) && record.guesses >= 1 && record.guesses <= 100000
      && Number.isInteger(record.playerCount) && record.playerCount >= 1 && record.playerCount <= 5
      && typeof record.name === 'string' && record.name.length > 0 && record.name.length <= 40) bestRecord = record;
  } catch (_) {}
  let restored = false;
  try {
    const state = JSON.parse(localStorage.getItem(key) || 'null');
    const savedPlayers = state?.players ?? ['Player 1'];
    if (state && isAnswer(state.answer) && Array.isArray(state.guesses) && state.guesses.every(isValidCode)
      && new Set(state.guesses).size === state.guesses.length && typeof state.revealed === 'boolean'
      && !state.guesses.slice(0, -1).includes(state.answer) && Array.isArray(savedPlayers) && savedPlayers.length >= 1 && savedPlayers.length <= 5
      && savedPlayers.every(name => typeof name === 'string' && name.trim().length > 0 && name.length <= 40)) {
      const balances = state.pointsVersion === 1 ? state.startingPoints : Array(savedPlayers.length).fill(5);
      // Older saves keep all their clues; charging starts with their next guess.
      const from = state.pointsVersion === 1 ? state.scoringFrom : state.guesses.length;
      evaluateRound({answer: state.answer, guesses: state.guesses, playerCount: savedPlayers.length, startingPoints: balances, scoringFrom: from});
      answer = state.answer; guesses = state.guesses; revealed = state.revealed; players = savedPlayers;
      startingPoints = balances; scoringFrom = from; restored = true;
      gameLength = state.selectedLength === 0 || lengths.includes(state.selectedLength) ? state.selectedLength : answer.length;
      $('playerCount').value = String(players.length);
      players.forEach((name, i) => { if (!names[i]) names[i] = name.slice(0, 20); });
    }
  } catch (_) {}
  if (!restored) view = 'setup';
  if (restored) recordBroken = updateRecord();
  renderNames(); render();
  if (restored) { save(); message(finished() ? 'Your last case is saved. Play another whenever you’re ready.' : `Welcome back. ${players.length === 1 ? 'Your turn.' : `${players[turn()]}’s turn.`} Your clues are saved.`); }
})();
