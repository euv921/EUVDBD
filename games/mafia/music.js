// Original soundscapes; real CC0 witch-cackle credit in CREDITS.md.
window.MafiaMusic = (() => {
  'use strict';
  const tracks = {
    ghost: {"title":"Ghosts in the Attic","bpm":54,"mood":"ghost","chords":[[50,57,62],[51,57,63],[50,56,62],[49,56,61],[50,57,62],[53,59,65],[51,57,63],[50,56,62]],"melody":[74,-1,-1,73,-1,-1,69,-1,75,-1,74,-1,-1,69,-1,-1,74,-1,80,-1,79,-1,74,-1,73,-1,-1,68,-1,-1,73,-1,74,-1,77,-1,76,74,-1,-1,77,-1,83,-1,82,-1,77,-1,75,-1,81,-1,80,75,-1,-1,74,-1,-1,73,-1,74,-1,-1]},
    witch: {"title":"Witch’s Cackle","bpm":58,"mood":"ghost","chords":[[50,57,62],[51,57,63],[50,56,62],[49,56,61],[50,57,62],[53,59,65],[51,57,63],[50,56,62]],"melody":[74,-1,-1,73,-1,-1,69,-1,75,-1,74,-1,-1,69,-1,-1,74,-1,80,-1,79,-1,74,-1,73,-1,-1,68,-1,-1,73,-1,74,-1,77,-1,76,74,-1,-1,77,-1,83,-1,82,-1,77,-1,75,-1,81,-1,80,75,-1,-1,74,-1,-1,73,-1,74,-1,-1],"introSeconds":2,"texture":"witch","seed":713,"basePitch":220,"sweep":95,"windGain":1.15},
    forest: {"title":"Witch’s Forest","bpm":48,"mood":"ghost","chords":[[50,57,62],[51,57,63],[50,56,62],[49,56,61],[50,57,62],[53,59,65],[51,57,63],[50,56,62]],"melody":[74,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,73,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,80,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,75,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,79,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,74,-1,-1,-1],"texture":"forest","seed":48152,"basePitch":180,"sweep":60,"gustPeriod":10,"windGain":1.8},
  };
  let witchSample = null;
  function getWitchSample() {
    if (witchSample) return witchSample;
    const sample = window.MafiaWitchSample, raw = atob(sample.pcm16);
    const data = new Float32Array(raw.length / 2);
    for (let i = 0; i < data.length; i++) {
      let value = raw.charCodeAt(i * 2) | (raw.charCodeAt(i * 2 + 1) << 8);
      if (value >= 32768) value -= 65536;
      data[i] = value / 32768;
    }
    witchSample = {rate: sample.sampleRate, data};
    return witchSample;
  }
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
      if (song.texture === 'cauldron') return;
      note(midi, i * step, step * (song.mood === 'musicbox' ? 2.6 : song.mood === 'ghost' ? 3 : song.bpm > 85 ? 0.8 : 1.5), 0.32);
      if (song.texture === 'forest' || song.texture === 'coven') return;
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
        data[i] += wind + Math.sin(ghostPhase) * swell * (song.texture === 'cauldron' ? 0.025 : 0.12);
        if (song.texture === 'coven') {
          const phase = 2 * Math.PI * 98 * t + 0.25 * Math.sin(t * 4.2);
          const chant = Math.sin(phase) + 0.35 * Math.sin(phase * 3) + 0.17 * Math.sin(phase * 5);
          data[i] += chant * (0.025 + 0.035 * Math.sin(t * 0.5) ** 2);
        }
      }
    } else if (song.mood === 'chase') {
      // A double heartbeat beneath the fast diminished-key ostinato.
      const beat = step * 2;
      for (let at = 0; at < duration; at += beat) {
        note(43, at, 0.18, 0.15, true);
        note(43, at + 0.19, 0.12, 0.1, true);
      }
    }
    if (song.texture === 'cauldron' || song.texture === 'forest') {
      let seed = song.seed;
      const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x100000000; };
      if (song.texture === 'cauldron') {
        for (let at = 0.08; at < duration; at += 0.14 + random() * 0.5) {
          const length = 0.09 + random() * 0.2, frequency = 130 + random() * 380;
          const offset = Math.round(at * sampleRate);
          for (let i = 0; i < length * sampleRate && offset + i < data.length; i++) {
            const t = i / sampleRate, envelope = Math.sin(Math.PI * t / length) ** 2 * Math.exp(-t * 8);
            const phase = 2 * Math.PI * (frequency * t + 900 * t * t);
            data[offset + i] += (Math.sin(phase) + 0.2 * Math.sin(phase * 2)) * envelope * 0.13;
          }
        }
      } else {
        for (let at = 1; at < duration; at += 6.5) {
          [0, 0.85].forEach(delay => {
            const offset = Math.round((at + delay) * sampleRate), length = 0.62;
            for (let i = 0; i < length * sampleRate && offset + i < data.length; i++) {
              const t = i / sampleRate, envelope = Math.sin(Math.PI * t / length) ** 2;
              const phase = 2 * Math.PI * (300 * t + 10 * Math.sin(t * 4));
              data[offset + i] += Math.sin(phase) * envelope * 0.12;
            }
          });
          const offset = Math.round((at + 2.5) * sampleRate);
          for (let i = 0; i < sampleRate && offset + i < data.length; i++) {
            const t = i / sampleRate, envelope = Math.sin(Math.PI * t) ** 2;
            data[offset + i] += Math.sin(2 * Math.PI * (170 * t + 120 * t * t)) * (0.5 + 0.5 * Math.sin(t * 73)) * envelope * 0.06;
          }
        }
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
      const output = combined.getChannelData(0); output.set(data, introLength);
      const sample = getWitchSample();
      const start = Math.round(sampleRate * 0.04);
      for (let i = 0; i < introLength - start; i++) {
        const position = i * sample.rate / sampleRate, index = Math.floor(position), fraction = position - index;
        if (index + 1 >= sample.data.length) break;
        output[start + i] += sample.data[index] * (1 - fraction) + sample.data[index + 1] * fraction;
      }
      const dry = output.slice(0, introLength);
      for (let i = 0; i < introLength; i++) {
        const echo1 = i - Math.round(sampleRate * 0.17), echo2 = i - Math.round(sampleRate * 0.34);
        if (echo1 >= 0) output[i] += dry[echo1] * 0.22;
        if (echo2 >= 0) output[i] += dry[echo2] * 0.1;
      }
      let introPeak = 0;
      for (let i = 0; i < introLength; i++) introPeak = Math.max(introPeak, Math.abs(output[i]));
      for (let i = 0; i < introLength; i++) output[i] *= introPeak ? 0.72 / introPeak : 1;
      return combined;
    }
    return buffer;
  }
  return {tracks, render};
})();
