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
  result: null,
  t: 0,
  layer: null,
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
function mgSpr(key, make) { return SPR.get('mg|' + key, make); }
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

// ---------- 舞台の焼き込み ----------
// def: { cx, cy (舞台の中心), items: [{ x0,y0,x1,y1, z, h, r, top(x,y,px,py)->rgb, side:[+y面, +x面, 下端], edge }] }
function mgBakeStage(def) {
  const items = def.items || [];
  const cx = def.cx, cy = def.cy;
  const scx = toSX(cx, cy), scy = toSY(cx, cy, 0);
  const left = Math.floor(scx - (def.halfW || 460)), top = Math.floor(scy - (def.halfH || 420));
  const w = (def.halfW || 460) * 2, h = (def.halfH || 420) * 2;
  const c = makeCanvas(w, h), g = c.getContext('2d'), img = g.createImageData(w, h), d = img.data;
  const lampX = cx - 9, lampY = cy - 11;
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
      if (inIt(it, x - KX * dz, y - KY * dz)) { s = 2; break; }
      if (inIt(it, x - KX * dz * 1.5, y - KY * dz * 1.5) && (px + py) % 2 === 0) s = Math.max(s, 1);
    }
    return s ? mix(col, PAL.shadow, 0.42) : col;
  };
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const sx = px + left + 0.5, sy = py + top + 0.5, u = sx / ISO.X;
    let best = null, bz = -1, bside = 0, bx = 0, by = 0;
    for (const it of items) {
      const zt = it.z + it.h;
      if (zt <= bz) continue;
      const t = (sy + zt * ISO.Z) / ISO.Y, x = (t + u) / 2, y = (t - u) / 2;
      if (inIt(it, x, y)) { best = it; bz = zt; bside = 0; bx = x; by = y; continue; }
      const kmax = Math.round(it.h * ISO.Z);
      for (let k = 1; k <= kmax; k++) {
        const zz = zt - k / ISO.Z;
        if (zz <= bz) break;
        const t2 = (sy - k + zt * ISO.Z) / ISO.Y, x2 = (t2 + u) / 2, y2 = (t2 - u) / 2;
        if (inIt(it, x2, y2)) {
          best = it; bz = zz; bx = x2; by = y2;
          bside = k === kmax ? 3 : ((it.x1 - x2) < (it.y1 - y2) ? 2 : 1);
          break;
        }
      }
    }
    const i = (py * w + px) * 4;
    let col;
    if (best) {
      if (bside) col = best.side[bside - 1];
      else {
        col = best.top(bx, by, px, py);
        if (best.edge && Math.min(best.x1 - bx, best.y1 - by) < 0.06) col = best.edge;
        col = shade(col, bx, by, bz, best, px, py);
      }
    } else {
      const t = sy / ISO.Y, x = (t + u) / 2, y = (t - u) / 2;
      col = shade(mgDesk(x, y, px, py, lampX, lampY), x, y, 0, null, px, py);
    }
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return { c, x: left, y: top, cx, cy, fill: 'rgb(' + PAL.desk[4].join(',') + ')' };
}

// 机の板目(本編の机と同じ調子)
function mgDesk(x, y, px, py, lx, ly) {
  const plank = Math.floor((x + 40) / 2.6);
  const seed = hash2(plank, 7) * 50;
  const gr = (x + 0.28 * Math.sin(y * 0.33 + seed) + 0.18 * vnoise(x * 1.4, y * 0.25 + seed)) * 4.2;
  const broad = vnoise(x * 0.45 + seed, y * 0.07);
  const light = Math.max(0, Math.min(1, 1.15 - Math.hypot(x - lx, y - ly) / 30));
  let tone = 1 + (broad > 0.62 ? -1 : broad < 0.33 ? 1 : 0) + (hash2(plank, 3) > 0.5 ? 1 : 0);
  tone += (1 - light) * 2.2 + bayer(px, py) - 0.5;
  if (gr - Math.floor(gr) < 0.11) tone += 1.2;
  const s = (x + 40) / 2.6;
  if (Math.floor(s) !== Math.floor(s + RX / 2.6) || Math.floor(s) !== Math.floor(s + DY / 2.6)) return PAL.seam;
  return PAL.desk[Math.max(0, Math.min(5, Math.round(tone)))];
}

// 面の塗り分けを作る補助: 3段の色をディザで混ぜる
function mgTone(ramp, L, px, py) { return ramp[Math.max(0, Math.min(ramp.length - 1, Math.round(L + bayer(px, py) - 0.5)))]; }
// 等高線の交差で1画素の線(本編マットと同じ方法)
function mgCross(f, x, y, s) {
  const a = Math.floor(f(x, y) / s);
  return a !== Math.floor(f(x + RX, y - RX) / s) || a !== Math.floor(f(x + DY, y + DY) / s);
}

// ---------- 描画 ----------
function mgP(x, y, z) { return [Math.round(toSX(x, y) + MINI.cam.ox), Math.round(toSY(x, y, z) + MINI.cam.oy)]; }
function mgToWorld(sx, sy, z) {
  const u = (sx - MINI.cam.ox) / ISO.X, t = (sy - MINI.cam.oy + (z || 0) * ISO.Z) / ISO.Y;
  return [(t + u) / 2, (t - u) / 2];
}
function mgCamera(vw, vh, cx, cy, cz, dy) {
  MINI.cam.ox = Math.round(vw / 2 - toSX(cx, cy));
  MINI.cam.oy = Math.round(vh / 2 - toSY(cx, cy, cz || 0) + (dy || 0));
}

// objs: { s: スプライト, x, y, z, k: 並び順, g: 影の落ちる高さ, a: 透明度, ns: 影なし, f(ctx): 自前で描く }
function mgDraw(ctx, vw, vh, objs, after) {
  const st = MINI.stage;
  ctx.fillStyle = st.fill; ctx.fillRect(0, 0, vw, vh);
  ctx.drawImage(st.c, st.x + MINI.cam.ox, st.y + MINI.cam.oy);
  if (!MINI.layer || MINI.layer.width !== vw || MINI.layer.height !== vh) MINI.layer = makeCanvas(vw, vh);
  const sl = MINI.layer, sc = sl.getContext('2d');
  sc.globalCompositeOperation = 'source-over';
  sc.clearRect(0, 0, vw, vh);
  for (const o of objs) {
    if (o.ns || !o.s || !o.s.sh || o.a === 0) continue;
    const g = o.g || 0, dz = Math.max(0, (o.z || 0) - g);
    const [sx, sy] = mgP(o.x + dz * KX, o.y + dz * KY, g);
    sc.drawImage(o.s.sh, sx - o.s.sax, sy - o.s.say);
  }
  if (MINI.shadowExtra) MINI.shadowExtra(sc);
  sc.globalCompositeOperation = 'source-in';
  sc.fillStyle = 'rgb(' + PAL.shadow.join(',') + ')';
  sc.fillRect(0, 0, vw, vh);
  ctx.globalAlpha = 0.3; ctx.drawImage(sl, 0, 0); ctx.globalAlpha = 1;
  objs.sort((a, b) => (a.k !== undefined ? a.k : a.x + a.y + (a.z || 0) * 0.9) - (b.k !== undefined ? b.k : b.x + b.y + (b.z || 0) * 0.9));
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

// ---------- 画面の流れ ----------
function mgOpen() { G.screen = 'mini'; MINI.st = 'menu'; MINI.cur = null; }
function mgStart(g) {
  MINI.cur = g; MINI.st = 'intro'; MINI.result = null; MGFX.length = 0;
  MINI.shadowExtra = null;
  if (!g.stage) g.stage = mgBakeStage(g.stageDef());
  MINI.stage = g.stage;
  g.reset();
}
function mgPlay() { MINI.st = 'play'; MINI.t = 0; MGFX.length = 0; MINI.cur.reset(); if (MINI.cur.begin) MINI.cur.begin(); }
// res: { head, lines: [..], good: bool }
function mgFinish(res) {
  if (MINI.st !== 'play') return;
  MINI.st = 'result'; MINI.result = res; MINI.resT = 0;
  mgSnd(res.good === false ? 'lose' : 'win');
}

function mgButton(id) {
  if (id === 'mgBack') { if (MINI.st === 'menu') { G.screen = 'title'; G.title.mode = 'menu'; } else { MINI.st = 'menu'; MINI.cur = null; } return true; }
  if (id === 'mgGo' || id === 'mgAgain') { mgPlay(); return true; }
  if (id === 'mgMenu') { MINI.st = 'menu'; MINI.cur = null; return true; }
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
  if (MINI.st === 'menu' || !MINI.cur) { mgMenu(ctx, vw, vh, now, dt); return; }
  const g = MINI.cur;
  if (MINI.st === 'play') { MINI.t += dt; g.update(dt); }
  else if (MINI.st === 'result') { MINI.resT += dt; if (g.idle) g.idle(dt); }
  else if (g.idle) g.idle(dt);
  mgFxStep(dt, g.ground);
  g.draw(ctx, vw, vh);
  const big = UI.big;
  button(ctx, 'mgBack', 'もどる', 6, 6, big ? 64 : 50, big ? 24 : 18, { band: COL.inkSoft, size: big ? 12 : 10 });
  if (MINI.st === 'play' && g.hud) g.hud(ctx, vw, vh);
  if (MINI.st === 'intro') mgIntro(ctx, vw, vh, g);
  if (MINI.st === 'result' && MINI.resT > 0.6) mgResult(ctx, vw, vh, g);
}

function mgDiffRow(ctx, x, y, w) {
  const big = UI.big, dh = big ? 24 : 17, dl = 56, dw = Math.floor((w - dl - 8) / 3);
  txt(ctx, 'CPUの強さ', x, y + Math.floor((dh - 12) / 2), 10, COL.inkSoft, true);
  ['やさしい', 'ふつう', 'つよい'].forEach((name, i) => {
    const sel = G.diff === i;
    button(ctx, 'mgDiff' + i, name, x + dl + i * (dw + 4), y, dw, dh, { sel, size: 10, band: sel ? COL.ink : COL.inkSoft });
  });
  return dh;
}

function mgIntro(ctx, vw, vh, g) {
  const big = UI.big, cw = Math.min(300, vw - 16);
  const lines = [].concat(...g.howto.map(l => mgWrap(l, cw - 24, 10)));
  const ch = 44 + lines.length * 15 + (g.cpu ? (big ? 32 : 25) : 0) + (big ? 38 : 30);
  const x = Math.floor((vw - cw) / 2), y = Math.max(28, Math.floor((vh - ch) / 2));
  card(ctx, x, y, cw, ch, { ruled: 22 });
  txt(ctx, g.name, x + cw / 2, y + 4, 14, COL.ink, true, 'c');
  let yy = y + 30;
  for (const l of lines) { txt(ctx, l, x + 12, yy, 10, COL.ink, false); yy += 15; }
  yy += 4;
  if (g.cpu) yy += mgDiffRow(ctx, x + 12, yy, cw - 24) + 8;
  button(ctx, 'mgGo', 'はじめる', x + 12, yy, cw - 24, big ? 28 : 21, { band: COL.red });
}

function mgResult(ctx, vw, vh, g) {
  const r = MINI.result, big = UI.big, cw = Math.min(250, vw - 16);
  const ch = 48 + r.lines.length * 15 + (big ? 36 : 28);
  const x = Math.floor((vw - cw) / 2), y = Math.max(28, Math.floor((vh - ch) / 2));
  card(ctx, x, y, cw, ch, { grid: true });
  txt(ctx, r.head, x + cw / 2, y + 7, 18, r.good === false ? COL.inkSoft : COL.red, true, 'c');
  let yy = y + 36;
  for (const l of r.lines) { txt(ctx, l, x + cw / 2, yy, 10, COL.ink, false, 'c'); yy += 15; }
  yy += 4;
  const bw = Math.floor((cw - 30) / 2), bh = big ? 26 : 20;
  button(ctx, 'mgAgain', 'もう一度', x + 10, yy, bw, bh, { band: COL.red, size: big ? 12 : 11 });
  button(ctx, 'mgMenu', 'えらぶ', x + 20 + bw, yy, bw, bh, { band: COL.inkSoft, size: big ? 12 : 11 });
}

// 試合中の表示: 上の中央に札
function mgHudTag(ctx, vw, s, y) { tape(ctx, s, vw / 2, y || 8, 10, { center: true, pad: 7 }); }
function mgHudNote(ctx, x, y, label, value, col, dark, alignRight) {
  const w = Math.max(54, txtW(value, 14, true) + 16, txtW(label, 9, true) + 16), h = 34;
  const nx = alignRight ? x - w : x;
  note(ctx, nx, y, w, h, col, dark);
  txt(ctx, label, nx + 6, y + 6, 9, COL.inkSoft, true);
  txt(ctx, value, nx + 6, y + 16, 14, COL.ink, true);
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
  const n = MINI.games.length;
  const cols = vw >= 470 ? 5 : vw >= 280 ? 3 : 2;
  const rows = Math.ceil(n / cols);
  const gap = 6, top = 34;
  const cwid = Math.min(big ? 96 : 86, Math.floor((vw - 12 - gap * (cols - 1)) / cols));
  const chei = Math.min(big ? 80 : 70, Math.floor((vh - top - 8 - gap * (rows - 1)) / rows));
  const x0 = Math.floor((vw - (cwid * cols + gap * (cols - 1))) / 2);
  tape(ctx, 'ミニゲーム', vw / 2, 8, 12, { center: true, pad: 9 });
  MINI.games.forEach((g, i) => {
    const cx = x0 + (i % cols) * (cwid + gap), cy = top + Math.floor(i / cols) * (chei + gap);
    const hov = UI.hover === 'mgG' + i, down = UI.pressed === 'mgG' + i, oy = down ? 1 : 0;
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
    UI.buttons.push({ id: 'mgG' + i, x: cx, y: cy, w: cwid, h: chei });
  });
}

// アイコン: 舞台なしで物体を小さく並べた絵を焼いて保存
function mgIcon(key, w, h, draw) {
  return SPR.get('mgicon|' + key, () => {
    const c = makeCanvas(w, h), g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    const put = (s, x, y, z) => {
      const sx = Math.round(w / 2 + toSX(x, y)), sy = Math.round(h / 2 + toSY(x, y, z || 0));
      if (s.sh) {
        const zz = z || 0, gx = x + zz * KX, gy = y + zz * KY;
        g.globalAlpha = 0.3;
        g.drawImage(mgTint(s.sh), Math.round(w / 2 + toSX(gx, gy)) - s.sax, Math.round(h / 2 + toSY(gx, gy, 0)) - s.say);
        g.globalAlpha = 1;
      }
      g.drawImage(s.c, sx - s.ax, sy - s.ay);
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
  if (MGPAD.id !== null) { sx = MGPAD.kx / 16; sy = MGPAD.ky / 16; }
  return screenToWorldDir(sx, sy);
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
