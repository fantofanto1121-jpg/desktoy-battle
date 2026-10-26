// 紙ずもう: 箱のふたの土俵をトントンたたいて、紙の力士を前へ進める
'use strict';

(function () {
  const RING = 3.6, TOP = 0.55, BOUTS = 2;
  // 紙の力士(+x向き)。前で縦に折った紙を2枚の板にして、外側に横向きの力士を描く
  const ART = [
    '.......kk...', '......kkkk..', '.....ssssss.', '.....sssses.', '.....ssssss.', '......ssss..',
    '...sssssss..', '..ssssssssss', '..sssssssss.', '..sssssssss.', '..rrrrrrrrr.', '..rrrrrrrrr.',
    '...ss...ss..', '...ss...ss..', '..sss..sss..', '............',
  ];
  function wrestlerModel(team) {
    const H = 1.8, F = 0.4, BX = -0.4, BY = 0.55;
    return makeModel(mgScale({
      size: [0.9, 1.2, H], vs: 0.04,
      fill(x, y, z) {
        const sg = y >= 0 ? 1 : -1, ex = BX - F, ey = BY * sg, L2 = ex * ex + ey * ey;
        const u = Math.max(0, Math.min(1, ((x - F) * ex + y * ey) / L2));
        const dx = x - (F + ex * u), dy = y - ey * u;
        if (dx * dx + dy * dy > 0.0016) return 0;
        const col = Math.floor((1 - u) * 11.99), row = Math.floor((H - z) / H * 16);
        const ch = (ART[row] || '')[col];
        if (ch === 's') return M.skin;
        if (ch === 'k') return M.black;
        if (ch === 'e') return M.eye;
        if (ch === 'r') return M[team ? 'navy' : 'red'];
        return M.paper;
      },
    }, 1.3));
  }
  // lean: 前後の傾き、side: 左右のゆれ
  const wSpr = (team, lean, side) => mgSpr('sm' + team + '|' + lean + '|' + side, () => {
    const yaw = team ? Math.PI : 0, pitch = lean * 0.12;
    return mgBake(mgModel('smW' + team, () => wrestlerModel(team)), { yaw, pitch, roll: side * 0.2, sink: -Math.abs(lean) * 0.05 - Math.abs(side) * 0.1 });
  });

  const G_ = {
    name: '紙ずもう', tint: '#a4564a', cpu: true, kind: 'duel',
    howto: [
      '画面をタップ(Space)すると土俵がトンと鳴り、自分の力士が前へ出ます。',
      '速くたたきすぎるとぐらついて倒れます。リズムよく。',
      '相手を押し出すか倒せば勝ち。先に2勝で勝利です。',
    ],
    stageDef() {
      return {
        cx: 0, cy: 0,
        items: [{ x0: -5.2, y0: -5.2, x1: 5.2, y1: 5.2, z: 0, h: TOP, r: 0.15,
          top(x, y, px, py) {
            const r = Math.hypot(x, y);
            let col = mgTone(['#d4b083', '#c6a173', '#b28d61', '#9d7a51'].map(hexRGB), 0.9 + (vnoise(x * 3, y * 0.6) - 0.5) * 0.9 + (r < RING ? -0.4 : 0.3), px, py);
            if (Math.abs(r - RING) < 0.07 || Math.abs(r - RING - 0.2) < 0.04) col = hexRGB('#f1ece0');
            if (Math.abs(Math.abs(x) - 0.75) < 0.05 && Math.abs(y) < 0.5) col = hexRGB('#f1ece0');   // 仕切り線
            if (Math.abs(Math.max(Math.abs(x), Math.abs(y)) - 5.0) < 0.04) col = hexRGB('#8d6d47');
            return col;
          },
          side: ['#b28d61', '#9d7a51', '#7f6240'].map(hexRGB) }],
      };
    },
    icon() {
      return mgIcon('sumo', 84, 54, (put) => { put(wSpr(0, 1, 0), -0.5, 0.5, 0); put(wSpr(1, 1, 0), 0.5, -0.5, 0); });
    },
    reset() { this.wins = [0, 0]; this.bout = 0; this.newBout(); },
    newBout() {
      const mk = (team) => ({ team, x: team ? 1.3 : -1.3, y: 0, v: 0, tilt: 0, tv: 0, fallen: 0, side: 0 });
      this.w = [mk(0), mk(1)];
      this.state = 'ready'; this.t = 0; this.msg = this.bout === 0 ? 'はっけよい' : '次の取組'; this.msgT = 1.3; this.win = -1;
      this.cpuT = 0.6; this.shake = 0; this.taps = [];
    },
    tap(i) {
      if (this.state !== 'fight') return;
      const w = this.w[i], dir = i ? -1 : 1;
      w.v += dir * 1.05;
      // 速くたたくほどぐらつく
      const now = MINI.t, last = this.taps[i] || 0, gap = now - last;
      this.taps[i] = now;
      w.tv += dir * 0.5 + (Math.random() - 0.5) * (gap < 0.16 ? 5 : gap < 0.24 ? 2.4 : 1.2);
      this.shake = 0.08;
      if (i === MINI.seat) mgSnd('tap');
    },
    onAct(seat) { this.tap(seat); },
    press() { if (!mgHost() && this.state === 'fight') mgSnd('tap'); mgInput({ t: 1 }); },
    down() { this.press(); },
    key(code) { if (code === 'Space' || code === 'Enter') this.press(); },
    update(dt) {
      this.msgT -= dt; this.shake -= dt;
      if (this.state === 'ready') { if (this.msgT <= 0) this.state = 'fight'; return; }
      if (this.state === 'fight' && mgCpu(1)) {
        this.cpuT -= dt;
        if (this.cpuT <= 0) { this.tap(1); this.cpuT = mgLv(0.36, 0.27, 0.215) * (0.8 + Math.random() * 0.45); }
      }
      const [a, b] = this.w;
      for (const w of this.w) {
        if (w.fallen) { w.fallen = Math.min(3, w.fallen + dt * 8); continue; }
        w.v *= Math.exp(-3.2 * dt);
        w.x += w.v * dt;
        w.tv += (-w.tilt * 9 - w.tv * 2.6) * dt;
        w.tilt += w.tv * dt;
        w.side = Math.max(-1, Math.min(1, w.side + (Math.random() - 0.5) * dt * 4)) * Math.exp(-dt);
      }
      // ぶつかったら押し合い(勢いの強いほうが押す)
      if (!a.fallen && !b.fallen && b.x - a.x < 1.15) {
        const ov = 1.15 - (b.x - a.x);
        a.x -= ov / 2; b.x += ov / 2;
        if (a.v > b.v) { const vc = (a.v + b.v) / 2; a.tv -= (a.v - vc) * 0.6; b.tv += (a.v - vc) * 0.6; a.v = vc; b.v = vc; }
      }
      if (this.state === 'fight') {
        let loser = -1, why = '';
        for (const w of this.w) {
          if (Math.abs(w.tilt) > 1.15 && !w.fallen) { w.fallen = 0.01; loser = w.team; why = 'たおれた'; mgSnd('soft'); }
          else if (Math.abs(w.x) > RING && loser < 0) { loser = w.team; why = '押し出し'; }
        }
        if (loser >= 0) {
          this.state = 'end'; this.endT = 1.6;
          const win = 1 - loser;
          this.wins[win]++;
          this.win = win; this.msg = why; this.msgT = 1.6;
          mgSnd(win === MINI.seat ? 'good' : 'bad');
        }
      } else if (this.state === 'end') {
        this.endT -= dt;
        if (this.endT <= 0) {
          if (this.wins[0] >= BOUTS || this.wins[1] >= BOUTS) {
            const W = this.wins;
            mgFinish((seat) => ({ head: W[seat] > W[1 - seat] ? 'かち' : 'まけ', lines: ['あなた ' + W[seat] + ' 勝  /  ' + mgVs(seat) + ' ' + W[1 - seat] + ' 勝'], good: W[seat] > W[1 - seat] }));
            this.state = 'done';
          } else { this.bout++; this.newBout(); }
        }
      }
    },
    snap() {
      return { w: this.w.map(w => [w.x, w.v, w.tilt, w.fallen, w.side].map(v => Math.round(v * 1000) / 1000)), st: this.state, m: this.msg, mt: this.msgT, wi: this.wins, win: this.win, sh: this.shake };
    },
    apply(s) {
      s.w.forEach((a, i) => { const w = this.w[i]; [w.x, w.v, w.tilt, w.fallen, w.side] = a; });
      this.state = s.st; this.msg = s.m; this.msgT = s.mt; this.wins = s.wi; this.win = s.win; this.shake = s.sh;
    },
    guest(dt) { this.msgT -= dt; this.shake -= dt; },
    draw(ctx, vw, vh) {
      const sh = this.shake > 0 ? 1 : 0;
      mgCamera(vw, vh, 0, 0, TOP, 10 + sh);
      const objs = this.w.map(w => {
        const lean = w.fallen ? Math.sign(w.tilt || 1) * (w.team ? -1 : 1) * Math.round(w.fallen + 1) * 2 : Math.max(-3, Math.min(3, Math.round(w.tilt * (w.team ? -1 : 1) * 2.4)));
        return { s: wSpr(w.team, Math.max(-9, Math.min(9, lean)), Math.round(w.side)), x: w.x, y: 0, z: TOP + (this.shake > 0.04 ? 0.08 : 0), g: TOP };
      });
      mgDraw(ctx, vw, vh, objs);
    },
    hud(ctx, vw, vh) {
      const me = MINI.seat;
      mgHudNote(ctx, 6, 30, mgName(me), this.wins[me] + ' 勝', me ? COL.noteB : COL.noteR, me ? COL.noteBDark : COL.noteRDark);
      mgHudNote(ctx, vw - 6, 30, mgName(1 - me), this.wins[1 - me] + ' 勝', me ? COL.noteR : COL.noteB, me ? COL.noteRDark : COL.noteBDark, true);
      const msg = this.win >= 0 ? (this.win === me ? 'あなたの勝ち  ' : mgName(1 - me) + 'の勝ち  ') + this.msg : this.msg;
      if (this.msgT > 0) centerCard(ctx, vw, vh, [[msg, 14, COL.ink, true]], { up: 70 });
      else mgHudTag(ctx, vw, G.touch ? '画面をトントンたたく' : 'Space / クリックでトン');
      // ぐらつきの目安
      const w = this.w[me], k = Math.min(1, Math.abs(w.tilt) / 1.15);
      const bx = Math.floor(vw / 2 - 40), by = vh - 18;
      card(ctx, bx - 4, by - 4, 88, 14, {});
      ctx.fillStyle = '#d8d0bf'; ctx.fillRect(bx, by, 80, 6);
      ctx.fillStyle = k > 0.7 ? COL.red : k > 0.4 ? '#c9a53f' : '#7f9a6a'; ctx.fillRect(bx, by, Math.round(80 * k), 6);
      txt(ctx, 'ぐらつき', bx - 8, by - 3, 9, '#efe8d8', true, 'r');
    },
  };
  mgRegister(G_);
})();
