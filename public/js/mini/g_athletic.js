// 文具アスレチック: ぜんまい人形を操作して、机の上の文具を跳び移りゴールの缶へ
'use strict';

(function () {
  // 足場。奥(画面の上)へ行くほど高くなるように並べる(手前の物が人形を隠さないため)
  const PL = [
    { k: 'note', x0: 22, y0: 22, x1: 28, y1: 28, top: 0.45, cp: [25.6, 25.6] },
    { k: 'eraser', x0: 19.2, y0: 24.0, x1: 20.8, y1: 25.3, top: 0.7 },
    { k: 'eraser', x0: 16.4, y0: 24.2, x1: 18.0, y1: 25.5, top: 0.7 },
    { k: 'eraser', x0: 13.4, y0: 23.6, x1: 15.0, y1: 24.9, top: 0.75 },
    { k: 'case', x0: 11, y0: 14, x1: 13.2, y1: 25, top: 1.05, cp: [12.1, 23.6] },
    { k: 'pad', c: 0, x0: 8.6, y0: 14.2, x1: 10.2, y1: 15.8, top: 1.4 },
    { k: 'pad', c: 1, x0: 6.2, y0: 14.2, x1: 7.8, y1: 15.8, top: 1.75 },
    { k: 'pad', c: 2, x0: 3.8, y0: 14.2, x1: 5.4, y1: 15.8, top: 2.1 },
    { k: 'tape', x0: 3.2, y0: 10.0, x1: 6.0, y1: 12.8, top: 2.3, r: 1.4, cp: [4.6, 11.0] },
    { k: 'book', x0: 2.4, y0: 2, x1: 6.8, y1: 7.6, top: 2.6, cp: [4.6, 6.6] },
    { k: 'pencil', x0: -6, y0: 4.4, x1: 2.4, y1: 5.0, top: 2.6 },
    { k: 'can', x0: -8.7, y0: 3.4, x1: -6.1, y1: 6.0, top: 2.9, r: 1.3, goal: true },
  ];
  const MP = { x: 4.6, y: 8.8, s: 1.3, top: 2.45, h: 0.5 };   // 動く足場(消しゴム)
  const SPEED = 3.4, JUMP = 7.4, GRAV = 22, RS = 1.4;   // RS: 人形の大きさ

  const ramp = (a) => a.map(hexRGB);
  const R_ = {
    navy: ramp(['#566c8f', '#475b7c', '#3a4b67']), rub: ramp(['#efeadf', '#dcd6ca', '#c4beb1']),
    sleeve: ramp(['#5f84ab', '#4a6c91', '#37516f']), green: ramp(['#7f9c6d', '#6c8a5b', '#58744a', '#4a6240']),
    pad: [ramp(['#ead98f', '#dcc977', '#c7b360']), ramp(['#e7bdb0', '#d6a797', '#bf8f80']), ramp(['#bfd6c0', '#a8c3a9', '#8fab90'])],
    tape: ramp(['#d9c9a6', '#c8b690', '#b09e79']), book: ramp(['#a4564a', '#8f483d', '#773b33']),
    pen: ramp(['#e0b84f', '#c99f3e', '#a8822f']), can: ramp(['#d3d8db', '#b8bfc4', '#9aa2a8']),
  };
  const SIDES = {
    note: ['#3c4e6b', '#32425b', '#27344a'], eraser: ['#d2ccbf', '#bdb7aa', '#9f998d'], case: ['#58744a', '#4b6440', '#3e5335'],
    pad: ['#d7d1c3', '#c6bfb0', '#aaa293'], tape: ['#bca883', '#a8946f', '#8c7a59'], book: ['#e6dfcf', '#d5cdbb', '#7a3d34'],
    pencil: ['#b48d35', '#9c7a2d', '#7c6024'], can: ['#a4abb1', '#8d949a', '#737a80'],
  };
  function topFn(p) {
    return (x, y, px, py) => {
      const u = (x - p.x0) / (p.x1 - p.x0), v = (y - p.y0) / (p.y1 - p.y0);
      const L0 = 0.4 + (1 - u) * 0.6 + (vnoise(x * 1.3, y * 1.3) - 0.5) * 0.5;
      switch (p.k) {
        case 'note': {
          if (u > 0.55 && u < 0.85 && v > 0.3 && v < 0.75) {
            const lab = mgTone(R_.rub, 0.3, px, py);
            if (mgCross((a, b) => b, x, y, 0.55) && v > 0.4) return hexRGB('#9fb4c0');
            return lab;
          }
          return mgTone(R_.navy, L0, px, py);
        }
        case 'eraser': return u > 0.3 && u < 0.7 ? mgTone(R_.sleeve, L0, px, py) : mgTone(R_.rub, L0 - 0.3, px, py);
        case 'case': {
          const c = (p.x0 + p.x1) / 2;
          if (Math.abs(x - c) < 0.09) return Math.floor(y / 0.18) % 2 ? hexRGB('#3e3d3a') : hexRGB('#8f969b');
          if (Math.abs(x - c) < 0.16) return hexRGB('#4a5f3f');
          if (Math.abs(y - (p.y1 - 0.5)) < 0.22 && Math.abs(x - c) < 0.3) return hexRGB('#b9c0c6');   // 引き手
          return mgTone(R_.green, L0 + (hash2(px, py) > 0.8 ? 1 : 0), px, py);
        }
        case 'pad': {
          if (v < 0.18) return mgTone(R_.pad[p.c], 1.6, px, py);   // のりの帯
          return mgTone(R_.pad[p.c], L0 - 0.3, px, py);
        }
        case 'tape': {
          const r = Math.hypot(x - (p.x0 + p.x1) / 2, y - (p.y0 + p.y1) / 2);
          if (r < 0.42) return hexRGB('#3b3027');
          if (r < 0.56) return hexRGB('#a98b62');
          if (mgCross((a, b) => Math.hypot(a - (p.x0 + p.x1) / 2, b - (p.y0 + p.y1) / 2), x, y, 0.22)) return R_.tape[2];
          return mgTone(R_.tape, L0 - 0.2, px, py);
        }
        case 'book': {
          const e = Math.min(x - p.x0, p.x1 - x, y - p.y0, p.y1 - y);
          if (Math.abs(e - 0.3) < 0.05) return hexRGB('#c39a55');
          return mgTone(R_.book, L0, px, py);
        }
        case 'pencil': {
          if (x < p.x0 + 0.5) return Math.abs(y - (p.y0 + p.y1) / 2) < 0.05 + (x - p.x0) * 0.2 ? hexRGB('#4a4a4e') : hexRGB('#b98b5c');
          if (x < p.x0 + 1.3) return Math.abs(y - (p.y0 + p.y1) / 2) < (x - p.x0) * 0.3 ? hexRGB('#e6c99c') : R_.pen[2];
          if (x > p.x1 - 0.5) return hexRGB('#d39d92');
          if (x > p.x1 - 0.9) return Math.floor(x / 0.08) % 2 ? hexRGB('#c5cbd0') : hexRGB('#9aa2a8');
          return v < 0.33 ? R_.pen[0] : v < 0.66 ? R_.pen[1] : R_.pen[2];
        }
        case 'can': {
          const r = Math.hypot(x - (p.x0 + p.x1) / 2, y - (p.y0 + p.y1) / 2);
          if (r > 1.12) return R_.can[2];
          if (mgCross((a, b) => Math.hypot(a - (p.x0 + p.x1) / 2, b - (p.y0 + p.y1) / 2), x, y, 0.3)) return R_.can[2];
          return mgTone(R_.can, L0 - 0.2, px, py);
        }
      }
      return [200, 0, 200];
    };
  }

  // ぜんまい人形(+x向き)。pose: 0 立ち, 1 / 2 足を前後
  function robotModel(pose) {
    return makeModel({
      size: [0.7 * RS, 0.62 * RS, 1.12 * RS], vs: 0.04, smooth: 1.2,
      fill(x, y, z) {
        x /= RS; y /= RS; z /= RS;
        // 足
        const sw = pose === 1 ? 0.09 : pose === 2 ? -0.09 : 0;
        for (const [ly, s] of [[-0.12, sw], [0.12, -sw]]) if (z < 0.26 && Math.abs(y - ly) < 0.07 && Math.abs(x - s) < 0.1) return M.black;
        // 胴体
        if (z >= 0.24 && z < 0.68 && Math.abs(x) < 0.21 && Math.abs(y) < 0.24) {
          if (x > 0.17 && Math.abs(y) < 0.1 && z > 0.38 && z < 0.56) return M.yellow;   // 胸の板
          return M.red;
        }
        // 腕
        if (z > 0.36 && z < 0.64 && Math.abs(Math.abs(y) - 0.28) < 0.05 && Math.abs(x + (y > 0 ? sw : -sw) * 0.8) < 0.07) return M.red;
        // 頭
        if (z >= 0.68 && z < 1.0 && Math.abs(x) < 0.22 && Math.abs(y) < 0.22) {
          if (x > 0.19 && z > 0.8 && z < 0.88 && Math.abs(Math.abs(y) - 0.09) < 0.035) return M.eye;
          return M.white;
        }
        if (z >= 1.0 && z < 1.1 && Math.abs(x) < 0.03 && Math.abs(y) < 0.03) return M.metal;   // アンテナ
        // 背中のねじ
        if (x < -0.21 && x > -0.33 && Math.abs(y) < 0.03 && Math.abs(z - 0.5) < 0.04) return M.metal;
        if (x < -0.3 && x > -0.35 && Math.abs(y) < 0.13 && Math.abs(z - 0.5) < 0.1 && !(Math.abs(y) < 0.04 && Math.abs(z - 0.5) < 0.03)) return M.metal;
        return 0;
      },
      origin: [-0.35 * RS, -0.31 * RS, 0],
    });
  }
  const robo = (yaw, pose) => mgSpr('robo' + SPR.yawIndex(yaw) + '|' + pose, () => mgBake(mgModel('robo' + pose, () => robotModel(pose)), { yaw: SPR.yawIndex(yaw) / SPR.YAWS * Math.PI * 2 }));
  window.mgRobot = robo;   // 画鋲よけでも使う
  const mpSpr = () => mgSpr('athMp', () => mgBake(mgModel('athMp', () => mgEraserModel(MP.s, MP.s, MP.h, 'sleeve', 'sleeveW')), {}));
  const flagSpr = () => mgSpr('athFlag', () => mgBake(mgModel('athFlag', () => makeModel({
    size: [0.1, 0.9, 1.5], vs: 0.04, origin: [-0.05, -0.05, 0],
    fill(x, y, z) {
      if (Math.abs(x) < 0.04 && Math.abs(y) < 0.04) return M.pWood;
      if (y > 0.03 && y < 0.8 && z > 1.0 && z < 1.45 - y * 0.2 && Math.abs(x) < 0.02) return M.noteP;
      return 0;
    },
  })), {}));

  function inP(p, x, y) {
    if (p.r) return Math.hypot(x - (p.x0 + p.x1) / 2, y - (p.y0 + p.y1) / 2) <= p.r;
    return x >= p.x0 && x <= p.x1 && y >= p.y0 && y <= p.y1;
  }

  const G_ = {
    name: '文具アスレチック', tint: '#7f9a6a', kind: 'race',
    howto: [
      'ぜんまい人形を動かして、文具の足場を跳び移ります。',
      '奥の缶の旗まで行けばゴール。落ちたら前の場所から。',
      '動く消しゴムに乗って、すき間をわたろう。',
    ],
    stageDef() {
      return {
        cx: 9, cy: 14, halfW: 700, halfH: 430,
        items: PL.map(p => ({ x0: p.x0, y0: p.y0, x1: p.x1, y1: p.y1, z: 0, h: p.top, r: p.r || (p.k === 'eraser' || p.k === 'pad' ? 0.1 : 0.05), top: topFn(p), side: SIDES[p.k].map(hexRGB) })),
      };
    },
    icon() {
      return mgIcon('athletic', 84, 50, (put) => { put(mpSpr(), 0.4, 0.6, 0); put(robo(0.6, 1), 0.3, 0.5, MP.h); put(flagSpr(), -1.6, -0.6, 0); });
    },
    ground(x, y) {
      let g = 0;
      for (const p of PL) if (p.top > g && inP(p, x, y)) g = p.top;
      if (Math.abs(x - MP.x) <= MP.s / 2 && Math.abs(y - MP.y) <= MP.s / 2 && MP.top > g) g = MP.top;
      return g;
    },
    reset() {
      this.p = { x: 25.6, y: 25.6, z: PL[0].top, vx: 0, vy: 0, vz: 0, yaw: Math.PI, walk: 0, air: 0 };
      this.cp = PL[0].cp; this.lastTop = PL[0].top; this.falls = 0; this.fade = 0; this.jq = 0; this.jUsed = 0;
      this.mpT = 0; this.done = false; this.camX = null;
      mgPadReset();
    },
    key(code) { if (code === 'Space' || code === 'KeyJ') this.jq++; },
    down(x, y, id) { mgPadDown(x, y, id); },
    move(x, y, d, id) { mgPadMove(x, y, id); },
    up(x, y, id) { mgPadUp(id); },
    update(dt) {
      const p = this.p;
      // 動く足場
      this.mpT += dt;
      const ny = 8.8 + Math.sin(this.mpT * 1.1) * 0.55, mdy = ny - MP.y;
      const onMp = Math.abs(p.x - MP.x) <= MP.s / 2 && Math.abs(p.y - MP.y) <= MP.s / 2 && Math.abs(p.z - MP.top) < 0.02;
      MP.y = ny;
      if (onMp) p.y += mdy;
      if (this.fade > 0) {
        this.fade -= dt;
        if (this.fade <= 0.25 && this.fade + dt > 0.25) { p.x = this.cp[0]; p.y = this.cp[1]; p.z = this.ground(p.x, p.y); p.vx = p.vy = p.vz = 0; }
        return;
      }
      if (this.done) return;
      const [dx, dy] = mgPadDir();
      const k = Math.min(1, dt * (p.air > 0.05 ? 5 : 14));
      p.vx += (dx * SPEED - p.vx) * k; p.vy += (dy * SPEED - p.vy) * k;
      if (Math.hypot(dx, dy) > 0.2) p.yaw = Math.atan2(dy, dx);
      const g0 = this.ground(p.x, p.y), onG = p.z <= g0 + 0.01 && p.vz <= 0;
      if (onG) p.air = 0; else p.air += dt;
      const want = this.jq + MGPAD.bq;
      if (want !== this.jUsed) {
        this.jUsed = want;
        if (p.air < 0.12) { p.vz = JUMP; p.air = 0.2; mgSnd('tap'); }
      }
      // 横の移動(高い段差は壁)
      const nx = p.x + p.vx * dt;
      if (this.ground(nx, p.y) <= p.z + 0.32) p.x = nx; else p.vx = 0;
      const ny2 = p.y + p.vy * dt;
      if (this.ground(p.x, ny2) <= p.z + 0.32) p.y = ny2; else p.vy = 0;
      p.vz -= GRAV * (p.vz < 0 ? 1.25 : 1) * dt;
      p.z += p.vz * dt;
      const g = this.ground(p.x, p.y);
      if (p.z <= g && p.vz <= 0) {
        if (p.vz < -4) { mgSnd('soft'); mgBurst(p.x, p.y, g, 3, '#efe8d8', 1); }
        p.z = g; p.vz = 0;
        if (g > 0.01) this.lastTop = g;
        for (const q of PL) if (q.cp && inP(q, p.x, p.y) && Math.abs(q.top - g) < 0.01) this.cp = q.cp;
        const goal = PL[PL.length - 1];
        if (inP(goal, p.x, p.y) && Math.abs(goal.top - g) < 0.01 && !this.done) {
          this.done = true;
          mgFinish({ head: 'ゴール', score: +MINI.t.toFixed(1), unit: ' 秒', low: true, lines: ['タイム ' + MINI.t.toFixed(1) + ' 秒', '落ちた回数 ' + this.falls], good: true });
        }
      }
      if (p.z < this.lastTop - 1.4) { this.falls++; this.fade = 0.6; mgSnd('fall'); }
      const sp = Math.hypot(p.vx, p.vy);
      p.walk += dt * (onG && sp > 0.5 ? sp * 2.4 : 0);
    },
    prog() { const p = this.p; return { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2), yaw: +p.yaw.toFixed(2), w: +p.walk.toFixed(1), air: p.air > 0.05 ? 1 : 0 }; },
    cpuScore() { return +(mgLv(50, 36, 27) + Math.random() * 8).toFixed(1); },
    idle(dt) { this.mpT += dt; MP.y = 8.8 + Math.sin(this.mpT * 1.1) * 0.55; },
    draw(ctx, vw, vh) {
      const p = this.p;
      const [tx, ty] = mgScreen(p.x, p.y, p.z);
      if (this.camX === null) { this.camX = tx; this.camY = ty; }
      this.camX += (tx - this.camX) * 0.12; this.camY += (ty - this.camY) * 0.12;
      MINI.cam.ox = Math.round(vw / 2 - this.camX); MINI.cam.oy = Math.round(vh / 2 - this.camY + 14);
      const pose = p.air > 0.05 ? 1 : Math.floor(p.walk) % 4 === 1 ? 1 : Math.floor(p.walk) % 4 === 3 ? 2 : 0;
      const g = this.ground(p.x, p.y);
      const alpha = this.fade > 0 ? Math.max(0, (this.fade - 0.25) / 0.35) : 1;
      const goal = PL[PL.length - 1];
      const objs = [
        { s: mpSpr(), x: MP.x, y: MP.y, z: MP.top - MP.h, g: 0 },
        { s: flagSpr(), x: (goal.x0 + goal.x1) / 2, y: (goal.y0 + goal.y1) / 2, z: goal.top, g: goal.top },
        { s: robo(p.yaw, pose), x: p.x, y: p.y, z: p.z, g, a: alpha, k: 1e4 },
      ];
      const op = mgHuman() && MINI.net.op;
      if (op) { const q = Math.floor(op.w) % 4; objs.push({ s: robo(op.yaw, op.air ? 1 : q === 1 ? 1 : q === 3 ? 2 : 0), x: op.x, y: op.y, z: op.z, g: this.ground(op.x, op.y), a: 0.4, ns: true, k: 1e4 - 1 }); }
      mgDraw(ctx, vw, vh, objs, (c) => mgFxDraw(c));
    },
    hud(ctx, vw, vh) {
      mgHudNote(ctx, vw - 6, 30, 'タイム', MINI.t.toFixed(1), COL.noteY, COL.noteYDark, true);
      mgHudTag(ctx, vw, '落ちた ' + this.falls + ' 回');
      mgPadDraw(ctx, vw, vh, 'ジャンプ');
    },
  };
  mgRegister(G_);
})();
