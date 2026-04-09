(() => {
  "use strict";

  // ── Constants ──────────────────────────────────────────────
  const COLS = 20;
  const ROWS = 20;
  const CELL = 20;            // px per cell
  const BASE_INTERVAL = 10;   // frames between moves at level 1
  const MIN_INTERVAL = 3;     // fastest speed
  const SPEED_STEP = 5;       // foods per speed-up
  const POINTS_PER_FOOD = 10;

  // ── DOM refs ───────────────────────────────────────────────
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlay-title");
  const overlayMsg = document.getElementById("overlay-msg");
  const startBtn = document.getElementById("start-btn");
  const scoreEl = document.getElementById("score");
  const highScoreEl = document.getElementById("high-score");
  const speedEl = document.getElementById("speed-level");

  // ── Game state ─────────────────────────────────────────────
  let state = "idle"; // idle | running | paused | dying | gameover
  let snake, dir, nextDir, food, score, foodEaten, speedLevel, moveInterval;
  let frameCount = 0;
  let highScore = parseInt(localStorage.getItem("snake_high") || "0", 10);
  let deathFlashCount = 0;
  let swipeStart = null;

  highScoreEl.textContent = highScore;

  // ── Helpers ────────────────────────────────────────────────
  function randInt(max) {
    return Math.floor(Math.random() * max);
  }

  function spawnFood() {
    const occupied = new Set(snake.map(s => `${s.x},${s.y}`));
    const free = [];
    for (let x = 0; x < COLS; x++) {
      for (let y = 0; y < ROWS; y++) {
        if (!occupied.has(`${x},${y}`)) free.push({ x, y });
      }
    }
    if (free.length === 0) return null;
    return free[randInt(free.length)];
  }

  function updateSpeed() {
    speedLevel = Math.floor(foodEaten / SPEED_STEP) + 1;
    moveInterval = Math.max(MIN_INTERVAL, BASE_INTERVAL - (speedLevel - 1));
    speedEl.textContent = speedLevel;
  }

  // ── Init / Reset ───────────────────────────────────────────
  function resetGame() {
    const mid = Math.floor(COLS / 2);
    snake = [
      { x: mid, y: mid },
      { x: mid - 1, y: mid },
      { x: mid - 2, y: mid },
    ];
    dir = { x: 1, y: 0 };
    nextDir = { x: 1, y: 0 };
    score = 0;
    foodEaten = 0;
    frameCount = 0;
    deathFlashCount = 0;
    updateSpeed();
    food = spawnFood();
    scoreEl.textContent = "0";
  }

  // ── Drawing ────────────────────────────────────────────────
  function drawCell(x, y, color, glow) {
    const px = x * CELL;
    const py = y * CELL;
    if (glow) {
      ctx.shadowColor = glow;
      ctx.shadowBlur = 8;
    }
    ctx.fillStyle = color;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(px + 1, py + 1, CELL - 2, CELL - 2, 4);
    } else {
      ctx.rect(px + 1, py + 1, CELL - 2, CELL - 2);
    }
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  function draw(timestamp) {
    // background
    ctx.fillStyle = "#16213e";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // subtle grid
    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.lineWidth = 1;
    for (let i = 1; i < COLS; i++) {
      ctx.beginPath();
      ctx.moveTo(i * CELL, 0);
      ctx.lineTo(i * CELL, canvas.height);
      ctx.stroke();
    }
    for (let i = 1; i < ROWS; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * CELL);
      ctx.lineTo(canvas.width, i * CELL);
      ctx.stroke();
    }

    // food – pulsing
    const pulse = 0.6 + 0.4 * Math.sin(timestamp / 200);
    const fr = Math.round(255 * pulse);
    const fg = Math.round(80 * pulse);
    const fb = Math.round(80 * pulse);
    drawCell(food.x, food.y, `rgb(${fr},${fg},${fb})`, `rgba(${fr},${fg},${fb},0.6)`);

    // snake
    const len = snake.length;
    for (let i = len - 1; i >= 0; i--) {
      const seg = snake[i];
      const t = 1 - i / Math.max(len, 1);
      const r = Math.round(30 + 48 * t);
      const g = Math.round(160 + 44 * t);
      const b = Math.round(110 + 50 * t);
      const isHead = i === 0;
      drawCell(
        seg.x,
        seg.y,
        `rgb(${r},${g},${b})`,
        isHead ? "rgba(78,204,163,0.5)" : null
      );
    }
  }

  function drawDeathFlash() {
    ctx.fillStyle = `rgba(255,60,60,${0.15 + 0.1 * (deathFlashCount % 2)})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // ── Game logic ─────────────────────────────────────────────
  function tick() {
    if (state === "dying") {
      deathFlashCount++;
      if (deathFlashCount > 6) {
        state = "gameover";
        showOverlay("游戏结束", `得分: ${score}`, "再来一局");
      }
      return;
    }

    if (state !== "running") return;

    frameCount++;
    if (frameCount < moveInterval) return;
    frameCount = 0;

    dir = { ...nextDir };

    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

    // wall collision
    if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) {
      startDeath();
      return;
    }

    // self collision
    for (const seg of snake) {
      if (seg.x === head.x && seg.y === head.y) {
        startDeath();
        return;
      }
    }

    snake.unshift(head);

    // eat food?
    if (head.x === food.x && head.y === food.y) {
      score += POINTS_PER_FOOD;
      foodEaten++;
      scoreEl.textContent = score;
      updateSpeed();
      food = spawnFood();
      if (!food) {
        // board full — win!
        if (score > highScore) {
          highScore = score;
          localStorage.setItem("snake_high", highScore);
          highScoreEl.textContent = highScore;
        }
        state = "gameover";
        showOverlay("恭喜通关！", `最终得分: ${score}`, "再来一局");
        return;
      }
    } else {
      snake.pop();
    }
  }

  function startDeath() {
    state = "dying";
    deathFlashCount = 0;
    if (score > highScore) {
      highScore = score;
      localStorage.setItem("snake_high", highScore);
      highScoreEl.textContent = highScore;
    }
  }

  // ── Overlay ────────────────────────────────────────────────
  function showOverlay(title, msg, btnText) {
    overlayTitle.textContent = title;
    overlayMsg.textContent = msg;
    startBtn.textContent = btnText;
    overlay.classList.remove("hidden");
  }

  function hideOverlay() {
    overlay.classList.add("hidden");
  }

  // ── Main loop ──────────────────────────────────────────────
  function loop(timestamp) {
    tick();
    draw(timestamp);
    if (state === "dying") drawDeathFlash();
    requestAnimationFrame(loop);
  }

  // ── Input: Keyboard ────────────────────────────────────────
  const KEY_DIRS = {
    ArrowUp:    { x: 0, y: -1 },
    ArrowDown:  { x: 0, y: 1 },
    ArrowLeft:  { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
    w: { x: 0, y: -1 },
    s: { x: 0, y: 1 },
    a: { x: -1, y: 0 },
    d: { x: 1, y: 0 },
    W: { x: 0, y: -1 },
    S: { x: 0, y: 1 },
    A: { x: -1, y: 0 },
    D: { x: 1, y: 0 },
  };

  document.addEventListener("keydown", (e) => {
    if (e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      handleAction();
      return;
    }

    const nd = KEY_DIRS[e.key];
    if (!nd) return;
    e.preventDefault();

    if (state === "running") {
      // prevent 180 reversal
      if (dir.x + nd.x !== 0 || dir.y + nd.y !== 0) {
        nextDir = nd;
      }
    }
  });

  // ── Input: D-Pad buttons ───────────────────────────────────
  document.querySelectorAll(".dpad-btn").forEach((btn) => {
    const handler = (e) => {
      e.preventDefault();
      if (state !== "running") return;
      const map = {
        up:    { x: 0, y: -1 },
        down:  { x: 0, y: 1 },
        left:  { x: -1, y: 0 },
        right: { x: 1, y: 0 },
      };
      const nd = map[btn.dataset.dir];
      if (nd && (dir.x + nd.x !== 0 || dir.y + nd.y !== 0)) {
        nextDir = nd;
      }
    };
    btn.addEventListener("touchstart", handler, { passive: false });
    btn.addEventListener("mousedown", handler);
  });

  // ── Input: Swipe on canvas ─────────────────────────────────
  canvas.addEventListener("touchstart", (e) => {
    const t = e.touches[0];
    swipeStart = { x: t.clientX, y: t.clientY };
  }, { passive: true });

  canvas.addEventListener("touchend", (e) => {
    if (!swipeStart || state !== "running") return;
    const t = e.changedTouches[0];
    const dx = t.clientX - swipeStart.x;
    const dy = t.clientY - swipeStart.y;
    swipeStart = null;

    if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return; // too short

    let nd;
    if (Math.abs(dx) > Math.abs(dy)) {
      nd = dx > 0 ? { x: 1, y: 0 } : { x: -1, y: 0 };
    } else {
      nd = dy > 0 ? { x: 0, y: 1 } : { x: 0, y: -1 };
    }
    if (dir.x + nd.x !== 0 || dir.y + nd.y !== 0) {
      nextDir = nd;
    }
  }, { passive: true });

  // ── Action (start / pause / restart) ───────────────────────
  function handleAction() {
    if (state === "idle" || state === "gameover") {
      resetGame();
      state = "running";
      hideOverlay();
    } else if (state === "running") {
      state = "paused";
      showOverlay("暂停", "按空格键继续", "继续");
    } else if (state === "paused") {
      state = "running";
      hideOverlay();
    }
  }

  startBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    handleAction();
  });

  overlay.addEventListener("click", () => {
    handleAction();
  });

  // ── Start ──────────────────────────────────────────────────
  resetGame();
  requestAnimationFrame(loop);
})();
