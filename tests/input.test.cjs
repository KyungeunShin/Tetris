const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const { createGame, movePiece, rotateClockwise, rotatePiece, hardDrop,
  TETROMINOES, hasCollision } = require('../script.js');

test('좌우 한 칸 이동과 벽·고정 블록 충돌 시 상태 보존', () => {
  const game = createGame(() => 0);
  assert.equal(movePiece(game, -1), true);
  assert.equal(game.currentPiece.x, 2);
  assert.equal(movePiece(game, 1), true);
  assert.equal(game.currentPiece.x, 3);
  for (const [x, direction] of [[0, -1], [6, 1]]) {
    game.currentPiece.x = x;
    const before = JSON.stringify(game);
    assert.equal(movePiece(game, direction), false);
    assert.equal(JSON.stringify(game), before);
  }
  game.currentPiece.x = 3;
  for (const [blockX, direction] of [[2, -1], [7, 1]]) {
    game.board[0][blockX] = 'red';
    const before = JSON.stringify(game);
    assert.equal(movePiece(game, direction), false);
    assert.equal(JSON.stringify(game), before);
  }
});

for (const [index, type] of Object.keys(TETROMINOES).entries()) {
  test(`${type}: 회전 후 4칸 유지, 4회 후 원형 복귀, 원본 보존`, () => {
    const game = createGame(() => (index + 0.5) / 7);
    const original = JSON.stringify(game.currentPiece.shape);
    const definitions = JSON.stringify(TETROMINOES);
    for (let turn = 0; turn < 4; turn += 1) {
      assert.equal(rotatePiece(game), true);
      assert.equal(game.currentPiece.shape.flat().filter(Boolean).length, 4);
      assert.equal(hasCollision(game.board, game.currentPiece), false);
      if (type === 'O') assert.equal(JSON.stringify(game.currentPiece.shape), original);
    }
    assert.equal(JSON.stringify(game.currentPiece.shape), original);
    assert.equal(JSON.stringify(TETROMINOES), definitions);
  });
}

test('T의 회전 방향은 시계 방향이다', () => {
  assert.deepEqual(rotateClockwise(TETROMINOES.T.shape), [[1, 0], [1, 1], [1, 0]]);
});

test('벽·바닥·고정 블록에 막힌 회전은 위치·모양·보드를 보존한다', () => {
  const wall = createGame(() => 0);
  assert.equal(rotatePiece(wall), true); // 세로 I
  wall.currentPiece.x = 9;
  const floor = createGame(() => 0);
  floor.currentPiece.y = 19;
  const stacked = createGame(() => 2.5 / 7); // T
  stacked.board[2][stacked.currentPiece.x] = 'red';
  for (const game of [wall, floor, stacked]) {
    assert.equal(hasCollision(game.board, game.currentPiece), false);
    const before = JSON.stringify(game);
    const shape = game.currentPiece.shape;
    assert.equal(rotatePiece(game), false);
    assert.equal(JSON.stringify(game), before);
    assert.equal(game.currentPiece.shape, shape);
  }
  const valid = createGame(() => 0);
  valid.currentPiece.x = 0;
  assert.equal(rotatePiece(valid), true); // 왼쪽 벽 안쪽의 유효 회전
  valid.currentPiece.x = 6;
  assert.equal(rotatePiece(valid), true); // 오른쪽 벽 안쪽의 유효 회전
});

test('Hard Drop은 바닥 또는 쌓인 블록 직전에서 고정하고 한 번만 생성한다', () => {
  for (const stacked of [false, true]) {
    const game = createGame(() => 1.5 / 7); // O
    const oldPiece = game.currentPiece;
    if (stacked) game.board[10][4] = 'red';
    let selections = 0;
    assert.equal(hardDrop(game, () => { selections += 1; return 0; }), 'locked');
    assert.equal(oldPiece.y, stacked ? 8 : 18);
    assert.equal(selections, 1);
    assert.equal(game.currentPiece.y, 0);
    assert.equal(game.board.flat().filter(Boolean).length, stacked ? 5 : 4);
    if (stacked) assert.equal(game.board[10][4], 'red');
  }
});

test('Hard Drop은 이미 바닥인 블록도 고정하며 생성 충돌 후 모든 조작을 차단한다', () => {
  const game = createGame(() => 0);
  game.currentPiece.y = 19;
  game.board[0][4] = 'red';
  assert.equal(hardDrop(game, () => 0), 'game-over');
  const before = JSON.stringify(game);
  assert.equal(movePiece(game, 1), false);
  assert.equal(rotatePiece(game), false);
  assert.equal(hardDrop(game), 'game-over');
  assert.equal(JSON.stringify(game), before);
});

test('키 입력과 화면: 조작키·스크롤 방지·키 반복·종료 차단·타이머 중복 없음', () => {
  let handler;
  let timers = 0;
  let listeners = 0;
  let stopped = 0;
  const cells = [];
  const ctx = {
    clearRect() { cells.length = 0; },
    fillRect(x, y) { if (this.fillStyle !== '#000000') cells.push([x, y]); },
    strokeRect() {},
  };
  const status = { textContent: '' };
  const math = Object.create(Math);
  math.random = () => 0;
  vm.runInNewContext(fs.readFileSync(require.resolve('../script.js'), 'utf8'), {
    Math: math,
    document: {
      getElementById: (id) => id === 'next-block' ? { width: 150, height: 120, getContext: () => ({ clearRect() {}, fillRect() {}, strokeRect() {} }) } : id === 'game-board' ? { getContext: () => ctx }
        : id === 'restart' ? { addEventListener() {}, blur() {} } : status,
      addEventListener(type, callback) {
        assert.equal(type, 'keydown');
        listeners += 1;
        handler = callback;
      },
    },
    setInterval(callback, delay) { assert.equal(delay, 500); timers += 1; return 1; },
    clearInterval(id) { assert.equal(id, 1); stopped += 1; },
  });
  function press(key, extra = {}, expectedPrevented = true) {
    let prevented = false;
    handler({ key, preventDefault() { prevented = true; }, ...extra });
    assert.equal(prevented, expectedPrevented);
  }
  press('ArrowLeft');
  assert.equal(cells[0][0], 60);
  press('ArrowRight');
  assert.equal(cells[0][0], 90);
  press('ArrowDown', { repeat: true });
  assert.equal(cells[0][1], 30);
  press('ArrowUp');
  assert.deepEqual(cells, [[90, 30], [90, 60], [90, 90], [90, 120]]);
  const rotated = JSON.stringify(cells);
  press('a', {}, false);
  press('ArrowLeft', { ctrlKey: true }, false);
  press('ArrowLeft', { target: { closest: () => ({}) } }, false);
  assert.equal(JSON.stringify(cells), rotated);
  press(' ', { code: 'Space' });
  assert.equal(cells.length, 8);
  assert.ok(cells.some(([x, y]) => x === 90 && y === 570));
  const afterDrop = JSON.stringify(cells);
  press(' ', { repeat: true });
  assert.equal(JSON.stringify(cells), afterDrop);
  for (let i = 0; i < 25 && stopped === 0; i += 1) press(' ', { code: 'Space' });
  assert.equal(stopped, 1);
  assert.match(status.textContent, /게임오버/);
  const ended = JSON.stringify(cells);
  for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ']) press(key);
  assert.equal(JSON.stringify(cells), ended);
  assert.equal(stopped, 1);
  assert.equal(timers, 1);
  assert.equal(listeners, 1);
});
