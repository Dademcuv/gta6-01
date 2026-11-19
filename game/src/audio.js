// Sound: WebAudio effects and a small looping music sequencer, all synthesized
// in code — no audio files, no network. Audio starts only after the first user
// gesture (a key press or click), as browsers require.
const MUSIC_BASS = [55, 0, 55, 65.41, 55, 0, 49, 58.27]; // A1 A1 C2 E2 pattern, Hz
const MUSIC_STEP = 0.22; // seconds per step

export function createAudio() {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let muted = false;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let musicTimer = null;
  let musicStep = 0;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.16;
      musicGain.connect(master);
    } catch {
      return false;
    }
    return true;
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    gain.gain.setValueAtTime(vol || 0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noise(dur, vol, filterFreq) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq || 1800;
    const gain = ctx.createGain();
    gain.gain.value = vol || 0.3;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(t);
  }

  function startEngine() {
    if (!ensure() || engineOsc) return;
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 60;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0.0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    engineOsc.connect(filter);
    filter.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();
  }

  function setEngine(speedRatio) {
    if (!engineOsc || !ctx) return;
    engineGain.gain.setTargetAtTime(muted ? 0 : 0.05 + 0.06 * speedRatio, ctx.currentTime, 0.1);
    engineOsc.frequency.setTargetAtTime(55 + 140 * speedRatio, ctx.currentTime, 0.1);
  }

  function stopEngine() {
    if (!engineOsc) return;
    try {
      engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      const osc = engineOsc;
      window.setTimeout(() => {
        try {
          osc.stop();
        } catch {
          /* already stopped */
        }
      }, 300);
    } catch {
      /* ignore */
    }
    engineOsc = null;
    engineGain = null;
  }

  function startSiren() {
    if (!ensure() || sirenOsc) return;
    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'sine';
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0.0;
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 1.6;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 220;
    sirenOsc.frequency.value = 880;
    lfo.connect(lfoGain);
    lfoGain.connect(sirenOsc.frequency);
    sirenOsc.connect(sirenGain);
    sirenGain.connect(master);
    sirenOsc.start();
    lfo.start();
    sirenGain.gain.setTargetAtTime(muted ? 0 : 0.045, ctx.currentTime, 0.2);
    sirenOsc._lfo = lfo;
  }

  function stopSiren() {
    if (!sirenOsc) return;
    try {
      sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
      const osc = sirenOsc;
      const lfo = osc._lfo;
      window.setTimeout(() => {
        try {
          osc.stop();
          lfo.stop();
        } catch {
          /* already stopped */
        }
      }, 300);
    } catch {
      /* ignore */
    }
    sirenOsc = null;
    sirenGain = null;
  }

  function scheduleMusicStep() {
    if (!ctx || muted) return;
    const freq = MUSIC_BASS[musicStep % MUSIC_BASS.length];
    musicStep += 1;
    if (freq > 0) {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.5, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + MUSIC_STEP * 0.95);
      osc.connect(gain);
      gain.connect(musicGain);
      osc.start(t);
      osc.stop(t + MUSIC_STEP);
    }
    // Soft hat tick on every other step.
    if (musicStep % 2 === 0) {
      const t = ctx.currentTime;
      const len = Math.floor(ctx.sampleRate * 0.03);
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len) * 0.4;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(musicGain);
      source.start(t);
    }
  }

  return {
    ensure,
    get muted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.5, ctx.currentTime, 0.05);
      return muted;
    },
    startMusic() {
      if (!ensure() || musicTimer) return;
      musicTimer = window.setInterval(scheduleMusicStep, MUSIC_STEP * 1000);
    },
    stopMusic() {
      if (musicTimer) window.clearInterval(musicTimer);
      musicTimer = null;
    },
    startEngine,
    setEngine,
    stopEngine,
    startSiren,
    stopSiren,
    punch() {
      tone(140, 0.12, 'sine', 0.35, 60);
      noise(0.08, 0.2, 900);
    },
    shoot() {
      noise(0.16, 0.5, 2600);
      tone(900, 0.08, 'square', 0.12, 180);
    },
    crash() {
      noise(0.25, 0.5, 700);
      tone(90, 0.2, 'sine', 0.4, 40);
    },
    explosion() {
      noise(0.7, 0.7, 500);
      tone(60, 0.6, 'sine', 0.5, 30);
    },
    pickup() {
      tone(660, 0.09, 'sine', 0.25);
      window.setTimeout(() => tone(990, 0.12, 'sine', 0.25), 90);
    },
    missionDone() {
      [523, 659, 784, 1047].forEach((f, i) => window.setTimeout(() => tone(f, 0.22, 'triangle', 0.3), i * 130));
    },
    busted() {
      [392, 330, 262].forEach((f, i) => window.setTimeout(() => tone(f, 0.3, 'sawtooth', 0.2), i * 200));
    },
    click() {
      tone(800, 0.05, 'square', 0.12);
    },
  };
}
