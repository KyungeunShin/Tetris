// node tests/compare-behavior.cjs <수정 전 script.js> [수정 후 script.js]
// 동일 난수·입력으로 상태, 반환값, 화면 그리기, 타이머 간격, API를 비교합니다.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');

function capture(file) {
  let seed = 20261006;
  const math = Object.create(Math);
  math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const timers = new Map();
  let serial = 0;
  let keydown;
  let restart;
  const draws = [[], []];
  const contexts = draws.map(calls => ({
    clearRect(...args) { calls.length = 0; calls.push(['clear', ...args]); },
    fillRect(...args) { calls.push(['fill', this.fillStyle, ...args]); },
    strokeRect(...args) { calls.push(['stroke', this.strokeStyle, this.lineWidth, ...args]); },
  }));
  const elements = {
    'game-board': { getContext: () => contexts[0] },
    'next-block': { width: 150, height: 120, getContext: () => contexts[1] },
    score: {}, level: {}, 'game-status': {},
    restart: { addEventListener(type, fn) { restart = fn; }, blur() {} },
  };
  const context = vm.createContext({
    Math: math, module: { exports: {} },
    document: {
      getElementById: id => elements[id],
      addEventListener(type, fn) { keydown = fn; },
    },
    setInterval(fn, delay) { timers.set(++serial, { fn, delay }); return serial; },
    clearInterval(id) { timers.delete(id); },
  });
  const source = fs.readFileSync(file, 'utf8');
  assert.equal(source.split('const game = createGame();').length, 2);
  vm.runInContext(source.replace('const game = createGame();',
    'const game = createGame(); globalThis.testGame = game;'), context);
  const hash = crypto.createHash('sha256');
  let observations = 0;
  function record(result) {
    hash.update(JSON.stringify({ result, game: context.testGame, draws,
      score: elements.score.textContent, level: elements.level.textContent,
      status: elements['game-status'].textContent,
      timers: [...timers.values()].map(timer => timer.delay), serial }));
    observations++;
  }
  const api = context.module.exports;
  record(Object.entries(api).map(([key, value]) =>
    [key, typeof value === 'function' ? ['function', value.length] : value]));
  const actions = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '];
  for (let i = 0; i < 1000; i++) {
    if (i % 71 === 0) record(restart());
    else if (i % 7 === 0) record([...timers.values()][0]?.fn());
    else {
      let prevented = false;
      record(keydown({ key: actions[Math.floor(math.random() * actions.length)],
        repeat: i % 13 === 0, preventDefault() { prevented = true; } }));
      hash.update(String(prevented));
    }
  }
  for (const count of [0, 1, 2, 3, 4]) {
    record(restart());
    const game = context.testGame;
    game.score = 900;
    game.currentPiece = { type: 'I', shape: [[1], [1], [1], [1]], color: 'cyan', x: 9, y: 16 };
    for (let y = 20 - count; y < 20; y++) {
      game.board[y].fill('red'); game.board[y][9] = null;
    }
    record(keydown({ key: 'ArrowDown', preventDefault() {} }));
  }
  // 순수 로직의 반환값과 종료 이후 차단도 비교합니다.
  const game = api.createGame(math.random);
  for (let i = 0; i < 1000; i++) {
    if (i % 71 === 0) hash.update(JSON.stringify([api.restartGame(game, math.random), game]));
    else {
      const action = [() => api.movePiece(game, -1), () => api.movePiece(game, 1),
        () => api.rotatePiece(game), () => api.stepDown(game, math.random),
        () => api.hardDrop(game, math.random)][i % 5];
      hash.update(JSON.stringify([action(), game]));
    }
    observations++;
  }
  return { observations, digest: hash.digest('hex') };
}

if (require.main === module) {
  assert.ok(process.argv[2], '비교할 변경 전 script.js 경로가 필요합니다.');
  const before = capture(process.argv[2]);
  const after = capture(process.argv[3] || require.resolve('../script.js'));
  assert.deepEqual(after, before);
  console.log(JSON.stringify({ result: '동등', before, after }, null, 2));
}
module.exports = { capture };
