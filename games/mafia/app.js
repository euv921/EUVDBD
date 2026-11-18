(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const host = $('host');
  let gameLanguage = 'en';
  const normalizeLanguage = value => ['zh-CN', 'bilingual'].includes(value) ? value : 'en';
  try {
    const legacy = localStorage.getItem('mafia-language');
    gameLanguage = normalizeLanguage(localStorage.getItem('mafia-game-language') ?? legacy);
  } catch (_) {}
  function translate(key, values, locale) {
    const text = locale === 'zh-CN' ? window.MafiaTranslations[key] || key : key;
    return text.replace(/\{(\w+)\}/g, (_, name) => values[name]?.speechKey ? translate(values[name].speechKey, values[name].speechValues, locale) : String(values[name] ?? `{${name}}`));
  }
  const t = (key, values = {}) => translate(key, values, 'en');
  const g = (key, values = {}) => ({speechKey: key, speechValues: values});
  const gameLocales = () => gameLanguage === 'bilingual' ? ['en', 'zh-CN'] : [gameLanguage];
  const gameText = (key, values = {}) => gameLocales().map(locale => translate(key, values, locale)).join(' / ');
  const roleDisplay = role => gameLocales().map(locale => translate(role, {}, locale)).join(' / ');
  const promptTime = seconds => seconds * (gameLanguage === 'bilingual' && $('voice').checked ? 2 : 1);
  function applyLanguage() {
    document.documentElement.lang = 'en';
    document.title = 'Mafia · The Night Host';
    $('gameLanguage').value = gameLanguage;
    document.querySelectorAll('[data-i18n]').forEach(node => { node.textContent = t(node.dataset.i18n); });
    document.querySelectorAll('[data-i18n-aria]').forEach(node => { node.setAttribute('aria-label', t(node.dataset.i18nAria)); });
    updateNames();
  }
  const roleHelp = {
    Mafia: 'At night, open your eyes when called and tap one other living player to attack. Keep your role secret.',
    Doctor: 'At night, open your eyes when called and tap any living player to protect. You may protect yourself.',
    Villager: 'Keep your eyes closed all night. In the morning, discuss who you suspect and help vote out the Mafia.'
  };
  let players = [], phase = 'setup', night = 0, revealIndex = 0;
  let attack = null, protection = null, secondsPerChoice = 20;
  let timeouts = [], interval = null, paused = false, resumeStage = null;
  let confirmAction = null, audio = null, musicGain = null;
  let previewUntil = 0, previewTimer = null;
  let musicSource = null, playingTrack = null;
  const musicBuffers = new Map();
  let speechTimer = null, speechToken = 0, speechPending = 0, speechUntil = 0;
  const chimeOscillators = new Set();

  function el(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function button(label, action, style = 'primary') {
    const node = el('button', label, style);
    node.type = 'button';
    node.addEventListener('click', action);
    return node;
  }
  function say(message) {
    stopSpeech();
    if (!$('voice').checked || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return;
    const token = speechToken;
    const messages = Array.isArray(message) ? message : [message];
    const parts = messages.flatMap(part => gameLocales().map(locale => ({locale, text: translate(part.speechKey, part.speechValues, locale)})));
    const voices = speechSynthesis.getVoices();
    speechPending = parts.length;
    // Guard automatic transitions until both languages finish. The deadline
    // prevents a browser with missing speech events from stalling the game.
    speechUntil = performance.now() + Math.max(30000, parts.reduce((ms, part) => ms + Math.max(5000, part.text.length / (part.locale === 'zh-CN' ? 3.5 : 12) * 1000 + 3000), 0));
    const utterances = parts.map(({locale, text}) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = locale === 'zh-CN' ? 'zh-CN' : 'en-US';
      utterance.rate = 0.9;
      const voice = locale === 'zh-CN'
        ? voices.find(v => /^zh[-_](CN|SG)/i.test(v.lang)) || voices.find(v => /^zh/i.test(v.lang))
        : voices.find(v => /^en[-_]US/i.test(v.lang)) || voices.find(v => /^en/i.test(v.lang));
      if (locale === 'zh-CN' && voices.length && !voice) $('audioNote').textContent = t('No Mandarin voice was found. Your browser will try Chinese speech; if it is silent, install a Mandarin voice in device settings.');
      if (voice) utterance.voice = voice;
      let finished = false;
      const finish = () => { if (!finished && token === speechToken) { finished = true; speechPending = Math.max(0, speechPending - 1); } };
      utterance.onend = finish;
      utterance.onerror = event => {
        finish();
        if (token === speechToken && !['interrupted', 'canceled'].includes(event.error)) $('audioNote').textContent = t('Voice could not play. Follow the written host instructions, or tap Test voice.');
      };
      return utterance;
    });
    const speak = () => {
      if (token !== speechToken) return;
      // The browser queues these in order: English finishes before Chinese.
      utterances.forEach(utterance => {
        try { speechSynthesis.speak(utterance); } catch (_) {
          utterance.onerror({error: 'unavailable'});
        }
      });
    };
    if (navigator.userActivation?.isActive) speak();
    else speechTimer = setTimeout(speak, 80);
  }
  function stopSpeech() {
    speechToken++; speechPending = 0; speechUntil = 0;
    clearTimeout(speechTimer);
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  }
  function unlockAudio() {
    if (!$('sound').checked) return Promise.resolve(false);
    try {
      if (!audio) {
        const Context = window.AudioContext || window.webkitAudioContext;
        if (!Context) { $('audioNote').textContent = 'Night sounds are unavailable in this browser.'; return Promise.resolve(false); }
        audio = new Context();
        musicGain = audio.createGain();
        musicGain.gain.value = 0;
        musicGain.connect(audio.destination);

      }
      return audio.resume().then(() => {
        if (audio.state !== 'running') $('audioNote').textContent = 'Sound is paused by the browser. Tap Test music again.';
        return audio.state === 'running';
      }).catch(() => {
        $('audioNote').textContent = 'Sound could not start. Tap Test music and check your device volume.';
        return false;
      });
    } catch (_) {
      $('audioNote').textContent = t('Night sounds are unavailable in this browser.');
      return Promise.resolve(false);
    }
  }
  function isNight() {
    return ['night-intro', 'mafia', 'mafia-close', 'doctor', 'doctor-close'].includes(phase);
  }
  function ensureMusic() {
    const track = $('musicTrack').value;
    if (musicSource && playingTrack === track) return;
    if (musicSource) { musicSource.stop(); musicSource.disconnect(); }
    if (!musicBuffers.has(track)) musicBuffers.set(track, window.MafiaMusic.render(audio, track));
    musicSource = audio.createBufferSource();
    musicSource.buffer = musicBuffers.get(track);
    musicSource.loop = true;
    musicSource.connect(musicGain);
    musicSource.start();
    playingTrack = track;
  }
  function ambience() {
    if (!audio || !musicGain) return;
    const t = audio.currentTime;
    musicGain.gain.cancelScheduledValues(t);
    const playing = $('sound').checked && ((isNight() && !paused) || performance.now() < previewUntil);
    if (playing) ensureMusic();
    musicGain.gain.setTargetAtTime(playing ? 0.4 * Number($('nightVolume').value) / 100 : 0, t, 0.15);
  }
  function chime() {
    if (!audio || !$('sound').checked || Number($('nightVolume').value) === 0) return;
    try {
      [392, 523.25, 659.25].forEach((frequency, i) => {
        const oscillator = audio.createOscillator(), gain = audio.createGain();
        const start = audio.currentTime + i * 0.12;
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(Math.max(0.0001, 0.12 * Number($('nightVolume').value) / 100), start + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.6);
        oscillator.connect(gain); gain.connect(audio.destination);
        chimeOscillators.add(oscillator);
        oscillator.onended = () => { chimeOscillators.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
        oscillator.start(start); oscillator.stop(start + 0.65);
      });
    } catch (_) { /* Silent mode remains fully playable. */ }
  }
  function stopPreview() { clearTimeout(previewTimer); previewTimer = null; previewUntil = 0; }
  function stopChime() {
    chimeOscillators.forEach(oscillator => { try { oscillator.stop(); } catch (_) {} });
    chimeOscillators.clear();
  }
  function clearTimers() {
    timeouts.forEach(clearTimeout); timeouts = [];
    clearInterval(interval); interval = null;
  }
  function later(fn, ms) { timeouts.push(setTimeout(fn, ms)); }
  function startStage(nextPhase, resume) {
    clearTimers(); stopSpeech();
    phase = nextPhase; resumeStage = resume;
    host.replaceChildren();
    document.body.classList.toggle('daytime', ['morning', 'vote', 'after-vote', 'end'].includes(phase));
    $('pause').hidden = !isNight();
    $('roundInfo').textContent = phase === 'reveal' || phase === 'ready' ? t('SECRET ROLES') : (isNight() ? gameText('NIGHT {night}', {night}) : t('DAY {night}', {night}));
    $('aliveInfo').textContent = t('{alive} of {count} in town', {alive: players.filter(p => p.alive).length, count: players.length});
    updateSeats(); ambience();
  }
  function displayText(tag, value, className) {
    if (!Array.isArray(value) && !value?.speechKey) return el(tag, value, className);
    const node = el(tag, undefined, className);
    const messages = Array.isArray(value) ? value : [value];
    messages.forEach(message => gameLocales().forEach(locale => {
      if (node.childNodes.length) node.append(document.createElement('br'));
      const line = el('span', translate(message.speechKey, message.speechValues, locale)); line.lang = locale;
      node.append(line);
    }));
    return node;
  }
  function panel(symbol, kicker, title, description) {
    host.append(el('div', symbol, 'symbol'));
    if (!isNight()) host.append(displayText('div', kicker, 'eyebrow'));
    host.append(displayText('h2', title));
    if (description && !isNight()) host.append(displayText('p', description));
  }
  function actions(...buttons) {
    const row = el('div', undefined, 'actions'); row.append(...buttons); host.append(row);
  }
  function countdown(seconds, done) {
    const clock = el('span', undefined, 'clock');
    clock.setAttribute('role', 'timer'); clock.setAttribute('aria-label', t('Time remaining'));
    host.append(clock);
    const deadline = performance.now() + seconds * 1000;
    function tick() {
      const left = Math.max(0, Math.ceil((deadline - performance.now()) / 1000));
      clock.textContent = gameText('{seconds} seconds', {seconds: left});
      if (left === 0) {
        if (speechPending > 0 && performance.now() < speechUntil) { clock.textContent = gameText('Finishing narration…'); return; }
        clearInterval(interval); interval = null; done();
      }
    }
    tick(); interval = setInterval(tick, 200);
  }
  function updateNames() {
    const old = Array.from($('names').querySelectorAll('input')).map(n => n.value);
    $('names').replaceChildren();
    for (let i = 0; i < Number($('playerCount').value); i++) {
      const label = el('label', t('Seat {seat}', {seat: i + 1})), input = el('input');
      input.type = 'text'; input.maxLength = 24; input.autocomplete = 'off';
      input.name = `player-${i + 1}`; input.placeholder = t('Player {seat}', {seat: i + 1});
      input.setAttribute('aria-label', t('Seat {seat} name', {seat: i + 1})); input.value = old[i] || '';
      label.append(input); $('names').append(label);
    }
    const villagers = Number($('playerCount').value) - 2;
    $('villagerCount').textContent = villagers === 1 ? t('1 Villager') : t('{count} Villagers', {count: villagers});
    $('modeNote').textContent = villagers === 1
      ? t('One night only. Someone dies: Mafia wins. Nobody dies: Villager wins. No voting.')
      : t('Discuss and vote during the day. Play until one side wins.');
  }
  let dealSerial = 0, drawSerial = 0, roleEntropy = 0;
  function mixWord(value) {
    value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
    value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
    return (value ^ (value >>> 15)) >>> 0;
  }
  function randomBelow(max) {
    const range = 0x100000000, limit = range - range % max;
    const data = new Uint32Array(1);
    do {
      crypto.getRandomValues(data);
      // An independent changing mask preserves uniform crypto output, while
      // varying deals even if a browser repeatedly supplies the same word.
      const mask = mixWord(roleEntropy + Math.imul(++drawSerial, 0x9e3779b9));
      data[0] = (data[0] ^ mask) >>> 0;
    } while (data[0] >= limit);
    return data[0] % max;
  }
  function shuffledRoles(count) {
    const now = Date.now();
    roleEntropy = mixWord((now >>> 0) ^ Math.floor(now / 0x100000000) ^ Math.floor(performance.now() * 1000) ^ Math.imul(++dealSerial, 0x9e3779b9));
    drawSerial = 0;
    const roles = ['Mafia', 'Doctor', ...Array(count - 2).fill('Villager')];
    for (let i = roles.length - 1; i > 0; i--) {
      const j = randomBelow(i + 1); [roles[i], roles[j]] = [roles[j], roles[i]];
    }
    return roles;
  }
  function deal() {
    clearTimers(); stopSpeech(); stopChime(); stopPreview();
    paused = false; confirmAction = null;
    unlockAudio();
    const roles = shuffledRoles(Number($('playerCount').value));
    const nameInputs = Array.from($('names').querySelectorAll('input'));
    const raw = nameInputs.map((input, i) => input.value.trim() || t('Player {seat}', {seat: i + 1}));
    players = raw.map((name, id) => ({id, name: raw.filter(n => n.toLowerCase() === name.toLowerCase()).length > 1 ? t('{name} (seat {seat})', {name, seat: id + 1}) : name, role: roles[id], alive: true, defaultName: !nameInputs[id].value.trim()}));
    secondsPerChoice = Number($('choiceTime').value);
    night = 0; revealIndex = 0; attack = null; protection = null;
    $('setup').hidden = true; $('table').hidden = false; $('newGame').hidden = false;
    $('seats').replaceChildren(host);
    players.forEach(player => {
      const seat = button('', () => choose(player.id), 'seat');
      seat.dataset.player = String(player.id);
      seat.style.gridRow = String(player.id < 2 ? 1 : player.id < 4 ? 3 : 4 + Math.floor((player.id - 4) / 2));
      seat.style.gridColumn = String(player.id % 2 + 1);
      const identity = el('span', undefined, 'identity');
      identity.append(el('span', player.name, 'name'), el('span', t('In town'), 'state'));
      seat.append(el('span', String(player.id + 1).padStart(2, '0'), 'number'), identity);
      $('seats').append(seat);
    });
    showHandoff();
  }
  function updateSeats() {
    document.querySelectorAll('.seat').forEach(seat => {
      const p = players[Number(seat.dataset.player)];
      const canChoose = !paused && p.alive && ['mafia', 'doctor', 'vote'].includes(phase);
      seat.disabled = !canChoose;
      seat.classList.toggle('out', !p.alive); seat.classList.toggle('target', canChoose);
      seat.querySelector('.state').textContent = p.alive ? canChoose ? t('Tap to choose') : t('In town') : t('Out of the game');
      seat.setAttribute('aria-label', t('{name}, seat {seat}, {state}', {name: p.name, seat: p.id + 1, state: p.alive ? t('In town') : t('Out of the game')}));
    });
  }
  function showHandoff() {
    startStage('reveal', null);
    const player = players[revealIndex];
    const name = player.defaultName ? g('Player {seat}', {seat: player.id + 1}) : player.name;
    panel('✉', g('PRIVATE ROLE · {index} / {count}', {index: revealIndex + 1, count: players.length}), g('Pass to {name}', {name}), g('Everyone else, look away. Make sure only this player can see the screen.'));
    actions(button(t('Reveal my role'), showRole));
    host.append(displayText('p', g('Roles are never read aloud.'), 'privacy'));
  }
  function showRole() {
    startStage('reveal', null);
    const p = players[revealIndex];
    panel(p.role === 'Mafia' ? '♠' : p.role === 'Doctor' ? '✚' : '⌂', t('FOR YOUR EYES ONLY'), p.name);
    const instructions = players.length === 3 ? {
      Mafia: 'At night, tap one other living player to attack. If anyone dies, you win. The game ends after one night, with no discussion or voting.',
      Doctor: 'At night, tap any living player to save, including yourself. If nobody dies, the Mafia loses. The game ends after one night, with no discussion or voting.',
      Villager: 'Keep your eyes closed all night. If nobody dies, you win and the Mafia loses. The game ends at dawn. There is no discussion or voting round.'
    }[p.role] : roleHelp[p.role];
    const roleTitle = el('div', undefined, 'private-role');
    const explanations = [];
    gameLocales().forEach((locale, index) => {
      if (index) roleTitle.append(document.createTextNode(' / '));
      const name = el('span', translate(p.role, {}, locale)); name.lang = locale;
      const help = el('p', translate(instructions, {}, locale)); help.lang = locale;
      roleTitle.append(name); explanations.push(help);
    });
    host.append(roleTitle, ...explanations);
    actions(button(t('Hide & continue'), () => {
      revealIndex++;
      if (revealIndex < players.length) showHandoff(); else ready();
    }));
  }
  function ready() {
    startStage('ready', null);
    panel('☾', g('THE TABLE IS SET'), g('Let the town fall asleep.'), players.length === 3 ? g('Place the tablet between you. One night decides the winner, with no voting. Turn up the volume and listen to the host.') : g('Place the tablet between you. Each corner is a player’s seat. Turn up the volume and listen to the host.'));
    actions(button(t('Begin the first night'), startNight));
  }
  function startNight() {
    unlockAudio(); night++; attack = null; protection = null;
    nightIntro(); chime();
  }
  function nightIntro() {
    startStage('night-intro', nightIntro);
    panel('☾', g('NIGHT {night}', {night}), g('Everyone, close your eyes.'), g('Listen to the host.'));
    say(g('It is night. Everyone, close your eyes.'));
    countdown(promptTime(9), mafiaTurn);
  }
  function mafiaTurn() {
    startStage('mafia', mafiaTurn);
    panel('♠', g('NIGHT {night} · SECRET CHOICE', {night}), g('Mafia, open your eyes.'), [g('Tap one other living player’s button to attack.'), g('Your choice stays secret.')]);
    say([g('Mafia, open your eyes.'), g('Tap the player you want to attack.')]);
    countdown(secondsPerChoice + promptTime(8), () => closeMafia());
  }
  function closeMafia() {
    startStage('mafia-close', closeMafia);
    panel('☾', g('NIGHT {night}', {night}), g('Mafia, close your eyes.'), [g('Everyone stays quiet.'), g('The next role is about to wake up.')]);
    say(g('Mafia, close your eyes.'));
    countdown(promptTime(5), doctorTurn);
  }
  function doctorTurn() {
    startStage('doctor', doctorTurn);
    panel('✚', g('NIGHT {night} · SECRET CHOICE', {night}), g('Doctor, open your eyes.'), [g('Tap a living player’s button to protect them.'), g('You may choose yourself.')]);
    say([g('Doctor, open your eyes.'), g('Tap the player you want to save.'), g('You may save yourself.')]);
    countdown(secondsPerChoice + promptTime(9), () => closeDoctor());
  }
  function closeDoctor() {
    startStage('doctor-close', closeDoctor);
    panel('☾', g('NIGHT {night}', {night}), g('Doctor, close your eyes.'), g('The town will wake up together.'));
    say([g('Doctor, close your eyes.'), g('Everyone, wait for morning.')]);
    countdown(promptTime(6), resolveNight);
  }
  function choose(id) {
    if (paused || !players[id]?.alive) return;
    if (phase === 'mafia') {
      if (players[id].role === 'Mafia') return;
      attack = id; closeMafia();
    } else if (phase === 'doctor') {
      // Still call the Doctor every night, without revealing whether they survived.
      if (!players.some(p => p.alive && p.role === 'Doctor')) return;
      protection = id; closeDoctor();
    } else if (phase === 'vote') {
      ask(t('Vote out {name}?', {name: players[id].name}), t('Confirm only after the group has agreed. This player will be out of the game.'), () => eliminate(id));
    }
  }
  function resolveNight() {
    let victim = null;
    if (attack !== null && attack !== protection) {
      players[attack].alive = false;
      victim = players[attack];
    }
    // Discard both secret choices before the screen is shared again.
    attack = null; protection = null;
    morning(victim);
  }
  function winner() {
    if (players.length === 3) return players.some(p => !p.alive) ? 'Mafia' : 'Villager';
    const mafia = players.filter(p => p.alive && p.role === 'Mafia').length;
    const town = players.filter(p => p.alive && p.role !== 'Mafia').length;
    return mafia === 0 ? 'Town' : mafia >= town ? 'Mafia' : null;
  }
  function victorySentence(won) {
    return won === 'Town' ? 'The town wins.' : won === 'Villager' ? 'The Villager wins.' : 'The Mafia wins.';
  }
  function playerName(player) {
    return player.defaultName ? g('Player {seat}', {seat: player.id + 1}) : player.name;
  }
  function morning(victim) {
    const result = victim === null ? g('Nobody died last night.') : g('{name} died.', {name: playerName(victim)});
    startStage('morning', null);
    chime();
    const won = winner();
    panel('☀', g('MORNING · DAY {night}', {night}), g('Everyone, open your eyes.'));
    host.append(displayText('p', result, 'morning-result'));
    const announcements = [g('Everyone, open your eyes.'), result];
    if (won) {
      say([...announcements, g(victorySentence(won))]);
      showWinner(won);
      return;
    }
    say([...announcements, g('Discuss who you suspect.'), g('When the group is ready, choose someone to vote out, or skip the vote.')]);
    actions(button(t('Discuss & vote'), openVote), button(t('Skip vote · next night'), () => ask(t('Skip the daytime vote?'), t('No one will be voted out. Everyone will go to sleep for the next night.'), startNight), 'secondary'));
    host.append(el('p', t('Out players stay quiet and keep their role secret.'), 'privacy'));
  }
  function openVote() {
    startStage('vote', null);
    panel('☀', t('DAY {night} · GROUP DECISION', {night}), t('Who do you suspect?'), t('Discuss together. When you agree, tap one living player to vote them out. The next screen asks you to confirm.'));
    actions(button(t('Skip vote · next night'), () => ask(t('Skip the daytime vote?'), t('No one will be voted out. Continue to the next night?'), startNight), 'secondary'));
  }
  function eliminate(id) {
    if (phase !== 'vote' || !players[id].alive) return;
    players[id].alive = false;
    startStage('after-vote', null);
    const won = winner();
    panel('⌂', g('DAY {night}', {night}), g('{name} is voted out.', {name: playerName(players[id])}), g('Their role stays secret until the game ends.'));
    if (won) {
      say([g('{name} has been voted out.', {name: playerName(players[id])}), g(victorySentence(won))]); showWinner(won);
    } else {
      say(g('{name} has been voted out. Keep your role secret. The town will sleep again when everyone is ready.', {name: players[id].name}));
      actions(button(t('Begin the next night'), startNight));
    }
  }
  function showWinner(won) {
    phase = 'end'; clearTimers(); resumeStage = null;
    $('roundInfo').textContent = t('GAME OVER'); $('pause').hidden = true;
    updateSeats(); ambience();
    const winnerKey = victorySentence(won);
    const title = el('h2', undefined, 'winner-title');
    gameLocales().forEach((locale, index) => {
      if (index) title.append(document.createElement('br'));
      const line = el('span', translate(winnerKey, {}, locale)); line.lang = locale;
      title.append(line);
    });
    host.append(title);
    const list = el('ul', undefined, 'role-list');
    players.forEach(p => {
      const row = el('li'); row.append(el('span', p.name), el('strong', roleDisplay(p.role))); list.append(row);
    });
    host.append(list);
    actions(button(t('Play again · same settings'), deal), button(t('Change settings'), reset, 'secondary'));
    host.append(el('p', t('Play again keeps your players, names, and options, and randomly deals fresh secret roles. Random roles can repeat.'), 'privacy'));
  }
  function ask(title, text, action) {
    confirmAction = action;
    $('confirmTitle').textContent = title; $('confirmText').textContent = text;
    $('confirmDialog').showModal();
  }
  function pauseNight() {
    if (!isNight() || paused) return;
    paused = true; clearTimers(); stopSpeech(); stopChime(); stopPreview(); ambience(); updateSeats();
    $('pauseDialog').showModal();
  }
  function resumeNight() {
    if (!paused) return;
    $('pauseDialog').close(); paused = false; unlockAudio();
    if (resumeStage) resumeStage();
  }
  function reset() {
    clearTimers(); stopSpeech(); stopChime(); stopPreview(); phase = 'setup'; paused = false; resumeStage = null;
    attack = null; protection = null; players = []; confirmAction = null;
    if ($('pauseDialog').open) $('pauseDialog').close();
    if ($('confirmDialog').open) $('confirmDialog').close();
    ambience(); host.replaceChildren(); $('seats').replaceChildren(host);
    $('table').hidden = true; $('setup').hidden = false; $('newGame').hidden = true;
    document.body.classList.remove('daytime');
  }
  $('gameLanguage').addEventListener('change', () => {
    gameLanguage = normalizeLanguage($('gameLanguage').value);
    stopSpeech(); $('audioNote').textContent = '';
    try { localStorage.setItem('mafia-game-language', gameLanguage); } catch (_) {}
  });
  $('playerCount').addEventListener('change', updateNames);
  $('setupForm').addEventListener('submit', event => { event.preventDefault(); deal(); });
  $('newGame').addEventListener('click', () => {
    if (isNight()) pauseNight();
    ask(t('Start a new game?'), t('This ends the current game and discards all secret roles.'), reset);
  });
  $('cancelConfirm').addEventListener('click', () => { confirmAction = null; $('confirmDialog').close(); });
  $('confirmDialog').addEventListener('cancel', () => { confirmAction = null; });
  $('acceptConfirm').addEventListener('click', () => {
    const action = confirmAction; confirmAction = null; $('confirmDialog').close(); if (action) action();
  });
  $('pause').addEventListener('click', pauseNight);
  $('resume').addEventListener('click', resumeNight);
  $('pauseDialog').addEventListener('cancel', event => event.preventDefault());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && phase === 'reveal') showHandoff();
    if (document.hidden) pauseNight();
  });
  $('voice').addEventListener('change', () => { if (!$('voice').checked) stopSpeech(); });
  $('sound').addEventListener('change', () => {
    if ($('sound').checked) unlockAudio().then(ambience);
    else { stopPreview(); stopChime(); }
    ambience();
  });
  $('musicTrack').addEventListener('change', () => {
    ambience();
    try { localStorage.setItem('mafia-music-track', $('musicTrack').value); } catch (_) {}
  });
  try {
    const savedTrack = localStorage.getItem('mafia-music-track');
    if (window.MafiaMusic.tracks[savedTrack]) $('musicTrack').value = savedTrack;
  } catch (_) {}
  $('nightVolume').addEventListener('input', () => {
    $('nightVolumeValue').textContent = `${$('nightVolume').value}%`;
    if (Number($('nightVolume').value) === 0) stopChime();
    ambience();
  });
  $('testSound').addEventListener('click', async () => {
    if (Number($('nightVolume').value) === 0) {
      $('audioNote').textContent = 'Night volume is 0%. Raise it to hear the test.'; return;
    }
    $('sound').checked = true;
    if (!await unlockAudio()) return;
    stopPreview(); previewUntil = performance.now() + 6000;
    ambience();
    $('audioNote').textContent = `Playing a 6-second preview of ${window.MafiaMusic.tracks[$('musicTrack').value].title}. Adjust Night volume if needed.`;
    previewTimer = setTimeout(() => { previewUntil = 0; ambience(); previewTimer = null; }, 6000);
  });
  $('testVoice').addEventListener('click', () => {
    unlockAudio();
    if (!('speechSynthesis' in window)) {
      $('audioNote').textContent = t('Spoken voices are unavailable here. All host instructions are shown on screen.');
      return;
    }
    $('voice').checked = true;
    $('audioNote').textContent = t('You should hear the host. If not, raise your device volume. Written instructions always remain available.');
    // Never interrupt an active role prompt or announce a private role.
    if (isNight() && !paused) {
      $('audioNote').textContent = t('Pause the night before testing the voice.');
      return;
    }
    say(g('Welcome to Mafia. I will be your host. When night falls, close your eyes and listen carefully.'));
  });
  if (!('speechSynthesis' in window)) {
    $('voice').checked = false; $('voice').disabled = true;
    $('audioNote').textContent = t('Spoken voices are unavailable. Follow the written host instructions.');
  }
  applyLanguage();
})();
