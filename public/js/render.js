// アイソメ描画: 机とマットの焼き込み、物体の並び替え、影、航跡
'use strict';

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];
function hash2(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

const R = {
  bg: null, bgX: 0, bgY: 0,
  statics: null,
  shadowLayer: null,
  vignette: null,
  fx: { parts: [], anim: new Map() },
};

const MAT_RIM = 0.9, MAT_THICK = 0.34;
const PAL = {
  mat: ['#a3d0d6', '#94c6cd', '#88bcc4', '#7db2bb', '#72a7b1'].map(hexRGB),
  fine: hexRGB('#bfdfe2'),
  print: hexRGB('#e6f1ee'),
  printDim: hexRGB('#cfe5e5'),
  lane: hexRGB('#4f8e9e'),
  laneDim: hexRGB('#6a9fac'),
  sideL: hexRGB('#6a9fab'), sideR: hexRGB('#57899a'), sideD: hexRGB('#4a7888'), edge: hexRGB('#b4d9de'),
  desk: ['#c8945f', '#b88553', '#a67748', '#93683e', '#7f5934', '#6b4b2c'].map(hexRGB),
  seam: hexRGB('#5a3e26'),
  shadow: [34, 46, 70],
};

const W_ = CONFIG.MAP.W, H_ = CONFIG.MAP.H;
const RX = 1 / (2 * ISO.X), DY = 1 / (2 * ISO.Y);   // 隣の画素へのワールド差分
const toSX = (x, y) => (x - y) * ISO.X;
const toSY = (x, y, z) => (x + y) * ISO.Y - (z || 0) * ISO.Z;

// ---------- 机とマットを1枚に焼き込む ----------
function bakeBackground() {
  const Rr = MAT_RIM, T = CONFIG.TERRAIN;
  const left = Math.floor(toSX(0, H_ + Rr)) - 380, right = Math.ceil(toSX(W_ + Rr, -Rr)) + 380;
  const top = Math.floor(toSY(-Rr, -Rr)) - 330, bottom = Math.ceil(toSY(W_ + Rr, H_ + Rr)) + 330;
  const w = right - left, h = bottom - top;
  const c = makeCanvas(w, h), cx = c.getContext('2d'), img = cx.createImageData(w, h), d = img.data;
  const thickPx = Math.round(MAT_THICK * ISO.Z);

  // 印刷文字(積み場・港)をワールド座標で貼るための原画
  const labelPile = textSprite('積み場', 24, '#000000', true), labelPort = textSprite('港', 24, '#000000', true);
  const lpData = labelPile.c.getContext('2d').getImageData(0, 0, labelPile.w, labelPile.h).data;
  const lqData = labelPort.c.getContext('2d').getImageData(0, 0, labelPort.w, labelPort.h).data;
  const sampleLabel = (data, lw, lh, u, v) => {
    const x = Math.floor(u * lw), y = Math.floor(v * lh);
    if (x < 0 || y < 0 || x >= lw || y >= lh) return false;
    return data[(y * lw + x) * 4 + 3] > 0;
  };

  const inMat = (x, y) => {
    if (x < -Rr || y < -Rr || x > W_ + Rr || y > H_ + Rr) return false;
    // 角を丸く
    const cr = 0.6;
    const cx_ = Math.max(-Rr + cr - x, x - (W_ + Rr - cr), 0), cy_ = Math.max(-Rr + cr - y, y - (H_ + Rr - cr), 0);
    return cx_ * cx_ + cy_ * cy_ <= cr * cr;
  };

  // 等高線の交差で1画素幅の線を引く(アイソメの2:1の階段線になる)
  const cross = (f, x, y, s) => {
    const a = Math.floor(f(x, y) / s);
    return a !== Math.floor(f(x + RX, y - RX) / s) || a !== Math.floor(f(x + DY, y + DY) / s);
  };
  const fx = (x) => x, fy = (x, y) => y;
  const vx = T.vortex;
  const fCirc = (x, y) => Math.hypot(x - vx.x, y - vx.y);
  const fans = T.fans;

  const put = (i, rgb) => { d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = 255; };
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t | 0, a[1] + (b[1] - a[1]) * t | 0, a[2] + (b[2] - a[2]) * t | 0];

  const digitAt = (str, u, v, cell) => {
    // u: 文字列の中の横位置, v: 縦位置(0..1), cell: 1文字の幅(ワールド)
    const ci = Math.floor(u / cell);
    if (ci < 0 || ci >= str.length) return false;
    const g = DIGITS3x5[str[ci]];
    if (!g) return false;
    const gx = Math.floor((u - ci * cell) / cell * 4), gy = Math.floor(v * 5);
    if (gx > 2 || gy < 0 || gy > 4) return false;
    return g[gy * 3 + gx] === '1';
  };

  const pileZ = { x0: 0, y0: H_ - T.zone, x1: T.zone, y1: H_ };
  const portZ = { x0: W_ - T.zone, y0: 0, x1: W_, y1: T.zone };
  const inZ = (z, x, y) => x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1;
  const fZone = (z) => (x, y) => Math.min(Math.abs(x - (z === pileZ ? z.x1 : z.x0)), Math.abs(y - (z === pileZ ? z.y0 : z.y1)));

  // 机の板目
  const deskColor = (x, y, px, py) => {
    const plank = Math.floor((x + 40) / 2.6);
    const seed = hash2(plank, 7) * 50;
    const g = (x + 0.28 * Math.sin(y * 0.33 + seed) + 0.18 * vnoise(x * 1.4, y * 0.25 + seed)) * 4.2;
    const broad = vnoise(x * 0.45 + seed, y * 0.07);
    const lampD = Math.hypot(x + 7, y + 9);
    const light = Math.max(0, Math.min(1, 1.15 - lampD / 34));
    let tone = 1 + (broad > 0.62 ? -1 : broad < 0.33 ? 1 : 0) + (hash2(plank, 3) > 0.5 ? 1 : 0);
    tone += (1 - light) * 2.2 + bayer(px, py) - 0.5;
    const gl = g - Math.floor(g);
    if (gl < 0.11) tone += 1.2;
    tone = Math.round(tone);
    // 板の継ぎ目
    const sx = (x + 40) / 2.6;
    if (Math.floor(sx) !== Math.floor(sx + RX / 2.6) || Math.floor(sx) !== Math.floor(sx + DY / 2.6)) return PAL.seam;
    return PAL.desk[Math.max(0, Math.min(5, tone))];
  };

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const i = (py * w + px) * 4;
      const sx = px + left + 0.5, sy = py + top + 0.5;
      const u = sx / ISO.X, t = sy / ISO.Y;
      const x = (t + u) / 2, y = (t - u) / 2;
      if (inMat(x, y)) {
        put(i, matColor(x, y, px, py));
        continue;
      }
      // マットの厚み(手前の2面)
      let side = 0;
      for (let k = 1; k <= thickPx; k++) {
        const t2 = (sy - k) / ISO.Y, x2 = (t2 + u) / 2, y2 = (t2 - u) / 2;
        if (inMat(x2, y2)) { side = (W_ + Rr - x2) < (H_ + Rr - y2) ? (k === thickPx ? 3 : 2) : (k === thickPx ? 3 : 1); break; }
      }
      if (side) { put(i, side === 1 ? PAL.sideL : side === 2 ? PAL.sideR : PAL.sideD); continue; }
      // 机
      const td = (sy - MAT_THICK * ISO.Z) / ISO.Y, xd = (td + u) / 2, yd = (td - u) / 2;
      let col = deskColor(xd, yd, px, py);
      // マットの落ち影
      const kx = -LIGHT[0] / LIGHT[2], ky = -LIGHT[1] / LIGHT[2];
      if (inMat(xd - kx * MAT_THICK, yd - ky * MAT_THICK)) col = mix(col, PAL.shadow, 0.42);
      else if (inMat(xd - kx * MAT_THICK * 2.2, yd - ky * MAT_THICK * 2.2) && (px + py) % 2 === 0) col = mix(col, PAL.shadow, 0.42);
      put(i, col);
    }
  }

  function matColor(x, y, px, py) {
    const inPlay = x >= 0 && y >= 0 && x <= W_ && y <= H_;
    // 光源に近い側(左上奥)が少し明るい
    let L = 1.15 + (x / W_) * 1.3 + (y / H_) * 0.7 + (vnoise(x * 0.6, y * 0.6) - 0.5) * 0.6;
    if (inPlay) {
      const k = T.laneEvery;
      const ld = Math.min(Math.abs(x - Math.round(x / k) * k), Math.abs(y - Math.round(y / k) * k));
      if (ld < T.laneHalfWidth && (px + py) % 2 === 0) L += 1;
      if (inZ(pileZ, x, y) || inZ(portZ, x, y)) L += 0.55;
    }
    let tone = Math.round(L + bayer(px, py) - 0.5);
    // ざらつき
    const gr = hash2(px * 3 + 11, py * 5 + 7);
    if (gr < 0.05) tone -= 1; else if (gr > 0.96) tone += 1;
    let col = PAL.mat[Math.max(0, Math.min(4, tone))];
    const worn = vnoise(x * 2.1 + 3, y * 2.1) < 0.2 || hash2(px, py) < 0.06;   // 印刷のかすれ

    if (inPlay) {
      if (!worn && cross(fx, x, y, T.gridEvery) | cross(fy, x, y, T.gridEvery)) col = PAL.fine;
      // 航路(太い濃い線)
      const k = T.laneEvery;
            const onL = (Math.abs(x - Math.round(x / k) * k) < 0.07) || (Math.abs(y - Math.round(y / k) * k) < 0.07);
      if (onL && !(hash2(px + 5, py) < 0.08)) col = worn ? PAL.laneDim : PAL.lane;
      // 扇形の角度目盛り
      for (const f of fans) {
        const dx = x - f.x, dy = y - f.y, r = Math.hypot(dx, dy);
        if (r > f.r + 0.05) continue;
        const ang = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
        const fr = (xx, yy) => Math.hypot(xx - f.x, yy - f.y);
        if (cross(fr, x, y, f.r) || (r > f.r - 1.2 && cross(fr, x, y, f.r - 1))) col = worn ? PAL.laneDim : PAL.lane;
        const fa = (xx, yy) => (Math.atan2(yy - f.y, xx - f.x) * 180 / Math.PI + 360) % 360;
        if (r > 1.5 && r < f.r && cross(fa, x, y, 15)) col = worn ? PAL.laneDim : PAL.lane;
        else if (r > f.r - 0.45 && r < f.r && cross(fa, x, y, 5)) col = PAL.lane;
      }
      // 渦(同心円)
      const rc = fCirc(x, y);
      if (rc < vx.r + 0.2 && !worn) {
        if (cross(fCirc, x, y, 1.5)) col = PAL.print;
        if (rc < 0.6 && (cross(fx, x, y, 100) || cross(fy, x, y, 100))) col = PAL.print;
        const kk = (xx, yy) => xx - yy;
        if (rc < 0.55 && Math.abs(x - vx.x - (y - vx.y)) < 0.05) col = PAL.print;
      }
      // 積み場と港の枠と目盛り
      for (const z of [pileZ, portZ]) {
        if (!inZ(z, x, y)) continue;
        const ex = z === pileZ ? z.x1 : z.x0, ey = z === pileZ ? z.y0 : z.y1;
        const dEx = Math.abs(x - ex), dEy = Math.abs(y - ey);
        if (dEx < 0.07 || dEy < 0.07) col = PAL.lane;
        else {
          // 枠に沿った定規の目盛り
          if (dEx < 0.5 && cross(fy, x, y, 0.25) && dEx < (Math.round(y / 0.25) % 4 === 0 ? 0.45 : 0.25)) col = PAL.print;
          if (dEy < 0.5 && cross(fx, x, y, 0.25) && dEy < (Math.round(x / 0.25) % 4 === 0 ? 0.45 : 0.25)) col = PAL.print;
        }
      }
      // 文字
      if (!worn) {
        if (inZ(pileZ, x, y)) {
          const uu = (x - 0.25) / 3.6, vv = (y - (H_ - 3.25)) / 1.0;
          if (sampleLabel(lpData, labelPile.w, labelPile.h, uu, vv)) col = PAL.print;
        }
        if (inZ(portZ, x, y)) {
          const uu = (x - (W_ - 3.0)) / 1.3, vv = (y - 2.85) / 1.1;
          if (sampleLabel(lqData, labelPort.w, labelPort.h, uu, vv)) col = PAL.print;
        }
      }
    } else {
      // 縁の定規帯
      const edgeD = Math.max(-x, -y, x - W_, y - H_);
      const along = (x < 0 || x > W_) ? y : x;
      const len = Math.round(along / 0.5) % 10 === 0 ? 0.55 : Math.round(along / 0.5) % 2 === 0 ? 0.36 : 0.22;
      const fa = (xx, yy) => ((xx < 0 || xx > W_) ? yy : xx);
      const inCorner = (x < 0 || x > W_) && (y < 0 || y > H_);
      if (!inCorner && edgeD < len && along > 0.05 && cross(fa, x, y, 0.5)) col = PAL.print;
      if (!inCorner && edgeD < 0.06) col = PAL.print;
      // 数字(2単位ごと)
      if (!inCorner && edgeD > 0.42 && edgeD < 0.78) {
        const n = Math.round(along / 2) * 2, s = String(n), cell = 0.2;
        const u0 = along - (n - s.length * cell / 2);
        const v = (edgeD - 0.42) / 0.36;
        if (digitAt(s, u0, (x < 0 || y < 0) ? 1 - v : v, cell) && !worn) col = PAL.printDim;
      }
    }
    // 手前の縁の切り口
    const nearFront = Math.min(W_ + Rr - x, H_ + Rr - y);
    if (nearFront < 0.07) col = PAL.edge;
    return col;
  }

  cx.putImageData(img, 0, 0);
  R.bg = c; R.bgX = left; R.bgY = top;
  R.bgFill = 'rgb(' + PAL.desk[4].join(',') + ')';
}

function bakeVignette(w, h) {
  const c = makeCanvas(w, h), cx = c.getContext('2d'), img = cx.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (x - w / 2) / (w / 2), dy = (y - h / 2) / (h / 2);
    const r = Math.sqrt(dx * dx * 0.7 + dy * dy * 0.7);
    const t = (r - 0.78) / 0.35;
    if (t <= 0) continue;
    const lvl = Math.min(2, t * 2 + bayer(x, y) - 0.5);
    if (lvl >= 1) { const i = (y * w + x) * 4; d[i] = 20; d[i + 1] = 24; d[i + 2] = 34; d[i + 3] = lvl >= 2 ? 46 : 24; }
  }
  cx.putImageData(img, 0, 0);
  R.vignette = c;
}

function renderInit() {
  bakeBackground();
  R.statics = bakeStatics();
}

// ---------- 補助 ----------
function pxLine(ctx, x0, y0, x1, y1, col) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  ctx.fillStyle = col;
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let n = 0; n < 2000; n++) {
    ctx.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

function blockSlot(slot) {
  return slot === 0 ? [0.32, -0.2, 0] : slot === 1 ? [0.32, 0.2, 0] : [0.32, 0, 0.39];
}
function trayCell(slot) {
  const T = CONFIG.TRAY, i = slot % T.cols, j = Math.floor(slot / T.cols) % T.rows, layer = Math.floor(slot / (T.cols * T.rows));
  return [T.x0 + (i + 0.5) * (T.x1 - T.x0) / T.cols, T.y0 + (j + 0.5) * (T.y1 - T.y0) / T.rows, 0.05 + layer * 0.4];
}

// ---------- 航跡・しぶき ----------
function spawnPart(x, y, z, vx, vy, vz, life, kind) {
  const P = R.fx.parts;
  if (P.length > 600) P.shift();
  P.push({ x, y, z, vx, vy, vz, life, max: life, kind });
}

function updateFx(dt, ents) {
  const A = R.fx.anim;
  for (const e of ents) {
    let a = A.get(e.i);
    if (!a) { a = { t: Math.random() * 10, wake: 0, lx: e.x, ly: e.y }; A.set(e.i, a); }
    const sp = Math.hypot(e.x - a.lx, e.y - a.ly) / Math.max(dt, 1e-3);
    a.speed = a.speed === undefined ? sp : a.speed + (sp - a.speed) * Math.min(1, dt * 10);
    a.lx = e.x; a.ly = e.y;
    a.t += dt * (0.6 + Math.min(a.speed, 5) * 0.5);
    a.wake -= dt;
    const moving = a.speed > 0.6;
    if (moving && a.wake <= 0) {
      a.wake = e.f & 8 ? 0.02 : 0.06;
      const c = Math.cos(e.d), s = Math.sin(e.d), back = e.ro === 'b' ? 0.85 : 1.0;
      for (const side of [-1, 1]) {
        const ox = -c * back - s * side * 0.22, oy = -s * back + c * side * 0.22;
        if (Math.random() < 0.8) spawnPart(e.x + ox, e.y + oy, 0, -s * side * 0.25, c * side * 0.25, 0, 0.45 + Math.random() * 0.35, 'wake');
      }
      if (e.ro === 'b' && (e.f & 1)) {
        for (let k = 0; k < 3; k++) spawnPart(e.x - c * 0.95, e.y - s * 0.95, 0.1, -c * 1.5 + (Math.random() - 0.5) * 1.6, -s * 1.5 + (Math.random() - 0.5) * 1.6, 2 + Math.random() * 2, 0.35, 'spray');
      }
    }
  }
  const P = R.fx.parts;
  for (let k = P.length - 1; k >= 0; k--) {
    const p = P[k];
    p.life -= dt;
    if (p.life <= 0) { P.splice(k, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= 0.92; p.vy *= 0.92;
    if (p.kind === 'spray') { p.z += p.vz * dt; p.vz -= 14 * dt; if (p.z < 0) { p.z = 0; p.vz = 0; p.kind = 'wake'; } }
  }
}

function splash(x, y, n) {
  for (let k = 0; k < n; k++) {
    const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 2;
    spawnPart(x, y, 0.2, Math.cos(a) * s, Math.sin(a) * s, 2 + Math.random() * 3, 0.5, 'spray');
  }
}

// ---------- ワールド描画 ----------
// S: { ents, blocks, tm, me, myTeam }
function drawWorld(ctx, cam, vw, vh, S) {
  const ox = -cam.x, oy = -cam.y;
  ctx.fillStyle = R.bgFill;
  ctx.fillRect(0, 0, vw, vh);
  ctx.drawImage(R.bg, Math.round(R.bgX + ox), Math.round(R.bgY + oy));

  const P = (x, y, z) => [Math.round(toSX(x, y) + ox), Math.round(toSY(x, y, z) + oy)];

  // 影の層
  if (!R.shadowLayer || R.shadowLayer.width !== vw || R.shadowLayer.height !== vh) R.shadowLayer = makeCanvas(vw, vh);
  const sl = R.shadowLayer, sc = sl.getContext('2d');
  sc.globalCompositeOperation = 'source-over';
  sc.clearRect(0, 0, vw, vh);
  const shadow = (spr, x, y, z) => {
    if (!spr || !spr.sh) return;
    const kx = -LIGHT[0] / LIGHT[2], ky = -LIGHT[1] / LIGHT[2];
    const [sx, sy] = P(x + (z || 0) * kx, y + (z || 0) * ky, 0);
    sc.drawImage(spr.sh, sx - spr.sax, sy - spr.say);
  };
  for (const s of R.statics.shadows) { const [sx, sy] = P(s.x, s.y, 0); sc.drawImage(s.c, sx - s.ax, sy - s.ay); }

  const list = [];
  for (const p of R.statics.pieces) list.push({ k: p.key, f: () => { const [sx, sy] = P(p.x, p.y, 0); ctx.drawImage(p.c, sx - p.ax, sy - p.ay); } });

  const entById = new Map();
  for (const e of S.ents) entById.set(e.i, e);
  const anim = R.fx.anim;

  // 資材
  for (const b of S.blocks) {
    const [st, bx, by, own, t0, fx, fy, col, layer] = b;
    const spr = SPR.block(col);
    let x = bx, y = by, z = st === 1 ? 0 : (layer || 0) * 0.4, key;
    if (st === 1) {
      const e = entById.get(own);
      if (!e) continue;
      const sl_ = blockSlot(layer || 0);
      const c = Math.cos(e.d), s = Math.sin(e.d);
      const sink = Math.min(3, e.load) * 0.1;
      let tx = e.x + c * sl_[0] - s * sl_[1], ty = e.y + s * sl_[0] + c * sl_[1], tz = 0.42 - sink + sl_[2];
      const u = Math.min(1, (S.tm - t0) / 220);
      if (u < 1) { x = fx + (tx - fx) * u; y = fy + (ty - fy) * u; z = tz * u + Math.sin(u * Math.PI) * 0.7; }
      else { x = tx; y = ty; z = tz; }
      if (e.f & 32) { z += 0.05; }
      key = e.x + e.y + 0.02 + sl_[2] * 0.01 + (u < 1 ? 0.3 : 0);
    } else if (st === 2) {
      const u = Math.max(0, Math.min(1, (S.tm - t0) / 600));
      if (u < 0.72) { const q = u / 0.72; x = fx + (bx - fx) * q * 0.85; y = fy + (by - fy) * q * 0.85; z = 1.1 * 4 * q * (1 - q) + 0.4 * (1 - q); }
      else { const q = (u - 0.72) / 0.28; x = fx + (bx - fx) * (0.85 + 0.15 * q); y = fy + (by - fy) * (0.85 + 0.15 * q); z = 0.22 * 4 * q * (1 - q); }
      key = x + y;
    } else if (st === 3) {
      const [cx_, cy_, cz] = trayCell(own);
      const u = Math.max(0, Math.min(1, (S.tm - t0) / 380));
      if (u < 0.75) { const q = u / 0.75; x = fx + (cx_ - fx) * q; y = fy + (cy_ - fy) * q; z = cz + (0.5 * (1 - q)) + 1.0 * 4 * q * (1 - q) * 0.6; }
      else { const q = (u - 0.75) / 0.25; x = cx_; y = cy_; z = cz + 0.12 * 4 * q * (1 - q); }
      key = (u < 1 ? x + y + 0.6 : cx_ + cy_);
    } else key = x + y;
    shadow(spr, x, y, z);
    list.push({ k: key, f: () => { const [sx, sy] = P(x, y, z); ctx.drawImage(spr.c, sx - spr.ax, sy - spr.ay); } });
  }

  // 船とサメ
  for (const e of S.ents) {
    const a = anim.get(e.i) || { t: 0, speed: 0 };
    const yawI = SPR.yawIndex(e.d);
    const moving = a.speed > 0.6;
    let spr, alpha = 1, outlineAlpha = 0;
    if (e.ro === 'b') {
      let pose = 0;
      if (e.f & 32) pose = 0;
      else if (e.f & 1) pose = 3;
      else { const ph = Math.floor(a.t * (moving ? 1.6 : 0.7)) % 4; pose = ph === 1 ? 1 : ph === 3 ? 2 : 0; }
      spr = SPR.boat(e.tm, yawI, pose, Math.min(3, e.load));
    } else {
      const ph = Math.floor(a.t * (moving ? 2.2 : 0.8)) % 4;
      let tail = ph === 0 ? 0 : ph === 2 ? 2 : 1;
      if (e.f & 8) tail = 1;
      const open = (e.f & 64) && Math.floor(S.tm / 90) % 2 === 0 ? 1 : 0;
      spr = SPR.shark(e.tm, yawI, tail, open, e.f & 4 ? 1 : 0);
      if (e.f & 16) {
        if (e.tm === S.myTeam) { alpha = 0.45; outlineAlpha = 1; }
        else { alpha = 0.16; outlineAlpha = 0.4; }
      }
    }
    if (alpha === 1) shadow(spr, e.x, e.y, 0);
    const key = e.x + e.y;
    list.push({
      k: key, f: () => {
        const [sx, sy] = P(e.x, e.y, 0);
        const prot = e.ro === 'b' && (e.f & 2);
        if (prot) drawCase(ctx, P, e, false, S.tm);
        if (alpha < 1) {
          ctx.globalAlpha = alpha; ctx.drawImage(spr.c, sx - spr.ax, sy - spr.ay);
          ctx.globalAlpha = outlineAlpha; ctx.drawImage(SPR.outline(spr), sx - spr.ax, sy - spr.ay);
          ctx.globalAlpha = 1;
        } else ctx.drawImage(spr.c, sx - spr.ax, sy - spr.ay);
        if (prot) drawCase(ctx, P, e, true, S.tm);
      },
    });
  }

  // 影を合成
  sc.globalCompositeOperation = 'source-in';
  sc.fillStyle = 'rgb(' + PAL.shadow.join(',') + ')';
  sc.fillRect(0, 0, vw, vh);
  ctx.globalAlpha = 0.3;
  ctx.drawImage(sl, 0, 0);
  ctx.globalAlpha = 1;

  // 水面の航跡(物体より下)
  for (const p of R.fx.parts) {
    if (p.kind !== 'wake') continue;
    const [sx, sy] = P(p.x, p.y, 0);
    ctx.fillStyle = p.life / p.max > 0.45 ? '#eef5f1' : '#c6e2e4';
    ctx.fillRect(sx, sy, 1, 1);
  }

  list.sort((a, b) => a.k - b.k);
  for (const o of list) o.f();

  // しぶき(空中)
  for (const p of R.fx.parts) {
    if (p.kind !== 'spray') continue;
    const [sx, sy] = P(p.x, p.y, p.z);
    ctx.fillStyle = '#f2f6f2';
    ctx.fillRect(sx, sy, 1, 1);
  }

  // 自分の目印
  const me = entById.get(S.me);
  if (me) {
    const bob = Math.floor(S.now / 300) % 2;
    const [sx, sy] = P(me.x, me.y, me.ro === 'b' ? 1.75 : 1.45);
    drawMarker(ctx, sx, sy - bob, me.tm);
  }
  // 港の進捗札
  drawTrayTag(ctx, P, S.delivered);
}

function drawMarker(ctx, x, y, team) {
  const col = team ? '#4a6c91' : '#a3483b';
  ctx.fillStyle = '#2b2622';
  ctx.fillRect(x - 3, y - 4, 7, 1); ctx.fillRect(x - 3, y - 4, 1, 2); ctx.fillRect(x + 3, y - 4, 1, 2);
  ctx.fillRect(x - 2, y - 2, 1, 1); ctx.fillRect(x + 2, y - 2, 1, 1); ctx.fillRect(x - 1, y - 1, 1, 1); ctx.fillRect(x + 1, y - 1, 1, 1); ctx.fillRect(x, y, 1, 1);
  ctx.fillStyle = col;
  ctx.fillRect(x - 2, y - 3, 5, 1); ctx.fillRect(x - 1, y - 2, 3, 1); ctx.fillRect(x, y - 1, 1, 1);
}

// 保護中: 透明なプラスチックケースの細い輪郭線
function drawCase(ctx, P, e, front, tm) {
  const hw = 1.05, hd = 1.05, hh = 1.35;
  const x0 = e.x - hw, x1 = e.x + hw, y0 = e.y - hd, y1 = e.y + hd;
  const v = (x, y, z) => P(x, y, z);
  const back = '#b9d3d8', fr = '#e4eeee';
  if (!front) {
    // 奥側の辺
    const A = v(x0, y0, 0), B = v(x1, y0, 0), Cc = v(x0, y1, 0), Dt = v(x0, y0, hh);
    pxLine(ctx, A[0], A[1], B[0], B[1], back); pxLine(ctx, A[0], A[1], Cc[0], Cc[1], back); pxLine(ctx, A[0], A[1], Dt[0], Dt[1], back);
  } else {
    const c = [v(x1, y0, 0), v(x1, y1, 0), v(x0, y1, 0), v(x0, y0, hh), v(x1, y0, hh), v(x1, y1, hh), v(x0, y1, hh)];
    const L = (a, b) => pxLine(ctx, a[0], a[1], b[0], b[1], fr);
    L(c[0], c[1]); L(c[1], c[2]);
    L(c[3], c[4]); L(c[4], c[5]); L(c[5], c[6]); L(c[6], c[3]);
    L(c[0], c[4]); L(c[1], c[5]); L(c[2], c[6]);
    // 角の光
    ctx.fillStyle = '#ffffff';
    const g = c[5];
    ctx.fillRect(g[0], g[1], 1, 1);
    const k = Math.floor(tm / 120) % 12;
    if (k < 4) { const a = c[3], b = c[4]; ctx.fillRect(Math.round(a[0] + (b[0] - a[0]) * (k + 1) / 5), Math.round(a[1] + (b[1] - a[1]) * (k + 1) / 5), 1, 1); }
  }
}

function drawTrayTag(ctx, P, n) {
  const T = CONFIG.TRAY;
  const [sx, sy] = P(T.x0, T.y1 + 0.15, 0);
  const label = n + '/' + CONFIG.BLOCKS, txt = textInfo(label, 10, true);
  const w = txt.w + 4, h = 11;
  const x = sx - w - 4, y = sy - 2;
  ctx.fillStyle = 'rgba(34,46,70,0.3)'; ctx.fillRect(x + 1, y + 1, w, h);
  ctx.fillStyle = '#f1ebdc'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#d8d0bd'; ctx.fillRect(x, y + h - 1, w, 1);
  ctx.fillStyle = '#8f8573'; ctx.fillRect(x + w, y + 3, 4, 1);  // 糸
  queueText(label, 10, '#3b3630', true, x + 1, y - 1);
}
