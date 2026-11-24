'use strict';

/**
 * Antigravity 官方标准中文交互插件安装/卸载器。
 * 将仓库内 `plugin/antigravity-zh-cn/` 安装至 `~/.gemini/config/plugins/antigravity-zh-cn/`。
 *
 * 特点：零侵入客户端二进制，仅安装官方规范的 plugin.json、全局中文规则（rules/AGENTS.md）和词典维护 Skill。
 */

const fs = require('fs');
const path = require('path');
const { getGlobalPluginDir } = require('./paths');

const PLUGIN_SOURCE_DIR = path.resolve(__dirname, '..', 'plugin', 'antigravity-zh-cn');

/**
 * 递归复制目录。
 * @param {string} srcDir
 * @param {string} destDir
 */
function copyDirRecursive(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * 安装官方标准中文交互插件。
 * @param {{ targetDir?: string }} [options]
 */
function installStandardPlugin(options = {}) {
  if (!fs.existsSync(path.join(PLUGIN_SOURCE_DIR, 'plugin.json'))) {
    throw new Error(`插件源目录缺失 plugin.json: ${PLUGIN_SOURCE_DIR}`);
  }
  const targetDir = options.targetDir || getGlobalPluginDir();
  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
  copyDirRecursive(PLUGIN_SOURCE_DIR, targetDir);
  return {
    sourceDir: PLUGIN_SOURCE_DIR,
    targetDir,
    manifest: JSON.parse(fs.readFileSync(path.join(targetDir, 'plugin.json'), 'utf8')),
  };
}

/**
 * 卸载官方标准中文交互插件。
 * @param {{ targetDir?: string }} [options]
 */
function uninstallStandardPlugin(options = {}) {
  const targetDir = options.targetDir || getGlobalPluginDir();
  if (!fs.existsSync(targetDir)) {
    return { removed: false, targetDir };
  }
  fs.rmSync(targetDir, { recursive: true, force: true });
  return { removed: true, targetDir };
}

/**
 * 检查插件安装状态。
 * @param {{ targetDir?: string }} [options]
 */
function getPluginStatus(options = {}) {
  const targetDir = options.targetDir || getGlobalPluginDir();
  const manifestPath = path.join(targetDir, 'plugin.json');
  if (!fs.existsSync(manifestPath)) {
    return { installed: false, targetDir, manifest: null };
  }
  return {
    installed: true,
    targetDir,
    manifest: JSON.parse(fs.readFileSync(manifestPath, 'utf8')),
  };
}

module.exports = {
  PLUGIN_SOURCE_DIR,
  installStandardPlugin,
  uninstallStandardPlugin,
  getPluginStatus,
};
