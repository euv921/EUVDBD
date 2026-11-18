// Original instrumental loops; generated locally without external audio files.
window.MafiaMusic = (() => {
  'use strict';
  const tracks = {
    moonlit: {
      title: 'Moonlit Town', bpm: 72,
      chords: [[57,60,64],[53,57,60],[60,64,67],[55,59,62],[57,60,64],[53,57,60],[55,59,62],[57,60,64]],
      melody: [69,72,76,72,71,69,67,64, 65,69,72,69,67,65,64,-1, 67,72,76,79,76,72,71,67, 67,71,74,71,69,67,64,-1, 69,72,76,81,79,76,72,69, 72,69,65,69,72,74,72,69, 71,74,79,74,72,71,67,64, 69,72,76,72,71,69,69,-1]
    },
    secret: {
      title: 'Secret Steps', bpm: 92,
      chords: [[62,65,69],[58,62,65],[55,58,62],[57,61,64],[62,65,69],[58,62,65],[57,61,64],[62,65,69]],
      melody: [74,-1,77,76,74,69,72,74, 77,74,70,-1,74,77,76,74, 79,77,74,70,67,-1,70,74, 73,76,81,76,73,69,-1,72, 74,77,81,77,76,74,72,69, 70,74,77,81,77,74,70,-1, 73,76,79,76,73,69,72,73, 74,-1,77,76,74,69,74,-1]
    },
    haunted: {
      title: 'Haunted Music Box', bpm: 58, mood: 'musicbox',
      chords: [[57,60,63],[56,59,62],[53,57,60],[52,56,59],[57,60,63],[54,57,60],[56,59,62],[57,60,63]],
      melody: [81,-1,84,-1,83,81,75,-1, 80,-1,83,-1,86,83,80,-1, 81,84,88,-1,87,-1,84,81, 80,-1,83,87,86,83,-1,-1, 81,84,87,90,-1,87,84,81, 78,-1,81,84,87,84,81,-1, 80,83,86,-1,89,86,83,80, 81,-1,84,83,81,-1,-1,-1]
    },
    ghost: {
      title: 'Ghosts in the Attic', bpm: 54, mood: 'ghost',
      chords: [[50,57,62],[51,57,63],[50,56,62],[49,56,61],[50,57,62],[53,59,65],[51,57,63],[50,56,62]],
      melody: [74,-1,-1,73,-1,-1,69,-1, 75,-1,74,-1,-1,69,-1,-1, 74,-1,80,-1,79,-1,74,-1, 73,-1,-1,68,-1,-1,73,-1, 74,-1,77,-1,76,74,-1,-1, 77,-1,83,-1,82,-1,77,-1, 75,-1,81,-1,80,75,-1,-1, 74,-1,-1,73,-1,74,-1,-1]
    },
    chase: {
      title: 'Halloween Chase', bpm: 104, mood: 'chase',
      chords: [[50,53,56],[50,53,56],[51,54,57],[49,52,55],[50,53,56],[53,56,59],[51,54,57],[49,52,55]],
      melody: [74,77,80,83,86,83,80,77, 74,-1,75,74,73,74,77,80, 75,78,81,84,87,84,81,78, 73,76,79,82,85,82,79,76, 74,77,80,83,86,89,86,83, 77,80,83,86,89,86,83,80, 75,78,81,84,87,84,81,78, 73,76,79,82,85,82,74,-1]
    }
  };
  function render(context, id) {
    const song = tracks[id] || tracks.haunted;
    const sampleRate = 22050, step = 30 / song.bpm;
    const duration = song.melody.length * step;
    const buffer = context.createBuffer(1, Math.ceil(duration * sampleRate), sampleRate);
    const data = buffer.getChannelData(0);
    function note(midi, at, length, level, mellow = false) {
      if (midi < 0) return;
      const start = Math.round(at * sampleRate), samples = Math.round(length * sampleRate);
      const frequency = 440 * Math.pow(2, (midi - 69) / 12);
      for (let i = 0; i < samples && start + i < data.length; i++) {
        const t = i / sampleRate;
        const attack = Math.min(1, t / 0.008), release = Math.min(1, (length - t) / 0.08);
        let envelope = attack * Math.max(0, release) * Math.exp(-t * (mellow ? 2 : 4));
        const phase = 2 * Math.PI * frequency * t;
        let wave = Math.sin(phase) + (mellow ? 0.1 : 0.3) * Math.sin(2 * phase) + 0.07 * Math.sin(3 * phase);
        if (song.mood === 'musicbox' && !mellow) {
          // Detuned, inharmonic bell partials instead of the warm piano sound.
          wave = Math.sin(phase) + 0.35 * Math.sin(phase * 2.76) + 0.16 * Math.sin(phase * 4.07);
          envelope = attack * Math.max(0, release) * Math.exp(-t * 2.3);
        } else if (song.mood === 'ghost') {
          wave = Math.sin(phase + 0.18 * Math.sin(t * 14)) + 0.25 * Math.sin(phase * 1.008);
          envelope = Math.sin(Math.PI * t / length) ** 2 * 0.7;
        } else if (song.mood === 'chase') {
          wave = Math.sin(phase) + 0.32 * Math.sin(3 * phase) + 0.14 * Math.sin(5 * phase);
          envelope *= 0.75 + 0.25 * Math.sin(t * 32);
        }
        data[start + i] += wave * envelope * level;
      }
    }
    song.melody.forEach((midi, i) => {
      note(midi, i * step, step * (song.mood === 'musicbox' ? 2.6 : song.mood === 'ghost' ? 3 : song.bpm > 85 ? 0.8 : 1.5), 0.32);
      const chord = song.chords[Math.floor(i / 8)];
      note(chord[[0,1,2,1,0,1,2,1][i % 8]], i * step, step * 1.8, 0.09, true);
      if (i % 4 === 0) note(chord[0] - 12, i * step, step * 3.5, 0.12, true);
    });
    if (song.mood === 'ghost') {
      // Wind and breath-like swells, with gliding ghost calls. Seeded noise
      // keeps a track reproducible; randomness here is unrelated to role deals.
      let seed = 73417, slowNoise = 0, fastNoise = 0, ghostPhase = 0;
      for (let i = 0; i < data.length; i++) {
        const t = i / sampleRate;
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const white = seed / 0x80000000 - 1;
        slowNoise += 0.035 * (white - slowNoise);
        fastNoise += 0.18 * (white - fastNoise);
        const wind = (fastNoise - slowNoise) * (0.025 + 0.025 * Math.sin(t * 0.8) ** 2);
        const cycle = (t + 1) % 8, swell = Math.sin(Math.PI * cycle / 8) ** 4;
        ghostPhase += 2 * Math.PI * (210 + 85 * Math.sin(t * 0.55) + 7 * Math.sin(t * 5)) / sampleRate;
        data[i] += wind + Math.sin(ghostPhase) * swell * 0.12;
      }
    } else if (song.mood === 'chase') {
      // A double heartbeat beneath the fast diminished-key ostinato.
      const beat = step * 2;
      for (let at = 0; at < duration; at += beat) {
        note(43, at, 0.18, 0.15, true);
        note(43, at + 0.19, 0.12, 0.1, true);
      }
    }
    let peak = 0;
    for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
    const level = peak > 0 ? 0.75 / peak : 1;
    const fade = Math.round(sampleRate * 0.02);
    for (let i = 0; i < data.length; i++) data[i] *= level * Math.min(1, i / fade, (data.length - 1 - i) / fade);
    return buffer;
  }
  return {tracks, render};
})();
