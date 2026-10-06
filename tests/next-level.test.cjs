const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const { createGame, createPiece, hardDrop, movePiece, rotatePiece, restartGame,
  getLevel, getDropInterval, TETROMINOES } = require('../script.js');

for (const [index, type] of Object.keys(TETROMINOES).entries()) {
  test(`${type}: 미리보기 블록이 그대로 생성되고 새 미리보기는 독립적이다`, () => {
    const game = createGame(() => 0);
    game.nextPiece = createPiece(() => (index + 0.5) / 7);
    const preview = game.nextPiece;
    const before = JSON.stringify(preview);
    movePiece(game, -1);
    rotatePiece(game);
    assert.equal(JSON.stringify(preview), before);
    assert.equal(hardDrop(game, () => 1.5 / 7), 'locked');
    assert.equal(game.currentPiece, preview);
    assert.equal(game.currentPiece.type, type);
    assert.equal(game.currentPiece.y, 0);
    assert.equal(game.nextPiece.type, 'O');
    assert.notEqual(game.nextPiece, preview);
  });
}

test('레벨 경계와 속도 하한', () => {
  for (const [score, level, delay] of [[0, 1, 500], [999, 1, 500], [1000, 2, 460],
    [1999, 2, 460], [2000, 3, 420], [10000, 11, 100], [100000, 101, 100]]) {
    assert.equal(getLevel(score), level);
    assert.equal(getDropInterval(level), delay);
  }
});

for (const trigger of ['timer', 'ArrowDown', ' ']) {
  test(`${trigger}: 레벨 상승 시 화면·타이머 즉시 갱신, 재시작 초기화`, () => {
    const timers = new Map();
    let registrations = 0;
    let keydown;
    let click;
    const previewCells = [];
    const previewCtx = {
      clearRect() { previewCells.length = 0; },
      fillRect(x, y, width, height) { previewCells.push([x, y, width, height, this.fillStyle]); },
      strokeRect() {},
    };
    const elements = {
      'game-board': { getContext: () => ({ clearRect() {}, fillRect() {}, strokeRect() {} }) },
      'next-block': { width: 150, height: 120, getContext: () => previewCtx },
      score: {}, level: {}, 'game-status': {},
      restart: { addEventListener(type, handler) { click = handler; }, blur() {} },
    };
    const context = vm.createContext({
      document: {
        getElementById: (id) => elements[id],
        addEventListener(type, handler) { keydown = handler; },
      },
      setInterval(handler, delay) { timers.set(++registrations, { handler, delay }); return registrations; },
      clearInterval(id) { timers.delete(id); },
    });
    const source = fs.readFileSync(require.resolve('../script.js'), 'utf8');
    vm.runInContext(source.replace('const game = createGame();',
      'const game = createGame(); globalThis.testGame = game;'), context);
    const game = context.testGame;
    assert.equal(elements.level.textContent, '1');
    assert.equal(previewCells.length, 4);
    assert.ok(previewCells.every(([x, y, w, h]) => x >= 0 && y >= 0 && x + w <= 150 && y + h <= 120));
    game.score = 900;
    game.board[19].fill('red');
    game.board[19][9] = null;
    game.currentPiece = { type: 'I', shape: [[1], [1], [1], [1]], color: 'cyan', x: 9, y: 16 };
    const preview = game.nextPiece;
    if (trigger === 'timer') [...timers.values()][0].handler();
    else keydown({ key: trigger, preventDefault() {} });
    assert.equal(game.currentPiece, preview);
    assert.equal(game.score, 1000);
    assert.equal(game.level, 2);
    assert.equal(elements.level.textContent, '2');
    assert.match(elements['game-status'].textContent, /0.46초/);
    assert.equal(timers.size, 1);
    assert.equal([...timers.values()][0].delay, 460);
    keydown({ key: 'ArrowLeft', preventDefault() {} });
    assert.equal(registrations, 2);
    click();
    assert.equal(game.level, 1);
    assert.equal(game.score, 0);
    assert.equal(elements.level.textContent, '1');
    assert.notEqual(game.nextPiece, preview);
    assert.equal(timers.size, 1);
    assert.equal([...timers.values()][0].delay, 500);
    [...timers.values()][0].handler();
    assert.equal(game.currentPiece.y, 1);
  });
}

test('종료 후 재시작은 미리보기와 레벨도 초기화한다', () => {
  const game = createGame(() => 0);
  const preview = game.nextPiece;
  game.gameOver = true;
  game.currentPiece = null;
  game.score = 10000;
  game.level = 11;
  restartGame(game, () => 1.5 / 7);
  assert.equal(game.level, 1);
  assert.equal(game.nextPiece.type, 'O');
  assert.notEqual(game.nextPiece, preview);
  assert.notEqual(game.nextPiece.shape, game.currentPiece.shape);
});
