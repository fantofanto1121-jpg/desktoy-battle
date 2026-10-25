// 画鋲よけ: 上から降ってくる画鋲をよけながら、金のクリップを集める
'use strict';

(function () {
  const AR = { x0: 0, y0: 0, x1: 12, y1: 12 }, FL = 0.08, LIVES = 3;
  const MATS = ['tack', 'tackY', 'tackB'];

  // 画鋲。up: 針が上(落ちたあと)、そうでなければ針が下(落ちている途中)
  function tackModel(mat, up) {
    return makeModel({
      size: [0.8, 0.8, 1.0], vs: 0.035, smooth: 1.3,
      fill(x, y, z) {
        const r = Math.hypot(x, y);
        const h = up ? z : 1.0 - z;   // 頭からの高さ
        if (h < 0.12) return r < 0.36 ? M[mat] : 0;                         // 平たい頭
        if (h < 0.5) return r < 0.17 - (h - 0.12) * 0.15 ? M[mat] : 0;      // つまみ
        if (h < 0.95) return r < 0.04 ? M.steel : 0;                       // 針
        return 0;
      },
    });
  }
  const tack = (c, up) => mgSpr('tk' + c + (up ? 'u' : 'd'), () => mgBake(mgModel('tk' + c + (up ? 'u' : 'd'), () => tackModel(MATS[c], up)), { yaw: 0.5 }));
  const goldClip = () => mgSpr('tkGold', () => {
    const m = mgModel('tkGoldM', () => makeModel(mgScale({
      size: [0.9, 0.5, 0.1], vs: 0.035, smooth: 1.3,
      fill(x, y, z) {
        const ax = Math.abs(x), ay = Math.abs(y);
        const ring = (w, h) => { const qx = Math.max(ax - w, 0), d = Math.hypot(qx, ay) ; return Math.abs((ax <= w ? ay : d) - h) < 0.04; };
        return ring(0.25, 0.2) || ring(0.17, 0.1) ? M.gold : 0;
      },
    }, 1.7)));
    return mgBake(m, { yaw: 0.8 });
  });

  const G_ = {
    name: '画鋲よけ', tint: '#c45c4a', kind: 'race',
    howto: [
      '上から画鋲が降ってきます。影の輪から逃げよう。',
      '落ちた画鋲は針が上。しばらく踏まないように。',
      '金のクリップを拾うと+5点。3回当たると終わりです。',
    ],
    stageDef() {
      return {
        cx: 6, cy: 6,
        items: [
          { x0: AR.x0, y0: AR.y0, x1: AR.x1, y1: AR.y1, z: 0, h: FL,
            top(x, y, px, py) {
              const sp = hash2(px * 7, py * 3);
              if (sp > 0.95) return hexRGB('#8e6a3f');   // コルクの粒
              return mgTone(['#e0bd85', '#d4ae75', '#c49d66', '#b28c58'].map(hexRGB), 0.8 + (hash2(px, py) > 0.75 ? 1 : 0) + (vnoise(x * 0.8, y * 0.8) - 0.5), px, py);
            },
            side: ['#b28c58', '#9c7a4c', '#806440'].map(hexRGB) },
          ...[[-0.45, -0.45, 12.45, 0], [-0.45, 12, 12.45, 12.45], [-0.45, 0, 0, 12], [12, 0, 12.45, 12]].map(([x0, y0, x1, y1]) => ({ x0, y0, x1, y1, z: 0, h: 0.22,
            top: (x, y, px, py) => mgTone(['#9b6e45', '#875f3b', '#734f31'].map(hexRGB), 0.6 + (vnoise(x * 3, y * 3) - 0.5), px, py),
            side: ['#6e4b2f', '#5d3f27', '#4c3320'].map(hexRGB) })),
        ],
      };
    },
    icon() {
      return mgIcon('tack', 84, 52, (put) => { put(tack(0, 1), -1, 0.4, 0); put(tack(2, 0), 0.6, -0.6, 0.8); put(tack(1, 1), 0.9, 0.7, 0); });
    },
    reset() {
      this.p = { x: 6, y: 6, vx: 0, vy: 0, yaw: Math.PI * 1.25, walk: 0, imm: 0, stun: 0 };
      this.tacks = []; this.gold = null; this.lives = LIVES; this.clips = 0; this.spawnT = 1; this.goldT = 3; this.dead = false;
      mgPadReset();
    },
    down(x, y, id) { mgPadDown(x, y, id, true); },
    move(x, y, d, id) { mgPadMove(x, y, id); },
    up(x, y, id) { mgPadUp(id); },
    update(dt) {
      const p = this.p, t = MINI.t;
      if (this.dead) return;
      // 時間がたつほど多く降る
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        const n = 1 + Math.floor(t / 20) + (mgRand() < 0.3 ? 1 : 0);
        for (let k = 0; k < n; k++) {
          // 半分はプレイヤーの近くをねらう
          const near = mgRand() < 0.5;
          const x = near ? p.x + (mgRand() - 0.5) * 3 : 0.6 + mgRand() * 10.8, y = near ? p.y + (mgRand() - 0.5) * 3 : 0.6 + mgRand() * 10.8;
          this.tacks.push({ x: Math.max(0.5, Math.min(11.5, x)), y: Math.max(0.5, Math.min(11.5, y)), z: 9, vz: -2, c: Math.floor(mgRand() * 3), up: false, life: 3.2, warn: 0 });
        }
        this.spawnT = Math.max(0.35, 1.1 - t * 0.012) * (0.7 + mgRand() * 0.6);
      }
      for (let i = this.tacks.length - 1; i >= 0; i--) {
        const k = this.tacks[i];
        if (!k.up) {
          k.vz -= 14 * dt; k.z += k.vz * dt;
          if (k.z <= FL) {
            k.z = FL; k.up = true; mgSnd('metal');
            if (Math.hypot(k.x - p.x, k.y - p.y) < 0.55) this.hit(k.x, k.y);
          }
        } else {
          k.life -= dt;
          if (k.life <= 0) { this.tacks.splice(i, 1); continue; }
          if (Math.hypot(k.x - p.x, k.y - p.y) < 0.42) this.hit(k.x, k.y);
        }
      }
      // 移動
      p.imm -= dt; p.stun -= dt;
      const [dx, dy] = p.stun > 0 ? [0, 0] : mgPadDir();
      const k = Math.min(1, dt * 14);
      p.vx += (dx * 4.2 - p.vx) * k; p.vy += (dy * 4.2 - p.vy) * k;
      p.x = Math.max(0.4, Math.min(11.6, p.x + p.vx * dt)); p.y = Math.max(0.4, Math.min(11.6, p.y + p.vy * dt));
      if (Math.hypot(dx, dy) > 0.2) p.yaw = Math.atan2(dy, dx);
      p.walk += dt * Math.hypot(p.vx, p.vy) * 2.4;
      // 金のクリップ
      this.goldT -= dt;
      if (!this.gold && this.goldT <= 0) this.gold = { x: 1 + mgRand() * 10, y: 1 + mgRand() * 10, t: 0 };
      if (this.gold) {
        this.gold.t += dt;
        if (Math.hypot(this.gold.x - p.x, this.gold.y - p.y) < 0.7) { this.clips++; mgSnd('good'); mgBurst(this.gold.x, this.gold.y, 0.4, 6, '#e2c35a', 1.5); this.gold = null; this.goldT = 2 + mgRand() * 2; }
        else if (this.gold.t > 7) { this.gold = null; this.goldT = 1; }
      }
    },
    hit(x, y) {
      const p = this.p;
      if (p.imm > 0) return;
      this.lives--; p.imm = 1.6; p.stun = 0.35; mgSnd('bite');
      const dx = p.x - x, dy = p.y - y, d = Math.hypot(dx, dy) || 1;
      p.vx = dx / d * 5; p.vy = dy / d * 5;
      if (this.lives <= 0) {
        this.dead = true;
        const sc = Math.floor(MINI.t) + this.clips * 5;
        mgFinish({ head: sc + ' 点', score: sc, unit: ' 点', lines: ['よけた時間 ' + MINI.t.toFixed(1) + ' 秒', '金のクリップ ' + this.clips + ' 個'], good: true });
      }
    },
    prog() { const p = this.p; return { x: +p.x.toFixed(2), y: +p.y.toFixed(2), yaw: +p.yaw.toFixed(2), w: +p.walk.toFixed(1), s: (Math.floor(MINI.t) + this.clips * 5) + ' 点' }; },
    cpuScore() { return Math.round(mgLv(20, 38, 60) + Math.random() * mgLv(15, 20, 25)); },
    draw(ctx, vw, vh) {
      mgCamera(vw, vh, 6, 6, FL, 8);
      const p = this.p, objs = [];
      const pose = Math.floor(p.walk) % 4 === 1 ? 1 : Math.floor(p.walk) % 4 === 3 ? 2 : 0;
      const blink = p.imm > 0 && Math.floor(p.imm * 10) % 2 === 0;
      objs.push({ s: window.mgRobot(p.yaw, pose), x: p.x, y: p.y, z: FL, g: FL, a: blink ? 0.35 : 1 });
      const op = mgHuman() && MINI.net.op;
      if (op) { const q = Math.floor(op.w) % 4; objs.push({ s: window.mgRobot(op.yaw, q === 1 ? 1 : q === 3 ? 2 : 0), x: op.x, y: op.y, z: FL, g: FL, a: 0.4, ns: true }); }
      for (const k of this.tacks) objs.push({ s: tack(k.c, k.up), x: k.x, y: k.y, z: k.up ? FL : k.z, g: FL, ns: k.z > 2.5, a: k.up && k.life < 0.6 ? k.life / 0.6 : 1 });
      if (this.gold) objs.push({ s: goldClip(), x: this.gold.x, y: this.gold.y, z: FL + 0.15 + Math.sin(this.gold.t * 4) * 0.08, g: FL, a: this.gold.t > 5.5 && Math.floor(this.gold.t * 8) % 2 ? 0.4 : 1 });
      mgDraw(ctx, vw, vh, objs, (c) => {
        // 落ちる場所の輪(近づくほど小さく濃く)
        for (const k of this.tacks) {
          if (k.up) continue;
          const u = Math.max(0, Math.min(1, k.z / 9));
          mgRing(c, k.x, k.y, FL, 0.45 + u * 0.9, u < 0.3 ? '#a8493c' : '#3a342d', u < 0.3 ? 1 : 2);
        }
        mgFxDraw(c);
      });
    },
    hud(ctx, vw, vh) {
      mgHudNote(ctx, 6, 30, 'のこり', String(this.lives), COL.noteR, COL.noteRDark);
      mgHudNote(ctx, vw - 6, 30, '金のクリップ', String(this.clips), COL.noteY, COL.noteYDark, true);
      mgHudTag(ctx, vw, MINI.t.toFixed(1) + ' 秒');
      mgPadDraw(ctx, vw, vh, null);
    },
  };
  mgRegister(G_);
})();
