'use strict';

/**
 * Electron 主进程原生菜单、系统托盘、右键上下文菜单与自动更新状态补丁模块。
 *
 * 设计原则：
 * 1. 所有补丁每次均基于未经修改的原版备份 `app.asar.zh-cn.bak` 重新生成，天然幂等。
 * 2. 每个补丁结果都会经过 `new vm.Script()` 语法预检；若官方未来版本改动了某处结构导致未命中或语法不兼容，
 *    自动跳过该可选补丁并保留原文件，绝不导致客户端启动报错。
 */

const vm = require('vm');

const MAIN_PATCH_MARKER = '/* === ANTIGRAVITY-ZH-CN-MAIN-PATCH === */';

/**
 * 原生顶栏菜单、系统托盘与右键上下文菜单专用词典。
 */
const NATIVE_MENU_DICT = {
  // 顶栏与窗口菜单
  File: '文件',
  Edit: '编辑',
  Selection: '选择',
  Workspace: '工作区',
  View: '视图',
  Window: '窗口',
  Help: '帮助',
  'New Window': '新建窗口',
  'New Conversation': '新建对话',
  'Open Folder...': '打开文件夹...',
  'Open Workspace...': '打开工作区...',
  'Create Project': '创建项目',
  'Command Palette': '命令面板',
  'Command Palette...': '命令面板...',
  Settings: '设置',
  'Settings...': '设置...',
  Preferences: '偏好设置',
  Docs: '官方文档',
  Documentation: '官方文档',
  'Release Notes': '更新日志',
  'Report Issue': '反馈问题',
  'Check for Updates': '检查更新',
  'Check for Updates...': '检查更新...',
  'Checking for Updates...': '正在检查更新...',
  'Downloading Update...': '正在下载更新...',
  'Restart to Update': '重启以更新',
  'Toggle Developer Tools': '切换开发者工具',
  Reload: '重新加载',
  'Force Reload': '强制重新加载',
  Undo: '撤销',
  Redo: '重做',
  Cut: '剪切',
  Copy: '复制',
  Paste: '粘贴',
  Delete: '删除',
  'Select All': '全选',
  Minimize: '最小化',
  Maximize: '最大化',
  Zoom: '缩放',
  'Actual Size': '实际大小',
  'Reset Zoom': '重置缩放',
  'Zoom In': '放大',
  'Zoom Out': '缩小',
  'Toggle Full Screen': '切换全屏',
  Close: '关闭',
  'Close Window': '关闭窗口',
  'Bring All to Front': '前置全部窗口',
  'About Antigravity': '关于 Antigravity',
  Services: '服务',
  'Hide Antigravity': '隐藏 Antigravity',
  'Hide Others': '隐藏其他',
  'Show All': '显示全部',
  'Quit Antigravity': '退出 Antigravity',
  Quit: '退出',
  'Connect to WSL': '连接至 WSL',
  'Reopen Locally': '在本地重新打开',

  // 托盘菜单
  'No agents running': '无运行中的智能体',
  'Open Antigravity': '打开 Antigravity',

  // 右键上下文菜单（编辑器、标签页、会话消息、内置浏览器）
  'Add to Chat': '添加到对话',
  'Add to Chat/Quote': '添加到对话/引用',
  Quote: '引用',
  Comment: '评论',
  'Copy Message': '复制消息',
  'Edit Message': '编辑消息',
  'Fork Conversation': '分叉对话',
  'Undo to Here': '撤销至此处',
  'Copy Code': '复制代码',
  'Copy Link': '复制链接',
  'Copy Link Address': '复制链接地址',
  'Copy Image': '复制图片',
  'Copy Image Address': '复制图片地址',
  'Save Image': '保存图片',
  'Save Image As...': '图片另存为...',
  'Copy Video': '复制视频',
  'Save Video': '保存视频',
  'Inspect Element': '检查元素',
  Back: '后退',
  Forward: '前进',
  'Close Tab': '关闭标签页',
  'Close Other Tabs': '关闭其他标签页',
  'Close Tabs to the Left': '关闭左侧标签页',
  'Close Tabs to the Right': '关闭右侧标签页',
  'Close Saved': '关闭已保存标签页',
  'Close All': '全部关闭',
  'Reopen Closed Tab': '重新打开已关闭的标签页',
  'Pin Tab': '固定标签页',
  'Unpin Tab': '取消固定标签页',
  'Keep Open': '保持打开',
  'Open in External Browser': '在外部浏览器中打开',
  'Open in Built-in Browser': '在内置浏览器中打开',
  'Open in Browser': '在浏览器中打开',
  'Open in': '打开方式',
  'Open In': '打开方式',
  'Built-in Browser (Default)': '内置浏览器 (默认)',
  'External Browser': '外部浏览器',
  'Reveal in Explorer': '在资源管理器中显示',
  'Reveal in Finder': '在访达中显示',
  'Copy Path': '复制路径',
  'Copy Relative Path': '复制相对路径',
  'Move Conversation Up': '向上移动对话',
  'Move Conversation Down': '向下移动对话',
  'Rename Conversation': '重命名对话',
  'Archive Conversation': '归档对话',
  'Delete Conversation': '删除对话',
  'Pin Conversation': '置顶对话',
  'Unpin Conversation': '取消置顶',
  'Background Commands': '后台命令',
  'Background Tasks': '后台任务',
};

/**
 * 校验生成的 JS 源码语法是否合法。
 * @param {string} code
 * @param {string} label
 * @returns {boolean}
 */
function isValidJsSyntax(code, label) {
  try {
    new vm.Script(code, { filename: label });
    return true;
  } catch {
    return false;
  }
}

/**
 * 为 `dist/menu.js` 注入原生应用顶栏及下拉菜单翻译。
 * @param {string} source
 * @returns {string|null}
 */
function patchMenuJs(source) {
  if (!source || source.includes(MAIN_PATCH_MARKER)) return null;
  const anchor = 'electron_1.Menu.setApplicationMenu(menu);';
  const idx = source.indexOf(anchor);
  if (idx === -1) return null;

  const dictJson = JSON.stringify(NATIVE_MENU_DICT);
  const snippet = [
    MAIN_PATCH_MARKER,
    '(function (__agMenu) {',
    '  try {',
    `    const __agMap = ${dictJson};`,
    '    function __agTranslateItems(items) {',
    '      if (!Array.isArray(items)) return;',
    '      for (const item of items) {',
    '        if (!item) continue;',
    '        const raw = typeof item.label === "string" ? item.label : "";',
    '        if (raw) {',
    '          let mnemonic = "";',
    '          let clean = raw;',
    '          const m = raw.match(/&([A-Za-z])/);',
    '          if (m) {',
    '            mnemonic = "(&" + m[1].toUpperCase() + ")";',
    '            clean = raw.replace("&", "");',
    '          }',
    '          if (__agMap[clean]) {',
    '            item.label = __agMap[clean] + mnemonic;',
    '          } else if (__agMap[raw]) {',
    '            item.label = __agMap[raw];',
    '          } else if (/^Version\\s+([\\w.-]+)$/i.test(clean)) {',
    '            item.label = clean.replace(/^Version\\s+([\\w.-]+)$/i, "版本 $1");',
    '          }',
    '        }',
    '        if (item.submenu && Array.isArray(item.submenu.items)) {',
    '          __agTranslateItems(item.submenu.items);',
    '        }',
    '      }',
    '    }',
    '    if (__agMenu && Array.isArray(__agMenu.items)) {',
    '      __agTranslateItems(__agMenu.items);',
    '    }',
    '  } catch (_) {}',
    '})(menu);',
  ].join('\n');

  let patched = `${source.slice(0, idx)}${snippet}\n    ${source.slice(idx)}`;
  patched = patched
    .replace(/label:\s*'Connect to WSL'/g, "label: '连接至 WSL'")
    .replace(/label:\s*'Reopen Locally'/g, "label: '在本地重新打开'");

  return isValidJsSyntax(patched, 'dist/menu.js') ? patched : null;
}

/**
 * 为 `dist/tray.js` 注入系统托盘右键菜单与运行中智能体计数翻译。
 * @param {string} source
 * @returns {string|null}
 */
function patchTrayJs(source) {
  if (!source || source.includes(MAIN_PATCH_MARKER)) return null;
  const createMatch = source.match(/function\s+createTray\s*\(\s*actions(?:\s*,\s*onClick)?\s*\)\s*\{/);
  if (!createMatch) return null;

  const dictJson = JSON.stringify(NATIVE_MENU_DICT);
  let patched = source.replace(
    createMatch[0],
    [
      createMatch[0],
      `    ${MAIN_PATCH_MARKER}`,
      `    try { const __agTrayMap = ${dictJson}; if (Array.isArray(actions)) { for (const it of actions) { if (it && __agTrayMap[it.label]) it.label = __agTrayMap[it.label]; } } } catch (_) {}`,
    ].join('\n')
  );

  patched = patched.replace(
    'function insertTrayMenuItem(position, options) {',
    [
      'function insertTrayMenuItem(position, options) {',
      `    try { const __agTrayAsync = ${dictJson}; if (options && __agTrayAsync[options.label]) options.label = __agTrayAsync[options.label]; } catch (_) {}`,
    ].join('\n')
  );

  patched = patched.replace(
    /countItem\.label\s*=\s*\([\s\S]*?' running';/g,
    "countItem.label = count > 0 ? `${count} 个智能体运行中` : '无运行中的智能体';"
  );

  return isValidJsSyntax(patched, 'dist/tray.js') ? patched : null;
}

/**
 * 为 `dist/ipcHandlers.js` 注入原生右键上下文菜单翻译。
 * @param {string} source
 * @returns {string|null}
 */
function patchIpcHandlersJs(source) {
  if (!source || source.includes(MAIN_PATCH_MARKER)) return null;
  const fnMatch = source.match(/function\s+buildContextMenuTemplate\s*\(\s*items\s*,\s*onSelect\s*\)\s*\{/);
  if (!fnMatch) return null;

  const dictJson = JSON.stringify(NATIVE_MENU_DICT);
  const hook = [
    fnMatch[0],
    `    ${MAIN_PATCH_MARKER}`,
    '    try {',
    `      const __agCtxMap = ${dictJson};`,
    '      function __agMapCtx(list) {',
    '        if (!Array.isArray(list)) return list;',
    '        return list.map((it) => {',
    '          if (!it || typeof it !== "object") return it;',
    '          const id = String(it.id || "");',
    '          if (/^group-(?!new$|remove$)/i.test(id)) return it;',
    '          const raw = typeof it.label === "string" ? it.label.trim() : "";',
    '          let next = raw && __agCtxMap[raw] ? Object.assign({}, it, { label: __agCtxMap[raw] }) : it;',
    '          if (Array.isArray(next.submenu)) next = Object.assign({}, next, { submenu: __agMapCtx(next.submenu) });',
    '          if (Array.isArray(next.items)) next = Object.assign({}, next, { items: __agMapCtx(next.items) });',
    '          return next;',
    '        });',
    '      }',
    '      if (Array.isArray(items)) items = __agMapCtx(items);',
    '    } catch (_) {}',
  ].join('\n');

  const patched = source.replace(fnMatch[0], hook);
  return isValidJsSyntax(patched, 'dist/ipcHandlers.js') ? patched : null;
}

/**
 * 为 `dist/updater.js` 注入检查更新菜单项与“已是最新”原生弹窗翻译。
 * @param {string} source
 * @returns {string|null}
 */
function patchUpdaterJs(source) {
  if (!source || source.includes(MAIN_PATCH_MARKER)) return null;
  if (!source.includes('MenuUpdateStep')) return null;

  const patched = [
    MAIN_PATCH_MARKER,
    source
      .replace(
        "title: 'Check for Updates',\n                message: 'No updates available',\n                buttons: ['OK'],",
        "title: '检查更新',\n                message: '暂无可用更新',\n                buttons: ['确定'],"
      )
      .replace('MenuUpdateStep["CheckForUpdates"] = "Check for Updates";', 'MenuUpdateStep["CheckForUpdates"] = "检查更新";')
      .replace('MenuUpdateStep["CheckingForUpdates"] = "Checking for Updates...";', 'MenuUpdateStep["CheckingForUpdates"] = "正在检查更新...";')
      .replace('MenuUpdateStep["DownloadingUpdate"] = "Downloading Update...";', 'MenuUpdateStep["DownloadingUpdate"] = "正在下载更新...";')
      .replace('MenuUpdateStep["RestartToUpdate"] = "Restart to Update";', 'MenuUpdateStep["RestartToUpdate"] = "重启以更新";'),
  ].join('\n');

  return isValidJsSyntax(patched, 'dist/updater.js') ? patched : null;
}

/**
 * 扫描并生成所有可用的可选主进程文件补丁。
 * @param {(relPath: string) => Buffer|null} readOptionalFile
 * @returns {{ overrides: Record<string, Buffer>, patchedFiles: string[] }}
 */
function buildMainProcessPatches(readOptionalFile) {
  const targets = [
    { path: 'dist/menu.js', fn: patchMenuJs },
    { path: 'dist/tray.js', fn: patchTrayJs },
    { path: 'dist/ipcHandlers.js', fn: patchIpcHandlersJs },
    { path: 'dist/updater.js', fn: patchUpdaterJs },
  ];

  const overrides = {};
  const patchedFiles = [];

  for (const target of targets) {
    const buf = readOptionalFile(target.path);
    if (!buf) continue;
    const patched = target.fn(buf.toString('utf8'));
    if (patched) {
      overrides[target.path] = Buffer.from(patched, 'utf8');
      patchedFiles.push(target.path);
    }
  }

  return { overrides, patchedFiles };
}

module.exports = {
  MAIN_PATCH_MARKER,
  NATIVE_MENU_DICT,
  patchMenuJs,
  patchTrayJs,
  patchIpcHandlersJs,
  patchUpdaterJs,
  buildMainProcessPatches,
};
