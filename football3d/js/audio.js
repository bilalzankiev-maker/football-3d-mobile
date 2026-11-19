'use strict';
/* ==== Синтезированный звук (WebAudio): толпа, удары, свисток ==== */

const Snd = {
  ctx: null,
  crowdGain: null,
  crowdBase: 0.045,

  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const noiseBuf = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < data.length; i++) {
        const white = Math.random() * 2 - 1;
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.2;
      }
      const src = this.ctx.createBufferSource();
      src.buffer = noiseBuf; src.loop = true;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 900;
      this.crowdGain = this.ctx.createGain();
      this.crowdGain.gain.value = this.crowdBase;
      src.connect(lp).connect(this.crowdGain).connect(this.ctx.destination);
      src.start();
    } catch (e) { this.ctx = null; }
  },

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },

  crowdExcite(amount, seconds) {
    if (!this.ctx) return;
    const g = this.crowdGain.gain;
    const now = this.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(this.crowdBase + amount, now + 0.15);
    g.linearRampToValueAtTime(this.crowdBase, now + seconds);
  },

  kick(power) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const dur = 0.09 + power * 0.05;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.5);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass';
    f.frequency.value = 180 + power * 220; f.Q.value = 0.9;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.55 + power * 0.4, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f).connect(g).connect(this.ctx.destination);
    src.start(t0);
  },

  whistle(pattern) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + 0.02;
    const notes = pattern === 'full' ? [0, 0.25, 0.5, 0.75]
                : pattern === 'goal' ? [0, 0.3, 0.6]
                : [0];
    for (const off of notes) {
      const o = this.ctx.createOscillator();
      o.type = 'square';
      o.frequency.setValueAtTime(2350, t0 + off);
      const lfo = this.ctx.createOscillator(); lfo.frequency.value = 28;
      const lfoG = this.ctx.createGain(); lfoG.gain.value = 60;
      lfo.connect(lfoG).connect(o.frequency);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0 + off);
      g.gain.linearRampToValueAtTime(0.16, t0 + off + 0.02);
      g.gain.setValueAtTime(0.16, t0 + off + 0.2);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + off + 0.24);
      o.connect(g).connect(this.ctx.destination);
      o.start(t0 + off); o.stop(t0 + off + 0.26);
      lfo.start(t0 + off); lfo.stop(t0 + off + 0.26);
    }
  }
};
