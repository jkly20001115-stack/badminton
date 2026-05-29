import * as THREE from '/vendor/three.module.js';

const COURT = {
  halfLength: 6.7,
  halfWidth: 3.05,
  singlesHalfWidth: 2.59,
  shortServiceZ: 1.98,
  doublesLongServiceZ: 5.94,
  netHeight: 1.55,
  playerY: 1.65,
  minPlayerZ: { A: -6.45, B: 0.55 },
  maxPlayerZ: { A: -0.55, B: 6.45 },
};

const GRAVITY = -9.8;
const POINTER_SENSITIVITY = 0.0023;
const HIT_COOLDOWN = 420;
const MAX_CHARGE_MS = 1200;
const MIN_HIT_POWER = 0.75;
const MAX_HIT_POWER = 1.45;

const DIFFICULTY = {
  easy: { label: '简单', speed: 3.1, baseError: 0.2, aim: 0.62, serveDelay: 1150 },
  normal: { label: '普通', speed: 4.1, baseError: 0.12, aim: 0.82, serveDelay: 900 },
  hard: { label: '困难', speed: 5.05, baseError: 0.06, aim: 0.94, serveDelay: 680 },
};

const dom = {
  canvas: document.querySelector('#gameCanvas'),
  menu: document.querySelector('#menu'),
  singlePanel: document.querySelector('#singlePanel'),
  multiPanel: document.querySelector('#multiPanel'),
  hud: document.querySelector('#hud'),
  endScreen: document.querySelector('#endScreen'),
  pauseScreen: document.querySelector('#pauseScreen'),
  crosshair: document.querySelector('#crosshair'),
  toast: document.querySelector('#toast'),
  pauseFab: document.querySelector('#pauseFab'),
  singleModeBtn: document.querySelector('#singleModeBtn'),
  multiModeBtn: document.querySelector('#multiModeBtn'),
  startSingleBtn: document.querySelector('#startSingleBtn'),
  difficultySelect: document.querySelector('#difficultySelect'),
  createRoomBtn: document.querySelector('#createRoomBtn'),
  joinRoomBtn: document.querySelector('#joinRoomBtn'),
  readyBtn: document.querySelector('#readyBtn'),
  playerNameInput: document.querySelector('#playerNameInput'),
  roomCodeInput: document.querySelector('#roomCodeInput'),
  roomStatus: document.querySelector('#roomStatus'),
  localScore: document.querySelector('#localScore'),
  awayScore: document.querySelector('#awayScore'),
  gameScore: document.querySelector('#gameScore'),
  setNumber: document.querySelector('#setNumber'),
  messageBar: document.querySelector('#messageBar'),
  endTitle: document.querySelector('#endTitle'),
  setSummary: document.querySelector('#setSummary'),
  playAgainBtn: document.querySelector('#playAgainBtn'),
  quitBtn: document.querySelector('#quitBtn'),
  pauseTitle: document.querySelector('#pauseTitle'),
  pauseText: document.querySelector('#pauseText'),
  resumeBtn: document.querySelector('#resumeBtn'),
  pauseQuitBtn: document.querySelector('#pauseQuitBtn'),
};

const state = {
  mode: 'menu',
  localSeat: 'A',
  opponentSeat: 'B',
  keys: new Set(),
  local: makePlayer('A'),
  opponent: makePlayer('B'),
  ai: makeAi(),
  ball: makeBall('A'),
  match: makeMatch(),
  lastLocalHitAt: -Infinity,
  roomId: '',
  ready: false,
  ws: null,
  lastInputSentAt: 0,
  previousPhase: '',
  paused: false,
  pauseOpen: false,
  isCharging: false,
  chargeStartedAt: 0,
};

let renderer;
let scene;
let camera;
let clock;
let shuttle;
let avatarA;
let avatarB;
let racketGroup;
let menuCameraAngle = 0;

initScene();
bindUi();
applyLaunchParams();
animate();

function initScene() {
  renderer = new THREE.WebGLRenderer({ canvas: dom.canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x15262a);
  scene.fog = new THREE.Fog(0x15262a, 14, 34);

  camera = new THREE.PerspectiveCamera(72, 1, 0.05, 120);
  camera.position.set(0, 4.8, -9.8);
  camera.lookAt(0, 0.4, 0);
  scene.add(camera);

  clock = new THREE.Clock();

  buildLights();
  buildCourt();
  shuttle = createShuttle();
  scene.add(shuttle);

  avatarA = createAvatar(0xffcf5a);
  avatarB = createAvatar(0x5fe0ba);
  scene.add(avatarA, avatarB);

  racketGroup = createFirstPersonRacket();
  camera.add(racketGroup);

  window.addEventListener('resize', resize);
  resize();
}

function buildLights() {
  const ambient = new THREE.HemisphereLight(0xdcefff, 0x1d4037, 1.3);
  scene.add(ambient);

  const key = new THREE.DirectionalLight(0xffffff, 2.15);
  key.position.set(-4, 9, -5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -9;
  key.shadow.camera.right = 9;
  key.shadow.camera.top = 9;
  key.shadow.camera.bottom = -9;
  scene.add(key);

  const rim = new THREE.PointLight(0xffcf5a, 1.4, 28);
  rim.position.set(3, 4.5, 4);
  scene.add(rim);
}

function buildCourt() {
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x257d71, roughness: 0.72, metalness: 0.02 });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(COURT.halfWidth * 2 + 0.6, 0.08, COURT.halfLength * 2 + 0.6), floorMat);
  floor.position.y = -0.04;
  floor.receiveShadow = true;
  scene.add(floor);

  const surroundMat = new THREE.MeshStandardMaterial({ color: 0x28363a, roughness: 0.9 });
  const surround = new THREE.Mesh(new THREE.BoxGeometry(14, 0.05, 20), surroundMat);
  surround.position.y = -0.09;
  surround.receiveShadow = true;
  scene.add(surround);

  const lineMat = new THREE.MeshBasicMaterial({ color: 0xf8f5df });
  const serviceMat = new THREE.MeshBasicMaterial({ color: 0xe8efe3 });
  const outer = 0.07;
  const inner = 0.045;

  addLine(0, -COURT.halfLength, COURT.halfWidth * 2, outer, lineMat);
  addLine(0, COURT.halfLength, COURT.halfWidth * 2, outer, lineMat);
  addLine(-COURT.halfWidth, 0, outer, COURT.halfLength * 2, lineMat);
  addLine(COURT.halfWidth, 0, outer, COURT.halfLength * 2, lineMat);

  addLine(-COURT.singlesHalfWidth, 0, inner, COURT.halfLength * 2, serviceMat);
  addLine(COURT.singlesHalfWidth, 0, inner, COURT.halfLength * 2, serviceMat);
  addLine(0, -COURT.shortServiceZ, COURT.halfWidth * 2, inner, serviceMat);
  addLine(0, COURT.shortServiceZ, COURT.halfWidth * 2, inner, serviceMat);
  addLine(0, -COURT.doublesLongServiceZ, COURT.halfWidth * 2, inner, serviceMat);
  addLine(0, COURT.doublesLongServiceZ, COURT.halfWidth * 2, inner, serviceMat);
  addLine(0, -(COURT.halfLength + COURT.shortServiceZ) / 2, inner, COURT.halfLength - COURT.shortServiceZ, serviceMat);
  addLine(0, (COURT.halfLength + COURT.shortServiceZ) / 2, inner, COURT.halfLength - COURT.shortServiceZ, serviceMat);

  const netMat = new THREE.MeshStandardMaterial({
    color: 0xf7f3dd,
    transparent: true,
    opacity: 0.2,
    roughness: 0.85,
    side: THREE.DoubleSide,
  });
  const net = new THREE.Mesh(new THREE.PlaneGeometry(COURT.halfWidth * 2 + 0.35, COURT.netHeight), netMat);
  net.position.set(0, COURT.netHeight / 2, 0);
  scene.add(net);

  const tapeMat = new THREE.MeshStandardMaterial({ color: 0xf8f5df, roughness: 0.48 });
  addNetBand(0, COURT.netHeight, COURT.halfWidth * 2 + 0.55, 0.075, tapeMat);
  addNetBand(0, 0.12, COURT.halfWidth * 2 + 0.35, 0.035, tapeMat);

  const meshMat = new THREE.MeshBasicMaterial({ color: 0xdfe9da, transparent: true, opacity: 0.56 });
  for (let x = -COURT.halfWidth; x <= COURT.halfWidth + 0.001; x += 0.38) {
    addNetBand(x, COURT.netHeight / 2, 0.018, COURT.netHeight - 0.16, meshMat);
  }
  for (let y = 0.32; y < COURT.netHeight; y += 0.28) {
    addNetBand(0, y, COURT.halfWidth * 2 + 0.25, 0.014, meshMat);
  }

  const postMat = new THREE.MeshStandardMaterial({ color: 0xf8f5df, roughness: 0.5 });
  [-COURT.halfWidth - 0.18, COURT.halfWidth + 0.18].forEach((x) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, COURT.netHeight + 0.32, 16), postMat);
    post.position.set(x, (COURT.netHeight + 0.32) / 2, 0);
    post.castShadow = true;
    scene.add(post);
  });
}

function addLine(x, z, width, depth, material) {
  const line = new THREE.Mesh(new THREE.BoxGeometry(width, 0.018, depth), material);
  line.position.set(x, 0.02, z);
  scene.add(line);
}

function addNetBand(x, y, width, height, material) {
  const band = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.026), material);
  band.position.set(x, y, 0);
  scene.add(band);
}

function createAvatar(color) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.55 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x172124, roughness: 0.7 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xf0c6a0, roughness: 0.6 });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.82, 8, 16), bodyMat);
  body.position.y = 0.86;
  body.castShadow = true;
  group.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 18, 12), skinMat);
  head.position.y = 1.55;
  head.castShadow = true;
  group.add(head);

  const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.7, 10), darkMat);
  legL.position.set(-0.09, 0.35, 0);
  legL.castShadow = true;
  const legR = legL.clone();
  legR.position.x = 0.09;
  group.add(legL, legR);

  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.62, 10), skinMat);
  arm.position.set(0.31, 1.1, 0.05);
  arm.rotation.z = -0.75;
  arm.castShadow = true;
  group.add(arm);

  const racket = createRacketMesh();
  racket.position.set(0.52, 1.17, 0.18);
  racket.rotation.set(0.3, 0.2, -0.45);
  group.add(racket);

  return group;
}

function createFirstPersonRacket() {
  const group = createRacketMesh();
  group.position.set(0.48, -0.42, -0.86);
  group.rotation.set(-0.22, 0.16, -0.52);
  return group;
}

function createRacketMesh() {
  const group = new THREE.Group();
  const handleMat = new THREE.MeshStandardMaterial({ color: 0x20272a, roughness: 0.45 });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xffcf5a, metalness: 0.22, roughness: 0.38 });
  const stringMat = new THREE.MeshBasicMaterial({ color: 0xf8f5df, transparent: true, opacity: 0.72 });

  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.034, 0.52, 12), handleMat);
  handle.rotation.x = Math.PI / 2;
  handle.position.z = 0.18;
  group.add(handle);

  const frame = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.012, 10, 26), frameMat);
  frame.scale.y = 1.28;
  frame.position.z = -0.12;
  frame.rotation.x = Math.PI / 2;
  group.add(frame);

  for (let i = -2; i <= 2; i += 1) {
    const vertical = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.006, 0.36), stringMat);
    vertical.position.set(i * 0.055, 0, -0.12);
    group.add(vertical);

    const horizontal = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.006, 0.006), stringMat);
    horizontal.position.set(0, 0, -0.12 + i * 0.055);
    group.add(horizontal);
  }

  return group;
}

function createShuttle() {
  const group = new THREE.Group();
  const cork = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 18, 12),
    new THREE.MeshStandardMaterial({ color: 0xf4d2a3, roughness: 0.65 }),
  );
  cork.castShadow = true;
  group.add(cork);

  const skirt = new THREE.Mesh(
    new THREE.ConeGeometry(0.22, 0.34, 20, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xf7f4e9, roughness: 0.82, transparent: true, opacity: 0.94 }),
  );
  skirt.position.z = 0.18;
  skirt.rotation.x = Math.PI / 2;
  skirt.castShadow = true;
  group.add(skirt);
  return group;
}

function bindUi() {
  dom.singleModeBtn.addEventListener('click', () => showOnly(dom.singlePanel));
  dom.multiModeBtn.addEventListener('click', () => showOnly(dom.multiPanel));
  document.querySelectorAll('.back-menu').forEach((button) => button.addEventListener('click', goMenu));
  dom.startSingleBtn.addEventListener('click', startSingle);
  dom.createRoomBtn.addEventListener('click', createRoom);
  dom.joinRoomBtn.addEventListener('click', joinRoom);
  dom.readyBtn.addEventListener('click', toggleReady);
  dom.playAgainBtn.addEventListener('click', playAgain);
  dom.quitBtn.addEventListener('click', goMenu);
  dom.pauseFab.addEventListener('click', openPauseMenu);
  dom.resumeBtn.addEventListener('click', closePauseMenu);
  dom.pauseQuitBtn.addEventListener('click', quitCurrentMatch);

  window.addEventListener('keydown', (event) => {
    if (event.code === 'Escape' && isPlaying()) {
      event.preventDefault();
      togglePauseMenu();
      return;
    }

    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight'].includes(event.code)) {
      state.keys.add(event.code);
      event.preventDefault();
    }
  });

  window.addEventListener('keyup', (event) => {
    state.keys.delete(event.code);
  });

  document.addEventListener('mousemove', (event) => {
    if (document.pointerLockElement !== dom.canvas || !isPlaying() || state.pauseOpen) return;
    state.local.yaw = normalizeAngle(state.local.yaw + event.movementX * POINTER_SENSITIVITY);
    state.local.pitch = 0;
  });

  document.addEventListener('pointerlockchange', () => {
    dom.crosshair.classList.toggle('hidden', document.pointerLockElement !== dom.canvas || !isPlaying() || state.pauseOpen);
  });

  document.addEventListener('mousedown', (event) => {
    if (event.button !== 0 || !isPlaying() || state.pauseOpen) return;
    const pointerLocked = document.pointerLockElement === dom.canvas;
    const onCanvas = event.target === dom.canvas;
    if (!pointerLocked && !onCanvas) return;

    event.preventDefault();
    if (!pointerLocked) {
      dom.canvas.requestPointerLock();
    }
    beginCharge();
  });

  document.addEventListener('mouseup', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    releaseCharge();
  });

  window.addEventListener('blur', cancelCharge);
}

function applyLaunchParams() {
  const params = new URLSearchParams(location.search);
  if (params.get('mode') === 'single') {
    const difficulty = params.get('difficulty');
    if (difficulty && DIFFICULTY[difficulty]) dom.difficultySelect.value = difficulty;
    setTimeout(startSingle, 80);
  }
}

function startSingle() {
  disconnectSocket();
  state.mode = 'single';
  state.localSeat = 'A';
  state.opponentSeat = 'B';
  state.local = makePlayer('A');
  state.opponent = makePlayer('B');
  state.ai = makeAi(dom.difficultySelect.value);
  state.match = makeMatch();
  state.match.phase = 'serve';
  state.match.message = '你方发球';
  state.ball = makeBall('A');
  state.previousPhase = '';
  state.lastLocalHitAt = -Infinity;
  state.paused = false;
  state.pauseOpen = false;
  cancelCharge();
  dom.pauseScreen.classList.add('hidden');
  showGameHud();
  updateHud();
  toast('按住鼠标左键蓄力，松开击球');
}

function createRoom() {
  connectSocket(() => {
    state.ws.send(JSON.stringify({ type: 'create', name: getPlayerName() }));
  });
}

function joinRoom() {
  const roomId = dom.roomCodeInput.value.trim().toUpperCase();
  if (!roomId) {
    toast('请输入房间号');
    return;
  }
  connectSocket(() => {
    state.ws.send(JSON.stringify({ type: 'join', roomId, name: getPlayerName() }));
  });
}

function connectSocket(onOpen) {
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    onOpen();
    return;
  }

  disconnectSocket();
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  state.ws = new WebSocket(`${protocol}//${location.host}/ws`);
  dom.roomStatus.textContent = '正在连接服务器...';

  state.ws.addEventListener('open', onOpen);
  state.ws.addEventListener('message', (event) => handleServerMessage(JSON.parse(event.data)));
  state.ws.addEventListener('close', () => {
    if (state.mode === 'multi') dom.roomStatus.textContent = '连接已断开';
  });
  state.ws.addEventListener('error', () => {
    toast('连接服务器失败，请确认本地服务正在运行');
  });
}

function handleServerMessage(message) {
  if (message.type === 'error') {
    toast(message.message || '服务器错误');
    return;
  }

  if (message.type === 'joined') {
    state.mode = 'multi';
    state.roomId = message.roomId;
    state.localSeat = message.seat;
    state.opponentSeat = opponent(message.seat);
    state.local = makePlayer(state.localSeat);
    state.opponent = makePlayer(state.opponentSeat);
    state.lastLocalHitAt = -Infinity;
    state.ready = false;
    state.paused = false;
    state.pauseOpen = false;
    dom.pauseScreen.classList.add('hidden');
    dom.readyBtn.textContent = '准备';
    dom.readyBtn.classList.remove('hidden');
    applyRoomState(message.state);
    updateRoomStatus(message.state);
    return;
  }

  if (message.type === 'room' || message.type === 'state') {
    applyRoomState(message.state);
    updateRoomStatus(message.state);
  }
}

function applyRoomState(roomState) {
  if (!roomState) return;
  state.roomId = roomState.id;
  state.match = roomState.match;
  state.ball = {
    position: vectorFromArray(roomState.ball.position),
    velocity: vectorFromArray(roomState.ball.velocity),
    lastHit: roomState.ball.lastHit,
  };

  const localData = roomState.players[state.localSeat];
  const opponentData = roomState.players[state.opponentSeat];
  if (localData) {
    state.local.position.set(
      localData.position[0],
      localData.position[1],
      localData.position[2],
    );
  }
  if (opponentData) {
    state.opponent.position.set(
      opponentData.position[0],
      opponentData.position[1],
      opponentData.position[2],
    );
    state.opponent.yaw = opponentData.yaw;
    state.opponent.pitch = opponentData.pitch;
    state.opponent.moving = opponentData.moving;
  }

  if (['serve', 'rally', 'pointOver', 'gameOver', 'matchOver'].includes(state.match.phase)) {
    showGameHud();
  }

  updateHud();
  maybeShowEnd();
}

function updateRoomStatus(roomState) {
  if (!roomState || state.mode !== 'multi') return;
  const readyA = roomState.ready.A ? '已准备' : '未准备';
  const readyB = roomState.ready.B ? '已准备' : '未准备';
  const playerA = roomState.names.A || '等待中';
  const playerB = roomState.names.B || '等待中';
  dom.roomStatus.innerHTML = [
    `房间号：<strong>${roomState.id}</strong>`,
    `A 方：${playerA}，${readyA}`,
    `B 方：${playerB}，${readyB}`,
    `状态：${phaseText(roomState.match.phase)}`,
  ].join('<br>');
}

function toggleReady() {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
  state.ready = !state.ready;
  dom.readyBtn.textContent = state.ready ? '取消准备' : '准备';
  state.ws.send(JSON.stringify({ type: 'ready', ready: state.ready }));
}

function beginCharge() {
  if (state.isCharging || !isPlaying() || state.pauseOpen) return;
  if (!canHit(state.localSeat)) {
    swingRacket();
    toast(hitBlockedMessage());
    return;
  }
  state.isCharging = true;
  state.chargeStartedAt = performance.now();
}

function releaseCharge() {
  if (!state.isCharging) return;
  const power = chargePowerFromDuration(performance.now() - state.chargeStartedAt);
  state.isCharging = false;
  state.chargeStartedAt = 0;
  attemptLocalHit(power);
}

function cancelCharge() {
  state.isCharging = false;
  state.chargeStartedAt = 0;
}

function attemptLocalHit(power = 1) {
  if (state.mode === 'multi') {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
    if (!canHit(state.localSeat)) {
      swingRacket();
      toast(hitBlockedMessage());
      return;
    }
    const direction = getAimDirection();
    state.ws.send(JSON.stringify({
      type: 'hit',
      aim: { x: direction.x, y: direction.y, z: direction.z, power },
    }));
    state.lastLocalHitAt = performance.now();
    swingRacket();
    return;
  }

  if (state.mode !== 'single') return;
  if (!canHit(state.localSeat)) {
    swingRacket();
    toast(hitBlockedMessage());
    return;
  }

  const direction = getAimDirection();
  hitBall(state.localSeat, direction, { power });
  state.lastLocalHitAt = performance.now();
  swingRacket();
}

function canHit(seat) {
  if (!['serve', 'rally'].includes(state.match.phase)) return false;
  if (state.match.phase === 'serve' && state.match.server !== seat) return false;
  if (seat === state.localSeat && performance.now() - state.lastLocalHitAt < HIT_COOLDOWN) return false;

  const player = playerForSeat(seat);
  if (state.match.phase === 'serve') {
    state.ball.position.copy(serveBallPosition(seat, player.position));
    state.ball.velocity.set(0, 0, 0);
    state.ball.lastHit = seat;
  }
  const dx = state.ball.position.x - player.position.x;
  const dy = state.ball.position.y - 1.25;
  const dz = state.ball.position.z - player.position.z;
  const radius = state.match.phase === 'serve' ? 3.25 : 2.7;
  return Math.hypot(dx, dy, dz) <= radius && state.ball.position.y >= 0.25 && state.ball.position.y <= 3.6;
}

function hitBall(seat, aimDirection, options = {}) {
  const direction = aimDirection.clone().normalize();
  state.ball.velocity.copy(velocityFromAim(seat, direction, state.ball.position, state.match.phase, options.power));
  state.ball.position.y = Math.max(state.ball.position.y, 0.9);
  state.ball.lastHit = seat;
  state.match.phase = 'rally';
  state.match.rally += 1;
  state.match.message = seat === 'A' ? '你方击球' : '电脑击球';
}

function aiHit(options = {}) {
  const seat = 'B';
  const ai = state.ai;
  if (performance.now() - ai.lastHitAt < HIT_COOLDOWN) return false;

  const distance = state.ball.position.distanceTo(ai.position);
  const heightPenalty = state.ball.position.y < 0.7 || state.ball.position.y > 2.9 ? 0.08 : 0;
  const distancePenalty = clamp((distance - 1.2) * 0.08, 0, 0.16);
  const rallyPenalty = clamp(state.match.rally * 0.005, 0, 0.08);
  const errorChance = clamp(ai.config.baseError + distancePenalty + heightPenalty + rallyPenalty, 0, 0.45);

  ai.lastHitAt = performance.now();

  if (!options.forceServe && Math.random() < errorChance) {
    const roll = Math.random();
    if (roll < 0.38) {
      state.match.message = '电脑漏接';
      return false;
    }
    if (roll < 0.66) {
      state.ball.velocity.set(rand(-0.8, 0.8), rand(0.6, 1.1), rand(-3.6, -2.4));
      state.ball.lastHit = seat;
      state.match.phase = 'rally';
      state.match.message = '电脑回球下网';
      return true;
    }
    const outX = Math.random() < 0.5 ? rand(-5.0, -3.7) : rand(3.7, 5.0);
    launchToTarget(seat, new THREE.Vector3(outX, 0.08, rand(-5.8, -2.5)), rand(0.62, 0.88));
    state.match.message = '电脑回球出界';
    return true;
  }

  const target = pickAiTarget(ai.config.aim);
  launchToTarget(seat, target, rand(0.68, 0.98));
  state.match.message = options.forceServe ? '电脑发球' : '电脑回球';
  return true;
}

function pickAiTarget(quality) {
  const risky = Math.random() < quality * 0.55;
  const xRange = risky ? COURT.halfWidth * 0.9 : COURT.halfWidth * 0.45;
  const z = risky && Math.random() < 0.55 ? rand(-6.15, -4.6) : rand(-3.7, -1.1);
  return new THREE.Vector3(rand(-xRange, xRange), 0.08, z);
}

function launchToTarget(seat, target, flightTime) {
  const start = state.ball.position.clone();
  const velocity = velocityToTarget(start, target, flightTime);
  state.ball.velocity.copy(velocity);
  state.ball.lastHit = seat;
  state.match.phase = 'rally';
  state.match.rally += 1;
}

function velocityToTarget(start, target, time) {
  return new THREE.Vector3(
    (target.x - start.x) / time,
    (target.y - start.y - 0.5 * GRAVITY * time * time) / time,
    (target.z - start.z) / time,
  );
}

function velocityFromAim(seat, direction, start, phase, power = 1) {
  const toward = seat === 'A' ? 1 : -1;
  if (direction.z * toward < 0.2) direction.z = toward * 0.35;

  const hitPower = clamp(Number(power) || 1, MIN_HIT_POWER, MAX_HIT_POWER);
  const frontZ = seat === 'A' ? 0.9 : -0.9;
  const backZ = seat === 'A' ? 6.15 : -6.15;
  const depth = clamp(0.5 + direction.y * 0.78 + (Math.abs(direction.z) - 0.35) * 0.12 + (hitPower - 1) * 0.18, 0.12, 0.98);
  const targetZ = frontZ + (backZ - frontZ) * depth;
  const lateral = clamp((direction.x / Math.max(Math.abs(direction.z), 0.25)) * 2.15, -2.75, 2.75);
  const targetX = clamp(start.x + lateral, -2.75, 2.75);
  const baseTime = phase === 'serve' ? 0.82 + depth * 0.18 : 0.62 + depth * 0.28;
  const flightTime = baseTime / (0.78 + hitPower * 0.35);
  const velocity = velocityToTarget(start, new THREE.Vector3(targetX, 0.08, targetZ), flightTime);
  return ensureNetClearance(start, velocity, toward);
}

function ensureNetClearance(start, velocity, toward) {
  if (velocity.z * toward <= 0) return velocity;
  const timeToNet = -start.z / velocity.z;
  if (timeToNet <= 0 || timeToNet > 2) return velocity;

  const minY = COURT.netHeight + 0.28;
  const netY = start.y + velocity.y * timeToNet + 0.5 * GRAVITY * timeToNet * timeToNet;
  if (netY < minY) {
    velocity.y = (minY - start.y - 0.5 * GRAVITY * timeToNet * timeToNet) / timeToNet;
  }
  return velocity;
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (state.mode === 'single') {
    if (state.paused || state.pauseOpen) {
      updateHud();
      updateCamera();
      updateMeshes(dt);
      renderer.render(scene, camera);
      return;
    }
    updateSingle(dt);
  } else if (state.mode === 'multi') {
    if (!state.pauseOpen) {
      updateLocalMovement(dt);
      maybeSendInput();
    }
  } else {
    updateMenuCamera(dt);
  }

  updateCamera();
  updateMeshes(dt);
  renderer.render(scene, camera);
}

function updateSingle(dt) {
  updateLocalMovement(dt);

  const now = performance.now();
  if (state.match.phase === 'serve') {
    updateServeBallPosition(state.match.server);
  }

  if (state.match.phase === 'serve' && state.match.server === 'B') {
    if (!state.ai.nextServeAt) state.ai.nextServeAt = now + state.ai.config.serveDelay;
    if (now >= state.ai.nextServeAt) {
      state.ai.nextServeAt = 0;
      aiHit({ forceServe: true });
    }
  }

  if (state.match.phase === 'rally') {
    updateBallPhysics(dt);
    updateAiMovement(dt);
    maybeAiHit();
  }

  if (state.match.phase === 'pointOver' && now >= state.match.nextAt) {
    resetBall(state.match.server);
    state.match.phase = 'serve';
    state.match.message = state.match.server === 'A' ? '你方发球' : '电脑发球';
  }

  if (state.match.phase === 'gameOver' && now >= state.match.nextAt) {
    state.match.points = { A: 0, B: 0 };
    state.match.setNumber += 1;
    resetPlayersForSingle();
    resetBall(state.match.server);
    state.match.phase = 'serve';
    state.match.message = `第 ${state.match.setNumber} 局`;
  }

  updateHud();
  maybeShowEnd();
}

function updateBallPhysics(dt) {
  const previousZ = state.ball.position.z;
  state.ball.velocity.y += GRAVITY * dt;
  state.ball.position.addScaledVector(state.ball.velocity, dt);
  state.ball.velocity.x *= 0.996;
  state.ball.velocity.y *= 0.998;
  state.ball.velocity.z *= 0.996;

  if (previousZ * state.ball.position.z <= 0 && Math.abs(state.ball.position.z) < 0.35) {
    const netY = state.ball.position.y;
    if (netY < COURT.netHeight + 0.12) {
      awardPoint(opponent(state.ball.lastHit), '羽毛球下网');
      return;
    }
  }

  if (state.ball.position.y <= 0.08) {
    const inCourt = Math.abs(state.ball.position.x) <= COURT.halfWidth && Math.abs(state.ball.position.z) <= COURT.halfLength;
    const onOpponentSide = state.ball.lastHit === 'A' ? state.ball.position.z > 0 : state.ball.position.z < 0;
    awardPoint(inCourt && onOpponentSide ? state.ball.lastHit : opponent(state.ball.lastHit), inCourt ? '有效落地' : '击球出界');
    return;
  }

  if (Math.abs(state.ball.position.x) > 5.5 || Math.abs(state.ball.position.z) > 8.5 || state.ball.position.y < -1.5) {
    awardPoint(opponent(state.ball.lastHit), '击球出界');
  }
}

function updateAiMovement(dt) {
  const ai = state.ai;
  let target = new THREE.Vector3(0, COURT.playerY, 5.55);

  if (state.ball.lastHit === 'A' || state.ball.velocity.z > 0) {
    const predicted = predictLanding(state.ball.position, state.ball.velocity);
    if (predicted.z > 0) {
      target.set(
        clamp(predicted.x, -COURT.halfWidth + 0.2, COURT.halfWidth - 0.2),
        COURT.playerY,
        clamp(predicted.z, 0.85, COURT.halfLength - 0.35),
      );
    }
  }

  const delta = target.sub(ai.position);
  delta.y = 0;
  const distance = delta.length();
  if (distance > 0.03) {
    ai.position.addScaledVector(delta.normalize(), Math.min(distance, ai.config.speed * dt));
  }
  ai.position.x = clamp(ai.position.x, -COURT.halfWidth, COURT.halfWidth);
  ai.position.z = clamp(ai.position.z, COURT.minPlayerZ.B, COURT.maxPlayerZ.B);
  ai.yaw = Math.atan2(state.ball.position.x - ai.position.x, state.ball.position.z - ai.position.z);
}

function maybeAiHit() {
  if (state.ball.position.z < 0.15) return;
  const dx = state.ball.position.x - state.ai.position.x;
  const dy = state.ball.position.y - 1.25;
  const dz = state.ball.position.z - state.ai.position.z;
  if (Math.hypot(dx, dy, dz) <= 2.05 && state.ball.position.y >= 0.38 && state.ball.position.y <= 3.2) {
    aiHit();
  }
}

function predictLanding(position, velocity) {
  const pos = position.clone();
  const vel = velocity.clone();
  for (let i = 0; i < 120; i += 1) {
    vel.y += GRAVITY * 0.025;
    pos.addScaledVector(vel, 0.025);
    vel.multiplyScalar(0.998);
    if (pos.y <= 0.08) return pos;
  }
  return pos;
}

function updateLocalMovement(dt) {
  if (!isPlaying() || state.paused || state.pauseOpen) return;

  const forward = new THREE.Vector3(Math.sin(state.local.yaw), 0, Math.cos(state.local.yaw));
  const right = new THREE.Vector3(-Math.cos(state.local.yaw), 0, Math.sin(state.local.yaw));
  const move = new THREE.Vector3();
  if (state.keys.has('KeyW')) move.add(forward);
  if (state.keys.has('KeyS')) move.sub(forward);
  if (state.keys.has('KeyD')) move.add(right);
  if (state.keys.has('KeyA')) move.sub(right);

  state.local.moving = move.lengthSq() > 0;
  if (state.local.moving) {
    move.normalize();
    const speed = state.keys.has('ShiftLeft') || state.keys.has('ShiftRight') ? 6.4 : 4.8;
    state.local.position.addScaledVector(move, speed * dt);
    state.local.position.x = clamp(state.local.position.x, -COURT.halfWidth, COURT.halfWidth);
    state.local.position.z = clamp(state.local.position.z, COURT.minPlayerZ[state.localSeat], COURT.maxPlayerZ[state.localSeat]);
  }
}

function maybeSendInput() {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
  const now = performance.now();
  if (now - state.lastInputSentAt < 45) return;
  state.lastInputSentAt = now;
  state.ws.send(JSON.stringify({
    type: 'input',
    state: {
      position: state.local.position.toArray(),
      yaw: state.local.yaw,
      pitch: 0,
      moving: state.local.moving,
    },
  }));
}

function awardPoint(winner, reason) {
  if (!winner || state.match.phase !== 'rally') return;
  state.match.points[winner] += 1;
  state.match.server = winner;
  state.match.message = `${winner === 'A' ? '你方' : '电脑'}得分：${reason}`;
  state.ball.velocity.set(0, 0, 0);

  if (state.match.points[winner] >= 15) {
    state.match.games[winner] += 1;
    state.match.setScores.push({ A: state.match.points.A, B: state.match.points.B, winner });

    if (state.match.games[winner] >= 2) {
      state.match.phase = 'matchOver';
      state.match.winner = winner;
      state.match.message = winner === 'A' ? '你赢得比赛' : '电脑赢得比赛';
      return;
    }

    state.match.phase = 'gameOver';
    state.match.nextAt = performance.now() + 3000;
    state.match.message = `${winner === 'A' ? '你方' : '电脑'}赢得本局`;
    return;
  }

  state.match.phase = 'pointOver';
  state.match.nextAt = performance.now() + 1500;
}

function updateCamera() {
  if (!isPlaying()) return;
  camera.position.copy(state.local.position);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = state.local.yaw + Math.PI;
  camera.rotation.x = 0;
  camera.rotation.z = 0;
}

function updateMenuCamera(dt) {
  menuCameraAngle += dt * 0.18;
  const radius = 10.5;
  camera.position.set(Math.sin(menuCameraAngle) * radius, 5.2, Math.cos(menuCameraAngle) * radius);
  camera.lookAt(0, 0.8, 0);
}

function updateMeshes(dt) {
  shuttle.position.copy(state.ball.position);
  if (state.ball.velocity.lengthSq() > 0.1) {
    const target = state.ball.position.clone().sub(state.ball.velocity.clone().normalize());
    shuttle.lookAt(target);
  }

  avatarA.visible = !(isPlaying() && state.localSeat === 'A');
  avatarB.visible = !(isPlaying() && state.localSeat === 'B');
  placeAvatar(avatarA, state.localSeat === 'A' ? state.local : state.opponent, 'A');
  placeAvatar(avatarB, state.localSeat === 'B' ? state.local : state.opponent, 'B');

  if (state.mode === 'single') {
    placeAvatar(avatarA, state.local, 'A');
    placeAvatar(avatarB, state.ai, 'B');
    avatarA.visible = false;
  }

  const swing = Math.max(0, racketGroup.userData.swingUntil - performance.now());
  racketGroup.rotation.z = -0.52 - Math.sin((swing / 160) * Math.PI) * 0.5;
  racketGroup.rotation.x = -0.22 + Math.sin((swing / 160) * Math.PI) * 0.22;
}

function placeAvatar(avatar, player, seat) {
  avatar.position.set(player.position.x, 0, player.position.z);
  avatar.rotation.y = player.yaw || (seat === 'A' ? 0 : Math.PI);
}

function updateHud() {
  if (!isPlaying()) return;
  const local = state.localSeat;
  const away = state.opponentSeat;
  dom.localScore.textContent = state.match.points?.[local] ?? 0;
  dom.awayScore.textContent = state.match.points?.[away] ?? 0;
  dom.gameScore.textContent = `${state.match.games?.[local] ?? 0} : ${state.match.games?.[away] ?? 0}`;
  dom.setNumber.textContent = `${state.match.setNumber || 1} 局`;
  dom.messageBar.textContent = messageForLocal();
}

function messageForLocal() {
  if (state.isCharging) {
    return `蓄力中：${Math.round(getChargeRatio() * 100)}%（松开左键击球）`;
  }
  const message = state.match.message || '';
  if (state.mode === 'single') return message;
  return message
    .replaceAll(`${state.localSeat} 方`, '你方')
    .replaceAll(`${state.opponentSeat} 方`, '对手')
    .replaceAll(`${state.localSeat}`, '你方')
    .replaceAll(`${state.opponentSeat}`, '对手');
}

function maybeShowEnd() {
  if (state.match.phase !== 'matchOver' || state.previousPhase === 'matchOver') return;
  state.previousPhase = 'matchOver';
  state.paused = false;
  state.pauseOpen = false;
  cancelCharge();
  dom.pauseScreen.classList.add('hidden');
  dom.pauseFab.classList.add('hidden');
  const won = state.match.winner === state.localSeat;
  dom.endTitle.textContent = won ? '你赢得比赛' : '对手赢得比赛';
  const rows = state.match.setScores.map((score, index) => {
    const local = score[state.localSeat];
    const away = score[state.opponentSeat];
    return `<div>第 ${index + 1} 局：${local} : ${away}</div>`;
  });
  dom.setSummary.innerHTML = rows.join('') || '<div>暂无局分记录</div>';
  dom.endScreen.classList.remove('hidden');
  if (document.pointerLockElement === dom.canvas) document.exitPointerLock();
}

function playAgain() {
  dom.endScreen.classList.add('hidden');
  state.previousPhase = '';
  if (state.mode === 'single') {
    startSingle();
    return;
  }
  if (state.mode === 'multi' && state.ws?.readyState === WebSocket.OPEN) {
    state.ready = true;
    dom.readyBtn.textContent = '取消准备';
    state.ws.send(JSON.stringify({ type: 'ready', ready: true }));
  }
}

function togglePauseMenu() {
  if (state.pauseOpen) {
    closePauseMenu();
  } else {
    openPauseMenu();
  }
}

function openPauseMenu() {
  if (!isPlaying() || state.match.phase === 'matchOver') return;
  cancelCharge();
  state.pauseOpen = true;
  state.paused = state.mode === 'single';
  state.keys.clear();
  state.local.moving = false;
  dom.pauseTitle.textContent = state.mode === 'single' ? '已暂停' : '退出对局';
  dom.pauseText.textContent = state.mode === 'single'
    ? '当前单人对局已暂停。'
    : '双人对局不会暂停全局比赛，退出会离开当前房间。';
  dom.pauseScreen.classList.remove('hidden');
  dom.crosshair.classList.add('hidden');
  if (document.pointerLockElement === dom.canvas) document.exitPointerLock();
}

function closePauseMenu() {
  if (!state.pauseOpen) return;
  state.pauseOpen = false;
  state.paused = false;
  dom.pauseScreen.classList.add('hidden');
  if (isPlaying()) {
    toast('点击画面继续比赛');
  }
}

function quitCurrentMatch() {
  if (state.ws?.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify({ type: 'leave' }));
  }
  goMenu();
}

function showOnly(screen) {
  [dom.menu, dom.singlePanel, dom.multiPanel, dom.endScreen, dom.pauseScreen].forEach((item) => item.classList.add('hidden'));
  dom.hud.classList.add('hidden');
  dom.pauseFab.classList.add('hidden');
  screen.classList.remove('hidden');
  state.mode = 'menu';
}

function showGameHud() {
  [dom.menu, dom.singlePanel, dom.multiPanel].forEach((item) => item.classList.add('hidden'));
  dom.hud.classList.remove('hidden');
  if (state.match.phase !== 'matchOver') dom.pauseFab.classList.remove('hidden');
}

function goMenu() {
  if (document.pointerLockElement === dom.canvas) document.exitPointerLock();
  disconnectSocket();
  cancelCharge();
  state.mode = 'menu';
  state.paused = false;
  state.pauseOpen = false;
  state.match = makeMatch();
  state.ball = makeBall('A');
  state.local = makePlayer('A');
  state.opponent = makePlayer('B');
  state.localSeat = 'A';
  state.opponentSeat = 'B';
  state.previousPhase = '';
  dom.readyBtn.classList.add('hidden');
  dom.endScreen.classList.add('hidden');
  dom.pauseScreen.classList.add('hidden');
  dom.pauseFab.classList.add('hidden');
  dom.hud.classList.add('hidden');
  dom.menu.classList.remove('hidden');
  dom.singlePanel.classList.add('hidden');
  dom.multiPanel.classList.add('hidden');
}

function disconnectSocket() {
  if (state.ws) {
    state.ws.close();
    state.ws = null;
  }
}

function swingRacket() {
  racketGroup.userData.swingUntil = performance.now() + 160;
}

function resetPlayersForSingle() {
  state.local = makePlayer('A');
  state.ai.position.set(0, COURT.playerY, 5.8);
  state.ai.yaw = Math.PI;
  state.ai.nextServeAt = 0;
}

function resetBall(serverSeat) {
  state.ball = makeBall(serverSeat);
  updateServeBallPosition(serverSeat);
}

function makePlayer(seat) {
  return {
    position: new THREE.Vector3(0, COURT.playerY, seat === 'A' ? -5.8 : 5.8),
    yaw: seat === 'A' ? 0 : Math.PI,
    pitch: 0,
    moving: false,
  };
}

function makeAi(difficulty = 'normal') {
  return {
    position: new THREE.Vector3(0, COURT.playerY, 5.8),
    yaw: Math.PI,
    pitch: 0,
    moving: false,
    lastHitAt: 0,
    nextServeAt: 0,
    config: DIFFICULTY[difficulty] || DIFFICULTY.normal,
  };
}

function makeBall(serverSeat) {
  return {
    position: new THREE.Vector3(serverSeat === 'A' ? 0.65 : -0.65, 1.45, serverSeat === 'A' ? -4.8 : 4.8),
    velocity: new THREE.Vector3(0, 0, 0),
    lastHit: serverSeat,
  };
}

function updateServeBallPosition(seat) {
  const player = playerForSeat(seat);
  if (!player) return;
  state.ball.position.copy(serveBallPosition(seat, player.position));
  state.ball.velocity.set(0, 0, 0);
  state.ball.lastHit = seat;
}

function serveBallPosition(seat, playerPosition) {
  const toward = seat === 'A' ? 1 : -1;
  const sideOffset = seat === 'A' ? 0.55 : -0.55;
  const minZ = seat === 'A' ? COURT.minPlayerZ.A + 0.35 : 0.18;
  const maxZ = seat === 'A' ? -0.18 : COURT.maxPlayerZ.B - 0.35;
  return new THREE.Vector3(
    clamp(playerPosition.x + sideOffset, -COURT.halfWidth + 0.25, COURT.halfWidth - 0.25),
    1.45,
    clamp(playerPosition.z + toward * 0.9, minZ, maxZ),
  );
}

function makeMatch() {
  return {
    phase: 'waiting',
    message: '等待开始',
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

function getCameraDirection() {
  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);
  return direction.normalize();
}

function getAimDirection() {
  const direction = getCameraDirection();
  direction.y = 0;
  if (direction.lengthSq() < 0.001) {
    direction.set(0, 0, state.localSeat === 'A' ? 1 : -1);
  }
  return direction.normalize();
}

function getChargeRatio() {
  if (!state.isCharging) return 0;
  return clamp((performance.now() - state.chargeStartedAt) / MAX_CHARGE_MS, 0, 1);
}

function chargePowerFromDuration(duration) {
  const ratio = clamp(duration / MAX_CHARGE_MS, 0, 1);
  return MIN_HIT_POWER + (MAX_HIT_POWER - MIN_HIT_POWER) * ratio;
}

function playerForSeat(seat) {
  if (seat === state.localSeat) return state.local;
  if (state.mode === 'single' && seat === 'B') return state.ai;
  return state.opponent;
}

function hitBlockedMessage() {
  if (state.match.phase === 'serve' && state.match.server !== state.localSeat) return '等待对手发球';
  if (!['serve', 'rally'].includes(state.match.phase)) return '当前还不能击球';
  return '请靠近羽毛球后再击球';
}

function vectorFromArray(value) {
  return new THREE.Vector3(Number(value?.[0]) || 0, Number(value?.[1]) || 0, Number(value?.[2]) || 0);
}

function opponent(seat) {
  return seat === 'A' ? 'B' : 'A';
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function normalizeAngle(value) {
  const twoPi = Math.PI * 2;
  return ((value % twoPi) + twoPi) % twoPi;
}

function isPlaying() {
  return state.mode === 'single' || state.mode === 'multi';
}

function getPlayerName() {
  return dom.playerNameInput.value.trim() || 'Player';
}

function phaseText(phase) {
  return {
    waiting: '等待玩家',
    ready: '等待准备',
    serve: '发球',
    rally: '对打中',
    pointOver: '本球结束',
    gameOver: '本局结束',
    matchOver: '比赛结束',
  }[phase] || phase;
}

function toast(message) {
  dom.toast.textContent = message;
  dom.toast.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => dom.toast.classList.add('hidden'), 2400);
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
