// 실행: NODE_PATH에 Playwright 설치 경로를 지정한 뒤 node tests/browser-playtest.cjs
// 제품 소스는 변경하지 않고 기존 VM 테스트와 같은 방식으로 상태를 노출합니다.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
// 이전 소스도 동일한 브라우저 시나리오로 점검할 수 있습니다.
const source = fs.readFileSync(process.env.TETRIS_SCRIPT || path.join(root, 'script.js'), 'utf8');
assert.equal(source.split('const game = createGame();').length, 2);
const fixture = source.replace('const game = createGame();',
  'const game = createGame(); globalThis.testGame = game;');
const server = http.createServer((req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname;
  const files = { '/': 'index.html', '/script.js': 'script.js', '/style.css': 'style.css' };
  if (!files[name]) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' :
    name.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8');
  res.end(name === '/script.js' ? source : fs.readFileSync(path.join(root, files[name])));
});

async function checkBrowser(name, executablePath, url) {
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    // 최초 진입은 가공하지 않은 실제 제품 파일로 검사합니다.
    await page.goto(url);
    assert.equal(await page.locator('#score').textContent(), '0');
    assert.deepEqual(await page.locator('#game-board').evaluate(c => [c.width, c.height]), [300, 600]);
    await page.keyboard.press('ArrowDown');
    await page.locator('#restart').click();
    assert.equal(await page.locator('#score').textContent(), '0');

    await page.route('**/script.js', route => route.fulfill({
      contentType: 'text/javascript', body: fixture,
    }));
    await page.clock.install({ time: new Date('2026-10-06T00:00:00Z') });
    await page.clock.pauseAt(new Date('2026-10-06T00:00:01Z'));
    await page.reload();
    const state = () => page.evaluate(() => JSON.parse(JSON.stringify(testGame)));
    const results = [];
    assert.equal(await page.evaluate(() => {
      const game = testGame;
      for (let i = 0; i < 5; i++) startGame();
      return testGame === game;
    }), true);
    await page.keyboard.press('ArrowDown');
    assert.equal((await state()).currentPiece.y, 1);
    await page.clock.runFor(500);
    assert.equal((await state()).currentPiece.y, 2);
    results.push('5회 초기화 후 단일 입력·자동 하강 통과');
    for (const [index, type] of ['I', 'O', 'T', 'S', 'Z', 'J', 'L'].entries()) {
      await page.evaluate(index => { Math.random = () => (index + 0.5) / 7; }, index);
      await page.locator('#restart').click();
      const initial = await state();
      assert.equal(initial.currentPiece.type, type);
      assert.equal(initial.currentPiece.shape.flat().filter(Boolean).length, 4);
      await page.keyboard.press('ArrowLeft');
      assert.equal((await state()).currentPiece.x, initial.currentPiece.x - 1);
      await page.keyboard.press('ArrowRight');
      assert.equal((await state()).currentPiece.x, initial.currentPiece.x);
      await page.keyboard.press('ArrowUp');
      assert.deepEqual((await state()).currentPiece.shape,
        initial.currentPiece.shape[0].map((_, y) =>
          initial.currentPiece.shape.map((row) => row[y]).reverse()));
      await page.keyboard.press('ArrowDown');
      assert.equal((await state()).currentPiece.y, 1);
      await page.clock.runFor(500);
      assert.equal((await state()).currentPiece.y, 2);
    }
    results.push('7종 생성 및 각 종류 좌우·회전·Soft Drop·자동 하강 통과');

    for (const [count, points] of [[1, 100], [2, 300], [3, 500], [4, 800]]) {
      for (const trigger of ['timer', 'ArrowDown', 'Space']) {
        await page.locator('#restart').click();
        await page.evaluate(count => {
          testGame.currentPiece = { type: 'I', shape: [[1], [1], [1], [1]],
            color: 'cyan', x: 9, y: 16 };
          for (let y = 20 - count; y < 20; y++) {
            testGame.board[y].fill('red'); testGame.board[y][9] = null;
          }
        }, count);
        if (trigger === 'timer') await page.clock.runFor(500);
        else await page.keyboard.press(trigger);
        const game = await state();
        assert.equal(game.score, points);
        assert.equal(await page.locator('#score').textContent(), String(points));
        assert.equal(game.board.flat().filter(Boolean).length, 4 - count);
        assert.ok(game.board.every(row => row.some(cell => cell === null)));
      }
    }
    results.push('1/2/3/4줄 삭제 및 100/300/500/800점 화면 표시 통과 (자동·Soft·Hard Drop)');

    await page.locator('#restart').click();
    await page.evaluate(() => { Math.random = () => 0; });
    await page.locator('#restart').click();
    // 상태 조작 없이 실제 키 입력으로 상단까지 쌓아 종료합니다.
    for (let i = 0; i < 21 && !(await state()).gameOver; i++) await page.keyboard.press('Space');
    const ended = await state();
    assert.equal(ended.gameOver, true);
    assert.match(await page.locator('#game-status').textContent(), /게임오버/);
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space']) {
      await page.keyboard.press(key);
    }
    await page.clock.runFor(1500);
    assert.deepEqual(await state(), ended);
    for (let i = 0; i < 6; i++) await page.locator('#restart').click();
    const restarted = await state();
    assert.equal(restarted.gameOver, false);
    assert.equal(restarted.score, 0);
    assert.equal(restarted.level, 1);
    assert.ok(restarted.board.flat().every(cell => cell === null));
    assert.equal(restarted.currentPiece.y, 0);
    assert.equal(await page.locator('#score').textContent(), '0');
    await page.clock.runFor(499);
    assert.equal((await state()).currentPiece.y, 0);
    await page.clock.runFor(1);
    assert.equal((await state()).currentPiece.y, 1);
    await page.keyboard.press('ArrowDown');
    assert.equal((await state()).currentPiece.y, 2);
    results.push('실제 키 입력 Game Over, 종료 후 차단, 6회 재시작 및 단일 자동 하강 통과');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ browser: name, version: browser.version(), results, errors }, null, 2));
  } finally { await browser.close(); }
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/`;
    for (const [name, exe] of [
      ['Chrome', 'C:/Program Files/Google/Chrome/Application/chrome.exe'],
      ['Edge', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'],
    ]) {
      if (!fs.existsSync(exe)) throw new Error(`${name} 실행 파일을 찾을 수 없습니다: ${exe}`);
      await checkBrowser(name, exe, url);
    }
  } finally { server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
