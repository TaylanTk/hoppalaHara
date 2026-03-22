/* ============================================
   COSMIC FLAP — game.js
   ============================================ */

// ─── GLOBAL STATE ───────────────────────────
let selectedChar = null;
let selectedDifficulty = 'orta';
let bestScore = parseInt(localStorage.getItem('cosmicFlap_best') || '0');

// ─── SPLASH SCREEN ──────────────────────────

function createStars() {
  const container = document.getElementById('stars-bg');
  const count = Math.min(window.innerWidth < 500 ? 80 : 150, 200);

  for (let i = 0; i < count; i++) {
    const star = document.createElement('div');
    star.className = 'star-dot';
    const size = Math.random() * 2.5 + 0.5;
    const x = Math.random() * 100;
    const y = Math.random() * 100;
    const delay = Math.random() * 5;
    const dur = 2 + Math.random() * 4;
    const minOp = 0.1 + Math.random() * 0.3;
    star.style.cssText = `
      left:${x}%; top:${y}%;
      width:${size}px; height:${size}px;
      --d:${dur}s; --delay:${delay}s; --min-op:${minOp};
    `;
    container.appendChild(star);
  }

  // Shooting stars
  spawnShootingStars();
}

function spawnShootingStars() {
  function shoot() {
    const el = document.createElement('div');
    el.className = 'shooting-star';
    const startX = 20 + Math.random() * 60;
    const startY = 5 + Math.random() * 30;
    const angle = 20 + Math.random() * 30;
    const speed = 0.6 + Math.random() * 0.8;
    el.style.cssText = `left:${startX}%; top:${startY}%; animation: shootingMove ${speed}s linear forwards`;

    if (!document.getElementById('shooting-keyframes')) {
      const style = document.createElement('style');
      style.id = 'shooting-keyframes';
      style.textContent = `
        @keyframes shootingMove {
          0%   { transform: translate(0,0) rotate(${angle}deg); opacity:1; width:2px; }
          100% { transform: translate(220px,120px) rotate(${angle}deg); opacity:0; width:2px; }
        }
        .shooting-star::after { animation: tailFade ${speed}s linear forwards; }
        @keyframes tailFade {
          0%   { width:120px; opacity:0.9; }
          100% { width:0px;   opacity:0; }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(el);
    setTimeout(() => el.remove(), speed * 1000 + 100);
    setTimeout(shoot, 2000 + Math.random() * 5000);
  }
  setTimeout(shoot, 800 + Math.random() * 2000);
}

function selectCharacter(name) {
  selectedChar = name;
  document.querySelectorAll('.char-card').forEach(c => c.classList.remove('selected'));
  document.getElementById('char-' + name).classList.add('selected');
  checkStartReady();
}

function selectDifficulty(level) {
  selectedDifficulty = level;
  document.querySelectorAll('.diff-card').forEach(c => {
    c.className = 'diff-card'; // tüm selected-* sınıflarını temizle
  });
  document.getElementById('diff-' + level).classList.add('selected-' + level);
  checkStartReady();
}

function checkStartReady() {
  document.getElementById('start-btn').disabled = !selectedChar;
}

function startGame() {
  if (!selectedChar) return;
  const splash = document.getElementById('splash-screen');
  splash.classList.add('fade-out');
  setTimeout(() => {
    splash.style.display = 'none';
    document.getElementById('game-screen').style.display = 'block';
    initGame();
  }, 600);
}

function quitGame() {
  document.getElementById('game-screen').style.display = 'none';
  document.getElementById('pause-overlay').style.display = 'none';
  document.getElementById('gameover-overlay').style.display = 'none';
  const splash = document.getElementById('splash-screen');
  splash.style.display = 'flex';
  splash.classList.remove('fade-out');
  if (gameLoop) cancelAnimationFrame(gameLoop);
}

// ─── GAME ENGINE ────────────────────────────

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let W, H;
let gameLoop = null;
let paused = false;
let gameOver = false;

// Bird
const bird = {
  x: 0, y: 0,
  vy: 0,
  gravity: 0,
  flapForce: 0,
  radius: 0,
  rotation: 0,
  img: null,
  flickerTimer: 0,
  invincible: false
};

// Pipes
let pipes = [];
let pipeTimer = 0;
let pipeInterval = 0;
let pipeSpeed = 0;

// Score & Lives
let score = 0;
let lives = 3;

// Stars (game background)
let bgStars = [];
let bgStarColors = ['#fff', '#cceeff', '#ffccee', '#ffffcc', '#ddddff'];

// Psychedelic pipe hue
let pipeHue = 0;

// Particles
let particles = [];

// Shards (parçalanma)
let shards = [];

// Distant planets
let planets = [];

// Comet / shooting star in game
let comets = [];
let cometTimer = 0;

function resize() {
  W = canvas.width  = canvas.offsetWidth;
  H = canvas.height = canvas.offsetHeight;
}

function initGame() {
  resize();

  // Bird setup
  bird.x = W * 0.22;
  bird.y = H * 0.5;
  bird.vy = 0;
  bird.radius = Math.min(W, H) * 0.038;
  bird.gravity = H * 0.0019;
  bird.flapForce = -H * 0.016;
  bird.rotation = 0;
  bird.invincible = false;
  bird.flickerTimer = 0;
  bird.dead = false;

  // Shards (parçalanma)
  shards = [];

  // Load image
  const img = new Image();
  img.src = 'images/' + selectedChar + '.png';
  img.onload = () => { bird.img = img; };

  // Zorluk katsayıları
  const diffSettings = {
    kolay:  { speedMult: 0.65, intervalBase: 165, intervalMin: 110, ramp: 0.8 },
    orta:   { speedMult: 1.0,  intervalBase: 140, intervalMin: 90,  ramp: 1.5 },
    zor:    { speedMult: 1.5,  intervalBase: 110, intervalMin: 70,  ramp: 2.2 },
    kozmik: { speedMult: 2.2,  intervalBase: 85,  intervalMin: 52,  ramp: 3.2 },
  };
  const diff = diffSettings[selectedDifficulty] || diffSettings.orta;
  bird.diffMult   = diff.speedMult;
  bird.diffInt    = diff.intervalBase;
  bird.diffMin    = diff.intervalMin;
  bird.diffRamp   = diff.ramp;

  // Pipes
  pipes = [];
  pipeTimer = 0;
  const initVariance = diff.intervalBase * 0.4;
  pipeInterval = Math.round(diff.intervalBase - initVariance + Math.random() * initVariance * 2);
  pipeSpeed = W * 0.004 * diff.speedMult;

  // Score
  score = 0;
  lives = 3;
  gameOver = false;
  paused = false;
  updateHUD();

  // Background stars
  bgStars = [];
  const starCount = 160;
  for (let i = 0; i < starCount; i++) {
    bgStars.push({
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.8 + 0.3,
      speed: Math.random() * 0.4 + 0.05,
      alpha: Math.random() * 0.8 + 0.2,
      color: bgStarColors[Math.floor(Math.random() * bgStarColors.length)],
      twinkleSpeed: Math.random() * 0.03 + 0.01,
      twinkleOffset: Math.random() * Math.PI * 2
    });
  }

  // Planets
  planets = [];
  const planetCount = 3;
  for (let i = 0; i < planetCount; i++) {
    planets.push({
      x: Math.random() * W,
      y: H * 0.1 + Math.random() * H * 0.6,
      r: 15 + Math.random() * 35,
      speed: 0.1 + Math.random() * 0.2,
      hue: Math.random() * 360,
      saturation: 40 + Math.random() * 50,
      lightness: 20 + Math.random() * 20,
      ringAngle: Math.random() > 0.5 ? (Math.random() * 0.3 + 0.1) : 0
    });
  }

  // Comets
  comets = [];
  cometTimer = 0;
  pipeHue = 0;
  particles = [];

  // Controls
  document.removeEventListener('keydown', onKey);
  document.addEventListener('keydown', onKey);
  canvas.removeEventListener('click', onTap);
  canvas.addEventListener('click', onTap);
  canvas.removeEventListener('touchstart', onTap);
  canvas.addEventListener('touchstart', onTap, { passive: true });

  if (gameLoop) cancelAnimationFrame(gameLoop);
  gameLoop = requestAnimationFrame(tick);
}

function onKey(e) {
  if (e.code === 'Space' || e.code === 'ArrowUp') {
    e.preventDefault();
    handleInput();
  }
  if (e.code === 'Escape') togglePause();
}

function onTap(e) {
  if (e.target === canvas) handleInput();
}

function handleInput() {
  if (gameOver) return;
  if (paused) return;
  flap();
}

function flap() {
  bird.vy = bird.flapForce;
  spawnFlapParticles();
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  document.getElementById('pause-overlay').style.display = paused ? 'flex' : 'none';
  if (!paused) gameLoop = requestAnimationFrame(tick);
}

function resumeGame() {
  paused = false;
  document.getElementById('pause-overlay').style.display = 'none';
  gameLoop = requestAnimationFrame(tick);
}

function restartGame() {
  document.getElementById('gameover-overlay').style.display = 'none';
  initGame();
}

// ─── MAIN LOOP ───────────────────────────────

let frameCount = 0;

function tick() {
  if (paused) return;
  frameCount++;

  update();
  draw();

  if (!gameOver) gameLoop = requestAnimationFrame(tick);
}

// ─── UPDATE ──────────────────────────────────

function update() {
  // Bird physics
  bird.vy += bird.gravity;
  bird.y += bird.vy;
  bird.rotation = Math.max(-0.5, Math.min(1.2, bird.vy * 0.06));

  // Floor / ceiling
  if (bird.y - bird.radius < 0) {
    bird.y = bird.radius;
    bird.vy = 0;
  }
  if (bird.y + bird.radius > H) {
    if (!bird.invincible) loseLife();
    bird.y = H - bird.radius;
    bird.vy = 0;
  }

  // Flicker decrement
  if (bird.flickerTimer > 0) bird.flickerTimer--;
  if (bird.flickerTimer === 0) bird.invincible = false;

  // Pipe spawn
  pipeTimer++;
  if (pipeTimer >= pipeInterval) {
    spawnPipe();
    pipeTimer = 0;
    // Her boruda yeni rastgele aralık: base ± %40 varyasyon, zorlukla kısalan
    const base = Math.max(bird.diffMin, bird.diffInt - score * bird.diffRamp);
    const variance = base * 0.4;
    pipeInterval = Math.round(base - variance + Math.random() * variance * 2);
  }

  // Pipe speed ramp (zorluk bazlı)
  pipeSpeed = W * 0.004 * bird.diffMult + score * 0.0003 * W;

  // Pipe update
  for (let i = pipes.length - 1; i >= 0; i--) {
    const p = pipes[i];
    p.x -= pipeSpeed;

    // Score: crossed bird
    if (!p.passed && p.x + p.w < bird.x) {
      p.passed = true;
      score++;
      updateHUD();
      spawnScoreParticles();
    }

    // Collision
    if (!bird.invincible) {
      if (checkPipeCollision(p)) {
        loseLife();
      }
    }

    if (p.x + p.w < 0) pipes.splice(i, 1);
  }

  // Pipe hue rotation
  pipeHue = (pipeHue + 0.8) % 360;

  // Background stars parallax
  for (const s of bgStars) {
    s.x -= s.speed;
    if (s.x < -2) s.x = W + 2;
    s.twinkleOffset += s.twinkleSpeed;
  }

  // Planets
  for (const p of planets) {
    p.x -= p.speed;
    if (p.x + p.r < 0) {
      p.x = W + p.r;
      p.y = H * 0.1 + Math.random() * H * 0.6;
      p.hue = Math.random() * 360;
    }
  }

  // Comets
  cometTimer++;
  if (cometTimer > 200 + Math.random() * 300) {
    spawnComet();
    cometTimer = 0;
  }
  for (let i = comets.length - 1; i >= 0; i--) {
    const c = comets[i];
    c.x += c.vx;
    c.y += c.vy;
    c.alpha -= 0.012;
    if (c.alpha <= 0) comets.splice(i, 1);
  }

  // Particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.08;
    p.alpha -= p.decay;
    p.radius *= 0.97;
    if (p.alpha <= 0) particles.splice(i, 1);
  }

  // Shards
  for (let i = shards.length - 1; i >= 0; i--) {
    const s = shards[i];
    s.x += s.vx;
    s.y += s.vy;
    s.vy += 0.18;
    s.vx *= 0.99;
    s.rotation += s.rotSpeed;
    s.alpha -= s.decay;
    if (s.alpha <= 0) shards.splice(i, 1);
  }
}

function spawnPipe() {
  const gapMin = H * 0.22;
  const gapMax = H * 0.35;
  const gap = gapMin + Math.random() * (gapMax - gapMin);
  const topMin = H * 0.12;
  const topMax = H - gap - H * 0.12;
  const topH = topMin + Math.random() * (topMax - topMin);
  const w = Math.min(70, W * 0.1);

  pipes.push({
    x: W + 10,
    w: w,
    topH: topH,
    bottomY: topH + gap,
    passed: false,
    hueOffset: Math.random() * 360
  });
}

function checkPipeCollision(p) {
  const bx = bird.x, by = bird.y, br = bird.radius * 0.78;
  const px = p.x, pw = p.w;

  if (bx + br < px || bx - br > px + pw) return false;

  // Top pipe
  if (by - br < p.topH) return true;
  // Bottom pipe
  if (by + br > p.bottomY) return true;

  return false;
}

function loseLife() {
  spawnHitParticles();
  spawnShards();
  bird.dead = true;
  triggerGameOver();
}

function triggerGameOver() {
  gameOver = true;
  if (score > bestScore) {
    bestScore = score;
    localStorage.setItem('cosmicFlap_best', bestScore);
  }
  setTimeout(() => {
    document.getElementById('final-score').textContent = score;
    document.getElementById('best-score').textContent = bestScore;
    document.getElementById('gameover-overlay').style.display = 'flex';
  }, 1200);
}

function updateHUD() {
  document.getElementById('score-display').textContent = score;
  const diffLabels = { kolay: '🌱 KOLAY', orta: '⚡ ORTA', zor: '🔥 ZOR', kozmik: '💀 KOZMİK' };
  const badge = document.getElementById('diff-badge');
  if (badge) badge.textContent = diffLabels[selectedDifficulty] || '';
}

// ─── DRAW ─────────────────────────────────────

function draw() {
  ctx.clearRect(0, 0, W, H);

  drawBackground();
  drawPlanets();
  drawComets();
  drawBgStars();
  drawPipes();
  drawParticles();
  drawShards();
  if (!bird.dead) drawBird();
}

function drawBackground() {
  // Deep space gradient
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#03010a');
  grad.addColorStop(0.4, '#0a0318');
  grad.addColorStop(0.7, '#080220');
  grad.addColorStop(1, '#050115');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Nebula blobs
  const t = frameCount * 0.002;
  const blobs = [
    { cx: W * 0.15, cy: H * 0.3, rx: W * 0.3, ry: H * 0.25, c1: 'rgba(80,0,120,0.12)', c2: 'transparent' },
    { cx: W * 0.75, cy: H * 0.65, rx: W * 0.35, ry: H * 0.3,  c1: 'rgba(0,40,100,0.1)',  c2: 'transparent' },
    { cx: W * 0.5,  cy: H * 0.15, rx: W * 0.2,  ry: H * 0.2,  c1: 'rgba(100,0,60,0.09)', c2: 'transparent' },
  ];

  for (const b of blobs) {
    const grd = ctx.createRadialGradient(b.cx, b.cy, 0, b.cx, b.cy, Math.max(b.rx, b.ry));
    grd.addColorStop(0, b.c1);
    grd.addColorStop(1, b.c2);
    ctx.save();
    ctx.scale(b.rx / Math.max(b.rx, b.ry), b.ry / Math.max(b.rx, b.ry));
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(
      b.cx * (Math.max(b.rx, b.ry) / b.rx),
      b.cy * (Math.max(b.rx, b.ry) / b.ry),
      Math.max(b.rx, b.ry),
      0, Math.PI * 2
    );
    ctx.fill();
    ctx.restore();
  }
}

function drawBgStars() {
  for (const s of bgStars) {
    const twinkle = 0.5 + 0.5 * Math.sin(s.twinkleOffset);
    const alpha = s.alpha * (0.5 + 0.5 * twinkle);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r * (0.9 + 0.1 * twinkle), 0, Math.PI * 2);
    ctx.fill();
    // Occasional glow
    if (s.r > 1.2) {
      ctx.globalAlpha = alpha * 0.3;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r * 3, 0, Math.PI * 2);
      const grd = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 3);
      grd.addColorStop(0, s.color);
      grd.addColorStop(1, 'transparent');
      ctx.fillStyle = grd;
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawPlanets() {
  for (const p of planets) {
    ctx.save();

    // Planet body
    const grad = ctx.createRadialGradient(
      p.x - p.r * 0.3, p.y - p.r * 0.3, p.r * 0.1,
      p.x, p.y, p.r
    );
    grad.addColorStop(0, `hsl(${p.hue}, ${p.saturation}%, ${p.lightness + 15}%)`);
    grad.addColorStop(0.5, `hsl(${p.hue}, ${p.saturation}%, ${p.lightness}%)`);
    grad.addColorStop(1, `hsl(${p.hue + 20}, ${p.saturation - 10}%, ${p.lightness - 10}%)`);

    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Surface bands
    ctx.globalAlpha = 0.12;
    for (let b = 0; b < 4; b++) {
      const by = p.y - p.r + (p.r * 2 / 5) * b + p.r * 0.2;
      const hw = Math.sqrt(Math.max(0, p.r * p.r - (by - p.y) * (by - p.y)));
      ctx.fillStyle = `hsl(${p.hue + b * 20}, 60%, 70%)`;
      ctx.fillRect(p.x - hw, by, hw * 2, p.r * 0.15);
    }

    // Ring
    if (p.ringAngle > 0) {
      ctx.globalAlpha = 0.3;
      ctx.strokeStyle = `hsl(${p.hue + 40}, 70%, 70%)`;
      ctx.lineWidth = p.r * 0.18;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.r * 1.7, p.r * p.ringAngle, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }
}

function drawComets() {
  for (const c of comets) {
    ctx.save();
    ctx.globalAlpha = c.alpha;

    // Tail
    const tailLen = 80 + Math.random() * 20;
    const angle = Math.atan2(c.vy, c.vx);
    const tailGrd = ctx.createLinearGradient(
      c.x, c.y,
      c.x - Math.cos(angle) * tailLen,
      c.y - Math.sin(angle) * tailLen
    );
    tailGrd.addColorStop(0, 'rgba(200,240,255,0.9)');
    tailGrd.addColorStop(0.4, 'rgba(150,200,255,0.4)');
    tailGrd.addColorStop(1, 'transparent');

    ctx.strokeStyle = tailGrd;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(c.x - Math.cos(angle) * tailLen, c.y - Math.sin(angle) * tailLen);
    ctx.stroke();

    // Head
    ctx.fillStyle = 'rgba(220,240,255,1)';
    ctx.beginPath();
    ctx.arc(c.x, c.y, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

function spawnComet() {
  const fromTop = Math.random() > 0.5;
  comets.push({
    x: Math.random() * W * 0.6,
    y: fromTop ? 0 : H * 0.1,
    vx: 3 + Math.random() * 4,
    vy: fromTop ? 1.5 + Math.random() * 2 : -0.5 - Math.random() * 1.5,
    alpha: 0.9
  });
}

function drawPipes() {
  for (const p of pipes) {
    const t = frameCount * 0.025;
    const hue1 = (pipeHue + p.hueOffset) % 360;
    const hue2 = (hue1 + 60) % 360;
    const hue3 = (hue1 + 120) % 360;

    // Top pipe
    drawSinglePipe(p.x, 0, p.w, p.topH, hue1, hue2, hue3, t, true);
    // Bottom pipe
    drawSinglePipe(p.x, p.bottomY, p.w, H - p.bottomY, hue1, hue2, hue3, t, false);
  }
}

function drawSinglePipe(x, y, w, h, h1, h2, h3, t, isTop) {
  if (h <= 0) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  // Psychedelic gradient body
  const grad = ctx.createLinearGradient(x, y, x, y + h);
  const s1 = `hsl(${h1}, 100%, 55%)`;
  const s2 = `hsl(${h2}, 100%, 50%)`;
  const s3 = `hsl(${h3}, 100%, 55%)`;
  const s4 = `hsl(${(h1 + 180) % 360}, 100%, 50%)`;

  grad.addColorStop(0,    s1);
  grad.addColorStop(0.33, s2);
  grad.addColorStop(0.66, s3);
  grad.addColorStop(1,    s4);

  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);

  // Animated shimmer stripes
  ctx.globalAlpha = 0.25;
  const stripeCount = 6;
  for (let i = 0; i < stripeCount; i++) {
    const offset = ((t * 30 + i * (h / stripeCount)) % h);
    const sy = isTop ? y + offset : y + offset;
    const stripeH = h / (stripeCount * 2);
    const sg = ctx.createLinearGradient(x, sy, x + w, sy + stripeH);
    sg.addColorStop(0, 'rgba(255,255,255,0)');
    sg.addColorStop(0.5, 'rgba(255,255,255,0.6)');
    sg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(x, sy, w, stripeH);
  }
  ctx.globalAlpha = 1;

  // Left/right edge highlight
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(x, y, 4, h);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(x + w - 4, y, 4, h);

  // Cap (rim)
  const capH = Math.min(h * 0.08, 16);
  const capExtra = w * 0.12;
  const capX = x - capExtra;
  const capW = w + capExtra * 2;
  const capY = isTop ? y + h - capH : y;
  const capGrad = ctx.createLinearGradient(capX, capY, capX + capW, capY + capH);
  capGrad.addColorStop(0, `hsl(${h1}, 100%, 65%)`);
  capGrad.addColorStop(0.5, `hsl(${h2}, 100%, 70%)`);
  capGrad.addColorStop(1, `hsl(${h3}, 100%, 65%)`);
  ctx.restore();
  ctx.save();
  ctx.fillStyle = capGrad;
  ctx.beginPath();
  ctx.roundRect(capX, capY, capW, capH, 4);
  ctx.fill();

  // Cap glow
  ctx.globalAlpha = 0.4;
  const glowH = capH * 1.5;
  const capGlow = ctx.createLinearGradient(0, capY, 0, isTop ? capY + glowH : capY - glowH);
  capGlow.addColorStop(0, `hsla(${h2}, 100%, 70%, 0.5)`);
  capGlow.addColorStop(1, 'transparent');
  ctx.fillStyle = capGlow;
  ctx.fillRect(capX, isTop ? capY : capY - glowH, capW, glowH);

  ctx.restore();
}

function drawBird() {
  const { x, y, radius, rotation, flickerTimer } = bird;

  if (bird.invincible && Math.floor(flickerTimer / 6) % 2 === 0) return;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);

  if (bird.img && bird.img.complete) {
    const size = radius * 2.2;
    ctx.drawImage(bird.img, -size / 2, -size / 2, size, size);
  } else {
    // Placeholder
    ctx.fillStyle = '#00f5ff';
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawParticles() {
  for (const p of particles) {
    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;
    if (p.isStar) {
      drawStar(ctx, p.x, p.y, 5, p.radius, p.radius * 0.45);
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawStar(ctx, x, y, points, outer, inner) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / points) * i - Math.PI / 2;
    i === 0 ? ctx.moveTo(x + r * Math.cos(a), y + r * Math.sin(a))
            : ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a));
  }
  ctx.closePath();
  ctx.fill();
}

function drawShards() {
  for (const s of shards) {
    ctx.save();
    ctx.globalAlpha = s.alpha;
    ctx.translate(s.x, s.y);
    ctx.rotate(s.rotation);
    ctx.beginPath();
    ctx.moveTo(s.poly[0][0], s.poly[0][1]);
    for (let k = 1; k < s.poly.length; k++) ctx.lineTo(s.poly[k][0], s.poly[k][1]);
    ctx.closePath();
    ctx.clip();
    // oc is the offscreen bird canvas; ocOffX/Y shift so correct pixels show through clip
    ctx.drawImage(s.oc, s.ocOffX, s.ocOffY);
    ctx.restore();
  }
}

// ─── PARTICLES ───────────────────────────────

function spawnFlapParticles() {
  const count = 8;
  for (let i = 0; i < count; i++) {
    const angle = Math.PI * 0.5 + (Math.random() - 0.5) * Math.PI * 1.2;
    const speed = 0.8 + Math.random() * 2.2;
    const hue = Math.random() * 360;
    const isStar = Math.random() > 0.5;
    particles.push({
      x: bird.x + (Math.random() - 0.5) * bird.radius * 1.2,
      y: bird.y + bird.radius * 0.3,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 0.5,
      radius: isStar ? 3 + Math.random() * 3 : 2 + Math.random() * 2,
      alpha: 0.85,
      decay: 0.035 + Math.random() * 0.03,
      color: `hsl(${hue}, 100%, 65%)`,
      isStar
    });
  }
}

function spawnShards() {
  if (!bird.img || !bird.img.complete) return;

  const sz = bird.radius * 2.2;

  // Offscreen canvas: karakteri ortaya çiz
  const oc = document.createElement('canvas');
  oc.width = sz; oc.height = sz;
  const octx = oc.getContext('2d');
  octx.drawImage(bird.img, 0, 0, sz, sz);

  // Parça grid'i: her parça [sol-üst köşeden] yerel koordinatlarda polygon
  // Merkez (0,0) = karakterin ortası
  const half = sz / 2;
  // 12 düzensiz parça — Voronoi benzeri ama elle tanımlı
  const pieces = [
    // üst sol bölge
    [[-half,-half],[-half*0.1,-half],[-half*0.15,-half*0.2],[-half,-half*0.25]],
    // üst orta
    [[-half*0.1,-half],[half*0.2,-half],[half*0.05,-half*0.15],[-half*0.15,-half*0.2]],
    // üst sağ
    [[half*0.2,-half],[half,-half],[half,-half*0.3],[half*0.05,-half*0.15]],
    // sol üst orta
    [[-half,-half*0.25],[-half*0.15,-half*0.2],[-half*0.3,half*0.1],[-half,half*0.05]],
    // merkez üst
    [[-half*0.15,-half*0.2],[half*0.05,-half*0.15],[half*0.1,half*0.1],[-half*0.3,half*0.1]],
    // sağ üst orta
    [[half*0.05,-half*0.15],[half,-half*0.3],[half,half*0.15],[half*0.1,half*0.1]],
    // sol alt
    [[-half,half*0.05],[-half*0.3,half*0.1],[-half*0.2,half*0.45],[-half,half]],
    // merkez sol alt
    [[-half*0.3,half*0.1],[half*0.1,half*0.1],[half*0.0,half*0.5],[-half*0.2,half*0.45]],
    // merkez sağ alt
    [[half*0.1,half*0.1],[half,half*0.15],[half,half*0.55],[half*0.0,half*0.5]],
    // alt sol
    [[-half,half],[half*0.0,half*0.5],[-half*0.15,half],[-half,half]],
    // alt orta
    [[-half*0.2,half*0.45],[half*0.0,half*0.5],[-half*0.15,half],[-half*0.2,half*0.45]],
    // alt sağ
    [[half*0.0,half*0.5],[half,half*0.55],[half,half],[-half*0.15,half]],
  ];

  for (const poly of pieces) {
    // Poligonun merkezi (dünya koordinatı olarak offsetleme için)
    const cx = poly.reduce((s,p)=>s+p[0],0) / poly.length;
    const cy = poly.reduce((s,p)=>s+p[1],0) / poly.length;

    const angle = Math.atan2(cy, cx) + (Math.random()-0.5)*0.5;
    const speed = 3 + Math.random() * 5;

    shards.push({
      oc,                          // paylaşılan offscreen canvas
      // drawImage'da oc'yi (s.x,s.y)'e göre nasıl kaydıracağız:
      // s.x başlangıçta = bird.x + cx
      // istediğimiz: oc'nin sol üstü = s.x - cx - half + 0  →  ofset = -(cx+half) nispeten
      ocOffX: -(cx + half),        // ctx.translate(s.x,s.y) sonrası drawImage için x offset
      ocOffY: -(cy + half),
      poly,
      x: bird.x + cx,
      y: bird.y + cy,
      vx: Math.cos(angle) * speed + (Math.random()-0.5)*1.5,
      vy: Math.sin(angle) * speed - (2 + Math.random()*4),
      rotation: 0,
      rotSpeed: (Math.random()-0.5)*0.22,
      alpha: 1,
      decay: 0.016 + Math.random()*0.01
    });
  }
}

function spawnScoreParticles() {
  const count = 10;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random() * 3;
    const hue = Math.random() * 360;
    particles.push({
      x: bird.x + (Math.random() - 0.5) * 20,
      y: bird.y + (Math.random() - 0.5) * 20,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1,
      radius: 3 + Math.random() * 3,
      alpha: 0.9,
      decay: 0.025 + Math.random() * 0.02,
      color: `hsl(${hue}, 100%, 65%)`
    });
  }
}

function spawnHitParticles() {
  const count = 16;
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 / count) * i;
    const speed = 2 + Math.random() * 4;
    particles.push({
      x: bird.x,
      y: bird.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      radius: 4 + Math.random() * 4,
      alpha: 1,
      decay: 0.03 + Math.random() * 0.02,
      color: `hsl(${Math.random() * 40}, 100%, 60%)`
    });
  }
}

// ─── RESIZE ──────────────────────────────────

window.addEventListener('resize', () => {
  if (document.getElementById('game-screen').style.display !== 'none') {
    resize();
    bird.radius = Math.min(W, H) * 0.038;
    bird.gravity = H * 0.0019;
    bird.flapForce = -H * 0.016;
    // Rescale bird x
    bird.x = W * 0.22;
    // Rescale bg stars
    bgStars.forEach(s => {
      s.x = Math.random() * W;
      s.y = Math.random() * H;
    });
    planets.forEach(p => {
      p.x = Math.random() * W;
      p.y = H * 0.1 + Math.random() * H * 0.6;
    });
  }
});

// ─── INIT ────────────────────────────────────

createStars();