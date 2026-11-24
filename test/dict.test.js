'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadDictionaries } = require('../src/dict-loader');

const DICT_DIR = path.resolve(__dirname, '..', 'dicts');

test('内置词典分包无错误、无重复键、无违规通配单字', () => {
  const result = loadDictionaries(DICT_DIR, { strict: true });

  assert.equal(result.issues.length, 0, `发现词典问题: ${JSON.stringify(result.issues, null, 2)}`);
  assert.ok(result.stats.fileCount >= 5, '至少应包含 5 个核心模块词典');
  assert.ok(result.stats.total >= 200, `词典总量过少: ${result.stats.total}`);
  assert.equal(result.entries['New Conversation'], '新建对话');
  assert.equal(result.entries['Terminal Sandbox'], '终端沙盒');
  assert.ok(result.isolatedKeys.includes('Save'), '短词 Save 应纳入独立控件守卫清单');
  assert.ok(!result.isolatedKeys.includes('New Conversation'), '复合短语不应被当作单字短词限制');
});

test('用户自定义词典正确覆盖内置译文并拦截危险通配单字', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-dict-test-'));
  try {
    // 1. 验证用户覆盖词典
    const userDict = path.join(tmpDir, 'custom-dict.json');
    fs.writeFileSync(
      userDict,
      JSON.stringify({ 'New Conversation': '开启全新会话', 'Custom Brand': '自定义品牌' }),
      'utf8'
    );
    const merged = loadDictionaries(DICT_DIR, { userDictPath: userDict, strict: true });
    assert.equal(merged.entries['New Conversation'], '开启全新会话');
    assert.equal(merged.entries['Custom Brand'], '自定义品牌');
    assert.equal(merged.stats.userOverrides, 2);

    // 2. 验证严禁收录高危通配单字（如 "on" / "git"）
    const badDir = path.join(tmpDir, 'bad-dicts');
    fs.mkdirSync(badDir);
    fs.writeFileSync(path.join(badDir, 'bad.json'), JSON.stringify({ on: '开', git: '版本' }), 'utf8');
    assert.throws(() => loadDictionaries(badDir, { strict: true }), /禁止收录高危通配单字/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
