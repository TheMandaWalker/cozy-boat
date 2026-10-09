// Everything is synthesised with WebAudio, so the site ships no sound files.
// The context is only created after the visitor turns sound on (browsers
// require a user gesture before audio can start).

const PENTATONIC = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66];

export function createAudio() {
  let ctx = null;
  let master = null;
  let enabled = false;
  let noiseBuffer = null;

  function buildNoise(c) {
    // Brown noise: soft, low rumble that reads as water.
    const len = c.sampleRate * 4;
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
    return buf;
  }

  function startAmbience(c) {
    const src = c.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 600;
    const waves = c.createGain();
    waves.gain.value = 0.35;
    // Slow swell: the volume breathes in and out like the sea.
    const swell = c.createOscillator();
    swell.frequency.value = 0.08;
    const swellDepth = c.createGain();
    swellDepth.gain.value = 0.2;
    swell.connect(swellDepth).connect(waves.gain);
    src.connect(lp).connect(waves).connect(master);
    src.start();
    swell.start();

    // A faint airy layer for wind.
    const wind = c.createBiquadFilter();
    wind.type = 'bandpass';
    wind.frequency.value = 1400;
    wind.Q.value = 0.6;
    const windGain = c.createGain();
    windGain.gain.value = 0.05;
    const windSrc = c.createBufferSource();
    windSrc.buffer = noiseBuffer;
    windSrc.loop = true;
    windSrc.playbackRate.value = 0.7;
    windSrc.connect(wind).connect(windGain).connect(master);
    windSrc.start(0, 1.5);
  }

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    noiseBuffer = buildNoise(ctx);
    startAmbience(ctx);
    return ctx;
  }

  function setEnabled(on) {
    const c = ensure();
    if (!c) return false;
    enabled = on;
    if (c.state === 'suspended') c.resume();
    master.gain.cancelScheduledValues(c.currentTime);
    master.gain.setTargetAtTime(on ? 0.9 : 0, c.currentTime, 0.4);
    return true;
  }

  function isEnabled() {
    return enabled;
  }

  // Soft bell, pentatonic so any combination sounds pleasant.
  function chime(index = 0, volume = 0.18) {
    if (!enabled || !ctx) return;
    const c = ctx;
    const f = PENTATONIC[((index % PENTATONIC.length) + PENTATONIC.length) % PENTATONIC.length];
    const now = c.currentTime;
    const out = c.createGain();
    out.gain.setValueAtTime(0, now);
    out.gain.linearRampToValueAtTime(volume, now + 0.01);
    out.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);
    out.connect(master);
    for (const [mult, amp] of [[1, 1], [2.01, 0.25], [3.02, 0.08]]) {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * mult;
      const g = c.createGain();
      g.gain.value = amp;
      o.connect(g).connect(out);
      o.start(now);
      o.stop(now + 2.3);
    }
  }

  // Tiny splash for ripples: a short band-passed noise burst.
  function splash(volume = 0.12) {
    if (!enabled || !ctx || !noiseBuffer) return;
    const c = ctx;
    const now = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = noiseBuffer;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800 + Math.random() * 1200;
    bp.Q.value = 1.4;
    const g = c.createGain();
    g.gain.setValueAtTime(volume, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    src.connect(bp).connect(g).connect(master);
    src.start(now, Math.random() * 2, 0.4);
  }

  // A little happy meow: a pitch sweep with a warble on top.
  function meow() {
    if (!enabled || !ctx) return;
    const c = ctx;
    const now = c.currentTime;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(520, now);
    o.frequency.linearRampToValueAtTime(860, now + 0.18);
    o.frequency.linearRampToValueAtTime(640, now + 0.55);
    const vib = c.createOscillator();
    vib.frequency.value = 6;
    const vibDepth = c.createGain();
    vibDepth.gain.value = 14;
    vib.connect(vibDepth).connect(o.frequency);
    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1200;
    filter.Q.value = 2.5;
    const g = c.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.16, now + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
    o.connect(filter).connect(g).connect(master);
    o.start(now);
    vib.start(now);
    o.stop(now + 0.75);
    vib.stop(now + 0.75);
  }

  return { setEnabled, isEnabled, chime, splash, meow };
}
