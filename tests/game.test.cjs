const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const logic = require('../script.js');
const { createBoard, createPiece, createGame, hasCollision, lockPiece, stepDown } = logic;
const occupied = (board) => board.flat().filter((cell) => cell !== null).length;

test('보드와 게임 상태는 서로 독립적이다', () => {
  const first = createGame(() => 0);
  const second = createGame(() => 0);
  first.board[0][0] = 'red';
  assert.equal(first.board[1][0], null);
  assert.equal(second.board[0][0], null);
});

Object.keys(logic.TETROMINOES).forEach((type, index) => {
  test(`${type}: 상단 중앙 생성과 좌우·상단·바닥 경계`, () => {
    const piece = createPiece(() => (index + 0.5) / 7);
    const board = createBoard();
    const width = piece.shape[0].length;
    const height = piece.shape.length;
    assert.equal(piece.type, type);
    assert.equal(piece.x, Math.floor((10 - width) / 2));
    assert.equal(piece.y, 0);
    assert.equal(piece.shape.flat().filter(Boolean).length, 4);
    assert.equal(hasCollision(board, piece), false);
    for (const [x, y, expected] of [
      [0, 0, false], [-1, 0, true], [10 - width, 0, false],
      [11 - width, 0, true], [piece.x, -1, true],
      [piece.x, 20 - height, false], [piece.x, 21 - height, true],
    ]) assert.equal(hasCollision(board, piece, x, y), expected);
    piece.shape[0][0] = 9;
    assert.notEqual(logic.TETROMINOES[type].shape[0][0], 9);
  });
});

test('점유 칸만 충돌하며 판정은 상태를 바꾸지 않는다', () => {
  const board = createBoard();
  const piece = createPiece(() => 2.5 / 7); // T
  board[0][piece.x] = 'red'; // 모양 내부의 빈 칸
  assert.equal(hasCollision(board, piece), false);
  board[0][piece.x + 1] = 'blue';
  const before = JSON.stringify({ board, piece });
  assert.equal(hasCollision(board, piece), true);
  assert.equal(JSON.stringify({ board, piece }), before);
  assert.equal(hasCollision(createBoard(), { shape: [[0, 1]], x: -1, y: 0 }), false);
});

test('한 칸 하강하며 활성 블록은 보드에 기록하지 않는다', () => {
  const game = createGame(() => 0);
  assert.equal(stepDown(game), 'moved');
  assert.equal(game.currentPiece.y, 1);
  assert.equal(occupied(game.board), 0);
});

test('바닥 고정 후 상단에 새 블록을 정확히 한 번 생성한다', () => {
  const game = createGame(() => 0);
  const oldPiece = game.currentPiece;
  oldPiece.y = 19;
  let selections = 0;
  assert.equal(stepDown(game, () => { selections += 1; return 1.5 / 7; }), 'locked');
  assert.equal(oldPiece.y, 19);
  assert.equal(occupied(game.board), 4);
  assert.deepEqual(game.board[19].slice(3, 7), Array(4).fill(oldPiece.color));
  assert.equal(selections, 1);
  assert.equal(game.currentPiece.type, 'I');
  assert.equal(game.nextPiece.type, 'O');
  assert.equal(game.currentPiece.y, 0);
  stepDown(game);
  assert.equal(occupied(game.board), 4);
});

test('쌓인 블록 위 마지막 유효 위치에 고정하며 기존 칸을 보존한다', () => {
  const game = createGame(() => 1.5 / 7); // O
  game.currentPiece.y = 16;
  game.board[18][4] = 'red';
  assert.equal(stepDown(game, () => 0), 'locked');
  assert.equal(occupied(game.board), 5);
  assert.equal(game.board[18][4], 'red');
  assert.equal(game.board[16][4], '#ffeb3b');
  assert.equal(game.board[17][5], '#ffeb3b');
});

test('잘못된 고정은 부분 기록이나 덮어쓰기 없이 거부한다', () => {
  const board = createBoard();
  const piece = createPiece(() => 0);
  board[0][6] = 'red';
  const before = JSON.stringify(board);
  assert.equal(lockPiece(board, piece), false);
  assert.equal(JSON.stringify(board), before);
  piece.y = 20;
  assert.equal(lockPiece(board, piece), false);
  assert.equal(JSON.stringify(board), before);
});

test('생성 위치가 막히면 종료하며 이후 상태가 바뀌지 않는다', () => {
  const game = createGame(() => 0);
  game.currentPiece.y = 19;
  game.board[0][4] = 'red';
  assert.equal(stepDown(game, () => 1.5 / 7), 'game-over');
  assert.equal(game.currentPiece, null);
  assert.equal(occupied(game.board), 5);
  const before = JSON.stringify(game);
  assert.equal(stepDown(game), 'game-over');
  assert.equal(JSON.stringify(game), before);
});

test('상단 다른 위치가 차 있어도 생성 위치가 비면 계속한다', () => {
  const game = createGame(() => 0);
  game.currentPiece.y = 19;
  game.board[0][0] = 'red';
  assert.equal(stepDown(game, () => 0), 'locked');
  assert.equal(game.gameOver, false);
});

test('화면 연결: 500ms 타이머 하나, 틱마다 한 칸, 종료 시 중지', () => {
  let tick;
  let registrations = 0;
  let stops = 0;
  const cells = [];
  const ctx = {
    clearRect() { cells.length = 0; },
    fillRect(x, y) { if (this.fillStyle !== '#000000') cells.push([x, y]); },
    strokeRect() {},
  };
  const status = { textContent: '' };
  const canvas = { getContext: () => ctx };
  const math = Object.create(Math);
  math.random = () => 0;
  vm.runInNewContext(fs.readFileSync(require.resolve('../script.js'), 'utf8'), {
    Math: math,
    document: {
      getElementById: (id) => id === 'next-block' ? { width: 150, height: 120, getContext: () => ({ clearRect() {}, fillRect() {}, strokeRect() {} }) } : id === 'game-board' ? canvas
        : id === 'restart' ? { addEventListener() {}, blur() {} } : status,
      addEventListener() {},
    },
    setInterval(callback, delay) {
      registrations += 1;
      assert.equal(delay, 500);
      tick = callback;
      return 42;
    },
    clearInterval(id) { assert.equal(id, 42); stops += 1; },
  });
  assert.equal(cells.length, 4);
  assert.equal(cells[0][1], 0);
  tick();
  assert.equal(cells[0][1], 30);
  for (let i = 0; i < 300 && stops === 0; i += 1) tick();
  assert.equal(registrations, 1);
  assert.equal(stops, 1);
  assert.match(status.textContent, /게임오버/);
  assert.equal(cells.length, 80);
});
