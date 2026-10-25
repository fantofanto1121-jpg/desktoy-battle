// キャップホッケー: トレイの上で丸消しゴムを動かし、キャップを相手のゴールへ
'use strict';

(function () {
  const RK = { x0: 0, y0: 0, x1: 10, y1: 14 }, FL = 0.12, GOAL = [3.7, 6.3], CX = 5, CY = 7;
  const WIN = 5, TIME = 90, PR = 0.42, MR = 0.62;

  function malletModel(sleeve) {
    return makeModel({
      size: [MR * 2, MR * 2, 0.55], vs: 0.04, smooth: 1.3,
      fill(x, y, z) {
        const r = Math.hypot(x, y);
        if (r > MR - (z > 0.47 ? (z - 0.47) * 1.5 : 0)) return 0;
        if (z > 0.14) return Math.abs(z - 0.27) < 0.04 || (z > 0.47 && Math.abs(r - MR * 0.55) < 0.05) ? M.sleeveW : M[sleeve];
        return M.rubberW;
      },
    });
  }
  function puckModel() {
    return makeModel({
      size: [PR * 2, PR * 2, 0.24], vs: 0.03, smooth: 1.2,
      fill(x, y, z) {
        const r = Math.hypot(x, y);
        if (r > PR) return 0;
        if (r > PR - 0.06) return Math.floor(Math.atan2(y, x) / 0.26) % 2 ? M.red : M.tack;   // ぎざぎざの縁
        if (z > 0.18 && r < 0.22) return M.white;
        return M.red;
      },
    });
  }
  const mallet = (t) => mgSpr('hkM' + t, () => mgBake(mgModel('hkM' + t, () => malletModel(t ? 'sleeve' : 'sleeveR')), {}));
  const puck = () => mgSpr('hkP', () => mgBake(mgModel('hkP', puckModel), {}));

  const r2 = (v) => Math.round(v * 100) / 100;
  const G_ = {
    name: 'キャップホッケー', tint: '#5f84ab', cpu: true, kind: 'duel',
    howto: [
      '指(マウス)を動かすと、自分の丸消しゴムがついてきます。',
      'キャップを打って、奥にある相手のゴールに入れよう。',
      '先に' + WIN + '点で勝ち。' + TIME + '秒で終わったら点の多いほう。',
    ],
    stageDef() {
      const floor = ['#c9dbe0', '#b9cdd3', '#a7bec5', '#94aeb6'].map(hexRGB);
      const wallTop = ['#e3dccb', '#d3cbb8', '#beb6a2'].map(hexRGB), wallSide = ['#bdb5a1', '#a59d8a', '#8b8472'].map(hexRGB);
      const wall = (x0, y0, x1, y1) => ({ x0, y0, x1, y1, z: 0, h: 0.34, top: (x, y, px, py) => mgTone(wallTop, 0.4, px, py), side: wallSide });
      const W = 0.3;
      return {
        cx: CX, cy: CY,
        items: [
          { x0: RK.x0, y0: RK.y0, x1: RK.x1, y1: RK.y1, z: 0, h: FL, top(x, y, px, py) {
            let col = mgTone(floor, 0.8 + (y / 14) * 0.4 + (vnoise(x, y) - 0.5) * 0.4, px, py);
            const r = Math.hypot(x - CX, y - CY);
            if (Math.abs(y - CY) < 0.05 || Math.abs(r - 1.4) < 0.05) col = hexRGB('#e9f1f1');
            for (const gy of [0, 14]) if (Math.abs(Math.hypot(x - CX, y - gy) - 2.0) < 0.05) col = hexRGB(gy ? '#c56c5d' : '#6b8db2');
            return col;
          }, side: wallSide },
          wall(RK.x0 - W, RK.y0, RK.x0, RK.y1), wall(RK.x1, RK.y0, RK.x1 + W, RK.y1),
          wall(RK.x0 - W, RK.y0 - W, GOAL[0], RK.y0), wall(GOAL[1], RK.y0 - W, RK.x1 + W, RK.y0),
          wall(RK.x0 - W, RK.y1, GOAL[0], RK.y1 + W), wall(GOAL[1], RK.y1, RK.x1 + W, RK.y1 + W),
        ],
      };
    },
    icon() {
      return mgIcon('hockey', 84, 50, (put) => { put(mallet(0), 0.5, 1.0, 0); put(puck(), -0.1, -0.2, 0); put(mallet(1), -0.7, -1.4, 0); });
    },
    reset() {
      this.score = [0, 0];
      this.m = [{ x: CX, y: 11.5, vx: 0, vy: 0, r: MR, m: 5, fixed: true, tx: CX, ty: 11.5 }, { x: CX, y: 2.5, vx: 0, vy: 0, r: MR, m: 5, fixed: true, tx: CX, ty: 2.5 }];
      this.serve(1);
      this.ptr = null; this.sendT = 0;
      this.view = null;
    },
    serve(toward) {
      this.p = { x: CX, y: CY + (toward ? -1.5 : 1.5), vx: 0, vy: 0, r: PR, m: 1 };
      this.pause = 0.8;
    },
    down(sx, sy) { this.ptr = mgToWorld(sx, sy, FL); },
    move(sx, sy, d) { if (d || !G.touch) this.ptr = mgToWorld(sx, sy, FL); },
    // 自分の消しゴムのねらう場所: 指かマウスの位置(キーでも動く)
    aim(dt) {
      const me = this.m[MINI.seat], [kx, ky] = mgPadDir();
      let tx = me.tx, ty = me.ty;
      if (kx || ky) { tx = me.x + kx * 2; ty = me.y + ky * 2; this.ptr = null; }
      else if (this.ptr) { tx = this.ptr[0]; ty = this.ptr[1]; }
      this.sendT -= dt;
      if (mgHost()) mgInput({ x: tx, y: ty });
      else { me.tx = tx; me.ty = ty; if (this.sendT <= 0) { this.sendT = 0.05; mgInput({ x: r2(tx), y: r2(ty) }); } }
    },
    onAct(seat, a) { const m = this.m[seat]; m.tx = +a.x || 0; m.ty = +a.y || 0; },
    // 席ごとの動ける範囲(自分の陣地だけ)
    lim(seat) { return seat ? [RK.y0, CY - 0.4] : [CY + 0.3, RK.y1]; },
    update(dt) {
      const p = this.p;
      this.aim(dt);
      for (const s of [0, 1]) {
        const m = this.m[s];
        if (mgCpu(s)) this.cpu(m, dt);
        else this.drive(m, m.tx, m.ty, 16, dt, ...this.lim(s));
      }
      if (this.pause > 0) { this.pause -= dt; return; }
      mgDiscs([p, ...this.m], dt, 0.9, (A, B, s) => { if (s > 1) mgSnd(s > 6 ? 'hit' : 'tap'); });
      const v = Math.hypot(p.vx, p.vy);
      if (v > 17) { p.vx *= 17 / v; p.vy *= 17 / v; }
      // 壁
      if (p.x < RK.x0 + PR) { p.x = RK.x0 + PR; p.vx = Math.abs(p.vx) * 0.9; mgSnd('tap'); }
      if (p.x > RK.x1 - PR) { p.x = RK.x1 - PR; p.vx = -Math.abs(p.vx) * 0.9; mgSnd('tap'); }
      const inGoal = p.x > GOAL[0] + 0.1 && p.x < GOAL[1] - 0.1;
      if (!inGoal) {
        if (p.y < RK.y0 + PR) { p.y = RK.y0 + PR; p.vy = Math.abs(p.vy) * 0.9; mgSnd('tap'); }
        if (p.y > RK.y1 - PR) { p.y = RK.y1 - PR; p.vy = -Math.abs(p.vy) * 0.9; mgSnd('tap'); }
      } else if (p.y < RK.y0 - 0.2 || p.y > RK.y1 + 0.2) {
        const who = p.y < CY ? 0 : 1;
        this.score[who]++;
        mgSnd(who === MINI.seat ? 'good' : 'bad');
        mgBurst(p.x, p.y < CY ? 0 : 14, 0.4, 8, '#efe8d8', 2);
        if (this.score[who] >= WIN) return this.end();
        this.serve(who === 0 ? 1 : 0);
        this.pause = 1.1;
      }
      if (MINI.t >= TIME) this.end();
    },
    // CPU(奥の席): 自分のゴールとキャップの間を守り、近くに来たら打つ
    cpu(m, dt) {
      const p = this.p, sp = mgLv(5.5, 8, 11);
      let tx, ty;
      if (p.y < CY + 0.4 && Math.hypot(p.vx, p.vy) < mgLv(5, 8, 11)) {
        // キャップの向こう側へ回り込んでから打ち抜く
        const ux = CX + (Math.random() - 0.5) * 0.4 - p.x, uy = 14 - p.y, l = Math.hypot(ux, uy) || 1;
        const behind = (m.x - p.x) * ux / l + (m.y - p.y) * uy / l < -0.3;
        tx = behind ? p.x + ux / l * 0.8 : p.x - ux / l * 1.1; ty = behind ? p.y + uy / l * 0.8 : p.y - uy / l * 1.1;
      }
      else { ty = Math.min(p.y, 2.2 + mgLv(0, 0.4, 0.8)); tx = CX + (p.x - CX) * mgLv(0.5, 0.7, 0.85); }
      this.drive(m, tx, ty, sp, dt, RK.y0, CY - 0.4);
    },
    end() {
      const sc = this.score;
      mgFinish((seat) => {
        const a = sc[seat], b = sc[1 - seat];
        return { head: a > b ? 'かち' : a < b ? 'まけ' : '引き分け', lines: ['あなた ' + a + ' - ' + b + ' ' + mgVs(seat)], good: a >= b };
      });
    },
    drive(m, tx, ty, sp, dt, ymin, ymax) {
      tx = Math.max(RK.x0 + MR, Math.min(RK.x1 - MR, tx));
      ty = Math.max(Math.max(RK.y0, ymin) + MR, Math.min(Math.min(RK.y1, ymax) - MR, ty));
      const dx = tx - m.x, dy = ty - m.y, d = Math.hypot(dx, dy), s = Math.min(d, sp * dt);
      const nx = d > 0 ? m.x + dx / d * s : m.x, ny = d > 0 ? m.y + dy / d * s : m.y;
      m.vx = (nx - m.x) / dt; m.vy = (ny - m.y) / dt; m.x = nx; m.y = ny;
    },
    snap() {
      const p = this.p;
      return { p: [r2(p.x), r2(p.y), r2(p.vx), r2(p.vy)], m: this.m.map(m => [r2(m.x), r2(m.y)]), sc: this.score, pa: r2(this.pause) };
    },
    apply(s) { this.net = s; this.score = s.sc; this.pause = s.pa; },
    // 相手側: 自分の消しゴムはすぐ動かし、ほかは届いたようすへなめらかに寄せる
    guest(dt) {
      this.aim(dt);
      const me = this.m[MINI.seat];
      this.drive(me, me.tx, me.ty, 16, dt, ...this.lim(MINI.seat));
      const s = this.net;
      if (!s) return;
      const p = this.p, k = Math.min(1, dt * 14);
      s.p[0] += s.p[2] * dt; s.p[1] += s.p[3] * dt;
      p.x += (s.p[0] - p.x) * k; p.y += (s.p[1] - p.y) * k;
      const o = this.m[1 - MINI.seat];
      o.x += (s.m[1 - MINI.seat][0] - o.x) * k; o.y += (s.m[1 - MINI.seat][1] - o.y) * k;
    },
    draw(ctx, vw, vh) {
      mgCamera(vw, vh, CX, CY, FL, 6);
      const p = this.p;
      const objs = [
        { s: puck(), x: p.x, y: p.y, z: FL, g: FL },
        { s: mallet(0), x: this.m[0].x, y: this.m[0].y, z: FL, g: FL },
        { s: mallet(1), x: this.m[1].x, y: this.m[1].y, z: FL, g: FL },
      ];
      mgDraw(ctx, vw, vh, objs, (c) => mgFxDraw(c));
    },
    hud(ctx, vw, vh) {
      const me = MINI.seat;
      mgHudNote(ctx, 6, 30, mgName(me), String(this.score[me]), me ? COL.noteB : COL.noteR, me ? COL.noteBDark : COL.noteRDark);
      mgHudNote(ctx, vw - 6, 30, mgName(1 - me), String(this.score[1 - me]), me ? COL.noteR : COL.noteB, me ? COL.noteRDark : COL.noteBDark, true);
      mgHudTag(ctx, vw, 'のこり ' + Math.max(0, Math.ceil(TIME - MINI.t)) + ' 秒');
    },
  };
  mgRegister(G_);
})();
