// デスクトイ・バトル サーバー
// 静的ファイル配信、WebSocket、ルーム管理、ゲームループ(サーバー権威)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const C = require('./shared/config.js');

const PORT = process.env.PORT || 3000;
const SIM_SPEED = +process.env.SIM_SPEED || 1; // 試験用の早回し
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

// ---------- ご意見(フィードバック) ----------
// 環境変数 GITHUB_TOKEN があれば GitHub の Issue にする。なければサーバーのログにだけ残す。
const https = require('https');
const FB_REPO = process.env.FEEDBACK_REPO || 'fantofanto1121-jpg/desktoy-battle';
const fbLast = new Map();   // IPごとの最後の送信時刻(連投よけ)
function fbIssue(text, where) {
  const body = JSON.stringify({
    title: 'ご意見: ' + text.replace(/\s+/g, ' ').slice(0, 40),
    body: text + '\n\n---\n画面: ' + where + '\n送信: ' + new Date().toISOString(),
    labels: ['feedback'],
  });
  const req = https.request({
    host: 'api.github.com', path: '/repos/' + FB_REPO + '/issues', method: 'POST',
    headers: { 'Authorization': 'Bearer ' + process.env.GITHUB_TOKEN, 'User-Agent': 'desktoy-battle', 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  }, r => { r.resume(); if (r.statusCode >= 300) console.log('[feedback] GitHub への送信に失敗', r.statusCode); });
  req.on('error', e => console.log('[feedback] GitHub への送信に失敗', e.message));
  req.end(body);
}
function feedback(req, res) {
  let raw = '';
  req.on('data', d => { raw += d; if (raw.length > 8000) req.destroy(); });
  req.on('end', () => {
    let m = {};
    try { m = JSON.parse(raw); } catch (e) {}
    const text = String(m.text || '').trim().slice(0, 1000), where = String(m.where || '').slice(0, 40);
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress).split(',')[0];
    const now = Date.now();
    if (!text) { res.writeHead(400); res.end('{}'); return; }
    if (now - (fbLast.get(ip) || 0) < 15000) { res.writeHead(429); res.end('{}'); return; }
    fbLast.set(ip, now);
    console.log('[feedback]', where, JSON.stringify(text));
    if (process.env.GITHUB_TOKEN) fbIssue(text, where);
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}');
  });
}

// ---------- 静的ファイル ----------
const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/feedback') { feedback(req, res); return; }
  let u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/') u = '/index.html';
  const base = u.startsWith('/shared/') ? path.join(ROOT, 'shared') : path.join(ROOT, 'public');
  const file = path.join(base, u.startsWith('/shared/') ? u.slice(7) : u);
  if (!file.startsWith(base)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

// ---------- ルーム ----------
const wss = new WebSocketServer({ server });
const rooms = new Map();
let nextId = 1;

function send(ws, o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }

function makeCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let c;
  do { c = ''; for (let i = 0; i < 4; i++) c += A[Math.random() * A.length | 0]; } while (rooms.has(c) || mrooms.has(c));
  return c;
}

function teamCount(room, t) { return room.players.filter(p => p.team === t).length; }

function addPlayer(room, conn, bot) {
  const used = new Set(room.players.map(p => p.num));
  let num = 1; while (used.has(num)) num++;
  const team = teamCount(room, 0) <= teamCount(room, 1) ? 0 : 1;
  const p = {
    id: conn ? conn.id : nextId++, num, name: bot ? 'BOT' : 'P' + num, team, bot: !!bot,
    ws: conn ? conn.ws : null, input: { mx: 0, my: 0, a: 0, b: 0 }, seen: { a: 0, b: 0 }, ai: {},
  };
  room.players.push(p);
  if (conn) conn.room = room;
  return p;
}

function roomInfo(room) {
  return room.players.map(p => ({ id: p.id, name: p.name, team: p.team, bot: p.bot }));
}

function broadcastRoom(room) {
  const players = roomInfo(room);
  for (const p of room.players) {
    if (!p.bot) send(p.ws, { t: 'room', code: room.code, you: p.id, host: room.host, phase: room.phase, players, pub: !!room.pub, solo: !!room.solo, diff: room.diff, autoIn: room.autoAt ? Math.max(0, Math.ceil((room.autoAt - Date.now()) / 1000)) : 0 });
  }
}

function newRoom(conn) {
  const r = { code: makeCode(), players: [], host: conn.id, phase: 'lobby', game: null, timer: null, pub: false, solo: false, diff: 1, autoAt: 0 };
  rooms.set(r.code, r);
  addPlayer(r, conn, false);
  return r;
}

// 4人未満ならボットで埋めて開始する
function startRoom(room) {
  while (room.players.length < 4) addPlayer(room, null, true);
  for (const t of [0, 1]) {
    while (teamCount(room, t) > 2) {
      const p = room.players.slice().reverse().find(q => q.team === t);
      p.team = 1 - t;
    }
  }
  room.autoAt = 0;
  startGame(room);
}

// ランダムマッチの待ち時間を数え、時間が来たらボットで埋めて始める
setInterval(() => {
  for (const r of rooms.values()) {
    if (!r.pub || r.phase !== 'lobby' || !r.autoAt) continue;
    if (Date.now() >= r.autoAt) startRoom(r);
    broadcastRoom(r);
  }
}, 1000);

function leave(conn) {
  const room = conn.room;
  if (!room) return;
  conn.room = null;
  const p = room.players.find(q => q.id === conn.id);
  if (!p) return;
  if (room.phase === 'game') {
    // 切断したプレイヤーはその場でボットに引き継ぐ
    p.bot = true; p.ws = null; p.name = 'BOT'; p.ai = {};
  } else {
    room.players.splice(room.players.indexOf(p), 1);
  }
  const humans = room.players.filter(q => !q.bot);
  if (!humans.length) {
    clearInterval(room.timer);
    rooms.delete(room.code);
    return;
  }
  if (room.host === p.id) room.host = humans[0].id;
  broadcastRoom(room);
}

// ---------- ミニゲームの部屋(2人。中身は2人の間で中継するだけ) ----------
const mrooms = new Map();
const MG_WAIT = 20000;   // ランダムマッチでこの時間だれも来なければ CPU と遊ぶ

function mgLeave(conn) {
  const r = conn.mroom;
  if (!r) return;
  conn.mroom = null;
  r.conns = r.conns.filter(c => c !== conn);
  for (const c of r.conns) send(c.ws, { t: 'mgLeft' });
  if (!r.conns.length || r.started) { for (const c of r.conns) c.mroom = null; mrooms.delete(r.code); clearTimeout(r.timer); }
}
function mgNewRoom(conn, game, pub) {
  const r = { code: makeCode(), game: String(game).slice(0, 20), pub, conns: [conn], started: false, timer: null };
  mrooms.set(r.code, r);
  conn.mroom = r;
  send(conn.ws, { t: 'mgRoom', code: r.code, pub });
  if (pub) r.timer = setTimeout(() => { if (!r.started) { send(conn.ws, { t: 'mgCpu' }); mgLeave(conn); } }, MG_WAIT);
  return r;
}
function mgBegin(r) {
  r.started = true; clearTimeout(r.timer);
  const seed = Math.random() * 1e9 | 0;
  r.conns.forEach((c, i) => send(c.ws, { t: 'mgStart', seat: i, seed, game: r.game }));
}
function handleMg(conn, m) {
  switch (m.t) {
    case 'mgCreate': mgLeave(conn); mgNewRoom(conn, m.game, false); break;
    case 'mgQuick': {
      mgLeave(conn);
      const r = [...mrooms.values()].find(q => q.pub && !q.started && q.game === String(m.game) && q.conns.length === 1);
      if (r) { r.conns.push(conn); conn.mroom = r; mgBegin(r); }
      else mgNewRoom(conn, m.game, true);
      break;
    }
    case 'mgJoin': {
      const r = mrooms.get(String(m.code || '').toUpperCase());
      if (!r || r.pub || r.started || r.conns.length !== 1) { send(conn.ws, { t: 'mgErr', msg: 'その部屋は見つかりません' }); break; }
      mgLeave(conn);
      r.conns.push(conn); conn.mroom = r; mgBegin(r);
      break;
    }
    case 'mgLeave': mgLeave(conn); break;
    case 'mgMain': {
      // いろいろ対戦の中の本編: 部屋の2人を別のチームにして、残りはボットで始める
      const r = conn.mroom;
      if (!r || !r.started || r.conns[0] !== conn || r.conns.length !== 2) break;
      for (const c of r.conns) if (c.room) leave(c);
      const room = newRoom(r.conns[0]);
      addPlayer(room, r.conns[1], false);
      room.diff = clampDiff(m.diff);
      startRoom(room);
      broadcastRoom(room);
      break;
    }
    case 'mg': {
      const r = conn.mroom;
      if (r) for (const c of r.conns) if (c !== conn) send(c.ws, { t: 'mg', d: m.d });
      break;
    }
  }
}

function handle(conn, m) {
  const room = conn.room;
  if (typeof m.t === 'string' && m.t.startsWith('mg')) { handleMg(conn, m); return; }
  switch (m.t) {
    case 'create': {
      if (room) leave(conn);
      const r = newRoom(conn);
      broadcastRoom(r);
      break;
    }
    case 'quick': {
      // ランダムマッチ: 待機中の公開ルームに入る。なければ作る
      if (room) leave(conn);
      let r = [...rooms.values()].find(q => q.pub && q.phase === 'lobby' && q.players.length < 4);
      if (r) addPlayer(r, conn, false);
      else { r = newRoom(conn); r.pub = true; r.autoAt = Date.now() + C.MATCH_WAIT * 1000; }
      if (r.players.length >= 4) startRoom(r);
      broadcastRoom(r);
      break;
    }
    case 'solo': {
      // 一人プレイ: 残り3人をボットで埋めてすぐ始める
      if (room) leave(conn);
      const r = newRoom(conn);
      r.solo = true;
      r.diff = clampDiff(m.diff);
      startRoom(r);
      broadcastRoom(r);
      break;
    }
    case 'join': {
      if (mrooms.has(String(m.code || '').toUpperCase())) { handleMg(conn, { t: 'mgJoin', code: m.code }); break; }
      const r = rooms.get(String(m.code || '').toUpperCase());
      if (!r) return send(conn.ws, { t: 'err', msg: 'ルームが見つかりません' });
      if (r.phase !== 'lobby') return send(conn.ws, { t: 'err', msg: '試合中のため参加できません' });
      if (r.players.length >= 4) return send(conn.ws, { t: 'err', msg: 'ルームが満員です' });
      if (room) leave(conn);
      addPlayer(r, conn, false);
      broadcastRoom(r);
      break;
    }
    case 'team': {
      if (!room || room.phase !== 'lobby') return;
      const p = room.players.find(q => q.id === conn.id);
      const t = m.team ? 1 : 0;
      if (p && p.team !== t && teamCount(room, t) < 2) { p.team = t; broadcastRoom(room); }
      break;
    }
    case 'diff': {
      // CPUの強さ(ホストのみ、ロビー中)
      if (!room || room.phase !== 'lobby' || room.host !== conn.id) return;
      room.diff = clampDiff(m.diff);
      broadcastRoom(room);
      break;
    }
    case 'start': {
      if (!room || room.phase !== 'lobby' || room.host !== conn.id) return;
      startRoom(room);
      broadcastRoom(room);
      break;
    }
    case 'lobby': {
      if (!room || room.phase !== 'result' || room.host !== conn.id) return;
      room.players = room.players.filter(p => !p.bot);
      room.phase = 'lobby';
      room.game = null;
      if (room.pub) room.autoAt = Date.now() + C.MATCH_WAIT * 1000;
      broadcastRoom(room);
      break;
    }
    case 'in': {
      if (!room) return;
      const p = room.players.find(q => q.id === conn.id);
      if (!p) return;
      let mx = +m.mx || 0, my = +m.my || 0;
      const l = Math.hypot(mx, my);
      if (l > 1) { mx /= l; my /= l; }
      p.input.mx = mx; p.input.my = my;
      p.input.a = m.a | 0; p.input.b = m.b | 0;
      break;
    }
    case 'leave': leave(conn); break;
  }
}

wss.on('connection', ws => {
  const conn = { id: nextId++, ws, room: null, mroom: null };
  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    handle(conn, m);
  });
  ws.on('close', () => { leave(conn); mgLeave(conn); });
});

// ---------- 地形・当たり判定 ----------
const W = C.MAP.W, H = C.MAP.H, T = C.TERRAIN;
const SOLIDS = C.OBSTACLES.map(o => ({ x0: o.x0, y0: o.y0, x1: o.x1, y1: o.y1 }))
  .concat([{ x0: C.TRAY.x0, y0: C.TRAY.y0, x1: C.TRAY.x1, y1: C.TRAY.y1 }]);

function onLane(x, y) {
  const k = T.laneEvery, hw = T.laneHalfWidth;
  const dx = Math.abs(x - Math.round(x / k) * k), dy = Math.abs(y - Math.round(y / k) * k);
  return dx < hw || dy < hw;
}
function inVortex(x, y) { return Math.hypot(x - T.vortex.x, y - T.vortex.y) < T.vortex.r; }
function inFan(x, y) { return T.fans.some(f => Math.hypot(x - f.x, y - f.y) < f.r); }

function pointInSolid(x, y, pad) {
  return SOLIDS.some(s => x > s.x0 - pad && x < s.x1 + pad && y > s.y0 - pad && y < s.y1 + pad);
}

// 円と箱の押し出し。ぶつかったら true
function collide(e, r) {
  let hit = false;
  for (const s of SOLIDS) {
    const cx = Math.max(s.x0, Math.min(e.x, s.x1)), cy = Math.max(s.y0, Math.min(e.y, s.y1));
    let dx = e.x - cx, dy = e.y - cy;
    const d = Math.hypot(dx, dy);
    if (d < r) {
      hit = true;
      if (d < 1e-6) {
        // 中心が箱の中: 一番近い辺へ
        const opts = [[e.x - s.x0, -1, 0], [s.x1 - e.x, 1, 0], [e.y - s.y0, 0, -1], [s.y1 - e.y, 0, 1]].sort((a, b) => a[0] - b[0]);
        dx = opts[0][1]; dy = opts[0][2];
        e.x += dx * (opts[0][0] + r); e.y += dy * (opts[0][0] + r);
      } else {
        const push = r - d;
        e.x += dx / d * push; e.y += dy / d * push;
        // 壁方向の速度を消す
        const nx = dx / d, ny = dy / d, vn = e.vx * nx + e.vy * ny;
        if (vn < 0) { e.vx -= vn * nx; e.vy -= vn * ny; }
      }
    }
  }
  if (e.x < r) { e.x = r; e.vx = Math.max(0, e.vx); hit = true; }
  if (e.y < r) { e.y = r; e.vy = Math.max(0, e.vy); hit = true; }
  if (e.x > W - r) { e.x = W - r; e.vx = Math.min(0, e.vx); hit = true; }
  if (e.y > H - r) { e.y = H - r; e.vy = Math.min(0, e.vy); hit = true; }
  return hit;
}

function distToTray(x, y) {
  const t = C.TRAY;
  const cx = Math.max(t.x0, Math.min(x, t.x1)), cy = Math.max(t.y0, Math.min(y, t.y1));
  return Math.hypot(x - cx, y - cy);
}

function angDiff(a, b) { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }
function turnToward(e, target, rate, dt) {
  const d = angDiff(e.dir, target), m = rate * dt;
  e.dir += Math.max(-m, Math.min(m, d));
}

// ---------- ゲーム ----------
const DT = 1 / C.TICK_HZ;

function startGame(room) {
  room.phase = 'game';
  room.game = { time: 0, round: -1, ph: 'count', t: 0, results: [], ents: [], blocks: [], ev: [], lv: BOT_LEVELS[room.diff] || BOT_LEVELS[1] };
  for (const p of room.players) { p.seen.a = p.input.a; p.seen.b = p.input.b; }
  nextRound(room);
  clearInterval(room.timer);
  room.timer = setInterval(() => tick(room), 1000 / C.TICK_HZ / SIM_SPEED);
}

function nextRound(room) {
  const g = room.game;
  g.round++;
  g.carrier = g.round % 2;          // このラウンドの運搬チーム
  g.ph = 'count'; g.t = C.COUNTDOWN;
  g.delivered = 0; g.dropped = 0;
  g.ev.push(['round', g.round]);
  g.blocks = [];
  const P = C.PILE;
  for (let i = 0; i < C.BLOCKS; i++) {
    const cx = i % P.cols, cy = Math.floor(i / P.cols) % P.rows, layer = Math.floor(i / (P.cols * P.rows));
    g.blocks.push({ id: i, s: 0, x: P.x + cx * P.gap, y: P.y + cy * P.gap, z: layer, c: (i * 7 + 3) % 5, own: 0, slot: 0, t0: 0, fx: 0, fy: 0 });
  }
  g.ents = [];
  const counts = { b: 0, s: 0 };
  for (const p of room.players) {
    const role = p.team === g.carrier ? 'b' : 's';
    const sp = role === 'b' ? C.SPAWN.boat[counts.b++ % 2] : C.SPAWN.shark[counts.s++ % 2];
    const toCenter = Math.atan2(T.vortex.y - sp[1], T.vortex.x - sp[0]);
    g.ents.push({
      id: p.id, p, team: p.team, role, x: sp[0], y: sp[1], vx: 0, vy: 0, dir: toCenter,
      load: [], cd1: 0, cd2: 0, dash: 0, prot: 0, wind: 0, chg: 0, chgSpd: 0, dive: 0,
      stun: 0, imm: 0, bite: 0, biteAnim: 0, spin: 0, pick: 0, dlv: 0,
    });
    p.ai = {};
  }
}

function dropBlocks(g, boat, n) {
  let k = 0;
  while (boat.load.length && k < n) {
    const b = g.blocks[boat.load.pop()];
    let lx = boat.x, ly = boat.y;
    for (let tries = 0; tries < 12; tries++) {
      const a = Math.random() * Math.PI * 2, d = C.HIT.dropMin + Math.random() * (C.HIT.dropMax - C.HIT.dropMin);
      const x = boat.x + Math.cos(a) * d, y = boat.y + Math.sin(a) * d;
      if (x > 0.4 && y > 0.4 && x < W - 0.4 && y < H - 0.4 && !pointInSolid(x, y, 0.3)) { lx = x; ly = y; break; }
    }
    b.s = 2; b.fx = boat.x; b.fy = boat.y; b.x = lx; b.y = ly; b.t0 = g.time;
    if (!b.wasDropped) { b.wasDropped = true; g.dropped++; }
    g.ev.push(['drop', +lx.toFixed(2), +ly.toFixed(2)]);
    k++;
  }
}

function hitBoat(g, shark, boat, charge) {
  const H_ = C.HIT;
  const a = Math.atan2(boat.y - shark.y, boat.x - shark.x);
  if (boat.prot > 0) {
    boat.vx = Math.cos(a) * H_.protectKnock; boat.vy = Math.sin(a) * H_.protectKnock;
    boat.imm = 0.6;
    // ケースに弾かれたサメは少しのあいだ動けない
    shark.stun = H_.caseStun; shark.spin = (Math.random() < 0.5 ? -1 : 1) * H_.spin * 0.6;
    shark.wind = 0; shark.chg = 0;
    shark.vx = -Math.cos(a) * H_.protectKnock * 1.5; shark.vy = -Math.sin(a) * H_.protectKnock * 1.5;
    g.ev.push(['block', boat.id]);
  } else {
    dropBlocks(g, boat, charge ? H_.chargeDrop : 1);
    const k = charge ? H_.chargeKnock : H_.biteKnock;
    boat.vx = Math.cos(a) * k; boat.vy = Math.sin(a) * k;
    boat.stun = charge ? H_.chargeStun : H_.biteStun;
    boat.spin = (Math.random() < 0.5 ? -1 : 1) * H_.spin;
    boat.imm = H_.immune;
    boat.dash = 0;
  }
  shark.biteAnim = 0.45;
  g.ev.push(['bite', shark.id, boat.id]);
}

function simBoat(g, e, dt) {
  const B = C.BOAT, inp = e.p.input;
  if (e.stun > 0) {
    e.stun -= dt;
    e.dir += e.spin * dt;
    e.vx *= 0.9; e.vy *= 0.9;
  } else {
    let sp = B.speed * (1 - B.loadSlow * e.load.length);
    if (onLane(e.x, e.y)) sp *= B.laneMul;
    if (inVortex(e.x, e.y)) sp *= B.vortexMul;
    if (e.dash > 0) sp *= B.dashMul;
    const k = Math.min(1, B.accel * dt);
    e.vx += (inp.mx * sp - e.vx) * k;
    e.vy += (inp.my * sp - e.vy) * k;
    if (Math.hypot(inp.mx, inp.my) > 0.15) turnToward(e, Math.atan2(inp.my, inp.mx), B.turn, dt);
    // スキル
    if (inp.a !== e.p.seen.a) { e.p.seen.a = inp.a; if (e.cd1 <= 0) { e.dash = B.dashTime; e.cd1 = B.dashCd; g.ev.push(['dash', e.id]); } }
    if (inp.b !== e.p.seen.b) { e.p.seen.b = inp.b; if (e.cd2 <= 0) { e.prot = B.protectTime; e.cd2 = B.protectCd; g.ev.push(['prot', e.id]); } }
  }
  e.x += e.vx * dt; e.y += e.vy * dt;
  collide(e, B.radius);

  // 拾う
  e.pick -= dt;
  if (e.load.length < C.BOAT_CAPACITY && e.pick <= 0 && e.stun <= 0) {
    let best = null, bd = B.pickRange;
    for (const b of g.blocks) {
      if (b.s === 0 || (b.s === 2 && g.time - b.t0 > B.pickDelay * 1000)) {
        const d = Math.hypot(b.x - e.x, b.y - e.y);
        if (d < bd) { bd = d; best = b; }
      }
    }
    if (best) {
      best.s = 1; best.own = e.id; best.slot = e.load.length; best.fx = best.x; best.fy = best.y; best.t0 = g.time;
      e.load.push(best.id);
      e.pick = B.pickInterval;
      g.ev.push(['pick', e.id]);
    }
  }
  // 港へ搬入
  e.dlv -= dt;
  if (e.load.length && e.dlv <= 0 && distToTray(e.x, e.y) < B.radius + B.deliverRange) {
    const b = g.blocks[e.load.pop()];
    b.s = 3; b.slot = g.delivered; b.t0 = g.time; b.fx = e.x; b.fy = e.y;
    g.delivered++;
    e.dlv = B.deliverInterval;
    g.ev.push(['deliver', b.slot]);
  }
}

function simShark(g, e, dt) {
  const S = C.SHARK, inp = e.p.input;
  if (e.stun > 0) {
    e.stun -= dt;
    e.dir += e.spin * dt;
    e.vx *= 0.88; e.vy *= 0.88;
    e.x += e.vx * dt; e.y += e.vy * dt;
    collide(e, S.radius);
    e.p.seen.a = inp.a; e.p.seen.b = inp.b;
    return;
  }
  if (e.wind > 0) {
    e.wind -= dt;
    e.vx *= 0.75; e.vy *= 0.75;
    if (e.wind <= 0) {
      const fan = inFan(e.x, e.y);
      e.chg = S.chargeTime * (fan ? 1.15 : 1);
      e.chgSpd = S.chargeSpeed * (fan ? S.fanMul : 1);
      g.ev.push(['charge', e.id]);
    }
  } else if (e.chg > 0) {
    e.chg -= dt;
    e.vx = Math.cos(e.dir) * e.chgSpd; e.vy = Math.sin(e.dir) * e.chgSpd;
    if (e.chg <= 0) { e.vx *= 0.35; e.vy *= 0.35; }
  } else {
    let sp = S.speed;
    if (inVortex(e.x, e.y)) sp *= S.vortexMul;
    if (e.biteAnim > 0) sp *= S.biteRecoil;
    const k = Math.min(1, S.accel * dt);
    e.vx += (inp.mx * sp - e.vx) * k;
    e.vy += (inp.my * sp - e.vy) * k;
    if (Math.hypot(inp.mx, inp.my) > 0.15) turnToward(e, Math.atan2(inp.my, inp.mx), S.turn, dt);
  }
  if (inp.a !== e.p.seen.a) {
    e.p.seen.a = inp.a;
    if (e.cd1 <= 0 && e.wind <= 0 && e.chg <= 0) {
      if (Math.hypot(inp.mx, inp.my) > 0.15) e.dir = Math.atan2(inp.my, inp.mx);
      e.wind = S.chargeWind; e.cd1 = S.chargeCd;
    }
  }
  if (inp.b !== e.p.seen.b) {
    e.p.seen.b = inp.b;
    if (e.cd2 <= 0) { e.dive = S.diveTime; e.cd2 = S.diveCd; g.ev.push(['dive', e.id]); }
  }
  e.x += e.vx * dt; e.y += e.vy * dt;
  if (collide(e, S.radius) && e.chg > 0) { e.chg = 0; e.vx *= 0.2; e.vy *= 0.2; }
}

function separate(a, b, ra, rb) {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = ra + rb;
  if (d < min && d > 1e-6) {
    const p = (min - d) / 2, nx = dx / d, ny = dy / d;
    a.x -= nx * p; a.y -= ny * p; b.x += nx * p; b.y += ny * p;
    return true;
  }
  return d < min;
}

function tick(room) {
  const g = room.game;
  g.time += 1000 / C.TICK_HZ;
  if (g.ph === 'count') {
    g.t -= DT;
    if (g.t <= 0) { g.ph = 'play'; g.t = C.ROUND_TIME; g.ev.push(['go']); }
  } else if (g.ph === 'play') {
    for (const e of g.ents) if (e.p.bot) botThink(g, e);
    for (const e of g.ents) {
      for (const k of ['cd1', 'cd2', 'dash', 'prot', 'dive', 'imm', 'bite', 'biteAnim']) if (e[k] > 0) e[k] = Math.max(0, e[k] - DT);
      if (e.role === 'b') simBoat(g, e, DT); else simShark(g, e, DT);
    }
    const boats = g.ents.filter(e => e.role === 'b'), sharks = g.ents.filter(e => e.role === 's');
    for (const s of sharks) {
      for (const b of boats) {
        const touching = Math.hypot(b.x - s.x, b.y - s.y) < C.BOAT.radius + C.SHARK.radius + 0.08;
        if (!touching) continue;
        if (b.imm <= 0 && s.stun <= 0) {
          if (s.chg > 0) { hitBoat(g, s, b, true); s.chg = 0; s.vx *= 0.2; s.vy *= 0.2; }
          else if (s.bite <= 0 && s.wind <= 0) { hitBoat(g, s, b, false); s.bite = C.SHARK.biteCd; }
        }
        if (b.imm <= 0 || b.prot > 0) separate(s, b, C.SHARK.radius, C.BOAT.radius);   // 無敵中の船はサメをすり抜ける
      }
    }
    for (let i = 0; i < g.ents.length; i++) for (let j = i + 1; j < g.ents.length; j++) {
      const a = g.ents[i], b = g.ents[j];
      if (a.role === b.role) separate(a, b, a.role === 'b' ? C.BOAT.radius : C.SHARK.radius, b.role === 'b' ? C.BOAT.radius : C.SHARK.radius);
    }
    for (const e of g.ents) collide(e, e.role === 'b' ? C.BOAT.radius : C.SHARK.radius);
    g.t -= DT;
    if (g.delivered >= C.BLOCKS) endRound(room);
    else if (g.t <= 0) { g.t = 0; endRound(room); }
  } else if (g.ph === 'inter') {
    g.t -= DT;
    if (g.t <= 0) {
      if (g.round >= C.ROUNDS - 1) finish(room); else nextRound(room);
    }
  }
  broadcastSnap(room);
}

function endRound(room) {
  const g = room.game, S = C.SCORE;
  const all = g.delivered >= C.BLOCKS;
  const pts = [0, 0];
  let outcome, cpts, dpts, bonus = { all: 0, time: 0, def: 0 };
  if (!all && g.delivered * 2 === C.BLOCKS) {
    outcome = 'draw'; cpts = dpts = S.drawPoints;
  } else {
    if (all) { bonus.all = S.allBonus; bonus.time = Math.round(S.timeBonusMax * g.t / C.ROUND_TIME); }
    else bonus.def = S.defendBonus;
    cpts = g.delivered * S.perDelivered + bonus.all + bonus.time;
    dpts = g.dropped * S.perDropped + bonus.def;
    outcome = all ? 'carrier' : 'defender';
  }
  pts[g.carrier] = cpts; pts[1 - g.carrier] = dpts;
  g.results.push({ round: g.round, carrier: g.carrier, delivered: g.delivered, dropped: g.dropped, timeLeft: Math.ceil(g.t), outcome, bonus, pts });
  g.ph = 'inter'; g.t = C.INTERMISSION;
  for (const e of g.ents) { e.vx = 0; e.vy = 0; e.wind = 0; e.chg = 0; }
  g.ev.push(['end', outcome]);
}

function finish(room) {
  const g = room.game;
  g.ph = 'end';
  room.phase = 'result';
  clearInterval(room.timer);
  room.timer = null;
  broadcastSnap(room);
  broadcastRoom(room);
}

const r2 = v => Math.round(v * 100) / 100;
function broadcastSnap(room) {
  const g = room.game;
  const msg = JSON.stringify({
    t: 's', tm: g.time, ph: g.ph, r: g.round, cr: g.carrier, tl: r2(g.t), del: g.delivered, drp: g.dropped,
    e: g.ents.map(e => ({
      i: e.id, tm: e.team, ro: e.role, x: r2(e.x), y: r2(e.y), d: r2(e.dir), vx: r2(e.vx), vy: r2(e.vy),
      f: (e.dash > 0 ? 1 : 0) | (e.prot > 0 ? 2 : 0) | (e.wind > 0 ? 4 : 0) | (e.chg > 0 ? 8 : 0) |
        (e.dive > 0 ? 16 : 0) | (e.stun > 0 ? 32 : 0) | (e.biteAnim > 0 ? 64 : 0) | (e.imm > 0 ? 128 : 0),
      c1: r2(e.cd1), c2: r2(e.cd2), bot: e.p.bot ? 1 : 0,
    })),
    b: g.blocks.map(b => [b.s, r2(b.x), r2(b.y), b.s === 1 ? b.own : b.slot, b.t0, r2(b.fx), r2(b.fy), b.c, b.s === 1 ? b.slot : b.z]),
    ev: g.ev,
    res: g.results,
  });
  g.ev = [];
  for (const p of room.players) if (!p.bot && p.ws && p.ws.readyState === 1) p.ws.send(msg);
}

// ---------- ボット ----------
// 0.5マスの格子で幅優先探索し、見通せる一番遠い経路点へ向かう
const GS = 0.5, GW = Math.ceil(W / GS), GH = Math.ceil(H / GS);
const blocked = new Uint8Array(GW * GH);
for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
  const x = (i + 0.5) * GS, y = (j + 0.5) * GS;
  blocked[j * GW + i] = (pointInSolid(x, y, 0.62) || x < 0.5 || y < 0.5 || x > W - 0.5 || y > H - 0.5) ? 1 : 0;
}
const cellOf = (x, y) => [Math.max(0, Math.min(GW - 1, Math.floor(x / GS))), Math.max(0, Math.min(GH - 1, Math.floor(y / GS)))];

function clearLine(x0, y0, x1, y1) {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.2);
  for (let k = 1; k <= n; k++) {
    const t = k / n;
    if (pointInSolid(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 0.58)) return false;
  }
  return true;
}

function findPath(sx, sy, tx, ty) {
  const [si, sj] = cellOf(sx, sy);
  let [ti, tj] = cellOf(tx, ty);
  const N = GW * GH, prev = new Int32Array(N).fill(-1);
  const start = sj * GW + si;
  // 目標が塞がっていれば近くの空きへ
  if (blocked[tj * GW + ti]) {
    let best = null, bd = 1e9;
    for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) if (!blocked[j * GW + i]) {
      const d = (i - ti) ** 2 + (j - tj) ** 2; if (d < bd) { bd = d; best = [i, j]; }
    }
    [ti, tj] = best;
  }
  const goal = tj * GW + ti;
  const q = new Int32Array(N); let qh = 0, qt = 0;
  q[qt++] = start; prev[start] = start;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  while (qh < qt) {
    const c = q[qh++];
    if (c === goal) break;
    const ci = c % GW, cj = (c / GW) | 0;
    for (const [di, dj] of dirs) {
      const ni = ci + di, nj = cj + dj;
      if (ni < 0 || nj < 0 || ni >= GW || nj >= GH) continue;
      const n = nj * GW + ni;
      if (prev[n] !== -1 || blocked[n]) continue;
      if (di && dj && (blocked[cj * GW + ni] || blocked[nj * GW + ci])) continue;
      prev[n] = c; q[qt++] = n;
    }
  }
  if (prev[goal] === -1) return [[tx, ty]];
  const pts = [];
  for (let c = goal; c !== start; c = prev[c]) pts.push([(c % GW + 0.5) * GS, (((c / GW) | 0) + 0.5) * GS]);
  pts.reverse();
  pts.push([tx, ty]);
  return pts;
}

function steer(e, tx, ty) {
  const ai = e.p.ai;
  ai.repath = (ai.repath || 0) - DT;
  if (!ai.path || ai.repath <= 0 || !ai.goal || Math.hypot(ai.goal[0] - tx, ai.goal[1] - ty) > 1.5) {
    ai.path = findPath(e.x, e.y, tx, ty); ai.goal = [tx, ty]; ai.repath = 0.5;
  }
  let target = ai.path[0];
  for (let k = ai.path.length - 1; k >= 0; k--) {
    if (clearLine(e.x, e.y, ai.path[k][0], ai.path[k][1])) { target = ai.path[k]; break; }
  }
  const dx = target[0] - e.x, dy = target[1] - e.y, d = Math.hypot(dx, dy) || 1;
  return [dx / d, dy / d];
}

// CPUの強さ。0 やさしい / 1 ふつう / 2 つよい
const BOT_LEVELS = [
  { think: 0.3, speed: 0.8, avoid: 0.2, dash: 0.03, protect: 0, lead: 0, charge: 0.06, range: 0.75, dive: 0, split: 3 },
  { think: 0, speed: 1, avoid: 0.5, dash: 0.08, protect: 0.3, lead: 0.45, charge: 0.4, range: 1, dive: 0.02, split: 3 },
  { think: 0, speed: 1, avoid: 0.9, dash: 0.12, protect: 0.6, lead: 0.45, charge: 0.4, range: 1, dive: 0.02, split: 30 },
];
function clampDiff(v) { v = Math.round(Number(v)); return v >= 0 && v <= 2 ? v : 1; }

function press(p, key) { p.input[key] = (p.input[key] + 1) % 1000; }

function botThink(g, e) {
  const p = e.p, inp = p.input, ai = p.ai, L = g.lv;
  ai.wob = (ai.wob || Math.random() * 10) + DT;
  // 弱いCPUは考え直す間隔をあける(その間は前の入力のまま)
  if (L.think > 0) { ai.wait = (ai.wait || 0) - DT; if (ai.wait > 0) return; ai.wait = L.think * (0.6 + Math.random() * 0.8); }
  if (e.role === 'b') {
    const sharks = g.ents.filter(o => o.role === 's');
    const free = g.blocks.filter(b => b.s === 0 || (b.s === 2 && g.time - b.t0 > C.BOAT.pickDelay * 1000));
    let tx, ty;
    if (e.load.length < C.BOAT_CAPACITY && free.length && !(e.load.length > 0 && free.every(b => Math.hypot(b.x - e.x, b.y - e.y) > 6))) {
      free.sort((a, b) => Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(b.x - e.x, b.y - e.y));
      tx = free[0].x; ty = free[0].y;
    } else if (e.load.length) {
      const t = C.TRAY; tx = t.x0 - 0.7; ty = t.y1 + 0.7;
    } else { tx = C.PILE.x + 1.5; ty = C.PILE.y; }
    let [mx, my] = steer(e, tx, ty);
    // サメを避ける
    let near = 1e9;
    for (const s of sharks) {
      const dx = e.x - s.x, dy = e.y - s.y, d = Math.hypot(dx, dy);
      near = Math.min(near, d);
      if (d < 3 && d > 0.01) { const w = (3 - d) / 3 * L.avoid; mx += dx / d * w; my += dy / d * w; }
    }
    const l = Math.hypot(mx, my) || 1;
    inp.mx = mx / l * L.speed; inp.my = my / l * L.speed;
    if (e.cd1 <= 0 && (near < 3 || Math.hypot(tx - e.x, ty - e.y) > 7) && Math.random() < L.dash) press(p, 'a');
    if (e.cd2 <= 0 && e.load.length >= 2 && near < 2.4 && Math.random() < L.protect) press(p, 'b');
  } else {
    const boats = g.ents.filter(o => o.role === 'b');
    const mates = g.ents.filter(o => o.role === 's' && o !== e);
    // 積み荷の多い船を優先。相方と同じ船は避ける(強いCPUは1隻ずつ必ず分担する)
    let best = null, bs = -1e9;
    for (const b of boats) {
      let s = b.load.length * 4 - Math.hypot(b.x - e.x, b.y - e.y) * 0.5;
      if (b.stun > 0 || b.imm > 0) s -= 6;
      if (mates.some(m => m.p.ai.target === b.id)) s -= L.split;
      if (s > bs) { bs = s; best = b; }
    }
    ai.target = best ? best.id : null;
    if (!best) { inp.mx = 0; inp.my = 0; return; }
    const lead = L.lead;
    const tx = best.x + best.vx * lead, ty = best.y + best.vy * lead;
    const [mx, my] = steer(e, tx, ty);
    const d = Math.hypot(tx - e.x, ty - e.y);
    inp.mx = mx * L.speed; inp.my = my * L.speed;
    const range = (inFan(e.x, e.y) ? 5.2 : 3.8) * L.range;
    if (e.cd1 <= 0 && d < range && d > 1.4 && best.imm <= 0 && clearLine(e.x, e.y, tx, ty) && Math.random() < L.charge) {
      inp.mx = (tx - e.x) / d; inp.my = (ty - e.y) / d;
      press(p, 'a');
    }
    if (e.cd2 <= 0 && d > 4 && d < 9 && Math.random() < L.dive) press(p, 'b');
  }
}

server.listen(PORT, () => console.log('デスクトイ・バトル: http://localhost:' + PORT));
