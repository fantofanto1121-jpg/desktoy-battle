// 効果音(WebAudioで合成。BGMなし)
'use strict';

const AUDIO = {
  ctx: null, master: null, noiseBuf: null,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.45;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 0.5;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  },
  tone(type, f0, f1, t, dur, vol, dest) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },
  noise(t, dur, vol, ftype, f0, f1, q) {
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf;
    f.type = ftype; f.Q.value = q || 1;
    f.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t); s.stop(t + dur + 0.02);
  },
  play(name) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime + 0.005;
    switch (name) {
      case 'pick':      // 積み木を持ち上げる軽い音
        this.tone('triangle', 1250, 1500, t, 0.05, 0.25);
        this.noise(t, 0.025, 0.12, 'highpass', 3000, 3000, 0.7);
        break;
      case 'drop':      // ぽとん、と小さく跳ねる
        this.tone('sine', 190, 70, t, 0.14, 0.45);
        this.noise(t, 0.06, 0.2, 'lowpass', 900, 300, 0.8);
        this.tone('triangle', 900, 700, t + 0.17, 0.04, 0.12);
        this.tone('triangle', 900, 700, t + 0.26, 0.03, 0.06);
        break;
      case 'deliver':   // トレイにカタン
        this.noise(t, 0.035, 0.3, 'bandpass', 1900, 1900, 6);
        this.tone('sine', 720, 640, t, 0.07, 0.3);
        this.noise(t + 0.07, 0.03, 0.18, 'bandpass', 1500, 1500, 6);
        this.tone('sine', 540, 500, t + 0.07, 0.06, 0.2);
        break;
      case 'charge':    // 突進の風切り
        this.noise(t, 0.28, 0.35, 'bandpass', 380, 1900, 2.5);
        break;
      case 'bite':      // ゴムのかみつき
        this.tone('square', 260, 110, t, 0.09, 0.18);
        this.noise(t, 0.04, 0.25, 'lowpass', 1600, 600, 1);
        this.tone('sine', 140, 90, t + 0.02, 0.1, 0.3);
        break;
      case 'end': {     // 机のタイマーのベル
        for (const [dt, f] of [[0, 1320], [0.18, 990]]) {
          this.tone('sine', f, f, t + dt, 0.7, 0.22);
          this.tone('sine', f * 2.76, f * 2.76, t + dt, 0.25, 0.05);
        }
        break;
      }
    }
  },
};
