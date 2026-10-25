// 画面のUI: 文房具(付箋、ラベルテープ、カード)の見た目で描く
'use strict';

const UI = {
  buttons: [],
  hover: null,
  pressed: null,
  big: false,
};

const COL = {
  ink: '#3a342d', inkSoft: '#6b6357', paper: '#f3eee2', paperEdge: '#d8d0bf', paperDark: '#c9c0ad',
  red: '#a8493c', redSoft: '#c56c5d', blue: '#4a6d93', blueSoft: '#6b8db2',
  shadow: 'rgba(34,46,70,0.3)', tape: '#34373b', tapeHi: '#4a4e53', tapeLo: '#222427', tapeText: '#ebe6da',
  noteR: '#e9c6b8', noteRDark: '#d8ae9f', noteB: '#c3d5df', noteBDark: '#a9c0cd', noteY: '#ead98f', noteYDark: '#d6c271',
};
const teamCol = t => t ? COL.blue : COL.red;
const teamName = t => t ? '青チーム' : '赤チーム';

function txt(ctx, s, x, y, size, col, bold, align) {
  const t = textInfo(String(s), size, bold);
  let dx = x;
  if (align === 'c') dx = x - Math.floor(t.w / 2);
  else if (align === 'r') dx = x - t.w;
  queueText(String(s), size, col, bold, Math.round(dx), Math.round(y));
  return t;
}
function txtW(s, size, bold) { return textInfo(String(s), size, bold).w; }

function shadowBox(ctx, x, y, w, h, off) {
  off = off || 2;
  ctx.fillStyle = COL.shadow;
  ctx.fillRect(x + off, y + off, w, h);
}

// 紙のカード
function card(ctx, x, y, w, h, opt) {
  opt = opt || {};
  shadowBox(ctx, x, y, w, h, opt.off || 3);
  occludeText(x, y, w + 3, h + 3);
  ctx.fillStyle = opt.fill || COL.paper; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = opt.edge || COL.paperEdge; ctx.fillRect(x, y + h - 1, w, 1); ctx.fillRect(x + w - 1, y, 1, h);
  ctx.fillStyle = '#fbf8f0'; ctx.fillRect(x, y, w - 1, 1);
  if (opt.ruled) {
    ctx.fillStyle = '#cf8a80'; ctx.fillRect(x + 3, y + opt.ruled, w - 7, 1);
    ctx.fillStyle = '#c9dbe2';
    for (let yy = y + opt.ruled + 11; yy < y + h - 3; yy += 11) ctx.fillRect(x + 3, yy, w - 7, 1);
  }
  if (opt.grid) {
    ctx.fillStyle = '#dde7ea';
    for (let yy = y + 4; yy < y + h - 2; yy += 6) ctx.fillRect(x + 2, yy, w - 4, 1);
    for (let xx = x + 4; xx < x + w - 2; xx += 6) ctx.fillRect(xx, y + 2, 1, h - 4);
  }
}

// 付箋
function note(ctx, x, y, w, h, col, dark) {
  shadowBox(ctx, x, y, w, h, 2);
  occludeText(x, y, w + 2, h + 2);
  ctx.fillStyle = col; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = dark; ctx.fillRect(x, y, w, 6);
  // めくれた角
  for (let k = 0; k < 6; k++) {
    ctx.fillStyle = dark; ctx.fillRect(x + w - 6 + k, y + h - 1 - k, 6 - k, 1);
    ctx.clearRect && 0;
  }
  ctx.fillStyle = 'rgba(34,46,70,0.25)';
  for (let k = 0; k < 6; k++) ctx.fillRect(x + w - 6 + k + 1, y + h - k, 1, 1);
}

// ラベルテープ(浮き出し文字)
function tape(ctx, s, x, y, size, opt) {
  opt = opt || {};
  const t = textInfo(s, size, true);
  const pad = opt.pad || 6;
  const w = t.w + pad * 2, h = Math.max(t.h, size + 4) + 2;
  const cx = opt.center ? x - Math.floor(w / 2) : x;
  shadowBox(ctx, cx, y, w, h, 2);
  ctx.fillStyle = opt.col || COL.tape; ctx.fillRect(cx, y, w, h);
  ctx.fillStyle = opt.hi || COL.tapeHi; ctx.fillRect(cx, y, w, 1);
  ctx.fillStyle = opt.lo || COL.tapeLo; ctx.fillRect(cx, y + h - 1, w, 1);
  // 切り口
  ctx.clearRect(cx, y, 1, 1); ctx.clearRect(cx, y + h - 1, 1, 1); ctx.clearRect(cx + w - 1, y, 1, 1); ctx.clearRect(cx + w - 1, y + h - 1, 1, 1);
  const ty = y + Math.floor((h - t.h) / 2) + 1;
  occludeText(cx, y, w, h);
  queueText(s, size, '#16181a', true, cx + pad + 0.5, ty + 0.5);
  queueText(s, size, opt.text || COL.tapeText, true, cx + pad, ty);
  return { x: cx, y, w, h };
}

// ボタン(見出し付きのカード)
function button(ctx, id, label, x, y, w, h, opt) {
  opt = opt || {};
  const down = UI.pressed === id || opt.sel, hov = UI.hover === id;
  const oy = down ? 1 : 0;
  if (!down) shadowBox(ctx, x, y, w, h, 2);
  ctx.fillStyle = opt.disabled ? '#ddd6c6' : opt.sel ? '#e6dcc6' : hov ? '#f8f4ea' : COL.paper;
  ctx.fillRect(x, y + oy, w, h);
  ctx.fillStyle = opt.band || COL.red; ctx.fillRect(x, y + oy, 3, h);
  ctx.fillStyle = COL.paperEdge; ctx.fillRect(x, y + oy + h - 1, w, 1); ctx.fillRect(x + w - 1, y + oy, 1, h);
  if (opt.sel) { ctx.fillStyle = '#cbbfa6'; ctx.fillRect(x + 3, y + oy, w - 4, 1); ctx.fillRect(x + 3, y + oy, 1, h - 1); }
  const size = opt.size || 12;
  const t = textInfo(label, size, true);
  occludeText(x, y, w + 2, h + 2);
  queueText(label, size, opt.disabled ? '#9a9283' : COL.ink, true, Math.round(x + 2 + (w - 2 - t.w) / 2), Math.round(y + oy + (h - t.h) / 2) + 1);
  if (!opt.disabled) UI.buttons.push({ id, x, y, w, h });
}

// ドットの円(キャッシュ)
const CIRC = new Map();
function pxDisc(r, col, ring) {
  const key = r + col + (ring || 0);
  let c = CIRC.get(key);
  if (c) return c;
  const s = r * 2 + 1;
  c = makeCanvas(s, s);
  const cx = c.getContext('2d');
  cx.fillStyle = col;
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
    const d = Math.sqrt(x * x + y * y);
    if (d <= r + 0.3 && (!ring || d >= r - ring + 0.3)) cx.fillRect(x + r, y + r, 1, 1);
  }
  CIRC.set(key, c);
  return c;
}
function disc(ctx, x, y, r, col, ring) { ctx.drawImage(pxDisc(r, col, ring), Math.round(x) - r, Math.round(y) - r); }

// ---------- タイトル ----------
function drawTitle(ctx, vw, vh, st) {
  UI.buttons = [];
  const cw = Math.min(250, vw - 24), ch = 76;
  const x = Math.floor((vw - cw) / 2), y = Math.max(10, Math.floor(vh * 0.1));
  card(ctx, x, y, cw, ch, { ruled: 14 });
  txt(ctx, '机の上のおもちゃ攻防戦', x + cw / 2, y + 2, 10, COL.inkSoft, false, 'c');
  txt(ctx, 'デスクトイ・バトル', x + cw / 2 + 1, y + 24, 22, '#c9bfae', true, 'c');
  txt(ctx, 'デスクトイ・バトル', x + cw / 2, y + 23, 22, COL.ink, true, 'c');
  txt(ctx, '2対2 / 船が運び、サメが邪魔をする', x + cw / 2, y + 54, 10, COL.inkSoft, false, 'c');

  const big = UI.big;   // スマホではボタンを大きく
  const bw = big ? Math.min(220, vw - 24) : Math.min(150, vw - 40), bx = Math.floor((vw - bw) / 2);
  const bh = big ? 28 : 20;
  let by = y + ch + 16;
  const gap = Math.max(bh + 3, Math.min(big ? 34 : 26, Math.floor((vh - 6 - bh - by) / 4)));
  if (st.mode === 'join') {
    card(ctx, bx - 14, by - 6, bw + 28, big ? 114 : 98, {});
    txt(ctx, 'ルームコードを入力', vw / 2, by, 10, COL.inkSoft, false, 'c');
    const code = (st.code + '____').slice(0, 4).split('').join(' ');
    const tp = tape(ctx, code, vw / 2, by + 15, 20, { center: true, pad: 10 });
    UI.buttons.push({ id: 'codeField', x: tp.x, y: tp.y, w: tp.w, h: tp.h });
    button(ctx, 'joinGo', '参加する', bx, by + 48, bw, big ? 26 : 18, { disabled: st.code.length !== 4 });
    button(ctx, 'back', '戻る', bx + bw / 2 - (big ? 40 : 30), by + (big ? 80 : 70), big ? 80 : 60, big ? 22 : 14, { size: big ? 12 : 10, band: COL.inkSoft });
  } else if (st.mode === 'solo') {
    card(ctx, bx - 14, by - 6, bw + 28, big ? 150 : 124, {});
    txt(ctx, 'CPUの強さ', vw / 2, by, 10, COL.inkSoft, false, 'c');
    button(ctx, 'diff0', 'やさしい', bx, by + 16, bw, bh, { band: '#7f9a6a' });
    button(ctx, 'diff1', 'ふつう', bx, by + 16 + gap, bw, bh, { band: '#c9a53f' });
    button(ctx, 'diff2', 'つよい', bx, by + 16 + gap * 2, bw, bh, { band: COL.red });
    button(ctx, 'back', '戻る', bx + bw / 2 - (big ? 40 : 30), by + 22 + gap * 3, big ? 80 : 60, big ? 22 : 14, { size: big ? 12 : 10, band: COL.inkSoft });
  } else {
    button(ctx, 'solo', 'ひとりで遊ぶ', bx, by, bw, bh, { band: COL.inkSoft });
    button(ctx, 'quick', 'ランダムマッチ', bx, by + gap, bw, bh, { band: '#c9a53f' });
    button(ctx, 'create', '友達とルームを作る', bx, by + gap * 2, bw, bh, { band: COL.red });
    button(ctx, 'join', 'ルームに参加', bx, by + gap * 3, bw, bh, { band: COL.blue });
    button(ctx, 'mini', 'ミニゲーム', bx, by + gap * 4, bw, bh, { band: '#7f9a6a' });
  }
  if (st.error) {
    const w = txtW(st.error, 10) + 12;
    note(ctx, Math.floor((vw - w) / 2), vh - 34, w, 22, COL.noteY, COL.noteYDark);
    txt(ctx, st.error, vw / 2, vh - 27, 10, COL.ink, false, 'c');
  }
}

// ---------- ロビー ----------
function drawEraserPiece(ctx, x, y, team, isMe) {
  // チーム色の消しゴムの駒(簡易アイソメ)
  const top = team ? '#6d8fb3' : '#c46a5b', front = team ? '#4e6f93' : '#a3503f', side = team ? '#3d5a7a' : '#843f33';
  shadowBox(ctx, x - 9, y + 2, 20, 8, 2);
  ctx.fillStyle = front; ctx.fillRect(x - 10, y, 14, 7);
  ctx.fillStyle = side; ctx.fillRect(x + 4, y, 6, 7);
  ctx.fillStyle = top; ctx.fillRect(x - 10, y - 5, 14, 5); ctx.fillRect(x - 8, y - 6, 16, 1);
  ctx.fillStyle = team ? '#5b7ca1' : '#b45d4e'; ctx.fillRect(x + 4, y - 5, 6, 5);
  ctx.fillStyle = '#ebe6db'; ctx.fillRect(x - 10, y + 2, 14, 2);   // 紙スリーブの帯
  ctx.fillStyle = '#cfcabe'; ctx.fillRect(x + 4, y + 2, 6, 2);
  ctx.fillStyle = '#2b2622';
  ctx.fillRect(x - 11, y - 5, 1, 12); ctx.fillRect(x + 10, y - 5, 1, 12); ctx.fillRect(x - 10, y + 7, 20, 1); ctx.fillRect(x - 10, y - 6, 2, 1); ctx.fillRect(x - 8, y - 7, 18, 1);
  if (isMe) { ctx.fillStyle = '#f6f2e8'; ctx.fillRect(x - 8, y - 4, 2, 1); }
}

function drawLobby(ctx, vw, vh, room, me) {
  UI.buttons = [];
  const cw = Math.min(280, vw - 16), ch = UI.big ? 258 : 238;
  const x = Math.floor((vw - cw) / 2), y = Math.max(6, Math.floor((vh - ch) / 2) - 6);
  card(ctx, x, y, cw, ch, { ruled: 14 });
  txt(ctx, room.pub ? 'ランダムマッチ' : 'ロビー', x + 6, y + 2, 10, COL.inkSoft, true);
  if (room.pub) txt(ctx, 'あと ' + room.autoIn + ' 秒で開始', x + cw - 6, y + 2, 10, COL.red, true, 'r');
  txt(ctx, room.pub ? '友達もこのコードで入れます' : 'ルームコード', x + cw / 2, y + 16, 10, COL.inkSoft, false, 'c');
  tape(ctx, room.code.split('').join(' '), x + cw / 2, y + 33, 22, { center: true, pad: 12 });

  const colW = Math.floor((cw - 18) / 2);
  for (const t of [0, 1]) {
    const px = x + 6 + t * (colW + 6), py = y + 72;
    // チームの台紙
    ctx.fillStyle = t ? '#d8e3e8' : '#efdcd3'; ctx.fillRect(px, py, colW, 84);
    ctx.fillStyle = t ? '#b6c9d3' : '#dcc0b4'; ctx.fillRect(px, py + 83, colW, 1); ctx.fillRect(px + colW - 1, py, 1, 84);
    txt(ctx, teamName(t), px + colW / 2, py + 3, 10, teamCol(t), true, 'c');
    const mem = room.players.filter(p => p.team === t);
    for (let k = 0; k < 2; k++) {
      const sx = px + Math.floor(colW / 2), sy = py + 30 + k * 28;
      const p = mem[k];
      if (p) {
        drawEraserPiece(ctx, sx - 22, sy, t, p.id === me);
        txt(ctx, p.name + (p.id === me ? ' あなた' : ''), sx - 8, sy - 8, 10, COL.ink, p.id === me);
        if (p.id === room.host) txt(ctx, 'ホスト', sx - 8, sy + 4, 10, COL.inkSoft);
      } else {
        ctx.fillStyle = '#b9b0a0';
        for (let i = 0; i < 20; i += 2) { ctx.fillRect(sx - 32 + i, sy - 6, 1, 1); ctx.fillRect(sx - 32 + i, sy + 7, 1, 1); }
        for (let i = 0; i < 13; i += 2) { ctx.fillRect(sx - 32, sy - 6 + i, 1, 1); ctx.fillRect(sx - 12, sy - 6 + i, 1, 1); }
        txt(ctx, 'あき', sx - 8, sy - 6, 10, '#a0978a');
      }
    }
    UI.buttons.push({ id: 'team' + t, x: px, y: py, w: colW, h: 84 });
  }
  const isHost = room.host === me;
  const by = y + ch - (UI.big ? 46 : 38);
  if (isHost) {
    button(ctx, 'start', '開始する', x + 10, by, cw - 90, UI.big ? 28 : 20, { band: COL.red });
    txt(ctx, '足りない分はボット', x + 10 + (cw - 90) / 2, by + (UI.big ? 29 : 21), 10, COL.inkSoft, false, 'c');
  } else {
    txt(ctx, 'ホストの開始を待っています', x + 10 + (cw - 90) / 2, by + 4, 10, COL.inkSoft, false, 'c');
  }
  button(ctx, 'leave', '退出', x + cw - 72, by, 62, UI.big ? 28 : 20, { band: COL.inkSoft, size: UI.big ? 12 : 10 });
  txt(ctx, 'チームの台紙を押すと移動', x + cw / 2, y + 158, 10, COL.inkSoft, false, 'c');
  // CPUの強さ(ホストが選ぶ)
  const dy = y + 176, dh = UI.big ? 26 : 18, dl = 58, dw = Math.floor((cw - 20 - dl - 8) / 3);
  txt(ctx, 'CPUの強さ', x + 10, dy + Math.floor((dh - 12) / 2), 10, COL.inkSoft, true);
  ['やさしい', 'ふつう', 'つよい'].forEach((name, i) => {
    const sel = room.diff === i;
    if (isHost) button(ctx, 'diff' + i, name, x + 10 + dl + i * (dw + 4), dy, dw, dh, { sel, size: 10, band: sel ? COL.ink : COL.inkSoft });
    else if (sel) txt(ctx, name, x + 10 + dl, dy + Math.floor((dh - 12) / 2), 10, COL.ink, true);
  });
}

// ---------- 試合中のHUD ----------
function drawTimer(ctx, x, y, secs, round) {
  const w = 62, h = 28;
  shadowBox(ctx, x, y, w, h, 2);
  ctx.fillStyle = '#e8e2d4'; ctx.fillRect(x + 1, y, w - 2, h); ctx.fillRect(x, y + 1, w, h - 2);
  ctx.fillStyle = '#c9c1af'; ctx.fillRect(x + 1, y + h - 3, w - 2, 3);
  ctx.fillStyle = '#f6f2e8'; ctx.fillRect(x + 2, y + 1, w - 4, 1);
  ctx.fillStyle = '#5c574d'; ctx.fillRect(x + 1, y + h, w - 2, 1);
  // ボタン
  ctx.fillStyle = '#b8b0a0'; ctx.fillRect(x + 10, y - 3, 8, 3); ctx.fillRect(x + w - 18, y - 3, 8, 3);
  ctx.fillStyle = '#d7d0c0'; ctx.fillRect(x + 10, y - 3, 8, 1); ctx.fillRect(x + w - 18, y - 3, 8, 1);
  // 液晶(つや消しの灰緑)
  const lx = x + 5, ly = y + 4, lw = w - 10, lh = 17;
  ctx.fillStyle = '#8b937e'; ctx.fillRect(lx - 1, ly - 1, lw + 2, lh + 2);
  ctx.fillStyle = '#aab39c'; ctx.fillRect(lx, ly, lw, lh);
  ctx.fillStyle = '#9ea790'; ctx.fillRect(lx, ly, lw, 1); ctx.fillRect(lx, ly, 1, lh);
  const s = Math.max(0, Math.ceil(secs));
  const str = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  const ink = s <= 10 && Math.floor(performance.now() / 400) % 2 ? '#6b2f2a' : '#2f352b';
  let cx = lx + Math.floor((lw - (str.length * 8 - 2)) / 2);
  for (const ch of str) {
    if (ch === ':') { ctx.fillStyle = ink; ctx.fillRect(cx + 1, ly + 5, 2, 2); ctx.fillRect(cx + 1, ly + 10, 2, 2); cx += 5; continue; }
    // 液晶の消えたセグメントもうっすら
    drawDigit(ctx, '8', cx, ly + 3, 2, '#a0a991');
    drawDigit(ctx, ch, cx, ly + 3, 2, ink);
    cx += 8;
  }
}
function drawDigit(ctx, ch, x, y, s, col) {
  const g = DIGITS3x5[ch];
  if (!g) return;
  ctx.fillStyle = col;
  for (let i = 0; i < 15; i++) if (g[i] === '1') ctx.fillRect(x + (i % 3) * s, y + Math.floor(i / 3) * s, s, s);
}

function drawScoreNote(ctx, x, y, team, score, role, isMine) {
  const w = 88, h = 50;
  note(ctx, x, y, w, h, team ? COL.noteB : COL.noteR, team ? COL.noteBDark : COL.noteRDark);
  txt(ctx, teamName(team), x + 4, y + 7, 10, teamCol(team), true);
  txt(ctx, score, x + 6, y + 20, 20, COL.ink, true);
  // 役割の小さな絵
  const spr = role === 'b' ? SPR.boat(team, 4, 0, 0) : SPR.shark(team, 4, 1, 0, 0);
  ctx.drawImage(spr.c, x + w - 20 - spr.ax, y + 27 - spr.ay);
  txt(ctx, role === 'b' ? '運ぶ' : '邪魔', x + w - 20, y + 35, 10, COL.inkSoft, false, 'c');
  if (isMine) tape(ctx, 'あなた', x + 30, y + h + 3, 10, { center: true, pad: 4 });
}

function skillButton(ctx, id, x, y, r, label, key, cd, cdMax, active, team, showKey) {
  const down = UI.pressed === id;
  const oy = down ? 1 : 0;
  disc(ctx, x + 2, y + 2, r, COL.shadow);
  occludeText(x - r, y - r, r * 2 + 2, r * 2 + 2);
  disc(ctx, x, y + oy, r, '#3a342d');
  disc(ctx, x, y + oy, r - 1, active ? (team ? '#c7d6e2' : '#ead0c6') : '#efe8d8');
  disc(ctx, x, y + oy, r - 3, team ? COL.blueSoft : COL.redSoft, 1);
  if (cd > 0) {
    // 残りの割合だけ、ドットの網で暗くする
    const frac = cd / cdMax;
    ctx.fillStyle = 'rgba(58,52,45,0.55)';
    for (let yy = -r + 1; yy < r; yy++) for (let xx = -r + 1; xx < r; xx++) {
      if (xx * xx + yy * yy > (r - 1) * (r - 1) || (xx + yy) & 1) continue;
      let a = Math.atan2(xx, -yy) / (Math.PI * 2); if (a < 0) a += 1;
      if (a < frac) ctx.fillRect(x + xx, y + yy + oy, 1, 1);
    }
  }
  const t = txt(ctx, label, x, y + oy - 8, 9, COL.ink, true, 'c');
  if (cd > 0) txt(ctx, Math.ceil(cd), x, y + oy + 3, 10, '#2b2622', true, 'c');
  if (showKey) txt(ctx, key, x, y + r + 2, 10, '#efe8d8', true, 'c');
  UI.buttons.push({ id, x: x - r, y: y - r, w: r * 2, h: r * 2, skill: true });
}

function drawStick(ctx, x, y, kx, ky) {
  // マスキングテープの輪と、ゴムのつまみ
  occludeText(x - 26, y - 26, 54, 54);
  disc(ctx, x + 2, y + 2, 24, COL.shadow, 9);
  disc(ctx, x, y, 24, '#8c7c58', 1);
  disc(ctx, x, y, 23, '#d8c79c', 8);
  disc(ctx, x, y, 23, '#e6d8b2', 2);
  disc(ctx, x, y, 15, '#a8976f', 1);
  disc(ctx, x + kx + 1, y + ky + 2, 10, COL.shadow);
  disc(ctx, x + kx, y + ky, 10, '#5a2c26');
  disc(ctx, x + kx, y + ky, 10, '#b0584a');
  disc(ctx, x + kx - 1, y + ky - 1, 6, '#bf6a5b');
  ctx.fillStyle = '#d9907f'; ctx.fillRect(Math.round(x + kx - 4), Math.round(y + ky - 5), 2, 1);
}

function centerCard(ctx, vw, vh, lines, opt) {
  opt = opt || {};
  let w = 0, h = 10;
  for (const l of lines) { w = Math.max(w, txtW(l[0], l[1], l[3]) + 24); h += l[1] + 6; }
  w = Math.max(w, opt.minW || 120);
  w = Math.min(w, vw - 12);
  const x = Math.floor((vw - w) / 2), y = Math.floor((vh - h) / 2) - (opt.up || 0);
  card(ctx, x, y, w, h, { ruled: 0 });
  let yy = y + 6;
  for (const l of lines) { txt(ctx, l[0], vw / 2, yy, l[1], l[2] || COL.ink, l[3], 'c'); yy += l[1] + 6; }
}

function roundSummaryLines(r) {
  const c = r.carrier, d = 1 - c;
  const head = r.outcome === 'draw' ? '引き分け' : r.outcome === 'carrier' ? teamName(c) + '(船)が運び切った' : teamName(d) + '(サメ)が守り切った';
  return [
    ['ラウンド ' + (r.round + 1) + ' 終了', 10, COL.inkSoft, false],
    [head, 14, COL.ink, true],
    ['運んだ ' + r.delivered + '個  落とした ' + r.dropped + '個', 10, COL.inkSoft, false],
    [teamName(0) + ' +' + r.pts[0] + '   ' + teamName(1) + ' +' + r.pts[1], 12, COL.ink, true],
  ];
}

// ---------- 結果 ----------
function drawResult(ctx, vw, vh, res, isHost, room) {
  UI.buttons = [];
  const cw = Math.min(300, vw - 12), ch = 196;
  const x = Math.floor((vw - cw) / 2), y = Math.max(4, Math.floor((vh - ch) / 2));
  card(ctx, x, y, cw, ch, { grid: true });
  txt(ctx, '試合結果', x + cw / 2, y + 5, 14, COL.ink, true, 'c');
  const cols = [0.08, 0.2, 0.36, 0.52, 0.76, 0.9].map(f => x + Math.round(cw * f));
  const heads = ['R', '船', '運んだ', '落とした', '赤', '青'];
  let ty = y + 26;
  heads.forEach((hd, i) => txt(ctx, hd, cols[i], ty, 10, i === 4 ? COL.red : i === 5 ? COL.blue : COL.inkSoft, true, 'c'));
  ctx.fillStyle = COL.ink; ctx.fillRect(x + 6, ty + 13, cw - 12, 1);
  ty += 17;
  const tot = [0, 0];
  for (const r of res) {
    tot[0] += r.pts[0]; tot[1] += r.pts[1];
    txt(ctx, r.round + 1, cols[0], ty, 10, COL.ink, false, 'c');
    txt(ctx, r.carrier ? '青' : '赤', cols[1], ty, 10, teamCol(r.carrier), true, 'c');
    txt(ctx, r.delivered + '/' + CONFIG.BLOCKS, cols[2], ty, 10, COL.ink, false, 'c');
    txt(ctx, r.dropped, cols[3], ty, 10, COL.ink, false, 'c');
    txt(ctx, r.pts[0], cols[4], ty, 10, COL.ink, true, 'c');
    txt(ctx, r.pts[1], cols[5], ty, 10, COL.ink, true, 'c');
    // 内訳
    const b = r.bonus || {};
    const parts = [];
    if (r.outcome === 'draw') parts.push('引き分け 各' + CONFIG.SCORE.drawPoints);
    if (b.all) parts.push('全部運んだ+' + b.all);
    if (b.time) parts.push('残り時間+' + b.time);
    if (b.def) parts.push('守り切り+' + b.def);
    if (parts.length) txt(ctx, parts.join(' '), cols[2] - 14, ty + 12, 10, COL.inkSoft);
    ty += 25;
  }
  ctx.fillStyle = COL.ink; ctx.fillRect(x + 6, ty - 2, cw - 12, 1); ctx.fillRect(x + 6, ty, cw - 12, 1);
  txt(ctx, '合計', cols[2], ty + 3, 12, COL.ink, true, 'c');
  txt(ctx, tot[0], cols[4], ty + 2, 14, COL.red, true, 'c');
  txt(ctx, tot[1], cols[5], ty + 2, 14, COL.blue, true, 'c');
  // ゴム印
  const win = tot[0] === tot[1] ? -1 : tot[0] > tot[1] ? 0 : 1;
  const label = win < 0 ? '引き分け' : teamName(win) + 'の勝ち';
  const sw = txtW(label, 14, true) + 16, sx = x + 10, sy = y + ch - 30;
  const ink = win === 1 ? '#4f6f96' : '#a8483c';
  ctx.fillStyle = ink;
  ctx.fillRect(sx, sy, sw, 1); ctx.fillRect(sx, sy + 21, sw, 1); ctx.fillRect(sx, sy, 1, 22); ctx.fillRect(sx + sw - 1, sy, 1, 22);
  ctx.fillRect(sx + 2, sy + 2, sw - 4, 1); ctx.fillRect(sx + 2, sy + 19, sw - 4, 1); ctx.fillRect(sx + 2, sy + 2, 1, 18); ctx.fillRect(sx + sw - 3, sy + 2, 1, 18);
  txt(ctx, label, sx + sw / 2, sy + 4, 14, ink, true, 'c');
  // かすれ
  ctx.fillStyle = COL.paper;
  for (let k = 0; k < 14; k++) ctx.fillRect(sx + Math.floor(hash2(k, 3) * sw), sy + Math.floor(hash2(k, 9) * 22), 1, 1);
  const bx = x + cw - 104;
  const rh = UI.big ? 26 : 20, rs = UI.big ? 12 : 10;
  if (room && room.solo) button(ctx, 'soloAgain', 'もう一度', bx, sy - (rh - 20), 94, rh, { band: COL.red, size: rs });
  else if (isHost) button(ctx, 'toLobby', 'ロビーに戻る', bx, sy - (rh - 20), 94, rh, { band: COL.red, size: rs });
  else txt(ctx, 'ホストを待っています', bx + 47, sy + 5, 10, COL.inkSoft, false, 'c');
  button(ctx, 'leave', 'タイトルへ', x + cw - (UI.big ? 74 : 64), y + 4, UI.big ? 68 : 58, UI.big ? 20 : 15, { band: COL.inkSoft, size: 10 });
}
