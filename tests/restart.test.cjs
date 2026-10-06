const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const { createGame, restartGame, stepDown, movePiece, rotatePiece,
  hardDrop, TETROMINOES } = require('../script.js');

for (const gameOver of [false, true]) {
  test(`${gameOver ? '종료 후' : '진행 중'} 재시작: 빈 보드·0점·새 블록`, () => {
    const game = createGame(() => 0);
    const oldBoard = game.board;
    const oldPiece = game.currentPiece;
    game.board[19][0] = 'red';
    game.score = 800;
    game.gameOver = gameOver;
    if (gameOver) game.currentPiece = null;
    restartGame(game, () => 1.5 / 7);
    assert.notEqual(game.board, oldBoard);
    assert.notEqual(game.currentPiece, oldPiece);
    assert.ok(game.board.flat().every((cell) => cell === null));
    assert.equal(game.score, 0);
    assert.equal(game.gameOver, false);
    assert.equal(game.currentPiece.type, 'O');
    assert.equal(game.currentPiece.y, 0);
    assert.equal(stepDown(game), 'moved');
    assert.equal(oldBoard[19][0], 'red');
  });
}

Object.keys(TETROMINOES).forEach((type, index) => {
  test(`${type} 생성 위치가 막히면 종료하며 점수와 보드를 보존한다`, () => {
    const game = createGame(() => 0);
    game.currentPiece.y = 19;
    const next = createGame(() => (index + 0.5) / 7).currentPiece;
    game.nextPiece = next;
    const occupiedX = next.shape[0].indexOf(1);
    game.board[0][next.x + occupiedX] = 'red';
    game.score = 300;
    assert.equal(stepDown(game, () => (index + 0.5) / 7), 'game-over');
    assert.equal(game.currentPiece, null);
    const before = JSON.stringify(game);
    assert.equal(stepDown(game), 'game-over');
    assert.equal(movePiece(game, -1), false);
    assert.equal(rotatePiece(game), false);
    assert.equal(hardDrop(game), 'game-over');
    assert.equal(JSON.stringify(game), before);
    assert.equal(game.score, 300);
  });
});

test('화면: 게임오버·타이머 중지·버튼 재시작·반복 클릭 후 단일 하강', () => {
  const timers = new Map();
  let timerId = 0;
  let click;
  let keydown;
  let listeners = 0;
  let blurs = 0;
  const score = { textContent: '' };
  const status = { textContent: '' };
  const cells = [];
  const ctx = {
    clearRect() { cells.length = 0; },
    fillRect(x, y) { if (this.fillStyle !== '#000000') cells.push([x, y]); },
    strokeRect() {},
  };
  const context = vm.createContext({
    document: {
      getElementById: (id) => ({
        'game-board': { getContext: () => ctx }, score, 'game-status': status,
          level: { textContent: '' },
          'next-block': { width: 150, height: 120, getContext: () => ({ clearRect() {}, fillRect() {}, strokeRect() {} }) },
        restart: {
          addEventListener(type, handler) { assert.equal(type, 'click'); click = handler; },
          blur() { blurs += 1; },
        },
      })[id],
      addEventListener(type, handler) { listeners += 1; keydown = handler; },
    },
    setInterval(handler, delay) {
      assert.equal(delay, 500);
      timers.set(++timerId, handler);
      return timerId;
    },
    clearInterval(id) { timers.delete(id); },
  });
  const source = fs.readFileSync(require.resolve('../script.js'), 'utf8');
  vm.runInContext(source.replace('const game = createGame();',
    'const game = createGame(); globalThis.testGame = game;'), context);
  const game = context.testGame;
  game.board[0].fill('red', 3, 7); // 7종 생성 위치를 모두 막되 완성 행은 만들지 않습니다.
  game.currentPiece.y = 19 - game.currentPiece.shape.length + 1;
  game.score = 800;
  const tick = [...timers.values()][0];
  tick();
  assert.equal(game.gameOver, true);
  assert.match(status.textContent, /게임오버/);
  assert.equal(score.textContent, '800');
  assert.equal(timers.size, 0);
  const ended = JSON.stringify(game);
  tick();
  for (const key of ['ArrowDown', 'ArrowLeft', 'ArrowUp', ' ']) {
    keydown({ key, preventDefault() {} });
  }
  assert.equal(JSON.stringify(game), ended);
  click();
  assert.equal(game.gameOver, false);
  assert.equal(score.textContent, '0');
  assert.ok(game.board.flat().every((cell) => cell === null));
  assert.equal(cells.length, 4);
  assert.match(status.textContent, /0.5초/);
  assert.equal(timers.size, 1);
  for (let i = 0; i < 5; i += 1) {
    game.board[19][0] = 'red';
    game.score = 100;
    click();
    assert.equal(score.textContent, '0');
    assert.equal(timers.size, 1);
  }
  [...timers.values()][0]();
  assert.equal(game.currentPiece.y, 1);
  keydown({ key: 'ArrowDown', preventDefault() {} });
  assert.equal(game.currentPiece.y, 2);
  let prevented = false;
  keydown({ key: ' ', target: { closest: () => ({}) },
    preventDefault() { prevented = true; } });
  assert.equal(prevented, false);
  assert.equal(game.currentPiece.y, 2);
  assert.equal(listeners, 1);
  assert.equal(blurs, 6);
});
