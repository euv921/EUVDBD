(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const host = $('host');
  const roleHelp = {
    Mafia: 'At night, open your eyes when called and tap one other living player to attack. Keep your role secret.',
    Doctor: 'At night, open your eyes when called and tap any living player to protect. You may protect yourself.',
    Villager: 'Keep your eyes closed all night. In the morning, discuss who you suspect and help vote out the Mafia.'
  };
  let players = [], phase = 'setup', night = 0, revealIndex = 0;
  let attack = null, protection = null, secondsPerChoice = 20;
  let timeouts = [], interval = null, paused = false, resumeStage = null;
  let confirmAction = null, audio = null, droneGain = null;
  let speechTimer = null, speechToken = 0;
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
  function say(text) {
    stopSpeech();
    if (!$('voice').checked || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return;
    const token = speechToken;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.9;
    const voices = speechSynthesis.getVoices();
    const voice = voices.find(v => /^en[-_]US/i.test(v.lang)) || voices.find(v => /^en/i.test(v.lang));
    if (voice) utterance.voice = voice;
    utterance.onerror = event => {
      if (token === speechToken && !['interrupted', 'canceled'].includes(event.error)) {
        $('audioNote').textContent = 'Voice could not play. Follow the written host instructions, or tap Test voice.';
      }
    };
    const speak = () => {
      if (token !== speechToken) return;
      try { speechSynthesis.speak(utterance); } catch (_) {
        $('audioNote').textContent = 'Voice could not play. Follow the written host instructions.';
      }
    };
    // The first utterance must stay inside a tap on browsers that gate audio.
    if (navigator.userActivation?.isActive) speak();
    else speechTimer = setTimeout(speak, 80);
  }
  function stopSpeech() {
    speechToken++;
    clearTimeout(speechTimer);
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  }
  function unlockAudio() {
    if (!$('sound').checked) return;
    try {
      if (!audio) {
        const Context = window.AudioContext || window.webkitAudioContext;
        if (!Context) return;
        audio = new Context();
        droneGain = audio.createGain();
        droneGain.gain.value = 0;
        droneGain.connect(audio.destination);
        [110, 164.81].forEach(frequency => {
          const oscillator = audio.createOscillator();
          oscillator.type = 'sine';
          oscillator.frequency.value = frequency;
          oscillator.connect(droneGain);
          oscillator.start();
        });
      }
      audio.resume().catch(() => {
        $('audioNote').textContent = 'Tap Night sounds to enable audio. Written instructions still work.';
      });
    } catch (_) {
      $('audioNote').textContent = 'Night sounds are unavailable in this browser.';
    }
  }
  function isNight() {
    return ['night-intro', 'mafia', 'mafia-close', 'doctor', 'doctor-close'].includes(phase);
  }
  function ambience() {
    if (!audio || !droneGain) return;
    const t = audio.currentTime;
    droneGain.gain.cancelScheduledValues(t);
    droneGain.gain.setTargetAtTime($('sound').checked && isNight() && !paused ? 0.025 : 0, t, 0.25);
  }
  function chime() {
    if (!audio || !$('sound').checked) return;
    try {
      [392, 523.25, 659.25].forEach((frequency, i) => {
        const oscillator = audio.createOscillator(), gain = audio.createGain();
        const start = audio.currentTime + i * 0.12;
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.045, start + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.6);
        oscillator.connect(gain); gain.connect(audio.destination);
        chimeOscillators.add(oscillator);
        oscillator.onended = () => { chimeOscillators.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
        oscillator.start(start); oscillator.stop(start + 0.65);
      });
    } catch (_) { /* Silent mode remains fully playable. */ }
  }
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
    $('roundInfo').textContent = phase === 'reveal' || phase === 'ready' ? 'SECRET ROLES' : `${isNight() ? 'NIGHT' : 'DAY'} ${night}`;
    $('aliveInfo').textContent = `${players.filter(p => p.alive).length} of ${players.length} in town`;
    updateSeats(); ambience();
  }
  function panel(symbol, kicker, title, description) {
    host.append(el('div', symbol, 'symbol'), el('div', kicker, 'eyebrow'), el('h2', title));
    if (description) host.append(el('p', description));
  }
  function actions(...buttons) {
    const row = el('div', undefined, 'actions'); row.append(...buttons); host.append(row);
  }
  function countdown(seconds, done) {
    const clock = el('span', undefined, 'clock');
    clock.setAttribute('role', 'timer'); clock.setAttribute('aria-label', 'Time remaining');
    host.append(clock);
    const deadline = performance.now() + seconds * 1000;
    function tick() {
      const left = Math.max(0, Math.ceil((deadline - performance.now()) / 1000));
      clock.textContent = `${left} seconds`;
      if (left === 0) { clearInterval(interval); interval = null; done(); }
    }
    tick(); interval = setInterval(tick, 200);
  }
  function updateNames() {
    const old = Array.from($('names').querySelectorAll('input')).map(n => n.value);
    $('names').replaceChildren();
    for (let i = 0; i < Number($('playerCount').value); i++) {
      const label = el('label', `Seat ${i + 1}`), input = el('input');
      input.type = 'text'; input.maxLength = 24; input.autocomplete = 'off';
      input.name = `player-${i + 1}`; input.placeholder = `Player ${i + 1}`;
      input.setAttribute('aria-label', `Seat ${i + 1} name`); input.value = old[i] || '';
      label.append(input); $('names').append(label);
    }
    const villagers = Number($('playerCount').value) - 2;
    $('villagerCount').textContent = `${villagers} ${villagers === 1 ? 'Villager' : 'Villagers'}`;
    $('modeNote').textContent = villagers === 1
      ? 'One night only. Someone dies: Mafia wins. Nobody dies: Villager wins. No voting.'
      : 'Discuss and vote during the day. Play until one side wins.';
  }
  function randomBelow(max) {
    const range = 0x100000000, limit = range - range % max;
    const data = new Uint32Array(1);
    do { crypto.getRandomValues(data); } while (data[0] >= limit);
    return data[0] % max;
  }
  function deal() {
    unlockAudio();
    const roles = ['Mafia', 'Doctor', ...Array(Number($('playerCount').value) - 2).fill('Villager')];
    for (let i = roles.length - 1; i > 0; i--) {
      const j = randomBelow(i + 1); [roles[i], roles[j]] = [roles[j], roles[i]];
    }
    const raw = Array.from($('names').querySelectorAll('input')).map((input, i) => input.value.trim() || `Player ${i + 1}`);
    players = raw.map((name, id) => ({id, name: raw.filter(n => n.toLowerCase() === name.toLowerCase()).length > 1 ? `${name} (seat ${id + 1})` : name, role: roles[id], alive: true}));
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
      identity.append(el('span', player.name, 'name'), el('span', 'In town', 'state'));
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
      seat.querySelector('.state').textContent = p.alive ? canChoose ? 'Tap to choose' : 'In town' : 'Out of the game';
      seat.setAttribute('aria-label', `${p.name}, seat ${p.id + 1}, ${p.alive ? 'in town' : 'out of the game'}`);
    });
  }
  function showHandoff() {
    startStage('reveal', null);
    panel('✉', `PRIVATE ROLE · ${revealIndex + 1} / ${players.length}`, `Pass to ${players[revealIndex].name}`, 'Everyone else, look away. Make sure only this player can see the screen.');
    actions(button('Reveal my role', showRole));
    host.append(el('p', 'Roles are never read aloud.', 'privacy'));
  }
  function showRole() {
    startStage('reveal', null);
    const p = players[revealIndex];
    panel(p.role === 'Mafia' ? '♠' : p.role === 'Doctor' ? '✚' : '⌂', 'FOR YOUR EYES ONLY', p.name);
    host.append(el('div', p.role.toUpperCase(), 'private-role'), el('p', roleHelp[p.role]));
    actions(button('Hide & continue', () => {
      revealIndex++;
      if (revealIndex < players.length) showHandoff(); else ready();
    }));
  }
  function ready() {
    startStage('ready', null);
    panel('☾', 'THE TABLE IS SET', 'Let the town fall asleep.', players.length === 3 ? 'Place the tablet between you. One night decides the winner, with no voting. Turn up the volume and listen to the host.' : 'Place the tablet between you. Each corner is a player’s seat. Turn up the volume and listen to the host.');
    actions(button('Begin the first night', startNight));
  }
  function startNight() {
    unlockAudio(); night++; attack = null; protection = null;
    nightIntro(); chime();
  }
  function nightIntro() {
    startStage('night-intro', nightIntro);
    panel('☾', `NIGHT ${night}`, 'Everyone, close your eyes.', 'No peeking. Only open your eyes when the host calls your role.');
    say('It is night. Everyone, close your eyes. Keep them closed until I call your role.');
    countdown(9, mafiaTurn);
  }
  function mafiaTurn() {
    startStage('mafia', mafiaTurn);
    panel('♠', `NIGHT ${night} · SECRET CHOICE`, 'Mafia, open your eyes.', 'Tap one other living player’s button to attack. Your choice stays secret.');
    say('Mafia, open your eyes. Tap the player you want to attack. Everyone else, keep your eyes closed.');
    countdown(secondsPerChoice + 8, () => closeMafia());
    host.append(el('p', 'A missed turn means no attack. Tap quietly.', 'privacy'));
  }
  function closeMafia() {
    startStage('mafia-close', closeMafia);
    panel('☾', `NIGHT ${night}`, 'Mafia, close your eyes.', 'Everyone stays quiet. The next role is about to wake up.');
    say('Mafia, close your eyes.');
    countdown(5, doctorTurn);
  }
  function doctorTurn() {
    startStage('doctor', doctorTurn);
    panel('✚', `NIGHT ${night} · SECRET CHOICE`, 'Doctor, open your eyes.', 'Tap a living player’s button to protect them. You may choose yourself.');
    say('Doctor, open your eyes. Tap the player you want to save. You may save yourself. Everyone else, keep your eyes closed.');
    countdown(secondsPerChoice + 9, () => closeDoctor());
    host.append(el('p', 'If you are out, keep your eyes closed and wait for morning.', 'privacy'));
  }
  function closeDoctor() {
    startStage('doctor-close', closeDoctor);
    panel('☾', `NIGHT ${night}`, 'Doctor, close your eyes.', 'The town will wake up together.');
    say('Doctor, close your eyes. Everyone, wait for morning.');
    countdown(6, resolveNight);
  }
  function choose(id) {
    if (paused || !players[id]?.alive) return;
    if (phase === 'mafia') {
      if (players[id].role === 'Mafia') {
        const note = host.querySelector('.privacy');
        note.textContent = 'Choose another living player. You cannot choose yourself.';
        return;
      }
      attack = id; closeMafia();
    } else if (phase === 'doctor') {
      // Still call the Doctor every night, without revealing whether they survived.
      if (!players.some(p => p.alive && p.role === 'Doctor')) return;
      protection = id; closeDoctor();
    } else if (phase === 'vote') {
      ask(`Vote out ${players[id].name}?`, 'Confirm only after the group has agreed. This player will be out of the game.', () => eliminate(id));
    }
  }
  function resolveNight() {
    let text = 'Nobody died last night.';
    if (attack !== null && attack !== protection) {
      players[attack].alive = false;
      text = `${players[attack].name} died last night. They are out of the game.`;
    }
    // Discard both secret choices before the screen is shared again.
    attack = null; protection = null;
    morning(text);
  }
  function winner() {
    if (players.length === 3) return players.some(p => !p.alive) ? 'Mafia' : 'Villager';
    const mafia = players.filter(p => p.alive && p.role === 'Mafia').length;
    const town = players.filter(p => p.alive && p.role !== 'Mafia').length;
    return mafia === 0 ? 'Town' : mafia >= town ? 'Mafia' : null;
  }
  function morning(result) {
    startStage('morning', null);
    chime();
    const won = winner();
    panel('☀', `MORNING · DAY ${night}`, 'Everyone, open your eyes.', result);
    const speech = `It is morning. Everyone, open your eyes. ${result}`;
    if (won) {
      const outcome = players.length === 3
        ? won === 'Mafia' ? 'The Mafia wins. Someone died. The game is over. There is no voting round.' : 'The Villager wins. Nobody died. The game is over. There is no voting round.'
        : won === 'Town' ? 'The town wins. The Mafia has been eliminated.' : 'The Mafia wins. The town is outnumbered or tied.';
      say(`${speech} ${outcome}`);
      showWinner(won);
      return;
    }
    say(`${speech} Discuss who you suspect. When the group is ready, choose someone to vote out, or skip the vote.`);
    actions(button('Discuss & vote', openVote), button('Skip vote · next night', () => ask('Skip the daytime vote?', 'No one will be voted out. Everyone will go to sleep for the next night.', startNight), 'secondary'));
    host.append(el('p', 'Out players stay quiet and keep their role secret.', 'privacy'));
  }
  function openVote() {
    startStage('vote', null);
    panel('☀', `DAY ${night} · GROUP DECISION`, 'Who do you suspect?', 'Discuss together. When you agree, tap one living player to vote them out. The next screen asks you to confirm.');
    actions(button('Skip vote · next night', () => ask('Skip the daytime vote?', 'No one will be voted out. Continue to the next night?', startNight), 'secondary'));
  }
  function eliminate(id) {
    if (phase !== 'vote' || !players[id].alive) return;
    players[id].alive = false;
    startStage('after-vote', null);
    const won = winner();
    panel('⌂', `DAY ${night}`, `${players[id].name} is voted out.`, 'Their role stays secret until the game ends.');
    if (won) {
      say(`${players[id].name} has been voted out. ${won} wins.`); showWinner(won);
    } else {
      say(`${players[id].name} has been voted out. Keep your role secret. The town will sleep again when everyone is ready.`);
      actions(button('Begin the next night', startNight));
    }
  }
  function showWinner(won) {
    phase = 'end'; clearTimers(); resumeStage = null;
    $('roundInfo').textContent = 'GAME OVER'; $('pause').hidden = true;
    updateSeats(); ambience();
    host.append(el('h2', won === 'Town' ? 'The town wins.' : won === 'Villager' ? 'The Villager wins.' : 'The Mafia wins.'));
    const list = el('ul', undefined, 'role-list');
    players.forEach(p => {
      const row = el('li'); row.append(el('span', p.name), el('strong', p.role)); list.append(row);
    });
    host.append(list);
    actions(button('Play again', reset));
  }
  function ask(title, text, action) {
    confirmAction = action;
    $('confirmTitle').textContent = title; $('confirmText').textContent = text;
    $('confirmDialog').showModal();
  }
  function pauseNight() {
    if (!isNight() || paused) return;
    paused = true; clearTimers(); stopSpeech(); stopChime(); ambience(); updateSeats();
    $('pauseDialog').showModal();
  }
  function resumeNight() {
    if (!paused) return;
    $('pauseDialog').close(); paused = false; unlockAudio();
    if (resumeStage) resumeStage();
  }
  function reset() {
    clearTimers(); stopSpeech(); stopChime(); phase = 'setup'; paused = false; resumeStage = null;
    attack = null; protection = null; players = []; confirmAction = null;
    if ($('pauseDialog').open) $('pauseDialog').close();
    if ($('confirmDialog').open) $('confirmDialog').close();
    ambience(); host.replaceChildren(); $('seats').replaceChildren(host);
    $('table').hidden = true; $('setup').hidden = false; $('newGame').hidden = true;
    document.body.classList.remove('daytime');
  }
  $('playerCount').addEventListener('change', updateNames);
  $('setupForm').addEventListener('submit', event => { event.preventDefault(); deal(); });
  $('newGame').addEventListener('click', () => {
    if (isNight()) pauseNight();
    ask('Start a new game?', 'This ends the current game and discards all secret roles.', reset);
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
  $('sound').addEventListener('change', () => { if ($('sound').checked) unlockAudio(); else stopChime(); ambience(); });
  $('testVoice').addEventListener('click', () => {
    unlockAudio();
    if (!('speechSynthesis' in window)) {
      $('audioNote').textContent = 'Spoken voices are unavailable here. All host instructions are shown on screen.';
      return;
    }
    $('voice').checked = true;
    $('audioNote').textContent = 'You should hear the host. If not, raise your device volume. Written instructions always remain available.';
    // Never interrupt an active role prompt or announce a private role.
    if (isNight() && !paused) {
      $('audioNote').textContent = 'Pause the night before testing the voice.';
      return;
    }
    say('Welcome to Mafia. I will be your host. When night falls, close your eyes and listen carefully.');
  });
  if (!('speechSynthesis' in window)) {
    $('voice').checked = false; $('voice').disabled = true;
    $('audioNote').textContent = 'Spoken voices are unavailable. Follow the written host instructions.';
  }
  updateNames();
})();
