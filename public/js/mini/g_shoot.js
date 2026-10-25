// 輪ゴムの的当て: 3段の棚に立つ文具を輪ゴムで撃ち落とす
'use strict';

(function () {
  const TIERS = [
    { y: 8.3, top: 1.0 },
    { y: 5.6, top: 2.1 },
    { y: 2.6, top: 3.2 },
  ];
  const XS = [1.5, 3.9, 6.3, 8.7, 11.1, 13.5, 15.9];
  const SC = 1.35;   // 的の大きさ
  const TIME = 40, BANDS = 30;
  const KINDS = {
    cap: { pts: 3, w: 0.4 }, eraser: { pts: 1, w: 0.9 }, box: { pts: 2, w: 0.8 }, shark: { pts: 5 },
  };

  function capModel(mat) {
    return makeModel(mgScale({
      size: [0.44, 0.44, 0.95], vs: 0.035, smooth: 1.4,
      fill(x, y, z) {
        const r = Math.hypot(x, y);
        if (z < 0.82 && r < 0.17) return M[mat];
        if (z >= 0.82 && z < 0.9 && r < 0.12) return M[mat];
        if (x > 0.15 && x < 0.21 && Math.abs(y) < 0.04 && z > 0.25 && z < 0.86) return M.metal;   // クリップ
        return 0;
      },
    }, SC));
  }
  function standEraser() {
    return makeModel(mgScale({
      size: [0.6, 0.95, 1.25], vs: 0.045, smooth: 1.2,
      fill: boxFill(0.6, 0.95, 1.25, 0.08, (x, y, z) => (z > 0.3 && z < 0.95 ? (Math.abs(z - 0.62) < 0.07 ? M.sleeveW : M.sleeve) : M.rubberW)),
    }, SC));
  }
  function matchBox() {
    return makeModel(mgScale({
      size: [0.6, 0.85, 0.95], vs: 0.045, smooth: 1,
      fill: boxFill(0.6, 0.85, 0.95, 0.04, (x, y, z) => (x > 0.26 && Math.abs(y) < 0.3 && Math.abs(z - 0.5) < 0.3 ? (Math.abs(z - 0.5) < 0.1 ? M.red : M.white) : M.yellow)),
    }, SC));
  }
  function ringModel() {
    return makeModel({
      size: [0.8, 0.8, 0.14], vs: 0.035,
      fill(x, y, z) { const r = Math.hypot(x, y); return r > 0.27 && r < 0.37 ? M.band : 0; },
    });
  }
  // 倒れる途中の向き(奥へ倒れる)
  function tSpr(kind, mat, fall) {
    const roll = -fall * Math.PI / 2 / 3;
    return mgSpr('sh' + kind + mat + '|' + fall, () => {
      const m = kind === 'cap' ? mgModel('shCap' + mat, () => capModel(mat)) : kind === 'eraser' ? mgModel('shEr', standEraser) : mgModel('shBox', matchBox);
      const s = mgBake(m, { yaw: Math.PI / 2, roll });
      return s;
    });
  }
  const ringSpr = (i) => mgSpr('shRing' + i, () => mgBake(mgModel('shRing', ringModel), { pitch: 0.3 + i * 0.35, yaw: i * 0.8, noShadow: true }));
  function alphaAt(s, x, y, r) {
    if (!s.mask) {
      const d = s.c.getContext('2d').getImageData(0, 0, s.c.width, s.c.height).data;
      s.mask = new Uint8Array(s.c.width * s.c.height);
      for (let i = 0; i < s.mask.length; i++) s.mask[i] = d[i * 4 + 3] > 0 ? 1 : 0;
    }
    x = Math.floor(x); y = Math.floor(y);
    // 指の太さぶん、まわり2画素も当たりにする
    r = r || 2;
    let best = -1;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const xx = x + dx, yy = y + dy, d = dx * dx + dy * dy;
      if (d <= r * r && xx >= 0 && yy >= 0 && xx < s.c.width && yy < s.c.height && s.mask[yy * s.c.width + xx] && (best < 0 || d < best)) best = d;
    }
    return best < 0 ? false : best + 1;
  }

  const ramp = (a) => a.map(hexRGB);
  const BOOKS = [ramp(['#a4564a', '#8f483d', '#773b33']), ramp(['#56708f', '#475e7b', '#3a4d66']), ramp(['#6f8a5c', '#5d774c', '#4c623e']), ramp(['#c49a52', '#ad8443', '#8f6c36'])];

  const G_ = {
    name: '輪ゴムの的当て', tint: '#c9875a', kind: 'race',
    howto: [
      '的をタップ(クリック)すると、輪ゴムが飛びます。',
      'キャップ3点、箱2点、消しゴム1点、走るサメは5点。',
      '輪ゴムは' + BANDS + '本、時間は' + TIME + '秒です。',
    ],
    stageDef() {
      const items = [
        { x0: 0, y0: 7.4, x1: 17.4, y1: 9.2, z: 0, h: 1.0, r: 0.2, top: (x, y, px, py) => mgTone(ramp(['#7f9c6d', '#6c8a5b', '#58744a']), 0.6 + (hash2(px, py) > 0.8 ? 1 : 0), px, py), side: ['#58744a', '#4b6440', '#3e5335'].map(hexRGB) },
        { x0: 0, y0: 0, x1: 17.4, y1: 4.2, z: 0, h: 3.2, top: (x, y, px, py) => {
          if (Math.abs(y - 2.1) < 0.14) return hexRGB('#b48f5f');   // ガムテープ
          if (Math.abs(y - 2.1) < 0.2) return hexRGB('#a07b4c');
          return mgTone(ramp(['#d2ad7a', '#c29c69', '#ab8657']), 0.5 + vnoise(x * 2, y * 2), px, py);
        }, side: ['#b28c5b', '#9c784b', '#7f603b'].map(hexRGB) },
      ];
      for (let k = 0; k < 4; k++) {
        const x0 = k * 4.35 + 0.02, x1 = x0 + 4.31, col = BOOKS[k];
        items.push({ x0, y0: 4.2, x1, y1: 7.2, z: 0, h: 2.1 - (k % 2) * 0.05, top: (x, y, px, py) => {
          if (Math.abs(Math.min(x - x0, x1 - x, y - 4.2, 7.2 - y) - 0.25) < 0.04) return hexRGB('#d8c08a');
          return mgTone(col, 0.7, px, py);
        }, side: [hexRGB('#e6dfcf'), col[1], col[2]] });
      }
      return { cx: 8.7, cy: 4.6, items };
    },
    icon() {
      return mgIcon('shoot', 84, 50, (put) => {
        put(tSpr('box', '', 0), -1.0, 0.3, 0); put(tSpr('cap', 'red', 0), 0.1, -0.2, 0); put(tSpr('eraser', '', 0), 1.1, -0.7, 0);
        put(ringSpr(1), 1.3, 1.6, 0.6);
      });
    },
    reset() {
      this.score = 0; this.left = BANDS; this.shots = 0; this.hits = 0; this.cd = 0;
      this.bands = []; this.pops = [];
      this.t = [];
      for (let ti = 0; ti < 3; ti++) for (const x of XS) if (mgRand() < 0.7) this.t.push(this.mkT(ti, x));
      this.shark = { x: 2, dir: 1, alive: true, rt: 0, tail: 0 };
      this.aimX = null;
    },
    mkT(ti, x) {
      const r = mgRand(), kind = r < 0.35 ? 'cap' : r < 0.65 ? 'box' : 'eraser';
      return { ti, x: x + (mgRand() - 0.5) * 0.4, kind, mat: ['red', 'blue', 'black'][Math.floor(mgRand() * 3)], fall: 0, st: 'up', rise: 0, rt: 0 };
    },
    tPos(t) { const T = TIERS[t.ti]; return [t.x, T.y - (t.fall > 0 ? t.fall * 0.25 : 0), T.top - (t.rise > 0 ? 0 : 0)]; },
    down(x, y) { this.shoot(x, y); },
    move(x, y) { this.aimX = x; this.aimY = y; },
    shoot(x, y) {
      if (this.cd > 0 || this.left <= 0) return;
      this.left--; this.shots++; this.cd = 0.28;
      const vw = G.vw, vh = G.vh;
      this.bands.push({ x0: vw / 2, y0: vh - 18, x1: x, y1: y, t: 0, dur: 0.28 + Math.hypot(x - vw / 2, y - vh) / 900 });
      mgSnd('snap');
    },
    update(dt) {
      this.cd -= dt;
      const sh = this.shark;
      // 中段を走るサメ
      if (sh.alive) { sh.x += sh.dir * dt * 2.6; if (sh.x > 16.4) sh.dir = -1; if (sh.x < 0.9) sh.dir = 1; sh.tail += dt * 6; }
      else { sh.rt -= dt; if (sh.rt <= 0) { sh.alive = true; sh.x = mgRand() < 0.5 ? 0.9 : 16.4; sh.dir = sh.x < 8 ? 1 : -1; } }
      for (const t of this.t) {
        if (t.st === 'fall') { t.fall = Math.min(3, t.fall + dt * 14); if (t.fall >= 3) { t.st = 'gone'; t.rt = 2 + mgRand() * 2; } }
        else if (t.st === 'gone') { t.rt -= dt; if (t.rt <= 0) Object.assign(t, this.mkT(t.ti, XS[Math.floor(mgRand() * XS.length)]), { st: 'up', rise: 0.25 }); }
        if (t.rise > 0) t.rise -= dt;
      }
      for (let i = this.bands.length - 1; i >= 0; i--) {
        const b = this.bands[i];
        b.t += dt;
        if (b.t >= b.dur) { this.bands.splice(i, 1); this.land(b.x1, b.y1); }
      }
      for (let i = this.pops.length - 1; i >= 0; i--) { this.pops[i].t += dt; if (this.pops[i].t > 0.9) this.pops.splice(i, 1); }
      if (MINI.t >= TIME || (this.left <= 0 && !this.bands.length)) {
        mgFinish({ head: this.score + ' 点', score: this.score, unit: ' 点', lines: ['当たり ' + this.hits + ' / ' + this.shots + ' 本'], good: true });
      }
    },
    // 輪ゴムが届いた点で、手前の的から順に当たりを調べる
    land(x, y) {
      // スマホでは指の太さぶん、少し外れても一番近い的に当てる
      const r = G.touch ? Math.max(3, Math.round(12 * (window.devicePixelRatio || 1) / G.scale)) : 2;
      const cand = [];
      for (const t of this.t) {
        if (t.st !== 'up' || t.rise > 0) continue;
        const [wx, wy, wz] = this.tPos(t), s = tSpr(t.kind, t.mat, 0), [sx, sy] = mgP(wx, wy, wz);
        const d = alphaAt(s, x - (sx - s.ax), y - (sy - s.ay), r);
        if (d) cand.push({ t, d, k: mgDepth(wx, wy), wx, wy, wz });
      }
      const sh = this.shark;
      if (sh.alive) {
        const s = this.sharkSpr(), [sx, sy] = mgP(sh.x, TIERS[1].y, TIERS[1].top);
        const d = alphaAt(s, x - (sx - s.ax), y - (sy - s.ay), r);
        if (d) cand.push({ shark: true, d, k: mgDepth(sh.x, TIERS[1].y), wx: sh.x, wy: TIERS[1].y, wz: TIERS[1].top });
      }
      // 指の下にじかにある的を優先し、その中では手前のもの
      cand.sort((a, b) => (a.d <= 9 ? 0 : a.d) - (b.d <= 9 ? 0 : b.d) || b.k - a.k);
      const c = cand[0];
      if (!c) { mgSnd('soft'); return; }
      const pts = c.shark ? KINDS.shark.pts : KINDS[c.t.kind].pts;
      if (c.shark) { sh.alive = false; sh.rt = 3; mgSnd('bite'); }
      else { c.t.st = 'fall'; mgSnd('hit'); }
      this.score += pts; this.hits++;
      this.pops.push({ x: c.wx, y: c.wy, z: c.wz + 1.3, t: 0, s: '+' + pts });
      mgBurst(c.wx, c.wy, c.wz + 0.6, 5, '#efe8d8', 1.6);
    },
    sharkSpr() { return SPR.shark(1, SPR.yawIndex(mgYawW(this.shark.dir > 0 ? 0 : Math.PI)), Math.floor(this.shark.tail) % 4 === 0 ? 0 : Math.floor(this.shark.tail) % 4 === 2 ? 2 : 1, 0, 0); },
    ground(x, y) { return y > 7.4 ? 1.0 : y > 4.2 ? 2.1 : 3.2; },
    idle(dt) { if (this.shark && this.shark.alive) { this.shark.x += this.shark.dir * dt * 2.6; if (this.shark.x > 16.4) this.shark.dir = -1; if (this.shark.x < 0.9) this.shark.dir = 1; this.shark.tail += dt * 6; } },
    prog() { return { s: this.score + ' 点' }; },
    cpuScore() { return Math.round(mgLv(18, 32, 48) + Math.random() * mgLv(10, 14, 16)); },
    draw(ctx, vw, vh) {
      mgCamera(vw, vh, 8.7, 5.6, 2.0, 4);
      const objs = [];
      for (const t of this.t) {
        if (t.st === 'gone') continue;
        const [x, y, z] = this.tPos(t);
        const rise = t.rise > 0 ? t.rise / 0.25 : 0;
        objs.push({ s: tSpr(t.kind, t.mat, Math.floor(t.fall)), x, y, z: z - rise * 0.9, g: TIERS[t.ti].top, a: rise > 0 ? 1 - rise : 1 });
      }
      if (this.shark.alive) objs.push({ s: this.sharkSpr(), x: this.shark.x, y: TIERS[1].y, z: TIERS[1].top, g: TIERS[1].top });
      mgDraw(ctx, vw, vh, objs, (c) => {
        mgFxDraw(c);
        // 輪ゴムの発射台(定規)
        const lx = vw / 2, ly = vh - 14;
        c.fillStyle = 'rgba(34,46,70,0.3)'; c.fillRect(lx - 30, ly + 3, 64, 8);
        c.fillStyle = '#d8d4c6'; c.fillRect(lx - 32, ly, 64, 9);
        c.fillStyle = '#efece2'; c.fillRect(lx - 32, ly, 64, 1);
        c.fillStyle = '#a7a294'; c.fillRect(lx - 32, ly + 8, 64, 1);
        c.fillStyle = '#6b6357'; for (let k = 0; k < 64; k += 4) c.fillRect(lx - 32 + k, ly + 1, 1, k % 16 === 0 ? 4 : 2);
        const loaded = this.cd <= 0 && this.left > 0;
        if (loaded) { pxLine(c, lx - 28, ly - 1, lx, ly - 5, '#ad6f47'); pxLine(c, lx, ly - 5, lx + 28, ly - 1, '#ad6f47'); }
        for (const b of this.bands) {
          const u = b.t / b.dur, x = b.x0 + (b.x1 - b.x0) * u, y = b.y0 + (b.y1 - b.y0) * u - Math.sin(u * Math.PI) * 30;
          const s = ringSpr(Math.floor(b.t * 20) % 4);
          c.drawImage(s.c, Math.round(x - s.ax), Math.round(y - s.ay + 1));
        }
        // ねらいの印
        if (!G.touch && this.aimX !== null) {
          const ax = Math.round(this.aimX), ay = Math.round(this.aimY);
          c.fillStyle = '#2b2622';
          c.fillRect(ax - 5, ay, 3, 1); c.fillRect(ax + 3, ay, 3, 1); c.fillRect(ax, ay - 5, 1, 3); c.fillRect(ax, ay + 3, 1, 3);
        }
        for (const p of this.pops) { const [sx, sy] = mgP(p.x, p.y, p.z + p.t * 0.8); txt(c, p.s, sx, sy - 6, 12, COL.red, true, 'c'); }
      });
    },
    hud(ctx, vw, vh) {
      mgHudNote(ctx, 6, 30, '点', String(this.score), COL.noteR, COL.noteRDark);
      mgHudNote(ctx, vw - 6, 30, 'のこり時間', String(Math.max(0, Math.ceil(TIME - MINI.t))), COL.noteY, COL.noteYDark, true);
      mgHudTag(ctx, vw, '輪ゴム あと ' + this.left + ' 本');
    },
  };
  mgRegister(G_);
})();
