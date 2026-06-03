import * as THREE from '/vendor/three.module.js';
import {
  createRealtimeChannel,
  isSupabaseConfigured,
  saveMatchResult,
} from './supabase-game.js';

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
const MIN_PITCH = -0.48;
const MAX_PITCH = 0.56;
const HIT_COOLDOWN = 420;
const MAX_CHARGE_MS = 1200;
const MIN_HIT_POWER = 0.75;
const MAX_HIT_POWER = 1.45;
const JUMP_SPEED = 5.8;
const JUMP_GRAVITY = -13.2;
const RIGHT_DOUBLE_CLICK_MS = 260;
const NORMAL_SHOT_ARC_TIME_SCALE = Math.SQRT2;
const HISTORY_KEY = 'elite-badminton-match-history-v1';

const DIFFICULTY = {
  easy: { label: '简单', speed: 3.25, baseError: 0.16, errorScale: 0.9, aim: 0.68, reach: 2.1, jumpChance: 0.24, smashChance: 0.16, heavySmashChance: 0.04, serveDelay: 1080 },
  normal: { label: '普通', speed: 5.55, baseError: 0.018, errorScale: 0.28, aim: 0.94, reach: 2.5, jumpChance: 0.62, smashChance: 0.34, heavySmashChance: 0.12, serveDelay: 680 },
  hard: { label: '困难', speed: 7.2, baseError: 0.004, errorScale: 0.08, aim: 0.998, reach: 2.82, jumpChance: 0.82, smashChance: 0.52, heavySmashChance: 0.24, serveDelay: 380 },
  tour: { label: '巡回赛', speed: 7.55, baseError: 0.0026, errorScale: 0.055, maxErrorChance: 0.09, aim: 0.999, reach: 2.94, jumpChance: 0.88, smashChance: 0.58, heavySmashChance: 0.3, serveDelay: 340 },
  'all-england': { label: '全英公开赛', speed: 7.9, baseError: 0.0018, errorScale: 0.042, maxErrorChance: 0.09, aim: 0.9992, reach: 3.02, jumpChance: 0.91, smashChance: 0.63, heavySmashChance: 0.36, serveDelay: 310 },
  worlds: { label: '世界锦标赛', speed: 8.3, baseError: 0.0011, errorScale: 0.03, maxErrorChance: 0.09, aim: 0.9995, reach: 3.1, jumpChance: 0.94, smashChance: 0.68, heavySmashChance: 0.42, serveDelay: 280 },
  olympics: { label: '奥运会', speed: 8.75, baseError: 0.0006, errorScale: 0.018, maxErrorChance: 0.09, aim: 0.9998, reach: 3.18, jumpChance: 0.97, smashChance: 0.74, heavySmashChance: 0.48, serveDelay: 245 },
};

const BACKGROUND_ASSETS = {
  default: '/assets/hall-bright.png',
  olympics: '/assets/hall-olympics.png',
  worlds: '/assets/hall-worlds.png',
  'all-england': '/assets/hall-all-england.png',
  'world-tour': '/assets/hall-world-tour.png',
};

const TOURNAMENTS = {
  olympics: {
    name: '奥运会',
    description: '从 16 强一路打进决赛，共 4 轮。越接近奖牌战，对手越稳定。',
    rounds: ['16 强', '四分之一决赛', '半决赛', '金牌赛'],
    aiTier: 'olympics',
    background: BACKGROUND_ASSETS.olympics,
  },
  worlds: {
    name: '世界锦标赛',
    description: '世界锦标赛签表更长，共 5 轮，冠军需要连续战胜不同风格的对手。',
    rounds: ['32 强', '16 强', '四分之一决赛', '半决赛', '决赛'],
    aiTier: 'worlds',
    background: BACKGROUND_ASSETS.worlds,
  },
  'all-england': {
    name: '全英公开赛',
    description: '经典赛场共 4 轮，半决赛开始进入困难强度。',
    rounds: ['16 强', '四分之一决赛', '半决赛', '决赛'],
    aiTier: 'all-england',
    background: BACKGROUND_ASSETS['all-england'],
  },
  'world-tour': {
    name: '世界巡回系列赛',
    description: '模拟系列赛总决赛，共 4 轮，适合逐步挑战更强的人机。',
    rounds: ['小组晋级战', '四分之一决赛', '半决赛', '决赛'],
    aiTier: 'tour',
    background: BACKGROUND_ASSETS['world-tour'],
  },
};

const TOURNAMENT_OPPONENTS = [
  '林曜',
  '安赛龙',
  '桃田悠真',
  '李梓嘉',
  '昆拉武特',
  '乔纳坦',
  '石宇奇',
  '陈雨航',
];

const dom = {
  arenaBackground: document.querySelector('#arenaBackground'),
  canvas: document.querySelector('#gameCanvas'),
  menu: document.querySelector('#menu'),
  singlePanel: document.querySelector('#singlePanel'),
  multiPanel: document.querySelector('#multiPanel'),
  tournamentPanel: document.querySelector('#tournamentPanel'),
  historyPanel: document.querySelector('#historyPanel'),
  hud: document.querySelector('#hud'),
  endScreen: document.querySelector('#endScreen'),
  pauseScreen: document.querySelector('#pauseScreen'),
  crosshair: document.querySelector('#crosshair'),
  toast: document.querySelector('#toast'),
  pauseFab: document.querySelector('#pauseFab'),
  singleModeBtn: document.querySelector('#singleModeBtn'),
  multiModeBtn: document.querySelector('#multiModeBtn'),
  tournamentModeBtn: document.querySelector('#tournamentModeBtn'),
  historyBtn: document.querySelector('#historyBtn'),
  startSingleBtn: document.querySelector('#startSingleBtn'),
  startTournamentBtn: document.querySelector('#startTournamentBtn'),
  difficultySelect: document.querySelector('#difficultySelect'),
  tournamentSelect: document.querySelector('#tournamentSelect'),
  tournamentDescription: document.querySelector('#tournamentDescription'),
  tournamentBadge: document.querySelector('#tournamentBadge'),
  historyList: document.querySelector('#historyList'),
  clearHistoryBtn: document.querySelector('#clearHistoryBtn'),
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
  onlineRoom: null,
  matchStartedAt: 0,
  resultSaveKey: '',
  tournament: null,
  rightClickTimer: null,
  lastRightClickAt: 0,
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
let currentBackgroundPath = BACKGROUND_ASSETS.default;

initScene();
bindUi();
applyLaunchParams();
animate();

function initScene() {
  renderer = new THREE.WebGLRenderer({ canvas: dom.canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene = new THREE.Scene();
  scene.background = null;
  scene.fog = new THREE.Fog(0x38545a, 19, 45);
  setArenaBackground(BACKGROUND_ASSETS.default);

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
  const ambient = new THREE.HemisphereLight(0xf3fbff, 0x356458, 1.72);
  scene.add(ambient);

  const key = new THREE.DirectionalLight(0xffffff, 2.55);
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

function setArenaBackground(path) {
  currentBackgroundPath = path;
  dom.arenaBackground.style.backgroundImage = `url("${currentBackgroundPath}")`;
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
  const lineMat = new THREE.MeshStandardMaterial({ color: 0x111719, roughness: 0.74 });
  const accentMat = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
  const limbs = {};
  const joints = {};
  [
    ['torso', 0.055],
    ['leftThigh', 0.048],
    ['leftShin', 0.044],
    ['rightThigh', 0.048],
    ['rightShin', 0.044],
    ['leftUpperArm', 0.042],
    ['leftForearm', 0.038],
    ['rightUpperArm', 0.042],
    ['rightForearm', 0.038],
  ].forEach(([name, radius]) => {
    limbs[name] = createStickLimb(lineMat, radius);
    group.add(limbs[name]);
  });

  ['hip', 'leftKnee', 'rightKnee', 'leftShoulder', 'rightShoulder', 'leftElbow', 'rightElbow'].forEach((name) => {
    const joint = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), lineMat);
    joint.castShadow = true;
    joints[name] = joint;
    group.add(joint);
  });

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 18, 12), lineMat);
  head.castShadow = true;
  group.add(head);

  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), accentMat);
  chest.scale.set(1.2, 1.45, 0.8);
  group.add(chest);

  const racket = createRacketMesh();
  group.add(racket);
  group.userData.rig = { limbs, joints, head, chest, racket };

  return group;
}

function createStickLimb(material, radius) {
  const limb = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, 1, 10),
    material,
  );
  limb.castShadow = true;
  return limb;
}

function setStickLimb(limb, start, end) {
  limb.position.copy(start).add(end).multiplyScalar(0.5);
  limb.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize());
  limb.scale.set(1, start.distanceTo(end), 1);
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
  const material = new THREE.SpriteMaterial({
    map: new THREE.TextureLoader().load('/assets/shuttle-cartoon.png', (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
    }),
    transparent: true,
    alphaTest: 0.04,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.5, 0.5, 1);
  return sprite;
}

function bindUi() {
  dom.singleModeBtn.addEventListener('click', () => showOnly(dom.singlePanel));
  dom.multiModeBtn.addEventListener('click', () => showOnly(dom.multiPanel));
  dom.tournamentModeBtn.addEventListener('click', () => showOnly(dom.tournamentPanel));
  dom.historyBtn.addEventListener('click', showHistory);
  document.querySelectorAll('.back-menu').forEach((button) => button.addEventListener('click', goMenu));
  dom.startSingleBtn.addEventListener('click', startSingle);
  dom.startTournamentBtn.addEventListener('click', startTournament);
  dom.tournamentSelect.addEventListener('change', updateTournamentDescription);
  dom.clearHistoryBtn.addEventListener('click', clearHistory);
  dom.historyList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-history-delete]');
    if (button) deleteHistoryRecord(button.dataset.historyDelete);
  });
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

    if (event.code === 'Space' && isPlaying()) {
      event.preventDefault();
      tryJump(state.local);
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
    state.local.yaw = normalizeAngle(state.local.yaw - event.movementX * POINTER_SENSITIVITY);
    state.local.pitch = clamp(state.local.pitch - event.movementY * POINTER_SENSITIVITY, MIN_PITCH, MAX_PITCH);
    updateCamera();
  });

  document.addEventListener('pointerlockchange', () => {
    dom.crosshair.classList.toggle('hidden', document.pointerLockElement !== dom.canvas || !isPlaying() || state.pauseOpen);
  });

  document.addEventListener('mousedown', (event) => {
    if (![0, 2].includes(event.button) || !isPlaying() || state.pauseOpen) return;
    const pointerLocked = document.pointerLockElement === dom.canvas;
    const onCanvas = event.target === dom.canvas;
    if (!pointerLocked && !onCanvas) return;

    event.preventDefault();
    if (!pointerLocked) {
      dom.canvas.requestPointerLock();
      toast('鼠标已控制镜头，移动鼠标瞄准，再按住左键蓄力击球');
      return;
    }
    if (event.button === 2) {
      queueSmash();
      return;
    }
    beginCharge();
  });

  document.addEventListener('mouseup', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    releaseCharge();
  });

  window.addEventListener('blur', cancelCharge);
  document.addEventListener('contextmenu', (event) => {
    if (isPlaying()) event.preventDefault();
  });
  updateTournamentDescription();
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
  state.tournament = null;
  beginSoloMatch('single', dom.difficultySelect.value);
}

function startTournament() {
  const eventId = dom.tournamentSelect.value;
  const event = TOURNAMENTS[eventId] || TOURNAMENTS.olympics;
  state.tournament = {
    eventId,
    eventName: event.name,
    rounds: event.rounds,
    roundIndex: 0,
    opponents: makeTournamentOpponents(event.rounds.length),
  };
  beginTournamentRound();
}

function beginTournamentRound() {
  const round = currentTournamentRound();
  if (!round) return;
  const challenge = tournamentDifficultyForRound(state.tournament.eventId, round.index, state.tournament.rounds.length);
  beginSoloMatch('tournament', challenge.tier, challenge.boost);
  toast(`${state.tournament.eventName} · ${round.label}，对手：${round.opponent}`);
}

function beginSoloMatch(mode, difficulty, challengeBoost = 0) {
  disconnectSocket();
  leaveOnlineRoom();
  state.mode = mode;
  state.localSeat = 'A';
  state.opponentSeat = 'B';
  state.local = makePlayer('A');
  state.opponent = makePlayer('B');
  state.ai = makeAi(difficulty, challengeBoost);
  state.match = makeMatch();
  state.match.phase = 'serve';
  state.match.message = '你方发球';
  state.ball = makeBall('A');
  positionServerForServe('A');
  updateServeBallPosition('A');
  state.previousPhase = '';
  state.lastLocalHitAt = -Infinity;
  state.matchStartedAt = performance.now();
  state.resultSaveKey = '';
  state.paused = false;
  state.pauseOpen = false;
  clearPendingSmash();
  setArenaBackground(mode === 'tournament'
    ? TOURNAMENTS[state.tournament.eventId].background
    : BACKGROUND_ASSETS.default);
  cancelCharge();
  dom.pauseScreen.classList.add('hidden');
  showGameHud();
  updateHud();
  toast('鼠标瞄准，左键蓄力，空格起跳，右键杀球，双击右键重杀');
}

function createRoom() {
  if (isSupabaseConfigured() && !shouldUseLocalSocket()) {
    createOnlineRoom().catch(handleOnlineRoomError);
    return;
  }
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
  if (isSupabaseConfigured() && !shouldUseLocalSocket()) {
    joinOnlineRoom(roomId).catch(handleOnlineRoomError);
    return;
  }
  connectSocket(() => {
    state.ws.send(JSON.stringify({ type: 'join', roomId, name: getPlayerName() }));
  });
}

function shouldUseLocalSocket() {
  return ['localhost', '127.0.0.1', '::1'].includes(location.hostname);
}

function connectSocket(onOpen) {
  leaveOnlineRoom();
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
    serve: roomState.ball.serve || null,
  };

  const localData = roomState.players[state.localSeat];
  const opponentData = roomState.players[state.opponentSeat];
  if (localData) {
    state.local.position.set(
      localData.position[0],
      localData.position[1],
      localData.position[2],
    );
    state.local.grounded = localData.grounded ?? state.local.position.y <= COURT.playerY + 0.01;
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
    state.opponent.grounded = opponentData.grounded ?? state.opponent.position.y <= COURT.playerY + 0.01;
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
  if (state.onlineRoom) {
    state.ready = !state.ready;
    dom.readyBtn.textContent = state.ready ? '取消准备' : '准备';
    sendOnlineMessage({ type: 'ready', seat: state.localSeat, ready: state.ready });
    if (state.onlineRoom.isHost) {
      state.onlineRoom.ready[state.localSeat] = state.ready;
      maybeStartOnlineHostMatch();
      updateRoomStatus(getOnlineRoomState());
      broadcastOnlineRoomState();
    }
    return;
  }

  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
  state.ready = !state.ready;
  dom.readyBtn.textContent = state.ready ? '取消准备' : '准备';
  state.ws.send(JSON.stringify({ type: 'ready', ready: state.ready }));
}

async function createOnlineRoom() {
  const roomId = makeRoomCode();
  await setupOnlineRoom({
    roomId,
    seat: 'A',
    isHost: true,
    name: getPlayerName(),
  });
  state.onlineRoom.names.A = getPlayerName();
  updateRoomStatus(getOnlineRoomState());
  toast(`房间已创建：${roomId}`);
}

async function joinOnlineRoom(roomId) {
  await setupOnlineRoom({
    roomId,
    seat: 'B',
    isHost: false,
    name: getPlayerName(),
  });
  sendOnlineMessage({ type: 'join', name: getPlayerName() });
  dom.roomStatus.textContent = `正在加入房间 ${roomId}...`;
  state.onlineRoom.joinTimeoutId = window.setTimeout(() => {
    if (!state.onlineRoom || state.onlineRoom.names.A) return;
    dom.roomStatus.textContent = '未找到该房间，请确认房间号或让房主重新创建';
    dom.readyBtn.classList.add('hidden');
    toast('未收到房主响应');
    leaveOnlineRoom();
  }, 7000);
}

async function setupOnlineRoom({ roomId, seat, isHost, name }) {
  disconnectSocket();
  leaveOnlineRoom();

  state.mode = 'multi';
  state.roomId = roomId;
  state.localSeat = seat;
  state.opponentSeat = opponent(seat);
  state.local = makePlayer(seat);
  state.opponent = makePlayer(state.opponentSeat);
  state.match = makeMatch();
  state.match.phase = 'waiting';
  state.match.message = isHost ? '等待第二名玩家加入' : '等待房主确认加入';
  state.ball = makeBall('A');
  state.ready = false;
  state.lastLocalHitAt = -Infinity;
  state.matchStartedAt = 0;
  state.resultSaveKey = '';

  const clientId = crypto.randomUUID();
  const { client, channel } = await createRealtimeChannel(roomId, handleOnlineMessage);
  state.onlineRoom = {
    client,
    channel,
    clientId,
    roomId,
    isHost,
    names: { A: isHost ? name : '', B: isHost ? '' : name },
    ready: { A: false, B: false },
    lastBroadcastAt: 0,
  };

  dom.readyBtn.textContent = '准备';
  dom.readyBtn.classList.remove('hidden');
}

function handleOnlineMessage(payload) {
  if (!state.onlineRoom || !payload || payload.clientId === state.onlineRoom.clientId) return;

  if (state.onlineRoom.isHost) {
    handleOnlineHostMessage(payload);
    return;
  }

  if (payload.type === 'accepted' && payload.targetClientId === state.onlineRoom.clientId) {
    if (state.onlineRoom.joinTimeoutId) {
      window.clearTimeout(state.onlineRoom.joinTimeoutId);
      state.onlineRoom.joinTimeoutId = 0;
    }
    state.onlineRoom.names = payload.state.names;
    state.onlineRoom.ready = payload.state.ready;
    applyRoomState(payload.state);
    updateRoomStatus(payload.state);
    toast('已加入房间');
    return;
  }

  if (payload.type === 'reject' && payload.targetClientId === state.onlineRoom.clientId) {
    if (state.onlineRoom.joinTimeoutId) {
      window.clearTimeout(state.onlineRoom.joinTimeoutId);
      state.onlineRoom.joinTimeoutId = 0;
    }
    dom.roomStatus.textContent = payload.reason || '加入房间失败';
    dom.readyBtn.classList.add('hidden');
    toast(payload.reason || '加入房间失败');
    leaveOnlineRoom();
    return;
  }

  if (payload.type === 'state' || payload.type === 'room') {
    applyRoomState(payload.state);
    updateRoomStatus(payload.state);
  }
}

function handleOnlineHostMessage(payload) {
  if (!state.onlineRoom.isHost) return;

  if (payload.type === 'join') {
    if (state.onlineRoom.names.B) {
      sendOnlineMessage({ type: 'reject', targetClientId: payload.clientId, reason: '房间已满' });
      return;
    }
    state.onlineRoom.names.B = String(payload.name || 'Player').slice(0, 18);
    state.onlineRoom.ready.B = false;
    state.match.phase = 'ready';
    state.match.message = '等待双方准备';
    sendOnlineMessage({
      type: 'accepted',
      targetClientId: payload.clientId,
      state: getOnlineRoomState(),
    });
    broadcastOnlineRoomState();
    updateRoomStatus(getOnlineRoomState());
    return;
  }

  if (payload.type === 'ready') {
    state.onlineRoom.ready[payload.seat] = Boolean(payload.ready);
    maybeStartOnlineHostMatch();
    broadcastOnlineRoomState();
    updateRoomStatus(getOnlineRoomState());
    return;
  }

  if (payload.type === 'input') {
    applyOnlinePlayerInput(payload.seat, payload.state);
    return;
  }

  if (payload.type === 'hit') {
    const aim = payload.aim || {};
    const direction = new THREE.Vector3(
      Number(aim.x) || 0,
      Number(aim.y) || 0,
      Number(aim.z) || (payload.seat === 'A' ? 1 : -1),
    );
    if (direction.lengthSq() < 0.001) direction.set(0, 0, payload.seat === 'A' ? 1 : -1);
    if (canHit(payload.seat)) {
      hitBall(payload.seat, direction.normalize(), {
        power: Number(aim.power) || 1,
        shotType: normalizeShotType(aim.shotType),
      });
    }
  }
}

function maybeStartOnlineHostMatch() {
  if (!state.onlineRoom?.isHost) return;
  if (!state.onlineRoom.names.B) {
    state.match.phase = 'waiting';
    state.match.message = '等待第二名玩家加入';
    return;
  }
  if (!state.onlineRoom.ready.A || !state.onlineRoom.ready.B) {
    state.match.phase = 'ready';
    state.match.message = '等待双方准备';
    return;
  }
  if (['waiting', 'ready', 'matchOver'].includes(state.match.phase)) {
    state.local = makePlayer('A');
    state.opponent = makePlayer('B');
    state.match = makeMatch();
    state.match.phase = 'serve';
    state.match.message = 'A 方发球';
    state.matchStartedAt = performance.now();
    state.resultSaveKey = '';
    resetBall('A');
    showGameHud();
  }
}

function updateOnlineHost(dt) {
  if (!state.onlineRoom?.isHost) return;
  const now = performance.now();

  if (state.match.phase === 'serve') {
    updateServeBallPosition(state.match.server);
  }

  if (state.match.phase === 'rally') {
    updateBallPhysics(dt);
  }

  if (state.match.phase === 'pointOver' && now >= state.match.nextAt) {
    resetBall(state.match.server);
    state.match.phase = 'serve';
    state.match.message = `${state.match.server} 方发球`;
  }

  if (state.match.phase === 'gameOver' && now >= state.match.nextAt) {
    state.match.points = { A: 0, B: 0 };
    state.match.setNumber += 1;
    resetBall(state.match.server);
    state.match.phase = 'serve';
    state.match.message = `第 ${state.match.setNumber} 局，${state.match.server} 方发球`;
  }

  updateHud();
  maybeShowEnd();
}

function applyOnlinePlayerInput(seat, input = {}) {
  if (!seat || seat === state.localSeat) return;
  const player = seat === state.opponentSeat ? state.opponent : null;
  if (!player || !Array.isArray(input.position)) return;
  player.position.set(input.position[0], input.position[1], input.position[2]);
  player.yaw = Number(input.yaw) || player.yaw;
  player.pitch = clamp(Number(input.pitch) || 0, MIN_PITCH, MAX_PITCH);
  player.moving = Boolean(input.moving);
  player.grounded = player.position.y <= COURT.playerY + 0.01;
}

function sendOnlineMessage(message) {
  if (!state.onlineRoom?.channel) return;
  state.onlineRoom.channel.send({
    type: 'broadcast',
    event: 'game',
    payload: {
      ...message,
      clientId: state.onlineRoom.clientId,
      roomId: state.onlineRoom.roomId,
    },
  });
}

function broadcastOnlineRoomState() {
  if (!state.onlineRoom?.isHost) return;
  const now = performance.now();
  if (now - state.onlineRoom.lastBroadcastAt < 45) return;
  state.onlineRoom.lastBroadcastAt = now;
  sendOnlineMessage({ type: 'state', state: getOnlineRoomState() });
}

function getOnlineRoomState() {
  return {
    id: state.onlineRoom?.roomId || state.roomId,
    names: state.onlineRoom?.names || { A: '', B: '' },
    seats: { A: true, B: Boolean(state.onlineRoom?.names.B) },
    ready: state.onlineRoom?.ready || { A: false, B: false },
    players: {
      A: playerSnapshot(state.localSeat === 'A' ? state.local : state.opponent),
      B: playerSnapshot(state.localSeat === 'B' ? state.local : state.opponent),
    },
    ball: {
      position: state.ball.position.toArray(),
      velocity: state.ball.velocity.toArray(),
      lastHit: state.ball.lastHit,
      serve: state.ball.serve,
    },
    match: state.match,
  };
}

function playerSnapshot(player) {
  return {
    position: player.position.toArray(),
    yaw: player.yaw,
    pitch: player.pitch,
    moving: player.moving,
    grounded: player.grounded,
  };
}

function handleOnlineRoomError(error) {
  console.warn('Supabase online room failed', error);
  dom.roomStatus.textContent = 'Supabase 在线房间连接失败，请检查网络或 Supabase Realtime 状态';
  dom.readyBtn.classList.add('hidden');
  leaveOnlineRoom();
  toast('在线房间连接失败，已保留本地 WebSocket 试玩通道');
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

function clearPendingSmash() {
  if (state.rightClickTimer) {
    window.clearTimeout(state.rightClickTimer);
    state.rightClickTimer = null;
  }
  state.lastRightClickAt = 0;
}

function queueSmash() {
  const now = performance.now();
  if (state.rightClickTimer && now - state.lastRightClickAt <= RIGHT_DOUBLE_CLICK_MS) {
    window.clearTimeout(state.rightClickTimer);
    state.rightClickTimer = null;
    state.lastRightClickAt = 0;
    attemptLocalSmash('heavySmash');
    return;
  }

  clearPendingSmash();
  state.lastRightClickAt = now;
  state.rightClickTimer = window.setTimeout(() => {
    state.rightClickTimer = null;
    state.lastRightClickAt = 0;
    attemptLocalSmash('smash');
  }, RIGHT_DOUBLE_CLICK_MS);
}

function attemptLocalSmash(shotType) {
  if (state.match.phase === 'serve') {
    swingRacket(shotType);
    toast('发球阶段不能杀球');
    return;
  }
  attemptLocalHit(1, shotType);
}

function attemptLocalHit(power = 1, shotType = 'normal') {
  if (state.onlineRoom) {
    if (!canHit(state.localSeat)) {
      swingRacket(shotType);
      toast(hitBlockedMessage());
      return;
    }
    const direction = getAimDirection();
    if (state.onlineRoom.isHost) {
      hitBall(state.localSeat, direction, { power, shotType });
    } else {
      sendOnlineMessage({
        type: 'hit',
        seat: state.localSeat,
        aim: { x: direction.x, y: direction.y, z: direction.z, power, shotType },
      });
    }
    state.lastLocalHitAt = performance.now();
    swingRacket(shotType);
    return;
  }

  if (state.mode === 'multi') {
    if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
    if (!canHit(state.localSeat)) {
      swingRacket(shotType);
      toast(hitBlockedMessage());
      return;
    }
    const direction = getAimDirection();
    state.ws.send(JSON.stringify({
      type: 'hit',
      aim: { x: direction.x, y: direction.y, z: direction.z, power, shotType },
    }));
    state.lastLocalHitAt = performance.now();
    swingRacket(shotType);
    return;
  }

  if (!isSoloMode()) return;
  if (!canHit(state.localSeat)) {
    swingRacket(shotType);
    toast(hitBlockedMessage());
    return;
  }

  const direction = getAimDirection();
  hitBall(state.localSeat, direction, { power, shotType });
  state.lastLocalHitAt = performance.now();
  swingRacket(shotType);
}

function canHit(seat) {
  if (!['serve', 'rally'].includes(state.match.phase)) return false;
  if (state.match.phase === 'serve' && state.match.server !== seat) return false;
  if (seat === state.localSeat && performance.now() - state.lastLocalHitAt < HIT_COOLDOWN) return false;

  const player = playerForSeat(seat);
  if (state.match.phase === 'serve') {
    if (!isValidServePosition(seat, player.position, state.match.points[seat])) return false;
    state.ball.position.copy(serveBallPosition(seat, player.position));
    state.ball.velocity.set(0, 0, 0);
    state.ball.lastHit = seat;
  }
  const dx = state.ball.position.x - player.position.x;
  const dy = state.ball.position.y - (player.position.y - 0.4);
  const dz = state.ball.position.z - player.position.z;
  const radius = state.match.phase === 'serve' ? 3.25 : 2.7;
  const jumpHeight = Math.max(0, player.position.y - COURT.playerY);
  return Math.hypot(dx, dy, dz) <= radius
    && state.ball.position.y >= 0.25
    && state.ball.position.y <= 3.6 + jumpHeight * 0.9;
}

function hitBall(seat, aimDirection, options = {}) {
  const wasServe = state.match.phase === 'serve';
  const direction = aimDirection.clone().normalize();
  state.ball.velocity.copy(velocityFromAim(
    seat,
    direction,
    state.ball.position,
    state.match.phase,
    options.power,
    options.shotType,
  ));
  state.ball.position.y = Math.max(state.ball.position.y, 0.9);
  state.ball.lastHit = seat;
  state.ball.serve = wasServe ? { server: seat, score: state.match.points[seat] } : null;
  state.match.phase = 'rally';
  state.match.rally += 1;
  const shotLabel = options.shotType === 'heavySmash' ? '重杀' : options.shotType === 'smash' ? '杀球' : '击球';
  playerForSeat(seat).swingUntil = performance.now() + (options.shotType === 'heavySmash' ? 280 : 210);
  state.match.message = isSoloMode() ? (seat === 'A' ? `你方${shotLabel}` : `电脑${shotLabel}`) : `${seat} 方${shotLabel}`;
}

function aiHit(options = {}) {
  const seat = 'B';
  const ai = state.ai;
  if (performance.now() - ai.lastHitAt < HIT_COOLDOWN) return false;

  const distance = state.ball.position.distanceTo(ai.position);
  const errorScale = ai.config.errorScale || 1;
  const heightPenalty = (state.ball.position.y < 0.7 || state.ball.position.y > 2.9 ? 0.08 : 0) * errorScale;
  const distancePenalty = clamp((distance - 1.2) * 0.08, 0, 0.16) * errorScale;
  const rallyPenalty = clamp(state.match.rally * 0.005, 0, 0.08) * errorScale;
  const errorChance = clamp(
    ai.config.baseError + distancePenalty + heightPenalty + rallyPenalty,
    0,
    ai.config.maxErrorChance ?? 0.45,
  );

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

  const target = options.forceServe ? pickAiServeTarget(seat) : pickAiTarget(ai.config.aim);
  let shotType = 'normal';
  if (!options.forceServe && state.ball.position.y >= 2.05 && Math.random() < ai.config.smashChance) {
    shotType = state.ball.position.y >= 2.55 && Math.random() < ai.config.heavySmashChance
      ? 'heavySmash'
      : 'smash';
  }
  launchToTarget(seat, target, options.forceServe ? rand(0.88, 1.02) : rand(0.68, 0.98), {
    isServe: options.forceServe,
    shotType,
  });
  ai.swingUntil = performance.now() + (shotType === 'heavySmash' ? 280 : 210);
  state.match.message = options.forceServe
    ? '电脑发球'
    : shotType === 'heavySmash' ? '电脑重杀' : shotType === 'smash' ? '电脑杀球' : '电脑回球';
  return true;
}

function pickAiTarget(quality) {
  const risky = Math.random() < quality * 0.55;
  const xRange = risky ? COURT.halfWidth * 0.9 : COURT.halfWidth * 0.45;
  const z = risky && Math.random() < 0.55 ? rand(-6.15, -4.6) : rand(-3.7, -1.1);
  return new THREE.Vector3(rand(-xRange, xRange), 0.08, z);
}

function pickAiServeTarget(seat) {
  const score = state.match.points[seat];
  const targetSide = -serveSideSign(seat, score);
  const x = targetSide * rand(0.48, COURT.singlesHalfWidth - 0.24);
  const z = seat === 'A'
    ? rand(COURT.shortServiceZ + 0.34, COURT.halfLength - 0.45)
    : rand(-COURT.halfLength + 0.45, -COURT.shortServiceZ - 0.34);
  return new THREE.Vector3(x, 0.08, z);
}

function launchToTarget(seat, target, flightTime, options = {}) {
  const start = state.ball.position.clone();
  const normalFlightTime = normalShotFlightTime(flightTime, Boolean(options.isServe), options.shotType);
  const velocity = options.shotType && options.shotType !== 'normal'
    ? velocityToSmashTarget(start, target, flightTime, options.shotType)
    : velocityToTarget(start, target, normalFlightTime);
  state.ball.velocity.copy(velocity);
  state.ball.lastHit = seat;
  state.ball.serve = options.isServe ? { server: seat, score: state.match.points[seat] } : null;
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

function normalShotFlightTime(flightTime, isServe, shotType = 'normal') {
  return !isServe && (!shotType || shotType === 'normal')
    ? flightTime * NORMAL_SHOT_ARC_TIME_SCALE
    : flightTime;
}

function velocityFromAim(seat, direction, start, phase, power = 1, shotType = 'normal') {
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
  const target = new THREE.Vector3(targetX, 0.08, targetZ);
  if (phase !== 'serve' && shotType !== 'normal') {
    return velocityToSmashTarget(start, target, flightTime, shotType);
  }
  const velocity = velocityToTarget(start, target, normalShotFlightTime(flightTime, phase === 'serve', shotType));
  return ensureNetClearance(start, velocity, toward);
}

function velocityToSmashTarget(start, target, flightTime, shotType) {
  const baseline = velocityToTarget(start, target, flightTime);
  const multiplier = shotType === 'heavySmash' ? 2.25 : 1.75;
  const angle = THREE.MathUtils.degToRad(shotType === 'heavySmash' ? rand(20, 30) : rand(15, 30));
  const horizontal = new THREE.Vector3(target.x - start.x, 0, target.z - start.z);
  if (horizontal.lengthSq() < 0.001) horizontal.z = 1;
  horizontal.normalize();
  const speed = baseline.length() * multiplier;
  return horizontal.multiplyScalar(speed * Math.cos(angle)).setY(-speed * Math.sin(angle));
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

  if (isSoloMode()) {
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
      if (state.onlineRoom?.isHost) {
        updateOnlineHost(dt);
      }
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
      awardPoint(opponent(state.ball.lastHit), state.ball.serve ? '发球下网' : '羽毛球下网');
      return;
    }
  }

  if (state.ball.position.y <= 0.08) {
    const landing = evaluateLanding(state.ball.lastHit, state.ball.position, state.ball.serve);
    awardPoint(landing.winner, landing.reason);
    return;
  }

  if (Math.abs(state.ball.position.x) > 4.2 || Math.abs(state.ball.position.z) > 7.6 || state.ball.position.y < -1.5) {
    awardPoint(opponent(state.ball.lastHit), '击球出界');
  }
}

function evaluateLanding(lastHit, position, serve) {
  const onOpponentSide = lastHit === 'A' ? position.z > 0 : position.z < 0;
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
  return Math.abs(position.x) <= COURT.singlesHalfWidth && Math.abs(position.z) <= COURT.halfLength;
}

function isValidServeLanding(server, score, position) {
  const beyondShortServiceLine = server === 'A'
    ? position.z >= COURT.shortServiceZ
    : position.z <= -COURT.shortServiceZ;
  const expectedTargetSign = -serveSideSign(server, score);
  return beyondShortServiceLine
    && Math.abs(position.x) <= COURT.singlesHalfWidth
    && Math.abs(position.z) <= COURT.halfLength
    && position.x * expectedTargetSign > 0.06;
}

function updateAiMovement(dt) {
  const ai = state.ai;
  updatePlayerJump(ai, dt);
  let target = new THREE.Vector3(0, COURT.playerY, 5.55);

  if (!shouldAiReceiveServe()) {
    ai.moving = false;
    return;
  }

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
  ai.moving = distance > 0.03;
  if (distance > 0.03) {
    ai.position.addScaledVector(delta.normalize(), Math.min(distance, ai.config.speed * dt));
  }
  ai.position.x = clamp(ai.position.x, -COURT.halfWidth, COURT.halfWidth);
  ai.position.z = clamp(ai.position.z, COURT.minPlayerZ.B, COURT.maxPlayerZ.B);
  ai.yaw = Math.atan2(state.ball.position.x - ai.position.x, state.ball.position.z - ai.position.z);

  const horizontalDistance = Math.hypot(state.ball.position.x - ai.position.x, state.ball.position.z - ai.position.z);
  if (
    state.ball.position.z > 0
    && state.ball.position.y > ai.position.y + 0.52
    && horizontalDistance < ai.config.reach + 0.45
    && performance.now() >= ai.nextJumpDecisionAt
  ) {
    ai.nextJumpDecisionAt = performance.now() + 180;
    if (Math.random() < ai.config.jumpChance) tryJump(ai);
  }
}

function maybeAiHit() {
  if (state.ball.position.z < 0.15) return;
  if (!shouldAiReceiveServe()) return;
  const dx = state.ball.position.x - state.ai.position.x;
  const dy = state.ball.position.y - (state.ai.position.y - 0.4);
  const dz = state.ball.position.z - state.ai.position.z;
  const jumpHeight = Math.max(0, state.ai.position.y - COURT.playerY);
  if (
    Math.hypot(dx, dy, dz) <= state.ai.config.reach
    && state.ball.position.y >= 0.38
    && state.ball.position.y <= 3.25 + jumpHeight * 0.95
  ) {
    aiHit();
  }
}

function shouldAiReceiveServe() {
  if (!state.ball.serve || state.ball.serve.server !== 'A' || state.ball.lastHit !== 'A') return true;
  const landing = predictLanding(state.ball.position, state.ball.velocity);
  const shouldReceive = isValidServeLanding(state.ball.serve.server, state.ball.serve.score, landing);
  if (!shouldReceive) state.match.message = '电脑判断发球未落入发球区，选择不接';
  return shouldReceive;
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
  updatePlayerJump(state.local, dt);

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

function tryJump(player) {
  if (!player || !player.grounded) return false;
  player.grounded = false;
  player.verticalVelocity = JUMP_SPEED;
  player.jumpStartedAt = performance.now();
  return true;
}

function updatePlayerJump(player, dt) {
  if (!player || player.grounded) return;
  player.verticalVelocity += JUMP_GRAVITY * dt;
  player.position.y += player.verticalVelocity * dt;
  if (player.position.y <= COURT.playerY) {
    player.position.y = COURT.playerY;
    player.verticalVelocity = 0;
    player.grounded = true;
  }
}

function maybeSendInput() {
  if (state.onlineRoom) {
    const now = performance.now();
    if (now - state.lastInputSentAt < 45) return;
    state.lastInputSentAt = now;
    if (state.onlineRoom.isHost) {
      broadcastOnlineRoomState();
    } else {
      sendOnlineMessage({
        type: 'input',
        seat: state.localSeat,
        state: {
          position: state.local.position.toArray(),
          yaw: state.local.yaw,
          pitch: state.local.pitch,
          moving: state.local.moving,
          grounded: state.local.grounded,
        },
      });
    }
    return;
  }

  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
  const now = performance.now();
  if (now - state.lastInputSentAt < 45) return;
  state.lastInputSentAt = now;
  state.ws.send(JSON.stringify({
    type: 'input',
    state: {
      position: state.local.position.toArray(),
      yaw: state.local.yaw,
      pitch: state.local.pitch,
      moving: state.local.moving,
      grounded: state.local.grounded,
    },
  }));
}

function awardPoint(winner, reason) {
  if (!winner || state.match.phase !== 'rally') return;
  state.match.points[winner] += 1;
  state.match.server = winner;
  state.match.message = `${sideLabel(winner)}得分：${reason}`;
  state.ball.velocity.set(0, 0, 0);

  if (state.match.points[winner] >= 15) {
    state.match.games[winner] += 1;
    state.match.setScores.push({ A: state.match.points.A, B: state.match.points.B, winner });

    if (state.match.games[winner] >= 2) {
      state.match.phase = 'matchOver';
      state.match.winner = winner;
      state.match.message = `${sideLabel(winner)}赢得比赛`;
      return;
    }

    state.match.phase = 'gameOver';
    state.match.nextAt = performance.now() + 3000;
    state.match.message = `${sideLabel(winner)}赢得本局`;
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
  camera.rotation.x = state.local.pitch;
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

  avatarA.visible = !(isPlaying() && state.localSeat === 'A');
  avatarB.visible = !(isPlaying() && state.localSeat === 'B');
  placeAvatar(avatarA, state.localSeat === 'A' ? state.local : state.opponent, 'A');
  placeAvatar(avatarB, state.localSeat === 'B' ? state.local : state.opponent, 'B');

  if (isSoloMode()) {
    placeAvatar(avatarA, state.local, 'A');
    placeAvatar(avatarB, state.ai, 'B');
    avatarA.visible = false;
  }

  const swing = Math.max(0, (racketGroup.userData.swingUntil || 0) - performance.now());
  const smashScale = racketGroup.userData.shotType === 'heavySmash' ? 1.7 : racketGroup.userData.shotType === 'smash' ? 1.35 : 1;
  racketGroup.rotation.z = -0.52 - Math.sin((swing / 210) * Math.PI) * 0.5 * smashScale;
  racketGroup.rotation.x = -0.22 + Math.sin((swing / 210) * Math.PI) * 0.3 * smashScale;
}

function placeAvatar(avatar, player, seat) {
  avatar.position.set(player.position.x, Math.max(0, player.position.y - COURT.playerY), player.position.z);
  avatar.rotation.y = player.yaw || (seat === 'A' ? 0 : Math.PI);
  poseStickAvatar(avatar, player);
}

function poseStickAvatar(avatar, player) {
  const { limbs, joints, head, chest, racket } = avatar.userData.rig;
  const gait = player.moving ? Math.sin(performance.now() * 0.014) : 0;
  const stride = gait * 0.26;
  const swingRatio = clamp(((player.swingUntil || 0) - performance.now()) / 280, 0, 1);
  const swingArc = Math.sin(swingRatio * Math.PI);
  const airborne = !player.grounded;
  const crouch = airborne ? 0.08 : player.moving ? Math.abs(gait) * 0.025 : 0;

  const hip = new THREE.Vector3(0, 0.77 - crouch, 0);
  const chestPoint = new THREE.Vector3(0, 1.16 - crouch, airborne ? -0.04 : 0.025 * gait);
  const shoulderCenter = new THREE.Vector3(0, 1.36 - crouch, airborne ? -0.09 : 0);
  const leftHip = new THREE.Vector3(-0.1, hip.y, 0);
  const rightHip = new THREE.Vector3(0.1, hip.y, 0);
  const leftKnee = new THREE.Vector3(-0.1, 0.42, airborne ? 0.18 : stride);
  const rightKnee = new THREE.Vector3(0.1, 0.42, airborne ? -0.14 : -stride);
  const leftFoot = new THREE.Vector3(-0.11, airborne ? 0.12 : 0.05, airborne ? 0.06 : -stride * 0.78);
  const rightFoot = new THREE.Vector3(0.11, airborne ? 0.16 : 0.05, airborne ? -0.24 : stride * 0.78);
  const leftShoulder = new THREE.Vector3(-0.17, shoulderCenter.y, shoulderCenter.z);
  const rightShoulder = new THREE.Vector3(0.17, shoulderCenter.y, shoulderCenter.z);
  const leftElbow = new THREE.Vector3(-0.36, 1.08 - crouch, -stride * 0.45);
  const leftHand = new THREE.Vector3(-0.42, 0.9 - crouch, stride * 0.36);
  const rightElbow = swingArc > 0
    ? new THREE.Vector3(0.34, 1.47 + swingArc * 0.2, -0.05)
    : new THREE.Vector3(0.36, 1.12 - crouch, stride * 0.35);
  const rightHand = swingArc > 0
    ? new THREE.Vector3(0.42, 1.26 - swingArc * 0.18, 0.18 + swingArc * 0.18)
    : new THREE.Vector3(0.48, 1.01 - crouch, 0.18 - stride * 0.32);

  setStickLimb(limbs.torso, hip, shoulderCenter);
  setStickLimb(limbs.leftThigh, leftHip, leftKnee);
  setStickLimb(limbs.leftShin, leftKnee, leftFoot);
  setStickLimb(limbs.rightThigh, rightHip, rightKnee);
  setStickLimb(limbs.rightShin, rightKnee, rightFoot);
  setStickLimb(limbs.leftUpperArm, leftShoulder, leftElbow);
  setStickLimb(limbs.leftForearm, leftElbow, leftHand);
  setStickLimb(limbs.rightUpperArm, rightShoulder, rightElbow);
  setStickLimb(limbs.rightForearm, rightElbow, rightHand);

  joints.hip.position.copy(hip);
  joints.leftKnee.position.copy(leftKnee);
  joints.rightKnee.position.copy(rightKnee);
  joints.leftShoulder.position.copy(leftShoulder);
  joints.rightShoulder.position.copy(rightShoulder);
  joints.leftElbow.position.copy(leftElbow);
  joints.rightElbow.position.copy(rightElbow);
  chest.position.copy(chestPoint);
  head.position.set(0, shoulderCenter.y + 0.23, shoulderCenter.z);
  racket.position.copy(rightHand).add(new THREE.Vector3(0.13, 0.08, 0.1));
  racket.rotation.set(0.34 - swingArc * 0.8, 0.2, -0.56 - swingArc * 0.4);
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
  const round = currentTournamentRound();
  dom.tournamentBadge.classList.toggle('hidden', !round);
  dom.tournamentBadge.textContent = round
    ? `${state.tournament.eventName} · ${round.label} · 对手 ${round.opponent}`
    : '';
}

function messageForLocal() {
  if (state.isCharging) {
    return `蓄力中：${Math.round(getChargeRatio() * 100)}%（松开左键击球）`;
  }
  const message = state.match.message || '';
  if (isSoloMode()) return message;
  return message
    .replaceAll(`${state.localSeat} 方`, '你方')
    .replaceAll(`${state.opponentSeat} 方`, '对手')
    .replaceAll(`${state.localSeat}`, '你方')
    .replaceAll(`${state.opponentSeat}`, '对手');
}

function sideLabel(seat) {
  if (isSoloMode()) return seat === 'A' ? '你方' : '电脑';
  return `${seat} 方`;
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
  const round = currentTournamentRound();
  const isFinalTournamentRound = round && round.index === state.tournament.rounds.length - 1;
  if (round && won && isFinalTournamentRound) {
    dom.endTitle.textContent = `${state.tournament.eventName}冠军！`;
    dom.playAgainBtn.textContent = '再战本赛事';
  } else if (round && won) {
    dom.endTitle.textContent = `${round.label}晋级`;
    dom.playAgainBtn.textContent = '进入下一轮';
  } else if (round) {
    dom.endTitle.textContent = `${state.tournament.eventName}止步${round.label}`;
    dom.playAgainBtn.textContent = '重新挑战本赛事';
  } else {
    dom.endTitle.textContent = won ? '你赢得比赛' : '对手赢得比赛';
    dom.playAgainBtn.textContent = '再来一场';
  }
  const rows = state.match.setScores.map((score, index) => {
    const local = score[state.localSeat];
    const away = score[state.opponentSeat];
    return `<div>第 ${index + 1} 局：${local} : ${away}</div>`;
  });
  const tournamentSummary = round
    ? `<div>${state.tournament.eventName} · ${round.label} · 对手：${round.opponent}</div>`
    : '';
  dom.setSummary.innerHTML = tournamentSummary + (rows.join('') || '<div>暂无局分记录</div>');
  dom.endScreen.classList.remove('hidden');
  recordMatchResult().catch((error) => {
    console.warn('Failed to save match result', error);
    toast('本机战绩已保存，云端同步失败');
  });
  if (document.pointerLockElement === dom.canvas) document.exitPointerLock();
}

async function recordMatchResult() {
  const key = `${state.mode}:${state.roomId || 'single'}:${state.match.setScores.length}:${state.match.winner}`;
  if (state.resultSaveKey === key) return;
  state.resultSaveKey = key;

  const names = state.onlineRoom?.names || (isSoloMode()
    ? { A: 'Player', B: currentOpponentName() }
    : { A: 'Player', B: 'Player' });
  const winnerName = state.match.winner === 'A' ? names.A : names.B;
  const durationSeconds = state.matchStartedAt
    ? Math.round((performance.now() - state.matchStartedAt) / 1000)
    : null;

  const result = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    roomId: state.mode === 'multi' ? state.roomId : null,
    mode: state.mode,
    playerAName: names.A || 'Player',
    playerBName: names.B || (isSoloMode() ? currentOpponentName() : 'Player'),
    winnerSide: state.match.winner,
    winnerName,
    gamesA: state.match.games.A,
    gamesB: state.match.games.B,
    finalPointsA: state.match.points.A,
    finalPointsB: state.match.points.B,
    setScores: state.match.setScores,
    durationSeconds,
    tournamentName: state.tournament?.eventName || '',
    tournamentRound: currentTournamentRound()?.label || '',
    localSeat: state.localSeat,
  };

  saveLocalMatchResult(result);

  if (state.mode === 'tournament' || !isSupabaseConfigured()) {
    toast('比赛结果已保存到本机战绩');
    return;
  }
  if (state.mode === 'multi' && !state.onlineRoom?.isHost) return;

  await saveMatchResult({ ...result, clientVersion: 'badminton0.2' });
  toast('比赛结果已保存到本机和 Supabase');
}

function playAgain() {
  dom.endScreen.classList.add('hidden');
  state.previousPhase = '';
  if (state.mode === 'single') {
    startSingle();
    return;
  }
  if (state.mode === 'tournament') {
    advanceTournament();
    return;
  }
  if (state.mode === 'multi' && state.ws?.readyState === WebSocket.OPEN) {
    state.ready = true;
    dom.readyBtn.textContent = '取消准备';
    state.ws.send(JSON.stringify({ type: 'ready', ready: true }));
  }
}

function advanceTournament() {
  const round = currentTournamentRound();
  const won = state.match.winner === state.localSeat;
  if (round && won && round.index < state.tournament.rounds.length - 1) {
    state.tournament.roundIndex += 1;
    beginTournamentRound();
    return;
  }
  startTournament();
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
  state.paused = isSoloMode();
  state.keys.clear();
  state.local.moving = false;
  dom.pauseTitle.textContent = isSoloMode() ? '已暂停' : '退出对局';
  dom.pauseText.textContent = isSoloMode()
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
  [dom.menu, dom.singlePanel, dom.multiPanel, dom.tournamentPanel, dom.historyPanel, dom.endScreen, dom.pauseScreen]
    .forEach((item) => item.classList.add('hidden'));
  dom.hud.classList.add('hidden');
  dom.tournamentBadge.classList.add('hidden');
  dom.pauseFab.classList.add('hidden');
  screen.classList.remove('hidden');
  state.mode = 'menu';
}

function showGameHud() {
  [dom.menu, dom.singlePanel, dom.multiPanel, dom.tournamentPanel, dom.historyPanel]
    .forEach((item) => item.classList.add('hidden'));
  dom.hud.classList.remove('hidden');
  if (state.match.phase !== 'matchOver') dom.pauseFab.classList.remove('hidden');
}

function goMenu() {
  if (document.pointerLockElement === dom.canvas) document.exitPointerLock();
  disconnectSocket();
  leaveOnlineRoom();
  cancelCharge();
  clearPendingSmash();
  setArenaBackground(BACKGROUND_ASSETS.default);
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
  state.tournament = null;
  dom.readyBtn.classList.add('hidden');
  dom.endScreen.classList.add('hidden');
  dom.pauseScreen.classList.add('hidden');
  dom.pauseFab.classList.add('hidden');
  dom.hud.classList.add('hidden');
  dom.tournamentBadge.classList.add('hidden');
  dom.menu.classList.remove('hidden');
  dom.singlePanel.classList.add('hidden');
  dom.multiPanel.classList.add('hidden');
  dom.tournamentPanel.classList.add('hidden');
  dom.historyPanel.classList.add('hidden');
}

function disconnectSocket() {
  if (state.ws) {
    state.ws.close();
    state.ws = null;
  }
}

function leaveOnlineRoom() {
  if (state.onlineRoom?.joinTimeoutId) {
    window.clearTimeout(state.onlineRoom.joinTimeoutId);
  }
  if (state.onlineRoom?.client && state.onlineRoom?.channel) {
    state.onlineRoom.client.removeChannel(state.onlineRoom.channel);
  }
  state.onlineRoom = null;
}

function swingRacket(shotType = 'normal') {
  racketGroup.userData.shotType = shotType;
  racketGroup.userData.swingUntil = performance.now() + (shotType === 'heavySmash' ? 280 : 210);
  state.local.swingUntil = racketGroup.userData.swingUntil;
}

function resetPlayersForSingle() {
  state.local = makePlayer('A');
  state.ai.position.set(0, COURT.playerY, 5.8);
  state.ai.yaw = Math.PI;
  state.ai.verticalVelocity = 0;
  state.ai.grounded = true;
  state.ai.nextServeAt = 0;
  state.ai.nextJumpDecisionAt = 0;
}

function resetBall(serverSeat) {
  state.ball = makeBall(serverSeat);
  positionServerForServe(serverSeat);
  updateServeBallPosition(serverSeat);
}

function makePlayer(seat) {
  return {
    position: new THREE.Vector3(0, COURT.playerY, seat === 'A' ? -5.8 : 5.8),
    yaw: seat === 'A' ? 0 : Math.PI,
    pitch: 0,
    moving: false,
    grounded: true,
    verticalVelocity: 0,
    jumpStartedAt: 0,
    swingUntil: 0,
  };
}

function makeAi(difficulty = 'normal', challengeBoost = 0) {
  const base = DIFFICULTY[difficulty] || DIFFICULTY.normal;
  return {
    position: new THREE.Vector3(0, COURT.playerY, 5.8),
    yaw: Math.PI,
    pitch: 0,
    moving: false,
    grounded: true,
    verticalVelocity: 0,
    jumpStartedAt: 0,
    swingUntil: 0,
    lastHitAt: 0,
    nextServeAt: 0,
    nextJumpDecisionAt: 0,
    config: {
      ...base,
      speed: base.speed + challengeBoost * 0.72,
      reach: base.reach + challengeBoost * 0.16,
      smashChance: clamp(base.smashChance + challengeBoost * 0.08, 0, 0.94),
      heavySmashChance: clamp(base.heavySmashChance + challengeBoost * 0.07, 0, 0.78),
      baseError: base.baseError * (1 - challengeBoost * 0.35),
    },
  };
}

function makeBall(serverSeat) {
  return {
    position: new THREE.Vector3(serverSeat === 'A' ? 0.65 : -0.65, 1.45, serverSeat === 'A' ? -4.8 : 4.8),
    velocity: new THREE.Vector3(0, 0, 0),
    lastHit: serverSeat,
    serve: null,
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

function positionServerForServe(seat) {
  const player = playerForSeat(seat);
  if (!player) return;
  player.position.x = serveSideSign(seat, state.match.points[seat]) * 1.22;
  player.position.y = COURT.playerY;
  player.position.z = seat === 'A' ? -5.25 : 5.25;
  player.yaw = seat === 'A' ? 0 : Math.PI;
  player.pitch = 0;
  player.verticalVelocity = 0;
  player.grounded = true;
}

function serveSideSign(seat, score) {
  const rightSide = seat === 'A' ? -1 : 1;
  return Number(score) % 2 === 0 ? rightSide : -rightSide;
}

function isValidServePosition(seat, position, score) {
  const correctHalf = position.x * serveSideSign(seat, score) > 0.08;
  const behindShortServiceLine = seat === 'A'
    ? position.z <= -COURT.shortServiceZ
    : position.z >= COURT.shortServiceZ;
  return correctHalf && behindShortServiceLine;
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

function getAimDirection() {
  const cosPitch = Math.cos(state.local.pitch);
  const direction = new THREE.Vector3(
    Math.sin(state.local.yaw) * cosPitch,
    Math.sin(state.local.pitch),
    Math.cos(state.local.yaw) * cosPitch,
  );
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
  if (isSoloMode() && seat === 'B') return state.ai;
  return state.opponent;
}

function hitBlockedMessage() {
  if (state.match.phase === 'serve' && state.match.server !== state.localSeat) return '等待对手发球';
  if (!['serve', 'rally'].includes(state.match.phase)) return '当前还不能击球';
  if (
    state.match.phase === 'serve'
    && !isValidServePosition(state.localSeat, state.local.position, state.match.points[state.localSeat])
  ) {
    return state.match.points[state.localSeat] % 2 === 0
      ? '当前得分为双数，请站在右侧发球区斜线发球'
      : '当前得分为单数，请站在左侧发球区斜线发球';
  }
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

function normalizeShotType(value) {
  return ['smash', 'heavySmash'].includes(value) ? value : 'normal';
}

function isPlaying() {
  return isSoloMode() || state.mode === 'multi';
}

function isSoloMode() {
  return state.mode === 'single' || state.mode === 'tournament';
}

function updateTournamentDescription() {
  const event = TOURNAMENTS[dom.tournamentSelect.value] || TOURNAMENTS.olympics;
  dom.tournamentDescription.textContent = event.description;
}

function makeTournamentOpponents(count) {
  const offset = Math.floor(Math.random() * TOURNAMENT_OPPONENTS.length);
  return Array.from({ length: count }, (_, index) => TOURNAMENT_OPPONENTS[(offset + index) % TOURNAMENT_OPPONENTS.length]);
}

function currentTournamentRound() {
  if (!state.tournament) return null;
  const index = state.tournament.roundIndex;
  return {
    index,
    label: state.tournament.rounds[index],
    opponent: state.tournament.opponents[index],
  };
}

function currentOpponentName() {
  return currentTournamentRound()?.opponent || 'Computer';
}

function tournamentDifficultyForRound(eventId, index, count) {
  const event = TOURNAMENTS[eventId] || TOURNAMENTS['world-tour'];
  const ratio = count <= 1 ? 1 : index / (count - 1);
  return {
    tier: event.aiTier,
    boost: ratio,
  };
}

function saveLocalMatchResult(result) {
  const history = loadHistory();
  history.unshift(result);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 100)));
}

function loadHistory() {
  try {
    const value = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function showHistory() {
  renderHistory();
  showOnly(dom.historyPanel);
}

function renderHistory() {
  const history = loadHistory();
  if (!history.length) {
    dom.historyList.innerHTML = '<div class="history-empty">还没有比赛记录。完成一场比赛后再回来看看。</div>';
    return;
  }
  dom.historyList.innerHTML = history.map((record) => {
    const won = record.winnerSide === (record.localSeat || 'A');
    const modeLabel = record.mode === 'tournament'
      ? `${record.tournamentName || '淘汰赛'} ${record.tournamentRound || ''}`
      : record.mode === 'multi' ? '双人模式' : '单人模式';
    const time = new Date(record.createdAt).toLocaleString('zh-CN', { hour12: false });
    return `
      <article class="history-card">
        <div class="history-title">${won ? '胜利' : '失利'} · ${escapeHtml(modeLabel)}</div>
        <div class="history-meta">${escapeHtml(record.playerAName)} ${record.gamesA} : ${record.gamesB} ${escapeHtml(record.playerBName)}<br>${escapeHtml(time)}</div>
        <button class="history-delete" type="button" data-history-delete="${escapeHtml(record.id)}">删除</button>
      </article>
    `;
  }).join('');
}

function deleteHistoryRecord(id) {
  const history = loadHistory().filter((record) => record.id !== id);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  renderHistory();
}

function clearHistory() {
  if (!loadHistory().length) return;
  if (!window.confirm('确定清空本机保存的全部比赛记录吗？')) return;
  localStorage.removeItem(HISTORY_KEY);
  renderHistory();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
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
