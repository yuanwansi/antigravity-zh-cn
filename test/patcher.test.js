'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { createAsarFromMap, readAsarFile, sha256File } = require('../src/asar');
const { getSidecarPaths, tryRecoverSwappedAsar } = require('../src/paths');
const {
  getPatchStatus,
  installPatch,
  restorePatch,
  MARKER_START,
} = require('../src/patcher');
const {
  installStandardPlugin,
  uninstallStandardPlugin,
  getPluginStatus,
} = require('../src/plugin-installer');

const CLI_PATH = path.resolve(__dirname, '..', 'bin', 'cli.js');

function createMockClient(tmpDir) {
  const resourcesDir = path.join(tmpDir, 'mock-antigravity', 'resources');
  fs.mkdirSync(resourcesDir, { recursive: true });
  const asarPath = path.join(resourcesDir, 'app.asar');
  createAsarFromMap(asarPath, {
    'package.json': '{"name":"antigravity","version":"2.35.0"}',
    'dist/preload.js': '"use strict";\nconsole.log("antigravity preload ready");\n',
    'dist/main.js': '"use strict";\nconsole.log("main");\n',
  });
  return asarPath;
}

test('端到端补丁生命周期：首次安装 -> 重复升级 -> 校验防篡改 -> 字节级无损还原', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-patcher-e2e-'));
  try {
    const asarPath = createMockClient(tmpDir);
    const originalSha = sha256File(asarPath);

    // 1. 首次安装
    const firstInstall = installPatch({
      target: asarPath,
      userDictPath: '',
      allowInProtectedEnv: true,
    });
    assert.equal(firstInstall.reinstalled, false);
    assert.ok(firstInstall.dictStats.total >= 200);
    assert.notEqual(sha256File(asarPath), originalSha);

    // 验证状态与注入内容
    const statusAfterInstall = getPatchStatus({ target: asarPath });
    assert.equal(statusAfterInstall.patched, true);
    assert.equal(statusAfterInstall.hasBackup, true);

    const preloadText = readAsarFile(asarPath, 'dist/preload.js').toString('utf8');
    assert.equal(preloadText.split(MARKER_START).length - 1, 1, 'preload 只能存在一次注入标记');
    const bundledDict = JSON.parse(readAsarFile(asarPath, 'dist/antigravity-zh-cn-dict.json').toString('utf8'));
    assert.equal(bundledDict.entries['Settings'], '设置');

    // 2. 重复安装/升级词典（不应叠加重复标记）
    const reinstall = installPatch({
      target: asarPath,
      userDictPath: '',
      allowInProtectedEnv: true,
    });
    assert.equal(reinstall.reinstalled, true);
    const preloadAfterReinstall = readAsarFile(asarPath, 'dist/preload.js').toString('utf8');
    assert.equal(preloadAfterReinstall.split(MARKER_START).length - 1, 1, '重复安装后依然只能存在一次注入标记');

    // 3. 字节级无损还原
    const restoreRes = restorePatch({
      target: asarPath,
      allowInProtectedEnv: true,
    });
    assert.equal(restoreRes.restoredSha256, originalSha);
    assert.equal(sha256File(asarPath), originalSha);

    const statusAfterRestore = getPatchStatus({ target: asarPath });
    assert.equal(statusAfterRestore.patched, false);
    assert.equal(statusAfterRestore.hasBackup, false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('安全守卫：受保护环境拦截、冷启动崩溃自愈与防备份篡改', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-guard-test-'));
  try {
    const asarPath = createMockClient(tmpDir);
    const originalSha = sha256File(asarPath);

    // 受保护环境未显式放行时必须拒绝修改
    const prevEnv = process.env.ANTIGRAVITY_AGENT;
    process.env.ANTIGRAVITY_AGENT = '1';
    try {
      assert.throws(() => installPatch({ target: asarPath }), /安全拦截/);
    } finally {
      if (prevEnv === undefined) delete process.env.ANTIGRAVITY_AGENT;
      else process.env.ANTIGRAVITY_AGENT = prevEnv;
    }

    // 模拟断电遗留 .zh-cn.swap-old 自愈
    const sidecars = getSidecarPaths(asarPath);
    fs.renameSync(asarPath, sidecars.swapOldPath);
    assert.equal(fs.existsSync(asarPath), false);
    assert.equal(tryRecoverSwappedAsar(asarPath), true);
    assert.equal(fs.existsSync(asarPath), true);
    assert.equal(sha256File(asarPath), originalSha);

    // 备份被篡改时拒绝还原
    installPatch({ target: asarPath, userDictPath: '', allowInProtectedEnv: true });
    fs.appendFileSync(sidecars.backupPath, 'corrupted');
    assert.throws(
      () => restorePatch({ target: asarPath, allowInProtectedEnv: true }),
      /SHA-256 校验失败/
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('官方标准中文插件安装、Manifest 规范校验与卸载 + CLI 冒烟测试', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-plugin-test-'));
  try {
    const pluginTarget = path.join(tmpDir, 'plugins', 'antigravity-zh-cn');
    const installRes = installStandardPlugin({ targetDir: pluginTarget });

    // 严格校验 plugin.json 仅使用官方允许的顶层字段
    const allowedTopLevel = new Set([
      'name',
      'displayName',
      'version',
      'description',
      'logo',
      'author',
      'homepage',
      'repository',
      'suggestedPrompts',
      'disabled',
    ]);
    for (const key of Object.keys(installRes.manifest)) {
      assert.ok(allowedTopLevel.has(key), `plugin.json 含有非官方字段: ${key}`);
    }
    assert.equal(installRes.manifest.name, 'antigravity-zh-cn');
    assert.ok(fs.existsSync(path.join(pluginTarget, 'rules', 'AGENTS.md')));
    assert.ok(fs.existsSync(path.join(pluginTarget, 'skills', 'zh-dict-helper', 'SKILL.md')));
    assert.ok(fs.existsSync(path.join(pluginTarget, 'assets', 'logo.svg')));

    // 验证插件内 rules/AGENTS.md 不含 YAML frontmatter（官方插件规范要求）
    const rulesContent = fs.readFileSync(path.join(pluginTarget, 'rules', 'AGENTS.md'), 'utf8');
    assert.ok(!rulesContent.trimStart().startsWith('---'), '插件内 rules/AGENTS.md 不应包含 YAML frontmatter');

    assert.equal(getPluginStatus({ targetDir: pluginTarget }).installed, true);
    assert.equal(uninstallStandardPlugin({ targetDir: pluginTarget }).removed, true);
    assert.equal(getPluginStatus({ targetDir: pluginTarget }).installed, false);

    // CLI check-dict 冒烟测试
    const stdout = execFileSync(process.execPath, [CLI_PATH, 'check-dict', '--json'], { encoding: 'utf8' });
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.issues.length, 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
