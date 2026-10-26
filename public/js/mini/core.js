// ミニゲーム集の土台: 舞台の焼き込み、物体の描画、操作、画面の流れ
'use strict';

const MINI = {
  games: [],          // 各ゲームが登録する
  cur: null,          // 遊んでいるゲーム
  st: 'menu',         // menu / intro / play / result
  stage: null,        // 焼き込んだ舞台 { c, x, y, cx, cy }
  cam: { ox: 0, oy: 0 },
  ptr: { id: null, down: false, x: 0, y: 0, sx: 0, sy: 0, t: 0 },
  ptrs: new Set(),
  flip: false, fc: [0, 0],   // 相手側から見るとき true(fc は回転の中心)
  result: null,
  t: 0,
  layer: null,
  seat: 0,            // 自分の席(0: 手前で親、1: 相手側から見る)
  net: null,          // オンライン中の状態
};
const KX = -LIGHT[0] / LIGHT[2], KY = -LIGHT[1] / LIGHT[2];

function mgRegister(g) { MINI.games.push(g); }

// ---------- 素材(ミニゲーム用に追加) ----------
defMat('note', ['#e8d690', '#d4c078', '#b5a25f'], '#6a5d33', 'paper');
defMat('noteP', ['#e3b9ab', '#cc9f90', '#ab8174'], '#634640', 'paper');
defMat('noteG', ['#bcd3ab', '#a3bc91', '#829c72'], '#47573d', 'paper');
defMat('noteB', ['#b8cfdc', '#9db7c6', '#7e98a7'], '#455663', 'paper');
defMat('paper', ['#efeadf', '#d9d3c6', '#b8b2a5'], '#66625a', 'paper');
defMat('card', ['#d9c7a3', '#c2ae89', '#a08c69'], '#5d4f37', 'paper');
defMat('green', ['#7e9e6c', '#668556', '#4f6943'], '#2e3d27', 'plastic');
defMat('cream', ['#e9dcc0', '#cfc1a4', '#ab9e83'], '#625a49', 'plastic');
defMat('pink', ['#d69a95', '#bd827d', '#9a6762'], '#583a37', 'rubber');
defMat('band', ['#c9875a', '#ad6f47', '#8a5636'], '#4e301e', 'rubber');
defMat('copper', ['#c99a6a', '#a97d52', '#83603f'], '#4a3624', 'metal');
defMat('skin', ['#e6c7a4', '#cfae8b', '#ad8d6c'], '#62503d', 'plastic');
defMat('navy', ['#4d5f80', '#3d4d6a', '#2f3b52'], '#1d2433', 'plastic');
defMat('steel', ['#b9c0c6', '#949ca3', '#6f777e'], '#3e444a', 'metal');
defMat('tack', ['#c45c4a', '#a3483b', '#7b352d'], '#4a2420', 'plastic');
defMat('tackY', ['#d9b350', '#b9943c', '#8e702d'], '#54421c', 'plastic');
defMat('tackB', ['#5f84ab', '#4a6c91', '#37516f'], '#233244', 'plastic');
defMat('cork', ['#c59c6d', '#ab8457', '#8a6943'], '#4f3c26', 'wood');
defMat('cup', ['#d8d4cc', '#bcb7ae', '#99948b'], '#57534c', 'plastic');

// ---------- 共通モデル ----------
function mgModel(name, make) { return MODELS[name] || (MODELS[name] = make()); }
function mgSpr(key, make) { return SPR.get('mg|' + (MINI.flip ? 'f|' : '') + key, make); }
// 角の丸い箱(中心が原点、底が z=0)
function boxFill(sx, sy, sz, r, mat) {
  return (x, y, z) => {
    const ax = Math.abs(x) - (sx / 2 - r), ay = Math.abs(y) - (sy / 2 - r), az = z - (sz - r);
    const qx = Math.max(ax, 0), qy = Math.max(ay, 0), qz = Math.max(az, 0);
    if (z < 0 || Math.abs(x) > sx / 2 || Math.abs(y) > sy / 2 || z > sz) return 0;
    if (Math.hypot(qx, qy, qz) > r) return 0;
    return typeof mat === 'function' ? mat(x, y, z) : mat;
  };
}
// 中央に紙スリーブを巻いた消しゴム(中心原点)
function mgEraserModel(L, W, H, sleeve, band) {
  return makeModel({
    size: [L, W, H], vs: 0.05, smooth: 1.2,
    fill: boxFill(L, W, H, 0.09, (x) => {
      const u = Math.abs(x) / (L / 2);
      if (u < 0.56) return u < 0.14 ? M[band] : M[sleeve];
      return M.rubberW;
    }),
  });
}

// ---------- 視点 ----------
// ミニゲームは「斜め上から見下ろす」視点で描く。ゲーム内の座標 (x, y) は
// x が画面の右、y が手前(画面の下)。アイソメの世界とは45度回した関係になる。
// 2人で遊ぶときは相手側から見るために180度まわす(MINI.flip)。
const VSX = ISO.X * Math.SQRT2, VSY = ISO.Y * Math.SQRT2;          // 1単位あたりの画素(横、奥行き)
const VKX = (KX - KY) / Math.SQRT2, VKY = (KX + KY) / Math.SQRT2;   // 落ち影の向き(画面基準)
function mgV(x, y) { return MINI.flip ? [MINI.fc[0] * 2 - x, MINI.fc[1] * 2 - y] : [x, y]; }
function mgDepth(x, y) { return MINI.flip ? MINI.fc[1] * 2 - y : y; }
// ゲーム内の向き -> スプライトを焼く向き(世界の向き)
function mgYawW(a) { return (a || 0) + (MINI.flip ? Math.PI : 0) - Math.PI / 4; }
function mgBake(m, opt) { opt = Object.assign({}, opt || {}); opt.yaw = mgYawW(opt.yaw); return bake(m, opt); }

// ---------- 舞台の焼き込み ----------
// def: { cx, cy (舞台の中心), ground(va,vb,px,py)->rgb と fill (机の代わりの地面、省略可), items: [{ x0,y0,x1,y1, z, h, r, top(x,y,px,py)->rgb, side:[手前の面, (未使用), 下端], edge }] }
function mgBakeStage(def) {
  const items = def.items || [];
  const [vcx, vcy] = mgV(def.cx, def.cy);
  const halfW = def.halfW || 460, halfH = def.halfH || 420;
  const left = Math.floor(vcx * VSX - halfW), top = Math.floor(vcy * VSY - halfH);
  const w = halfW * 2, h = halfH * 2;
  const c = makeCanvas(w, h), g = c.getContext('2d'), img = g.createImageData(w, h), d = img.data;
  const lampX = vcx - 9, lampY = vcy - 9;
  const fl = MINI.flip ? -1 : 1, kx = VKX * fl, ky = VKY * fl;   // 影の向き(ゲーム座標)
  const inIt = (it, x, y) => {
    if (x < it.x0 || y < it.y0 || x > it.x1 || y > it.y1) return false;
    const r = it.r || 0;
    if (!r) return true;
    const qx = Math.max(it.x0 + r - x, x - (it.x1 - r), 0), qy = Math.max(it.y0 + r - y, y - (it.y1 - r), 0);
    return qx * qx + qy * qy <= r * r;
  };
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t | 0, a[1] + (b[1] - a[1]) * t | 0, a[2] + (b[2] - a[2]) * t | 0];
  const shade = (col, x, y, z, self, px, py) => {
    // 高い物の落ち影
    let s = 0;
    for (const it of items) {
      if (it === self) continue;
      const zt = it.z + it.h;
      if (zt <= z + 0.001) continue;
      const dz = zt - z;
      if (inIt(it, x - kx * dz, y - ky * dz)) { s = 2; break; }
      if (inIt(it, x - kx * dz * 1.5, y - ky * dz * 1.5) && (px + py) % 2 === 0) s = Math.max(s, 1);
    }
    return s ? mix(col, PAL.shadow, 0.42) : col;
  };
  const toG = (va, vb) => mgV(va, vb);   // 画面基準 -> ゲーム座標(180度回転は自分自身が逆)
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const sx = px + left + 0.5, sy = py + top + 0.5, va = sx / VSX;
    let best = null, bz = -1, bside = 0, bx = 0, by = 0;
    for (const it of items) {
      const zt = it.z + it.h;
      if (zt <= bz) continue;
      const [x, y] = toG(va, (sy + zt * ISO.Z) / VSY);
      if (inIt(it, x, y)) { best = it; bz = zt; bside = 0; bx = x; by = y; continue; }
      const kmax = Math.round(it.h * ISO.Z);
      for (let k = 1; k <= kmax; k++) {
        const zz = zt - k / ISO.Z;
        if (zz <= bz) break;
        const [x2, y2] = toG(va, (sy - k + zt * ISO.Z) / VSY);
        if (inIt(it, x2, y2)) { best = it; bz = zz; bx = x2; by = y2; bside = k === kmax ? 3 : 1; break; }
      }
    }
    const i = (py * w + px) * 4;
    let col;
    if (best) {
      if (bside) col = best.side[bside - 1];
      else {
        col = best.top(bx, by, px, py);
        if (best.edge) {
          const [, vb] = mgV(bx, by), [, vb1] = mgV(bx, MINI.flip ? best.y0 : best.y1);
          if (Math.abs(vb1 - vb) < 0.08) col = best.edge;   // 手前の縁の明るい線
        }
        col = shade(col, bx, by, bz, best, px, py);
      }
    } else {
      const vb = sy / VSY, [x, y] = toG(va, vb);
      col = shade(def.ground ? def.ground(va, vb, px, py) : mgDesk(va, vb, px, py, lampX, lampY), x, y, 0, null, px, py);
    }
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // 物の並んでいる範囲(画面の画素)。拡大率を決めるのに使う
  let bx0 = 1e9, bx1 = -1e9, by0 = 1e9, by1 = -1e9;
  for (const it of items) for (const [x, y] of [[it.x0, it.y0], [it.x1, it.y1], [it.x0, it.y1], [it.x1, it.y0]]) {
    const [a, b] = mgV(x, y);
    bx0 = Math.min(bx0, a * VSX); bx1 = Math.max(bx1, a * VSX);
    by0 = Math.min(by0, b * VSY - ((it.z || 0) + (it.h || 0)) * ISO.Z); by1 = Math.max(by1, b * VSY - (it.z || 0) * ISO.Z);
  }
  return { c, x: left, y: top, fill: def.fill || 'rgb(' + PAL.desk[4].join(',') + ')', box: items.length ? [bx1 - bx0, by1 - by0] : [200, 120] };
}

// 机の板目(本編の机と同じ調子)。座標は画面基準で、板は手前から奥へ通る
function mgDesk(x, y, px, py, lx, ly) {
  const plank = Math.floor((x + 40) / 2.2);
  const seed = hash2(plank, 7) * 50;
  const gr = (x + 0.2 * Math.sin(y * 0.4 + seed) + 0.14 * vnoise(x * 1.4, y * 0.3 + seed)) * 5;
  const broad = vnoise(x * 0.5 + seed, y * 0.09);
  const light = Math.max(0, Math.min(1, 1.15 - Math.hypot(x - lx, (y - ly) * 1.4) / 28));
  let tone = 1 + (broad > 0.62 ? -1 : broad < 0.33 ? 1 : 0) + (hash2(plank, 3) > 0.5 ? 1 : 0);
  tone += (1 - light) * 2.2 + bayer(px, py) - 0.5;
  if (gr - Math.floor(gr) < 0.1) tone += 1.2;
  const sP = (x + 40) / 2.2;
  if (Math.floor(sP) !== Math.floor(sP + 1 / VSX / 2.2)) return PAL.seam;
  return PAL.desk[Math.max(0, Math.min(5, Math.round(tone)))];
}

// 面の塗り分けを作る補助: 3段の色をディザで混ぜる
function mgTone(ramp, L, px, py) { return ramp[Math.max(0, Math.min(ramp.length - 1, Math.round(L + bayer(px, py) - 0.5)))]; }
// 等高線の交差で1画素の線(隣の画素で値の段が変われば線)
function mgCross(f, x, y, s) {
  const a = Math.floor(f(x, y) / s);
  return a !== Math.floor(f(x + 1 / VSX, y) / s) || a !== Math.floor(f(x, y + 1 / VSY) / s);
}

// ---------- 描画 ----------
function mgP(x, y, z) { const [a, b] = mgV(x, y); return [Math.round(a * VSX + MINI.cam.ox), Math.round(b * VSY - (z || 0) * ISO.Z + MINI.cam.oy)]; }
// 画面の点 -> 高さ z の面の上のゲーム座標
function mgToWorld(sx, sy, z) { return mgV((sx - MINI.cam.ox) / VSX, (sy - MINI.cam.oy + (z || 0) * ISO.Z) / VSY); }
// 画面上の位置(カメラなし)
function mgScreen(x, y, z) { const [a, b] = mgV(x, y); return [a * VSX, b * VSY - (z || 0) * ISO.Z]; }
function mgCamera(vw, vh, cx, cy, cz, dy) {
  const [sx, sy] = mgScreen(cx, cy, cz);
  MINI.cam.ox = Math.round(vw / 2 - sx);
  MINI.cam.oy = Math.round(vh / 2 - sy + (dy || 0));
}

// objs: { s: スプライト, x, y, z, k: 並び順(省略時は奥行き), g: 影の落ちる高さ, a: 透明度, ns: 影なし, f(ctx): 自前で描く }
function mgDraw(ctx, vw, vh, objs, after) {
  const st = MINI.stage;
  ctx.fillStyle = st.fill; ctx.fillRect(0, 0, vw, vh);
  ctx.drawImage(st.c, st.x + MINI.cam.ox, st.y + MINI.cam.oy);
  if (!MINI.layer || MINI.layer.width !== vw || MINI.layer.height !== vh) MINI.layer = makeCanvas(vw, vh);
  const sl = MINI.layer, sc = sl.getContext('2d');
  sc.globalCompositeOperation = 'source-over';
  sc.clearRect(0, 0, vw, vh);
  const fl = MINI.flip ? -1 : 1;
  for (const o of objs) {
    if (o.ns || !o.s || !o.s.sh || o.a === 0) continue;
    const g = o.g || 0, dz = Math.max(0, (o.z || 0) - g);
    const [sx, sy] = mgP(o.x + dz * VKX * fl, o.y + dz * VKY * fl, g);
    sc.drawImage(o.s.sh, sx - o.s.sax, sy - o.s.say);
  }
  if (MINI.shadowExtra) MINI.shadowExtra(sc);
  sc.globalCompositeOperation = 'source-in';
  sc.fillStyle = 'rgb(' + PAL.shadow.join(',') + ')';
  sc.fillRect(0, 0, vw, vh);
  ctx.globalAlpha = 0.3; ctx.drawImage(sl, 0, 0); ctx.globalAlpha = 1;
  for (const o of objs) o._k = o.k !== undefined ? o.k : mgDepth(o.x, o.y) + (o.z || 0) * 0.01;
  objs.sort((a, b) => a._k - b._k);
  for (const o of objs) {
    if (o.f) { o.f(ctx); continue; }
    if (!o.s || o.a === 0) continue;
    const [sx, sy] = mgP(o.x, o.y, o.z || 0);
    if (o.a !== undefined && o.a < 1) ctx.globalAlpha = o.a;
    ctx.drawImage(o.s.c, sx - o.s.ax, sy - o.s.ay);
    ctx.globalAlpha = 1;
  }
  if (after) after(ctx);
  ctx.drawImage(R.vignette, 0, 0);
}

// 地面に置く点線の輪(ねらいの目安など)
function mgRing(ctx, x, y, z, r, col, step) {
  ctx.fillStyle = col;
  const n = Math.max(12, Math.round(r * 18));
  for (let k = 0; k < n; k++) {
    if (step && k % step) continue;
    const a = k / n * Math.PI * 2, [sx, sy] = mgP(x + Math.cos(a) * r, y + Math.sin(a) * r, z);
    ctx.fillRect(sx, sy, 1, 1);
  }
}
function mgDots(ctx, x0, y0, z0, x1, y1, z1, col, gap) {
  const [ax, ay] = mgP(x0, y0, z0), [bx, by] = mgP(x1, y1, z1);
  const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / (gap || 3)));
  ctx.fillStyle = col;
  for (let k = 0; k <= n; k++) ctx.fillRect(Math.round(ax + (bx - ax) * k / n), Math.round(ay + (by - ay) * k / n), 1, 1);
}

// 小さな粒(ほこり、紙くず、火花の代わりの白い粒)
const MGFX = [];
function mgBurst(x, y, z, n, col, spd) {
  if (mgHosting()) MINI.net.fx.push([x, y, z, n, col, spd]);
  for (let k = 0; k < n; k++) {
    const a = Math.random() * Math.PI * 2, s = (spd || 2) * (0.4 + Math.random() * 0.8);
    MGFX.push({ x, y, z, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: 1.5 + Math.random() * 2.5, life: 0.5 + Math.random() * 0.4, col });
  }
}
function mgFxStep(dt, ground) {
  for (let i = MGFX.length - 1; i >= 0; i--) {
    const p = MGFX[i];
    p.life -= dt; p.vz -= 14 * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    const gz = ground ? ground(p.x, p.y) : 0;
    if (p.z < gz) { p.z = gz; p.vz *= -0.35; p.vx *= 0.6; p.vy *= 0.6; }
    if (p.life <= 0) MGFX.splice(i, 1);
  }
}
function mgFxDraw(ctx) {
  for (const p of MGFX) { const [sx, sy] = mgP(p.x, p.y, p.z); ctx.fillStyle = p.col; ctx.fillRect(sx, sy, 1, 1); }
}

// ---------- 円盤の物理(はじく系のゲームで共通) ----------
// b: { x, y, vx, vy, r, m, a(向き), w(回転), out(落下中) }
function mgDiscs(bodies, dt, fric, onHit) {
  const N = 4, h = dt / N;
  for (let s = 0; s < N; s++) {
    for (const b of bodies) {
      if (b.fixed) continue;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 0) { const ns = Math.max(0, sp - fric * h); b.vx *= ns / sp; b.vy *= ns / sp; }
      b.x += b.vx * h; b.y += b.vy * h;
      b.a = (b.a || 0) + (b.w || 0) * h; b.w = (b.w || 0) * Math.pow(0.2, h);
    }
    for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
      const A = bodies[i], B = bodies[j];
      if (A.out || B.out || A.ghost || B.ghost) continue;
      const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy), md = A.r + B.r;
      if (d >= md || d < 1e-6) continue;
      const nx = dx / d, ny = dy / d, ov = md - d;
      const ia = A.fixed ? 0 : 1 / A.m, ib = B.fixed ? 0 : 1 / B.m;
      A.x -= nx * ov * ia / (ia + ib); A.y -= ny * ov * ia / (ia + ib);
      B.x += nx * ov * ib / (ia + ib); B.y += ny * ov * ib / (ia + ib);
      const rv = (B.vx - A.vx) * nx + (B.vy - A.vy) * ny;
      if (rv > 0) continue;
      const e = 0.82, jj = -(1 + e) * rv / (ia + ib);
      A.vx -= jj * nx * ia; A.vy -= jj * ny * ia; B.vx += jj * nx * ib; B.vy += jj * ny * ib;
      const tang = (B.vx - A.vx) * -ny + (B.vy - A.vy) * nx;
      A.w = (A.w || 0) + tang * 0.6; B.w = (B.w || 0) - tang * 0.6;
      if (onHit) onHit(A, B, -rv);
    }
  }
}

// ---------- 効果音(本編の合成器を使う) ----------
function mgSnd(name) {
  if (mgHosting()) MINI.net.snd.push(name);
  const A = AUDIO;
  if (!A.ctx || A.ctx.state !== 'running') return;
  const t = A.ctx.currentTime + 0.005;
  switch (name) {
    case 'tap': A.tone('triangle', 900, 700, t, 0.04, 0.18); A.noise(t, 0.02, 0.1, 'highpass', 2500, 2500, 0.7); break;
    case 'hit': A.noise(t, 0.05, 0.35, 'bandpass', 900, 600, 2); A.tone('sine', 220, 120, t, 0.08, 0.3); break;
    case 'soft': A.noise(t, 0.05, 0.2, 'lowpass', 700, 300, 1); break;
    case 'flip': A.noise(t, 0.08, 0.2, 'bandpass', 2600, 1400, 1.5); break;
    case 'swish': A.noise(t, 0.18, 0.25, 'bandpass', 500, 2400, 2); break;
    case 'snap': A.tone('square', 600, 200, t, 0.05, 0.12); A.noise(t, 0.03, 0.25, 'highpass', 1800, 1800, 1); break;
    case 'metal': A.tone('sine', 2100, 2000, t, 0.12, 0.12); A.tone('sine', 3300, 3200, t, 0.08, 0.05); break;
    case 'good': A.tone('triangle', 880, 880, t, 0.08, 0.2); A.tone('triangle', 1320, 1320, t + 0.08, 0.12, 0.2); break;
    case 'bad': A.tone('triangle', 330, 220, t, 0.22, 0.25); break;
    case 'fall': A.tone('sine', 500, 120, t, 0.4, 0.2); break;
    case 'win': [523, 659, 784, 1046].forEach((f, i) => A.tone('triangle', f, f, t + i * 0.1, 0.16, 0.2)); break;
    case 'lose': [392, 330, 262].forEach((f, i) => A.tone('triangle', f, f * 0.98, t + i * 0.14, 0.2, 0.2)); break;
    default: A.play(name);
  }
}

// 舞台が収まるいちばん大きい拡大率(画面の画素 W x H、ふだんの拡大率 base)
function mgFitScale(W, H, base) {
  const g = MINI.cur;
  if (!MINI.stage && !g.view) return base;
  const [sw, sh] = g.view || MINI.stage.box;
  const portrait = H > W * 1.1;
  const s = Math.floor(Math.min(W / (sw + 16), H / (sh + (portrait ? 150 : 80))));
  return Math.min(Math.max(base, s), Math.floor(base * 1.5));
}

// ---------- 画面の流れ ----------
function mgOpen() { G.screen = 'mini'; MINI.st = 'menu'; MINI.cur = null; MINI.flip = false; mgNetEnd(); }
function mgStart(g) {
  if (!MINI.party) mgNetEnd();
  MINI.cur = g; MINI.st = 'intro'; MINI.result = null; MGFX.length = 0;
  MINI.shadowExtra = null; MINI.flip = false;
  mgUseStage(g);
  g.reset();
}
// 今の向き(MINI.flip)の舞台を用意する
function mgUseStage(g) {
  const def = g.stageDef(), k = MINI.flip ? 1 : 0;
  MINI.fc = [def.cx, def.cy];
  g.stages = g.stages || {};
  if (!g.stages[k]) g.stages[k] = mgBakeStage(def);
  MINI.stage = g.stages[k];
}
function mgPlay(seed) {
  const n = MINI.net;
  MINI.st = 'play'; MINI.t = 0; MGFX.length = 0; MINI.rng = (seed === undefined ? Math.random() * 1e9 : seed) >>> 0;
  if (n) { n.again = [false, false]; n.opDone = null; n.my = null; n.op = null; n.snd = []; n.fx = []; n.sendT = 0; }
  MINI.cur.reset(); if (MINI.cur.begin) MINI.cur.begin();
}
// res: { head, lines: [..], good: bool }。対戦では席ごとの結果を返す関数 (seat) => res でもよい。
// 記録勝負(kind: 'race')では { score, unit, lines } を渡すと、相手の記録とくらべて勝ち負けを決める。
function mgFinish(res) {
  if (MINI.st !== 'play') return;
  const g = MINI.cur, n = MINI.net;
  if (g.kind === 'race' && n) {
    n.my = res;
    if (mgHuman()) mgSendD({ k: 'done', sc: res.score });
    else if (!n.opDone) n.opDone = { sc: g.cpuScore ? g.cpuScore() : 0 };
    MINI.st = 'result'; MINI.result = null; MINI.resT = 0;
    mgRaceResult();
    return;
  }
  if (typeof res === 'function') {
    if (mgHuman()) mgSendD({ k: 'fin', r: res(1 - MINI.seat) });
    res = res(MINI.seat);
  }
  mgShowResult(res);
}
function mgShowResult(res) {
  MINI.st = 'result'; MINI.result = res; MINI.resT = 0;
  if (MINI.net) MINI.net.snd = [];
  mgSnd(res.good === false ? 'lose' : 'win');
}
// 記録勝負: 両方の記録がそろったら結果を出す
function mgRaceResult() {
  const n = MINI.net;
  if (!n || !n.my || !n.opDone || MINI.result) return;
  const a = n.my.score, b = n.opDone.sc, u = n.my.unit || '';
  const f = (v) => v >= 999 ? '失格' : v + u;   // 999 は失格(アスレチックで机に落ちた)
  if (n.opDone.gone) { MINI.result = { head: 'かち', lines: (n.my.lines || []).concat(['相手が抜けました']), good: true }; MINI.resT = 0; mgSnd('win'); return; }
  const d = n.my.low ? b - a : a - b;
  const res = { head: d > 0 ? 'かち' : d < 0 ? 'まけ' : '引き分け', lines: (n.my.lines || []).concat([mgName(MINI.seat) + ' ' + f(a) + '  /  ' + mgName(1 - MINI.seat) + ' ' + f(b)]), good: d >= 0 };
  MINI.result = res; MINI.resT = 0;
  mgSnd(res.good ? 'win' : 'lose');
}

// ---------- オンライン ----------
// 対戦(kind: 'duel'): 席0が親になってゲームを動かし、ようすを送る。席1は操作だけを送る。
// 記録勝負(kind: 'race'): おたがいに同じ種(mgRand)で自分のゲームを動かし、途中経過と記録を送り合う。
function mgHuman() { return !!(MINI.net && MINI.net.st === 'play'); }
function mgHost() { return !mgHuman() || MINI.seat === 0; }
function mgHosting() { return mgHuman() && MINI.seat === 0 && MINI.st === 'play' && MINI.cur && MINI.cur.kind === 'duel'; }
function mgName(seat) { return seat === MINI.seat ? 'あなた' : mgHuman() || (MINI.net && MINI.net.wasHuman) ? '相手' : 'CPU'; }
// 結果の文で使う、seat から見た相手の呼び名
function mgVs(seat) { return seat === MINI.seat ? mgName(1 - MINI.seat) : '相手'; }
function mgCpu(seat) { return seat !== MINI.seat && !mgHuman(); }
function mgRand() { let t = MINI.rng = (MINI.rng + 0x6D2B79F5) >>> 0; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }
function mgSendD(d) { send({ t: 'mg', d }); }
// 操作を親へ渡す(親なら自分で受け取る)
function mgInput(a) {
  const g = MINI.cur;
  if (MINI.st !== 'play' || !g.onAct) return;
  if (mgHost()) g.onAct(MINI.seat, a);
  else mgSendD({ k: 'act', a });
}
function mgNetEnd() {
  if (MINI.net) { send({ t: 'mgLeave' }); MINI.net = null; }
  MINI.seat = 0; MINI.flip = false;
}
function mgNetStart(kind) {
  const g = MINI.cur;
  const id = String(MINI.games.indexOf(g));
  MINI.net = { st: 'wait', kind, code: '', since: performance.now(), err: '', game: id };
  MINI.st = kind === 'join' ? 'join' : 'wait';
  if (kind === 'join') { G.title.code = ''; codeInput.value = ''; if (!G.touch) codeInput.focus(); return; }
  connect(() => send(kind === 'quick' ? { t: 'mgQuick', game: id } : { t: 'mgCreate', game: id }));
}
function mgJoinGo() {
  if (!MINI.net || G.title.code.length !== 4) return;
  codeInput.blur();
  MINI.st = 'wait';
  const code = G.title.code;
  connect(() => send({ t: 'mgJoin', code }));
}
function mgNetMsg(m) {
  if (m.t === 'mgStart' && m.game === 'party') { partyStart(true, m.seed, m.seat); return; }
  if (m.t === 'mgCpu' && MINI.party) { MINI.net = null; partyStart(false); return; }
  if (m.t === 'mgErr' && !MINI.net) { G.title.error = m.msg; return; }
  if (MINI.party && MINI.party.online) {
    if (m.t === 'mgLeft') { MINI.party.alone = true; if (MINI.party.ready[0]) partyGo(); if (G.screen !== 'mini') return; }
    if (m.t === 'mg' && m.d && m.d.k === 'nx') { MINI.party.ready[1] = true; if (MINI.party.ready[0]) partyGo(); return; }
  }
  const n = MINI.net, g = MINI.cur;
  if (n && m.t === 'mgRoom') { n.code = m.code; n.since = performance.now(); return; }
  if (!n || G.screen !== 'mini' || !g) return;
  if (m.t === 'mgRoom') { n.code = m.code; n.since = performance.now(); }
  else if (m.t === 'mgErr') { n.err = m.msg; MINI.st = 'join'; }
  else if (m.t === 'mgCpu') { n.st = 'cpu'; MINI.seat = 0; MINI.flip = false; mgUseStage(g); mgPlay(); }
  else if (m.t === 'mgStart') {
    n.st = 'play'; n.wasHuman = true; MINI.seat = m.seat; MINI.flip = m.seat === 1 && g.kind === 'duel' && !g.noFlip;
    mgUseStage(g); mgPlay(m.seed);
  }
  else if (m.t === 'mgLeft') mgOppGone();
  else if (m.t === 'mg') mgNetData(m.d);
}
function mgNetClosed() { if (MINI.net && MINI.net.st !== 'cpu') { if (MINI.net.st === 'wait') { MINI.net.err = '接続できませんでした'; MINI.st = 'intro'; MINI.net = null; } else mgOppGone(); } }
// 相手がいなくなった: 試合中なら不戦勝
function mgOppGone() {
  const n = MINI.net;
  if (!n || n.st === 'gone') return;
  n.st = 'gone';
  if (MINI.cur.kind === 'race') { if (!n.opDone) { n.opDone = { gone: true }; mgRaceResult(); } }
  else if (MINI.st === 'play') mgShowResult({ head: 'かち', lines: ['相手が抜けました'], good: true });
}
function mgNetData(d) {
  const n = MINI.net, g = MINI.cur;
  if (!d) return;
  switch (d.k) {
    case 'act': if (MINI.st === 'play' && MINI.seat === 0 && g.onAct) g.onAct(1, d.a); break;
    case 's':
      if (MINI.st !== 'play' || MINI.seat === 0) break;
      MINI.t = d.t; g.apply(d.s);
      for (const s of d.snd) mgSnd(s === 'good' ? 'bad' : s === 'bad' ? 'good' : s);
      for (const f of d.fx) mgBurst(...f);
      break;
    case 'fin': if (MINI.st === 'play') mgShowResult(d.r); break;
    case 'p': n.op = d.v; break;
    case 'done': n.opDone = { sc: d.sc }; mgRaceResult(); break;
    case 'again': n.again[1] = true; mgTryAgain(); break;
    case 'go': if (MINI.seat === 1) mgPlay(d.seed); break;
  }
}
function mgTryAgain() {
  const n = MINI.net;
  if (n.again[0] && n.again[1] && MINI.seat === 0) { const seed = Math.random() * 1e9 | 0; mgSendD({ k: 'go', seed }); mgPlay(seed); }
}
// 毎フレーム: 親はようすを、記録勝負では途中経過を送る
function mgNetTick(dt) {
  const n = MINI.net, g = MINI.cur;
  if (!mgHuman() || MINI.st !== 'play') return;
  n.sendT -= dt;
  if (n.sendT > 0) return;
  if (g.kind === 'duel' && MINI.seat === 0) {
    n.sendT = 0.05;
    mgSendD({ k: 's', t: MINI.t, s: g.snap(), snd: n.snd, fx: n.fx });
    n.snd = []; n.fx = [];
  } else if (g.kind === 'race') {
    n.sendT = 0.2;
    if (g.prog) mgSendD({ k: 'p', v: g.prog() });
  }
}

function mgButton(id) {
  if (id === 'mgBack') {
    if (MINI.party) { partyEnd(); return true; }
    if (MINI.st === 'menu') { G.screen = 'title'; G.title.mode = 'menu'; }
    else if (MINI.st === 'wait' || MINI.st === 'join') { mgNetEnd(); codeInput.blur(); MINI.st = 'intro'; }
    else { mgNetEnd(); MINI.st = 'menu'; MINI.cur = null; }
    return true;
  }
  if (id === 'mgGo') { if (!MINI.party) mgNetEnd(); mgUseStage(MINI.cur); mgPlay(); return true; }
  if (id === 'mgNext') { partyReady(); return true; }
  if (id === 'mgQuit') { partyEnd(); return true; }
  if (id === 'mgAgain') {
    const n = MINI.net;
    if (mgHuman()) { if (!n.again[0]) { n.again[0] = true; mgSendD({ k: 'again' }); mgTryAgain(); } }
    else { if (n && n.st !== 'cpu') mgNetEnd(); mgUseStage(MINI.cur); mgPlay(); }
    return true;
  }
  if (id === 'mgNetQ') { mgNetStart('quick'); return true; }
  if (id === 'mgNetC') { mgNetStart('create'); return true; }
  if (id === 'mgNetJ') { mgNetStart('join'); return true; }
  if (id === 'mgJoinGo') { mgJoinGo(); return true; }
  if (id === 'mgCode') { codeInput.focus(); return true; }
  if (id === 'mgMenu') { mgNetEnd(); MINI.st = 'menu'; MINI.cur = null; return true; }
  if (/^mgDiff\d$/.test(id)) { G.diff = +id.slice(6); try { localStorage.setItem('dtb-diff', G.diff); } catch (e) {} return true; }
  if (/^mgG\d+$/.test(id)) { mgStart(MINI.games[+id.slice(3)]); return true; }
  if (MINI.cur && MINI.cur.button) return MINI.cur.button(id);
  return false;
}

function mgDown(x, y, id) {
  const p = MINI.ptr; p.id = id; p.down = true; p.x = p.sx = x; p.y = p.sy = y; p.t = performance.now();
  MINI.ptrs.add(id);
  if (MINI.st === 'play' && MINI.cur.down) MINI.cur.down(x, y, id);
}
function mgMove(x, y, id) {
  const p = MINI.ptr;
  if (id === p.id || !p.down) { p.x = x; p.y = y; }
  if (MINI.st === 'play' && MINI.cur.move) MINI.cur.move(x, y, MINI.ptrs.has(id), id);
}
function mgUp(x, y, id) {
  const p = MINI.ptr;
  MINI.ptrs.delete(id);
  if (id === p.id) { p.down = false; p.id = null; p.x = x; p.y = y; }
  if (MINI.st === 'play' && MINI.cur.up) MINI.cur.up(x, y, id);
}
function mgKey(code) { if (MINI.st === 'play' && MINI.cur.key) MINI.cur.key(code); }

function mgFrame(ctx, dt, now, vw, vh) {
  UI.buttons = [];
  if (MINI.party && !MINI.cur) {
    const st = demoState(now); updateFx(dt, st.ents); drawWorld(ctx, updateCamera(null, dt), vw, vh, st); ctx.drawImage(R.vignette, 0, 0);
    if (MINI.st === 'wait') mgWait(ctx, vw, vh, { name: 'いろいろ対戦' });
    return;
  }
  if (MINI.st === 'menu' || !MINI.cur) { mgMenu(ctx, vw, vh, now, dt); return; }
  const g = MINI.cur;
  if (MINI.st === 'play') {
    MINI.t += dt;
    if (mgHost() || g.kind !== 'duel') g.update(dt);
    else if (g.guest) g.guest(dt);
    mgNetTick(dt);
  }
  else if (MINI.st === 'result') { MINI.resT += dt; if (g.idle) g.idle(dt); }
  else if (g.idle) g.idle(dt);
  mgFxStep(dt, g.ground);
  g.draw(ctx, vw, vh);
  const big = UI.big;
  button(ctx, 'mgBack', 'もどる', 6, 6, big ? 64 : 50, big ? 24 : 18, { band: COL.inkSoft, size: big ? 12 : 10 });
  if (MINI.st === 'play' && g.hud) g.hud(ctx, vw, vh);
  // 記録勝負: 相手の今の記録を下に出す
  if (g.kind === 'race' && mgHuman() && MINI.net.op && MINI.net.op.s && (MINI.st === 'play' || MINI.st === 'result')) tape(ctx, '相手  ' + MINI.net.op.s, vw / 2, vh - 22, 10, { center: true, pad: 7 });
  if (MINI.st === 'intro') mgIntro(ctx, vw, vh, g);
  if (MINI.st === 'wait' || MINI.st === 'join') mgWait(ctx, vw, vh, g);
  if (MINI.st === 'result' && MINI.resT > 0.6) mgResult(ctx, vw, vh, g);
}

// せまい画面では「CPUの強さ」を上の行に出して、ボタンを横いっぱいに並べる
function mgDiffH(w) { return (UI.big ? 24 : 17) + (w < 240 ? 15 : 0); }
function mgDiffRow(ctx, x, y, w) {
  const big = UI.big, dh = big ? 24 : 17, narrow = w < 240, dl = narrow ? 0 : 56, dw = Math.floor((w - dl - 8) / 3);
  if (narrow) { txt(ctx, 'CPUの強さ', x, y, 10, COL.inkSoft, true); y += 15; }
  else txt(ctx, 'CPUの強さ', x, y + Math.floor((dh - 12) / 2), 10, COL.inkSoft, true);
  ['やさしい', 'ふつう', 'つよい'].forEach((name, i) => {
    const sel = G.diff === i;
    button(ctx, 'mgDiff' + i, name, x + dl + i * (dw + 4), y, dw, dh, { sel, size: 10, band: sel ? COL.ink : COL.inkSoft });
  });
  return mgDiffH(w);
}

function mgIntro(ctx, vw, vh, g) {
  const big = UI.big, cw = Math.min(300, vw - 16);
  const lines = [].concat(...g.howto.map(l => mgWrap(l, cw - 24, 10)));
  const bh = big ? 28 : 21, nb = g.kind && !MINI.party ? (big ? 26 : 20) : 0;
  const ch = 44 + lines.length * 15 + (g.cpu && !mgHuman() ? mgDiffH(cw - 24) + 8 : 0) + bh + 9 + (nb ? nb * 2 + 14 : 0);
  const x = Math.floor((vw - cw) / 2), y = Math.max(28, Math.floor((vh - ch) / 2));
  card(ctx, x, y, cw, ch, { ruled: 22 });
  txt(ctx, g.name, x + cw / 2, y + 4, 14, COL.ink, true, 'c');
  let yy = y + 30;
  for (const l of lines) { txt(ctx, l, x + 12, yy, 10, COL.ink, false); yy += 15; }
  yy += 4;
  if (MINI.party) txt(ctx, '第 ' + (MINI.party.idx + 1) + ' 戦', x + cw - 10, y + 6, 10, COL.inkSoft, true, 'r');
  if (g.cpu && !mgHuman()) yy += mgDiffRow(ctx, x + 12, yy, cw - 24) + 8;
  if (MINI.party) {
    const n = MINI.net, waitOp = mgHuman() && n.again[0];
    button(ctx, mgHuman() ? 'mgAgain' : 'mgGo', waitOp ? '相手を待っています' : 'はじめる', x + 12, yy, cw - 24, bh, { band: COL.red, disabled: waitOp });
    return;
  }
  button(ctx, 'mgGo', g.kind ? 'ひとりで遊ぶ' : 'はじめる', x + 12, yy, cw - 24, bh, { band: COL.red });
  if (nb) {
    yy += bh + 6;
    const w2 = Math.floor((cw - 30) / 2);
    button(ctx, 'mgNetQ', 'ランダムマッチ', x + 12, yy, cw - 24, nb, { band: '#c9a53f', size: big ? 12 : 10 });
    yy += nb + 4;
    button(ctx, 'mgNetC', '友達とルーム', x + 12, yy, w2, nb, { band: COL.blue, size: big ? 12 : 10 });
    button(ctx, 'mgNetJ', 'コードで参加', x + 18 + w2, yy, w2, nb, { band: COL.inkSoft, size: big ? 12 : 10 });
  }
}

// オンラインの待ち画面とコード入力
function mgWait(ctx, vw, vh, g) {
  const n = MINI.net, big = UI.big, cw = Math.min(260, vw - 16), ch = (big ? 132 : 118) + (MINI.st === 'wait' && n && n.kind === 'create' ? 16 : 0);
  if (!n) return;
  const x = Math.floor((vw - cw) / 2), y = Math.max(28, Math.floor((vh - ch) / 2));
  card(ctx, x, y, cw, ch, { ruled: 22 });
  txt(ctx, g.name, x + cw / 2, y + 4, 14, COL.ink, true, 'c');
  const bw = cw - 24, bh = big ? 24 : 19;
  if (MINI.st === 'join') {
    txt(ctx, n.err || '部屋コードを入力', x + cw / 2, y + 30, 10, n.err ? COL.red : COL.inkSoft, false, 'c');
    const code = (G.title.code + '____').slice(0, 4).split('').join(' ');
    const tp = tape(ctx, code, x + cw / 2, y + 46, 18, { center: true, pad: 10 });
    UI.buttons.push({ id: 'mgCode', x: tp.x, y: tp.y, w: tp.w, h: tp.h });
    button(ctx, 'mgJoinGo', '参加する', x + 12, y + ch - bh - 10, bw, bh, { band: COL.red, disabled: G.title.code.length !== 4 });
    return;
  }
  const dots = '.'.repeat(1 + Math.floor(performance.now() / 400) % 3);
  if (n.kind === 'create') {
    txt(ctx, '部屋コード', x + cw / 2, y + 30, 10, COL.inkSoft, false, 'c');
    tape(ctx, n.code ? n.code.split('').join(' ') : '....', x + cw / 2, y + 46, 18, { center: true, pad: 10 });
    txt(ctx, '友達に伝えてください。待っています' + dots, x + cw / 2, y + 80, 10, COL.ink, false, 'c');
  } else {
    const left = Math.max(0, Math.ceil(20 - (performance.now() - n.since) / 1000));
    txt(ctx, '相手をさがしています' + dots, x + cw / 2, y + 38, 11, COL.ink, true, 'c');
    txt(ctx, n.code ? 'だれも来なければ ' + left + ' 秒後に CPU と対戦' : '接続しています', x + cw / 2, y + 60, 10, COL.inkSoft, false, 'c');
  }
  button(ctx, 'mgBack', 'やめる', x + 12, y + ch - bh - 10, bw, bh, { band: COL.inkSoft });
}

function mgResult(ctx, vw, vh, g) {
  if (!MINI.result) { centerCard(ctx, vw, vh, [['相手の記録を待っています', 12, COL.ink, true]], {}); return; }
  const r = MINI.result, big = UI.big, cw = Math.min(250, vw - 16);
  const ch = 48 + r.lines.length * 15 + (big ? 36 : 28);
  const x = Math.floor((vw - cw) / 2), y = Math.max(28, Math.floor((vh - ch) / 2));
  card(ctx, x, y, cw, ch, { grid: true });
  txt(ctx, r.head, x + cw / 2, y + 7, 18, r.good === false ? COL.inkSoft : COL.red, true, 'c');
  let yy = y + 36;
  for (const l of r.lines) { txt(ctx, l, x + cw / 2, yy, 10, COL.ink, false, 'c'); yy += 15; }
  yy += 4;
  const bw = Math.floor((cw - 30) / 2), bh = big ? 26 : 20;
  if (MINI.party) {
    const w = MINI.party.ready[0] && MINI.party.online && !MINI.party.alone;
    button(ctx, 'mgNext', w ? '相手を待つ' : '次のゲームへ', x + 10, yy, bw, bh, { band: COL.red, size: big ? 12 : 11, disabled: w });
    button(ctx, 'mgQuit', 'やめる', x + 20 + bw, yy, bw, bh, { band: COL.inkSoft, size: big ? 12 : 11 });
    return;
  }
  const n = MINI.net, waitOp = mgHuman() && n.again[0];
  button(ctx, 'mgAgain', waitOp ? '相手を待つ' : 'もう一度', x + 10, yy, bw, bh, { band: COL.red, size: big ? 12 : 11, disabled: (n && n.st === 'gone') || waitOp });
  button(ctx, 'mgMenu', 'えらぶ', x + 20 + bw, yy, bw, bh, { band: COL.inkSoft, size: big ? 12 : 11 });
}

// 試合中の表示: 上の中央に札
// 幅のせまい画面では、左右の札と重ならないよう札の下に出す
function mgHudTag(ctx, vw, s, y) { tape(ctx, s, vw / 2, y || (vw < 300 ? 68 : 8), 10, { center: true, pad: 7 }); }
function mgHudNote(ctx, x, y, label, value, col, dark, alignRight) {
  const w = Math.max(54, txtW(value, 14, true) + 16, txtW(label, 9, true) + 16), h = 34;
  const nx = alignRight ? x - w : x;
  note(ctx, nx, y, w, h, col, dark);
  txt(ctx, label, nx + 6, y + 6, 9, COL.inkSoft, true);
  txt(ctx, value, nx + 6, y + 16, 14, COL.ink, true);
}

// ---------- いろいろ対戦(本編とミニゲームを順番に遊ぶ) ----------
// 本編のあとにミニゲームを3つ、を繰り返す。ミニゲームの順は種から決めるので、2人とも同じ順になる。
function partyOrder(seed) {
  let t = seed >>> 0;
  const rnd = () => { t = (t + 0x6D2B79F5) >>> 0; let r = Math.imul(t ^ t >>> 15, t | 1); r ^= r + Math.imul(r ^ r >>> 7, r | 61); return ((r ^ r >>> 14) >>> 0) / 4294967296; };
  const ids = MINI.games.map((g, i) => i);
  for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  const out = [];
  ids.forEach((id, i) => { if (i % 3 === 0 && i < ids.length - 1 - (ids.length - 1) % 3) out.push('main'); out.push(id); });
  return out;
}
// 連戦を始める。online: 2人部屋で遊ぶ(seat は席)
function partyStart(online, seed, seat) {
  if (seed === undefined) seed = Math.random() * 1e9 | 0;
  MINI.party = { online, seat: seat || 0, order: partyOrder(seed), idx: -1, ready: [false, false], alone: false, seed };
  if (online) MINI.net = { st: 'play', kind: 'party', code: '', since: 0, err: '', wasHuman: true, again: [false, false], snd: [], fx: [], sendT: 0 };
  partyGo();
}
// 待ち画面つきで2人部屋をさがす(kind: quick / create)
function partyFind(kind) {
  G.screen = 'mini'; MINI.cur = null; MINI.st = 'wait';
  MINI.party = { online: false, wait: true, order: [], idx: -1, ready: [false, false] };
  MINI.net = { st: 'wait', kind, code: '', since: performance.now(), err: '' };
  connect(() => send(kind === 'quick' ? { t: 'mgQuick', game: 'party' } : { t: 'mgCreate', game: 'party' }));
}
// 自分は次へ進む準備ができた(2人とも押したら進む)
function partyReady() {
  const P = MINI.party;
  if (!P) return;
  if (G.screen === 'game') send({ t: 'leave' });
  if (!P.online || P.alone) { partyGo(); return; }
  if (P.ready[0]) return;
  P.ready[0] = true; mgSendD({ k: 'nx' });
  if (P.ready[1]) partyGo();
}
function partyGo() {
  const P = MINI.party;
  P.ready = [false, false]; P.idx++;
  const id = P.order[P.idx % P.order.length];
  const online = P.online && !P.alone;
  if (id === 'main') {
    MINI.cur = null; MINI.st = 'menu';
    G.snaps = []; G.offset = null; G.last = null;
    if (!online) connect(() => send({ t: 'solo', diff: G.diff }));
    else if (P.seat === 0) send({ t: 'mgMain', diff: G.diff });
    return;
  }
  if (G.screen === 'game') send({ t: 'leave' });
  G.screen = 'mini';
  const g = MINI.games[id];
  if (online) {
    MINI.seat = P.seat;
    MINI.net.st = 'play';
  } else { MINI.net = null; MINI.seat = 0; }
  mgStart(g);
  MINI.flip = online && P.seat === 1 && g.kind === 'duel' && !g.noFlip;
  mgUseStage(g);
  if (MINI.net) { MINI.net.again = [false, false]; }
}
function partyEnd() {
  if (MINI.net) send({ t: 'mgLeave' });
  if (G.room) send({ t: 'leave' });
  MINI.party = null; MINI.net = null; MINI.cur = null; MINI.seat = 0; MINI.flip = false;
  G.screen = 'title'; G.title.mode = 'menu'; G.room = null;
}

// ---------- 選ぶ画面 ----------
function mgMenu(ctx, vw, vh, now, dt) {
  const st = demoState(now);
  updateFx(dt, st.ents);
  const cam = updateCamera(null, dt);
  drawWorld(ctx, cam, vw, vh, st);
  ctx.drawImage(R.vignette, 0, 0);
  const big = UI.big;
  button(ctx, 'mgBack', 'タイトルへ', 6, 6, big ? 84 : 66, big ? 24 : 18, { band: COL.inkSoft, size: big ? 12 : 10 });
  const list = [MAIN_CARD].concat(MINI.games), n = list.length;
  const cols = vw >= 470 ? 5 : vw >= 280 ? 3 : 2;
  const rows = Math.ceil(n / cols);
  const gap = 6, top = 34;
  const cwid = Math.min(big ? 96 : 86, Math.floor((vw - 12 - gap * (cols - 1)) / cols));
  const chei = Math.min(big ? 80 : 70, Math.floor((vh - top - 8 - gap * (rows - 1)) / rows));
  const x0 = Math.floor((vw - (cwid * cols + gap * (cols - 1))) / 2);
  tape(ctx, 'ゲームをえらぶ', vw / 2, 8, 12, { center: true, pad: 9 });
  list.forEach((g, i) => {
    const id = i ? 'mgG' + (i - 1) : 'mainGame';
    const cx = x0 + (i % cols) * (cwid + gap), cy = top + Math.floor(i / cols) * (chei + gap);
    const hov = UI.hover === id, down = UI.pressed === id, oy = down ? 1 : 0;
    card(ctx, cx, cy + oy, cwid, chei, { off: down ? 1 : 3, fill: hov ? '#f8f4ea' : COL.paper });
    ctx.fillStyle = g.tint || COL.red; ctx.fillRect(cx, cy + oy, cwid - 1, 3);
    const ic = g.icon ? g.icon() : null;
    if (ic) {
      const avail = chei - 22;
      const bob = hov ? Math.round(Math.sin(now / 160)) : 0;
      ctx.save(); ctx.beginPath(); ctx.rect(cx + 1, cy + 4 + oy, cwid - 2, avail); ctx.clip();
      ctx.drawImage(ic.c, Math.round(cx + cwid / 2 - ic.c.width / 2), Math.round(cy + 4 + oy + avail / 2 - ic.c.height / 2) - bob);
      ctx.restore();
    }
    txt(ctx, g.name, cx + cwid / 2, cy + chei - 15 + oy, 10, COL.ink, true, 'c');
    UI.buttons.push({ id, x: cx, y: cy, w: cwid, h: chei });
  });
}

// 本編(船とサメ)のカード
const MAIN_CARD = {
  name: '船とサメ', tint: COL.blue,
  icon() { return mgIcon('main', 84, 52, (put) => { put(SPR.boat(0, 4, 0, 2), -0.9, 0.5, 0); put(SPR.shark(1, 20, 0, 0, 0), 1.0, -0.4, 0); }); },
};

// アイコン: 舞台なしで物体を小さく並べた絵を焼いて保存
function mgIcon(key, w, h, draw) {
  return SPR.get('mgicon|' + key, () => {
    const c = makeCanvas(w, h), g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    const put = (s, x, y, z) => {
      const [ax, ay] = mgScreen(x, y, z || 0);
      if (s.sh) {
        const zz = z || 0, [gx, gy] = mgScreen(x + zz * VKX, y + zz * VKY, 0);
        g.globalAlpha = 0.3;
        g.drawImage(mgTint(s.sh), Math.round(w / 2 + gx) - s.sax, Math.round(h / 2 + gy) - s.say);
        g.globalAlpha = 1;
      }
      g.drawImage(s.c, Math.round(w / 2 + ax) - s.ax, Math.round(h / 2 + ay) - s.ay);
    };
    draw(put, g);
    return { c };
  });
}
function mgTint(sh) {
  if (sh.tinted) return sh.tinted;
  const c = makeCanvas(sh.width, sh.height), g = c.getContext('2d');
  g.drawImage(sh, 0, 0); g.globalCompositeOperation = 'source-in';
  g.fillStyle = 'rgb(' + PAL.shadow.join(',') + ')'; g.fillRect(0, 0, c.width, c.height);
  sh.tinted = c;
  return c;
}

// 難しさに応じた値を選ぶ
function mgLv(a, b, c) { return [a, b, c][G.diff] !== undefined ? [a, b, c][G.diff] : b; }

// ---------- 移動とボタン1つの操作(スマホは左で移動、右でボタン) ----------
const MGPAD = { id: null, ox: 0, oy: 0, kx: 0, ky: 0, bid: null, bq: 0, held: false };
function mgPadReset() { MGPAD.id = null; MGPAD.kx = MGPAD.ky = 0; MGPAD.bid = null; MGPAD.bq = 0; MGPAD.held = false; }
function mgPadDown(x, y, id, noBtn) {
  if (!noBtn && x > G.vw * 0.55) { MGPAD.bid = id; MGPAD.bq++; MGPAD.held = true; return; }
  if (MGPAD.id === null) { MGPAD.id = id; MGPAD.ox = x; MGPAD.oy = y; MGPAD.kx = MGPAD.ky = 0; }
}
function mgPadMove(x, y, id) {
  if (id !== MGPAD.id) return;
  let dx = x - MGPAD.ox, dy = y - MGPAD.oy;
  const l = Math.hypot(dx, dy), max = 16;
  if (l > max * 1.6) { MGPAD.ox += dx / l * (l - max * 1.6); MGPAD.oy += dy / l * (l - max * 1.6); }
  if (l > max) { dx = dx / l * max; dy = dy / l * max; }
  MGPAD.kx = dx; MGPAD.ky = dy;
}
function mgPadUp(id) {
  if (id === MGPAD.id) { MGPAD.id = null; MGPAD.kx = MGPAD.ky = 0; }
  if (id === MGPAD.bid) { MGPAD.bid = null; MGPAD.held = false; }
}
// 画面上の向き(キーかスティック) -> ワールドの向き
function mgPadDir() {
  let sx = 0, sy = 0;
  const k = G.keys;
  if (k.has('KeyA') || k.has('ArrowLeft')) sx -= 1;
  if (k.has('KeyD') || k.has('ArrowRight')) sx += 1;
  if (k.has('KeyW') || k.has('ArrowUp')) sy -= 1;
  if (k.has('KeyS') || k.has('ArrowDown')) sy += 1;
  if (sx || sy) { const l = Math.hypot(sx, sy); sx /= l; sy /= l; }
  // スティックは少し倒せば全速になる(指で細かく加減しなくてよい)
  if (MGPAD.id !== null) { const l = Math.hypot(MGPAD.kx, MGPAD.ky); if (l > 2) { const m = Math.min(1, (l - 2) / 6); sx = MGPAD.kx / l * m; sy = MGPAD.ky / l * m; } }
  const m = Math.min(1, Math.hypot(sx, sy)), l = Math.hypot(sx, sy);
  if (!l) return [0, 0];
  // 画面の向きがそのままゲーム座標の向き(相手側から見るときは逆)
  const f = MINI.flip ? -1 : 1;
  return [sx / l * m * f, sy / l * m * f];
}
function mgPadDraw(ctx, vw, vh, label) {
  if (!G.touch) { txt(ctx, 'WASD / 矢印で移動' + (label ? '   Space: ' + label : ''), 8, vh - 16, 9, '#efe8d8', true); return; }
  const k = (window.devicePixelRatio || 1) / G.scale, r = Math.max(24, Math.round(34 * k));
  const cx = MGPAD.id !== null ? MGPAD.ox : 40, cy = MGPAD.id !== null ? MGPAD.oy : vh - 40;
  if (MGPAD.id === null) ctx.globalAlpha = 0.45;
  drawStick(ctx, cx, cy, MGPAD.kx, MGPAD.ky);
  ctx.globalAlpha = 1;
  if (!label) return;
  skillButton(ctx, 'mgPadBtn', vw - r - 12, vh - r - 12, r, label, '', 0, 1, MGPAD.held, 0, false);
  UI.buttons.pop();   // ボタンの判定は画面右側全体で取る
}

// モデル定義を k 倍に拡大する(形の式はそのまま使う)
function mgScale(def, k) {
  const f = def.fill;
  def.size = def.size.map(v => v * k);
  if (def.origin) def.origin = def.origin.map(v => v * k);
  def.fill = (x, y, z) => f(x / k, y / k, z / k);
  return def;
}

// 幅に収まるように1文字ずつ折り返す(句読点は行頭に来ないようにする)
function mgWrap(str, w, size) {
  const out = [];
  let cur = '';
  for (const ch of str) {
    if (cur && txtW(cur + ch, size) > w && !'、。)'.includes(ch)) { out.push(cur); cur = ''; }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}
