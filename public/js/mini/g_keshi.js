// ケシバト: 机の上で消しゴムをはじき合い、相手を落とす
'use strict';

defMat('sleeveR', ['#c06a58', '#a45646', '#7f4136'], '#4a2620', 'paper');

(function () {
  // S: 世界の大きさ。机も消しゴムも S 倍で作り、画面からはみ出す分はカメラが追いかける
  const S = 2.2;
  const NB = { x0: 0, y0: 0, x1: 19 * S, y1: 15 * S }, TOP = 1.0 * S, BOARD = 0.5 * S;   // 机の天板(範囲と高さ、板の厚み)
  const CX = (NB.x0 + NB.x1) / 2, CY = (NB.y0 + NB.y1) / 2;
  const BOOK = { x0: 0.9, y0: 0.9, x1: 5.3, y1: 4.5 };   // 机に置いたノート(絵だけ)
  const COVER = ['#5d7394', '#53698a', '#455a79', '#384a65'].map(hexRGB);
  const FLOOR = ['#6a5442', '#5c4838', '#4f3d2f', '#433326', '#382a1f', '#2e231a'].map(hexRGB);
  const MAXP = 3.8, VMAX = 17 * S, FRIC = 9 * S;   // ひっぱりの最大(指の動き、ワールド)、最大の速さ、すべりの止まりやすさ

  const spr = (team, a) => mgSpr('ke' + team + '|' + SPR.yawIndex(a), () => {
    const m = mgModel('keshi' + team, () => mgEraserModel(2.0 * S, 1.3 * S, 0.7 * S, team ? 'sleeve' : 'sleeveR', 'sleeveW', 0.075));
    return mgBake(m, { yaw: SPR.yawIndex(a) / SPR.YAWS * Math.PI * 2 });
  });

  const G_ = {
    name: 'ケシバト', tint: COL.red, cpu: true, kind: 'duel', view: [200, 110],
    howto: [
      '自分の消しゴムの近くを触って引っぱり、はなすとはじけます。',
      '机から落ちたら負け。相手の2個を先に落とそう。',
      '交代で1回ずつ。先に2勝したほうの勝ちです。',
    ],
    stageDef() {
      return {
        cx: CX, cy: CY, halfW: 700, halfH: 640,
        fill: 'rgb(' + FLOOR[4].join(',') + ')',
        // 机の外は床板。机から離れるほど暗い
        ground(va, vb, px, py) {
          let [ca, cb] = mgV(CX, CY);
          va /= S; vb /= S; ca /= S; cb /= S;   // 床板の模様は元の大きさのまま
          const row = Math.floor((vb + 40) / 1.7), seed = hash2(row, 5) * 40;
          if (Math.floor((vb + 40) / 1.7) !== Math.floor((vb + 40 + 1 / VSY) / 1.7)) return FLOOR[5];
          if (hash2(row, Math.floor((va + seed) / 9)) !== hash2(row, Math.floor((va + seed + 1 / VSX) / 9))) return FLOOR[5];
          const far = Math.hypot((va - ca) / 1.3, vb - cb) / 13;
          return mgTone(FLOOR, 0.6 + far * 1.6 + (hash2(row, 2) > 0.5 ? 0.6 : 0) + (vnoise(va * 0.6 + seed, vb * 2) - 0.5) * 0.8, px, py);
        },
        items: [
          // 天板の下の暗がり(脚と幕板)
          { x0: NB.x0 + 0.7 * S, y0: NB.y0 + 0.7 * S, x1: NB.x1 - 0.7 * S, y1: NB.y1 - 0.7 * S, z: 0, h: TOP - BOARD,
            top: () => hexRGB('#241b14'), side: [hexRGB('#2e231b'), hexRGB('#2e231b'), hexRGB('#1f1712')] },
          { x0: NB.x0, y0: NB.y0, x1: NB.x1, y1: NB.y1, z: TOP - BOARD, h: BOARD, r: 0.2 * S, edge: hexRGB('#d8aa76'),
            top(x, y, px, py) {
              const [va, vb] = mgV(x, y), [ca, cb] = mgV(CX, CY);
              let col = mgDesk(va / S, vb / S, px, py, ca / S - 5, cb / S - 6);
              x /= S; y /= S;   // ここから下の絵は元の大きさの座標で描く
              // ノート(表紙、背、少し浮いた影)
              const inB = x >= BOOK.x0 && x <= BOOK.x1 && y >= BOOK.y0 && y <= BOOK.y1;
              if (inB) {
                const sp = x - BOOK.x0;
                col = mgTone(COVER, 1.2 + (sp < 0.5 ? -0.8 : 0) + (vnoise(x * 2, y * 2) - 0.5) * 0.5, px, py);
                if (Math.abs(sp - 0.5) < 0.05) col = hexRGB('#2f3e55');
                const lx = x - (BOOK.x0 + 1.3), ly = Math.abs(y - (BOOK.y0 + 1.1)), lw = BOOK.x1 - BOOK.x0 - 2.0;
                if (lx > 0 && lx < lw && ly < 0.42) col = ly > 0.34 || lx < 0.06 || lx > lw - 0.06 ? hexRGB('#b8b0a0') : hexRGB('#ece6d8');
              } else if (x > BOOK.x0 && x < BOOK.x1 + 0.12 && y > BOOK.y0 && y < BOOK.y1 + 0.12) col = mgTone(PAL.desk, 4.6, px, py);
              return col;
            },
            side: [hexRGB('#8f6440'), hexRGB('#7c5536'), hexRGB('#5a3e26')] },
        ],
      };
    },
    icon() {
      return mgIcon('keshi', 84, 50, (put) => {
        put(spr(0, 0.4), -0.9 * S, 0.5 * S, 0); put(spr(1, 2.6), 0.9 * S, -0.5 * S, 0);
      });
    },
    reset() {
      this.wins = [0, 0]; this.round = 0; this.newRound();
    },
    newRound() {
      const mk = (team, x, y, a) => ({ team, x: x * S, y: y * S, z: TOP, vx: 0, vy: 0, vz: 0, r: 0.82 * S, m: 1, a, w: 0, out: false, g: TOP });
      this.b = [mk(0, 6.5, 11.4, 0), mk(0, 12.5, 11.6, 0), mk(1, 6.4, 3.6, 0), mk(1, 12.6, 3.4, 0)];
      this.turn = this.round % 2;   // 0 あなた, 1 CPU
      this.phase = 'aim'; this.sel = null; this.aim = null; this.cpuT = 0.9; this.msgT = 1.4;
      this.msg = 'ラウンド ' + (this.round + 1); this.msgW = -1; this.plan = null;
      this.cam = null;
    },
    // カメラの見る場所: ねらうときは番の人の消しゴム(引いた向きの先も少し)、動いている間はいちばん速い消しゴム
    camTarget() {
      if (this.phase === 'move' || this.phase === 'done') {
        let best = null, bs = 0.3 * S;
        for (const b of this.b) { const v = Math.hypot(b.vx, b.vy) + (b.out && b.z > 0 ? S : 0); if (v > bs) { bs = v; best = b; } }
        if (best) return [best.x, best.y];
        return this.cam ? [this.cam[0], this.cam[1]] : [CX, CY];
      }
      if (this.sel && this.aim) {
        const l = Math.hypot(this.aim.dx, this.aim.dy) || 1, k = l / MAXP * 5 * S;
        return [this.sel.x - this.aim.dx / l * k, this.sel.y - this.aim.dy / l * k];
      }
      const own = this.b.filter(b => b.team === this.turn && !b.out);
      if (!own.length) return [CX, CY];
      return [own.reduce((a, b) => a + b.x, 0) / own.length, own.reduce((a, b) => a + b.y, 0) / own.length];
    },
    begin() {},
    onNb(x, y) { return x >= NB.x0 && x <= NB.x1 && y >= NB.y0 && y <= NB.y1; },
    down(sx, sy) {
      const me = MINI.seat;
      if (this.phase !== 'aim' || this.turn !== me || this.msgT > 0.6) return;
      const [x, y] = mgToWorld(sx, sy, TOP);
      let best = null, bd = 1.3 * S;
      for (const b of this.b) if (b.team === me && !b.out) { const d = Math.hypot(b.x - x, b.y - y); if (d < bd) { bd = d; best = b; } }
      // 指の位置が少しずれても、一番近い自分の消しゴムを選ぶ
      if (!best) for (const b of this.b) if (b.team === me && !b.out) { const d = Math.hypot(b.x - x, b.y - y); if (d < 3 * S && (!best || d < bd)) { bd = d; best = b; } }
      if (best) { this.sel = best; this.aim = { dx: 0, dy: 0 }; this.from = [x, y]; mgSnd('tap'); }
    },
    move(sx, sy) {
      if (!this.sel || !this.aim) return;
      // 触った所からどれだけ引いたか(消しゴムの真上を触らなくてよい)
      const [x, y] = mgToWorld(sx, sy, TOP);
      let dx = x - this.from[0], dy = y - this.from[1];
      const l = Math.hypot(dx, dy);
      if (l > MAXP) { dx *= MAXP / l; dy *= MAXP / l; }
      this.aim.dx = dx; this.aim.dy = dy;
    },
    up() {
      if (!this.sel || !this.aim) return;
      const l = Math.hypot(this.aim.dx, this.aim.dy);
      if (l > 0.35 && this.phase === 'aim' && this.turn === MINI.seat) mgInput({ i: this.b.indexOf(this.sel), ux: -this.aim.dx / l, uy: -this.aim.dy / l, p: l / MAXP });
      this.sel = null; this.aim = null;
    },
    onAct(seat, a) {
      const b = this.b[a.i | 0], l = Math.hypot(+a.ux || 0, +a.uy || 0);
      if (this.phase !== 'aim' || this.turn !== seat || !b || b.team !== seat || b.out || !l) return;
      this.shoot(b, a.ux / l, a.uy / l, Math.max(0, Math.min(1, +a.p || 0)));
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
        mgDiscs(bs.filter(b => !b.out), 1 / 30, FRIC);
        for (const b of bs) if (!b.out && !this.onNb(b.x, b.y)) b.out = true;
      }
      let s = 0;
      for (const b of bs) {
        const edge = Math.min(b.x - NB.x0, NB.x1 - b.x, b.y - NB.y0, NB.y1 - b.y);
        if (b.team === 0) s += b.out ? 10 : -Math.min(edge / S, 3) * 0.5;
        else s += b.out ? -13 : Math.min(edge / S, 3) * 0.4;
      }
      return s;
    },
    update(dt) {
      this.msgT -= dt;
      if (this.phase === 'aim' && mgCpu(this.turn) && this.msgT < 0.6) {
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
        mgDiscs(this.b.filter(b => !b.out), dt, FRIC, (A, B, s) => {
          if (s > 1.5 * S) { mgSnd('hit'); mgBurst((A.x + B.x) / 2, (A.y + B.y) / 2, TOP + 0.3 * S, 4, '#f6f2e8', 1.5 * S); }
        });
        for (const b of this.b) {
          if (!b.out && !this.onNb(b.x, b.y)) { b.out = true; b.vz = 0.5 * S; mgSnd('fall'); }
        }
        const still = this.b.every(b => b.out ? b.z <= 0.001 && Math.hypot(b.vx, b.vy) < 0.05 * S : Math.hypot(b.vx, b.vy) < 0.05 * S);
        if (still && this.moveT > 0.3) this.endTurn();
      }
      // 落ちた消しゴム
      for (const b of this.b) {
        if (!b.out) continue;
        b.vz -= 22 * S * dt; b.z += b.vz * dt; b.x += b.vx * dt; b.y += b.vy * dt;
        if (b.z <= 0) {
          if (b.vz < -2 * S) mgSnd('soft');
          b.z = 0; b.vz = Math.abs(b.vz) > 2 * S ? -b.vz * 0.25 : 0;
          const sp = Math.hypot(b.vx, b.vy), ns = Math.max(0, sp - 14 * S * dt);
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
        mgSnd(w === MINI.seat ? 'good' : 'bad');
        if (this.wins[w] >= 2) {
          const W = this.wins;
          mgFinish((seat) => ({ head: w === seat ? 'かち' : 'まけ', lines: ['あなた ' + W[seat] + ' - ' + W[1 - seat] + ' ' + mgVs(seat)], good: w === seat }));
          this.phase = 'done';
          return;
        }
        this.newRound();
        this.msg = '次は ラウンド ' + (this.round + 1); this.msgW = w;
        this.msgT = 1.8;
        return;
      }
      this.turn = 1 - this.turn; this.phase = 'aim'; this.cpuT = mgLv(1.2, 0.9, 0.7);
    },
    idle() {},
    snap() {
      const r = (v) => Math.round(v * 100) / 100;
      return { b: this.b.map(b => [r(b.x), r(b.y), r(b.z), r(b.a), b.out ? 1 : 0, b.g, r(b.vx), r(b.vy)]), tu: this.turn, ph: this.phase, wi: this.wins, ro: this.round, mt: this.msgT, m: this.msg, mw: this.msgW };
    },
    apply(s) {
      if (s.ro !== this.round) { this.sel = null; this.aim = null; }
      this.net = s;
      this.turn = s.tu; this.phase = s.ph; this.wins = s.wi; this.round = s.ro; this.msgT = s.mt; this.msg = s.m; this.msgW = s.mw;
      s.b.forEach((a, i) => { const b = this.b[i]; b.out = !!a[4]; b.g = a[5]; b.a = a[3]; if (Math.hypot(b.x - a[0], b.y - a[1]) > 3 * S) { b.x = a[0]; b.y = a[1]; b.z = a[2]; } });
    },
    guest(dt) {
      this.msgT -= dt;
      const s = this.net;
      if (!s) return;
      const k = Math.min(1, dt * 15);
      s.b.forEach((a, i) => {
        const b = this.b[i];
        a[0] += a[6] * dt; a[1] += a[7] * dt;
        b.x += (a[0] - b.x) * k; b.y += (a[1] - b.y) * k; b.z += (a[2] - b.z) * k;
      });
    },
    draw(ctx, vw, vh) {
      const now = performance.now(), dt = Math.min(0.05, (now - (this.camT || now)) / 1000);
      this.camT = now;
      const [tx, ty] = this.camTarget();
      if (!this.cam) this.cam = [tx, ty];
      const k = 1 - Math.exp(-dt * (this.phase === 'move' ? 5 : 2.6));
      this.cam[0] += (tx - this.cam[0]) * k; this.cam[1] += (ty - this.cam[1]) * k;
      mgCamera(vw, vh, this.cam[0], this.cam[1], TOP, 12);
      // 机の奥や横の床に落ちた消しゴムは、天板の陰に隠れる
      const hid = (b) => b.out && b.z < TOP - 0.25 * S && b.x > NB.x0 - 1.2 * S && b.x < NB.x1 + 1.2 * S && mgDepth(b.x, b.y) < Math.max(mgDepth(b.x, NB.y0), mgDepth(b.x, NB.y1));
      const objs = this.b.map(b => ({ s: spr(b.team, b.a), x: b.x, y: b.y, z: b.z, g: b.g, a: hid(b) ? 0 : 1 }));
      mgDraw(ctx, vw, vh, objs, (c) => {
        mgFxDraw(c);
        // ねらいの表示: 引いた向きの反対へ点線
        if (this.sel && this.aim) {
          const l = Math.hypot(this.aim.dx, this.aim.dy);
          if (l > 0.2) {
            const ux = -this.aim.dx / l, uy = -this.aim.dy / l, len = (1 + l / MAXP * 4) * S, pl = l / MAXP * 1.6 * S, z = TOP + 0.3 * S;
            mgDots(c, this.sel.x, this.sel.y, z, this.sel.x + ux * len, this.sel.y + uy * len, z, '#3a342d', 3);
            mgDots(c, this.sel.x, this.sel.y, z, this.sel.x - ux * pl, this.sel.y - uy * pl, z, '#a8493c', 2);
            const [hx, hy] = mgP(this.sel.x + ux * len, this.sel.y + uy * len, z);
            c.fillStyle = '#3a342d'; c.fillRect(hx - 1, hy - 1, 3, 3);
          }
        }
        if (this.phase === 'aim' && this.turn === MINI.seat && !this.sel && this.msgT < 0.6) {
          const bob = Math.floor(performance.now() / 300) % 2;
          for (const b of this.b) if (b.team === MINI.seat && !b.out) { const [sx, sy] = mgP(b.x, b.y, TOP + 1.2 * S); drawMarker(c, sx, sy - bob, 0); }
        }
      });
    },
    hud(ctx, vw, vh) {
      const me = MINI.seat;
      mgHudNote(ctx, 6, 30, mgName(me), String(this.wins[me]), me ? COL.noteB : COL.noteR, me ? COL.noteBDark : COL.noteRDark);
      mgHudNote(ctx, vw - 6, 30, mgName(1 - me), String(this.wins[1 - me]), me ? COL.noteR : COL.noteB, me ? COL.noteRDark : COL.noteBDark, true);
      const msg = this.msgW >= 0 ? (this.msgW === me ? 'あなた' : mgName(1 - me)) + 'が取った  ' + this.msg : this.msg;
      if (this.msgT > 0) centerCard(ctx, vw, vh, [[msg, 14, COL.ink, true]], { up: 20 });
      else mgHudTag(ctx, vw, this.phase === 'move' ? '...' : this.turn === me ? 'あなたの番' : mgName(1 - me) + 'の番');
    },
  };
  mgRegister(G_);
})();
