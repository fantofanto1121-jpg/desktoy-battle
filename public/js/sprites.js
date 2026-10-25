// スプライト定義と焼き込み
// おもちゃや小物は小さなボクセルモデルで定義し、アイソメ(2:1)に光線追跡で焼き込む。
// 面ごとに明暗3段階、輪郭線、プラスチックのハイライト点、光源方向の落ち影を作る。
'use strict';

const ISO = { X: 10, Y: 5, Z: 11 };          // ワールド1単位あたりの画素
const LIGHT = (() => { const v = [-0.62, -0.34, 0.71], l = Math.hypot(...v); return v.map(a => a / l); })();

function hexRGB(c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; }

// ---------- 素材 ----------
const MATS = [null];
const M = {};
function defMat(name, ramp, ol, kind) { MATS.push({ name, ramp: ramp.map(hexRGB), ol: hexRGB(ol), kind }); M[name] = MATS.length - 1; }
defMat('red', ['#c45c4a', '#a3483b', '#7b352d'], '#4a2420', 'plastic');
defMat('blue', ['#5f84ab', '#4a6c91', '#37516f'], '#233244', 'plastic');
defMat('white', ['#ece6d8', '#cdc6b6', '#a49d8d'], '#5c574d', 'plastic');
defMat('seam', ['#8c8478', '#776f64', '#5f5950'], '#45403a', 'plastic');
defMat('window', ['#55687a', '#435565', '#34424f'], '#252f38', 'plastic');
defMat('yellow', ['#d9b350', '#b9943c', '#8e702d'], '#54421c', 'plastic');
defMat('black', ['#4c4b49', '#3c3b3a', '#2e2d2c'], '#1e1d1c', 'plastic');
defMat('shark', ['#7d91a1', '#68798a', '#515f6e'], '#313b45', 'rubber');
defMat('belly', ['#d2d4cb', '#babdb4', '#9ca096'], '#5b5f58', 'rubber');
defMat('mouth', ['#ad4b43', '#8e3b35', '#6a2b27'], '#3d1a17', 'rubber');
defMat('teeth', ['#eee8da', '#d4cdbe', '#b2ab9c'], '#68635a', 'rubber');
defMat('eye', ['#303135', '#27282c', '#1e1f22'], '#151619', 'rubber');
defMat('stripeR', ['#b45a4c', '#97493e', '#733730'], '#44221e', 'rubber');
defMat('stripeB', ['#5a7aa0', '#476488', '#364d68'], '#22303f', 'rubber');
defMat('bWood', ['#dbb47e', '#c29862', '#9b764b'], '#5c4429', 'wood');
defMat('bRed', ['#c4644f', '#a5503f', '#7f3d31'], '#4a241d', 'wood');
defMat('bYellow', ['#ddb855', '#c09b42', '#937532'], '#55441d', 'wood');
defMat('bGreen', ['#84a468', '#6a8953', '#516a40'], '#2f3e25', 'wood');
defMat('bBlue', ['#6587ae', '#507094', '#3e5774'], '#243344', 'wood');
defMat('rubberW', ['#ebe6db', '#d2cdc1', '#b0ab9e'], '#6a665c', 'rubber');
defMat('sleeve', ['#5279a7', '#406591', '#314e72'], '#21354e', 'paper');
defMat('sleeveW', ['#e4e5df', '#cacbc4', '#a9aaa3'], '#5f605a', 'paper');
defMat('metal', ['#d6dadd', '#aab1b7', '#7e868d'], '#495056', 'metal');
defMat('pencil', ['#dab14e', '#bf963c', '#97742e'], '#58431a', 'paper');
defMat('pWood', ['#e4c79a', '#caa97b', '#a8885c'], '#64502f', 'wood');
defMat('graphite', ['#5c5c60', '#48484c', '#37373b'], '#232326', 'metal');
defMat('pEraser', ['#d39d92', '#ba867b', '#996a61'], '#5a3c37', 'rubber');
defMat('pBand', ['#4f6b4f', '#405940', '#324632'], '#202d20', 'paper');
defMat('tray', ['#ddd5b6', '#c3ba99', '#a19878'], '#5b5540', 'plastic');
defMat('trayIn', ['#cfc6a5', '#b6ad8c', '#958c6d'], '#5b5540', 'plastic');

const BLOCK_MATS = ['bWood', 'bRed', 'bYellow', 'bGreen', 'bBlue'];
const HL = { plastic: [hexRGB('#f7f3e9'), 2], metal: [hexRGB('#f4f6f6'), 4], wood: [hexRGB('#efd9b4'), 1] };

// ---------- ボクセルモデル ----------
// size: [sx, sy, sz] ワールド単位、origin: モデル原点からの格子の始点、fill(x,y,z) -> 素材番号
function makeModel(def) {
  const vs = def.vs, nx = Math.ceil(def.size[0] / vs), ny = Math.ceil(def.size[1] / vs), nz = Math.ceil(def.size[2] / vs);
  const o = def.origin || [-def.size[0] / 2, -def.size[1] / 2, 0];
  const data = new Uint8Array(nx * ny * nz);
  for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
    data[(z * ny + y) * nx + x] = def.fill(o[0] + (x + 0.5) * vs, o[1] + (y + 0.5) * vs, o[2] + (z + 0.5) * vs) | 0;
  }
  const m = { nx, ny, nz, vs, o, data, normals: null };
  if (def.smooth) m.normals = smoothNormals(m, def.smooth);
  return m;
}

function voxel(m, x, y, z) {
  if (x < 0 || y < 0 || z < 0 || x >= m.nx || y >= m.ny || z >= m.nz) return 0;
  return m.data[(z * m.ny + y) * m.nx + x];
}

// 占有率の勾配から表面の法線を作る(曲面をなめらかに塗り分けるため)
function smoothNormals(m, r) {
  const N = new Float32Array(m.data.length * 3);
  const offs = [];
  const ri = Math.ceil(r);
  for (let dz = -ri; dz <= ri; dz++) for (let dy = -ri; dy <= ri; dy++) for (let dx = -ri; dx <= ri; dx++) {
    if ((dx || dy || dz) && dx * dx + dy * dy + dz * dz <= r * r) offs.push([dx, dy, dz]);
  }
  for (let z = 0; z < m.nz; z++) for (let y = 0; y < m.ny; y++) for (let x = 0; x < m.nx; x++) {
    const i = (z * m.ny + y) * m.nx + x;
    if (!m.data[i]) continue;
    let nx = 0, ny = 0, nz = 0;
    for (const [dx, dy, dz] of offs) {
      // 地面の下は空気として扱わない(底面が明るくならないように)
      const zz = z + dz;
      const occ = zz < 0 ? 1 : (voxel(m, x + dx, y + dy, zz) ? 1 : 0);
      if (!occ) { nx += dx; ny += dy; nz += dz; }
    }
    const l = Math.hypot(nx, ny, nz);
    if (l > 0) { N[i * 3] = nx / l; N[i * 3 + 1] = ny / l; N[i * 3 + 2] = nz / l; }
  }
  return N;
}

function rotMatrix(yaw, pitch, roll) {
  const cz = Math.cos(yaw), sz = Math.sin(yaw), cy = Math.cos(pitch), sy = Math.sin(pitch), cx = Math.cos(roll), sx = Math.sin(roll);
  // Rz * Ry * Rx
  return [
    cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx,
    sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx,
    -sy, cy * sx, cy * cx,
  ];
}
const mulM = (R, v) => [R[0] * v[0] + R[1] * v[1] + R[2] * v[2], R[3] * v[0] + R[4] * v[1] + R[5] * v[2], R[6] * v[0] + R[7] * v[1] + R[8] * v[2]];
const mulMT = (R, v) => [R[0] * v[0] + R[3] * v[1] + R[6] * v[2], R[1] * v[0] + R[4] * v[1] + R[7] * v[2], R[2] * v[0] + R[5] * v[1] + R[8] * v[2]];

// 焼き込み。戻り値: { c, ax, ay, sh, sax, say, hit? }
// ax, ay はモデル原点(地面上)がスプライト内で来る位置
function bake(m, opt) {
  opt = opt || {};
  const R = rotMatrix(opt.yaw || 0, opt.pitch || 0, opt.roll || 0);
  const sink = opt.sink || 0, remap = opt.remap || null;
  const vs = m.vs, o = m.o;
  // 範囲
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, zTop = -1e9;
  for (let k = 0; k < 8; k++) {
    const p = mulM(R, [o[0] + (k & 1 ? m.nx * vs : 0), o[1] + (k & 2 ? m.ny * vs : 0), o[2] + (k & 4 ? m.nz * vs : 0)]);
    p[2] -= sink;
    const sx = (p[0] - p[1]) * ISO.X, sy = (p[0] + p[1]) * ISO.Y - p[2] * ISO.Z;
    x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy); zTop = Math.max(zTop, p[2]);
  }
  zTop += 0.05;
  const ax = -Math.floor(x0) + 2, ay = -Math.floor(y0) + 2;
  const w = Math.ceil(x1) - Math.floor(x0) + 4, h = Math.ceil(y1) - Math.floor(y0) + 4;
  const matBuf = new Uint8Array(w * h), lvl = new Uint8Array(w * h);
  const hitX = opt.keepHit ? new Float32Array(w * h) : null, hitY = opt.keepHit ? new Float32Array(w * h) : null;
  const D = [-0.5, -0.5, -ISO.Y / ISO.Z];
  const dm = mulMT(R, D), dg = [dm[0] / vs, dm[1] / vs, dm[2] / vs];
  const sGround = (zTop + sink * 0) / (ISO.Y / ISO.Z);
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const sx = px + 0.5 - ax, sy = py + 0.5 - ay;
    const u = sx / ISO.X, t0 = (sy + zTop * ISO.Z) / ISO.Y;
    const P0 = [(t0 + u) / 2, (t0 - u) / 2, zTop + sink];
    const m0 = mulMT(R, P0);
    const g0 = [(m0[0] - o[0]) / vs, (m0[1] - o[1]) / vs, (m0[2] - o[2]) / vs];
    // 格子箱との交差
    let tmin = 0, tmax = sGround, axis = -1;
    const dims = [m.nx, m.ny, m.nz];
    let ok = true;
    for (let a = 0; a < 3; a++) {
      if (Math.abs(dg[a]) < 1e-9) { if (g0[a] < 0 || g0[a] > dims[a]) { ok = false; break; } continue; }
      let ta = (0 - g0[a]) / dg[a], tb = (dims[a] - g0[a]) / dg[a];
      if (ta > tb) { const q = ta; ta = tb; tb = q; }
      if (ta > tmin) { tmin = ta; axis = a; }
      if (tb < tmax) tmax = tb;
    }
    if (!ok || tmin > tmax) continue;
    let s = tmin + 1e-5;
    const g = [g0[0] + dg[0] * s, g0[1] + dg[1] * s, g0[2] + dg[2] * s];
    const c = [Math.floor(g[0]), Math.floor(g[1]), Math.floor(g[2])];
    const step = [0, 0, 0], tMax = [0, 0, 0], tDel = [0, 0, 0];
    for (let a = 0; a < 3; a++) {
      if (dg[a] > 0) { step[a] = 1; tDel[a] = 1 / dg[a]; tMax[a] = s + (c[a] + 1 - g[a]) / dg[a]; }
      else if (dg[a] < 0) { step[a] = -1; tDel[a] = -1 / dg[a]; tMax[a] = s + (g[a] - c[a]) / -dg[a]; }
      else { tMax[a] = Infinity; tDel[a] = Infinity; }
    }
    let hit = 0, hAxis = axis, guard = 0;
    while (s <= tmax && guard++ < 400) {
      const v = voxel(m, c[0], c[1], c[2]);
      if (v) { hit = v; break; }
      const a = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : (tMax[1] < tMax[2] ? 1 : 2);
      s = tMax[a]; tMax[a] += tDel[a]; c[a] += step[a]; hAxis = a;
    }
    if (!hit) continue;
    const idx = py * w + px;
    let n;
    const vi = (c[2] * m.ny + c[1]) * m.nx + c[0];
    if (m.normals && (m.normals[vi * 3] || m.normals[vi * 3 + 1] || m.normals[vi * 3 + 2])) n = [m.normals[vi * 3], m.normals[vi * 3 + 1], m.normals[vi * 3 + 2]];
    else { n = [0, 0, 0]; if (hAxis >= 0) n[hAxis] = -step[hAxis]; else n[2] = 1; }
    const nw = mulM(R, n);
    const I = nw[0] * LIGHT[0] + nw[1] * LIGHT[1] + nw[2] * LIGHT[2];
    const kind = MATS[hit].kind;
    const t1 = kind === 'rubber' ? 0.66 : 0.6, t2 = kind === 'rubber' ? 0.12 : 0.2;
    matBuf[idx] = remap && remap[hit] ? remap[hit] : hit;
    lvl[idx] = I > t1 ? 0 : I > t2 ? 1 : 2;
    if (hitX) { hitX[idx] = P0[0] + D[0] * s; hitY[idx] = P0[1] + D[1] * s; }
  }
  // 色を付ける
  const c = makeCanvas(w, h), cx = c.getContext('2d'), img = cx.createImageData(w, h), d = img.data;
  const put = (i, rgb) => { d[i * 4] = rgb[0]; d[i * 4 + 1] = rgb[1]; d[i * 4 + 2] = rgb[2]; d[i * 4 + 3] = 255; };
  for (let i = 0; i < w * h; i++) if (matBuf[i]) put(i, MATS[matBuf[i]].ramp[lvl[i]]);
  // ハイライト点: 光の当たる上端から少数だけ
  if (!opt.noHl) {
    const groups = {};
    for (let py = 1; py < h; py++) for (let px = 0; px < w; px++) {
      const i = py * w + px, mt = matBuf[i];
      if (!mt || lvl[i] !== 0) continue;
      const kind = MATS[mt].kind;
      if (!HL[kind]) continue;
      if (matBuf[i - w] === mt && lvl[i - w] === 0) continue;
      (groups[kind] = groups[kind] || []).push([px, py, px + py * 1.5]);
    }
    for (const kind in groups) {
      const list = groups[kind].sort((a, b) => a[2] - b[2]), chosen = [];
      for (const p of list) {
        if (chosen.length >= HL[kind][1]) break;
        if (chosen.every(q => Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]) > 5)) chosen.push(p);
      }
      for (const p of chosen) put(p[1] * w + p[0], HL[kind][0]);
    }
  }
  // 輪郭線
  const olOwner = new Int32Array(w * h).fill(-1);
  if (!opt.noOutline) {
    for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
      const i = py * w + px;
      if (matBuf[i]) continue;
      const nb = [px > 0 ? i - 1 : -1, px < w - 1 ? i + 1 : -1, py > 0 ? i - w : -1, py < h - 1 ? i + w : -1];
      for (const j of nb) if (j >= 0 && matBuf[j]) { put(i, MATS[matBuf[j]].ol); olOwner[i] = j; break; }
    }
  }
  cx.putImageData(img, 0, 0);
  const out = { c, ax, ay, w, h };
  if (opt.keepHit) { out.matBuf = matBuf; out.hitX = hitX; out.hitY = hitY; out.olOwner = olOwner; out.img = img; }
  if (!opt.noShadow) Object.assign(out, bakeShadow(m, R, sink));
  return out;
}

// 光源方向に投影した落ち影。芯(塗り)と縁(市松のドット)の2段
function bakeShadow(m, R, sink) {
  const pts = [];
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  const kx = -LIGHT[0] / LIGHT[2], ky = -LIGHT[1] / LIGHT[2];
  for (let z = 0; z < m.nz; z++) for (let y = 0; y < m.ny; y++) for (let x = 0; x < m.nx; x++) {
    if (!m.data[(z * m.ny + y) * m.nx + x]) continue;
    const p = mulM(R, [m.o[0] + (x + 0.5) * m.vs, m.o[1] + (y + 0.5) * m.vs, m.o[2] + (z + 0.5) * m.vs]);
    p[2] -= sink;
    if (p[2] < -0.02) continue;
    const gx = p[0] + p[2] * kx, gy = p[1] + p[2] * ky;
    const sx = (gx - gy) * ISO.X, sy = (gx + gy) * ISO.Y;
    pts.push(sx, sy);
    x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
  }
  if (!pts.length) return { sh: null };
  const sax = -Math.floor(x0) + 3, say = -Math.floor(y0) + 3;
  const w = Math.ceil(x1) - Math.floor(x0) + 7, h = Math.ceil(y1) - Math.floor(y0) + 7;
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < pts.length; i += 2) {
    const px = Math.floor(pts[i] + sax), py = Math.floor(pts[i + 1] + say);
    mask[py * w + px] = 1; mask[py * w + px + 1] = 1;
  }
  const dil = (src) => {
    const o = new Uint8Array(w * h);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      o[i] = src[i] || src[i - 1] || src[i + 1] || src[i - w] || src[i + w] ? 1 : 0;
    }
    return o;
  };
  const core = dil(mask), soft = dil(dil(core));
  const c = makeCanvas(w, h), cx = c.getContext('2d'), img = cx.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (core[i] || (soft[i] && (x + y) % 2 === 0)) { d[i * 4] = 255; d[i * 4 + 3] = 255; }
  }
  cx.putImageData(img, 0, 0);
  return { sh: c, sax, say };
}

// 焼き込み結果を、当たった位置で複数の部品に分ける(長い物体の奥行き並び替え用)
function splitPieces(b, pieceOf, count) {
  const out = [];
  for (let k = 0; k < count; k++) {
    const c = makeCanvas(b.w, b.h), cx = c.getContext('2d'), img = cx.createImageData(b.w, b.h);
    out.push({ c, cx, img, used: false });
  }
  const src = b.img.data;
  for (let i = 0; i < b.w * b.h; i++) {
    let j = b.matBuf[i] ? i : b.olOwner[i];
    if (j < 0 || !b.matBuf[j]) continue;
    const k = pieceOf(b.hitX[j], b.hitY[j]);
    const p = out[k];
    p.used = true;
    p.img.data[i * 4] = src[i * 4]; p.img.data[i * 4 + 1] = src[i * 4 + 1]; p.img.data[i * 4 + 2] = src[i * 4 + 2]; p.img.data[i * 4 + 3] = 255;
  }
  for (const p of out) p.cx.putImageData(p.img, 0, 0);
  return out.map(p => p.used ? p.c : null);
}

// ---------- モデル定義 ----------
const MODELS = {};

function boatModel() {
  return makeModel({
    size: [2.0, 0.9, 1.2], vs: 0.075, smooth: 1.6,
    fill(x, y, z) {
      const L0 = -0.84, L1 = 0.92;
      if (x >= L0 && x <= L1) {
        let hb = 0.38;
        if (x > 0.12) hb *= Math.sqrt(Math.max(0, 1 - ((x - 0.12) / (L1 - 0.12)) ** 2));
        if (x < -0.72) hb *= 0.9 + 0.1 * ((x - L0) / 0.12);
        const top = 0.42 + Math.max(0, x - 0.3) * 0.2;
        const flare = z < 0.2 ? 0.7 + 0.3 * (z / 0.2) : 1;
        if (z < top && Math.abs(y) < hb * flare) {
          if (z < 0.21) return M.red;
          if (z < 0.285) return M.seam;
          return M.white;
        }
      }
      // 船室
      if (x > -0.72 && x < -0.12 && Math.abs(y) < 0.27 && z >= 0.42 && z < 0.78) {
        const wz = z > 0.55 && z < 0.68;
        if (wz && Math.abs(y) > 0.19 && Math.floor((x + 0.72) / 0.13) % 2 === 1) return M.window;
        if (wz && x > -0.2 && Math.abs(y) < 0.17 && Math.abs(y) > 0.03) return M.window;
        return M.white;
      }
      // 屋根
      if (x > -0.79 && x < -0.05 && Math.abs(y) < 0.32 && z >= 0.78 && z < 0.86) return M.red;
      // 煙突
      if (Math.hypot(x + 0.44, y) < 0.115 && z >= 0.86 && z < 1.13) return z > 1.05 ? M.black : M.yellow;
      // 船首の手すり柱
      if (Math.hypot(x - 0.72, y) < 0.045 && z < 0.66) return M.white;
      return 0;
    },
  });
}

function sharkModel(bend, open) {
  return makeModel({
    size: [2.5, 1.3, 1.0], vs: 0.075, smooth: 1.8,
    fill(x, y, z) {
      const zc = 0.31;
      const yoff = bend * Math.max(0, -(x + 0.05)) ** 2 * 0.3;
      const yy = y - yoff;
      let rr;
      if (x >= 0.15) rr = 0.29 * Math.sqrt(Math.max(0, 1 - ((x - 0.15) / 0.82) ** 2));
      else rr = 0.29 * Math.sqrt(Math.max(0, 1 - ((x - 0.15) / 1.15) ** 2));
      const ry = rr * 0.92, rz = rr * (x > 0.55 ? 0.88 : 1);
      const dz = z - zc;
      const inBody = rr > 0.01 && (yy / ry) ** 2 + (dz / rz) ** 2 <= 1;
      if (inBody) {
        if (open && x > 0.4) {
          const lo = -0.17, hi = -0.17 + (x - 0.4) * 0.62;
          if (dz > lo && dz < hi) return 0;
          if (dz > lo - 0.075 && dz < hi + 0.075) {
            const outer = (yy / ry) ** 2 + (dz / rz) ** 2 > 0.62;
            return outer ? M.teeth : M.mouth;
          }
        }
        if (Math.abs(x - 0.62) < 0.05 && dz > 0.02 && dz < 0.11 && Math.abs(yy) > ry * 0.72) return M.eye;
        if (!open && x > 0.5 && x < 0.92 && dz > -0.15 && dz < -0.08 && Math.abs(yy) > ry * 0.45) return M.mouth;
        if (dz < -rz * 0.22) return M.belly;
        return M.shark;
      }
      // 背びれ
      if (z >= 0.42 && Math.abs(yy) < 0.055) {
        const xf = 0.32 - (z - 0.42) * 0.95, xb = -0.12 + (z - 0.42) * 0.12;
        if (x <= xf && x >= xb) return z > 0.55 && z < 0.63 ? M.stripeR : M.shark;
      }
      // 胸びれ
      const a = Math.abs(yy);
      if (z > 0.12 && z < 0.21 && a > 0.16 && a < 0.6) {
        if (x <= 0.32 - (a - 0.16) * 1.1 && x >= 0.06 - (a - 0.16) * 1.3) return M.shark;
      }
      // 尾びれ
      const u = -0.9 - x;
      if (u > -0.08 && u < 0.36 && Math.abs(yy) < 0.05) {
        const top = zc + 0.05 + Math.max(0, u) * 1.5, bot = zc - 0.03 - Math.max(0, u) * 0.75;
        if (z < top && z > bot) {
          if (u > 0.2 && Math.abs(z - (zc + 0.06)) < (u - 0.2) * 1.4) return 0;
          return M.shark;
        }
      }
      return 0;
    },
  });
}

function blockModel(mat) {
  const h = 0.19, r = 0.05;
  return makeModel({
    size: [0.4, 0.4, 0.4], vs: 0.04,
    fill(x, y, z) {
      const q = [Math.max(Math.abs(x) - (h - r), 0), Math.max(Math.abs(y) - (h - r), 0), Math.max(Math.abs(z - h) - (h - r), 0)];
      return Math.hypot(q[0], q[1], q[2]) <= r ? M[mat] : 0;
    },
  });
}

function trayModel() {
  const T = CONFIG.TRAY, w = T.x1 - T.x0, d = T.y1 - T.y0, wt = 0.07;
  const cw = w / T.cols, ch = d / T.rows;
  return makeModel({
    size: [w, d, 0.3], vs: 0.05, origin: [0, 0, 0],
    fill(x, y, z) {
      if (z < 0.05) return M.trayIn;
      const edge = x < wt || y < wt || x > w - wt || y > d - wt;
      if (edge && z < 0.28) return M.tray;
      const dx = Math.abs(x - Math.round(x / cw) * cw), dy = Math.abs(y - Math.round(y / ch) * ch);
      if ((dx < wt / 2 + 0.005 || dy < wt / 2 + 0.005) && z < 0.2) return M.tray;
      return 0;
    },
  });
}

function pencilModel() {
  const len = 7.0;
  return makeModel({
    size: [len, 0.62, 0.56], vs: 0.05, origin: [0, -0.31, 0], smooth: 1.3,
    fill(x, y, z) {
      const zz = z - 0.26, r = Math.hypot(y, zz);
      const hex = a => Math.abs(zz) <= a && 0.866 * Math.abs(y) + 0.5 * Math.abs(zz) <= a;
      if (x < 0.45) return r < 0.235 ? M.pEraser : 0;
      if (x < 0.9) return r < (Math.floor(x / 0.07) % 2 ? 0.25 : 0.262) ? M.metal : 0;
      if (x < 5.9) {
        if (!hex(0.26)) return 0;
        if (x > 1.12 && x < 1.2) return M.pBand;
        return M.pencil;
      }
      if (x < 6.7) {
        const a = 0.26 * (1 - (x - 5.9) / 0.8 * 0.76);
        if (r < a) return M.pWood;
        return 0;
      }
      const a = 0.062 * (1 - (x - 6.7) / 0.3);
      return r < Math.max(0.012, a) ? M.graphite : 0;
    },
  });
}

function eraserModel(alongY, sleeveMat, bandMat) {
  const L = alongY ? 2.3 : 2.5, Wd = alongY ? 1.3 : 1.4, Hh = alongY ? 0.6 : 0.7;
  const size = alongY ? [Wd, L, Hh] : [L, Wd, Hh];
  return makeModel({
    size, vs: 0.05, origin: [0, 0, 0],
    fill(x, y, z) {
      let u = alongY ? y : x, v = alongY ? x : y;
      // 角の丸み
      const r = 0.1, cu = Math.max(r - u, u - (L - r), 0), cv = Math.max(r - v, v - (Wd - r), 0), cz = Math.max(z - (Hh - r), 0);
      if (Math.hypot(cu, cv, cz) > r) return 0;
      // 片方の端が使い減っている
      if (u > L - 0.45) {
        const k = (u - (L - 0.45)) / 0.45;
        if (z > Hh - k * k * 0.35) return 0;
      }
      const s0 = L * 0.22, s1 = L * 0.78;
      if (u > s0 && u < s1) {
        if (u > L * 0.42 && u < L * 0.58) return M[bandMat];
        return M[sleeveMat];
      }
      return M.rubberW;
    },
  });
}

function clipModel() {
  // 針金の中心線(折れ線と円弧)
  const pts = [];
  const line = (a, b) => { for (let t = 0; t <= 1; t += 0.02) pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); };
  const arc = (cx, cy, r, a0, a1) => { for (let t = 0; t <= 1; t += 0.02) { const a = a0 + (a1 - a0) * t; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
  line([0.55, 0.15], [2.3, 0.15]);
  arc(2.3, 0.6, 0.45, -Math.PI / 2, Math.PI / 2);
  line([2.3, 1.05], [0.62, 1.05]);
  arc(0.62, 0.72, 0.33, Math.PI / 2, Math.PI * 1.5);
  line([0.62, 0.39], [2.08, 0.39]);
  arc(2.08, 0.62, 0.23, -Math.PI / 2, Math.PI / 2);
  line([2.08, 0.85], [1.05, 0.85]);
  const rw = 0.07;
  return makeModel({
    size: [2.8, 1.2, 0.16], vs: 0.035, origin: [0, 0, 0], smooth: 1.5,
    fill(x, y, z) {
      for (let i = 0; i < pts.length; i++) {
        const dx = x - pts[i][0], dy = y - pts[i][1];
        if (dx * dx + dy * dy + (z - rw) ** 2 < rw * rw) return M.metal;
      }
      return 0;
    },
  });
}

// ---------- スプライト管理(必要になったときに焼いて保存) ----------
const SPR = {
  cache: new Map(),
  YAWS: 32,
  get(key, make) { let s = this.cache.get(key); if (!s) { s = make(); this.cache.set(key, s); } return s; },
  yawIndex(a) { const n = this.YAWS; return ((Math.round(a / (Math.PI * 2) * n) % n) + n) % n; },

  boat(team, yawI, pose, sink) {
    // pose: 0 中央, 1 右へ傾き, 2 左へ傾き, 3 船首上げ(ダッシュ)
    return this.get(`b${team}|${yawI}|${pose}|${sink}`, () => {
      MODELS.boat = MODELS.boat || boatModel();
      const yaw = yawI / this.YAWS * Math.PI * 2;
      const roll = pose === 1 ? 0.14 : pose === 2 ? -0.14 : 0;
      const pitch = pose === 3 ? -0.17 : 0;
      return bake(MODELS.boat, { yaw, roll, pitch, sink: sink * 0.1 + (pose === 3 ? -0.03 : 0), remap: team ? { [M.red]: M.blue } : null });
    });
  },
  shark(team, yawI, tail, open, crouch) {
    return this.get(`s${team}|${yawI}|${tail}|${open}|${crouch}`, () => {
      const mk = `shark${tail}${open}`;
      MODELS[mk] = MODELS[mk] || sharkModel(tail - 1, open);
      const yaw = yawI / this.YAWS * Math.PI * 2;
      return bake(MODELS[mk], { yaw, pitch: crouch ? 0.1 : 0, sink: crouch ? 0.13 : 0, remap: team ? { [M.stripeR]: M.stripeB } : null });
    });
  },
  block(c) {
    return this.get('k' + c, () => {
      const mk = 'block' + c;
      MODELS[mk] = MODELS[mk] || blockModel(BLOCK_MATS[c]);
      return bake(MODELS[mk], {});
    });
  },
  // 輪郭だけの版(潜行中の表示用)
  outline(s) {
    if (s.olc) return s.olc;
    const c = makeCanvas(s.w, s.h), cx = c.getContext('2d');
    const src = s.c.getContext('2d').getImageData(0, 0, s.w, s.h).data, img = cx.createImageData(s.w, s.h), d = img.data;
    for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
      const i = (y * s.w + x) * 4;
      if (!src[i + 3]) continue;
      const edge = x === 0 || y === 0 || x === s.w - 1 || y === s.h - 1 || !src[i - 4 + 3] || !src[i + 4 + 3] || !src[i - s.w * 4 + 3] || !src[i + s.w * 4 + 3];
      if (edge) { d[i] = 70; d[i + 1] = 86; d[i + 2] = 100; d[i + 3] = 255; }
    }
    cx.putImageData(img, 0, 0);
    s.olc = c;
    return c;
  },
};

// ---------- 静的な小物(部品に分けて焼く) ----------
function bakeStatics() {
  const out = [];   // { c, x, y (ワールドの原点), ax, ay, key }
  const shadows = [];
  const add = (b, wx, wy, pieceOf, keys) => {
    const parts = splitPieces(b, (hx, hy) => pieceOf(hx + wx, hy + wy), keys.length);
    parts.forEach((c, k) => { if (c) out.push({ c, x: wx, y: wy, ax: b.ax, ay: b.ay, key: keys[k] }); });
    if (b.sh) shadows.push({ c: b.sh, x: wx, y: wy, ax: b.sax, ay: b.say });
  };
  for (const ob of CONFIG.OBSTACLES) {
    let model;
    if (ob.kind === 'pencil') model = pencilModel();
    else if (ob.kind === 'eraser') model = eraserModel(false, 'sleeve', 'sleeveW');
    else if (ob.kind === 'eraser2') model = eraserModel(true, 'sleeveW', 'sleeve');
    else model = clipModel();
    const b = bake(model, { keepHit: true });
    const alongY = (ob.y1 - ob.y0) > (ob.x1 - ob.x0);
    const len = alongY ? ob.y1 - ob.y0 : ob.x1 - ob.x0;
    const n = Math.max(1, Math.ceil(len / 0.8)), step = len / n;
    const keys = [];
    for (let k = 0; k < n; k++) keys.push(alongY ? (ob.x0 + ob.x1) / 2 + ob.y0 + (k + 0.5) * step : ob.x0 + (k + 0.5) * step + (ob.y0 + ob.y1) / 2);
    const wx = ob.x0, wy = ob.kind === 'pencil' ? (ob.y0 + ob.y1) / 2 : ob.y0;
    add(b, wx, wy, (hx, hy) => Math.max(0, Math.min(n - 1, Math.floor(((alongY ? hy - ob.y0 : hx - ob.x0)) / step))), keys);
  }
  // 港のトレイ: 仕切りごとに分けて、中の資材と正しく重なるようにする
  const T = CONFIG.TRAY, tw = (T.x1 - T.x0) / T.cols, th = (T.y1 - T.y0) / T.rows, wt = 0.07;
  const tb = bake(trayModel(), { keepHit: true });
  const keys = [];
  for (let j = 0; j <= T.rows; j++) for (let i = 0; i <= T.cols; i++) keys.push(T.x0 + (i + 0.5) * tw + T.y0 + (j + 0.5) * th - 0.05);
  add(tb, T.x0, T.y0, (hx, hy) => {
    const i = Math.max(0, Math.min(T.cols, Math.floor((hx - T.x0 + wt) / tw)));
    const j = Math.max(0, Math.min(T.rows, Math.floor((hy - T.y0 + wt) / th)));
    return j * (T.cols + 1) + i;
  }, keys);
  return { pieces: out, shadows };
}

// ---------- 文字(システムフォントを2値化してドット風に) ----------
const FONT = '"Hiragino Kaku Gothic ProN","Hiragino Sans","Meiryo","BIZ UDPGothic","Yu Gothic","Noto Sans JP","IPAGothic",sans-serif';
const TEXT = new Map();
// 細い書体でも線が途切れないよう、4倍の大きさで描いてから画素ごとの塗り面積で2値化する
function textSprite(str, size, color, bold) {
  const key = str + '|' + size + '|' + color + '|' + (bold ? 1 : 0);
  let s = TEXT.get(key);
  if (s) return s;
  const K = 4;
  const font = (bold || size < 12 ? 'bold ' : '') + size * K + 'px ' + FONT;
  const tmp = makeCanvas(4, 4).getContext('2d');
  tmp.font = font;
  const w = Math.ceil(tmp.measureText(str).width / K) + 2, h = Math.ceil(size * 1.3) + 2;
  const big = makeCanvas(w * K, h * K), bx = big.getContext('2d', { willReadFrequently: true });
  bx.font = font; bx.textBaseline = 'top'; bx.fillStyle = '#000';
  bx.fillText(str, K, Math.round(size * 0.1 * K));
  // 細い書体でも線が1画素以上残るよう、輪郭を少し太らせる
  bx.strokeStyle = '#000'; bx.lineJoin = 'round';
  bx.lineWidth = Math.max(1.5, size * K * (bold || size < 12 ? 0.04 : 0.03));
  bx.strokeText(str, K, Math.round(size * 0.1 * K));
  const src = bx.getImageData(0, 0, w * K, h * K).data;
  const c = makeCanvas(w, h), cx = c.getContext('2d');
  const img = cx.createImageData(w, h), d = img.data, rgb = hexRGB(color);
  const th = (bold ? 0.36 : 0.26) * K * K * 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let j = 0; j < K; j++) for (let i = 0; i < K; i++) sum += src[((y * K + j) * w * K + x * K + i) * 4 + 3];
    const o = (y * w + x) * 4;
    d[o] = rgb[0]; d[o + 1] = rgb[1]; d[o + 2] = rgb[2]; d[o + 3] = sum > th ? 255 : sum > th * 0.45 ? 110 : 0;
  }
  cx.putImageData(img, 0, 0);
  s = { c, w, h };
  TEXT.set(key, s);
  return s;
}

// UIの文字は画面の実解像度で、別の透明キャンバスにくっきり描く(小さいドット文字は書体によってつぶれるため)
const TQ = { list: [], dims: new Map() };
function textInfo(str, size, bold) {
  const key = str + '|' + size + '|' + (bold ? 1 : 0);
  let d = TQ.dims.get(key);
  if (!d) {
    const tmp = makeCanvas(4, 4).getContext('2d');
    tmp.font = (bold ? 'bold ' : '') + size * 8 + 'px ' + FONT;
    d = { w: Math.ceil(tmp.measureText(str).width / 8) + 2, h: Math.ceil(size * 1.3) + 2 };
    TQ.dims.set(key, d);
  }
  return d;
}
function queueText(str, size, color, bold, x, y) {
  const d = textInfo(str, size, bold);
  TQ.list.push({ str, size, color, bold, x, y, w: d.w, h: d.h });
  return d;
}
// 後から描いた紙やボタンの下に隠れる文字を取り除く
function occludeText(x, y, w, h) {
  TQ.list = TQ.list.filter(q => q.x + q.w <= x || q.x >= x + w || q.y + q.h <= y || q.y >= y + h);
}
function flushText(tc, scale) {
  tc.clearRect(0, 0, tc.canvas.width, tc.canvas.height);
  tc.textBaseline = 'top';
  for (const q of TQ.list) {
    tc.font = (q.bold ? 'bold ' : '') + Math.round(q.size * scale) + 'px ' + FONT;
    tc.fillStyle = q.color;
    tc.fillText(q.str, Math.round((q.x + 1) * scale), Math.round((q.y + q.size * 0.1) * scale));
  }
  TQ.list = [];
}

// 3x5 の小さな数字(マットの目盛りやタイマー用)
const DIGITS3x5 = {
  '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111', '4': '101101111001001',
  '5': '111100111001111', '6': '111100111101111', '7': '111001010010010', '8': '111101111101111', '9': '111101111001111',
};
