const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');

function loadUI() {
  const activeTimers = new Map();
  const callbacks = [];
  const keys = [];
  const clicks = [];
  const context2d = { clearRect() {}, fillRect() {}, strokeRect() {} };
  const elements = {
    'game-board': { getContext: () => context2d },
    'next-block': { width: 150, height: 120, getContext: () => context2d },
    score: {}, level: {}, 'game-status': {},
    restart: { addEventListener(type, handler) { clicks.push(handler); }, blur() {} },
  };
  const math = Object.create(Math);
  math.random = () => 0;
  const context = vm.createContext({
    Math: math,
    document: {
      getElementById: id => elements[id],
      addEventListener(type, handler) { keys.push(handler); },
    },
    setInterval(callback, delay) {
      callbacks.push(callback);
      activeTimers.set(callbacks.length, { callback, delay });
      return callbacks.length;
    },
    clearInterval(id) { activeTimers.delete(id); },
  });
  const source = fs.readFileSync(require.resolve('../script.js'), 'utf8');
  vm.runInContext(source.replace('const game = createGame();',
    'const game = createGame(); globalThis.testGame = game;'), context);
  return { context, game: context.testGame, activeTimers, callbacks, keys, clicks, elements };
}

test('반복 초기화는 타이머·키보드·Restart 핸들러를 중복 등록하지 않는다', () => {
  const ui = loadUI();
  for (let i = 0; i < 5; i++) vm.runInContext('startGame()', ui.context);
  assert.equal(ui.activeTimers.size, 1);
  assert.equal(ui.keys.length, 1);
  assert.equal(ui.clicks.length, 1);
  assert.equal(ui.context.testGame, ui.game);
  ui.keys[0]({ key: 'ArrowDown', preventDefault() {} });
  assert.equal(ui.game.currentPiece.y, 1);
});

test('재시작 이전에 보관된 타이머 콜백은 새 게임을 변경하지 않는다', () => {
  const ui = loadUI();
  const obsolete = ui.callbacks[0];
  ui.clicks[0]();
  const before = JSON.stringify(ui.game);
  obsolete();
  assert.equal(JSON.stringify(ui.game), before);
  assert.equal(ui.activeTimers.size, 1);
  [...ui.activeTimers.values()][0].callback();
  assert.equal(ui.game.currentPiece.y, 1);
});

test('레벨 변경으로 교체한 이전 타이머 콜백은 무효이며 종료 후에도 유지된다', () => {
  const ui = loadUI();
  const obsolete = ui.callbacks[0];
  ui.game.score = 900;
  ui.game.currentPiece = { type: 'I', shape: [[1], [1], [1], [1]],
    color: 'cyan', x: 9, y: 16 };
  ui.game.board[19].fill('red');
  ui.game.board[19][9] = null;
  ui.keys[0]({ key: 'ArrowDown', preventDefault() {} });
  assert.equal(ui.game.level, 2);
  assert.equal([...ui.activeTimers.values()][0].delay, 460);
  const before = JSON.stringify(ui.game);
  obsolete();
  assert.equal(JSON.stringify(ui.game), before);
  ui.game.gameOver = true;
  ui.game.currentPiece = null;
  [...ui.activeTimers.values()][0].callback();
  assert.equal(ui.activeTimers.size, 0);
  const ended = JSON.stringify(ui.game);
  for (const callback of ui.callbacks) callback();
  assert.equal(JSON.stringify(ui.game), ended);
});

test('고정 직후의 연속 하강은 다음 블록에 한 번만 적용한다', () => {
  const ui = loadUI();
  ui.game.currentPiece.y = 19;
  ui.callbacks[0]();
  const spawned = ui.game.currentPiece;
  assert.equal(ui.game.board.flat().filter(Boolean).length, 4);
  ui.keys[0]({ key: 'ArrowDown', preventDefault() {} });
  assert.equal(ui.game.currentPiece, spawned);
  assert.equal(spawned.y, 1);
  assert.equal(ui.game.board.flat().filter(Boolean).length, 4);
});
