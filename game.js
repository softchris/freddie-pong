// ═══════════════════════════════════════════════════════════════
// Freddie Pong — Voice-Controlled 3D Pong
// ═══════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // ─── Constants ───────────────────────────────────────────────
  const FIELD_W = 20;
  const FIELD_H = 14;
  const WALL_THICKNESS = 0.4;

  // Paddles (tall, thin, on left/right edges)
  const PADDLE_W = 0.55;
  const PADDLE_H = 2.8;
  const PADDLE_D = 0.55;
  const PADDLE_SPEED = 9;
  const PADDLE_X_OFFSET = 1.2;

  // Ball (green contribution square)
  const BALL_SIZE = 0.45;
  const BALL_DEPTH = 0.22;
  const BALL_SPEED_INITIAL = 5;
  const BALL_SPEED_MAX = 11;
  const BALL_SPEED_INCREMENT = 0.15;

  // Scoring
  const WIN_SCORE = 5;
  const SCORE_PAUSE = 1.2;

  // Colors
  const GITHUB_BG = 0x0d1117;
  const GITHUB_GREENS = [0x9be9a8, 0x40c463, 0x30a14e, 0x216e39];
  const P1_COLOR = 0x58a6ff;
  const P2_COLOR = 0xbc8cff;
  const BALL_COLOR = 0x40c463;

  // Camera
  const CAM_BASE = new THREE.Vector3(0, -2, 24);
  const CAM_LOOKAT = new THREE.Vector3(0, 0, 0);

  // Particles
  const PARTICLE_COUNT = 24;
  const SPARKLE_COUNT = 14;
  const PARTICLE_LIFE = 0.8;
  const SPARKLE_LIFE = 0.5;

  // AI
  const AI_SPEED = 4.0;
  const AI_DEAD_ZONE = 1.2;

  // Voice control — Freddie mode 🎤
  const VOICE_VOLUME_THRESHOLD = 0.003;
  const CALIB_RECORD_FRAMES = 40; // ~1.3s of recording per sound

  // ─── State ───────────────────────────────────────────────────
  let gameState = 'WAITING'; // WAITING | PLAYING | SCORED | GAME_OVER
  let p1Score = 0;
  let p2Score = 0;
  let ballSpeed = BALL_SPEED_INITIAL;
  let rallyCount = 0;
  let screenShake = 0;
  let scorePauseTimer = 0;
  let serveDirection = 1;

  // Keyboard
  let keysDown = {};

  // Voice control state (Freddie mode 🎤)
  let voiceControlActive = false;
  let voiceAnalyser = null;
  let voiceDataArray = null;
  let voiceAudioContext = null;
  let voiceSource = null;
  let voiceStream = null;
  let voiceFreqArray = null;
  let voiceCommand = 'NONE'; // 'UP' | 'DOWN' | 'NONE'
  let voiceVolume = 0;

  // Calibration state
  let ayFingerprint = null;  // Float32Array — average spectrum for "Ay-OH!"
  let ehFingerprint = null;  // Float32Array — average spectrum for "Eh-OH!"
  let calibState = 'IDLE';   // IDLE | RECORD_AY | RECORD_EH | DONE
  let calibFrames = [];
  let calibFrameCount = 0;

  // ─── DOM ─────────────────────────────────────────────────────
  const canvas = document.getElementById('gameCanvas');
  const overlay = document.getElementById('overlay');
  const gameOverEl = document.getElementById('gameOver');
  const gameOverTitle = document.getElementById('gameOverTitle');
  const p1ScoreEl = document.getElementById('p1Score');
  const p2ScoreEl = document.getElementById('p2Score');
  const finalScoreEl = document.getElementById('finalScore');
  const voiceIndicator = document.getElementById('voiceIndicator');
  const voiceFlash = document.getElementById('voiceFlash');
  const micSelect = document.getElementById('micSelect');

  // ─── Three.js Setup ─────────────────────────────────────────
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(GITHUB_BG);
  scene.fog = new THREE.Fog(GITHUB_BG, 30, 50);

  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.copy(CAM_BASE);
  camera.lookAt(CAM_LOOKAT);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // Lighting
  const ambientLight = new THREE.AmbientLight(0x8b949e, 0.4);
  scene.add(ambientLight);

  const mainLight = new THREE.DirectionalLight(0xffffff, 0.8);
  mainLight.position.set(5, 15, 20);
  mainLight.castShadow = true;
  mainLight.shadow.mapSize.set(1024, 1024);
  mainLight.shadow.camera.left = -14;
  mainLight.shadow.camera.right = 14;
  mainLight.shadow.camera.top = 10;
  mainLight.shadow.camera.bottom = -10;
  scene.add(mainLight);

  const rimLight = new THREE.DirectionalLight(0x40c463, 0.3);
  rimLight.position.set(-8, 5, -10);
  scene.add(rimLight);

  const centerLight = new THREE.PointLight(0x40c463, 0.3, 20);
  centerLight.position.set(0, 0, 5);
  scene.add(centerLight);

  // ─── Playing Field ──────────────────────────────────────────
  // Floor
  const floorGeo = new THREE.PlaneGeometry(FIELD_W + 6, FIELD_H + 6);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x0d1117,
    roughness: 0.9,
    metalness: 0.1,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.position.set(0, 0, -0.5);
  floor.receiveShadow = true;
  scene.add(floor);

  // Freddie Mercury background on the table
  const freddieTexture = new THREE.TextureLoader().load('freddie.jpg');
  const freddieMat = new THREE.MeshBasicMaterial({
    map: freddieTexture,
    transparent: true,
    opacity: 0.18,
  });
  const freddieGeo = new THREE.PlaneGeometry(FIELD_W, FIELD_H);
  const freddiePlane = new THREE.Mesh(freddieGeo, freddieMat);
  freddiePlane.position.set(0, 0, -0.44);
  scene.add(freddiePlane);

  // Grid on floor
  const gridHelper = new THREE.GridHelper(30, 30, 0x161b22, 0x161b22);
  gridHelper.rotation.x = Math.PI / 2;
  gridHelper.position.z = -0.45;
  scene.add(gridHelper);

  // Walls (top and bottom only — ball exits left/right for scoring)
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x21262d,
    roughness: 0.7,
    metalness: 0.3,
  });

  function createWall(w, h, d, x, y, z) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, wallMat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }

  // Top wall
  createWall(FIELD_W + 2, WALL_THICKNESS, 0.8, 0, FIELD_H / 2 + WALL_THICKNESS / 2, 0);
  // Bottom wall
  createWall(FIELD_W + 2, WALL_THICKNESS, 0.8, 0, -FIELD_H / 2 - WALL_THICKNESS / 2, 0);

  // Center line (dashed)
  const centerLineMat = new THREE.MeshBasicMaterial({
    color: 0x21262d,
    transparent: true,
    opacity: 0.6,
  });
  const dashCount = 20;
  const dashHeight = FIELD_H / dashCount * 0.5;
  const dashGap = FIELD_H / dashCount;
  for (let i = 0; i < dashCount; i++) {
    const geo = new THREE.BoxGeometry(0.08, dashHeight, 0.08);
    const mesh = new THREE.Mesh(geo, centerLineMat);
    const y = -FIELD_H / 2 + dashGap * 0.5 + i * dashGap;
    mesh.position.set(0, y, -0.2);
    scene.add(mesh);
  }

  // ─── Paddles ────────────────────────────────────────────────
  const p1PaddleX = -FIELD_W / 2 + PADDLE_X_OFFSET;
  const p2PaddleX = FIELD_W / 2 - PADDLE_X_OFFSET;

  const paddleGeo = new THREE.BoxGeometry(PADDLE_W, PADDLE_H, PADDLE_D);

  const p1PaddleMat = new THREE.MeshStandardMaterial({
    color: 0xe6edf3,
    roughness: 0.3,
    metalness: 0.5,
    emissive: P1_COLOR,
    emissiveIntensity: 0.25,
  });
  const p1Paddle = new THREE.Mesh(paddleGeo, p1PaddleMat);
  p1Paddle.position.set(p1PaddleX, 0, 0);
  p1Paddle.castShadow = true;
  scene.add(p1Paddle);

  const p2PaddleMat = new THREE.MeshStandardMaterial({
    color: 0xe6edf3,
    roughness: 0.3,
    metalness: 0.5,
    emissive: P2_COLOR,
    emissiveIntensity: 0.25,
  });
  const p2Paddle = new THREE.Mesh(paddleGeo, p2PaddleMat);
  p2Paddle.position.set(p2PaddleX, 0, 0);
  p2Paddle.castShadow = true;
  scene.add(p2Paddle);

  // Paddle glows
  const p1GlowGeo = new THREE.PlaneGeometry(0.8, PADDLE_H + 1.2);
  const p1GlowMat = new THREE.MeshBasicMaterial({
    color: P1_COLOR,
    transparent: true,
    opacity: 0.1,
    side: THREE.DoubleSide,
  });
  const p1Glow = new THREE.Mesh(p1GlowGeo, p1GlowMat);
  p1Glow.position.set(p1PaddleX - 0.3, 0, -0.2);
  scene.add(p1Glow);

  const p2GlowGeo = new THREE.PlaneGeometry(0.8, PADDLE_H + 1.2);
  const p2GlowMat = new THREE.MeshBasicMaterial({
    color: P2_COLOR,
    transparent: true,
    opacity: 0.1,
    side: THREE.DoubleSide,
  });
  const p2Glow = new THREE.Mesh(p2GlowGeo, p2GlowMat);
  p2Glow.position.set(p2PaddleX + 0.3, 0, -0.2);
  scene.add(p2Glow);

  // ─── Ball (Green Contribution Square) ──────────────────────
  const ballGeo = new THREE.BoxGeometry(BALL_SIZE, BALL_SIZE, BALL_DEPTH);
  const ballMat = new THREE.MeshStandardMaterial({
    color: BALL_COLOR,
    roughness: 0.3,
    metalness: 0.2,
    emissive: BALL_COLOR,
    emissiveIntensity: 0.4,
  });
  const ball = new THREE.Mesh(ballGeo, ballMat);
  ball.castShadow = true;
  scene.add(ball);

  // Ball glow
  const ballGlowGeo = new THREE.BoxGeometry(BALL_SIZE * 2.5, BALL_SIZE * 2.5, BALL_DEPTH);
  const ballGlowMat = new THREE.MeshBasicMaterial({
    color: BALL_COLOR,
    transparent: true,
    opacity: 0.12,
  });
  const ballGlow = new THREE.Mesh(ballGlowGeo, ballGlowMat);
  ball.add(ballGlow);

  let ballVel = new THREE.Vector2(0, 0);

  // Ball trail (green squares)
  const TRAIL_LENGTH = 10;
  const trail = [];
  for (let i = 0; i < TRAIL_LENGTH; i++) {
    const size = BALL_SIZE * (1 - i / TRAIL_LENGTH) * 0.6;
    const geo = new THREE.BoxGeometry(size, size, BALL_DEPTH * 0.5);
    const greenIdx = Math.min(i, GITHUB_GREENS.length - 1);
    const mat = new THREE.MeshBasicMaterial({
      color: GITHUB_GREENS[Math.min(Math.floor(i / 3), GITHUB_GREENS.length - 1)],
      transparent: true,
      opacity: 0.35 * (1 - i / TRAIL_LENGTH),
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    scene.add(mesh);
    trail.push({ mesh, x: 0, y: 0 });
  }

  function resetBallToCenter() {
    ball.position.set(0, 0, 0);
    ballVel.set(0, 0);
    trail.forEach(t => { t.x = 0; t.y = 0; t.mesh.visible = false; });
  }

  function serveBall() {
    ball.position.set(0, 0, 0);
    const angle = (Math.random() - 0.5) * Math.PI * 0.5; // -45° to 45°
    ballVel.set(
      Math.cos(angle) * ballSpeed * serveDirection,
      Math.sin(angle) * ballSpeed
    );
    rallyCount = 0;
  }

  resetBallToCenter();

  // ─── Particle System ───────────────────────────────────────
  const particles = [];

  function spawnScoreExplosion(side) {
    const baseX = side === 'left' ? -FIELD_W / 2 : FIELD_W / 2;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const size = 0.08 + Math.random() * 0.15;
      const geo = new THREE.BoxGeometry(size, size, size);
      const colorIdx = Math.floor(Math.random() * GITHUB_GREENS.length);
      const mat = new THREE.MeshBasicMaterial({
        color: GITHUB_GREENS[colorIdx],
        transparent: true,
        opacity: 1,
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        baseX + (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * FIELD_H * 0.6,
        (Math.random() - 0.5) * 1
      );

      const speed = 3 + Math.random() * 7;
      const angle = Math.random() * Math.PI * 2;
      const elevAngle = (Math.random() - 0.3) * Math.PI;

      mesh.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI
      );

      scene.add(mesh);
      particles.push({
        mesh,
        vel: new THREE.Vector3(
          Math.cos(angle) * Math.cos(elevAngle) * speed * (side === 'left' ? 1 : -1),
          Math.sin(angle) * Math.cos(elevAngle) * speed,
          Math.sin(elevAngle) * speed
        ),
        rotVel: new THREE.Vector3(
          (Math.random() - 0.5) * 12,
          (Math.random() - 0.5) * 12,
          (Math.random() - 0.5) * 12
        ),
        life: PARTICLE_LIFE,
        maxLife: PARTICLE_LIFE,
        type: 'cube',
      });
    }

    for (let i = 0; i < SPARKLE_COUNT; i++) {
      const size = 0.04 + Math.random() * 0.08;
      const geo = new THREE.SphereGeometry(size, 6, 6);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 1,
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        baseX + (Math.random() - 0.5) * 1,
        (Math.random() - 0.5) * FIELD_H * 0.4,
        Math.random() * 0.5
      );

      const speed = 5 + Math.random() * 10;
      const angle = Math.random() * Math.PI * 2;

      scene.add(mesh);
      particles.push({
        mesh,
        vel: new THREE.Vector3(
          Math.cos(angle) * speed * (side === 'left' ? 1 : -1) * 0.5,
          Math.sin(angle) * speed,
          (Math.random() - 0.2) * speed * 0.3
        ),
        rotVel: new THREE.Vector3(0, 0, 0),
        life: SPARKLE_LIFE * (0.5 + Math.random() * 0.5),
        maxLife: SPARKLE_LIFE,
        type: 'sparkle',
      });
    }
  }

  function spawnPaddleHit(px, py, color) {
    for (let i = 0; i < 8; i++) {
      const size = 0.04 + Math.random() * 0.08;
      const geo = new THREE.BoxGeometry(size, size, size);
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 1,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(px, py, 0);
      const speed = 2 + Math.random() * 4;
      const angle = Math.random() * Math.PI * 2;
      scene.add(mesh);
      particles.push({
        mesh,
        vel: new THREE.Vector3(
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          (Math.random() - 0.5) * speed * 0.3
        ),
        rotVel: new THREE.Vector3(
          (Math.random() - 0.5) * 8,
          (Math.random() - 0.5) * 8,
          (Math.random() - 0.5) * 8
        ),
        life: 0.4,
        maxLife: 0.4,
        type: 'cube',
      });
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;

      if (p.life <= 0) {
        scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        particles.splice(i, 1);
        continue;
      }

      const t = 1 - p.life / p.maxLife;
      const ease = t * t;

      p.mesh.position.x += p.vel.x * dt;
      p.mesh.position.y += p.vel.y * dt;
      p.mesh.position.z += p.vel.z * dt;

      if (p.type === 'cube') {
        p.vel.z -= 10 * dt;
        p.vel.x *= (1 - 2.0 * dt);
        p.vel.y *= (1 - 2.0 * dt);
      }

      p.mesh.rotation.x += p.rotVel.x * dt;
      p.mesh.rotation.y += p.rotVel.y * dt;
      p.mesh.rotation.z += p.rotVel.z * dt;

      p.mesh.material.opacity = 1 - ease;
      const s = 1 - ease * 0.7;
      p.mesh.scale.set(s, s, s);

      if (p.type === 'sparkle') {
        p.mesh.material.opacity *= 0.5 + Math.sin(p.life * 30) * 0.5;
      }
    }
  }

  // ─── Voice Control (Freddie Mode 🎤) ──────────────────────
  async function initVoiceControl() {
    const setStatus = (msg) => {
      // Update only the text node (first child), not the select/meter
      const textNode = voiceIndicator.childNodes[0];
      if (textNode.nodeType === Node.TEXT_NODE) {
        textNode.textContent = msg;
      }
      console.log('[Voice]', msg);
    };

    try {
      // Request mic permission first (needed to enumerate devices with labels)
      setStatus('🎤 Requesting mic… ');
      const initialStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      initialStream.getTracks().forEach(t => t.stop());

      // Enumerate audio input devices and populate dropdown
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(d => d.kind === 'audioinput');
      console.log('[Voice] Found audio inputs:', audioInputs.map(d => d.label));

      micSelect.innerHTML = '';
      audioInputs.forEach((d, i) => {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        opt.textContent = d.label || ('Microphone ' + (i + 1));
        micSelect.appendChild(opt);
      });

      // Connect to the selected device
      async function connectMic(deviceId) {
        // Stop previous stream
        if (voiceStream) {
          voiceStream.getTracks().forEach(t => t.stop());
        }
        if (voiceSource) {
          voiceSource.disconnect();
        }

        const constraints = { audio: deviceId ? { deviceId: { exact: deviceId } } : true };
        voiceStream = await navigator.mediaDevices.getUserMedia(constraints);
        const track = voiceStream.getAudioTracks()[0];
        console.log('[Voice] Connected to:', track.label, '| enabled:', track.enabled, '| muted:', track.muted);
        setStatus('🎤 Using: ' + track.label + ' ');

        if (!voiceAudioContext) {
          voiceAudioContext = new (window.AudioContext || window.webkitAudioContext)();
          voiceAnalyser = voiceAudioContext.createAnalyser();
          voiceAnalyser.fftSize = 4096;
          voiceDataArray = new Float32Array(voiceAnalyser.fftSize);
          voiceFreqArray = new Uint8Array(voiceAnalyser.frequencyBinCount);
        }

        voiceSource = voiceAudioContext.createMediaStreamSource(voiceStream);
        voiceSource.connect(voiceAnalyser);
        voiceControlActive = true;
        voiceIndicator.classList.add('active');

        // Always try to resume and always start the processing loop
        try { await voiceAudioContext.resume(); } catch (_) {}
        if (!_voiceLoopRunning) {
          _voiceLoopRunning = true;
          processVoice();
        }

        // Start calibration AFTER audio is running
        const startHint = document.getElementById('startHint');
        if (startHint) startHint.textContent = 'Calibrating voice…';
        if (!ayFingerprint) {
          setTimeout(() => startCalibration(), 500);
        }
      }

      // Connect to default device
      await connectMic(micSelect.value);

      // Switch device on dropdown change (also resumes AudioContext as user gesture)
      micSelect.addEventListener('change', () => {
        if (voiceAudioContext && voiceAudioContext.state !== 'running') {
          voiceAudioContext.resume();
        }
        connectMic(micSelect.value);
      });

      // Handle suspended AudioContext on user gesture
      if (voiceAudioContext && voiceAudioContext.state !== 'running') {
        const onGesture = () => {
          voiceAudioContext.resume().then(() => {
            if (voiceAudioContext.state === 'running') {
              console.log('[Voice] AudioContext resumed via gesture');
              if (!_voiceLoopRunning) {
                _voiceLoopRunning = true;
                processVoice();
              }
              if (!ayFingerprint) {
                setTimeout(() => startCalibration(), 300);
              }
              document.removeEventListener('click', onGesture, true);
              document.removeEventListener('keydown', onGesture, true);
            }
          });
        };
        document.addEventListener('click', onGesture, true);
        document.addEventListener('keydown', onGesture, true);
      }

    } catch (err) {
      console.error('[Voice] init failed:', err);
      const textNode = voiceIndicator.childNodes[0];
      if (textNode.nodeType === Node.TEXT_NODE) {
        textNode.textContent = '🎤 Mic error: ' + err.message + ' ';
      }
    }
  }

  let _voiceLoopRunning = false;
  // ─── Calibration ────────────────────────────────────────────
  const calibOverlay = document.getElementById('calibrationOverlay');
  const calibStep = document.getElementById('calibStep');
  const calibStatus = document.getElementById('calibStatus');
  const calibMeterFill = document.getElementById('calibMeterFill');
  const calibHint = document.getElementById('calibHint');

  function startCalibration() {
    calibOverlay.classList.remove('hidden');
    overlay.classList.add('hidden');
    calibStep.textContent = '🎤';
    calibStep.className = '';
    calibStatus.textContent = 'Choose your microphone, then click below';
    calibHint.textContent = '▶ Click here to start voice training ▶';
    calibHint.style.cursor = 'pointer';
    calibHint.style.color = '#f0c040';
    calibHint.style.fontSize = '18px';

    const beginOnClick = async (e) => {
      if (e.target.tagName === 'SELECT' || e.target.tagName === 'OPTION') return;
      calibHint.removeEventListener('click', beginOnClick);
      calibHint.style.cursor = '';
      calibHint.style.color = '';
      calibHint.style.fontSize = '';

      // Fresh audio setup with the selected device
      const deviceId = micSelect.value;
      try {
        if (voiceStream) voiceStream.getTracks().forEach(t => t.stop());
        if (voiceSource) voiceSource.disconnect();
        if (voiceAudioContext) { try { voiceAudioContext.close(); } catch(_) {} }

        const constraints = deviceId
          ? { audio: { deviceId: { exact: deviceId } } }
          : { audio: true };
        voiceStream = await navigator.mediaDevices.getUserMedia(constraints);
        voiceAudioContext = new (window.AudioContext || window.webkitAudioContext)();
        await voiceAudioContext.resume();
        voiceAnalyser = voiceAudioContext.createAnalyser();
        voiceAnalyser.fftSize = 4096;
        voiceDataArray = new Float32Array(voiceAnalyser.fftSize);
        voiceFreqArray = new Uint8Array(voiceAnalyser.frequencyBinCount);
        voiceSource = voiceAudioContext.createMediaStreamSource(voiceStream);
        voiceSource.connect(voiceAnalyser);
        voiceControlActive = true;

        const track = voiceStream.getAudioTracks()[0];
        console.log('[Voice] Fresh connect:', track.label, 'ctx:', voiceAudioContext.state);

        _voiceLoopRunning = true;
        processVoice();
        beginRecording('AY');
      } catch (err) {
        calibStatus.textContent = 'Mic error: ' + err.message;
        console.error('[Voice] fresh connect failed:', err);
      }
    };
    calibHint.addEventListener('click', beginOnClick);
  }

  function beginRecording(which) {
    calibFrames = [];
    calibFrameCount = 0;
    if (which === 'AY') {
      calibState = 'RECORD_AY';
      calibStep.textContent = 'AY‑OH! ⬆';
      calibStep.className = 'ay';
      calibStatus.textContent = 'Sing your AY‑OH! now…';
      calibHint.textContent = 'Hold the sound for ~2 seconds';
    } else {
      calibState = 'RECORD_EH';
      calibStep.textContent = 'EH‑OH! ⬇';
      calibStep.className = 'eh';
      calibStatus.textContent = 'Now sing your EH‑OH!…';
      calibHint.textContent = 'Hold the sound for ~2 seconds';
    }
  }

  function finishRecording(which) {
    // Average all captured frames into a single fingerprint
    const len = calibFrames[0].length;
    const avg = new Float32Array(len);
    for (const frame of calibFrames) {
      for (let i = 0; i < len; i++) avg[i] += frame[i];
    }
    for (let i = 0; i < len; i++) avg[i] /= calibFrames.length;

    if (which === 'AY') {
      ayFingerprint = avg;
      calibStatus.textContent = 'AY‑OH! captured! ✓';
      setTimeout(() => beginRecording('EH'), 1000);
    } else {
      ehFingerprint = avg;
      calibState = 'DONE';
      calibStep.textContent = '✓ Ready!';
      calibStep.className = 'done';
      calibStatus.textContent = 'Voice calibrated — let\'s rock!';
      calibHint.textContent = '';
      setTimeout(() => {
        calibOverlay.classList.add('hidden');
        overlay.classList.remove('hidden');
        const startHint = document.getElementById('startHint');
        if (startHint) startHint.innerHTML = 'Tap or press <kbd>SPACE</kbd> to start';
      }, 1200);
    }
  }

  function cosineSimilarity(a, b) {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom > 0 ? dot / denom : 0;
  }

  function getSpectrum() {
    voiceAnalyser.getByteFrequencyData(voiceFreqArray);
    // Normalize to 0-1
    const spectrum = new Float32Array(voiceFreqArray.length);
    for (let i = 0; i < voiceFreqArray.length; i++) {
      spectrum[i] = voiceFreqArray[i] / 255;
    }
    return spectrum;
  }

  // ─── Voice Processing Loop ─────────────────────────────────
  function processVoice() {
    if (!voiceControlActive) { _voiceLoopRunning = false; return; }
    requestAnimationFrame(processVoice);

    voiceAnalyser.getFloatTimeDomainData(voiceDataArray);
    const bufLen = voiceDataArray.length;

    // RMS volume
    let rms = 0;
    for (let i = 0; i < bufLen; i++) {
      rms += voiceDataArray[i] * voiceDataArray[i];
    }
    rms = Math.sqrt(rms / bufLen);
    voiceVolume = rms;

    // Update volume meters
    const meterFill = document.getElementById('voiceMeterFill');
    const meterPct = Math.min(rms / 0.15, 1) * 100;
    meterFill.style.width = meterPct + '%';
    meterFill.classList.toggle('loud', rms >= VOICE_VOLUME_THRESHOLD);
    calibMeterFill.style.width = meterPct + '%';

    // ── Calibration mode ──
    if (calibState === 'RECORD_AY' || calibState === 'RECORD_EH') {
      calibMeterFill.classList.toggle('recording', rms >= VOICE_VOLUME_THRESHOLD);
      // Always show live RMS on calibration screen
      calibHint.textContent = 'Volume: ' + (rms * 1000).toFixed(1) + ' — sing into your mic!';
      if (rms >= VOICE_VOLUME_THRESHOLD) {
        const spectrum = getSpectrum();
        calibFrames.push(spectrum);
        calibFrameCount++;
        const progress = Math.round((calibFrameCount / CALIB_RECORD_FRAMES) * 100);
        calibStatus.textContent = 'Recording… ' + progress + '%';
        if (calibFrameCount >= CALIB_RECORD_FRAMES) {
          finishRecording(calibState === 'RECORD_AY' ? 'AY' : 'EH');
        }
      }
      return;
    }

    // ── Gameplay mode — needs calibration data ──
    if (!ayFingerprint || !ehFingerprint) {
      voiceCommand = 'NONE';
      return;
    }

    if (rms < VOICE_VOLUME_THRESHOLD) {
      voiceCommand = 'NONE';
      voiceIndicator.childNodes[0].textContent = '🎤 Sing! ';
      voiceIndicator.classList.remove('voice-up', 'voice-down');
      voiceFlash.className = '';
      return;
    }

    // Compare live spectrum against calibrated fingerprints
    const spectrum = getSpectrum();
    const aySim = cosineSimilarity(spectrum, ayFingerprint);
    const ehSim = cosineSimilarity(spectrum, ehFingerprint);

    if (aySim > ehSim) {
      voiceCommand = 'UP';
      const conf = Math.round(aySim * 100);
      voiceIndicator.childNodes[0].textContent = '🎤 AY‑OH! ⬆ ' + conf + '% ';
      voiceIndicator.classList.add('voice-up');
      voiceIndicator.classList.remove('voice-down');
      voiceFlash.textContent = 'AY‑OH! ⬆';
      voiceFlash.className = 'show-up';
    } else {
      voiceCommand = 'DOWN';
      const conf = Math.round(ehSim * 100);
      voiceIndicator.childNodes[0].textContent = '🎤 EH‑OH! ⬇ ' + conf + '% ';
      voiceIndicator.classList.add('voice-down');
      voiceIndicator.classList.remove('voice-up');
      voiceFlash.textContent = 'EH‑OH! ⬇';
      voiceFlash.className = 'show-down';
    }
  }

  function updatePaddles(dt) {
    const minY = -FIELD_H / 2 + PADDLE_H / 2 + WALL_THICKNESS;
    const maxY = FIELD_H / 2 - PADDLE_H / 2 - WALL_THICKNESS;

    // P1: Voice control + W/S keys
    const p1VoiceUp = voiceControlActive && voiceCommand === 'UP';
    const p1VoiceDown = voiceControlActive && voiceCommand === 'DOWN';

    if (keysDown['KeyW'] || p1VoiceUp) {
      p1Paddle.position.y += PADDLE_SPEED * dt;
    } else if (keysDown['KeyS'] || p1VoiceDown) {
      p1Paddle.position.y -= PADDLE_SPEED * dt;
    }

    // P2: Arrow keys or AI
    if (keysDown['ArrowUp']) {
      p2Paddle.position.y += PADDLE_SPEED * dt;
    } else if (keysDown['ArrowDown']) {
      p2Paddle.position.y -= PADDLE_SPEED * dt;
    } else {
      aiUpdatePaddle(p2Paddle, dt);
    }

    // Clamp
    p1Paddle.position.y = Math.max(minY, Math.min(maxY, p1Paddle.position.y));
    p2Paddle.position.y = Math.max(minY, Math.min(maxY, p2Paddle.position.y));

    // Update glow positions
    p1Glow.position.y = p1Paddle.position.y;
    p2Glow.position.y = p2Paddle.position.y;
  }

  function aiUpdatePaddle(paddle, dt) {
    const targetY = ball.position.y;
    const diff = targetY - paddle.position.y;

    if (Math.abs(diff) > AI_DEAD_ZONE) {
      const dir = Math.sign(diff);
      paddle.position.y += dir * AI_SPEED * dt;
    }
  }

  // ─── Collision Detection ───────────────────────────────────
  function ballPaddleCollision(paddleMesh) {
    const px = paddleMesh.position.x;
    const py = paddleMesh.position.y;
    const halfW = PADDLE_W / 2;
    const halfH = PADDLE_H / 2;
    const bx = ball.position.x;
    const by = ball.position.y;
    const halfBall = BALL_SIZE / 2;

    return (
      bx + halfBall > px - halfW &&
      bx - halfBall < px + halfW &&
      by + halfBall > py - halfH &&
      by - halfBall < py + halfH
    );
  }

  // ─── Physics Update ────────────────────────────────────────
  function updatePhysics(dt) {
    if (gameState !== 'PLAYING') return;

    dt = Math.min(dt, 0.033);

    const bx = ball.position.x + ballVel.x * dt;
    const by = ball.position.y + ballVel.y * dt;

    // Top/bottom wall collisions
    const topBound = FIELD_H / 2 - BALL_SIZE / 2;
    const bottomBound = -FIELD_H / 2 + BALL_SIZE / 2;

    if (by > topBound) {
      ball.position.y = topBound;
      ballVel.y = -Math.abs(ballVel.y);
    } else if (by < bottomBound) {
      ball.position.y = bottomBound;
      ballVel.y = Math.abs(ballVel.y);
    } else {
      ball.position.y = by;
    }

    ball.position.x = bx;

    // P1 paddle collision (left paddle, ball moving left)
    if (ballVel.x < 0 && ballPaddleCollision(p1Paddle)) {
      ball.position.x = p1PaddleX + PADDLE_W / 2 + BALL_SIZE / 2;
      const hitPos = (ball.position.y - p1Paddle.position.y) / (PADDLE_H / 2);
      const maxAngle = Math.PI * 0.35;
      const angle = hitPos * maxAngle;

      rallyCount++;
      ballSpeed = Math.min(BALL_SPEED_MAX, BALL_SPEED_INITIAL + rallyCount * BALL_SPEED_INCREMENT);

      ballVel.x = Math.cos(angle) * ballSpeed;
      ballVel.y = Math.sin(angle) * ballSpeed;

      spawnPaddleHit(p1PaddleX + PADDLE_W / 2, ball.position.y, P1_COLOR);
      screenShake = 0.08;
    }

    // P2 paddle collision (right paddle, ball moving right)
    if (ballVel.x > 0 && ballPaddleCollision(p2Paddle)) {
      ball.position.x = p2PaddleX - PADDLE_W / 2 - BALL_SIZE / 2;
      const hitPos = (ball.position.y - p2Paddle.position.y) / (PADDLE_H / 2);
      const maxAngle = Math.PI * 0.35;
      const angle = hitPos * maxAngle;

      rallyCount++;
      ballSpeed = Math.min(BALL_SPEED_MAX, BALL_SPEED_INITIAL + rallyCount * BALL_SPEED_INCREMENT);

      ballVel.x = -Math.cos(angle) * ballSpeed;
      ballVel.y = Math.sin(angle) * ballSpeed;

      spawnPaddleHit(p2PaddleX - PADDLE_W / 2, ball.position.y, P2_COLOR);
      screenShake = 0.08;
    }

    // Scoring: ball exits left/right
    if (ball.position.x < -FIELD_W / 2 - 2) {
      playerScored(2);
    } else if (ball.position.x > FIELD_W / 2 + 2) {
      playerScored(1);
    }
  }

  // ─── Score & Game State ────────────────────────────────────
  function updateScoreDisplay() {
    p1ScoreEl.textContent = p1Score;
    p2ScoreEl.textContent = p2Score;
  }

  function flashScore(el) {
    el.classList.remove('score-flash');
    void el.offsetWidth; // force reflow
    el.classList.add('score-flash');
  }

  function playerScored(player) {
    if (player === 1) {
      p1Score++;
      flashScore(p1ScoreEl);
      serveDirection = 1; // serve toward P2
      spawnScoreExplosion('right');
    } else {
      p2Score++;
      flashScore(p2ScoreEl);
      serveDirection = -1; // serve toward P1
      spawnScoreExplosion('left');
    }

    updateScoreDisplay();
    screenShake = 0.4;

    if (p1Score >= WIN_SCORE || p2Score >= WIN_SCORE) {
      endGame(p1Score >= WIN_SCORE ? 1 : 2);
    } else {
      gameState = 'SCORED';
      scorePauseTimer = SCORE_PAUSE;
      resetBallToCenter();
    }
  }

  function startGame() {
    if (!voiceControlActive || !ayFingerprint || !ehFingerprint) return;
    gameState = 'PLAYING';
    p1Score = 0;
    p2Score = 0;
    ballSpeed = BALL_SPEED_INITIAL;
    rallyCount = 0;
    serveDirection = Math.random() < 0.5 ? 1 : -1;
    updateScoreDisplay();
    overlay.classList.add('hidden');
    gameOverEl.classList.remove('visible');
    p1Paddle.position.y = 0;
    p2Paddle.position.y = 0;
    resetBallToCenter();
    setTimeout(() => {
      if (gameState === 'PLAYING') serveBall();
    }, 500);
  }

  function endGame(winner) {
    gameState = 'GAME_OVER';
    const winnerLabel = winner === 1 ? 'You Win! \uD83C\uDF89' : 'AI Wins!';
    gameOverTitle.textContent = winnerLabel;
    gameOverTitle.className = winner === 1 ? 'p1-win' : 'p2-win';
    finalScoreEl.textContent = p1Score + ' \u2014 ' + p2Score;
    gameOverEl.classList.add('visible');
  }

  function resetGame() {
    particles.forEach(p => {
      scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
    });
    particles.length = 0;
    startGame();
  }

  // ─── Input ─────────────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    keysDown[e.code] = true;
    if (e.code === 'Space') {
      e.preventDefault();
      if (gameState === 'WAITING') startGame();
      else if (gameState === 'GAME_OVER') resetGame();
    }
  });

  document.addEventListener('keyup', (e) => {
    keysDown[e.code] = false;
  });

  function handleTapStart(e) {
    if (gameState === 'WAITING') {
      e.preventDefault();
      startGame();
    } else if (gameState === 'GAME_OVER') {
      e.preventDefault();
      resetGame();
    }
  }
  canvas.addEventListener('touchstart', handleTapStart, { passive: false });
  overlay.addEventListener('touchstart', handleTapStart, { passive: false });
  gameOverEl.addEventListener('touchstart', handleTapStart, { passive: false });
  canvas.addEventListener('click', handleTapStart);
  overlay.addEventListener('click', handleTapStart);
  gameOverEl.addEventListener('click', handleTapStart);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ─── Update Loop ───────────────────────────────────────────
  const clock = new THREE.Clock();

  function update() {
    requestAnimationFrame(update);

    const dt = clock.getDelta();

    // Update paddles
    if (gameState === 'PLAYING' || gameState === 'SCORED' || gameState === 'WAITING') {
      updatePaddles(dt);
    }

    // Score pause → re-serve
    if (gameState === 'SCORED') {
      scorePauseTimer -= dt;
      if (scorePauseTimer <= 0) {
        gameState = 'PLAYING';
        serveBall();
      }
    }

    // Physics
    updatePhysics(dt);

    // Particles
    updateParticles(dt);

    // Camera shake
    const shakeX = screenShake > 0 ? (Math.random() - 0.5) * screenShake : 0;
    const shakeY = screenShake > 0 ? (Math.random() - 0.5) * screenShake : 0;
    screenShake *= 0.9;
    if (screenShake < 0.001) screenShake = 0;

    camera.position.set(
      CAM_BASE.x + shakeX,
      CAM_BASE.y + shakeY,
      CAM_BASE.z
    );
    camera.lookAt(CAM_LOOKAT);

    // Paddle glow pulse (boost P1 when voice-controlled)
    const t = clock.elapsedTime;
    if (voiceControlActive && voiceCommand === 'UP') {
      p1GlowMat.color.setHex(0x3fb950);
      p1GlowMat.opacity = 0.25 + Math.sin(t * 8) * 0.1;
    } else if (voiceControlActive && voiceCommand === 'DOWN') {
      p1GlowMat.color.setHex(0xf85149);
      p1GlowMat.opacity = 0.25 + Math.sin(t * 8) * 0.1;
    } else {
      p1GlowMat.color.setHex(P1_COLOR);
      p1GlowMat.opacity = 0.08 + Math.sin(t * 3) * 0.04;
    }
    p2GlowMat.opacity = 0.08 + Math.sin(t * 3 + 1) * 0.04;

    // Ball glow pulse
    ballGlowMat.opacity = 0.1 + Math.sin(t * 5) * 0.05;

    // Ball rotation (visual spin based on velocity)
    ball.rotation.x += ballVel.y * dt * 0.3;
    ball.rotation.y += ballVel.x * dt * 0.3;
    ball.rotation.z += (ballVel.x + ballVel.y) * dt * 0.1;

    // Ball trail
    const isMoving = ballVel.x !== 0 || ballVel.y !== 0;
    for (let i = TRAIL_LENGTH - 1; i > 0; i--) {
      trail[i].x = trail[i - 1].x;
      trail[i].y = trail[i - 1].y;
    }
    trail[0].x = ball.position.x;
    trail[0].y = ball.position.y;
    for (let i = 0; i < TRAIL_LENGTH; i++) {
      trail[i].mesh.position.set(trail[i].x, trail[i].y, 0);
      trail[i].mesh.visible = isMoving && gameState === 'PLAYING';
    }

    // Render
    renderer.render(scene, camera);
  }

  // ─── Init ──────────────────────────────────────────────────
  updateScoreDisplay();
  initVoiceControl();
  update();

})();
