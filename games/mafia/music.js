// Original ghost soundscapes and synthetic laugh intros, generated locally.
window.MafiaMusic = (() => {
  'use strict';
  const tracks = {
    ghost: {
      title: "Ghosts in the Attic",
      bpm: 54,
      mood: "ghost",
      chords: [[50,57,62],[51,57,63],[50,56,62],[49,56,61],[50,57,62],[53,59,65],[51,57,63],[50,56,62]],
      melody: [
        74,-1,-1,73,-1,-1,69,-1,
        75,-1,74,-1,-1,69,-1,-1,
        74,-1,80,-1,79,-1,74,-1,
        73,-1,-1,68,-1,-1,73,-1,
        74,-1,77,-1,76,74,-1,-1,
        77,-1,83,-1,82,-1,77,-1,
        75,-1,81,-1,80,75,-1,-1,
        74,-1,-1,73,-1,74,-1,-1
      ]
    },
    laughter: {
      title: "Haunted Laughter",
      bpm: 48,
      mood: "ghost",
      introSeconds: 3.6,
      laughPitch: 0.8,
      seed: 1451,
      basePitch: 150,
      sweep: 110,
      gustPeriod: 10,
      windGain: 1.4,
      chords: [[50,56,62],[49,55,61],[48,54,60],[51,57,63],[50,56,62],[46,53,58],[49,55,61],[50,56,62]],
      melody: [
        62,-1,-1,61,-1,56,-1,-1,
        61,-1,67,-1,66,61,-1,-1,
        60,-1,-1,66,-1,65,60,-1,
        63,-1,69,-1,68,-1,63,-1,
        62,-1,68,-1,67,62,-1,-1,
        58,-1,65,-1,64,-1,58,-1,
        61,-1,67,66,-1,61,-1,-1,
        62,-1,-1,61,-1,62,-1,-1
      ]
    },
    cackle: {
      title: "Midnight Cackle",
      bpm: 62,
      mood: "ghost",
      introSeconds: 3.6,
      laughPitch: 1.05,
      seed: 9231,
      basePitch: 260,
      sweep: 70,
      gustPeriod: 6,
      windGain: 1.15,
      chords: [[57,63,69],[56,62,68],[53,59,65],[58,64,70],[57,63,69],[54,60,66],[56,62,68],[57,63,69]],
      melody: [
        81,-1,80,-1,75,-1,-1,74,
        80,-1,-1,86,-1,85,80,-1,
        77,-1,83,-1,82,-1,77,-1,
        82,-1,88,-1,87,82,-1,-1,
        81,-1,87,-1,86,-1,81,-1,
        78,-1,-1,84,-1,83,78,-1,
        80,-1,86,85,-1,80,-1,-1,
        81,-1,-1,80,-1,81,-1,-1
      ]
    },
  };
  function render(context, id) {
    const song = tracks[id] || tracks.ghost;
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
      let seed = song.seed || 73417, slowNoise = 0, fastNoise = 0, ghostPhase = 0;
      for (let i = 0; i < data.length; i++) {
        const t = i / sampleRate;
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const white = seed / 0x80000000 - 1;
        slowNoise += 0.035 * (white - slowNoise);
        fastNoise += 0.18 * (white - fastNoise);
        const wind = (fastNoise - slowNoise) * (0.025 + 0.025 * Math.sin(t * 0.8) ** 2) * (song.windGain || 1);
        const period = song.gustPeriod || 8;
        const cycle = (t + 1) % period, swell = Math.sin(Math.PI * cycle / period) ** 4;
        ghostPhase += 2 * Math.PI * ((song.basePitch || 210) + (song.sweep || 85) * Math.sin(t * 0.55) + 7 * Math.sin(t * 5)) / sampleRate;
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
    if (song.introSeconds) {
      const introLength = Math.round(song.introSeconds * sampleRate);
      const combined = context.createBuffer(1, introLength + data.length, sampleRate);
      const output = combined.getChannelData(0);
      output.set(data, introLength);
      const laugh = new Float32Array(introLength);
      let noiseSeed = song.seed || 113;
      // Six voiced "ha" bursts: breathy attacks, vowel formants, descending
      // pitch and short room echoes create an original synthetic horror laugh.
      for (let burst = 0; burst < 6; burst++) {
        const at = 0.04 + burst * 0.49, length = 0.32 + burst * 0.026;
        const base = (160 - burst * 15) * song.laughPitch;
        const weights = Array.from({length:28}, (_, index) => {
          const harmonic = index + 1, frequency = harmonic * base;
          return 0.16 / harmonic + 0.9 * Math.exp(-Math.pow((frequency - 650) / 160, 2))
            + 0.7 * Math.exp(-Math.pow((frequency - 1100) / 210, 2))
            + 0.25 * Math.exp(-Math.pow((frequency - 2500) / 350, 2));
        });
        let phase = 0;
        for (let i = 0; i < length * sampleRate; i++) {
          const t = i / sampleRate, position = Math.round(at * sampleRate) + i;
          if (position >= introLength) break;
          phase += 2 * Math.PI * base * (1.12 - 0.3 * t / length + 0.025 * Math.sin(t * 33)) / sampleRate;
          let vowel = 0;
          weights.forEach((weight, harmonic) => { vowel += weight * Math.sin(phase * (harmonic + 1)); });
          noiseSeed = (Math.imul(noiseSeed, 1664525) + 1013904223) >>> 0;
          const breath = (noiseSeed / 0x80000000 - 1) * 0.12 * Math.exp(-t * 22);
          const envelope = Math.sin(Math.PI * t / length) ** 0.8;
          laugh[position] += (Math.tanh(vowel * 0.65) + breath + 0.12 * Math.sin(phase * 0.5)) * envelope;
        }
      }
      const dry = laugh.slice();
      for (let i = 0; i < laugh.length; i++) {
        const echo1 = i - Math.round(sampleRate * 0.13), echo2 = i - Math.round(sampleRate * 0.27);
        if (echo1 >= 0) laugh[i] += dry[echo1] * 0.24;
        if (echo2 >= 0) laugh[i] += dry[echo2] * 0.1;
      }
      let laughPeak = 0;
      for (const value of laugh) laughPeak = Math.max(laughPeak, Math.abs(value));
      for (let i = 0; i < laugh.length; i++) output[i] = laugh[i] * (laughPeak ? 0.72 / laughPeak : 1);
      return combined;
    }
    return buffer;
  }
  return {tracks, render};
})();
