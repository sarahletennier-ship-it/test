/**
 * TETRIS (inspiré) — JavaScript vanilla (pédagogique)
 * ===================================================
 *
 * Objectif: un code lisible pour débutants.
 * - Gestion de grille (10x20)
 * - Génération des pièces (O, I, L, J, T, S, Z)
 * - Collisions + verrouillage dans la grille
 * - Rotation
 * - Effacement de lignes + score + niveau + vitesse
 * - Game Over
 * - UI: Start/Restart, Next piece, pause, best score (sessionStorage)
 *
 * Important: ce jeu vise la clarté, pas la reproduction parfaite de toutes les règles modernes de Tetris.
 */

// ---------------------------
// 1) Constantes du jeu
// ---------------------------

// Taille de la grille (classique)
const COLS = 10;
const ROWS = 20;

// Taille d'une case (cellule) en pixels dans le canvas principal
const CELL = 30; // 10 * 30 = 300px de large, 20 * 30 = 600px de haut

// Canvas et contexte de dessin
const gameCanvas = document.getElementById("game");
const gameCtx = gameCanvas.getContext("2d");

const nextCanvas = document.getElementById("next");
const nextCtx = nextCanvas.getContext("2d");

// UI
const scoreEl = document.getElementById("score");
const levelEl = document.getElementById("level");
const linesEl = document.getElementById("lines");
const bestEl = document.getElementById("best");

const startBtn = document.getElementById("startBtn");
const restartBtn = document.getElementById("restartBtn");

const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlayTitle");
const overlayText = document.getElementById("overlayText");
const overlayRestart = document.getElementById("overlayRestart");

// Couleurs (une couleur différente par pièce)
const COLORS = {
  I: "#34d399",
  O: "#fbbf24",
  T: "#a78bfa",
  S: "#60a5fa",
  Z: "#f87171",
  J: "#38bdf8",
  L: "#fb923c",
  // 2 formes bonus (pièces "extra" — non classiques)
  U: "#f472b6",
  P: "#22c55e",
  GHOST: "rgba(255,255,255,0.22)", // silhouette d'atterrissage (aide visuelle)
};

/**
 * Représentation des pièces
 * ------------------------
 * On stocke chaque pièce comme une matrice (tableau 2D) de 0/1.
 * 1 = une cellule occupée par la pièce, 0 = vide.
 *
 * Exemple: O (carré) est une matrice 2x2 de 1.
 */
const SHAPES = {
  O: [
    [1, 1],
    [1, 1],
  ],
  I: [[1, 1, 1, 1]],
  T: [
    [0, 1, 0],
    [1, 1, 1],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
  ],
  /**
   * BONUS: 2 nouvelles formes (pas dans le Tetris classique)
   * -------------------------------------------------------
   * Ici on ajoute volontairement 2 pièces plus "originales" pour varier le gameplay.
   * Ce sont des pentominos (5 blocs) : notre moteur (collision/rotation/lignes)
   * fonctionne aussi avec des pièces de taille différente.
   */
  U: [
    [1, 0, 1],
    [1, 1, 1],
  ],
  P: [
    [1, 1],
    [1, 1],
    [1, 0],
  ],
};

const PIECE_TYPES = Object.keys(SHAPES);

// Score de lignes (style Tetris, mais simplifié)
// 1 ligne = 100 * level, 2 = 300, 3 = 500, 4 = 800
const LINE_SCORES = [0, 100, 300, 500, 800];

// Progression: toutes les 10 lignes, on monte un niveau
const LINES_PER_LEVEL = 10;

// Vitesse de chute: on part doucement, puis on accélère avec le niveau
function dropIntervalMs(level) {
  // Plus le niveau est élevé, plus l'intervalle diminue.
  // Limite basse pour éviter une vitesse impossible.
  const base = 900;
  const decrease = (level - 1) * 70;
  return Math.max(120, base - decrease);
}

// Meilleur score sauvegardé uniquement pendant la session (quand l'onglet est ouvert)
const BEST_KEY = "tetris_best_score_session";

// ---------------------------
// 2) État du jeu
// ---------------------------

/**
 * La grille est un tableau 2D de taille ROWS x COLS.
 * Chaque cellule contient:
 * - null -> vide
 * - une string ("I", "O", etc.) -> la couleur dépend du type
 */
let grid = createEmptyGrid();

/**
 * La pièce courante a:
 * - type: "T", "I", ...
 * - matrix: matrice 2D de la forme
 * - x, y: position du coin haut-gauche de la matrice dans la grille
 */
let current = null;
let next = null;

let score = 0;
let level = 1;
let lines = 0;

let running = false;
let paused = false;
let gameOver = false;

// Animation: on utilise requestAnimationFrame et un timer d'accumulation
let lastTime = 0;
let dropCounter = 0;

// Petit effet visuel sur les lignes supprimées
let flashRows = []; // ex: [18,19]
let flashUntil = 0;

// ---------------------------
// 3) Outils: grille & pièces
// ---------------------------

function createEmptyGrid() {
  return Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => null));
}

function cloneMatrix(matrix) {
  return matrix.map((row) => row.slice());
}

/**
 * Rotation d'une matrice 2D (90° à droite)
 * ---------------------------------------
 * Exemple d'idée:
 * - Les colonnes deviennent des lignes.
 */
function rotateMatrixRight(matrix) {
  const h = matrix.length;
  const w = matrix[0].length;
  const rotated = Array.from({ length: w }, () => Array.from({ length: h }, () => 0));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      rotated[x][h - 1 - y] = matrix[y][x];
    }
  }
  return rotated;
}

/**
 * Collision
 * ---------
 * Teste si une pièce (matrix) à la position (px, py) touche:
 * - un mur (gauche/droite)
 * - le sol
 * - une cellule déjà occupée dans la grille
 */
function collides(testMatrix, px, py) {
  for (let y = 0; y < testMatrix.length; y++) {
    for (let x = 0; x < testMatrix[y].length; x++) {
      if (!testMatrix[y][x]) continue;

      const gx = px + x;
      const gy = py + y;

      // En dehors de la grille
      if (gx < 0 || gx >= COLS || gy >= ROWS) return true;

      // gy peut être négatif au spawn (pièce qui "sort" du haut): c'est autorisé
      if (gy >= 0 && grid[gy][gx] !== null) return true;
    }
  }
  return false;
}

/**
 * Fusion (lock)
 * -------------
 * Quand la pièce ne peut plus descendre, on la "copie" dans la grille.
 */
function mergeCurrentIntoGrid() {
  const { type, matrix, x: px, y: py } = current;
  for (let y = 0; y < matrix.length; y++) {
    for (let x = 0; x < matrix[y].length; x++) {
      if (!matrix[y][x]) continue;
      const gx = px + x;
      const gy = py + y;
      if (gy >= 0 && gy < ROWS && gx >= 0 && gx < COLS) {
        // On stocke simplement le type de pièce (I, O, T...) dans la grille.
        // La couleur affichée est ensuite dérivée de ce type grâce à COLORS.
        grid[gy][gx] = type;
      }
    }
  }
}

/**
 * Effacement de lignes
 * -------------------
 * Si une ligne est complète (aucun null), elle disparaît,
 * et toutes les lignes au-dessus descendent.
 *
 * On renvoie le nombre de lignes effacées.
 */
function clearFullLines() {
  const full = [];
  for (let y = 0; y < ROWS; y++) {
    let complete = true;
    for (let x = 0; x < COLS; x++) {
      if (grid[y][x] === null) {
        complete = false;
        break;
      }
    }
    if (complete) full.push(y);
  }

  if (full.length === 0) return 0;

  // Effet flash très court
  flashRows = full.slice();
  flashUntil = performance.now() + 120;

  // On reconstruit une nouvelle grille:
  // - on garde les lignes non pleines
  // - on ajoute en haut des lignes vides
  const newRows = [];
  for (let y = 0; y < ROWS; y++) {
    if (!full.includes(y)) newRows.push(grid[y]);
  }
  while (newRows.length < ROWS) {
    newRows.unshift(Array.from({ length: COLS }, () => null));
  }
  grid = newRows;
  return full.length;
}

function randomPieceType() {
  // Version simple: uniforme. (Le "7-bag" moderne est plus équilibré, mais plus complexe.)
  const idx = Math.floor(Math.random() * PIECE_TYPES.length);
  return PIECE_TYPES[idx];
}

function makePiece(type) {
  const matrix = cloneMatrix(SHAPES[type]);

  // Position de spawn: centré en haut
  const w = matrix[0].length;
  const x = Math.floor((COLS - w) / 2);
  const y = -1; // légèrement au-dessus de la grille (spawn plus naturel)

  return { type, matrix, x, y };
}

function spawnNextPiece() {
  if (!next) next = makePiece(randomPieceType());
  current = next;
  next = makePiece(randomPieceType());

  // Game Over si la nouvelle pièce collisionne déjà
  if (collides(current.matrix, current.x, current.y)) {
    triggerGameOver();
  }
}

// ---------------------------
// 4) Score / niveau
// ---------------------------

function addClearsToScore(cleared) {
  // Score dépend du nombre de lignes effacées en une fois
  score += (LINE_SCORES[cleared] || 0) * level;
  lines += cleared;

  // Niveau = 1 + (lignes / 10)
  level = 1 + Math.floor(lines / LINES_PER_LEVEL);

  // Best score (session)
  const best = getBestScore();
  if (score > best) setBestScore(score);

  syncUI();
}

function getBestScore() {
  const raw = sessionStorage.getItem(BEST_KEY);
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}

function setBestScore(n) {
  sessionStorage.setItem(BEST_KEY, String(n));
}

function syncUI() {
  scoreEl.textContent = String(score);
  levelEl.textContent = String(level);
  linesEl.textContent = String(lines);
  bestEl.textContent = String(getBestScore());

  restartBtn.disabled = !running;
}

// ---------------------------
// 5) Actions du joueur
// ---------------------------

function move(dx) {
  if (!running || paused || gameOver) return;
  const nx = current.x + dx;
  if (!collides(current.matrix, nx, current.y)) {
    current.x = nx;
  }
}

function softDrop() {
  if (!running || paused || gameOver) return;
  // Descendre d'une ligne si possible, sinon verrouiller
  const ny = current.y + 1;
  if (!collides(current.matrix, current.x, ny)) {
    current.y = ny;
    // Petit bonus (optionnel): 1 point par descente manuelle
    score += 1;
    syncUI();
  } else {
    lockAndContinue();
  }
  dropCounter = 0; // on "réinitialise" le timer de chute
}

function hardDrop() {
  if (!running || paused || gameOver) return;
  // On descend jusqu'à collision
  let ny = current.y;
  while (!collides(current.matrix, current.x, ny + 1)) ny++;
  current.y = ny;
  lockAndContinue();
  dropCounter = 0;
}

function rotate() {
  if (!running || paused || gameOver) return;

  // Rotation à droite + "wall kick" simplifié (petits déplacements)
  const rotated = rotateMatrixRight(current.matrix);

  // Si rotation OK directement, on applique
  if (!collides(rotated, current.x, current.y)) {
    current.matrix = rotated;
    return;
  }

  // Sinon, on essaye quelques décalages horizontaux (wall-kick simplifié)
  const kicks = [-1, 1, -2, 2];
  for (const k of kicks) {
    if (!collides(rotated, current.x + k, current.y)) {
      current.x += k;
      current.matrix = rotated;
      return;
    }
  }
}

function togglePause() {
  if (!running || gameOver) return;
  paused = !paused;
  if (!paused) {
    // On évite un gros saut de dropCounter après une pause
    lastTime = performance.now();
  }
}

// ---------------------------
// 6) Boucle de jeu
// ---------------------------

function lockAndContinue() {
  mergeCurrentIntoGrid();
  const cleared = clearFullLines();
  if (cleared > 0) addClearsToScore(cleared);
  spawnNextPiece();
}

/**
 * Calcul de la "ghost piece" (silhouette)
 * --------------------------------------
 * On copie la position Y puis on la fait descendre jusqu'à collision.
 * C'est un bonus visuel utile pour les joueurs (et simple à coder).
 */
function computeGhostY() {
  let gy = current.y;
  while (!collides(current.matrix, current.x, gy + 1)) gy++;
  return gy;
}

function update(time) {
  if (!running) return; // si le jeu n'a pas démarré, on ne boucle pas

  const delta = time - lastTime;
  lastTime = time;

  if (!paused && !gameOver) {
    dropCounter += delta;
    const interval = dropIntervalMs(level);
    if (dropCounter >= interval) {
      // chute automatique
      const ny = current.y + 1;
      if (!collides(current.matrix, current.x, ny)) {
        current.y = ny;
      } else {
        lockAndContinue();
      }
      dropCounter = 0;
    }
  }

  draw(time);
  requestAnimationFrame(update);
}

// ---------------------------
// 7) Dessin (canvas)
// ---------------------------

function clearCanvas(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
}

function drawGridBackground() {
  // Fond + lignes fines pour voir les cellules
  clearCanvas(gameCtx, gameCanvas.width, gameCanvas.height);

  // Fond léger
  gameCtx.fillStyle = "rgba(0,0,0,0.15)";
  gameCtx.fillRect(0, 0, gameCanvas.width, gameCanvas.height);

  // Quadrillage
  gameCtx.strokeStyle = "rgba(255,255,255,0.08)";
  gameCtx.lineWidth = 1;
  for (let x = 0; x <= COLS; x++) {
    gameCtx.beginPath();
    gameCtx.moveTo(x * CELL + 0.5, 0);
    gameCtx.lineTo(x * CELL + 0.5, ROWS * CELL);
    gameCtx.stroke();
  }
  for (let y = 0; y <= ROWS; y++) {
    gameCtx.beginPath();
    gameCtx.moveTo(0, y * CELL + 0.5);
    gameCtx.lineTo(COLS * CELL, y * CELL + 0.5);
    gameCtx.stroke();
  }
}

function drawCell(ctx, gx, gy, color, alpha = 1) {
  const x = gx * CELL;
  const y = gy * CELL;
  ctx.save();
  ctx.globalAlpha = alpha;

  // Case
  ctx.fillStyle = color;
  ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);

  // Petit effet "volume" (simple)
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 2, y + 2, CELL - 4, CELL - 4);

  ctx.restore();
}

function drawLockedBlocks(time) {
  const flashing = time < flashUntil;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const t = grid[y][x];
      if (!t) continue;
      const isFlashRow = flashing && flashRows.includes(y);
      const alpha = isFlashRow ? 0.35 : 1;
      drawCell(gameCtx, x, y, COLORS[t], alpha);
    }
  }
}

function drawPiece(piece, color, alpha = 1) {
  const { matrix, x: px, y: py } = piece;
  for (let y = 0; y < matrix.length; y++) {
    for (let x = 0; x < matrix[y].length; x++) {
      if (!matrix[y][x]) continue;
      const gx = px + x;
      const gy = py + y;
      if (gy < 0) continue; // partie au-dessus du canvas
      drawCell(gameCtx, gx, gy, color, alpha);
    }
  }
}

function drawNextPiece() {
  clearCanvas(nextCtx, nextCanvas.width, nextCanvas.height);
  nextCtx.fillStyle = "rgba(0,0,0,0.12)";
  nextCtx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);

  const pad = 12;
  const box = nextCanvas.width - pad * 2;

  // On dessine la matrice "centrée" dans le canvas next, avec une taille de case adaptée
  const m = next.matrix;
  const mh = m.length;
  const mw = m[0].length;

  const cell = Math.floor(box / Math.max(mw, mh));
  const startX = Math.floor((nextCanvas.width - mw * cell) / 2);
  const startY = Math.floor((nextCanvas.height - mh * cell) / 2);

  for (let y = 0; y < mh; y++) {
    for (let x = 0; x < mw; x++) {
      if (!m[y][x]) continue;
      nextCtx.fillStyle = COLORS[next.type];
      nextCtx.fillRect(startX + x * cell + 1, startY + y * cell + 1, cell - 2, cell - 2);
      nextCtx.strokeStyle = "rgba(255,255,255,0.18)";
      nextCtx.lineWidth = 2;
      nextCtx.strokeRect(startX + x * cell + 2, startY + y * cell + 2, cell - 4, cell - 4);
    }
  }
}

function draw(time) {
  drawGridBackground();
  drawLockedBlocks(time);

  if (running && current) {
    // Ghost piece (silhouette)
    const gy = computeGhostY();
    const ghost = { ...current, y: gy };
    drawPiece(ghost, COLORS.GHOST, 1);

    // Pièce courante
    drawPiece(current, COLORS[current.type] || "#ffffff", 1);
  }

  if (next) drawNextPiece();
}

// ---------------------------
// 8) Game over / UI
// ---------------------------

function showOverlay(title, text) {
  overlayTitle.textContent = title;
  overlayText.textContent = text || "";
  overlay.classList.remove("hidden");
}

function hideOverlay() {
  overlay.classList.add("hidden");
}

function triggerGameOver() {
  gameOver = true;
  running = true; // on garde le loop pour afficher l'écran + la dernière frame
  paused = false;

  showOverlay("Game Over", `Score final: ${score}`);
  restartBtn.disabled = false;
}

function resetGameState() {
  grid = createEmptyGrid();
  current = null;
  next = null;

  score = 0;
  level = 1;
  lines = 0;

  paused = false;
  gameOver = false;

  flashRows = [];
  flashUntil = 0;

  syncUI();
}

function startGame() {
  if (running) return;
  resetGameState();
  running = true;
  hideOverlay();
  spawnNextPiece();

  lastTime = performance.now();
  dropCounter = 0;
  requestAnimationFrame(update);
}

function restartGame() {
  resetGameState();
  running = true;
  hideOverlay();
  spawnNextPiece();

  lastTime = performance.now();
  dropCounter = 0;
  requestAnimationFrame(update);
}

// ---------------------------
// 9) Gestion des événements
// ---------------------------

// Boutons Start / Restart
startBtn.addEventListener("click", () => {
  startBtn.disabled = true;
  restartBtn.disabled = false;
  startGame();
});

restartBtn.addEventListener("click", () => {
  startBtn.disabled = true;
  restartGame();
});

overlayRestart.addEventListener("click", () => {
  startBtn.disabled = true;
  restartGame();
});

// Boutons tactiles (écran tactile / mobile)
const touchLeft = document.getElementById("touchLeft");
const touchRight = document.getElementById("touchRight");
const touchDown = document.getElementById("touchDown");
const touchRotate = document.getElementById("touchRotate");
const touchDrop = document.getElementById("touchDrop");
const touchPause = document.getElementById("touchPause");

function wireTapOrClick(el, handler) {
  if (!el) return;
  // Pour les mobiles: on réagit dès touchstart pour plus de réactivité.
  el.addEventListener("touchstart", (e) => {
    e.preventDefault();
    handler();
  });
  // Pour les tablettes / hybrides: on garde aussi le clic classique.
  el.addEventListener("click", (e) => {
    e.preventDefault();
    handler();
  });
}

wireTapOrClick(touchLeft, () => move(-1));
wireTapOrClick(touchRight, () => move(1));
wireTapOrClick(touchDown, () => softDrop());
wireTapOrClick(touchRotate, () => rotate());
wireTapOrClick(touchDrop, () => hardDrop());
wireTapOrClick(touchPause, () => togglePause());

// Clavier
document.addEventListener("keydown", (e) => {
  // Empêcher la page de scroller avec les flèches
  if (["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp", " "].includes(e.key)) {
    e.preventDefault();
  }

  if (!running) return;

  if (e.key === "p" || e.key === "P") {
    togglePause();
    return;
  }

  if (paused || gameOver) return;

  switch (e.key) {
    case "ArrowLeft":
      move(-1);
      break;
    case "ArrowRight":
      move(1);
      break;
    case "ArrowDown":
      softDrop();
      break;
    case "ArrowUp":
      rotate();
      break;
    case " ":
      hardDrop();
      break;
    default:
      break;
  }
});

// ---------------------------
// 10) Initialisation UI
// ---------------------------

// Dimensions canvas en pixels (utilise nos constantes)
gameCanvas.width = COLS * CELL;
gameCanvas.height = ROWS * CELL;

// Best score affiché
syncUI();

// Écran initial
showOverlay("Prêt ?", "Clique sur Start pour commencer.");

