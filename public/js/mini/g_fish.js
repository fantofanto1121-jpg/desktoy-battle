// クリップ釣り: 磁石でトレイのクリップを釣り上げ、ペン立てに入れる。CPUの磁石と競争
'use strict';

defMat('gold', ['#e2c35a', '#c7a443', '#a08233'], '#5a4a1e', 'metal');

(function () {
  const TR = { x0: 0, y0: 0, x1: 12, y1: 8 }, FLOOR = 0.12, HIGH = 2.6;
  const CUP = { x: 14.6, y: 4, r: 1.25, h: 1.5 };
  const TIME = 60, MAXC = 3;
  const CLIPMAT = { m: null, r: 'red', b: 'blue', y: 'yellow', g: 'gold' };
  const PTS = { m: 1, r: 2, b: 2, y: 2, g: 5 };

  function smallClip() {
    const pts = [];
    const line = (a, b) => { for (let t = 0; t <= 1; t += 0.04) pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); };
    const arc = (cx, cy, r, a0, a1) => { for (let t = 0; t <= 1; t += 0.05) { const a = a0 + (a1 - a0) * t; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
    line([-0.45, -0.21], [0.45, -0.21]); arc(0.45, 0, 0.21, -Math.PI / 2, Math.PI / 2);
    line([0.45, 0.21], [-0.42, 0.21]); arc(-0.42, 0.05, 0.16, Math.PI / 2, Math.PI * 1.5);
    line([-0.42, -0.11], [0.33, -0.11]); arc(0.33, 0, 0.11, -Math.PI / 2, Math.PI / 2); line([0.33, 0.11], [-0.15, 0.11]);
    return makeModel(mgScale({
      size: [1.0, 0.56, 0.1], vs: 0.03, smooth: 1.3,
      fill(x, y, z) {
        for (const p of pts) if ((x - p[0]) ** 2 + (y - p[1]) ** 2 + (z - 0.04) ** 2 < 0.0016) return M.metal;
        return 0;
      },
    }, 1.5));
  }
  const clipSpr = (c, a, tilt) => mgSpr('fc' + c + SPR.yawIndex(a) + (tilt ? 't' : ''), () => {
    const mat = CLIPMAT[c];
    return mgBake(mgModel('fClip', smallClip), { yaw: SPR.yawIndex(a) / SPR.YAWS * Math.PI * 2, pitch: tilt ? 1.2 : 0, remap: mat ? { [M.metal]: M[mat] } : null });
  });
  function magnetModel(mat) {
    return makeModel(mgScale({
      size: [0.9, 0.36, 1.0], vs: 0.04, smooth: 1.3,
      fill(x, y, z) {
        if (Math.abs(y) > 0.16) return 0;
        // U字(下が開いている)
        const cz = 0.62, r = Math.hypot(x, z - cz);
        if (z >= cz && r < 0.42 && r > 0.17) return M[mat];
        if (z < cz && Math.abs(Math.abs(x) - 0.295) < 0.125) return z < 0.16 ? M.steel : M[mat];
        if (z > 0.98 && Math.abs(x) < 0.04) return M.white;
        return 0;
      },
      origin: [-0.45, -0.18, 0],
    }, 1.6));
  }
  const magSpr = (team) => mgSpr('fMag' + team, () => mgBake(mgModel('fMag' + team, () => magnetModel(team ? 'blue' : 'red')), { yaw: 0 }));

  const G_ = {
    name: 'クリップ釣り', kind: 'duel', tint: COL.blue, cpu: true,
    howto: [
      'トレイをタップすると、磁石がそこへ下りてクリップを拾います。',
      'ペン立てをタップすると、運んだクリップを入れます。',
      '銀1点、色つき2点、金5点。' + TIME + '秒でCPUより多く集めよう。',
    ],
    stageDef() {
      const tone = ['#e6dcc4', '#d8cdb3', '#c6ba9e', '#b2a688'].map(hexRGB);
      const wallSide = ['#cdbf9f', '#b9ab8b', '#9e9172'].map(hexRGB);
      const wall = (x0, y0, x1, y1) => ({ x0, y0, x1, y1, z: 0, h: 0.42, top: (x, y, px, py) => mgTone(tone, 0.2, px, py), side: wallSide });
      return {
        cx: 7.4, cy: 4,
        items: [
          { x0: TR.x0, y0: TR.y0, x1: TR.x1, y1: TR.y1, z: 0, h: FLOOR, top: (x, y, px, py) => mgTone(tone, 1.1 + (1 - x / TR.x1) * -0.6 + (vnoise(x * 1.5, y * 1.5) - 0.5) * 0.6, px, py), side: wallSide },
          wall(TR.x0 - 0.3, TR.y0 - 0.3, TR.x1 + 0.3, TR.y0), wall(TR.x0 - 0.3, TR.y0, TR.x0, TR.y1 + 0.3),
          wall(TR.x0, TR.y1, TR.x1 + 0.3, TR.y1 + 0.3), wall(TR.x1, TR.y0, TR.x1 + 0.3, TR.y1),
          { x0: CUP.x - CUP.r, y0: CUP.y - CUP.r, x1: CUP.x + CUP.r, y1: CUP.y + CUP.r, z: 0, h: CUP.h, r: CUP.r,
            top: (x, y, px, py) => {
              const r = Math.hypot(x - CUP.x, y - CUP.y);
              if (r > CUP.r - 0.12) return hexRGB('#c9ced2');
              return mgTone(['#3d3a36', '#2f2d2a', '#242220'].map(hexRGB), 0.5 + (y - CUP.y) * 0.8, px, py);
            },
            side: ['#8d949a', '#737a80', '#5d6369'].map(hexRGB) },
        ],
      };
    },
    icon() {
      return mgIcon('fish', 84, 50, (put) => {
        put(clipSpr('r', 0.3), -1.4, 0.6, 0); put(clipSpr('m', 2.1), -0.3, 1.2, 0); put(clipSpr('g', 1.2), 1.0, 0.4, 0);
        put(magSpr(0), 0.4, -0.6, 0.5);
      });
    },
    reset() {
      this.clips = [];
      for (let i = 0; i < 22; i++) this.addClip();
      const mk = (team, x, y) => ({ team, x, y, z: HIGH, tx: x, ty: y, st: 'idle', carry: [], score: 0, think: 0, sway: 0 });
      this.mag = [mk(0, 4, 6), mk(1, 9, 2)];
      this.pops = [];
    },
    addClip() {
      const r = Math.random(), c = r < 0.08 ? 'g' : r < 0.4 ? ['r', 'b', 'y'][Math.floor(Math.random() * 3)] : 'm';
      this.clips.push({ x: 1 + Math.random() * 10, y: 1 + Math.random() * 6, z: FLOOR, a: Math.random() * Math.PI * 2, c, held: null, vz: 0, gone: false });
    },
    order(m, x, y) {
      m.tx = x; m.ty = y; m.st = 'move';
    },
    down(sx, sy) {
      const [cx, cy] = mgToWorld(sx, sy, CUP.h);
      if (Math.hypot(cx - CUP.x, cy - CUP.y) < CUP.r + 0.6) mgInput({ cup: 1 });
      else { const [x, y] = mgToWorld(sx, sy, FLOOR); mgInput({ x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 }); }
      mgSnd('tap');
    },
    onAct(seat, a) {
      const m = this.mag[seat];
      if (a.cup) { this.order(m, CUP.x, CUP.y); m.goCup = true; return; }
      m.goCup = false;
      this.order(m, Math.max(TR.x0 + 0.4, Math.min(TR.x1 - 0.4, +a.x || 0)), Math.max(TR.y0 + 0.4, Math.min(TR.y1 - 0.4, +a.y || 0)));
    },
    cpu(m, dt) {
      m.think -= dt;
      if (m.st !== 'idle' || m.think > 0) return;
      m.think = mgLv(0.9, 0.45, 0.2);
      if (m.carry.length >= mgLv(1, 2, 3) || (m.carry.length && Math.random() < 0.3)) { this.order(m, CUP.x, CUP.y); m.goCup = true; return; }
      // 点数の高いクリップが集まっている所をねらう
      let best = null, bs = -1e9;
      for (const c of this.clips) {
        if (c.held || c.gone) continue;
        let s = 0;
        for (const o of this.clips) if (!o.held && !o.gone && Math.hypot(o.x - c.x, o.y - c.y) < 0.95) s += PTS[o.c];
        s -= Math.hypot(c.x - m.x, c.y - m.y) * mgLv(0.6, 0.3, 0.15);
        s += (Math.random() - 0.5) * mgLv(6, 2, 0.5);
        if (s > bs) { bs = s; best = c; }
      }
      if (best) { this.order(m, best.x, best.y); m.goCup = false; }
    },
    update(dt) {
      if (mgCpu(1)) this.cpu(this.mag[1], dt);
      for (const m of this.mag) this.stepMag(m, dt);
      for (const c of this.clips) {
        if (c.held) {
          const m = c.held, k = m.carry.indexOf(c);
          c.x = m.x + (k - 1) * 0.3; c.y = m.y + 0.05; c.z = m.z - 0.25 - k * 0.1;
        } else if (c.z > FLOOR || c.vz) {
          c.vz -= 20 * dt; c.z += c.vz * dt;
          const inCup = Math.hypot(c.x - CUP.x, c.y - CUP.y) < CUP.r;
          if (inCup && c.z < CUP.h - 0.2) { c.gone = true; }
          else if (!inCup && c.z <= FLOOR) { c.z = FLOOR; c.vz = c.vz < -3 ? -c.vz * 0.3 : 0; if (!c.vz) mgSnd('metal'); }
        }
      }
      for (let i = this.clips.length - 1; i >= 0; i--) if (this.clips[i].gone) { this.clips.splice(i, 1); this.addClip(); }
      for (let i = this.pops.length - 1; i >= 0; i--) { this.pops[i].t += dt; if (this.pops[i].t > 0.9) this.pops.splice(i, 1); }
      if (MINI.t >= TIME) {
        const S = this.mag.map(m => m.score);
        mgFinish((seat) => { const a = S[seat], b = S[1 - seat]; return { head: a > b ? 'かち' : a < b ? 'まけ' : '引き分け', lines: ['あなた ' + a + ' 点  /  ' + mgVs(seat) + ' ' + b + ' 点'], good: a >= b }; });
      }
    },
    stepMag(m, dt) {
      const sp = mgCpu(m.team) ? mgLv(3.4, 4.6, 5.8) : 6.5;
      const dx = m.tx - m.x, dy = m.ty - m.y, d = Math.hypot(dx, dy);
      if (m.st === 'move') {
        if (m.z < HIGH) { m.z = Math.min(HIGH, m.z + dt * 6); return; }
        if (d > 0.05) { const s = Math.min(d, sp * dt); m.x += dx / d * s; m.y += dy / d * s; m.sway = Math.min(1, m.sway + dt * 3); }
        else m.st = m.goCup ? 'drop' : (m.carry.length < MAXC ? 'lower' : 'idle');
        // 運んでいる途中で落ちることがある
        for (const c of m.carry.slice()) if (Math.random() < dt * 0.05) this.release(m, c);
      } else if (m.st === 'lower') {
        m.z -= dt * 7;
        if (m.z <= FLOOR + 0.12) {
          m.z = FLOOR + 0.12;
          const near = this.clips.filter(c => !c.held && !c.gone && c.z <= FLOOR + 0.01 && Math.hypot(c.x - m.x, c.y - m.y) < 0.95);
          near.sort((a, b) => PTS[b.c] - PTS[a.c]);
          for (const c of near) { if (m.carry.length >= MAXC) break; c.held = m; m.carry.push(c); }
          mgSnd(near.length ? 'metal' : 'soft');
          m.st = 'raise';
        }
      } else if (m.st === 'raise') {
        m.z += dt * 6; if (m.z >= HIGH) { m.z = HIGH; m.st = 'idle'; }
      } else if (m.st === 'drop') {
        if (m.carry.length) {
          let pts = 0;
          for (const c of m.carry.slice()) { pts += PTS[c.c]; this.release(m, c); }
          m.score += pts;
          this.pops.push({ x: CUP.x, y: CUP.y, z: CUP.h + 1.6, t: 0, s: '+' + pts, team: m.team });
          mgSnd(m.team === MINI.seat ? 'good' : 'deliver');
        }
        m.st = 'idle';
      }
      if (m.st !== 'move') m.sway = Math.max(0, m.sway - dt * 2);
    },
    release(m, c) { m.carry.splice(m.carry.indexOf(c), 1); c.held = null; c.vz = 0; },
    idle() {},
    snap() {
      const r = (v) => Math.round(v * 100) / 100;
      return {
        c: this.clips.map(c => [r(c.x), r(c.y), r(c.z), r(c.a), c.c, c.held ? c.held.team : -1]),
        m: this.mag.map(m => [r(m.x), r(m.y), r(m.z), m.st, m.score, r(m.tx), r(m.ty), m.goCup ? 1 : 0, r(m.sway)]),
        p: this.pops.map(p => [p.s, p.team, r(p.t)]),
      };
    },
    apply(s) {
      this.net = s;
      this.clips = s.c.map((a, i) => {
        const o = this.clips[i] && this.clips[i].c === a[4] ? this.clips[i] : {};
        return Object.assign(o, { x: o.x === undefined || a[5] < 0 ? a[0] : o.x, y: o.y === undefined || a[5] < 0 ? a[1] : o.y, z: o.z === undefined || a[5] < 0 ? a[2] : o.z, a: a[3], c: a[4], held: a[5] >= 0 ? this.mag[a[5]] : null, t: a });
      });
      s.m.forEach((a, i) => { const m = this.mag[i]; [, , , m.st, m.score, m.tx, m.ty] = a; m.goCup = !!a[7]; m.sway = a[8]; });
      this.pops = s.p.map(p => ({ x: CUP.x, y: CUP.y, z: CUP.h + 1.6, s: p[0], team: p[1], t: p[2] }));
    },
    guest(dt) {
      const s = this.net;
      if (!s) return;
      const k = Math.min(1, dt * 14);
      s.m.forEach((a, i) => { const m = this.mag[i]; m.x += (a[0] - m.x) * k; m.y += (a[1] - m.y) * k; m.z += (a[2] - m.z) * k; });
      for (const c of this.clips) if (c.held) { c.x += (c.t[0] - c.x) * k; c.y += (c.t[1] - c.y) * k; c.z += (c.t[2] - c.z) * k; }
      for (const p of this.pops) p.t += dt;
    },
    draw(ctx, vw, vh) {
      mgCamera(vw, vh, 7.4, 4, 0.6, 18);
      const objs = [];
      for (const c of this.clips) objs.push({ s: clipSpr(c.c, c.a, !!c.held), x: c.x, y: c.y, z: c.z, g: FLOOR, k: c.held ? mgDepth(c.held.x, c.held.y) + 0.01 : mgDepth(c.x, c.y) - 0.3 });
      for (const m of this.mag) {
        const sw = Math.sin(MINI.t * 9) * m.sway * 0.12;
        objs.push({ s: magSpr(m.team), x: m.x + sw, y: m.y - sw, z: m.z, g: this.ground(m.x, m.y) });
      }
      mgDraw(ctx, vw, vh, objs, (c) => {
        for (const m of this.mag) {
          const sw = Math.sin(MINI.t * 9) * m.sway * 0.12;
          const [sx, sy] = mgP(m.x + sw, m.y - sw, m.z + 1.6);
          c.fillStyle = '#efe8d8'; c.fillRect(sx, 0, 1, sy);
          c.fillStyle = 'rgba(34,46,70,0.35)'; c.fillRect(sx + 1, 0, 1, sy);
          if (m.st === 'move' && !m.goCup) mgRing(c, m.tx, m.ty, FLOOR, 0.95, m.team ? '#4a6d93' : '#a8493c', 2);
        }
        mgFxDraw(c);
        for (const p of this.pops) { const [sx, sy] = mgP(p.x, p.y, p.z + p.t * 0.8); txt(c, p.s, sx, sy, 12, p.team ? COL.blue : COL.red, true, 'c'); }
      });
    },
    ground(x, y) {
      if (Math.hypot(x - CUP.x, y - CUP.y) < CUP.r) return CUP.h;
      return x >= TR.x0 && x <= TR.x1 && y >= TR.y0 && y <= TR.y1 ? FLOOR : 0;
    },
    hud(ctx, vw, vh) {
      const me = MINI.seat;
      mgHudNote(ctx, 6, 30, mgName(me), String(this.mag[me].score), me ? COL.noteB : COL.noteR, me ? COL.noteBDark : COL.noteRDark);
      mgHudNote(ctx, vw - 6, 30, mgName(1 - me), String(this.mag[1 - me].score), me ? COL.noteR : COL.noteB, me ? COL.noteRDark : COL.noteBDark, true);
      mgHudTag(ctx, vw, 'のこり ' + Math.max(0, Math.ceil(TIME - MINI.t)) + ' 秒');
    },
  };
  mgRegister(G_);
})();
