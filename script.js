// 보드 좌표는 픽셀이 아닌 '칸' 단위입니다. 왼쪽 위가 (0, 0)입니다.
const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 30;

const DROP_INTERVAL = 500;
const LEVEL_SCORE = 1000;
const DROP_DECREMENT = 40;
const MIN_DROP_INTERVAL = 100;
const LINE_SCORES = [0, 100, 300, 500, 800];

// 1은 블록이 있는 칸, 0은 빈 칸입니다. 각 모양은 정확히 네 칸입니다.
// 모양 데이터는 기본 방향입니다. 회전은 복사본에만 적용합니다.
const TETROMINOES = {
  I: {
    shape: [[1, 1, 1, 1]],
    color: '#00bcd4', // 하늘색
  },
  O: {
    shape: [[1, 1], [1, 1]],
    color: '#ffeb3b', // 노란색
  },
  T: {
    shape: [[0, 1, 0], [1, 1, 1]],
    color: '#9c27b0', // 보라색
  },
  S: {
    shape: [[0, 1, 1], [1, 1, 0]],
    color: '#4caf50', // 초록색
  },
  Z: {
    shape: [[1, 1, 0], [0, 1, 1]],
    color: '#f44336', // 빨간색
  },
  J: {
    shape: [[1, 0, 0], [1, 1, 1]],
    color: '#2196f3', // 파란색
  },
  L: {
    shape: [[0, 0, 1], [1, 1, 1]],
    color: '#ff9800', // 주황색
  },
};

function createBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function createPiece(random = Math.random) {
  const types = Object.keys(TETROMINOES);
  const type = types[Math.floor(random() * types.length)];
  const tetromino = TETROMINOES[type];
  return {
    type,
    shape: tetromino.shape.map((row) => [...row]),
    color: tetromino.color,
    x: Math.floor((COLS - tetromino.shape[0].length) / 2),
    y: 0,
  };
}

// 빈 모양 칸은 무시하고, 점유 칸의 경계와 고정 블록만 검사합니다.
// 후보 좌표를 받아 판정하므로 블록이나 보드를 변경하지 않습니다.
function hasCollision(board, piece, x = piece.x, y = piece.y) {
  return piece.shape.some((row, shapeY) => row.some((cell, shapeX) => {
    if (cell !== 1) return false;
    const boardX = x + shapeX;
    const boardY = y + shapeY;
    return boardX < 0 || boardX >= COLS || boardY < 0 || boardY >= ROWS
      || board[boardY][boardX] !== null;
  }));
}

function lockPiece(board, piece) {
  // 전체 배치를 먼저 검사하여 기존 칸 덮어쓰기와 부분 고정을 방지합니다.
  if (hasCollision(board, piece)) return false;
  piece.shape.forEach((row, shapeY) => {
    row.forEach((cell, shapeX) => {
      if (cell === 1) board[piece.y + shapeY][piece.x + shapeX] = piece.color;
    });
  });
  return true;
}

// 완성 행을 동시에 제외하고 남은 행의 순서를 유지해 아래로 압축합니다.
function clearLines(board) {
  const remaining = board.filter((row) => row.some((cell) => cell === null));
  const cleared = board.length - remaining.length;
  if (cleared === 0) return 0;
  const emptyRows = Array.from({ length: cleared }, () => Array(COLS).fill(null));
  board.splice(0, board.length, ...emptyRows, ...remaining);
  return cleared;
}

function getLevel(score) {
  return 1 + Math.floor(score / LEVEL_SCORE);
}

function getDropInterval(level) {
  return Math.max(MIN_DROP_INTERVAL, DROP_INTERVAL - (level - 1) * DROP_DECREMENT);
}

function createGame(random = Math.random) {
  return { board: createBoard(), currentPiece: createPiece(random), nextPiece: createPiece(random),
    score: 0, level: 1, gameOver: false };
}

function restartGame(game, random = Math.random) {
  Object.assign(game, createGame(random));
}

function movePiece(game, direction) {
  if (game.gameOver || (direction !== -1 && direction !== 1)) return false;
  const piece = game.currentPiece;
  const nextX = piece.x + direction;
  if (hasCollision(game.board, piece, nextX, piece.y)) return false;
  piece.x = nextX;
  return true;
}

// 행렬의 왼쪽 위 좌표를 유지하면서 시계 방향으로 90도 회전합니다.
function rotateClockwise(shape) {
  return Array.from({ length: shape[0].length }, (_, y) =>
    Array.from({ length: shape.length }, (_, x) => shape[shape.length - 1 - x][y]));
}

function rotatePiece(game) {
  if (game.gameOver) return false;
  const piece = game.currentPiece;
  const rotated = { ...piece, shape: rotateClockwise(piece.shape) };
  // 후보 전체가 유효할 때만 적용합니다. 막히면 위치와 형태를 그대로 유지합니다.
  if (hasCollision(game.board, rotated)) return false;
  piece.shape = rotated.shape;
  return true;
}

// 한 번 호출하면 한 칸 내려가거나, 마지막 유효 위치에 고정하고 교체합니다.
function stepDown(game, random = Math.random) {
  if (game.gameOver) return 'game-over';
  const piece = game.currentPiece;
  if (!hasCollision(game.board, piece, piece.x, piece.y + 1)) {
    piece.y += 1;
    return 'moved';
  }
  if (!lockPiece(game.board, piece)) {
    game.gameOver = true;
    game.currentPiece = null;
    return 'game-over';
  }
  const cleared = clearLines(game.board);
  game.score += LINE_SCORES[cleared];
  game.level = getLevel(game.score);
  const nextPiece = game.nextPiece;
  game.gameOver = hasCollision(game.board, nextPiece);
  game.currentPiece = game.gameOver ? null : nextPiece;
  if (!game.gameOver) game.nextPiece = createPiece(random);
  return game.gameOver ? 'game-over' : 'locked';
}

function hardDrop(game, random = Math.random) {
  if (game.gameOver) return 'game-over';
  const piece = game.currentPiece;
  while (!hasCollision(game.board, piece, piece.x, piece.y + 1)) {
    piece.y += 1;
  }
  // 자동 하강·Soft Drop과 같은 고정 및 다음 블록 생성 흐름을 사용합니다.
  return stepDown(game, random);
}

// 렌더러는 게임 데이터를 읽어 두 캔버스에 그리는 책임만 가집니다.
function createRenderer(canvas, nextCanvas) {
  const ctx = canvas.getContext('2d');
  const nextCtx = nextCanvas.getContext('2d');
  canvas.width = COLS * BLOCK_SIZE;
  canvas.height = ROWS * BLOCK_SIZE;

  // 보드의 칸 좌표를 픽셀 좌표로 바꿔 한 칸을 그립니다.
  function drawCell(x, y, color, context = ctx) {
    const pixelX = x * BLOCK_SIZE;
    const pixelY = y * BLOCK_SIZE;

    context.fillStyle = color;
    context.fillRect(pixelX, pixelY, BLOCK_SIZE, BLOCK_SIZE);

    // 테두리를 칸 안쪽에 그려 가장자리도 보이도록 합니다.
    // 반 픽셀을 맞추면 두께 1픽셀의 선이 선명하게 표시됩니다.
    context.strokeStyle = '#303030';
    context.lineWidth = 1;
    context.strokeRect(pixelX + 0.5, pixelY + 0.5, BLOCK_SIZE - 1, BLOCK_SIZE - 1);
  }

  // 현재 데이터를 화면에 반영하기만 합니다. 보드나 블록 위치는 바꾸지 않습니다.
  function draw(game) {
    const { board, currentPiece } = game;
    // 이전 그림을 지워 다시 그릴 때 잔상이 남지 않도록 합니다.
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 빈 칸도 검은 배경과 테두리를 그려 10×20 그리드를 표시합니다.
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        drawCell(x, y, board[y][x] ?? '#000000');
      }
    }

    // 활성 블록은 보드에 저장하지 않고 그 위에 겹쳐 그립니다.
    // 모양 내부 좌표에 블록의 위치를 더해 실제 보드 좌표를 구합니다.
    if (!currentPiece) return;
    currentPiece.shape.forEach((row, shapeY) => {
      row.forEach((cell, shapeX) => {
        if (cell === 1) {
          drawCell(currentPiece.x + shapeX, currentPiece.y + shapeY, currentPiece.color);
        }
      });
    });
  }

  function drawNext(game) {
    nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
    const piece = game.nextPiece;
    const offsetX = (nextCanvas.width / BLOCK_SIZE - piece.shape[0].length) / 2;
    const offsetY = (nextCanvas.height / BLOCK_SIZE - piece.shape.length) / 2;
    piece.shape.forEach((row, y) => {
      row.forEach((cell, x) => {
        if (cell === 1) drawCell(offsetX + x, offsetY + y, piece.color, nextCtx);
      });
    });
  }

  return (game) => {
    draw(game);
    drawNext(game);
  };
}

// 단일 타이머 유지와 오래된 콜백 차단을 한 곳에서 관리합니다.
function createDropTimer(onTick) {
  let timer = null;
  let timerInterval = null;
  let timerGeneration = 0;

  function stop() {
    // 이미 교체하거나 중지한 타이머의 콜백은 현재 게임에 적용하지 않습니다.
    timerGeneration += 1;
    if (timer === null) return;
    clearInterval(timer);
    timer = null;
    timerInterval = null;
  }

  function sync(interval) {
    if (timerInterval === interval) return;
    stop();
    timerInterval = interval;
    const generation = timerGeneration;
    timer = setInterval(() => {
      if (generation !== timerGeneration) return;
      onTick();
    }, timerInterval);
  }

  return { stop, sync };
}

// 같은 문서에서 재호출해도 게임과 이벤트 연결은 한 번만 생성합니다.
const initializedDocuments = new WeakSet();

function startGame() {
  if (initializedDocuments.has(document)) return;
  const render = createRenderer(document.getElementById('game-board'),
    document.getElementById('next-block'));
  const level = document.getElementById('level');
  const status = document.getElementById('game-status');
  const score = document.getElementById('score');
  const restartButton = document.getElementById('restart');
  const game = createGame();
  const dropTimer = createDropTimer(() => {
    stepDown(game);
    updateScreen();
  });

  function updateScreen() {
    render(game);
    level.textContent = String(game.level);
    score.textContent = String(game.score);
    if (game.gameOver) {
      dropTimer.stop();
      status.textContent = '게임오버 — 다시시작 버튼을 눌러 주세요.';
    } else {
      const interval = getDropInterval(game.level);
      status.textContent = `${interval / 1000}초마다 자동으로 내려옵니다.`;
      dropTimer.sync(interval);
    }
  }

  restartButton.addEventListener('click', () => {
    dropTimer.stop();
    restartGame(game);
    updateScreen();
    // 버튼에서 키보드 조작으로 자연스럽게 이어지도록 포커스를 해제합니다.
    restartButton.blur();
  });

  dropTimer.sync(getDropInterval(game.level));
  updateScreen();

  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.altKey || event.metaKey
      || event.target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    const key = event.code === 'Space' ? ' ' : event.key;
    // 버튼에 포커스된 Space는 기본 버튼 클릭 동작에 맡깁니다.
    if (key === ' ' && event.target?.closest?.('button')) return;
    if (!['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', ' '].includes(key)) return;
    event.preventDefault();
    if (game.gameOver) return;
    // 스페이스를 계속 눌러 새 블록까지 연속 고정되는 것을 방지합니다.
    if (key === ' ' && event.repeat) return;
    switch (key) {
      case 'ArrowLeft': movePiece(game, -1); break;
      case 'ArrowRight': movePiece(game, 1); break;
      case 'ArrowDown': stepDown(game); break;
      case 'ArrowUp': rotatePiece(game); break;
      case ' ': hardDrop(game); break;
    }
    updateScreen();
  });
  initializedDocuments.add(document);
}

// 브라우저는 즉시 시작하고, Node 테스트는 DOM이나 실제 시간 없이 로직을 사용합니다.
if (typeof document !== 'undefined') startGame();
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { COLS, ROWS, DROP_INTERVAL, LEVEL_SCORE, MIN_DROP_INTERVAL,
    getLevel, getDropInterval, TETROMINOES,
    createBoard, createPiece, hasCollision, lockPiece, clearLines, createGame, restartGame, stepDown,
    movePiece, rotateClockwise, rotatePiece, hardDrop };
}
