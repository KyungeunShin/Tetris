const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const { createBoard, createGame, clearLines, stepDown, hardDrop,
  movePiece, rotatePiece } = require('../script.js');

test('빈 행과 한 칸 빈 행은 제거하지 않는다', () => {
  const board = createBoard();
  board[19].fill('red');
  board[19][9] = null;
  const before = JSON.stringify(board);
  assert.equal(clearLines(board), 0);
  assert.equal(JSON.stringify(board), before);
  assert.equal(createGame().score, 0);
});

for (const rows of [[19], [18, 19], [17, 18, 19], [16, 17, 18, 19], [3, 8, 19]]) {
  test(`${rows.join(', ')}행 동시 제거: 행 순서·하강 거리·보드 크기 보존`, () => {
    const board = createBoard();
    board.forEach((row, y) => { row[0] = `row-${y}`; });
    rows.forEach((y) => board[y].fill('full'));
    const remaining = board.filter((_, y) => !rows.includes(y)).map((row) => [...row]);
    assert.equal(clearLines(board), rows.length);
    assert.equal(board.length, 20);
    assert.ok(board.every((row) => row.length === 10));
    assert.deepEqual(board.slice(rows.length), remaining);
    assert.ok(board.slice(0, rows.length).flat().every((cell) => cell === null));
    board[0][1] = 'changed';
    assert.equal(board[1][1], null);
    assert.equal(clearLines(board), 0);
  });
}

function prepareClear(game, count) {
  game.board = createBoard();
  game.currentPiece = {
    type: 'I', shape: [[1], [1], [1], [1]], color: 'cyan', x: 9, y: 16,
  };
  for (let y = 20 - count; y < 20; y += 1) {
    game.board[y].fill('red');
    game.board[y][9] = null;
  }
}

for (const [count, points] of [[0, 0], [1, 100], [2, 300], [3, 500], [4, 800]]) {
  for (const drop of [stepDown, hardDrop]) {
    test(`${drop.name}: ${count}줄 고정·제거 후 ${points}점과 다음 블록 하나`, () => {
      const game = createGame(() => 0);
      prepareClear(game, count);
      game.score = 100;
      let selections = 0;
      assert.equal(drop(game, () => { selections += 1; return 0; }), 'locked');
      assert.equal(game.score, 100 + points);
      assert.equal(game.board.flat().filter((cell) => cell !== null).length, 4 - count);
      assert.equal(selections, 1);
      assert.equal(game.currentPiece.y, 0);
    });
  }
}

test('점수는 여러 번 제거하면 누적되고 이동·회전·하강에는 증가하지 않는다', () => {
  const game = createGame(() => 0);
  for (const count of [1, 2, 3, 4]) {
    prepareClear(game, count);
    stepDown(game, () => 0);
  }
  assert.equal(game.score, 1700);
  movePiece(game, -1);
  rotatePiece(game);
  stepDown(game);
  assert.equal(game.score, 1700);
  assert.equal(createGame().score, 0);
});

test('줄 제거를 먼저 적용해 생성 위치가 비면 종료하지 않는다', () => {
  const game = createGame(() => 0);
  game.board[0].fill('red');
  game.currentPiece.y = 19;
  assert.equal(stepDown(game, () => 0), 'locked');
  assert.equal(game.gameOver, false);
  assert.equal(game.score, 100);
  assert.ok(game.board[0].every((cell) => cell === null));
});

for (const trigger of ['timer', 'ArrowDown', ' ']) {
  test(`화면: ${trigger}으로 4줄 제거 시 우측 점수를 즉시 갱신`, () => {
    let tick;
    let keydown;
    const score = { textContent: 'old' };
    const status = { textContent: '' };
    const ctx = { clearRect() {}, fillRect() {}, strokeRect() {} };
    const context = vm.createContext({
      document: {
        getElementById: (id) => ({
          'game-board': { getContext: () => ctx }, score, 'game-status': status,
          level: { textContent: '' },
          'next-block': { width: 150, height: 120, getContext: () => ({ clearRect() {}, fillRect() {}, strokeRect() {} }) },
          restart: { addEventListener() {}, blur() {} },
        })[id],
        addEventListener(type, handler) { keydown = handler; },
      },
      setInterval(handler) { tick = handler; return 1; },
      clearInterval() {},
    });
    const source = fs.readFileSync(require.resolve('../script.js'), 'utf8');
    // 테스트 컨텍스트에서만 상태를 준비하며 제품 코드에는 디버그 경로를 추가하지 않는다.
    vm.runInContext(source.replace('const game = createGame();',
      'const game = createGame(); globalThis.testGame = game;'), context);
    assert.equal(score.textContent, '0');
    prepareClear(context.testGame, 4);
    if (trigger === 'timer') tick();
    else keydown({ key: trigger, preventDefault() {} });
    assert.equal(score.textContent, '800');
    assert.equal(context.testGame.board.flat().filter((cell) => cell !== null).length, 0);
  });
}
