'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadDictionaries } = require('../src/dict-loader');
const {
  createTranslator,
  isAllowedLocalizationOrigin,
  shouldSkipElement,
  isIsolatedUiControl,
  mountDomLocalization,
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
  assert.equal(
    translator.translateText('Hey 院丸寺, what should we build today?'),
    '嗨，院丸寺，今天我们构建点什么？'
  );
  assert.equal(
    translator.translateText('Hi 院丸寺, what can we get done today?'),
    '你好，院丸寺，今天我们可以完成些什么？'
  );
  assert.equal(translator.translateText('Good evening, Alex!'), '晚上好，Alex');
  assert.equal(translator.translateText('Leaving on Nov 30, 2026'), '将于 2026 年 11 月 30 日下线');
  assert.equal(translator.translateText('5-hour limit, resets in 3h 20m'), '5 小时配额限制，3 小时 20 分钟后重置');
  assert.equal(translator.translateText('2 agents running'), '2 个智能体运行中');
  assert.equal(translator.translateText('Updated 5m ago'), '更新于 5 分钟前');
  assert.equal(translator.translateText('Every Monday at 9:00 AM'), '每周一 9:00 AM');

  // 长句词边界局部替换验证
  const longTranslator = createTranslator({
    entries: {
      'Configure global allowed and denied resource permissions.': '配置全局允许和拒绝的资源访问权限。',
    },
    isolatedKeys: [],
  });
  assert.equal(
    longTranslator.translateText('Configure global allowed and denied resource permissions. Learn more.'),
    '配置全局允许和拒绝的资源访问权限。 Learn more.'
  );
  // 处于对话散文段落（inProse: true）中时不触发动态模板或长句替换
  assert.equal(
    longTranslator.translateText('Configure global allowed and denied resource permissions. Learn more.', { inProse: true }),
    null
  );
});

test('域名安全边界与 React 独立叶节点标签检测', () => {
  assert.equal(isAllowedLocalizationOrigin({ protocol: 'http:', hostname: '127.0.0.1' }), true);
  assert.equal(isAllowedLocalizationOrigin({ protocol: 'http:', hostname: 'localhost' }), true);
  assert.equal(isAllowedLocalizationOrigin({ protocol: 'plugin:', hostname: 'swarm' }), true);
  assert.equal(isAllowedLocalizationOrigin({ protocol: 'https:', hostname: 'github.com' }), false);
  assert.equal(isAllowedLocalizationOrigin({ protocol: 'https:', hostname: 'antigravity.google' }), false);

  // React/Tailwind 独立 <div>Models</div> 叶节点应识别为独立 UI 标签
  const reactLeafDiv = {
    tagName: 'DIV',
    className: 'text-sm font-medium',
    textContent: 'Models',
    childNodes: [{ nodeType: 3 }],
    closest: () => null,
  };
  assert.equal(isIsolatedUiControl(reactLeafDiv), true);

  // 但位于 .prose 或 agent-message 中的 span 绝不能当作独立控件
  const proseSpan = {
    tagName: 'SPAN',
    className: '',
    textContent: 'Save',
    childNodes: [{ nodeType: 3 }],
    closest: (sel) => (sel === '.prose' ? {} : null),
  };
  assert.equal(isIsolatedUiControl(proseSpan), false);
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

test('React JSX 多文本插值节点（如 Hey {name}, what should we build today?）合并翻译与无损还原', () => {
  const t1 = { nodeType: 3, nodeValue: 'Hey ', parentElement: null };
  const t2 = { nodeType: 3, nodeValue: '院丸寺', parentElement: null };
  const t3 = { nodeType: 3, nodeValue: ', what should we build today?', parentElement: null };

  const heading = {
    nodeType: 1,
    tagName: 'H1',
    className: '',
    childNodes: [t1, t2, t3],
    get textContent() {
      return this.childNodes.map((c) => c.nodeValue).join('');
    },
    getAttribute: () => null,
    setAttribute: () => {},
    closest(sel) {
      return sel === 'h1' ? this : null;
    },
  };
  t1.parentElement = heading;
  t2.parentElement = heading;
  t3.parentElement = heading;

  const allNodes = [heading, t1, t2, t3];
  const mockDoc = {
    nodeType: 9,
    readyState: 'complete',
    body: {
      nodeType: 1,
      tagName: 'BODY',
      className: '',
      childNodes: [heading],
      getAttribute: () => null,
      setAttribute: () => {},
      closest: () => null,
      ownerDocument: null,
    },
    createTreeWalker() {
      let idx = -1;
      return {
        nextNode() {
          idx += 1;
          return idx < allNodes.length ? allNodes[idx] : null;
        },
      };
    },
  };
  mockDoc.body.ownerDocument = mockDoc;
  heading.ownerDocument = mockDoc;

  const prevWin = global.window;
  const prevDoc = global.document;
  global.window = {
    location: { protocol: 'http:', hostname: '127.0.0.1' },
    localStorage: { getItem: () => null, setItem: () => {} },
    addEventListener: () => {},
  };
  global.document = mockDoc;

  try {
    const api = mountDomLocalization({ entries: {}, isolatedKeys: [] });
    assert.equal(heading.textContent, '嗨，院丸寺，今天我们构建点什么？');

    // 验证按 Alt + Shift + L（toggle）可无损还原全部 3 个原始 TextNode
    api.toggle();
    assert.equal(heading.textContent, 'Hey 院丸寺, what should we build today?');
    assert.equal(t1.nodeValue, 'Hey ');
    assert.equal(t2.nodeValue, '院丸寺');
    assert.equal(t3.nodeValue, ', what should we build today?');
  } finally {
    global.window = prevWin;
    global.document = prevDoc;
  }
});
