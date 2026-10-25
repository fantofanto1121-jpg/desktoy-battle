// 定規カーリング: 30cm定規の上で硬貨を滑らせ、奥の的の中心に近づける
'use strict';

defMat('silver', ['#d5d9dc', '#b3b9bd', '#8e959a'], '#4d5357', 'metal');

(function () {
  // 定規は奥(画面の上)へのびる。的が奥、投げる位置が手前
  const RU = { x0: 0, y0: 0, x1: 3.2, y1: 21 }, TOP = 0.14, LEN = 21, WID = 3.2;
  const TG = { x: 1.6, y: 3.4 }, START = { x: 1.6, y: 19.2 };
  const STONES = 4, FRIC = 3.2, VMAX = 9.5, MAXP = 3.4;

  function coinModel(mat) {
    return makeModel({
      size: [1.1, 1.1, 0.16], vs: 0.035, smooth: 1.2,
      fill(x, y, z) {
        const r = Math.hypot(x, y);
        if (r > 0.52) return 0;
        // 縁を少し高く、中央に刻印のくぼみ
        if (z > 0.12 && r < 0.42 && r > 0.1 && !(Math.abs(x) < 0.05 && r < 0.3)) return 0;
        return M[mat];
      },
    });
  }
  const coin = (team) => mgSpr('cu' + team, () => mgBake(mgModel('cuCoin' + team, () => coinModel(team ? 'silver' : 'copper')), {}));

  const G_ = {
    name: '定規カーリング', tint: '#c99a6a', cpu: true, kind: 'duel', noFlip: true,
    howto: [
      '手前の硬貨から指を引いて、はなすと滑ります。',
      '交代で4枚ずつ。最後に的の中心に一番近い色が、',
      '相手の一番近い硬貨より内側にある枚数だけ点になります。',
    ],
    stageDef() {
      return {
        cx: 1.6, cy: 11,
        items: [{ x0: RU.x0, y0: RU.y0, x1: RU.x1, y1: RU.y1, z: 0, h: TOP, r: 0.12, edge: hexRGB('#f1e3c4'),
          top(xn, yn, px, py) {
            // 長さ方向を x、幅方向を y として塗る(幅の手前側 = 画面の右の縁に目盛り)
            const x = yn, y = xn;
            let col = mgTone(['#e9d3a8', '#dcc394', '#cbb07f', '#b99c6c'].map(hexRGB), 0.8 + (vnoise(x * 0.4, y * 2) - 0.5) * 0.5 + (Math.sin(y * 11 + vnoise(x * 0.25, y) * 5) > 0.92 ? 1 : 0), px, py);
            // 目盛り(手前の縁)
            const fy = WID - y, cm = (LEN - 0.5 - x) / 0.7;
            if (cm > 0 && cm < 29.2) {
              const len = Math.abs(cm - Math.round(cm)) < 0.07 ? (Math.round(cm) % 5 === 0 ? 0.55 : 0.35) : (Math.abs(cm * 2 - Math.round(cm * 2)) < 0.14 ? 0.2 : 0);
              if (len && fy < len && mgCross((a, b) => (LEN - 0.5 - b) / 0.35, xn, yn, 1)) col = hexRGB('#4a3d2c');
              if (fy < 0.04) col = hexRGB('#6b5a43');
            }
            // 的
            const r = Math.hypot(xn - TG.x, yn - TG.y);
            if (r < 1.25) {
              if (r < 0.32) col = mgTone(['#c45c4a', '#a3483b', '#8b3d32'].map(hexRGB), 0.6, px, py);
              else if (r < 0.78) col = mgTone(['#f1ece0', '#e2dccf', '#d1cbbd'].map(hexRGB), 0.6, px, py);
              else col = mgTone(['#5f84ab', '#4a6c91', '#3d5a7a'].map(hexRGB), 0.6, px, py);
              if (mgCross((a, b) => Math.hypot(a - TG.x, b - TG.y), xn, yn, 100) || Math.abs(r - 1.25) < 0.03) col = hexRGB('#3a342d');
            }
            // 投げる線
            if (Math.abs(yn - (START.y - 0.9)) < 0.05 && fy > 0.7) col = hexRGB('#a8493c');
            return col;
          },
          side: ['#c4a679', '#ae9064', '#8d744f'].map(hexRGB) }],
      };
    },
    icon() {
      return mgIcon('curling', 84, 50, (put) => { put(coin(0), -0.7, 0.5, 0); put(coin(1), 0.6, -0.3, 0); put(coin(0), 1.3, 0.9, 0); });
    },
    reset() {
      this.coins = []; this.thrown = [0, 0]; this.turn = 0; this.phase = 'aim'; this.sel = null; this.aim = null; this.cpuT = 1; this.plan = null;
      this.spawn();
    },
    spawn() {
      const c = { team: this.turn, x: START.x, y: START.y, z: TOP, vx: 0, vy: 0, vz: 0, r: 0.52, m: 1, a: 0, w: 0, out: false, g: TOP };
      this.coins.push(c); this.active = c;
    },
    onRu(x, y) { return x >= RU.x0 && x <= RU.x1 && y >= RU.y0 && y <= RU.y1; },
    down(sx, sy) {
      if (this.phase !== 'aim' || this.turn !== MINI.seat) return;
      this.sel = this.active; this.aim = { dx: 0, dy: 0 }; mgSnd('tap');
    },
    move(sx, sy) {
      if (!this.sel) return;
      const [x, y] = mgToWorld(sx, sy, TOP);
      let dx = x - this.sel.x, dy = y - this.sel.y;
      const l = Math.hypot(dx, dy);
      if (l > MAXP) { dx *= MAXP / l; dy *= MAXP / l; }
      this.aim.dx = dx; this.aim.dy = dy;
    },
    up() {
      if (!this.sel) return;
      const l = Math.hypot(this.aim.dx, this.aim.dy);
      if (l > 0.3 && this.phase === 'aim' && this.turn === MINI.seat) mgInput({ ux: -this.aim.dx / l, uy: -this.aim.dy / l, p: l / MAXP });
      this.sel = null; this.aim = null;
    },
    onAct(seat, a) {
      const l = Math.hypot(+a.ux || 0, +a.uy || 0);
      if (this.phase !== 'aim' || this.turn !== seat || !l) return;
      this.shoot(a.ux / l, a.uy / l, Math.max(0, Math.min(1, +a.p || 0)));
    },
    shoot(ux, uy, p) {
      const v = VMAX * (0.25 + 0.75 * p), c = this.active;
      c.vx = ux * v; c.vy = uy * v; c.w = (Math.random() - 0.5) * 3;
      this.phase = 'move'; this.moveT = 0; this.thrown[this.turn]++;
      mgSnd('swish');
    },
    simulate(ux, uy, p) {
      const cs = this.coins.map(c => ({ ...c }));
      const a = cs[cs.length - 1], v = VMAX * (0.25 + 0.75 * p);
      a.vx = ux * v; a.vy = uy * v;
      for (let t = 0; t < 5; t += 1 / 30) {
        mgDiscs(cs.filter(c => !c.out), 1 / 30, FRIC);
        for (const c of cs) if (!c.out && !this.onRu(c.x, c.y)) c.out = true;
      }
      return this.score(cs, 1);
    },
    // その並びでの得点(team から見た点差)
    score(cs, team) {
      const live = cs.filter(c => !c.out).map(c => ({ c, d: Math.hypot(c.x - TG.x, c.y - TG.y) })).filter(o => o.d < 1.25 + 0.52).sort((a, b) => a.d - b.d);
      if (!live.length) return 0;
      const w = live[0].c.team, other = live.find(o => o.c.team !== w);
      const n = live.filter(o => o.c.team === w && (!other || o.d < other.d)).length;
      return (w === team ? n : -n) * 10 - (live[0].c.team === team ? live[0].d : -live[0].d);
    },
    cpuPlan() {
      const tries = mgLv(6, 18, 45), noise = mgLv(0.06, 0.025, 0.008);
      let best = null, bs = -1e9;
      for (let k = 0; k < tries; k++) {
        // 的の中心か、相手の硬貨をねらう
        const foes = this.coins.filter(c => c.team === 0 && !c.out && Math.hypot(c.x - TG.x, c.y - TG.y) < 1.8);
        const tgt = foes.length && Math.random() < 0.5 ? foes[Math.floor(Math.random() * foes.length)] : TG;
        const a = Math.atan2(tgt.y - START.y, tgt.x - START.x) + (Math.random() - 0.5) * 0.06;
        const dist = Math.hypot(tgt.x - START.x, tgt.y - START.y);
        const vNeed = Math.sqrt(2 * FRIC * dist) * (tgt === TG ? 1 : 1.15);
        const p = Math.max(0, Math.min(1, (vNeed / VMAX - 0.25) / 0.75 + (Math.random() - 0.5) * 0.08));
        const sc = this.simulate(Math.cos(a), Math.sin(a), p);
        if (sc > bs) { bs = sc; best = { a, p }; }
      }
      best.a += (Math.random() - 0.5) * noise * 2; best.p += (Math.random() - 0.5) * noise * 2;
      return best;
    },
    update(dt) {
      if (this.phase === 'aim' && mgCpu(this.turn)) {
        this.cpuT -= dt;
        if (!this.plan && this.cpuT < 0.4) this.plan = this.cpuPlan();
        if (this.plan && this.cpuT < 0) { const { a, p } = this.plan; this.plan = null; this.shoot(Math.cos(a), Math.sin(a), p); }
      }
      if (this.phase === 'move') {
        this.moveT += dt;
        mgDiscs(this.coins.filter(c => !c.out), dt, FRIC, (A, B, s) => { if (s > 0.6) mgSnd('metal'); });
        for (const c of this.coins) if (!c.out && !this.onRu(c.x, c.y)) { c.out = true; c.vz = 0.3; mgSnd('fall'); }
        if (this.moveT > 0.3 && this.coins.every(c => c.out ? c.z <= 0 && Math.hypot(c.vx, c.vy) < 0.05 : Math.hypot(c.vx, c.vy) < 0.04)) this.endTurn();
      }
      for (const c of this.coins) {
        if (!c.out) continue;
        c.vz -= 20 * dt; c.z += c.vz * dt; c.x += c.vx * dt; c.y += c.vy * dt;
        if (c.z <= 0) { c.z = 0; c.vz = 0; const sp = Math.hypot(c.vx, c.vy), ns = Math.max(0, sp - 10 * dt); if (sp) { c.vx *= ns / sp; c.vy *= ns / sp; } }
        c.g = this.onRu(c.x, c.y) ? TOP : 0;
      }
    },
    endTurn() {
      // 投げる線を越えなかった硬貨は取りのぞく
      this.coins = this.coins.filter(c => c.out || c.y < START.y - 2.4);
      if (this.thrown[0] >= STONES && this.thrown[1] >= STONES) {
        this.phase = 'done';
        const cs = this.coins;
        mgFinish((seat) => {
          const n = Math.round(this.score(cs, seat) / 10), pts = Math.abs(n);
          return n > 0 ? { head: 'かち', lines: ['あなたの硬貨が ' + pts + ' 枚 内側'], good: true }
            : n < 0 ? { head: 'まけ', lines: [mgVs(seat) + 'の硬貨が ' + pts + ' 枚 内側'], good: false }
              : { head: '引き分け', lines: ['的に残った硬貨がありません'], good: true };
        });
        return;
      }
      this.turn = 1 - this.turn; this.phase = 'aim'; this.cpuT = mgLv(1.2, 0.9, 0.7);
      this.spawn();
    },
    snap() {
      const r = (v) => Math.round(v * 100) / 100;
      return { c: this.coins.map(c => [c.team, r(c.x), r(c.y), r(c.z), c.g, c.out ? 1 : 0, r(c.vx), r(c.vy)]), th: this.thrown, tu: this.turn, ph: this.phase };
    },
    apply(s) {
      this.net = s;
      this.coins = s.c.map((a, i) => {
        const o = this.coins[i] && this.coins[i].team === a[0] ? this.coins[i] : { x: a[1], y: a[2], z: a[3] };
        return Object.assign(o, { team: a[0], g: a[4], out: !!a[5], t: a });
      });
      this.active = this.coins[this.coins.length - 1];
      if (this.active && this.active.y > START.y - 0.5) { this.active.x = START.x; this.active.y = START.y; }
      this.thrown = s.th; this.turn = s.tu; this.phase = s.ph;
    },
    guest(dt) {
      const k = Math.min(1, dt * 15);
      for (const c of this.coins) { const a = c.t; if (!a) continue; a[1] += a[6] * dt; a[2] += a[7] * dt; c.x += (a[1] - c.x) * k; c.y += (a[2] - c.y) * k; c.z += (a[3] - c.z) * k; }
    },
    draw(ctx, vw, vh) {
      mgCamera(vw, vh, 1.6, 11, TOP, 6);
      const objs = this.coins.map(c => ({ s: coin(c.team), x: c.x, y: c.y, z: c.z, g: c.g }));
      mgDraw(ctx, vw, vh, objs, (g) => {
        if (this.sel && this.aim) {
          const l = Math.hypot(this.aim.dx, this.aim.dy);
          if (l > 0.2) {
            const ux = -this.aim.dx / l, uy = -this.aim.dy / l;
            // その強さで止まるおよその位置まで点線
            const v = VMAX * (0.25 + 0.75 * l / MAXP), len = Math.min(22, v * v / (2 * FRIC));
            mgDots(g, this.sel.x, this.sel.y, TOP + 0.1, this.sel.x + ux * len, this.sel.y + uy * len, TOP + 0.1, '#3a342d', 4);
            mgDots(g, this.sel.x, this.sel.y, TOP + 0.1, this.sel.x + this.aim.dx, this.sel.y + this.aim.dy, TOP + 0.1, '#a8493c', 2);
          }
        }
        if (this.phase === 'aim' && this.turn === MINI.seat && !this.sel && this.active) {
          const bob = Math.floor(performance.now() / 300) % 2, [sx, sy] = mgP(this.active.x, this.active.y, TOP + 0.9);
          drawMarker(g, sx, sy - bob, 0);
        }
      });
    },
    hud(ctx, vw, vh) {
      const me = MINI.seat;
      mgHudNote(ctx, 6, 30, mgName(me) + ' のこり', String(STONES - this.thrown[me]), me ? COL.noteB : COL.noteR, me ? COL.noteBDark : COL.noteRDark);
      mgHudNote(ctx, vw - 6, 30, mgName(1 - me) + ' のこり', String(STONES - this.thrown[1 - me]), me ? COL.noteR : COL.noteB, me ? COL.noteRDark : COL.noteBDark, true);
      mgHudTag(ctx, vw, this.phase === 'move' ? '...' : this.turn === me ? 'あなたの番' : mgName(1 - me) + 'の番');
    },
  };
  mgRegister(G_);
})();
