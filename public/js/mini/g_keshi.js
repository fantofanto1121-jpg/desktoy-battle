// ケシバト: ノートの上で消しゴムをはじき合い、相手を落とす
'use strict';

defMat('sleeveR', ['#c06a58', '#a45646', '#7f4136'], '#4a2620', 'paper');

(function () {
  const NB = { x0: 0, y0: 0, x1: 16, y1: 12 }, TOP = 0.4, GUT = 8;
  const PAPER = ['#f5f0e5', '#ebe5d8', '#dfd8c9', '#cfc7b6'].map(hexRGB);
  const MAXP = 3.8, VMAX = 15;   // ひっぱりの最大(ワールド)、最大の速さ

  const spr = (team, a) => mgSpr('ke' + team + '|' + SPR.yawIndex(a), () => {
    const m = mgModel('keshi' + team, () => mgEraserModel(2.0, 1.3, 0.7, team ? 'sleeve' : 'sleeveR', 'sleeveW'));
    return bake(m, { yaw: SPR.yawIndex(a) / SPR.YAWS * Math.PI * 2 });
  });

  const G_ = {
    name: 'ケシバト', tint: COL.red, cpu: true,
    howto: [
      '自分の消しゴム(赤)から指を引いて、はなすとはじけます。',
      'ノートから落ちたら負け。相手の2個を先に落とそう。',
      '交代で1回ずつ。先に2勝したほうの勝ちです。',
    ],
    stageDef() {
      const inNb = (x, y) => x >= NB.x0 && x <= NB.x1 && y >= NB.y0 && y <= NB.y1;
      return {
        cx: 8, cy: 6,
        items: [
          { x0: NB.x0 - 0.18, y0: NB.y0 - 0.18, x1: NB.x1 + 0.18, y1: NB.y1 + 0.18, z: 0, h: 0.08, r: 0.15,
            top: (x, y, px, py) => mgTone(['#53698a', '#455a79', '#384a65'].map(hexRGB), 1, px, py),
            side: [hexRGB('#3a4d69'), hexRGB('#2f3f57'), hexRGB('#26334a')] },
          { x0: NB.x0, y0: NB.y0, x1: NB.x1, y1: NB.y1, z: 0.08, h: TOP - 0.08, edge: hexRGB('#fbf8f1'),
            top(x, y, px, py) {
              const dg = Math.abs(x - GUT);
              let L = 0.6 + (dg < 0.9 ? (0.9 - dg) / 0.9 * 2.2 : 0) + (vnoise(x * 0.8, y * 0.8) - 0.5) * 0.5;
              let col = mgTone(PAPER, L, px, py);
              if (dg > 0.25 && y > 1.1 && mgCross((a, b) => b - 1.1, x, y, 0.62)) col = hexRGB('#b7cdd8');
              if (mgCross((a) => a, x, y, 100) || Math.abs(x - 1.3) < 0.04 || Math.abs(x - 9.3) < 0.04) col = hexRGB('#d9a69c');
              if (Math.abs(x - GUT) < 0.05) col = hexRGB('#c3bba9');
              return col;
            },
            side: [hexRGB('#ddd5c4'), hexRGB('#cdc4b1'), hexRGB('#b4ab98')] },
        ],
      };
    },
    icon() {
      return mgIcon('keshi', 84, 50, (put) => {
        put(spr(0, 0.4), -0.9, 0.5, 0); put(spr(1, 2.6), 0.9, -0.5, 0);
      });
    },
    reset() {
      this.wins = [0, 0]; this.round = 0; this.newRound();
    },
    newRound() {
      const mk = (team, x, y, a) => ({ team, x, y, z: TOP, vx: 0, vy: 0, vz: 0, r: 0.82, m: 1, a, w: 0, out: false, g: TOP });
      this.b = [mk(0, 3.6, 4.0, 0), mk(0, 4.2, 8.2, 0), mk(1, 12.4, 3.8, Math.PI), mk(1, 11.8, 8.0, Math.PI)];
      this.turn = this.round % 2;   // 0 あなた, 1 CPU
      this.phase = 'aim'; this.sel = null; this.aim = null; this.cpuT = 0.9; this.msgT = 1.4;
      this.msg = 'ラウンド ' + (this.round + 1); this.plan = null;
    },
    begin() {},
    onNb(x, y) { return x >= NB.x0 && x <= NB.x1 && y >= NB.y0 && y <= NB.y1; },
    down(sx, sy) {
      if (this.phase !== 'aim' || this.turn !== 0 || this.msgT > 0.6) return;
      const [x, y] = mgToWorld(sx, sy, TOP);
      let best = null, bd = 1.3;
      for (const b of this.b) if (b.team === 0 && !b.out) { const d = Math.hypot(b.x - x, b.y - y); if (d < bd) { bd = d; best = b; } }
      // 指の位置が少しずれても、一番近い自分の消しゴムを選ぶ
      if (!best) for (const b of this.b) if (b.team === 0 && !b.out) { const d = Math.hypot(b.x - x, b.y - y); if (d < 3 && (!best || d < bd)) { bd = d; best = b; } }
      if (best) { this.sel = best; this.aim = { dx: 0, dy: 0 }; mgSnd('tap'); }
    },
    move(sx, sy) {
      if (!this.sel || !this.aim) return;
      const [x, y] = mgToWorld(sx, sy, TOP);
      let dx = x - this.sel.x, dy = y - this.sel.y;
      const l = Math.hypot(dx, dy);
      if (l > MAXP) { dx *= MAXP / l; dy *= MAXP / l; }
      this.aim.dx = dx; this.aim.dy = dy;
    },
    up() {
      if (!this.sel || !this.aim) return;
      const l = Math.hypot(this.aim.dx, this.aim.dy);
      if (l > 0.35) this.shoot(this.sel, -this.aim.dx / l, -this.aim.dy / l, l / MAXP);
      this.sel = null; this.aim = null;
    },
    shoot(b, ux, uy, p) {
      const v = VMAX * (0.18 + 0.82 * p);
      b.vx = ux * v; b.vy = uy * v; b.w = (Math.random() - 0.5) * 6;
      this.phase = 'move'; this.moveT = 0;
      mgSnd('snap');
    },
    // CPUの手: 候補をいくつか先読みして一番よいものを選ぶ
    cpuPlan() {
      const mine = this.b.filter(b => b.team === 1 && !b.out), foes = this.b.filter(b => b.team === 0 && !b.out);
      const tries = mgLv(5, 16, 40), noise = mgLv(0.22, 0.07, 0.02);
      let best = null, bs = -1e9;
      for (let k = 0; k < tries; k++) {
        const me = mine[Math.floor(Math.random() * mine.length)], foe = foes[Math.floor(Math.random() * foes.length)];
        let a = Math.atan2(foe.y - me.y, foe.x - me.x) + (Math.random() - 0.5) * (k < tries / 2 ? 0.25 : 0.7);
        const p = 0.45 + Math.random() * 0.55;
        const sc = this.simulate(me, Math.cos(a), Math.sin(a), p);
        if (sc > bs) { bs = sc; best = { me, a, p }; }
      }
      if (best) best.a += (Math.random() - 0.5) * noise * 2;
      return best;
    },
    simulate(me, ux, uy, p) {
      const bs = this.b.map(b => ({ ...b }));
      const m = bs[this.b.indexOf(me)];
      const v = VMAX * (0.18 + 0.82 * p);
      m.vx = ux * v; m.vy = uy * v;
      for (let t = 0; t < 3; t += 1 / 30) {
        mgDiscs(bs.filter(b => !b.out), 1 / 30, 9);
        for (const b of bs) if (!b.out && !this.onNb(b.x, b.y)) b.out = true;
      }
      let s = 0;
      for (const b of bs) {
        const edge = Math.min(b.x - NB.x0, NB.x1 - b.x, b.y - NB.y0, NB.y1 - b.y);
        if (b.team === 0) s += b.out ? 10 : -Math.min(edge, 3) * 0.5;
        else s += b.out ? -13 : Math.min(edge, 3) * 0.4;
      }
      return s;
    },
    update(dt) {
      this.msgT -= dt;
      if (this.phase === 'aim' && this.turn === 1 && this.msgT < 0.6) {
        this.cpuT -= dt;
        if (!this.plan && this.cpuT < 0.5) this.plan = this.cpuPlan();
        if (this.plan && this.cpuT < 0) {
          const { me, a, p } = this.plan;
          this.plan = null;
          this.shoot(me, Math.cos(a), Math.sin(a), p);
        }
      }
      if (this.phase === 'move') {
        this.moveT += dt;
        mgDiscs(this.b.filter(b => !b.out), dt, 9, (A, B, s) => {
          if (s > 1.5) { mgSnd('hit'); mgBurst((A.x + B.x) / 2, (A.y + B.y) / 2, TOP + 0.3, 3, '#f6f2e8', 1.5); }
        });
        for (const b of this.b) {
          if (!b.out && !this.onNb(b.x, b.y)) { b.out = true; b.vz = 0.5; mgSnd('fall'); }
        }
        const still = this.b.every(b => b.out ? b.z <= 0.001 && Math.hypot(b.vx, b.vy) < 0.05 : Math.hypot(b.vx, b.vy) < 0.05);
        if (still && this.moveT > 0.3) this.endTurn();
      }
      // 落ちた消しゴム
      for (const b of this.b) {
        if (!b.out) continue;
        b.vz -= 22 * dt; b.z += b.vz * dt; b.x += b.vx * dt; b.y += b.vy * dt;
        if (b.z <= 0) {
          if (b.vz < -2) mgSnd('soft');
          b.z = 0; b.vz = Math.abs(b.vz) > 2 ? -b.vz * 0.25 : 0;
          const sp = Math.hypot(b.vx, b.vy), ns = Math.max(0, sp - 14 * dt);
          if (sp > 0) { b.vx *= ns / sp; b.vy *= ns / sp; }
        }
        b.g = this.onNb(b.x, b.y) ? TOP : 0;
      }
    },
    endTurn() {
      const left = [0, 1].map(t => this.b.filter(b => b.team === t && !b.out).length);
      if (!left[0] || !left[1]) {
        const w = !left[1] && left[0] ? 0 : !left[0] && left[1] ? 1 : this.turn;   // 同時に落ちたらはじいた側の勝ち
        this.wins[w]++; this.round++;
        mgSnd(w === 0 ? 'good' : 'bad');
        if (this.wins[w] >= 2) {
          mgFinish(w === 0
            ? { head: 'かち', lines: ['あなた ' + this.wins[0] + ' - ' + this.wins[1] + ' CPU'], good: true }
            : { head: 'まけ', lines: ['あなた ' + this.wins[0] + ' - ' + this.wins[1] + ' CPU'], good: false });
          this.phase = 'done';
          return;
        }
        this.newRound();
        this.msg = (w === 0 ? 'あなたが取った' : 'CPUが取った') + '  次は ラウンド ' + (this.round + 1);
        this.msgT = 1.8;
        return;
      }
      this.turn = 1 - this.turn; this.phase = 'aim'; this.cpuT = mgLv(1.2, 0.9, 0.7);
    },
    idle() {},
    draw(ctx, vw, vh) {
      mgCamera(vw, vh, 8, 6, TOP, 8);
      const objs = this.b.map(b => ({ s: spr(b.team, b.a), x: b.x, y: b.y, z: b.z, g: b.g, k: b.x + b.y }));
      mgDraw(ctx, vw, vh, objs, (c) => {
        mgFxDraw(c);
        // ねらいの表示: 引いた向きの反対へ点線
        if (this.sel && this.aim) {
          const l = Math.hypot(this.aim.dx, this.aim.dy);
          if (l > 0.2) {
            const ux = -this.aim.dx / l, uy = -this.aim.dy / l, len = 1 + l / MAXP * 4;
            mgDots(c, this.sel.x, this.sel.y, TOP + 0.3, this.sel.x + ux * len, this.sel.y + uy * len, TOP + 0.3, '#3a342d', 3);
            mgDots(c, this.sel.x, this.sel.y, TOP + 0.3, this.sel.x + this.aim.dx, this.sel.y + this.aim.dy, TOP + 0.3, '#a8493c', 2);
            const [hx, hy] = mgP(this.sel.x + ux * len, this.sel.y + uy * len, TOP + 0.3);
            c.fillStyle = '#3a342d'; c.fillRect(hx - 1, hy - 1, 3, 3);
          }
        }
        if (this.phase === 'aim' && this.turn === 0 && !this.sel && this.msgT < 0.6) {
          const bob = Math.floor(performance.now() / 300) % 2;
          for (const b of this.b) if (b.team === 0 && !b.out) { const [sx, sy] = mgP(b.x, b.y, TOP + 1.2); drawMarker(c, sx, sy - bob, 0); }
        }
      });
    },
    hud(ctx, vw, vh) {
      mgHudNote(ctx, 6, 30, 'あなた', String(this.wins[0]), COL.noteR, COL.noteRDark);
      mgHudNote(ctx, vw - 6, 30, 'CPU', String(this.wins[1]), COL.noteB, COL.noteBDark, true);
      if (this.msgT > 0) centerCard(ctx, vw, vh, [[this.msg, 14, COL.ink, true]], { up: 20 });
      else mgHudTag(ctx, vw, this.phase === 'move' ? '...' : this.turn === 0 ? 'あなたの番' : 'CPUの番');
    },
  };
  mgRegister(G_);
})();
