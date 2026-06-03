import { createHash, randomBytes } from 'node:crypto';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { createServer } from 'node:http';

const PORT = Number(process.env.PORT || 5173);
const ROOT = resolve('public');
const THREE_MODULE = resolve('node_modules/three/build/three.module.js');
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const COURT = {
  halfLength: 6.7,
  halfWidth: 3.05,
  singlesHalfWidth: 2.59,
  shortServiceZ: 1.98,
  netHeight: 1.55,
  playerY: 1.65,
  minPlayerZ: { A: -6.45, B: 0.55 },
  maxPlayerZ: { A: -0.55, B: 6.45 },
};

const MIN_HIT_POWER = 0.75;
const MAX_HIT_POWER = 1.45;
const MIN_PITCH = -0.48;
const MAX_PITCH = 0.56;
const MAX_JUMP_HEIGHT = 1.35;
const NORMAL_SHOT_ARC_TIME_SCALE = Math.SQRT2;

const clients = new Map();
const rooms = new Map();

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

const server = createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  let filePath;

  if (url.pathname === '/vendor/three.module.js') {
    filePath = THREE_MODULE;
  } else {
    const requestPath = decodeURIComponent(url.pathname);
    const cleanPath = requestPath === '/' ? 'index.html' : normalize(requestPath.replace(/^[/\\]+/, ''));
    filePath = resolve(join(ROOT, cleanPath));
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
  }

  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  res.writeHead(200, {
    'content-type': mime[extname(filePath)] || 'application/octet-stream',
    'cache-control': 'no-store',
  });
  createReadStream(filePath).pipe(res);
});

server.on('upgrade', (req, socket) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  if (url.pathname !== '/ws') {
    socket.destroy();
    return;
  }

  const key = req.headers['sec-websocket-key'];
  if (!key) {
    socket.destroy();
    return;
  }

  const accept = createHash('sha1').update(key + WS_GUID).digest('base64');
  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`,
    '',
    '',
  ].join('\r\n'));

  const client = {
    id: randomId(8),
    name: 'Player',
    socket,
    buffer: Buffer.alloc(0),
    roomId: null,
    seat: null,
  };

  clients.set(client.id, client);
  socket.on('data', (chunk) => handleSocketData(client, chunk));
  socket.on('close', () => removeClient(client));
  socket.on('error', () => removeClient(client));
  send(client, { type: 'hello', id: client.id });
});

server.listen(PORT, () => {
  console.log(`Badminton game running at http://localhost:${PORT}`);
});

setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    tickRoom(room, 1 / 30, now);
    if (room.clients.size > 0) {
      broadcast(room, { type: 'state', state: getRoomState(room) });
    }
  }
}, 1000 / 30);

function handleSocketData(client, chunk) {
  client.buffer = Buffer.concat([client.buffer, chunk]);

  while (client.buffer.length >= 2) {
    const first = client.buffer[0];
    const second = client.buffer[1];
    const opcode = first & 0x0f;
    const masked = (second & 0x80) !== 0;
    let length = second & 0x7f;
    let offset = 2;

    if (length === 126) {
      if (client.buffer.length < offset + 2) return;
      length = client.buffer.readUInt16BE(offset);
      offset += 2;
    } else if (length === 127) {
      if (client.buffer.length < offset + 8) return;
      const high = client.buffer.readUInt32BE(offset);
      const low = client.buffer.readUInt32BE(offset + 4);
      length = high * 2 ** 32 + low;
      offset += 8;
    }

    const maskOffset = offset;
    if (masked) offset += 4;
    if (client.buffer.length < offset + length) return;

    let payload = client.buffer.subarray(offset, offset + length);
    if (masked) {
      const mask = client.buffer.subarray(maskOffset, maskOffset + 4);
      payload = Buffer.from(payload.map((byte, index) => byte ^ mask[index % 4]));
    }

    client.buffer = client.buffer.subarray(offset + length);

    if (opcode === 0x8) {
      client.socket.end();
      return;
    }

    if (opcode === 0x9) {
      sendFrame(client.socket, payload, 0xA);
      continue;
    }

    if (opcode !== 0x1) continue;

    try {
      const message = JSON.parse(payload.toString('utf8'));
      handleMessage(client, message);
    } catch {
      send(client, { type: 'error', message: '消息格式错误' });
    }
  }
}

function handleMessage(client, message) {
  if (!message || typeof message.type !== 'string') return;

  if (message.type === 'create') {
    const room = createRoom();
    joinRoom(client, room, 'A', message.name);
    return;
  }

  if (message.type === 'join') {
    const roomId = String(message.roomId || '').trim().toUpperCase();
    const room = rooms.get(roomId);
    if (!room) {
      send(client, { type: 'error', message: '房间不存在' });
      return;
    }
    if (room.clients.size >= 2 && !room.clients.has(client.id)) {
      send(client, { type: 'error', message: '房间已满' });
      return;
    }
    const seat = room.seats.A ? 'B' : 'A';
    joinRoom(client, room, seat, message.name);
    return;
  }

  if (!client.roomId || !rooms.has(client.roomId)) return;
  const room = rooms.get(client.roomId);

  if (message.type === 'ready') {
    room.ready[client.seat] = Boolean(message.ready);
    maybeStartRoom(room);
    broadcast(room, { type: 'room', state: getRoomState(room) });
    return;
  }

  if (message.type === 'leave') {
    removeClientFromRoom(client);
    send(client, { type: 'left' });
    return;
  }

  if (message.type === 'input') {
    updatePlayer(room, client.seat, message.state);
    return;
  }

  if (message.type === 'hit') {
    tryHit(room, client.seat, message.aim);
  }
}

function createRoom() {
  let id = randomId(4);
  while (rooms.has(id)) id = randomId(4);

  const room = {
    id,
    clients: new Map(),
    seats: { A: null, B: null },
    names: { A: '', B: '' },
    ready: { A: false, B: false },
    players: {
      A: makePlayer('A'),
      B: makePlayer('B'),
    },
    match: makeMatch(),
    ball: makeBall('A'),
  };

  rooms.set(id, room);
  return room;
}

function joinRoom(client, room, seat, rawName) {
  if (client.roomId) removeClientFromRoom(client);

  client.name = sanitizeName(rawName);
  client.roomId = room.id;
  client.seat = seat;
  room.clients.set(client.id, client);
  room.seats[seat] = client.id;
  room.names[seat] = client.name;
  room.ready[seat] = false;

  send(client, { type: 'joined', roomId: room.id, seat, state: getRoomState(room) });
  broadcast(room, { type: 'room', state: getRoomState(room) });
}

function removeClient(client) {
  removeClientFromRoom(client);
  clients.delete(client.id);
}

function removeClientFromRoom(client) {
  if (!client.roomId) return;
  const room = rooms.get(client.roomId);
  if (!room) return;

  room.clients.delete(client.id);
  if (client.seat) {
    room.seats[client.seat] = null;
    room.names[client.seat] = '';
    room.ready[client.seat] = false;
  }

  if (room.clients.size === 0) {
    rooms.delete(room.id);
  } else {
    room.match.phase = 'waiting';
    room.match.message = '对手已离开，等待新的玩家加入';
    broadcast(room, { type: 'room', state: getRoomState(room) });
  }

  client.roomId = null;
  client.seat = null;
}

function maybeStartRoom(room) {
  if (!room.seats.A || !room.seats.B) {
    room.match.phase = 'waiting';
    room.match.message = '等待第二名玩家加入';
    return;
  }

  if (!room.ready.A || !room.ready.B) {
    room.match.phase = 'ready';
    room.match.message = '等待双方准备';
    return;
  }

  if (room.match.phase === 'waiting' || room.match.phase === 'ready' || room.match.phase === 'matchOver') {
    room.match = makeMatch();
    resetPlayers(room);
    resetBall(room, room.match.server);
    room.match.phase = 'serve';
    room.match.message = `${room.match.server} 方发球`;
  }
}

function tickRoom(room, dt, now) {
  const match = room.match;
  if (match.phase === 'pointOver' && now >= match.nextAt) {
    resetBall(room, match.server);
    match.phase = 'serve';
    match.message = `${match.server} 方发球`;
    return;
  }

  if (match.phase === 'gameOver' && now >= match.nextAt) {
    match.points = { A: 0, B: 0 };
    match.setNumber += 1;
    resetPlayers(room);
    resetBall(room, match.server);
    match.phase = 'serve';
    match.message = `第 ${match.setNumber} 局，${match.server} 方发球`;
    return;
  }

  if (match.phase === 'serve') {
    updateServeBallPosition(room, match.server);
    return;
  }

  if (match.phase !== 'rally') return;

  const ball = room.ball;
  const previousZ = ball.position[2];

  ball.velocity[1] -= 9.8 * dt;
  ball.position[0] += ball.velocity[0] * dt;
  ball.position[1] += ball.velocity[1] * dt;
  ball.position[2] += ball.velocity[2] * dt;

  ball.velocity[0] *= 0.996;
  ball.velocity[1] *= 0.998;
  ball.velocity[2] *= 0.996;

  if (previousZ * ball.position[2] <= 0 && Math.abs(ball.position[2]) < 0.35) {
    const crossedRatio = Math.abs(previousZ) / (Math.abs(previousZ) + Math.abs(ball.position[2]) || 1);
    const netY = ball.position[1] - ball.velocity[1] * dt * (1 - crossedRatio);
    if (netY < COURT.netHeight + 0.12) {
      awardPoint(room, opponent(ball.lastHit || match.server), ball.serve ? '发球下网' : '羽毛球下网');
      return;
    }
  }

  if (ball.position[1] <= 0.08) {
    const landing = evaluateLanding(ball.lastHit, ball.position, ball.serve);
    awardPoint(room, landing.winner, landing.reason);
    return;
  }

  if (Math.abs(ball.position[0]) > 4.2 || Math.abs(ball.position[2]) > 7.6 || ball.position[1] < -1.5) {
    awardPoint(room, opponent(ball.lastHit), '击球出界');
  }
}

function evaluateLanding(lastHit, position, serve) {
  const onOpponentSide = lastHit === 'A' ? position[2] > 0 : position[2] < 0;
  if (!onOpponentSide) {
    return { winner: opponent(lastHit), reason: serve ? '发球未过网' : '击球落在本方半场' };
  }
  if (!isInSinglesCourt(position)) {
    return { winner: opponent(lastHit), reason: '击球出界' };
  }
  if (serve && !isValidServeLanding(serve.server, serve.score, position)) {
    return { winner: opponent(lastHit), reason: '发球未落入斜线发球区' };
  }
  return { winner: lastHit, reason: serve ? '合法发球落地' : '有效落地' };
}

function isInSinglesCourt(position) {
  return Math.abs(position[0]) <= COURT.singlesHalfWidth && Math.abs(position[2]) <= COURT.halfLength;
}

function isValidServeLanding(serverSeat, score, position) {
  const beyondShortServiceLine = serverSeat === 'A'
    ? position[2] >= COURT.shortServiceZ
    : position[2] <= -COURT.shortServiceZ;
  const expectedTargetSign = -serveSideSign(serverSeat, score);
  return beyondShortServiceLine
    && Math.abs(position[0]) <= COURT.singlesHalfWidth
    && Math.abs(position[2]) <= COURT.halfLength
    && position[0] * expectedTargetSign > 0.06;
}

function updatePlayer(room, seat, state = {}) {
  if (!room.players[seat]) return;
  const player = room.players[seat];
  const inputPosition = Array.isArray(state.position) ? state.position : player.position;

  player.position = [
    clamp(Number(inputPosition[0]) || 0, -COURT.halfWidth, COURT.halfWidth),
    clamp(Number(inputPosition[1]) || COURT.playerY, COURT.playerY, COURT.playerY + MAX_JUMP_HEIGHT),
    clamp(Number(inputPosition[2]) || player.position[2], COURT.minPlayerZ[seat], COURT.maxPlayerZ[seat]),
  ];
  player.yaw = normalizeAngle(Number(state.yaw) || player.yaw);
  player.pitch = clamp(Number(state.pitch) || 0, MIN_PITCH, MAX_PITCH);
  player.moving = Boolean(state.moving);
  player.grounded = Boolean(state.grounded) || player.position[1] <= COURT.playerY + 0.01;

  if (room.match.phase === 'serve' && room.match.server === seat) {
    updateServeBallPosition(room, seat);
  }
}

function tryHit(room, seat, aim = {}) {
  const match = room.match;
  if (!['serve', 'rally'].includes(match.phase)) return;
  if (match.phase === 'serve' && match.server !== seat) return;

  const player = room.players[seat];
  const ball = room.ball;
  const now = Date.now();
  if (now - player.lastHitAt < 420) return;

  if (match.phase === 'serve') {
    if (!isValidServePosition(seat, player.position, match.points[seat])) return;
    updateServeBallPosition(room, seat);
  }

  const dx = ball.position[0] - player.position[0];
  const dy = ball.position[1] - (player.position[1] - 0.4);
  const dz = ball.position[2] - player.position[2];
  const distance = Math.hypot(dx, dy, dz);
  const jumpHeight = Math.max(0, player.position[1] - COURT.playerY);
  if (distance > (match.phase === 'serve' ? 3.25 : 2.7) || ball.position[1] < 0.25 || ball.position[1] > 3.6 + jumpHeight * 0.9) {
    return;
  }

  const direction = normalizeVector([
    finiteNumber(aim.x, 0),
    finiteNumber(aim.y, 0),
    finiteNumber(aim.z, seat === 'A' ? 1 : -1),
  ]);
  const wasServe = match.phase === 'serve';
  const shotType = normalizeShotType(aim.shotType);
  ball.velocity = velocityFromAim(seat, direction, ball.position, match.phase, finiteNumber(aim.power, 1), shotType);
  ball.lastHit = seat;
  ball.serve = wasServe ? { server: seat, score: match.points[seat] } : null;
  ball.position[1] = Math.max(ball.position[1], 0.9);
  ball.moving = true;
  player.lastHitAt = now;
  match.phase = 'rally';
  match.rally += 1;
  match.message = `${seat} 方${shotType === 'heavySmash' ? '重杀' : shotType === 'smash' ? '杀球' : '击球'}`;
}

function awardPoint(room, winner, reason) {
  const match = room.match;
  if (!winner || match.phase !== 'rally') return;

  match.points[winner] += 1;
  match.server = winner;
  match.message = `${winner} 方得分：${reason}`;
  room.ball.velocity = [0, 0, 0];

  if (match.points[winner] >= 15) {
    match.games[winner] += 1;
    match.setScores.push({ A: match.points.A, B: match.points.B, winner });

    if (match.games[winner] >= 2) {
      match.phase = 'matchOver';
      match.winner = winner;
      match.message = `${winner} 方赢得比赛`;
      return;
    }

    match.phase = 'gameOver';
    match.nextAt = Date.now() + 3200;
    match.message = `${winner} 方赢得本局`;
    return;
  }

  match.phase = 'pointOver';
  match.nextAt = Date.now() + 1800;
}

function resetPlayers(room) {
  room.players.A = makePlayer('A');
  room.players.B = makePlayer('B');
}

function resetBall(room, serverSeat) {
  room.ball = makeBall(serverSeat);
  positionServerForServe(room, serverSeat);
  updateServeBallPosition(room, serverSeat);
}

function makePlayer(seat) {
  return {
    position: seat === 'A' ? [0, COURT.playerY, -5.8] : [0, COURT.playerY, 5.8],
    yaw: seat === 'A' ? 0 : Math.PI,
    pitch: 0,
    moving: false,
    grounded: true,
    lastHitAt: 0,
  };
}

function makeMatch() {
  return {
    phase: 'waiting',
    message: '等待玩家加入',
    points: { A: 0, B: 0 },
    games: { A: 0, B: 0 },
    setScores: [],
    setNumber: 1,
    server: 'A',
    rally: 0,
    winner: null,
    nextAt: 0,
  };
}

function makeBall(serverSeat) {
  return {
    position: serverSeat === 'A' ? [0.65, 1.45, -4.8] : [-0.65, 1.45, 4.8],
    velocity: [0, 0, 0],
    lastHit: serverSeat,
    moving: false,
    serve: null,
  };
}

function updateServeBallPosition(room, seat) {
  const player = room.players[seat];
  if (!player) return;
  room.ball.position = serveBallPosition(seat, player.position);
  room.ball.velocity = [0, 0, 0];
  room.ball.lastHit = seat;
  room.ball.moving = false;
}

function serveBallPosition(seat, playerPosition) {
  const toward = seat === 'A' ? 1 : -1;
  const sideOffset = seat === 'A' ? 0.55 : -0.55;
  const minZ = seat === 'A' ? COURT.minPlayerZ.A + 0.35 : 0.18;
  const maxZ = seat === 'A' ? -0.18 : COURT.maxPlayerZ.B - 0.35;
  return [
    clamp(playerPosition[0] + sideOffset, -COURT.halfWidth + 0.25, COURT.halfWidth - 0.25),
    1.45,
    clamp(playerPosition[2] + toward * 0.9, minZ, maxZ),
  ];
}

function positionServerForServe(room, seat) {
  const player = room.players[seat];
  if (!player) return;
  player.position[0] = serveSideSign(seat, room.match.points[seat]) * 1.22;
  player.position[1] = COURT.playerY;
  player.position[2] = seat === 'A' ? -5.25 : 5.25;
  player.yaw = seat === 'A' ? 0 : Math.PI;
  player.pitch = 0;
  player.grounded = true;
}

function serveSideSign(seat, score) {
  const rightSide = seat === 'A' ? -1 : 1;
  return Number(score) % 2 === 0 ? rightSide : -rightSide;
}

function isValidServePosition(seat, position, score) {
  const correctHalf = position[0] * serveSideSign(seat, score) > 0.08;
  const behindShortServiceLine = seat === 'A'
    ? position[2] <= -COURT.shortServiceZ
    : position[2] >= COURT.shortServiceZ;
  return correctHalf && behindShortServiceLine;
}

function getRoomState(room) {
  return {
    id: room.id,
    names: room.names,
    seats: {
      A: Boolean(room.seats.A),
      B: Boolean(room.seats.B),
    },
    ready: room.ready,
    players: room.players,
    ball: room.ball,
    match: room.match,
  };
}

function send(client, message) {
  if (!client.socket.destroyed) {
    sendFrame(client.socket, Buffer.from(JSON.stringify(message), 'utf8'), 0x1);
  }
}

function broadcast(room, message) {
  for (const client of room.clients.values()) send(client, message);
}

function sendFrame(socket, payload, opcode) {
  const length = payload.length;
  let header;
  if (length < 126) {
    header = Buffer.from([0x80 | opcode, length]);
  } else if (length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeUInt32BE(0, 2);
    header.writeUInt32BE(length, 6);
  }
  socket.write(Buffer.concat([header, payload]));
}

function sanitizeName(name) {
  const clean = String(name || '').trim().slice(0, 18);
  return clean || 'Player';
}

function randomId(length) {
  return randomBytes(length).toString('base64url').replace(/[^A-Z0-9]/gi, '').slice(0, length).toUpperCase();
}

function opponent(seat) {
  return seat === 'A' ? 'B' : 'A';
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeAngle(value) {
  const twoPi = Math.PI * 2;
  return ((value % twoPi) + twoPi) % twoPi;
}

function normalizeVector(vector) {
  const length = Math.hypot(vector[0], vector[1], vector[2]) || 1;
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeShotType(value) {
  return ['smash', 'heavySmash'].includes(value) ? value : 'normal';
}

function velocityFromAim(seat, direction, start, phase, power = 1, shotType = 'normal') {
  const toward = seat === 'A' ? 1 : -1;
  if (direction[2] * toward < 0.2) direction[2] = toward * 0.35;

  const hitPower = clamp(Number(power) || 1, MIN_HIT_POWER, MAX_HIT_POWER);
  const frontZ = seat === 'A' ? 0.9 : -0.9;
  const backZ = seat === 'A' ? 6.15 : -6.15;
  const depth = clamp(0.5 + direction[1] * 0.78 + (Math.abs(direction[2]) - 0.35) * 0.12 + (hitPower - 1) * 0.18, 0.12, 0.98);
  const targetZ = frontZ + (backZ - frontZ) * depth;
  const lateral = clamp((direction[0] / Math.max(Math.abs(direction[2]), 0.25)) * 2.15, -2.75, 2.75);
  const targetX = clamp(start[0] + lateral, -2.75, 2.75);
  const baseTime = phase === 'serve' ? 0.82 + depth * 0.18 : 0.62 + depth * 0.28;
  const flightTime = baseTime / (0.78 + hitPower * 0.35);
  const target = [targetX, 0.08, targetZ];
  if (phase !== 'serve' && shotType !== 'normal') {
    return velocityToSmashTarget(start, target, flightTime, shotType);
  }
  const velocity = velocityToTarget(start, target, normalShotFlightTime(flightTime, phase === 'serve', shotType));
  return ensureNetClearance(start, velocity, toward);
}

function velocityToSmashTarget(start, target, flightTime, shotType) {
  const baseline = velocityToTarget(start, target, flightTime);
  const multiplier = shotType === 'heavySmash' ? 2.25 : 1.75;
  const angleRange = shotType === 'heavySmash' ? [20, 30] : [15, 30];
  const angle = (angleRange[0] + Math.random() * (angleRange[1] - angleRange[0])) * Math.PI / 180;
  const horizontal = normalizeVector([target[0] - start[0], 0, target[2] - start[2]]);
  const speed = Math.hypot(...baseline) * multiplier;
  return [
    horizontal[0] * speed * Math.cos(angle),
    -speed * Math.sin(angle),
    horizontal[2] * speed * Math.cos(angle),
  ];
}

function velocityToTarget(start, target, time) {
  return [
    (target[0] - start[0]) / time,
    (target[1] - start[1] - 0.5 * -9.8 * time * time) / time,
    (target[2] - start[2]) / time,
  ];
}

function normalShotFlightTime(flightTime, isServe, shotType = 'normal') {
  return !isServe && (!shotType || shotType === 'normal')
    ? flightTime * NORMAL_SHOT_ARC_TIME_SCALE
    : flightTime;
}

function ensureNetClearance(start, velocity, toward) {
  if (velocity[2] * toward <= 0) return velocity;
  const timeToNet = -start[2] / velocity[2];
  if (timeToNet <= 0 || timeToNet > 2) return velocity;

  const minY = COURT.netHeight + 0.28;
  const netY = start[1] + velocity[1] * timeToNet + 0.5 * -9.8 * timeToNet * timeToNet;
  if (netY < minY) {
    velocity[1] = (minY - start[1] - 0.5 * -9.8 * timeToNet * timeToNet) / timeToNet;
  }
  return velocity;
}
