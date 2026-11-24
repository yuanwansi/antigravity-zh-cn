'use strict';

/**
 * Antigravity 桌面端动态汉化运行时引擎（注入至 Electron preload.js 执行）。
 *
 * 核心特性：
 * 1. 域名与协议边界保护：仅在本地客户端与 `plugin:` 页面启用，绝不触碰外部网页。
 * 2. 全方位内容禁区隔离：自动跳过聊天用户输入、模型回复/Markdown 正文、思考正文、代码块、文件树、路径、终端与图标字体。
 * 3. 智能独立控件守卫：既覆盖语义按钮/菜单，也覆盖 React/Tailwind 的独立 `<div>`/`<span>` 标签/徽章，同时严格拦截散文段落内的单字误译。
 * 4. 长句词边界局部替换 + 35+ 动态模板正则：处理混合标点说明文案、动态欢迎语、耗时、Git 状态、定时调度与额度倒计时。
 * 5. 同源 `<iframe>` 自动穿透 + `Alt + Shift + L` 实时中/英热切换。
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
  'canvas',
  'math',
  '.monaco-editor',
  '.editor-container',
  '.suggest-widget',
  '.xterm',
  '.xterm-screen',
  '.terminal',
  '.output-view',
  '.debug-console',
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
 * 对话/文档散文容器选择器：其中的单字短词绝不当作 UI 按钮翻译。
 */
const PROSE_CONTAINER_SELECTORS = [
  '[data-testid="agent-message"]',
  '[data-testid="agent-response"]',
  '.prose',
  '.markdown',
  '.markdown-body',
  'p',
  'li',
  'blockquote',
  'article',
];

/**
 * 显式语义化独立 UI 控件选择器。
 */
const ISOLATED_CONTROL_SELECTORS = [
  'button',
  'a',
  'label',
  'time',
  'th',
  'dt',
  'legend',
  'summary',
  'option',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
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
 * 独立叶节点标签标签名集合（React/Tailwind 常用于构建侧边栏项、状态徽章、分组标题）。
 */
const STANDALONE_LEAF_TAGS = new Set(['DIV', 'SPAN', 'TIME', 'TD', 'DD', 'HEADER', 'NAV', 'ASIDE']);

const WEEKDAY_MAP = {
  monday: '周一',
  tuesday: '周二',
  wednesday: '周三',
  thursday: '周四',
  friday: '周五',
  saturday: '周六',
  sunday: '周日',
  mon: '周一',
  tue: '周二',
  wed: '周三',
  thu: '周四',
  fri: '周五',
  sat: '周六',
  sun: '周日',
};

const MONTH_MAP = {
  january: 1, jan: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sep: 9, sept: 9,
  october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
};

const GREETING_PREFIX_MAP = [
  { re: /^Welcome back$/i, fn: (name) => `欢迎回来，${name}` },
  { re: /^Welcome$/i, fn: (name) => `欢迎，${name}` },
  { re: /^Good morning$/i, fn: (name) => `早上好，${name}` },
  { re: /^Good afternoon$/i, fn: (name) => `下午好，${name}` },
  { re: /^Good evening$/i, fn: (name) => `晚上好，${name}` },
  { re: /^(?:Good|Nice|Great) to see you(?: again)?$/i, fn: (name) => `很高兴见到你，${name}` },
  { re: /^Hey(?: there)?$/i, fn: (name) => `嗨，${name}` },
  { re: /^Hi(?: there)?$/i, fn: (name) => `你好，${name}` },
  { re: /^Hello(?: there)?$/i, fn: (name) => `你好，${name}` },
];

const GREETING_QUESTION_MAP = [
  { re: /^where should we pick up\??$/i, text: '我们从哪里继续？' },
  { re: /^where should we (?:start|begin)\??$/i, text: '我们从哪里开始？' },
  { re: /^what should we build(?: today)?\??$/i, text: '今天我们构建点什么？' },
  { re: /^what are we building(?: today)?\??$/i, text: '今天我们要构建什么？' },
  { re: /^what would you like to build(?: today)?\??$/i, text: '今天想构建点什么？' },
  { re: /^what (?:can|should) we get done(?: today)?\??$/i, text: '今天我们可以完成些什么？' },
  { re: /^what (?:are we|should we) work(?:ing)? on(?: today)?\??$/i, text: '今天我们要推进什么任务？' },
  { re: /^what would you like to work on(?: today)?\??$/i, text: '今天想处理什么任务？' },
  { re: /^(?:what can i help(?: you)? with|how can i help(?: you)?)(?: today)?\??$/i, text: '今天有什么可以帮你的？' },
  { re: /^what'?s on your mind(?: today)?\??$/i, text: '今天有什么想法？' },
  { re: /^what'?s next\??$/i, text: '接下来做什么？' },
  { re: /^ready to (?:build|start|dive in|code|ship)\??$/i, text: '准备好开始了吗？' },
];

/**
 * 组合式欢迎语翻译器：覆盖任意「问候前缀 + 用户名 + 引导问题」的随机抽签组合。
 * 例如：
 *   - "Hey 院丸寺, what should we build today?"
 *   - "Hi 院丸寺, what can we get done today?"
 *   - "Welcome back, 院丸寺. Where should we pick up?"
 * @param {string} normalized
 * @returns {string|null}
 */
function translateWelcomeGreeting(normalized) {
  // 1. 纯引导问题（不含用户名）
  for (const q of GREETING_QUESTION_MAP) {
    if (q.re.test(normalized) && /\?$/.test(normalized)) {
      return q.text;
    }
  }

  // 2. 问候前缀 + 用户名 + 可选后续引导问题
  const m = normalized.match(
    /^(Welcome back|Welcome|Good morning|Good afternoon|Good evening|(?:Good|Nice|Great) to see you(?: again)?|Hey(?: there)?|Hi(?: there)?|Hello(?: there)?)(?:,\s*|\s+)([^,.!?]{1,40}?)(?:([,.!])\s*(.+)|[.!]?)$/i
  );
  if (!m) return null;

  const [, rawPrefix, rawName, sep, rawRest] = m;
  const name = rawName.trim();
  if (!name) return null;

  const prefixEntry = GREETING_PREFIX_MAP.find((p) => p.re.test(rawPrefix.trim()));
  if (!prefixEntry) return null;
  const head = prefixEntry.fn(name);

  if (!rawRest) {
    return head;
  }

  const rest = rawRest.trim();
  for (const q of GREETING_QUESTION_MAP) {
    if (q.re.test(rest)) {
      const joiner = sep === '.' || sep === '!' ? '。' : '，';
      return `${head}${joiner}${q.text}`;
    }
  }
  return null;
}

/**
 * 动态模板正则规则（全部采用全串锚定 `^...$`，防止误伤普通句子）。
 */
const DYNAMIC_RULES = [
  // 1. 组合式欢迎页动态问候语
  {
    pattern: /^(?:Welcome|Good |Nice |Great |Hey|Hi|Hello|Where should|What |How can|Ready to).+/i,
    replace: (full) => translateWelcomeGreeting(full),
  },

  // 2. 运行/思考/检索耗时状态
  {
    pattern: /^Working for (\d+)h (\d+)m$/i,
    replace: (_, h, m) => `工作中 ${h} 小时 ${m} 分钟`,
  },
  {
    pattern: /^Working for (\d+)m (\d+)s$/i,
    replace: (_, m, s) => `工作中 ${m} 分 ${s} 秒`,
  },
  {
    pattern: /^Working for (\d+)s$/i,
    replace: (_, s) => `工作中 ${s} 秒`,
  },
  {
    pattern: /^Worked for (\d+)h (\d+)m$/i,
    replace: (_, h, m) => `已工作 ${h} 小时 ${m} 分钟`,
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
    pattern: /^Thought for (\d+)m (\d+)s$/i,
    replace: (_, m, s) => `已思考 ${m} 分 ${s} 秒`,
  },
  {
    pattern: /^Thought for (\d+)s$/i,
    replace: (_, s) => `已思考 ${s} 秒`,
  },
  {
    pattern: /^Thinking for (\d+)s$/i,
    replace: (_, s) => `思考中 ${s} 秒`,
  },

  // 3. 相对时间与更新时间戳（含侧边栏紧凑格式 now / 2m / 5h / 3d / 1w / 2mo / 1y）
  {
    pattern: /^now$/i,
    onlyIsolated: true,
    replace: () => '刚刚',
  },
  {
    pattern: /^(\d+)\s*(s|m|h|d|w|mo|yr|y)$/,
    onlyIsolated: true,
    replace: (_, n, unit) => {
      const unitMap = {
        s: '秒前',
        m: '分钟前',
        h: '小时前',
        d: '天前',
        w: '周前',
        mo: '个月前',
        yr: '年前',
        y: '年前',
      };
      return `${n}${unitMap[unit] || unit}`;
    },
  },
  {
    pattern: /^(?:Updated\s+)?(\d+)\s*(?:seconds?|secs?|s)\s+ago$/i,
    replace: (full, n) => (/^Updated/i.test(full) ? `更新于 ${n} 秒前` : `${n} 秒前`),
  },
  {
    pattern: /^(?:Updated\s+)?(\d+)\s*(?:minutes?|mins?|m)\s+ago$/i,
    replace: (full, n) => (/^Updated/i.test(full) ? `更新于 ${n} 分钟前` : `${n} 分钟前`),
  },
  {
    pattern: /^(?:Updated\s+)?(\d+)\s*(?:hours?|hrs?|h)\s+ago$/i,
    replace: (full, n) => (/^Updated/i.test(full) ? `更新于 ${n} 小时前` : `${n} 小时前`),
  },
  {
    pattern: /^(?:Updated\s+)?(\d+)\s*(?:days?|d)\s+ago$/i,
    replace: (full, n) => (/^Updated/i.test(full) ? `更新于 ${n} 天前` : `${n} 天前`),
  },

  // 4. 计数、文件变更、Git 与智能体状态
  {
    pattern: /^(\d+)\s+agents?\s+running$/i,
    replace: (_, n) => `${n} 个智能体运行中`,
  },
  {
    pattern: /^(\d+)\s+files?\s+changed$/i,
    replace: (_, n) => `已变更 ${n} 个文件`,
  },
  {
    pattern: /^(\d+)\s+commits?\s+ahead$/i,
    replace: (_, n) => `领先 ${n} 个提交`,
  },
  {
    pattern: /^(\d+)\s+commits?\s+behind$/i,
    replace: (_, n) => `落后 ${n} 个提交`,
  },
  {
    pattern: /^(\d+)\s+conversations?$/i,
    replace: (_, n) => `${n} 个对话`,
  },
  {
    pattern: /^(\d+)\s+projects?$/i,
    replace: (_, n) => `${n} 个项目`,
  },
  {
    pattern: /^(\d+)\s+tasks?$/i,
    replace: (_, n) => `${n} 个任务`,
  },
  {
    pattern: /^(\d+)\s+subagents?$/i,
    replace: (_, n) => `${n} 个子智能体`,
  },
  {
    pattern: /^(\d+)\s+skills?$/i,
    replace: (_, n) => `${n} 个技能`,
  },
  {
    pattern: /^(\d+)\s+rules?$/i,
    replace: (_, n) => `${n} 个规则`,
  },
  {
    pattern: /^(\d+)\s+plugins?$/i,
    replace: (_, n) => `${n} 个插件`,
  },
  {
    pattern: /^(\d+)\s+tools?$/i,
    replace: (_, n) => `${n} 个工具`,
  },
  {
    pattern: /^(\d+)\s+comments?$/i,
    replace: (_, n) => `${n} 条评论`,
  },
  {
    pattern: /^(\d+)\s+results?$/i,
    replace: (_, n) => `${n} 条结果`,
  },
  {
    pattern: /^(\d+)\s+items?$/i,
    replace: (_, n) => `${n} 项`,
  },
  {
    pattern: /^(\d+)\s+selected$/i,
    replace: (_, n) => `已选择 ${n} 项`,
  },
  {
    pattern: /^Page\s+(\d+)\s+of\s+(\d+)$/i,
    replace: (_, cur, total) => `第 ${cur} / ${total} 页`,
  },

  // 5. 版本、重试、额度重置与积分
  {
    pattern: /^Version\s+([\w.-]+)$/i,
    replace: (_, ver) => `版本 ${ver}`,
  },
  {
    pattern: /^Retry in (\d+)s$/i,
    replace: (_, s) => `${s} 秒后重试`,
  },
  {
    pattern: /^(?:Baseline\s+)?Quota\s+(?:resets|refreshes)\s+in\s+(\d+)h\s+(\d+)m$/i,
    replace: (_, h, m) => `额度将在 ${h} 小时 ${m} 分钟后重置`,
  },
  {
    pattern: /^(?:Baseline\s+)?Quota\s+(?:resets|refreshes)\s+in\s+(\d+)m$/i,
    replace: (_, m) => `额度将在 ${m} 分钟后重置`,
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
    pattern: /^(\d+(?:,\d{3})*)\s+credits?\s+remaining$/i,
    replace: (_, n) => `剩余 ${n} 积分`,
  },
  {
    pattern: /^(\d+)%\s+used$/i,
    replace: (_, pct) => `已使用 ${pct}%`,
  },
  {
    pattern: /^(\d+)%\s+remaining$/i,
    replace: (_, pct) => `剩余 ${pct}%`,
  },

  // 6. 自动化与定时调度描述
  {
    pattern: /^Every\s+(\d+)\s+minutes?$/i,
    replace: (_, n) => `每 ${n} 分钟`,
  },
  {
    pattern: /^Every\s+(\d+)\s+hours?$/i,
    replace: (_, n) => `每 ${n} 小时`,
  },
  {
    pattern: /^Every\s+day\s+at\s+([\d:]+\s*(?:AM|PM)?)$/i,
    replace: (_, t) => `每天 ${t}`,
  },
  {
    pattern: /^Every\s+(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+at\s+([\d:]+\s*(?:AM|PM)?)$/i,
    replace: (_, day, t) => `每${WEEKDAY_MAP[day.toLowerCase()] || day} ${t}`,
  },

  // 7. 配额窗口限制、模型下线提示与权限授权操作
  {
    pattern: /^(Weekly|5-hour|Five Hour|5h)\s+limit,\s*(resets|refreshes)\s+in\s+(.+?)\.?$/i,
    replace: (_, win, act, rest) => {
      const label = /^weekly$/i.test(win) ? '每周配额限制' : '5 小时配额限制';
      const verb = /^refreshes$/i.test(act) ? '刷新' : '重置';
      const dur = rest
        .replace(/(\d+)\s*d(?:ays?)?/gi, '$1 天')
        .replace(/(\d+)\s*h(?:ours?)?/gi, '$1 小时')
        .replace(/(\d+)\s*m(?:in(?:ute)?s?)?/gi, '$1 分钟')
        .replace(/(\d+)\s*s(?:ec(?:ond)?s?)?/gi, '$1 秒')
        .replace(/^<\s*1\s*分钟$/, '不足 1 分钟');
      return `${label}，${dur}后${verb}`;
    },
  },
  {
    pattern: /^(\d+(?:\.\d+)?)%\s+left$/i,
    replace: (_, pct) => `剩余 ${pct}%`,
  },
  {
    pattern: /^Your\s+Plan:\s*(.+)$/i,
    replace: (_, plan) => `当前订阅方案: ${plan}`,
  },
  {
    pattern: /^Leaving\s+on\s+(January|Jan|February|Feb|March|Mar|April|Apr|May|June|Jun|July|Jul|August|Aug|September|Sep|Sept|October|Oct|November|Nov|December|Dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,\s*(\d{4}))?\.?$/i,
    replace: (_, mon, day, yr) => {
      const mNum = MONTH_MAP[mon.toLowerCase()] || mon;
      return yr ? `将于 ${yr} 年 ${mNum} 月 ${day} 日下线` : `将于 ${mNum} 月 ${day} 日下线`;
    },
  },
  {
    pattern: /^Repo\s+default(?:\s*\((.+?)\))?$/i,
    replace: (_, br) => (br ? `仓库默认 (${br})` : '仓库默认'),
  },
  {
    pattern: /^Yes,\s*and\s+always\s+allow\s+'(.+?)'\s+in\s+this\s+(project|workspace|conversation)$/i,
    replace: (_, cmd, scope) => {
      const sMap = { project: '项目', workspace: '工作区', conversation: '对话' };
      return `是，且在此${sMap[scope.toLowerCase()] || scope}中始终允许运行 '${cmd}'`;
    },
  },
];

/**
 * 判断当前页面是否属于允许执行本地化的客户端上下文（排除外部互联网网页）。
 * @param {Location|undefined} [loc]
 * @returns {boolean}
 */
function isAllowedLocalizationOrigin(loc) {
  if (!loc) return true;
  const protocol = String(loc.protocol || '').toLowerCase();
  if (!protocol || protocol === 'plugin:' || protocol === 'file:' || protocol === 'about:') {
    return true;
  }
  if (protocol === 'http:' || protocol === 'https:') {
    const host = String(loc.hostname || '').toLowerCase();
    return (
      host === '127.0.0.1' ||
      host === 'localhost' ||
      host === '[::1]' ||
      host === '::1' ||
      host.endsWith('.localhost')
    );
  }
  return false;
}

/**
 * 规范化待匹配文本（统一弯引号、合并连续空白并去首尾空格）。
 * @param {string} text
 * @returns {string}
 */
function normalizeText(text) {
  return String(text)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 判断某个节点是否应该被跳过（位于代码、用户输入、文件树、终端或图标字体禁区内）。
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
 * 判断节点是否位于对话消息或 Markdown 正文容器中。
 * @param {Element|null} element
 * @returns {boolean}
 */
function isInProseOrMessageContainer(element) {
  if (!element || typeof element.closest !== 'function') {
    return false;
  }
  for (const selector of PROSE_CONTAINER_SELECTORS) {
    try {
      if (element.closest(selector)) {
        return true;
      }
    } catch {
      // 忽略选择器异常
    }
  }
  return false;
}

/**
 * 判断节点是否属于独立 UI 控件或独立界面标签（用于放行短词/单字翻译，同时保护正文段落）。
 * @param {Element|null} element
 * @returns {boolean}
 */
function isIsolatedUiControl(element) {
  if (!element || typeof element.closest !== 'function') {
    return false;
  }

  // 1. 位于聊天回复、Markdown 段落、列表项或引用块中时，一律禁止单字短词替换
  if (isInProseOrMessageContainer(element)) {
    return false;
  }

  // 2. 命中语义化控件（button / menuitem / tab / heading / label 等）
  for (const selector of ISOLATED_CONTROL_SELECTORS) {
    try {
      const host = element.closest(selector);
      if (host) {
        const textLen = (host.textContent || '').trim().length;
        if (textLen > 0 && textLen <= 48) {
          return true;
        }
      }
    } catch {
      // 忽略选择器异常
    }
  }

  // 3. 命中常见徽章/胶囊/可点击样式类名
  const cls = typeof element.className === 'string' ? element.className : '';
  if (cls && /(?:badge|pill|chip|tag|status|cursor-pointer)/i.test(cls)) {
    const textLen = (element.textContent || '').trim().length;
    if (textLen > 0 && textLen <= 36) {
      return true;
    }
  }

  // 4. React/Tailwind 独立叶节点标签（如 `<div>Models</div>`、`<span>Idle</span>`）
  const tag = element.tagName ? element.tagName.toUpperCase() : '';
  if (STANDALONE_LEAF_TAGS.has(tag)) {
    const childCount = element.childNodes ? element.childNodes.length : 99;
    const textLen = (element.textContent || '').trim().length;
    if (childCount <= 2 && textLen > 0 && textLen <= 32) {
      return true;
    }
  }

  return false;
}

/**
 * 在长文本中按英文词边界安全替换长度 >= 24 的完整字典长句。
 * @param {string} value
 * @param {string} key
 * @param {string} translated
 * @returns {string|null}
 */
function replaceBoundedLongEntry(value, key, translated) {
  if (!value || !key || !value.includes(key)) return null;
  const asciiWord = /[A-Za-z0-9_]/;
  const checkLeft = asciiWord.test(key[0]);
  const checkRight = asciiWord.test(key[key.length - 1]);

  let from = 0;
  let out = '';
  let changed = false;

  while (from < value.length) {
    const idx = value.indexOf(key, from);
    if (idx === -1) {
      out += value.slice(from);
      break;
    }
    const end = idx + key.length;
    const leftOk = !checkLeft || idx === 0 || !asciiWord.test(value[idx - 1]);
    const rightOk = !checkRight || end === value.length || !asciiWord.test(value[end]);
    if (leftOk && rightOk) {
      out += value.slice(from, idx) + translated;
      from = end;
      changed = true;
    } else {
      out += value.slice(from, idx + 1);
      from = idx + 1;
    }
  }

  return changed ? out : null;
}

/**
 * 创建一个纯粹的翻译器实例（支持精确匹配、大小写回退、独立控件守卫、动态模板与长句局部匹配）。
 * @param {{ entries: Record<string, string>, isolatedKeys?: string[] }} dictPayload
 */
function createTranslator(dictPayload) {
  const exactMap = new Map();
  const lowerMap = new Map();
  const isolatedSet = new Set((dictPayload.isolatedKeys || []).map(normalizeText));
  const longEntries = [];

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
    if (key.length >= 24) {
      longEntries.push([key, val]);
    }
  }

  // 最长优先匹配，防止子句提前截断超集长句
  longEntries.sort((a, b) => b[0].length - a[0].length);

  /**
   * 尝试翻译单段文本；未命中或被守卫拦截时返回 null。
   * @param {string} rawText
   * @param {{ isIsolated?: boolean, inProse?: boolean }} [ctx]
   * @returns {string|null}
   */
  function translateText(rawText, ctx = {}) {
    if (typeof rawText !== 'string') return null;
    const normalized = normalizeText(rawText);
    if (!normalized || normalized.length > 1200) return null;
    if (/^[\d\s.,:%/+-]+$/.test(normalized)) return null;
    if (/^(https?:\/\/|file:\/\/|[a-zA-Z]:\\|\/[\w.-]+)/.test(normalized)) return null;

    // 1. 精确命中
    if (exactMap.has(normalized)) {
      if (isolatedSet.has(normalized) && !ctx.isIsolated) {
        return null;
      }
      return preserveOuterWhitespace(rawText, exactMap.get(normalized));
    }

    // 2. 大小写不敏感回退
    const lowerHit = lowerMap.get(normalized.toLowerCase());
    if (lowerHit) {
      if (isolatedSet.has(lowerHit.key) && !ctx.isIsolated) {
        return null;
      }
      return preserveOuterWhitespace(rawText, lowerHit.val);
    }

    // 3. 动态正则模板（不在散文段落内触发，防止误改聊天内容）
    if (!ctx.inProse) {
      for (const rule of DYNAMIC_RULES) {
        if (rule.onlyIsolated && !ctx.isIsolated) continue;
        const match = normalized.match(rule.pattern);
        if (match) {
          const replaced = rule.replace(...match);
          if (typeof replaced === 'string' && replaced) {
            return preserveOuterWhitespace(rawText, replaced);
          }
        }
      }
    }

    // 4. 长句词边界局部替换（仅限非散文 UI 文本，且文本长度 >= 24）
    if (!ctx.inProse && normalized.length >= 24 && longEntries.length > 0) {
      let current = normalized;
      let anyChanged = false;
      for (const [longKey, longVal] of longEntries) {
        if (longKey.length > current.length) continue;
        const next = replaceBoundedLongEntry(current, longKey, longVal);
        if (next !== null) {
          current = next;
          anyChanged = true;
        }
      }
      if (anyChanged) {
        return preserveOuterWhitespace(rawText, current);
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
  if (!isAllowedLocalizationOrigin(window.location)) {
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
  const observedDocs = new WeakSet();
  const trackedNodes = new Set();
  const TRANSLATABLE_ATTRS = ['placeholder', 'data-placeholder', 'title', 'aria-label'];

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

    const inProse = isInProseOrMessageContainer(parent);
    const isIsolated = !inProse && isIsolatedUiControl(parent);
    const translated = translator.translateText(current, { isIsolated, inProse });
    if (translated && translated !== current) {
      if (!originalTextMap.has(node)) {
        originalTextMap.set(node, current);
      }
      node.nodeValue = translated;
      trackedNodes.add(node);
    }
  }

  /**
   * 处理 React JSX 插值产生的纯多文本叶节点（如 `<h1>Hey {name}, what should we build today?</h1>`
   * 在 DOM 中会生成 3 个相邻的 TextNode 子节点，逐个检查无法命中整体模板）。
   * 仅当所有子节点均为纯文本节点（无任何子元素）时才合并匹配，绝不破坏子标签或图标。
   */
  function processMultiTextElement(el) {
    if (!el || el.nodeType !== 1) return false;
    if (shouldSkipElement(el) || isInProseOrMessageContainer(el)) return false;
    const children = el.childNodes;
    if (!children || children.length < 2 || children.length > 8) return false;

    let fullText = '';
    for (let i = 0; i < children.length; i += 1) {
      if (children[i].nodeType !== 3) return false;
      fullText += children[i].nodeValue || '';
    }
    if (!fullText.trim()) return false;

    const isIsolated = isIsolatedUiControl(el);
    const translated = translator.translateText(fullText, { isIsolated, inProse: false });
    if (!translated || translated === fullText) return false;

    for (let i = 0; i < children.length; i += 1) {
      const child = children[i];
      if (!originalTextMap.has(child)) {
        originalTextMap.set(child, child.nodeValue || '');
      }
      child.nodeValue = i === 0 ? translated : '';
      trackedNodes.add(child);
    }
    return true;
  }

  function processElementAttrs(el) {
    if (!el || el.nodeType !== 1) return;
    const tag = el.tagName ? el.tagName.toUpperCase() : '';
    const isInputPlaceholderHost =
      tag === 'TEXTAREA' || tag === 'INPUT' || el.getAttribute('contenteditable') === 'true';
    if (!isInputPlaceholderHost && shouldSkipElement(el)) return;
    let attrOriginals = originalAttrMap.get(el);
    for (const attr of TRANSLATABLE_ATTRS) {
      const val = el.getAttribute(attr);
      if (!val || !val.trim()) continue;
      const translated = translator.translateText(val, { isIsolated: true, inProse: false });
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

  function tryAttachIframe(iframeEl) {
    if (!iframeEl || iframeEl.tagName !== 'IFRAME') return;
    const mountFrame = () => {
      try {
        const subDoc = iframeEl.contentDocument;
        const subWin = iframeEl.contentWindow;
        if (!subDoc || !subWin || !isAllowedLocalizationOrigin(subWin.location)) return;
        observeDocument(subDoc);
      } catch {
        // 跨域 iframe 静默忽略
      }
    };
    mountFrame();
    iframeEl.addEventListener('load', mountFrame);
  }

  function translateSubtree(root) {
    if (!enabled || !root) return;
    if (root.nodeType === 3) {
      processTextNode(root);
      return;
    }
    if (root.nodeType !== 1 && root.nodeType !== 9) return;
    if (root.nodeType === 1) {
      processElementAttrs(root);
      if (root.tagName === 'IFRAME') {
        tryAttachIframe(root);
        return;
      }
      if (shouldSkipElement(root)) return;
      if (processMultiTextElement(root)) return;
    }

    const doc = root.nodeType === 9 ? root : root.ownerDocument || document;
    const walker = doc.createTreeWalker(root, 1 | 4);
    let cur = walker.nextNode();
    while (cur) {
      if (cur.nodeType === 1) {
        processElementAttrs(cur);
        if (cur.tagName === 'IFRAME') {
          tryAttachIframe(cur);
        } else {
          processMultiTextElement(cur);
        }
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

  const pendingRoots = new Set();
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
    // 若单个拆碎的 TextNode 发生变更，将其父元素一并加入待处理队列以支持 React 多文本插值重算
    if (node.nodeType === 3 && node.parentElement) {
      pendingRoots.add(node.parentElement);
    } else {
      pendingRoots.add(node);
    }
    if (!rafScheduled) {
      rafScheduled = true;
      const schedule =
        typeof window.requestAnimationFrame === 'function'
          ? window.requestAnimationFrame
          : (cb) => setTimeout(cb, 16);
      schedule(flushPending);
    }
  }

  function observeDocument(doc) {
    if (!doc || observedDocs.has(doc)) return;
    const target = doc.body || doc.documentElement;
    if (!target) return;
    observedDocs.add(doc);
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
  }

  const startObserver = () => {
    observeDocument(document);
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
    version: '1.2.0',
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
  PROSE_CONTAINER_SELECTORS,
  ISOLATED_CONTROL_SELECTORS,
  DYNAMIC_RULES,
  isAllowedLocalizationOrigin,
  normalizeText,
  shouldSkipElement,
  isInProseOrMessageContainer,
  isIsolatedUiControl,
  replaceBoundedLongEntry,
  createTranslator,
  mountDomLocalization,
};
