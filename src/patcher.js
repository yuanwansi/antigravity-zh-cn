'use strict';

/**
 * Antigravity 桌面端核心汉化补丁器（安装、重复升级、状态检测与无损还原）。
 *
 * 安全设计：
 * 1. 首次安装前对原始 `app.asar` 计算 SHA-256 并创建 `.zh-cn.bak` 备份和 `.zh-cn.meta.json` 清单。
 * 2. 重复安装/升级词典时始终以未修改的原版备份为基底重新打包，绝不叠加多重补丁。
 * 3. 先写入 `.zh-cn.tmp` 并回读验证 ASAR 结构无误，再通过原子替换（含 `.zh-cn.swap-old` 崩溃自愈）生效。
 * 4. 还原时校验备份 SHA-256 后字节级恢复原版 `app.asar`。
 */

const fs = require('fs');
const path = require('path');
const pkg = require('../package.json');
const {
  listAsarEntries,
  readAsarFile,
  patchAsar,
  sha256File,
} = require('./asar');
const {
  getSidecarPaths,
  tryRecoverSwappedAsar,
  resolveAsarPath,
  getUserCustomDictPath,
  isProtectedEnvironment,
} = require('./paths');
const { loadDictionaries } = require('./dict-loader');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_DICT_DIR = path.join(PROJECT_ROOT, 'dicts');
const RUNTIME_SOURCE_PATH = path.join(PROJECT_ROOT, 'src', 'runtime.js');

const MARKER_START = '/* === ANTIGRAVITY-ZH-CN-PATCH-START === */';
const MARKER_END = '/* === ANTIGRAVITY-ZH-CN-PATCH-END === */';

const PRELOAD_CANDIDATES = [
  'dist/preload.js',
  'dist/preload/index.js',
  'out/preload/index.js',
  'out/preload.js',
  'preload.js',
];

/**
 * 在 ASAR 中探测 preload 脚本路径。
 * @param {string} asarPath
 * @returns {string}
 */
function detectPreloadEntry(asarPath) {
  const entries = listAsarEntries(asarPath);
  const packedPaths = new Set(entries.filter((e) => !e.unpacked).map((e) => e.path));

  for (const candidate of PRELOAD_CANDIDATES) {
    if (packedPaths.has(candidate)) {
      return candidate;
    }
  }

  // 兜底：匹配任意以 preload.js 结尾的打包脚本
  const fallback = entries.find((e) => !e.unpacked && /(^|\/)preload(\/index)?\.js$/i.test(e.path));
  if (fallback) {
    return fallback.path;
  }

  throw new Error('未在 app.asar 中检测到可注入的 preload 脚本（预期 dist/preload.js）');
}

/**
 * 构造完全自包含的内联 IIFE 注入代码（零相对 require，兼容 Electron sandbox: true 与非沙盒 preload）。
 * @param {string} runtimeSource
 * @param {object} compiledDict
 * @returns {string}
 */
function buildInjectionBundle(runtimeSource, compiledDict) {
  const dictJson = JSON.stringify(compiledDict);
  return [
    '',
    MARKER_START,
    ';(function () {',
    '  try {',
    '    var __agModule = { exports: {} };',
    '    (function (module, exports) {',
    runtimeSource,
    '    })(__agModule, __agModule.exports);',
    `    var __agDict = ${dictJson};`,
    '    if (__agModule.exports && typeof __agModule.exports.mountDomLocalization === "function") {',
    '      __agModule.exports.mountDomLocalization(__agDict);',
    '    }',
    '  } catch (__agZhCnErr) {',
    '    if (typeof console !== "undefined" && console.warn) {',
    '      console.warn("[antigravity-zh-cn] 汉化运行时启动失败:", __agZhCnErr);',
    '    }',
    '  }',
    '})();',
    MARKER_END,
    '',
  ].join('\n');
}

/**
 * 移除 preload 中已有的注入片段（幂等）。
 * @param {string} content
 * @returns {string}
 */
function stripExistingInjection(content) {
  const startIdx = content.indexOf(MARKER_START);
  const endIdx = content.indexOf(MARKER_END);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    return content;
  }
  const before = content.slice(0, startIdx).replace(/\r?\n$/, '');
  const after = content.slice(endIdx + MARKER_END.length).replace(/^\r?\n/, '');
  return after ? `${before}\n${after}` : before;
}

/**
 * 判断 preload 文本是否已被本工具注入。
 * @param {string} content
 * @returns {boolean}
 */
function hasInjectionMarker(content) {
  return content.includes(MARKER_START) && content.includes(MARKER_END);
}

/**
 * 原子替换 `targetPath`：先备份当前文件到 `swapOldPath`，再移入 `newFilePath`，最后清理旧暂存。
 * @param {string} targetPath
 * @param {string} newFilePath
 * @param {string} swapOldPath
 */
function atomicSwapFile(targetPath, newFilePath, swapOldPath) {
  if (fs.existsSync(swapOldPath)) {
    fs.rmSync(swapOldPath, { force: true });
  }
  fs.renameSync(targetPath, swapOldPath);
  try {
    fs.renameSync(newFilePath, targetPath);
  } catch (err) {
    // 发生异常时立即回滚原文件
    if (!fs.existsSync(targetPath) && fs.existsSync(swapOldPath)) {
      fs.renameSync(swapOldPath, targetPath);
    }
    throw err;
  }
  fs.rmSync(swapOldPath, { force: true });
}

/**
 * 查询目标 `app.asar` 的当前汉化与备份状态。
 * @param {{ target?: string }} [options]
 */
function getPatchStatus(options = {}) {
  const asarPath = resolveAsarPath(options.target);
  if (!asarPath) {
    return {
      found: false,
      asarPath: null,
      patched: false,
      hasBackup: false,
      meta: null,
    };
  }

  const sidecars = getSidecarPaths(asarPath);
  let patched = false;
  let preloadEntry = null;
  try {
    preloadEntry = detectPreloadEntry(asarPath);
    const preloadText = readAsarFile(asarPath, preloadEntry).toString('utf8');
    patched = hasInjectionMarker(preloadText);
  } catch {
    patched = false;
  }

  let meta = null;
  if (fs.existsSync(sidecars.metaPath)) {
    try {
      meta = JSON.parse(fs.readFileSync(sidecars.metaPath, 'utf8'));
    } catch {
      meta = null;
    }
  }

  return {
    found: true,
    asarPath,
    preloadEntry,
    patched,
    hasBackup: fs.existsSync(sidecars.backupPath),
    backupPath: sidecars.backupPath,
    meta,
  };
}

/**
 * 安装或升级中文汉化补丁。
 * @param {{
 *   target?: string,
 *   dictDir?: string,
 *   userDictPath?: string,
 *   allowInProtectedEnv?: boolean,
 * }} [options]
 */
function installPatch(options = {}) {
  if (isProtectedEnvironment() && !options.allowInProtectedEnv) {
    throw new Error(
      '安全拦截：检测到当前处于 Antigravity 智能体会话或受保护环境中。为防止破坏正在运行的宿主客户端，请在外部终端中运行，或在单元测试中显式传入 allowInProtectedEnv: true。'
    );
  }

  const asarPath = resolveAsarPath(options.target);
  if (!asarPath) {
    throw new Error(
      options.target
        ? `未在指定路径找到 app.asar: ${options.target}`
        : '未自动探测到 Antigravity 客户端的 app.asar，请使用 --target <路径> 手动指定。'
    );
  }

  tryRecoverSwappedAsar(asarPath);
  const sidecars = getSidecarPaths(asarPath);

  // 1. 加载并严格校验词典
  const dictDir = options.dictDir || DEFAULT_DICT_DIR;
  const userDictPath = options.userDictPath !== undefined ? options.userDictPath : getUserCustomDictPath();
  const dictResult = loadDictionaries(dictDir, { userDictPath, strict: true });

  // 2. 确定原版基底（首次安装则先备份；若客户端已升级覆盖为新原版，也自动刷新备份）
  const currentPreloadEntry = detectPreloadEntry(asarPath);
  const currentPreloadContent = readAsarFile(asarPath, currentPreloadEntry).toString('utf8');
  const alreadyPatched = hasInjectionMarker(currentPreloadContent);

  let baseAsarPath = asarPath;
  let originalSha256;

  if (!alreadyPatched) {
    // 当前 app.asar 为未汉化原版（首次安装或客户端官方更新后）
    originalSha256 = sha256File(asarPath);
    fs.copyFileSync(asarPath, sidecars.backupPath);
    baseAsarPath = sidecars.backupPath;
  } else {
    // 已汉化状态：必须基于完好的原版备份重新打补丁，避免叠加污染
    if (!fs.existsSync(sidecars.backupPath)) {
      throw new Error(
        `检测到 ${asarPath} 已打补丁，但原版备份 ${sidecars.backupPath} 缺失。为保障安全，请先重装或恢复原版客户端。`
      );
    }
    if (fs.existsSync(sidecars.metaPath)) {
      const prevMeta = JSON.parse(fs.readFileSync(sidecars.metaPath, 'utf8'));
      const actualBackupSha = sha256File(sidecars.backupPath);
      if (prevMeta.originalSha256 && actualBackupSha !== prevMeta.originalSha256) {
        throw new Error('原版备份 SHA-256 校验不匹配，已中止安装以保护客户端文件！');
      }
      originalSha256 = actualBackupSha;
    } else {
      originalSha256 = sha256File(sidecars.backupPath);
    }
    baseAsarPath = sidecars.backupPath;
  }

  // 3. 构造完全自包含的内联 IIFE 注入包（不依赖外部相对 require，兼容 Electron sandbox: true）
  const preloadEntry = detectPreloadEntry(baseAsarPath);
  const cleanPreload = stripExistingInjection(readAsarFile(baseAsarPath, preloadEntry).toString('utf8'));
  const runtimeSource = fs.readFileSync(RUNTIME_SOURCE_PATH, 'utf8');
  const compiledDict = {
    version: pkg.version,
    generatedAt: new Date().toISOString(),
    entries: dictResult.entries,
    isolatedKeys: dictResult.isolatedKeys,
  };
  const patchedPreload = cleanPreload + buildInjectionBundle(runtimeSource, compiledDict);

  // 4. 增量重打包到临时文件并回读校验
  try {
    patchAsar(baseAsarPath, sidecars.tmpPath, {
      overrides: {
        [preloadEntry]: Buffer.from(patchedPreload, 'utf8'),
      },
    });

    // 校验新 ASAR 可正常读取且包含预期注入标记
    const verifyPreload = readAsarFile(sidecars.tmpPath, preloadEntry).toString('utf8');
    if (!hasInjectionMarker(verifyPreload)) {
      throw new Error('重打包校验失败：未在新 ASAR 的 preload 中发现注入标记');
    }

    // 5. 原子替换生效
    atomicSwapFile(asarPath, sidecars.tmpPath, sidecars.swapOldPath);
  } catch (err) {
    if (fs.existsSync(sidecars.tmpPath)) {
      fs.rmSync(sidecars.tmpPath, { force: true });
    }
    throw err;
  }

  // 6. 写入校验清单
  const meta = {
    toolVersion: pkg.version,
    installedAt: new Date().toISOString(),
    preloadEntry,
    dictEntriesCount: dictResult.stats.total,
    originalSha256,
    patchedSha256: sha256File(asarPath),
  };
  fs.writeFileSync(sidecars.metaPath, JSON.stringify(meta, null, 2), 'utf8');

  return {
    asarPath,
    backupPath: sidecars.backupPath,
    reinstalled: alreadyPatched,
    dictStats: dictResult.stats,
    meta,
  };
}

/**
 * 校验备份并字节级无损还原官方原版 `app.asar`。
 * @param {{ target?: string, allowInProtectedEnv?: boolean }} [options]
 */
function restorePatch(options = {}) {
  if (isProtectedEnvironment() && !options.allowInProtectedEnv) {
    throw new Error(
      '安全拦截：检测到当前处于 Antigravity 智能体会话或受保护环境中。请在外部终端运行还原脚本，或在测试中显式传入 allowInProtectedEnv: true。'
    );
  }

  const asarPath = resolveAsarPath(options.target);
  if (!asarPath) {
    throw new Error(
      options.target
        ? `未在指定路径找到 app.asar: ${options.target}`
        : '未自动探测到 Antigravity 客户端的 app.asar，请使用 --target <路径> 手动指定。'
    );
  }

  tryRecoverSwappedAsar(asarPath);
  const sidecars = getSidecarPaths(asarPath);

  if (!fs.existsSync(sidecars.backupPath)) {
    throw new Error(`未找到原版备份文件: ${sidecars.backupPath}（可能尚未安装汉化或备份已被清理）`);
  }

  const backupSha = sha256File(sidecars.backupPath);
  if (fs.existsSync(sidecars.metaPath)) {
    const meta = JSON.parse(fs.readFileSync(sidecars.metaPath, 'utf8'));
    if (meta.originalSha256 && backupSha !== meta.originalSha256) {
      throw new Error('原版备份文件 SHA-256 校验失败，已中止还原以防止写入损坏文件！');
    }
  }

  // 先复制到临时文件再原子替换，确保断电也不丢失备份
  fs.copyFileSync(sidecars.backupPath, sidecars.tmpPath);
  try {
    atomicSwapFile(asarPath, sidecars.tmpPath, sidecars.swapOldPath);
  } catch (err) {
    if (fs.existsSync(sidecars.tmpPath)) {
      fs.rmSync(sidecars.tmpPath, { force: true });
    }
    throw err;
  }

  const restoredSha = sha256File(asarPath);
  if (restoredSha !== backupSha) {
    throw new Error('还原后 SHA-256 校验不一致！');
  }

  fs.rmSync(sidecars.backupPath, { force: true });
  fs.rmSync(sidecars.metaPath, { force: true });

  return {
    asarPath,
    restoredSha256: restoredSha,
  };
}

module.exports = {
  MARKER_START,
  MARKER_END,
  detectPreloadEntry,
  buildInjectionBundle,
  stripExistingInjection,
  hasInjectionMarker,
  getPatchStatus,
  installPatch,
  restorePatch,
};
