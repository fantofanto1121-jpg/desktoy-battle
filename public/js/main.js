// 画面遷移、入力、通信、補間
'use strict';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const textCanvas = document.getElementById('text');
const tctx = textCanvas.getContext('2d');
const codeInput = document.getElementById('code');

const G = {
  screen: 'title',          // title / lobby / game
  title: { mode: 'menu', code: '', error: '' },
  room: null, me: 0,
  snaps: [], offset: null, last: null,
  vw: 480, vh: 270, scale: 1,
  cam: { x: 0, y: 0, init: false },
  touch: !!(window.matchMedia && matchMedia('(pointer: coarse)').matches),
  keys: new Set(),
  stick: { id: null, ox: 0, oy: 0, kx: 0, ky: 0 },
  press: { a: 0, b: 0 },
  sendT: 0, lastSent: '',
  myDisp: null,
  demo: null,
  lastPh: null,
};

// ---------- 画面サイズ(整数倍で拡大) ----------
function resize() {
  const dpr = window.devicePixelRatio || 1;
  const W = Math.round(window.innerWidth * dpr), H = Math.round(window.innerHeight * dpr);
  const portrait = H > W * 1.1;
  const scale = portrait ? Math.max(1, Math.round(W / 300)) : Math.max(1, Math.round(Math.min(W / 480, H / 270)));
  G.scale = scale;
  G.vw = Math.ceil(W / scale); G.vh = Math.ceil(H / scale);
  canvas.width = G.vw; canvas.height = G.vh;
  canvas.style.width = (G.vw * scale / dpr) + 'px';
  canvas.style.height = (G.vh * scale / dpr) + 'px';
  ctx.imageSmoothingEnabled = false;
  textCanvas.width = G.vw * scale; textCanvas.height = G.vh * scale;
  textCanvas.style.width = canvas.style.width; textCanvas.style.height = canvas.style.height;
  bakeVignette(G.vw, G.vh);
}
window.addEventListener('resize', resize);

// ---------- 通信 ----------
let ws = null;
function connect(then) {
  if (ws && ws.readyState === 1) { then(); return; }
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  ws.onopen = then;
  ws.onmessage = ev => onMsg(JSON.parse(ev.data));
  ws.onclose = () => {
    if (G.screen !== 'title') { G.screen = 'title'; G.title.mode = 'menu'; G.title.error = '接続が切れました'; }
    ws = null;
  };
}
function send(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }

function onMsg(m) {
  if (m.t === 'err') { G.title.error = m.msg; return; }
  if (m.t === 'room') {
    G.room = m; G.me = m.you;
    if (m.phase === 'lobby') { G.screen = 'lobby'; G.snaps = []; G.offset = null; G.last = null; }
    else G.screen = 'game';
    G.title.error = '';
    return;
  }
  if (m.t === 's') {
    if (G.screen !== 'game') G.screen = 'game';
    const now = performance.now();
    const est = m.tm - now;
    if (G.offset === null || m.r !== (G.last && G.last.r) && m.ph === 'count' && G.offset - est > 500) G.offset = est;
    else G.offset += (est - G.offset) * 0.08;
    if (est > G.offset) G.offset += (est - G.offset) * 0.3;
    G.snaps.push(m);
    if (G.snaps.length > 40) G.snaps.shift();
    G.last = m;
    handleEvents(m);
  }
}

function handleEvents(m) {
  for (const ev of m.ev) {
    const e = m.e.find(q => q.i === ev[1]);
    switch (ev[0]) {
      case 'pick': AUDIO.play('pick'); break;
      case 'drop': AUDIO.play('drop'); break;
      case 'deliver': setTimeout(() => AUDIO.play('deliver'), 260); break;
      case 'charge': AUDIO.play('charge'); break;
      case 'bite': {
        AUDIO.play('bite');
        const b = m.e.find(q => q.i === ev[2]);
        if (b) splash(b.x, b.y, 8);
        break;
      }
      case 'end': AUDIO.play('end'); break;
    }
  }
}

// ---------- 補間 ----------
function lerpAng(a, b, t) { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * t; }

function interpState(now) {
  const S = G.snaps;
  if (!S.length) return null;
  const rt = now + G.offset - CONFIG.INTERP_DELAY;
  let a = S[0], b = S[S.length - 1];
  for (let k = S.length - 1; k > 0; k--) {
    if (S[k - 1].tm <= rt) { a = S[k - 1]; b = S[k]; break; }
  }
  const t = b.tm > a.tm ? Math.max(0, Math.min(1, (rt - a.tm) / (b.tm - a.tm))) : 1;
  const ents = b.e.map(eb => {
    const ea = a.e.find(q => q.i === eb.i) || eb;
    return { ...eb, x: ea.x + (eb.x - ea.x) * t, y: ea.y + (eb.y - ea.y) * t, d: lerpAng(ea.d, eb.d, t), load: 0 };
  });
  // 自分は最新の状態を速度で少し先読みし、なめらかに追従させる
  const L = G.last, mine = L.e.find(q => q.i === G.me);
  if (mine) {
    const ahead = Math.min(0.12, Math.max(0, (now + G.offset - L.tm) / 1000));
    const tx = mine.x + mine.vx * ahead, ty = mine.y + mine.vy * ahead;
    if (!G.myDisp || Math.hypot(G.myDisp.x - tx, G.myDisp.y - ty) > 2) G.myDisp = { x: tx, y: ty, d: mine.d };
    G.myDisp.x += (tx - G.myDisp.x) * 0.35; G.myDisp.y += (ty - G.myDisp.y) * 0.35;
    G.myDisp.d = lerpAng(G.myDisp.d, mine.d, 0.4);
    const me = ents.find(q => q.i === G.me);
    if (me) { me.x = G.myDisp.x; me.y = G.myDisp.y; me.d = G.myDisp.d; me.f = mine.f; }
  }
  const blocks = b.b;
  for (const bl of blocks) if (bl[0] === 1) { const e = ents.find(q => q.i === bl[3]); if (e) e.load++; }
  return { ents, blocks, tm: rt, snap: b };
}

// ---------- 入力 ----------
function screenToWorldDir(sx, sy) {
  const wx = sx / (2 * ISO.X) + sy / (2 * ISO.Y), wy = sy / (2 * ISO.Y) - sx / (2 * ISO.X), l = Math.hypot(wx, wy);
  const m = Math.min(1, Math.hypot(sx, sy));
  return l > 0 ? [wx / l * m, wy / l * m] : [0, 0];
}

function currentInput() {
  let sx = 0, sy = 0;
  const k = G.keys;
  if (k.has('KeyA') || k.has('ArrowLeft')) sx -= 1;
  if (k.has('KeyD') || k.has('ArrowRight')) sx += 1;
  if (k.has('KeyW') || k.has('ArrowUp')) sy -= 1;
  if (k.has('KeyS') || k.has('ArrowDown')) sy += 1;
  if (sx || sy) { const l = Math.hypot(sx, sy); sx /= l; sy /= l; }
  if (G.stick.id !== null) { sx = G.stick.kx / 16; sy = G.stick.ky / 16; }
  const [mx, my] = screenToWorldDir(sx, sy);
  return { t: 'in', mx: +mx.toFixed(3), my: +my.toFixed(3), a: G.press.a, b: G.press.b };
}

function skill(which) {
  AUDIO.init();
  G.press[which] = (G.press[which] + 1) % 1000;
  sendInput(true);
}

function sendInput(force) {
  if (G.screen !== 'game') return;
  const inp = currentInput(), s = JSON.stringify(inp);
  if (force || s !== G.lastSent || performance.now() - G.sendT > 250) { send(inp); G.lastSent = s; G.sendT = performance.now(); }
}

window.addEventListener('keydown', e => {
  AUDIO.init();
  if (document.activeElement === codeInput) {
    if (e.key === 'Enter' && G.title.code.length === 4) doJoin();
    return;
  }
  if (G.screen === 'title' && G.title.mode === 'join') {
    if (/^Key[A-Z]$/.test(e.code) && G.title.code.length < 4) { G.title.code += e.code.slice(3); codeInput.value = G.title.code; }
    else if (e.key === 'Backspace') { G.title.code = G.title.code.slice(0, -1); codeInput.value = G.title.code; }
    else if (e.key === 'Enter' && G.title.code.length === 4) doJoin();
    return;
  }
  if (e.repeat) { e.preventDefault(); return; }
  G.keys.add(e.code);
  if (G.screen === 'game') {
    if (e.code === 'Space') skill('a');
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') skill('b');
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  }
});
window.addEventListener('keyup', e => G.keys.delete(e.code));
window.addEventListener('blur', () => G.keys.clear());

codeInput.addEventListener('input', () => {
  G.title.code = codeInput.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  codeInput.value = G.title.code;
});

function toLogical(e) {
  const r = canvas.getBoundingClientRect();
  return [(e.clientX - r.left) / r.width * G.vw, (e.clientY - r.top) / r.height * G.vh];
}
function hitButton(x, y) {
  for (let k = UI.buttons.length - 1; k >= 0; k--) {
    const b = UI.buttons[k];
    if (x >= b.x && y >= b.y && x < b.x + b.w && y < b.y + b.h) return b;
  }
  return null;
}

canvas.addEventListener('pointerdown', e => {
  AUDIO.init();
  if (e.pointerType === 'touch') G.touch = true;
  const [x, y] = toLogical(e);
  const b = hitButton(x, y);
  if (G.screen === 'game') {
    if (b && b.skill) { UI.pressed = b.id; skill(b.id === 'skA' ? 'a' : 'b'); return; }
    if (b) { UI.pressed = b.id; return; }
    // 画面のどこを触っても、その場所にスティックを出す
    if (G.touch && G.stick.id === null) {
      G.stick.id = e.pointerId; G.stick.kx = 0; G.stick.ky = 0;
      G.stick.ox = Math.max(26, Math.min(G.vw - 26, x)); G.stick.oy = Math.max(26, Math.min(G.vh - 26, y));
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* 合成イベントなど */ }
      moveStick(x, y);
    }
    return;
  }
  if (b) UI.pressed = b.id;
});
canvas.addEventListener('pointermove', e => {
  const [x, y] = toLogical(e);
  if (e.pointerId === G.stick.id) { moveStick(x, y); return; }
  const b = hitButton(x, y);
  UI.hover = b ? b.id : null;
});
function endPointer(e) {
  if (e.pointerId === G.stick.id) { G.stick.id = null; G.stick.kx = 0; G.stick.ky = 0; sendInput(true); return; }
  const [x, y] = toLogical(e);
  const b = hitButton(x, y);
  const was = UI.pressed;
  UI.pressed = null;
  if (b && b.id === was && !b.skill) onButton(b.id);
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

function stickCenter() { return G.stick.id !== null ? [G.stick.ox, G.stick.oy] : [34, G.vh - 36]; }
function moveStick(x, y) {
  const [cx, cy] = stickCenter();
  let dx = x - cx, dy = y - cy;
  const l = Math.hypot(dx, dy), max = 16;
  // 指が大きく離れたら、スティックの土台ごと指についていく
  if (l > max * 1.6) { G.stick.ox += dx / l * (l - max * 1.6); G.stick.oy += dy / l * (l - max * 1.6); }
  if (l > max) { dx = dx / l * max; dy = dy / l * max; }
  G.stick.kx = dx; G.stick.ky = dy;
  sendInput();
}

function doJoin() {
  const code = G.title.code;
  codeInput.blur();
  connect(() => send({ t: 'join', code }));
}

function onButton(id) {
  switch (id) {
    case 'create': connect(() => send({ t: 'create' })); break;
    case 'quick': connect(() => send({ t: 'quick' })); break;
    case 'solo': G.snaps = []; G.offset = null; G.last = null; connect(() => send({ t: 'solo' })); break;
    case 'join': G.title.mode = 'join'; G.title.code = ''; codeInput.value = ''; G.title.error = ''; if (!G.touch) codeInput.focus(); break;
    case 'codeField': codeInput.focus(); break;
    case 'joinGo': doJoin(); break;
    case 'back': G.title.mode = 'menu'; codeInput.blur(); break;
    case 'team0': send({ t: 'team', team: 0 }); break;
    case 'team1': send({ t: 'team', team: 1 }); break;
    case 'start': send({ t: 'start' }); break;
    case 'leave':
      send({ t: 'leave' }); G.screen = 'title'; G.title.mode = 'menu'; G.room = null;
      if (ws) ws.close();
      break;
    case 'toLobby': send({ t: 'lobby' }); break;
  }
}

// ---------- タイトル画面の飾り(机の上でおもちゃが動く) ----------
function demoState(now) {
  const t = now / 1000;
  const bx = 7 + Math.cos(t * 0.35) * 4.5, by = 15 + Math.sin(t * 0.35) * 6;
  const sx = 9 + Math.cos(t * 0.35 - 0.9) * 4.5, sy = 13 + Math.sin(t * 0.35 - 0.9) * 6;
  const bd = Math.atan2(Math.cos(t * 0.35) * 6, -Math.sin(t * 0.35) * 4.5);
  const sd = Math.atan2(Math.cos(t * 0.35 - 0.9) * 6, -Math.sin(t * 0.35 - 0.9) * 4.5);
  const ents = [
    { i: -1, tm: 0, ro: 'b', x: bx, y: by, d: bd, f: 0, load: 2 },
    { i: -2, tm: 1, ro: 's', x: sx, y: sy, d: sd, f: 0, load: 0 },
  ];
  const P = CONFIG.PILE, blocks = [];
  for (let k = 0; k < 8; k++) blocks.push([0, P.x + (k % 4) * P.gap, P.y + Math.floor(k / 4) * P.gap, 0, 0, 0, 0, (k * 7 + 3) % 5, 0]);
  blocks.push([1, 0, 0, -1, -9999, 0, 0, 1, 0], [1, 0, 0, -1, -9999, 0, 0, 3, 1]);
  for (let k = 0; k < 3; k++) blocks.push([3, 0, 0, k, -9999, 0, 0, (k * 3 + 1) % 5, 0]);
  return { ents, blocks, tm: now, me: 0, myTeam: -1, delivered: 3, now };
}

// ---------- カメラ ----------
function updateCamera(focus, dt) {
  const R0 = MAT_RIM;
  const left = toSX(-R0, CONFIG.MAP.H + R0), right = toSX(CONFIG.MAP.W + R0, -R0);
  const top = toSY(-R0, -R0), bottom = toSY(CONFIG.MAP.W + R0, CONFIG.MAP.H + R0) + 4;
  const mw = right - left, mh = bottom - top;
  let tx, ty;
  const topUI = 44;
  if (G.vw >= mw + 16) tx = left + mw / 2 - G.vw / 2;
  else { tx = (focus ? focus[0] : left + mw / 2) - G.vw / 2; tx = Math.max(left - 12, Math.min(right + 12 - G.vw, tx)); }
  if (G.vh >= mh + topUI + 10) ty = top + mh / 2 - (G.vh + topUI * 0.6) / 2;
  else if (G.vw > G.vh && G.vh >= mh - 10) ty = top + mh / 2 - (G.vh + 22) / 2;
  else { ty = (focus ? focus[1] : top + mh / 2) - (G.vh + topUI * 0.5) / 2; ty = Math.max(top - topUI - 6, Math.min(bottom + 40 - G.vh, ty)); }
  if (!G.cam.init) { G.cam.x = tx; G.cam.y = ty; G.cam.init = true; }
  const k = Math.min(1, dt * 6);
  G.cam.x += (tx - G.cam.x) * k; G.cam.y += (ty - G.cam.y) * k;
  return { x: Math.round(G.cam.x), y: Math.round(G.cam.y) };
}

// ---------- メインループ ----------
let lastT = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  const vw = G.vw, vh = G.vh;
  ctx.imageSmoothingEnabled = false;
  UI.big = G.touch;

  if (G.screen === 'game' && G.last) {
    sendInput();
    const st = interpState(now);
    const L = G.last;
    const meE = st.ents.find(e => e.i === G.me);
    const myTeam = meE ? meE.tm : (G.room ? (G.room.players.find(p => p.id === G.me) || {}).team : 0);
    updateFx(dt, st.ents);
    const cam = updateCamera(meE ? [toSX(meE.x, meE.y), toSY(meE.x, meE.y)] : null, dt);
    drawWorld(ctx, cam, vw, vh, { ents: st.ents, blocks: st.blocks, tm: st.tm, me: G.me, myTeam, delivered: L.del, now });
    ctx.drawImage(R.vignette, 0, 0);
    drawHUD(st, L, myTeam, meE);
  } else {
    const st = demoState(now);
    updateFx(dt, st.ents);
    const cam = updateCamera(null, dt);
    drawWorld(ctx, cam, vw, vh, st);
    ctx.drawImage(R.vignette, 0, 0);
    if (G.screen === 'lobby' && G.room) drawLobby(ctx, vw, vh, G.room, G.me);
    else drawTitle(ctx, vw, vh, G.title);
  }
  flushText(tctx, G.scale);
  requestAnimationFrame(frame);
}

function drawHUD(st, L, myTeam, meE) {
  const vw = G.vw, vh = G.vh;
  UI.buttons = [];
  const res = L.res || [];
  const tot = [0, 0];
  for (const r of res) { tot[0] += r.pts[0]; tot[1] += r.pts[1]; }
  if (L.ph === 'end') {
    drawResult(ctx, vw, vh, res, G.room && G.room.host === G.me, G.room);
    return;
  }
  const roleOf = t => t === L.cr ? 'b' : 's';
  drawScoreNote(ctx, 6, 6, 0, tot[0], roleOf(0), myTeam === 0);
  drawScoreNote(ctx, vw - 94, 6, 1, tot[1], roleOf(1), myTeam === 1);
  const tx = Math.floor(vw / 2 - 31);
  drawTimer(ctx, tx, 8, L.ph === 'count' ? CONFIG.ROUND_TIME : L.tl, L.r);
  tape(ctx, 'ラウンド ' + (L.r + 1) + '/' + CONFIG.ROUNDS, vw / 2, 40, 9, { center: true, pad: 5 });

  // スキルボタン
  if (meE) {
    const isBoat = meE.ro === 'b', C = isBoat ? CONFIG.BOAT : CONFIG.SHARK;
    const mine = L.e.find(q => q.i === G.me) || { c1: 0, c2: 0, f: 0 };
    const showKey = !G.touch;
    const big = G.touch;   // スマホでは押しやすいように大きく
    const ry = vh - (showKey ? 38 : big ? 40 : 30);
    skillButton(ctx, 'skA', vw - (big ? 40 : 30), ry, big ? 31 : 21, isBoat ? 'ダッシュ' : '突進', 'Space', mine.c1, isBoat ? C.dashCd : C.chargeCd, isBoat ? mine.f & 1 : mine.f & 12, meE.tm, showKey);
    skillButton(ctx, 'skB', vw - (big ? 108 : 78), ry + (big ? 10 : 8), big ? 25 : 17, isBoat ? '保護' : '潜行', 'Shift', mine.c2, isBoat ? C.protectCd : C.diveCd, isBoat ? mine.f & 2 : mine.f & 16, meE.tm, showKey);
    if (G.touch) {
      const [cx, cy] = stickCenter();
      if (G.stick.id === null) ctx.globalAlpha = 0.45;   // 触っていないときは置き場所の目安だけ薄く
      drawStick(ctx, cx, cy, G.stick.kx, G.stick.ky);
      ctx.globalAlpha = 1;
    }
    else txt(ctx, 'WASD / 矢印で移動', 8, vh - 16, 9, '#efe8d8', true);
  }

  // 中央のカード
  if (L.ph === 'count') {
    const n = Math.ceil(L.tl);
    const role = meE ? (meE.ro === 'b' ? '船: 積み荷を港へ運ぶ' : 'サメ: 船にぶつかって落とさせる') : '';
    centerCard(ctx, vw, vh, [['ラウンド ' + (L.r + 1), 10, COL.inkSoft, false], [String(n), 22, COL.ink, true], [role, 10, meE ? teamCol(meE.tm) : COL.ink, true]], { minW: 150, up: 10 });
  } else if (L.ph === 'play' && CONFIG.ROUND_TIME - L.tl < 0.8) {
    centerCard(ctx, vw, vh, [['スタート', 16, COL.ink, true]], { up: 10 });
  } else if (L.ph === 'inter' && res.length) {
    centerCard(ctx, vw, vh, roundSummaryLines(res[res.length - 1]), { minW: 180, up: 6 });
  }
}

// ---------- 起動 ----------
resize();
renderInit();
requestAnimationFrame(frame);
