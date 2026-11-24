'use strict';

/**
 * Antigravity 桌面端动态汉化运行时引擎（注入至 Electron preload.js 执行）。
 *
 * 核心特性：
 * 1. 全方位内容禁区隔离：自动跳过聊天用户输入、思考正文、代码块、文件树、路径、终端与图标字体。
 * 2. 独立控件守卫：短词/单词仅在独立 UI 控件（按钮、菜单项、标签页、表头、表单标签等）中生效，绝不污染段落正文。
 * 3. 动态模板匹配：针对含数字、时长、文件数、重置倒计时等动态状态提供正则翻译。
 * 4. 实时中/英热切换：内置 `Alt + Shift + L` 快捷键，使用 WeakMap 保存原文，无需重启客户端即可无损切回英文。
 * 5. 双模式导出：既可在浏览器/Electron preload 中自动启动，也可在 Node.js 单元测试中直接 `require` 验证逻辑。
 */

const STORAGE_KEY = 'antigravity_zh_cn_enabled';

/**
 * 绝不翻译的内容禁区选择器（包含其所有子孙节点）。
 */
const SKIP_ANCESTOR_SELECTORS = [
  '[data-ag-i18n-skip]',
  '[data-ag-localization-skip]',
  '[data-testid="user-input-step"]',
  '[data-testid="thought-content"]',
  '[contenteditable="true"]',
  'code',
  'pre',
  'kbd',
  'samp',
  'textarea',
  'script',
  'style',
  'noscript',
  'svg',
  'math',
  '.monaco-editor',
  '.xterm',
  '.xterm-screen',
  '.code-block',
  '.code-line',
  '.line-content',
  '[data-line-tokens]',
  '[role="tree"]',
  '[role="treeitem"]',
  '[aria-label="File path breadcrumbs"]',
  '.codicon',
  '.google-symbols',
  '.material-symbols-outlined',
  '.material-icons',
];

/**
 * 独立 UI 控件选择器：短词/单字仅在命中这些控件时翻译。
 */
const ISOLATED_CONTROL_SELECTORS = [
  'button',
  'a',
  'label',
  'th',
  'dt',
  'legend',
  'summary',
  'option',
  'h1',
  'h2',
  'h3',
  'h4',
  '[role="button"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  '[role="tab"]',
  '[role="option"]',
  '[role="columnheader"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="heading"]',
];

/**
 * 动态模板正则规则（按顺序匹配，全部采用全串锚定 `^...$` 防止误伤正文）。
 */
const DYNAMIC_RULES = [
  {
    pattern: /^Working for (\d+)m (\d+)s$/i,
    replace: (_, m, s) => `工作中 ${m} 分 ${s} 秒`,
  },
  {
    pattern: /^Working for (\d+)s$/i,
    replace: (_, s) => `工作中 ${s} 秒`,
  },
  {
    pattern: /^Worked for (\d+)m (\d+)s$/i,
    replace: (_, m, s) => `已工作 ${m} 分 ${s} 秒`,
  },
  {
    pattern: /^Worked for (\d+)s$/i,
    replace: (_, s) => `已工作 ${s} 秒`,
  },
  {
    pattern: /^(\d+) seconds? ago$/i,
    replace: (_, n) => `${n} 秒前`,
  },
  {
    pattern: /^(\d+) minutes? ago$/i,
    replace: (_, n) => `${n} 分钟前`,
  },
  {
    pattern: /^(\d+) hours? ago$/i,
    replace: (_, n) => `${n} 小时前`,
  },
  {
    pattern: /^(\d+) days? ago$/i,
    replace: (_, n) => `${n} 天前`,
  },
  {
    pattern: /^(\d+) files? changed$/i,
    replace: (_, n) => `已变更 ${n} 个文件`,
  },
  {
    pattern: /^(\d+) results?$/i,
    replace: (_, n) => `${n} 条结果`,
  },
  {
    pattern: /^(\d+) items?$/i,
    replace: (_, n) => `${n} 项`,
  },
  {
    pattern: /^(\d+) selected$/i,
    replace: (_, n) => `已选择 ${n} 项`,
  },
  {
    pattern: /^Page (\d+) of (\d+)$/i,
    replace: (_, cur, total) => `第 ${cur} / ${total} 页`,
  },
  {
    pattern: /^Version ([\w.-]+)$/i,
    replace: (_, ver) => `版本 ${ver}`,
  },
  {
    pattern: /^Retry in (\d+)s$/i,
    replace: (_, s) => `${s} 秒后重试`,
  },
  {
    pattern: /^Resets in (\d+)h (\d+)m$/i,
    replace: (_, h, m) => `${h} 小时 ${m} 分钟后重置`,
  },
  {
    pattern: /^Resets in (\d+)m$/i,
    replace: (_, m) => `${m} 分钟后重置`,
  },
  {
    pattern: /^Quota resets in (\d+)h (\d+)m$/i,
    replace: (_, h, m) => `额度将在 ${h} 小时 ${m} 分钟后重置`,
  },
  {
    pattern: /^(\d+)% used$/i,
    replace: (_, pct) => `已使用 ${pct}%`,
  },
  {
    pattern: /^(\d+)% remaining$/i,
    replace: (_, pct) => `剩余 ${pct}%`,
  },
];

/**
 * 规范化待匹配文本（合并连续空白并去首尾空格）。
 * @param {string} text
 * @returns {string}
 */
function normalizeText(text) {
  return String(text).replace(/\s+/g, ' ').trim();
}

/**
 * 判断某个节点是否应该被跳过（位于禁区或不可翻译元素内）。
 * @param {Element|null} element
 * @returns {boolean}
 */
function shouldSkipElement(element) {
  if (!element || typeof element.closest !== 'function') {
    return false;
  }
  for (const selector of SKIP_ANCESTOR_SELECTORS) {
    try {
      if (element.closest(selector)) {
        return true;
      }
    } catch {
      // 忽略旧环境不支持的选择器
    }
  }
  return false;
}

/**
 * 判断节点是否属于独立 UI 控件标签（用于放行短词/单字翻译）。
 * @param {Element|null} element
 * @returns {boolean}
 */
function isIsolatedUiControl(element) {
  if (!element || typeof element.closest !== 'function') {
    return false;
  }
  for (const selector of ISOLATED_CONTROL_SELECTORS) {
    try {
      const host = element.closest(selector);
      if (host) {
        const textLen = (host.textContent || '').trim().length;
        // 仅当控件自身文本简洁时才视为独立标签，避免大段落容器误匹配
        if (textLen > 0 && textLen <= 48) {
          return true;
        }
      }
    } catch {
      // 忽略选择器异常
    }
  }
  return false;
}

/**
 * 创建一个纯粹的翻译器实例（支持精确匹配、大小写回退、独立控件守卫与动态模板）。
 * @param {{ entries: Record<string, string>, isolatedKeys?: string[] }} dictPayload
 */
function createTranslator(dictPayload) {
  const exactMap = new Map();
  const lowerMap = new Map();
  const isolatedSet = new Set(dictPayload.isolatedKeys || []);

  for (const [rawKey, val] of Object.entries(dictPayload.entries || {})) {
    const key = normalizeText(rawKey);
    if (!key || typeof val !== 'string') continue;
    exactMap.set(key, val);
    const lower = key.toLowerCase();
    if (!lowerMap.has(lower)) {
      lowerMap.set(lower, { key, val });
    }
    if (!dictPayload.isolatedKeys && key.length <= 12 && !key.includes(' ')) {
      isolatedSet.add(key);
    }
  }

  /**
   * 尝试翻译单段文本；未命中或被守卫拦截时返回 null。
   * @param {string} rawText
   * @param {{ isIsolated?: boolean }} [ctx]
   * @returns {string|null}
   */
  function translateText(rawText, ctx = {}) {
    if (typeof rawText !== 'string') return null;
    const normalized = normalizeText(rawText);
    if (!normalized || normalized.length > 260) return null;
    // 跳过纯数字、路径、URL、纯符号
    if (/^[\d\s.,:%/+-]+$/.test(normalized)) return null;
    if (/^(https?:\/\/|file:\/\/|[a-zA-Z]:\\|\/[\w.-]+)/.test(normalized)) return null;

    // 1. 精确命中
    if (exactMap.has(normalized)) {
      if (isolatedSet.has(normalized) && !ctx.isIsolated) {
        return null;
      }
      return preserveOuterWhitespace(rawText, exactMap.get(normalized));
    }

    // 2. 大小写不敏感回退（仅限非短词或独立控件）
    const lowerHit = lowerMap.get(normalized.toLowerCase());
    if (lowerHit) {
      if (isolatedSet.has(lowerHit.key) && !ctx.isIsolated) {
        return null;
      }
      return preserveOuterWhitespace(rawText, lowerHit.val);
    }

    // 3. 动态正则模板
    for (const rule of DYNAMIC_RULES) {
      const match = normalized.match(rule.pattern);
      if (match) {
        const replaced = rule.replace(...match);
        return preserveOuterWhitespace(rawText, replaced);
      }
    }

    return null;
  }

  return {
    translateText,
    size: exactMap.size,
  };
}

/**
 * 保留原字符串首尾空白，避免破坏内联排版间距。
 * @param {string} original
 * @param {string} translated
 * @returns {string}
 */
function preserveOuterWhitespace(original, translated) {
  const lead = original.match(/^\s*/)[0];
  const tail = original.match(/\s*$/)[0];
  return `${lead}${translated}${tail}`;
}

/**
 * 尝试读取用户自定义覆盖词典（`~/.antigravity-zh-cn/custom-dict.json`）。
 * 在 sandboxed preload 或文件不存在时静默降级。
 * @returns {Record<string, string>}
 */
function tryLoadUserCustomDict() {
  try {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const customPath = path.join(os.homedir(), '.antigravity-zh-cn', 'custom-dict.json');
    if (!fs.existsSync(customPath)) return {};
    const parsed = JSON.parse(fs.readFileSync(customPath, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (!k.startsWith('_') && typeof v === 'string' && v.trim()) {
        out[normalizeText(k)] = v.trim();
      }
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * 在浏览器 / Electron 渲染进程中启动动态汉化引擎。
 * @param {{ entries: Record<string, string>, isolatedKeys?: string[] }} dictPayload
 */
function mountDomLocalization(dictPayload) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return null;
  }
  if (window.__ANTIGRAVITY_ZH_CN_MOUNTED__) {
    return window.__ANTIGRAVITY_ZH_CN_API__;
  }

  const mergedEntries = Object.assign({}, dictPayload.entries || {}, tryLoadUserCustomDict());
  const translator = createTranslator({
    entries: mergedEntries,
    isolatedKeys: dictPayload.isolatedKeys,
  });

  const originalTextMap = new WeakMap();
  const originalAttrMap = new WeakMap();
  const trackedNodes = new Set();
  const TRANSLATABLE_ATTRS = ['placeholder', 'title', 'aria-label'];

  let enabled = true;
  try {
    const saved = window.localStorage && window.localStorage.getItem(STORAGE_KEY);
    if (saved === '0') enabled = false;
  } catch {
    // 忽略受限 storage
  }

  function processTextNode(node) {
    if (!node || node.nodeType !== 3) return;
    const parent = node.parentElement;
    if (!parent || shouldSkipElement(parent)) return;

    const current = node.nodeValue || '';
    if (!current.trim()) return;

    const isIsolated = isIsolatedUiControl(parent);
    const translated = translator.translateText(current, { isIsolated });
    if (translated && translated !== current) {
      if (!originalTextMap.has(node)) {
        originalTextMap.set(node, current);
      }
      node.nodeValue = translated;
      trackedNodes.add(node);
    }
  }

  function processElementAttrs(el) {
    if (!el || el.nodeType !== 1 || shouldSkipElement(el)) return;
    let attrOriginals = originalAttrMap.get(el);
    for (const attr of TRANSLATABLE_ATTRS) {
      const val = el.getAttribute(attr);
      if (!val || !val.trim()) continue;
      const translated = translator.translateText(val, { isIsolated: true });
      if (translated && translated !== val) {
        if (!attrOriginals) {
          attrOriginals = new Map();
          originalAttrMap.set(el, attrOriginals);
        }
        if (!attrOriginals.has(attr)) {
          attrOriginals.set(attr, val);
        }
        el.setAttribute(attr, translated);
        trackedNodes.add(el);
      }
    }
  }

  function translateSubtree(root) {
    if (!enabled || !root) return;
    if (root.nodeType === 3) {
      processTextNode(root);
      return;
    }
    if (root.nodeType !== 1 && root.nodeType !== 9) return;
    if (root.nodeType === 1) {
      if (shouldSkipElement(root)) return;
      processElementAttrs(root);
    }

    const doc = root.nodeType === 9 ? root : root.ownerDocument || document;
    const walker = doc.createTreeWalker(root, 1 | 4); // SHOW_ELEMENT | SHOW_TEXT
    let cur = walker.nextNode();
    while (cur) {
      if (cur.nodeType === 1) {
        processElementAttrs(cur);
      } else if (cur.nodeType === 3) {
        processTextNode(cur);
      }
      cur = walker.nextNode();
    }
  }

  function restoreAllOriginals() {
    for (const node of trackedNodes) {
      if (node.nodeType === 3 && originalTextMap.has(node)) {
        node.nodeValue = originalTextMap.get(node);
      } else if (node.nodeType === 1 && originalAttrMap.has(node)) {
        const map = originalAttrMap.get(node);
        for (const [attr, orig] of map.entries()) {
          node.setAttribute(attr, orig);
        }
      }
    }
  }

  function setEnabled(nextState) {
    enabled = Boolean(nextState);
    try {
      if (window.localStorage) {
        window.localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
      }
    } catch {
      // 忽略受限 storage
    }
    if (enabled) {
      translateSubtree(document.body || document.documentElement);
    } else {
      restoreAllOriginals();
    }
    return enabled;
  }

  let pendingRoots = new Set();
  let rafScheduled = false;

  function flushPending() {
    rafScheduled = false;
    const roots = Array.from(pendingRoots);
    pendingRoots.clear();
    if (!enabled) return;
    for (const root of roots) {
      translateSubtree(root);
    }
  }

  function scheduleRoot(node) {
    if (!enabled || !node) return;
    pendingRoots.add(node);
    if (!rafScheduled) {
      rafScheduled = true;
      const schedule =
        typeof window.requestAnimationFrame === 'function'
          ? window.requestAnimationFrame
          : (cb) => setTimeout(cb, 16);
      schedule(flushPending);
    }
  }

  const startObserver = () => {
    const target = document.body || document.documentElement;
    if (!target) return;
    if (enabled) {
      translateSubtree(target);
    }
    if (typeof MutationObserver === 'function') {
      const observer = new MutationObserver((mutations) => {
        if (!enabled) return;
        for (const m of mutations) {
          if (m.type === 'characterData') {
            scheduleRoot(m.target);
          } else if (m.type === 'attributes') {
            scheduleRoot(m.target);
          } else if (m.type === 'childList') {
            for (const added of m.addedNodes) {
              scheduleRoot(added);
            }
          }
        }
      });
      observer.observe(target, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: TRANSLATABLE_ATTRS,
      });
    }
  };

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', startObserver, { once: true });
  } else {
    startObserver();
  }

  // 快捷键 Alt + Shift + L 实时切换中/英文界面
  window.addEventListener('keydown', (ev) => {
    if (ev.altKey && ev.shiftKey && String(ev.key).toLowerCase() === 'l') {
      ev.preventDefault();
      setEnabled(!enabled);
    }
  });

  const api = {
    version: '1.0.0',
    isEnabled: () => enabled,
    setEnabled,
    toggle: () => setEnabled(!enabled),
    dictSize: translator.size,
  };

  window.__ANTIGRAVITY_ZH_CN_MOUNTED__ = true;
  window.__ANTIGRAVITY_ZH_CN_API__ = api;
  return api;
}

module.exports = {
  STORAGE_KEY,
  SKIP_ANCESTOR_SELECTORS,
  ISOLATED_CONTROL_SELECTORS,
  DYNAMIC_RULES,
  normalizeText,
  shouldSkipElement,
  isIsolatedUiControl,
  createTranslator,
  mountDomLocalization,
};
