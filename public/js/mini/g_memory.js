// 付箋の神経衰弱: 裏返した付箋を2枚ずつめくり、同じ絵をそろえる。CPUと交互
'use strict';

(function () {
  const N = 4, GAP = 2.75, NS = 2.4, TOPZ = 0.06;
  // 12x12 の絵。文字 -> 素材
  const LEG = { k: 'graphite', y: 'pencil', w: 'pWood', p: 'pEraser', m: 'metal', r: 'red', b: 'blue', W: 'white', s: 'shark', e: 'belly', n: 'black', c: 'cream', d: 'seam', g: 'green' };
  const PICS = [
    ['pp..........', 'ppp.........', '.ppm........', '..mmy.......', '...yyy......', '....yyy.....', '.....yyy....', '......yyy...', '.......yyw..', '........ww..', '..........k.', '............'],   // えんぴつ(斜めの向きを画面の縦に合わせて左右反転)
    ['............', '..mmmmmmmm..', '.m........m.', '.m.mmmmmm.m.', '.m.m....m.m.', '.m.m.mm.m.m.', '.m.m.m..m.m.', '.m.m.mmmm.m.', '.m.m......m.', '.m.mmmmmmmm.', '.m..........', '..mmmmmmmm..'],   // クリップ
    ['............', '............', '..WWWbbbbWW.', '.WWWWbbbbWWW', '.WWWWbWbbWWW', '.WWWWbbbbWWW', '.WWWWbbbbWWW', '.dWWWbbbbWWd', '..dddbbbbdd.', '............', '............', '............'],   // 消しゴム
    ['............', '....rrrr....', '...rrrrrr...', '..rrrWrrrr..', '..rrWrrrrr..', '..rrrrrrrr..', '...rrrrrr...', '....rrrr....', '.....mm.....', '.....mm.....', '.....m......', '............'],   // 画鋲
    ['m..........m', '.m........m.', '..m......m..', '...m....m...', '....m..m....', '.....mm.....', '.....mm.....', '....r..r....', '...r....r...', '..r.r..r.r..', '..r.r..r.r..', '...r....r...'],   // はさみ
    ['cccccccccccc', 'cnccncccnccn', 'cnccncccnccn', 'cnccccccnccc', 'cnccccccnccc', 'cccccccccccc', 'cccccccccccc', '............', '............', '............', '............', '............'],   // 定規
    ['............', '.....s......', '....ss......', '...sssss...s', '.sssssssss.s', 'nsssssssssss', '.sseeeeess.s', '..eeeeeee..s', '............', '............', '............', '............'],   // サメ
    ['............', '.....WW.....', '....WbbW....', '....WWWW....', '..rrrrrrrr..', '.rrrrrrrrrr.', '.rWWWWWWWWr.', '..rrrrrrrr..', '...rrrrrr...', '............', '............', '............'],   // 船
  ];
  function noteModel(pic) {
    const P = PICS[pic];
    return makeModel({
      size: [NS, NS, 0.07], vs: 0.05,
      fill(x, y, z) {
        // 裏面(下)に絵を描く。めくると見える
        if (z < 0.035 && pic >= 0) {
          const u = Math.floor((x + 0.9) / 0.15), v = Math.floor((-y + 0.9) / 0.15);
          if (u >= 0 && v >= 0 && u < 12 && v < 12) { const ch = P[v][u]; if (ch !== '.') return M[LEG[ch]]; }
          return M.paper;
        }
        if (y < -NS / 2 + 0.3 && z > 0.035) return M.note;   // のりの帯(少し濃い)
        return M.note;
      },
    });
  }
  // 付箋の焼き込み。flip: 0 伏せ ... 4 表
  const noteSpr = (pic, flip) => mgSpr('mn' + pic + '|' + flip, () => {
    const a = flip / 4 * Math.PI, sink = -(NS / 2 * Math.abs(Math.sin(a)) + (flip > 2 ? 0.07 * Math.abs(Math.cos(a)) : 0));   // 地面より下に回った分を持ち上げる
    return mgBake(mgModel('mNote' + pic, () => noteModel(pic)), { roll: a, sink });
  });

  const G_ = {
    name: '付箋の神経衰弱', tint: '#d9b350', cpu: true, kind: 'duel',
    howto: [
      '伏せた付箋を2枚めくって、同じ絵ならもらえます。',
      'そろえたらもう一度。はずれたら相手の番です。',
      '多くそろえたほうの勝ち。',
    ],
    stageDef() {
      const s = (N - 1) * GAP / 2 + NS / 2 + 0.7;
      return {
        cx: 0, cy: 0,
        items: [{ x0: -s, y0: -s, x1: s, y1: s, z: 0, h: 0.06, r: 0.3,
          top: (x, y, px, py) => {
            let col = mgTone(['#5f7d64', '#536f58', '#47614c', '#3d5442'].map(hexRGB), 1.2 + (x + y) / (4 * s) + (vnoise(x * 2, y * 2) - 0.5) * 0.8, px, py);
            if (Math.abs(Math.max(Math.abs(x), Math.abs(y)) - (s - 0.35)) < 0.04) col = hexRGB('#8ea58f');
            return col;
          },
          side: ['#3d5442', '#33473a', '#2a3b30'].map(hexRGB) }],
      };
    },
    icon() {
      return mgIcon('memory', 84, 50, (put) => { put(noteSpr(6, 4), -1.1, 0.3, 0); put(noteSpr(6, 0), 1.1, -0.3, 0); put(noteSpr(0, 2), 0, 0, 0.4); });
    },
    reset() {
      const pics = [];
      for (let i = 0; i < N * N / 2; i++) pics.push(i, i);
      for (let i = pics.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pics[i], pics[j]] = [pics[j], pics[i]]; }
      this.cards = pics.map((pic, i) => ({ pic, i, gx: i % N, gy: Math.floor(i / N), f: 0, up: false, owner: -1, fly: 0, sx: 0, sy: 0, pile: 0 }));
      this.turn = 0; this.open = []; this.wait = 0; this.score = [0, 0]; this.mem = new Map(); this.cpuT = 0; this.flips = 0;
    },
    pos(c) {
      const o = (N - 1) * GAP / 2;
      return [c.gx * GAP - o, c.gy * GAP - o];
    },
    flip(c) {
      c.up = true; this.open.push(c); mgSnd('flip');
      // CPUは見た札を覚えるが、人と同じく時間がたつほど忘れる(思い出せるかは選ぶときに決める)
      this.flips++; this.mem.set(c.i, { pic: c.pic, t: this.flips });
      if (this.open.length === 2) this.wait = 1.0;
    },
    down(sx, sy) {
      if (this.turn !== MINI.seat || this.wait > 0 || this.open.length >= 2) return;
      const [x, y] = mgToWorld(sx, sy, TOPZ);
      for (const c of this.cards) {
        if (c.up || c.owner >= 0) continue;
        const [cx, cy] = this.pos(c);
        if (Math.abs(x - cx) < NS / 2 + 0.1 && Math.abs(y - cy) < NS / 2 + 0.1) { mgInput({ i: c.i }); return; }
      }
    },
    onAct(seat, a) {
      const c = this.cards[a.i | 0];
      if (this.turn !== seat || this.wait > 0 || this.open.length >= 2 || !c || c.up || c.owner >= 0) return;
      this.flip(c);
    },
    // 見てから何枚めくられたかで、思い出せる確率が下がる
    recall(c) {
      const m = this.mem.get(c.i);
      if (!m) return false;
      const age = this.flips - m.t;
      return Math.random() < mgLv(0.55, 0.75, 0.88) * Math.exp(-age / mgLv(4, 7, 12));
    },
    // 覚えたつもりの札でも、ときどき隣の札と取り違える
    blur(c, live) {
      if (Math.random() >= mgLv(0.3, 0.18, 0.08)) return c;
      const nb = live.filter(d => d !== c && Math.abs(d.gx - c.gx) + Math.abs(d.gy - c.gy) === 1);
      return nb.length ? nb[Math.floor(Math.random() * nb.length)] : c;
    },
    cpuPick() {
      const live = this.cards.filter(c => c.owner < 0 && !c.up);
      if (!live.length) return null;
      const pick = (a) => a[Math.floor(Math.random() * a.length)];
      const known = live.filter(c => this.recall(c));
      const fresh = live.filter(c => !this.mem.has(c.i));
      if (this.open.length === 1) {
        const a = this.open[0], m = known.find(c => this.mem.get(c.i).pic === a.pic);
        if (m) return this.blur(m, live);
        return pick(fresh.length ? fresh : live);
      }
      for (const c of known) for (const d of known) if (c !== d && this.mem.get(c.i).pic === this.mem.get(d.i).pic) return this.blur(c, live);
      return pick(fresh.length ? fresh : live);
    },
    anim(dt) {
      for (const c of this.cards) {
        const target = c.up || c.owner >= 0 ? 4 : 0;
        c.f += Math.sign(target - c.f) * Math.min(Math.abs(target - c.f), dt * 16);
        if (c.owner >= 0 && c.f >= 4) c.fly = Math.min(1, c.fly + dt * 2.2);
      }
    },
    update(dt) {
      this.anim(dt);
      if (this.wait > 0) {
        this.wait -= dt;
        if (this.wait <= 0 && this.open.length === 2) {
          const [a, b] = this.open;
          this.open = [];
          if (a.pic === b.pic) {
            for (const c of [a, b]) { c.owner = this.turn; c.pile = this.score[this.turn]; this.mem.delete(c.i); }
            this.score[this.turn]++;
            mgSnd(this.turn === MINI.seat ? 'good' : 'bad');
          } else {
            a.up = b.up = false; this.turn = 1 - this.turn; this.cpuT = 0.8;
            mgSnd('soft');
          }
          if (this.cards.every(c => c.owner >= 0)) {
            const S = this.score;
            mgFinish((seat) => { const p = S[seat], q = S[1 - seat]; return { head: p > q ? 'かち' : p < q ? 'まけ' : '引き分け', lines: ['あなた ' + p + ' 組  /  ' + mgVs(seat) + ' ' + q + ' 組'], good: p >= q }; });
          }
        }
      }
      if (mgCpu(this.turn) && this.wait <= 0 && this.open.length < 2) {
        this.cpuT -= dt;
        if (this.cpuT <= 0) { const c = this.cpuPick(); if (c) this.flip(c); this.cpuT = 0.7; }
      }
    },
    snap() {
      return { c: this.cards.map(c => [c.pic, c.up ? 1 : 0, c.owner, c.pile]), tu: this.turn, w: this.wait, sc: this.score, o: this.open.map(c => c.i) };
    },
    apply(s) {
      s.c.forEach((a, i) => { const c = this.cards[i]; c.pic = a[0]; c.up = !!a[1]; c.owner = a[2]; c.pile = a[3]; });
      this.turn = s.tu; this.wait = s.w; this.score = s.sc; this.open = s.o.map(i => this.cards[i]);
    },
    guest(dt) { this.anim(dt); },
    draw(ctx, vw, vh) {
      mgCamera(vw, vh, 0, 0, 0, 10);
      const objs = [];
      const o = (N - 1) * GAP / 2 + NS / 2 + 1.6;
      for (const c of this.cards) {
        let [x, y] = this.pos(c), z = TOPZ;
        const f = Math.round(c.f);
        if (f > 0 && f < 4) z += 0.3 * Math.sin(c.f / 4 * Math.PI);
        if (c.owner >= 0) {
          // 取った札は自分の側(左手前 / 右奥)へ重ねる
          const mine = c.owner === 0, px = mine ? -o : o, py = mine ? o - 1 : -o + 1, pz = 0.08 * c.pile;
          const u = c.fly, e = u * u * (3 - 2 * u);
          x = x + (px - x) * e; y = y + (py - y) * e; z = z + (pz - z) * e + Math.sin(u * Math.PI) * 1.4;
        }
        const hov = this.turn === MINI.seat && UI.hover === null && !c.up && c.owner < 0 && this.hit === c;
        objs.push({ s: noteSpr(c.pic, f), x, y, z: z + (hov ? 0.12 : 0), g: TOPZ, k: mgDepth(x, y) + z });
      }
      mgDraw(ctx, vw, vh, objs);
    },
    move(sx, sy) {
      const [x, y] = mgToWorld(sx, sy, TOPZ);
      this.hit = null;
      for (const c of this.cards) { const [cx, cy] = this.pos(c); if (Math.abs(x - cx) < NS / 2 && Math.abs(y - cy) < NS / 2) this.hit = c; }
    },
    hud(ctx, vw, vh) {
      const me = MINI.seat;
      mgHudNote(ctx, 6, 30, mgName(me), this.score[me] + ' 組', me ? COL.noteB : COL.noteR, me ? COL.noteBDark : COL.noteRDark);
      mgHudNote(ctx, vw - 6, 30, mgName(1 - me), this.score[1 - me] + ' 組', me ? COL.noteR : COL.noteB, me ? COL.noteRDark : COL.noteBDark, true);
      mgHudTag(ctx, vw, this.turn === me ? 'あなたの番' : mgName(1 - me) + 'の番');
    },
  };
  mgRegister(G_);
})();
