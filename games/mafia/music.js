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
    dawn: {
      title: 'Quiet Dawn', bpm: 80,
      chords: [[60,64,67],[55,59,62],[57,60,64],[53,57,60],[60,64,67],[57,60,64],[53,57,60],[55,59,62]],
      melody: [72,76,79,76,74,72,67,-1, 71,74,79,74,72,71,67,-1, 69,72,76,79,76,72,69,67, 65,69,72,69,67,65,64,-1, 72,76,79,84,83,79,76,72, 76,72,69,72,76,79,76,72, 77,76,72,69,65,69,72,74, 79,74,71,67,71,74,72,-1]
    }
  };
  function render(context, id) {
    const song = tracks[id] || tracks.moonlit;
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
        const envelope = attack * Math.max(0, release) * Math.exp(-t * (mellow ? 2 : 4));
        const phase = 2 * Math.PI * frequency * t;
        const wave = Math.sin(phase) + (mellow ? 0.1 : 0.3) * Math.sin(2 * phase) + 0.07 * Math.sin(3 * phase);
        data[start + i] += wave * envelope * level;
      }
    }
    song.melody.forEach((midi, i) => {
      note(midi, i * step, step * (song.bpm > 85 ? 0.8 : 1.5), 0.32);
      const chord = song.chords[Math.floor(i / 8)];
      note(chord[[0,1,2,1,0,1,2,1][i % 8]], i * step, step * 1.8, 0.09, true);
      if (i % 4 === 0) note(chord[0] - 12, i * step, step * 3.5, 0.12, true);
    });
    let peak = 0;
    for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
    const level = peak > 0 ? 0.75 / peak : 1;
    const fade = Math.round(sampleRate * 0.02);
    for (let i = 0; i < data.length; i++) data[i] *= level * Math.min(1, i / fade, (data.length - 1 - i) / fade);
    return buffer;
  }
  return {tracks, render};
})();
