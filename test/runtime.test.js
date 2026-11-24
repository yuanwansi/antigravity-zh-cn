'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadDictionaries } = require('../src/dict-loader');
const {
  createTranslator,
  shouldSkipElement,
  isIsolatedUiControl,
} = require('../src/runtime');

const DICT_DIR = path.resolve(__dirname, '..', 'dicts');

/**
 * 构造轻量级模拟 DOM 元素，用于测试 closest() 选择器守卫。
 */
function makeMockEl(selectorsMatched, textContent = '') {
  const matched = new Set(selectorsMatched);
  return {
    textContent,
    closest(sel) {
      return matched.has(sel) ? this : null;
    },
  };
}

test('翻译器：精确匹配、独立控件守卫、保留首尾空白与跳过路径/URL', () => {
  const dict = loadDictionaries(DICT_DIR, { strict: true });
  const translator = createTranslator(dict);

  // 复合短语在普通容器与独立控件中均可翻译
  assert.equal(translator.translateText('New Conversation'), '新建对话');
  assert.equal(translator.translateText('  Terminal Sandbox  '), '  终端沙盒  ');

  // 短词受独立控件守卫保护：普通正文不翻译，独立按钮/菜单放行
  assert.equal(translator.translateText('Save', { isIsolated: false }), null);
  assert.equal(translator.translateText('Save', { isIsolated: true }), '保存');
  assert.equal(translator.translateText('edit', { isIsolated: true }), '编辑');

  // URL、路径、纯数字绝不翻译
  assert.equal(translator.translateText('https://antigravity.google/docs'), null);
  assert.equal(translator.translateText('C:\\Users\\demo\\file.js'), null);
  assert.equal(translator.translateText('12345'), null);
});

test('翻译器：动态正则模板正确处理计数、耗时与额度重置倒计时', () => {
  const translator = createTranslator({ entries: {}, isolatedKeys: [] });

  assert.equal(translator.translateText('Working for 2m 15s'), '工作中 2 分 15 秒');
  assert.equal(translator.translateText('Worked for 42s'), '已工作 42 秒');
  assert.equal(translator.translateText('3 files changed'), '已变更 3 个文件');
  assert.equal(translator.translateText('1 file changed'), '已变更 1 个文件');
  assert.equal(translator.translateText('5 minutes ago'), '5 分钟前');
  assert.equal(translator.translateText('Quota resets in 4h 20m'), '额度将在 4 小时 20 分钟后重置');
  assert.equal(translator.translateText('Retry in 12s'), '12 秒后重试');
  assert.equal(translator.translateText('Version 2.35.0'), '版本 2.35.0');
  assert.equal(translator.translateText('75% remaining'), '剩余 75%');
  assert.equal(
    translator.translateText('Welcome back, 院丸寺. Where should we pick up?'),
    '欢迎回来，院丸寺。我们从哪里继续？'
  );
  assert.equal(translator.translateText('Good evening, Alex!'), '晚上好，Alex');
});

test('禁区隔离与独立控件守卫：保护代码块、用户输入、文件树与图标字体', () => {
  assert.equal(shouldSkipElement(makeMockEl(['code'])), true);
  assert.equal(shouldSkipElement(makeMockEl(['.monaco-editor'])), true);
  assert.equal(shouldSkipElement(makeMockEl(['[data-testid="user-input-step"]'])), true);
  assert.equal(shouldSkipElement(makeMockEl(['[role="treeitem"]'])), true);
  assert.equal(shouldSkipElement(makeMockEl(['.google-symbols'])), true);
  assert.equal(shouldSkipElement(makeMockEl(['[data-ag-i18n-skip]'])), true);
  assert.equal(shouldSkipElement(makeMockEl(['button'])), false);

  assert.equal(isIsolatedUiControl(makeMockEl(['button'], 'Save')), true);
  assert.equal(isIsolatedUiControl(makeMockEl(['[role="menuitem"]'], 'Settings')), true);
  // 过长的段落即使包在按钮内也不视为短标签
  assert.equal(isIsolatedUiControl(makeMockEl(['button'], 'A'.repeat(80))), false);
  assert.equal(isIsolatedUiControl(makeMockEl(['div'], 'Save')), false);
});
