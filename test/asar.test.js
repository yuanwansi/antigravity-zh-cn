'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  createAsarFromMap,
  readAsarHeader,
  listAsarEntries,
  readAsarFile,
  findEntryNode,
  patchAsar,
  computeIntegrity,
} = require('../src/asar');

test('纯 JS ASAR 打包、读取、unpacked 保留与 SHA-256 完整性校验', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-asar-test-'));
  try {
    const srcAsar = path.join(tmpDir, 'app.asar');
    const outAsar = path.join(tmpDir, 'app.patched.asar');
    const binaryPayload = Buffer.from([0x00, 0x01, 0xfe, 0xff, 0x42, 0x99]);

    createAsarFromMap(srcAsar, {
      'package.json': '{"name":"mock-antigravity","version":"2.35.0"}',
      'dist/preload.js': 'console.log("original preload");\n',
      'dist/assets/icon.bin': binaryPayload,
      'native/addon.node': { content: 'native-placeholder', unpacked: true, executable: true },
    });

    const entries = listAsarEntries(srcAsar);
    assert.equal(entries.length, 4);
    assert.equal(entries.find((e) => e.path === 'native/addon.node').unpacked, true);
    assert.deepEqual(readAsarFile(srcAsar, 'dist/assets/icon.bin'), binaryPayload);

    // 增量补丁：覆盖 preload、注入新运行时、不改动二进制与 unpacked 条目
    const patchedPreload = 'console.log("patched preload");\n';
    const injectedRuntime = 'module.exports = { ok: true };\n';
    patchAsar(srcAsar, outAsar, {
      overrides: {
        'dist/preload.js': patchedPreload,
        'dist/antigravity-zh-cn-runtime.js': injectedRuntime,
      },
    });

    assert.equal(readAsarFile(outAsar, 'dist/preload.js').toString('utf8'), patchedPreload);
    assert.equal(readAsarFile(outAsar, 'dist/antigravity-zh-cn-runtime.js').toString('utf8'), injectedRuntime);
    assert.deepEqual(readAsarFile(outAsar, 'dist/assets/icon.bin'), binaryPayload);
    assert.equal(
      readAsarFile(outAsar, 'package.json').toString('utf8'),
      '{"name":"mock-antigravity","version":"2.35.0"}'
    );

    // 校验 unpacked 条目与 integrity 哈希
    const { header } = readAsarHeader(outAsar);
    const nativeNode = findEntryNode(header, 'native/addon.node');
    assert.equal(nativeNode.unpacked, true);
    assert.equal(nativeNode.executable, true);

    const preloadNode = findEntryNode(header, 'dist/preload.js');
    assert.deepEqual(preloadNode.integrity, computeIntegrity(Buffer.from(patchedPreload, 'utf8')));

    // 拒绝覆盖 unpacked 文件
    assert.throws(
      () => patchAsar(srcAsar, outAsar, { overrides: { 'native/addon.node': 'bad' } }),
      /unpacked/
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
