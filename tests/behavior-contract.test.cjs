const assert = require('node:assert/strict');
const { test } = require('node:test');
const { capture } = require('./compare-behavior.cjs');

test('리팩터링 전 기준: 2,011개 관찰의 API·반환값·상태·화면·타이머 동등성', () => {
  assert.deepEqual(capture(require.resolve('../script.js')), {
    observations: 2011,
    digest: '6cdd5d1bceac69a8b72330ec690886d9fbf015fe2546c911840fe2fb9412c5c3',
  });
});
