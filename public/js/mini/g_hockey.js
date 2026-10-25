// キャップホッケー: トレイの上で丸消しゴムを動かし、キャップを相手のゴールへ
'use strict';

(function () {
  const RK = { x0: 0, y0: 0, x1: 14, y1: 8 }, FL = 0.12, GOAL = [2.7, 5.3];
  const WIN = 5, TIME = 90, PR = 0.42, MR = 0.62;

  function malletModel(sleeve) {
    return makeModel({
      size: [MR * 2, MR * 2, 0.55], vs: 0.04, smooth: 1.3,
      fill(x, y, z) {
        const r = Math.hypot(x, y);
        if (r > MR - (z > 0.47 ? (z - 0.47) * 1.5 : 0)) return 0;
        if (z > 0.14 && z < 0.4) return Math.abs(z - 0.27) < 0.04 ? M.sleeveW : M[sleeve];
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
  const mallet = (t) => mgSpr('hkM' + t, () => bake(mgModel('hkM' + t, () => malletModel(t ? 'sleeve' : 'sleeveR')), {}));
  const puck = () => mgSpr('hkP', () => bake(mgModel('hkP', puckModel), {}));

  const G_ = {
    name: 'キャップホッケー', tint: '#5f84ab', cpu: true,
    howto: [
      '指(マウス)を動かすと、赤い丸消しゴムがついてきます。',
      'キャップを打って、左奥のゴールに入れよう。',
      '先に' + WIN + '点で勝ち。' + TIME + '秒で終わったら点の多いほう。',
    ],
    stageDef() {
      const floor = ['#c9dbe0', '#b9cdd3', '#a7bec5', '#94aeb6'].map(hexRGB);
      const wallTop = ['#e3dccb', '#d3cbb8', '#beb6a2'].map(hexRGB), wallSide = ['#bdb5a1', '#a59d8a', '#8b8472'].map(hexRGB);
      const wall = (x0, y0, x1, y1) => ({ x0, y0, x1, y1, z: 0, h: 0.34, top: (x, y, px, py) => mgTone(wallTop, 0.4, px, py), side: wallSide });
      const W = 0.3;
      return {
        cx: 7, cy: 4,
        items: [
          { x0: RK.x0, y0: RK.y0, x1: RK.x1, y1: RK.y1, z: 0, h: FL, top(x, y, px, py) {
            let col = mgTone(floor, 0.8 + (1 - x / 14) * 0.4 + (vnoise(x, y) - 0.5) * 0.4, px, py);
            const r = Math.hypot(x - 7, y - 4);
            if (Math.abs(x - 7) < 0.04 || Math.abs(r - 1.4) < 0.04) col = hexRGB('#e9f1f1');
            for (const gx of [0, 14]) if (Math.abs(Math.hypot(x - gx, y - 4) - 2.0) < 0.04) col = hexRGB(gx ? '#c56c5d' : '#6b8db2');
            return col;
          }, side: wallSide },
          wall(RK.x0 - W, RK.y0 - W, RK.x1 + W, RK.y0), wall(RK.x0 - W, RK.y1, RK.x1 + W, RK.y1 + W),
          wall(RK.x0 - W, RK.y0, RK.x0, GOAL[0]), wall(RK.x0 - W, GOAL[1], RK.x0, RK.y1),
          wall(RK.x1, RK.y0, RK.x1 + W, GOAL[0]), wall(RK.x1, GOAL[1], RK.x1 + W, RK.y1),
        ],
      };
    },
    icon() {
      return mgIcon('hockey', 84, 50, (put) => { put(mallet(0), 0.9, 0.5, 0); put(puck(), -0.3, -0.1, 0); put(mallet(1), -1.4, -0.7, 0); });
    },
    reset() {
      this.score = [0, 0];
      this.m = [{ x: 11.5, y: 4, vx: 0, vy: 0, r: MR, m: 5, fixed: true, tx: 11.5, ty: 4 }, { x: 2.5, y: 4, vx: 0, vy: 0, r: MR, m: 5, fixed: true }];
      this.serve(1);
      this.ptr = null;
    },
    serve(toward) {
      this.p = { x: 7 + (toward ? -1.5 : 1.5), y: 4, vx: 0, vy: 0, r: PR, m: 1 };
      this.pause = 0.8; this.msg = '';
    },
    down(sx, sy) { this.ptr = mgToWorld(sx, sy, FL); },
    move(sx, sy, d) { if (d || !G.touch) this.ptr = mgToWorld(sx, sy, FL); },
    update(dt) {
      const me = this.m[0], cpu = this.m[1], p = this.p;
      // 自分の消しゴム: 指かマウスの位置へ(キーでも動く)
      const [kx, ky] = mgPadDir();
      if (kx || ky) { me.tx = me.x + kx * 2; me.ty = me.y + ky * 2; this.ptr = null; }
      else if (this.ptr) { me.tx = this.ptr[0]; me.ty = this.ptr[1]; }
      this.drive(me, me.tx, me.ty, 16, dt, 7.3, RK.x1);
      // CPU: 自分のゴールとキャップの間を守り、近くに来たら打つ
      const sp = mgLv(5.5, 8, 11);
      let tx, ty;
      if (p.x < 7.4 && Math.hypot(p.vx, p.vy) < mgLv(5, 8, 11)) {
        // キャップの向こう側(相手ゴールと反対側)へ回り込んでから打ち抜く
        const ux = 14 - p.x, uy = 4 + (Math.random() - 0.5) * 0.4 - p.y, l = Math.hypot(ux, uy) || 1;
        const behind = (cpu.x - p.x) * ux / l + (cpu.y - p.y) * uy / l < -0.3;
        tx = behind ? p.x + ux / l * 0.8 : p.x - ux / l * 1.1; ty = behind ? p.y + uy / l * 0.8 : p.y - uy / l * 1.1;
      }
      else { tx = Math.min(p.x, 2.2 + mgLv(0, 0.4, 0.8)); ty = 4 + (p.y - 4) * mgLv(0.5, 0.7, 0.85); }
      this.drive(cpu, tx, ty, sp, dt, RK.x0, 6.6);
      if (this.pause > 0) { this.pause -= dt; return; }
      mgDiscs([p, me, cpu], dt, 0.9, (A, B, s) => { if (s > 1) mgSnd(s > 6 ? 'hit' : 'tap'); });
      const v = Math.hypot(p.vx, p.vy);
      if (v > 17) { p.vx *= 17 / v; p.vy *= 17 / v; }
      // 壁
      if (p.y < RK.y0 + PR) { p.y = RK.y0 + PR; p.vy = Math.abs(p.vy) * 0.9; mgSnd('tap'); }
      if (p.y > RK.y1 - PR) { p.y = RK.y1 - PR; p.vy = -Math.abs(p.vy) * 0.9; mgSnd('tap'); }
      const inGoal = p.y > GOAL[0] + 0.1 && p.y < GOAL[1] - 0.1;
      if (!inGoal) {
        if (p.x < RK.x0 + PR) { p.x = RK.x0 + PR; p.vx = Math.abs(p.vx) * 0.9; mgSnd('tap'); }
        if (p.x > RK.x1 - PR) { p.x = RK.x1 - PR; p.vx = -Math.abs(p.vx) * 0.9; mgSnd('tap'); }
      } else if (p.x < RK.x0 - 0.2 || p.x > RK.x1 + 0.2) {
        const who = p.x < 7 ? 0 : 1;
        this.score[who]++;
        mgSnd(who === 0 ? 'good' : 'bad');
        mgBurst(p.x < 7 ? 0 : 14, p.y, 0.4, 8, '#efe8d8', 2);
        if (this.score[who] >= WIN) return this.end();
        this.serve(who === 0 ? 1 : 0);
        this.pause = 1.1;
      }
      if (MINI.t >= TIME) this.end();
    },
    end() {
      const [a, b] = this.score;
      mgFinish({ head: a > b ? 'かち' : a < b ? 'まけ' : '引き分け', lines: ['あなた ' + a + ' - ' + b + ' CPU'], good: a >= b });
    },
    drive(m, tx, ty, sp, dt, xmin, xmax) {
      tx = Math.max(Math.max(RK.x0, xmin) + MR, Math.min(Math.min(RK.x1, xmax) - MR, tx));
      ty = Math.max(RK.y0 + MR, Math.min(RK.y1 - MR, ty));
      const dx = tx - m.x, dy = ty - m.y, d = Math.hypot(dx, dy), s = Math.min(d, sp * dt);
      const nx = d > 0 ? m.x + dx / d * s : m.x, ny = d > 0 ? m.y + dy / d * s : m.y;
      m.vx = (nx - m.x) / dt; m.vy = (ny - m.y) / dt; m.x = nx; m.y = ny;
    },
    draw(ctx, vw, vh) {
      mgCamera(vw, vh, 7, 4, FL, 6);
      const p = this.p;
      const objs = [
        { s: puck(), x: p.x, y: p.y, z: FL, g: FL },
        { s: mallet(0), x: this.m[0].x, y: this.m[0].y, z: FL, g: FL },
        { s: mallet(1), x: this.m[1].x, y: this.m[1].y, z: FL, g: FL },
      ];
      mgDraw(ctx, vw, vh, objs, (c) => mgFxDraw(c));
    },
    hud(ctx, vw, vh) {
      mgHudNote(ctx, 6, 30, 'あなた', String(this.score[0]), COL.noteR, COL.noteRDark);
      mgHudNote(ctx, vw - 6, 30, 'CPU', String(this.score[1]), COL.noteB, COL.noteBDark, true);
      mgHudTag(ctx, vw, 'のこり ' + Math.max(0, Math.ceil(TIME - MINI.t)) + ' 秒');
    },
  };
  mgRegister(G_);
})();
