'use strict';

/**
 * 跨平台 Antigravity 安装路径探测、备份文件命名及安全环境守卫。
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const BACKUP_SUFFIX = '.zh-cn.bak';
const META_SUFFIX = '.zh-cn.meta.json';
const SWAP_SUFFIX = '.zh-cn.swap-old';
const TMP_SUFFIX = '.zh-cn.tmp';

/**
 * 返回当前操作系统下常见的 Antigravity 桌面端 `app.asar` 候选路径。
 * @param {string} [platform]
 * @param {string} [homedir]
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string[]}
 */
function getCandidateAsarPaths(platform = os.platform(), homedir = os.homedir(), env = process.env) {
  if (platform === 'win32') {
    const localAppData = env.LOCALAPPDATA || path.join(homedir, 'AppData', 'Local');
    const programFiles = env.ProgramFiles || 'C:\\Program Files';
    return [
      path.join(localAppData, 'Programs', 'antigravity', 'resources', 'app.asar'),
      path.join(localAppData, 'Programs', 'Antigravity', 'resources', 'app.asar'),
      path.join(programFiles, 'antigravity', 'resources', 'app.asar'),
      path.join(programFiles, 'Antigravity', 'resources', 'app.asar'),
      path.join(programFiles, 'Google Antigravity', 'resources', 'app.asar'),
      path.join(homedir, 'AppData', 'Roaming', 'antigravity', 'resources', 'app.asar'),
    ];
  }

  if (platform === 'darwin') {
    return [
      '/Applications/Antigravity.app/Contents/Resources/app.asar',
      path.join(homedir, 'Applications', 'Antigravity.app', 'Contents', 'Resources', 'app.asar'),
    ];
  }

  // Linux 常见系统路径与便携目录
  const appsDir = path.join(homedir, 'Applications');
  return [
    '/opt/antigravity/resources/app.asar',
    '/opt/Antigravity/resources/app.asar',
    '/usr/lib/antigravity/resources/app.asar',
    '/usr/share/antigravity/resources/app.asar',
    path.join(homedir, '.local', 'share', 'antigravity', 'resources', 'app.asar'),
    path.join(appsDir, 'Antigravity', 'resources', 'app.asar'),
    path.join(appsDir, 'antigravity', 'resources', 'app.asar'),
  ];
}

/**
 * 根据主 ASAR 路径推导相关状态文件路径。
 * @param {string} asarPath
 */
function getSidecarPaths(asarPath) {
  return {
    asarPath,
    backupPath: `${asarPath}${BACKUP_SUFFIX}`,
    metaPath: `${asarPath}${META_SUFFIX}`,
    swapOldPath: `${asarPath}${SWAP_SUFFIX}`,
    tmpPath: `${asarPath}${TMP_SUFFIX}`,
  };
}

/**
 * 冷启动崩溃自愈：若上次原子替换中途断电导致 `app.asar` 缺失但 `.zh-cn.swap-old` 存在，自动恢复。
 * @param {string} asarPath
 * @returns {boolean} 是否触发了自动恢复
 */
function tryRecoverSwappedAsar(asarPath) {
  if (!asarPath) return false;
  const { swapOldPath } = getSidecarPaths(asarPath);
  if (!fs.existsSync(asarPath) && fs.existsSync(swapOldPath)) {
    try {
      fs.renameSync(swapOldPath, asarPath);
      return true;
    } catch {
      fs.copyFileSync(swapOldPath, asarPath);
      fs.rmSync(swapOldPath, { force: true });
      return true;
    }
  }
  return false;
}

/**
 * 定位目标 `app.asar`。支持传入自定义文件路径或客户端根目录。
 * @param {string} [customTarget]
 * @param {{ platform?: string, homedir?: string, env?: NodeJS.ProcessEnv }} [opts]
 * @returns {string|null}
 */
function resolveAsarPath(customTarget, opts = {}) {
  if (customTarget) {
    const resolved = path.resolve(customTarget);
    const isDir = fs.existsSync(resolved) && fs.statSync(resolved).isDirectory();
    const candidates = isDir
      ? [
          path.join(resolved, 'resources', 'app.asar'),
          path.join(resolved, 'Contents', 'Resources', 'app.asar'),
          path.join(resolved, 'app.asar'),
        ]
      : [resolved];

    for (const candidate of candidates) {
      tryRecoverSwappedAsar(candidate);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    }
    return null;
  }

  const candidates = getCandidateAsarPaths(opts.platform, opts.homedir, opts.env);
  for (const candidate of candidates) {
    tryRecoverSwappedAsar(candidate);
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      // 忽略无权限路径
    }
  }
  return null;
}

/**
 * 返回用户自定义覆盖词典的默认路径（位于用户主目录，客户端升级不丢失）。
 * @param {string} [homedir]
 * @returns {string}
 */
function getUserCustomDictPath(homedir = os.homedir()) {
  return path.join(homedir, '.antigravity-zh-cn', 'custom-dict.json');
}

/**
 * 返回 Antigravity 官方全局插件安装目录。
 * @param {string} [homedir]
 * @returns {string}
 */
function getGlobalPluginDir(homedir = os.homedir()) {
  return path.join(homedir, '.gemini', 'config', 'plugins', 'antigravity-zh-cn');
}

/**
 * 检测当前是否处于 Antigravity 智能体会话或测试沙盒中（防止误杀宿主客户端）。
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
function isProtectedEnvironment(env = process.env) {
  return Boolean(
    env.ANTIGRAVITY_AGENT ||
      env.ANTIGRAVITY_CONVERSATION_ID ||
      env.ANTIGRAVITY_AGENTAPI_EXE ||
      env.AGY_NO_KILL === '1' ||
      env.NODE_ENV === 'test'
  );
}

module.exports = {
  BACKUP_SUFFIX,
  META_SUFFIX,
  SWAP_SUFFIX,
  TMP_SUFFIX,
  getCandidateAsarPaths,
  getSidecarPaths,
  tryRecoverSwappedAsar,
  resolveAsarPath,
  getUserCustomDictPath,
  getGlobalPluginDir,
  isProtectedEnvironment,
};
