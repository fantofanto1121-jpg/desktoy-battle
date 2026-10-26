// 文具つみ: 左右に動く文具をタイミングよく落として、本の上に高く積む
'use strict';

(function () {
  const BASE = { half: 2.4, top: 1.1 };
  // 種類: L は画面横の長さ、W は奥行き、H は高さ
  const KINDS = [
    { id: 'eraser', L: 3.4, W: 1.8, H: 1.0 },
    { id: 'pad', L: 2.6, W: 2.6, H: 0.75 },
    { id: 'match', L: 2.3, W: 1.45, H: 0.95 },
    { id: 'note', L: 4.1, W: 2.9, H: 0.48 },
    { id: 'sharp', L: 1.55, W: 1.15, H: 1.15 },
    { id: 'dice', L: 1.5, W: 1.5, H: 1.5 },
  ];
  function model(k) {
    const K = KINDS[k];
    const fill = {
      eraser: (x, y, z) => (Math.abs(x) < K.L * 0.28 ? (Math.abs(x) < K.L * 0.06 ? M.sleeveW : M.sleeve) : M.rubberW),
      pad: (x, y, z) => (z > K.H - 0.08 ? M.noteP : (Math.floor(z / 0.08) % 2 ? M.noteP : M.paper)),
      match: (x, y, z) => (z > K.H - 0.08 && Math.abs(x) < K.L * 0.3 && Math.abs(y) < K.W * 0.3 ? (Math.abs(y) < 0.08 ? M.red : M.white) : M.yellow),
      note: (x, y, z) => (z < 0.05 || z > K.H - 0.05 ? M.navy : (x < -K.L / 2 + 0.12 ? M.black : M.paper)),
      sharp: (x, y, z) => (x > K.L / 2 - 0.15 && Math.hypot(y, z - 0.58) < 0.2 ? M.black : (z > K.H - 0.12 ? M.steel : M.green)),
      dice: (x, y, z) => {
        // 天面と2つの側面に目
        const pip = (u, v, pts) => pts.some(([a, b]) => Math.hypot(u - a, v - b) < 0.15);
        if (z > K.H - 0.04 && pip(x, y, [[0, 0]])) return M.red;
        if (x > K.L / 2 - 0.05 && pip(y, z - 0.75, [[-0.38, 0.38], [0.38, -0.38]])) return M.black;
        if (y > K.W / 2 - 0.05 && pip(x, z - 0.75, [[-0.38, 0.38], [0, 0], [0.38, -0.38]])) return M.black;
        return M.white;
      },
    }[K.id];
    return makeModel({ size: [K.L, K.W, K.H], vs: 0.06, smooth: 1.1, fill: boxFill(K.L, K.W, K.H, K.id === 'note' ? 0.06 : 0.12, fill) });
  }
  // 画面横に長い向き(yaw = -45°)。tip は倒れる途中の傾き(0..3)、dir は倒れる向き
  const spr = (k, tip, dir) => mgSpr('st' + k + '|' + tip + '|' + dir, () => mgBake(mgModel('stK' + k, () => model(k)), { yaw: 0, pitch: tip * 0.45 * (dir || 1), sink: -0.65 * tip }));
  const sp = (s) => [s, 0];   // 横位置 -> ゲーム座標

  const G_ = {
    name: '文具つみ', tint: '#c56c5d', kind: 'race', view: [170, 170],
    howto: [
      '左右に動く文具を、タップ(Space)で落とします。',
      '下の物からはみ出しすぎると、くずれて終わり。',
      'ぴったり重ねると、少し長く続けやすくなります。',
    ],
    stageDef() {
      return {
        cx: 0, cy: 0,
        items: [{ x0: -2.4, y0: -1.8, x1: 2.4, y1: 1.8, z: 0, h: BASE.top, r: 0.08,
          top: (x, y, px, py) => {
            if (Math.abs(Math.min(2.4 - Math.abs(x), 1.8 - Math.abs(y)) - 0.25) < 0.04) return hexRGB('#d8c08a');
            return mgTone(['#a4564a', '#8f483d', '#773b33'].map(hexRGB), 0.8 + x * 0.2, px, py);
          },
          side: [hexRGB('#e6dfcf'), hexRGB('#d5cdbb'), hexRGB('#773b33')] }],
      };
    },
    icon() {
      return mgIcon('stack', 84, 54, (put) => { put(spr(1, 0, 1), 0, 0, -1.1); put(spr(5, 0, 1), 0.1, -0.1, -0.35); });
    },
    reset() {
      this.stack = [];   // { k, s (横位置), z, half }
      this.fall = [];    // くずれた物
      this.top = BASE.top; this.cur = null; this.opTop = undefined; this.opS = undefined; this.opC = null; this.over = false; this.camZ = BASE.top; this.perfect = 0; this.msgT = 0;
      this.next();
    },
    next() {
      const k = Math.floor(mgRand() * KINDS.length);
      const amp = 5.0, n = this.stack.length;
      this.cur = { k, t: mgRand() * 6, s: 0, z: this.top + 3.2, vz: 0, drop: false, half: KINDS[k].L / 2, spd: 1.3 + Math.min(2.2, n * 0.12), amp };
    },
    drop() { if (this.cur && !this.cur.drop && !this.over) { this.cur.drop = true; mgSnd('swish'); } },
    down() { this.drop(); },
    key(code) { if (code === 'Space' || code === 'Enter') this.drop(); },
    supportOf(i) { return i < 0 ? { s: 0, half: BASE.half } : this.stack[i]; },
    update(dt) {
      this.msgT -= dt;
      const c = this.cur;
      if (c && !this.over) {
        if (!c.drop) { c.t += dt * c.spd; c.s = Math.sin(c.t) * c.amp; }
        else {
          c.vz -= 26 * dt; c.z += c.vz * dt;
          if (c.z <= this.top) { c.z = this.top; this.land(c); }
        }
      }
      for (const f of this.fall) {
        f.t += dt; f.vz -= 22 * dt; f.z = Math.max(0, f.z + f.vz * dt); f.s += f.vs * dt;
        if (f.z === 0) { f.vs *= 0.9; if (f.vz < -3) mgSnd('soft'); f.vz = 0; }
      }
      this.camZ += (this.top - this.camZ) * Math.min(1, dt * 3);
      if (this.over && this.fall.every(f => f.z === 0) && !this.ended && this.overT > 1.2) {
        this.ended = true;
        const h = (this.top - BASE.top) * 2.6;
        mgFinish({ head: this.stack.length + ' 個', score: this.stack.length, unit: ' 個', lines: ['高さ ' + h.toFixed(1) + ' cm', 'ぴったり ' + this.perfect + ' 回'], good: true });
      }
      if (this.over) this.overT += dt;
    },
    land(c) {
      const sup = this.supportOf(this.stack.length - 1);
      let off = c.s - sup.s;
      if (Math.abs(off) < 0.18) { c.s = sup.s; off = 0; this.perfect++; this.msgT = 0.7; mgSnd('good'); }
      const item = { k: c.k, s: c.s, z: c.z, half: c.half };
      this.cur = null;
      if (Math.abs(off) > sup.half) { this.topple([item], Math.sign(off)); return; }
      this.stack.push(item);
      // 上に載っている物全体の重心が、その下の物の上に乗っているか
      for (let i = this.stack.length - 1; i >= 0; i--) {
        const above = this.stack.slice(i);
        let m = 0, ms = 0;
        for (const a of above) { const w = KINDS[a.k].L * KINDS[a.k].W * KINDS[a.k].H; m += w; ms += w * a.s; }
        const com = ms / m, under = this.supportOf(i - 1);
        if (Math.abs(com - under.s) > under.half) { this.topple(this.stack.splice(i), Math.sign(com - under.s)); return; }
      }
      this.top += KINDS[c.k].H;
      mgSnd('deliver');
      mgBurst(sp(c.s)[0], sp(c.s)[1], c.z, 3, '#efe8d8', 1);
      this.next();
    },
    topple(items, dir) {
      for (const it of items) this.fall.push({ ...it, vz: 1, vs: dir * (2 + mgRand()), t: 0, dir });
      this.over = true; this.overT = 0; mgSnd('fall');
    },
    // オンラインでは相手の塔をそのまま見せるので、積んだ物と動いている物も送る
    progRate: 0.08,
    prog() {
      const r = (v) => Math.round(v * 100) / 100, c = this.cur;
      return {
        s: this.stack.length + ' 個', top: r(this.top),
        st: this.stack.map(it => [it.k, r(it.s), r(it.z)]),
        c: c ? [c.k, r(c.s), r(c.z)] : null,
        f: this.fall.map(f => [f.k, r(f.s), r(f.z), Math.min(3, Math.floor(f.t * 5)), f.dir]),
      };
    },
    // 相手の塔を、左下の小窓に同じ絵で描く
    drawOp(ctx, vw, vh, op) {
      const w = Math.min(104, Math.floor(vw * 0.34)), h = Math.min(116, Math.floor(vh * 0.28));
      const x0 = 6, y0 = vh - h - 46;
      this.opTop = this.opTop === undefined ? op.top : this.opTop + (op.top - this.opTop) * 0.15;
      if (op.c) this.opS = this.opS === undefined || !this.opC || this.opC[0] !== op.c[0] ? op.c[1] : this.opS + (op.c[1] - this.opS) * 0.35;
      this.opC = op.c;
      const cam = { ox: MINI.cam.ox, oy: MINI.cam.oy };
      const [sx, sy] = mgScreen(0, 0, this.opTop + 1.2);
      MINI.cam.ox = Math.round(x0 + w / 2 - sx); MINI.cam.oy = Math.round(y0 + h * 0.58 - sy);
      shadowBox(ctx, x0 - 3, y0 - 3, w + 6, h + 18, 2);
      ctx.fillStyle = COL.paper; ctx.fillRect(x0 - 3, y0 - 3, w + 6, h + 18);
      ctx.save();
      ctx.beginPath(); ctx.rect(x0, y0, w, h); ctx.clip();
      const st = MINI.stage;
      ctx.fillStyle = st.fill; ctx.fillRect(x0, y0, w, h);
      ctx.drawImage(st.c, st.x + MINI.cam.ox, st.y + MINI.cam.oy);
      const objs = [];
      for (const [k, s2, z] of op.st) objs.push({ s: spr(k, 0, 1), x: s2, z, k: z });
      op.f.forEach(([k, s2, z, tip, dir], i) => objs.push({ s: spr(k, tip, dir), x: s2, z, k: 100 + i }));
      if (op.c) objs.push({ s: spr(op.c[0], 0, 1), x: this.opS, z: op.c[2], k: 200 });
      objs.sort((a, b) => a.k - b.k);
      for (const o of objs) { const [px, py] = mgP(o.x, 0, o.z); ctx.drawImage(o.s.c, px - o.s.ax, py - o.s.ay); }
      ctx.restore();
      ctx.fillStyle = COL.paperEdge; ctx.fillRect(x0 - 3, y0 + h + 14, w + 6, 1);
      txt(ctx, '相手の塔', x0, y0 + h + 3, 9, COL.inkSoft, true);
      MINI.cam.ox = cam.ox; MINI.cam.oy = cam.oy;
    },
    cpuScore() { return Math.round(mgLv(6, 10, 15) + Math.random() * mgLv(4, 5, 6)); },
    draw(ctx, vw, vh) {
      mgCamera(vw, vh, 0, 0, this.camZ + 1.2, Math.round(vh * 0.04));
      const objs = [];
      for (const it of this.stack) { const [x, y] = sp(it.s); objs.push({ s: spr(it.k, 0, 1), x, y, z: it.z, g: it.z, k: it.z }); }
      let fi = 0;
      for (const f of this.fall) {
        const [x, y] = sp(f.s), tip = Math.min(3, Math.floor(f.t * 5));
        objs.push({ s: spr(f.k, tip, f.dir), x, y, z: f.z, g: 0, k: 100 + fi++ });
      }
      const c = this.cur;
      if (c) { const [x, y] = sp(c.s); objs.push({ s: spr(c.k, 0, 1), x, y, z: c.z, g: this.top, k: 200 }); }
      mgDraw(ctx, vw, vh, objs, (g) => {
        mgFxDraw(g);
        // 落とす位置の目安(真下に点線)
        if (c && !c.drop) { const [x, y] = sp(c.s); mgDots(g, x, y, c.z, x, y, this.top, '#efe8d8', 3); }
      });
      const op = mgHuman() && MINI.net.op;
      if (op && op.st) this.drawOp(ctx, vw, vh, op);
    },
    hud(ctx, vw, vh) {
      mgHudNote(ctx, vw - 6, 30, '積んだ数', String(this.stack.length), COL.noteY, COL.noteYDark, true);
      mgHudTag(ctx, vw, '高さ ' + ((this.top - BASE.top) * 2.6).toFixed(1) + ' cm');
      if (this.msgT > 0) centerCard(ctx, vw, vh, [['ぴったり', 14, COL.red, true]], { up: 60 });
    },
  };
  mgRegister(G_);
})();
