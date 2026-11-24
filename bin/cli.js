#!/usr/bin/env node
'use strict';

/**
 * antigravity-zh-cn 命令行入口。
 *
 * 子命令：
 *   install           安装或更新桌面端中文汉化（支持 --target / --with-plugin）
 *   restore           无损还原为官方英文原版（支持 --target）
 *   status            查看桌面端汉化状态与标准插件状态（支持 --target / --json）
 *   check-dict        校验内置词典质量、冲突与禁词规范
 *   install-plugin    仅安装官方标准中文交互插件（零侵入客户端本体）
 *   uninstall-plugin  卸载官方标准中文交互插件
 */

const path = require('path');
const pkg = require('../package.json');
const { getPatchStatus, installPatch, restorePatch, auditClient } = require('../src/patcher');
const { loadDictionaries } = require('../src/dict-loader');
const {
  installStandardPlugin,
  uninstallStandardPlugin,
  getPluginStatus,
} = require('../src/plugin-installer');
const { getUserCustomDictPath } = require('../src/paths');

const DICT_DIR = path.resolve(__dirname, '..', 'dicts');

function parseArgs(argv) {
  const flags = {
    target: undefined,
    withPlugin: false,
    json: false,
    allowInProtectedEnv: false,
  };
  let command = 'help';

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('-') && command === 'help') {
      command = arg;
    } else if (arg === '--target' || arg === '-t') {
      flags.target = argv[i + 1];
      i += 1;
    } else if (arg.startsWith('--target=')) {
      flags.target = arg.slice('--target='.length);
    } else if (arg === '--with-plugin') {
      flags.withPlugin = true;
    } else if (arg === '--json') {
      flags.json = true;
    } else if (arg === '--force-in-agent') {
      flags.allowInProtectedEnv = true;
    } else if (arg === '--version' || arg === '-v') {
      command = 'version';
    } else if (arg === '--help' || arg === '-h') {
      command = 'help';
    }
  }
  return { command, flags };
}

function printHelp() {
  console.log(`antigravity-zh-cn v${pkg.version} — Google Antigravity 中文汉化引擎与官方标准中文插件

用法:
  node bin/cli.js <command> [options]

命令:
  install            安装/升级桌面端中文汉化（自动备份原版 app.asar）
  restore            校验备份并字节级无损还原官方英文原版
  status             查看桌面端汉化状态与标准中文插件状态
  audit-client       只读巡检本机客户端版本、钩子兼容性与新增未翻译文案
  check-dict         校验内置词典与用户自定义词典的格式、重复键与安全规范
  install-plugin     安装官方标准中文交互插件到 ~/.gemini/config/plugins/
  uninstall-plugin   卸载官方标准中文交互插件

选项:
  -t, --target <路径>  手动指定 Antigravity 安装目录或 app.asar 文件路径
  --with-plugin        执行 install 时一并安装官方标准中文交互插件
  --json               以 JSON 格式输出状态信息（用于 status / check-dict）
  -v, --version        查看版本号
  -h, --help           显示此帮助信息

快捷键:
  客户端汉化生效后，按 Alt + Shift + L 可随时实时切换 中文 / English，无需重启。
自定义词典:
  ${getUserCustomDictPath()}
`);
}

function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));

  try {
    switch (command) {
      case 'version':
        console.log(pkg.version);
        return;

      case 'help':
        printHelp();
        return;

      case 'check-dict': {
        const res = loadDictionaries(DICT_DIR, { userDictPath: getUserCustomDictPath(), strict: false });
        if (flags.json) {
          console.log(JSON.stringify(res, null, 2));
        } else {
          console.log(`词典分包数: ${res.stats.fileCount}`);
          console.log(`总有效词条: ${res.stats.total}（其中独立控件受保护短词 ${res.stats.isolatedCount} 条）`);
          if (res.stats.userOverrides > 0) {
            console.log(`用户覆盖词条: ${res.stats.userOverrides}`);
          }
          if (res.issues.length === 0) {
            console.log('校验结果: 全部通过，无错误或警告。');
          } else {
            for (const issue of res.issues) {
              console.log(`[${issue.severity.toUpperCase()}] ${issue.file} (${issue.key || '-'}): ${issue.message}`);
            }
          }
        }
        if (res.issues.some((item) => item.severity === 'error')) {
          process.exitCode = 1;
        }
        return;
      }

      case 'status': {
        const desktop = getPatchStatus({ target: flags.target });
        const plugin = getPluginStatus();
        if (flags.json) {
          console.log(JSON.stringify({ desktop, plugin }, null, 2));
          return;
        }
        console.log('=== 桌面端汉化状态 ===');
        if (!desktop.found) {
          console.log('状态: 未自动找到 Antigravity app.asar（可通过 --target 指定路径）');
        } else {
          console.log(`目标文件: ${desktop.asarPath}`);
          console.log(`Preload : ${desktop.preloadEntry || '未检测到'}`);
          console.log(`汉化状态: ${desktop.patched ? '已安装中文汉化' : '官方原版英文'}`);
          console.log(`原版备份: ${desktop.hasBackup ? desktop.backupPath : '无'}`);
          if (desktop.meta) {
            console.log(`补丁版本: v${desktop.meta.toolVersion}（词条数 ${desktop.meta.dictEntriesCount}，安装于 ${desktop.meta.installedAt}）`);
          }
        }
        console.log('\n=== 官方标准中文插件状态 ===');
        console.log(`安装状态: ${plugin.installed ? '已安装' : '未安装'}`);
        console.log(`插件路径: ${plugin.targetDir}`);
        return;
      }

      case 'audit-client': {
        const report = auditClient({ target: flags.target });
        if (flags.json) {
          console.log(JSON.stringify(report, null, 2));
          return;
        }
        if (!report.found) {
          console.log('未在本机探测到 Antigravity 客户端 app.asar。');
          return;
        }
        console.log(`客户端版本: ${report.clientVersion || '未知'}`);
        console.log(`当前状态  : ${report.patched ? `已汉化 (v${report.installedToolVersion || '?'})` : '官方英文原版（可能需要重新应用汉化）'}`);
        console.log(`Preload   : ${report.preloadEntry}`);
        console.log(`主进程钩子: ${report.mainPatchedFiles.length}/${report.expectedMainHooks.length} 兼容 (${report.mainPatchedFiles.join(', ')})`);
        console.log(`新增未译项: ${report.untranslatedCount} 条`);
        for (const item of report.untranslatedLiterals.slice(0, 25)) {
          console.log(`  - [${item.file}] ${JSON.stringify(item.text)}`);
        }
        return;
      }

      case 'install': {
        const result = installPatch({
          target: flags.target,
          allowInProtectedEnv: flags.allowInProtectedEnv,
        });
        console.log(`${result.reinstalled ? '已升级' : '已安装'} Antigravity 桌面端中文汉化！`);
        console.log(`目标文件: ${result.asarPath}`);
        console.log(`原版备份: ${result.backupPath}`);
        console.log(`生效词条: ${result.dictStats.total} 条（含独立控件守卫 ${result.dictStats.isolatedCount} 条）`);
        if (flags.withPlugin) {
          const pluginRes = installStandardPlugin();
          console.log(`标准插件: 已同步安装至 ${pluginRes.targetDir}`);
        }
        console.log('提示: 重启 Antigravity 桌面端即可生效，运行时按 Alt + Shift + L 可随时切换中/英文。');
        return;
      }

      case 'restore': {
        const result = restorePatch({
          target: flags.target,
          allowInProtectedEnv: flags.allowInProtectedEnv,
        });
        console.log('已字节级无损还原为官方英文原版！');
        console.log(`目标文件: ${result.asarPath}`);
        console.log(`校验哈希: ${result.restoredSha256}`);
        console.log('提示: 重启 Antigravity 桌面端即可恢复英文界面。');
        return;
      }

      case 'install-plugin': {
        const pluginRes = installStandardPlugin();
        console.log('已安装 Antigravity 官方标准中文交互插件！');
        console.log(`插件名称: ${pluginRes.manifest.displayName} (${pluginRes.manifest.name})`);
        console.log(`安装路径: ${pluginRes.targetDir}`);
        console.log('提示: 可在 Antigravity 左侧 Customizations -> Installed 中管理开关，无需重启即可生效。');
        return;
      }

      case 'uninstall-plugin': {
        const res = uninstallStandardPlugin();
        if (res.removed) {
          console.log(`已卸载官方标准中文交互插件: ${res.targetDir}`);
        } else {
          console.log(`未检测到已安装的插件目录: ${res.targetDir}`);
        }
        return;
      }

      default:
        console.error(`未知命令: ${command}\n`);
        printHelp();
        process.exitCode = 1;
    }
  } catch (err) {
    console.error(`执行失败: ${err.message}`);
    process.exitCode = 1;
  }
}

main();
