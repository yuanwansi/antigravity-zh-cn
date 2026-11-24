'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {
  patchMenuJs,
  patchTrayJs,
  patchIpcHandlersJs,
  patchUpdaterJs,
} = require('../src/main-patches');

test('主进程原生顶栏菜单补丁（menu.js）：保留快捷键助记符并翻译子菜单与版本号', () => {
  const mockMenuSrc = `
    "use strict";
    function wslConnectMenuTemplate() { return { label: 'Connect to WSL', submenu: [] }; }
    function wslReopenLocallyTemplate() { return { label: 'Reopen Locally', click: () => relaunchWithWslDistro('') }; }
    function setup(electron_1, menu) {
      electron_1.Menu.setApplicationMenu(menu);
    }
    module.exports = { setup, wslConnectMenuTemplate, wslReopenLocallyTemplate };
  `;

  const patched = patchMenuJs(mockMenuSrc);
  assert.ok(patched, 'patchMenuJs 应成功返回补丁代码');
  assert.equal(patchMenuJs(patched), null, '已打补丁的源码不应重复注入');

  const sandbox = { module: { exports: {} }, exports: {} };
  vm.runInNewContext(patched, sandbox);

  let appliedMenu = null;
  const fakeElectron = {
    Menu: {
      setApplicationMenu(m) {
        appliedMenu = m;
      },
    },
  };
  const menuObj = {
    items: [
      {
        label: '&File',
        submenu: {
          items: [
            { label: 'New Window' },
            { label: 'Version 2.35.0' },
            { label: 'Quit Antigravity' },
          ],
        },
      },
    ],
  };

  sandbox.module.exports.setup(fakeElectron, menuObj);
  assert.equal(appliedMenu.items[0].label, '文件(&F)');
  assert.equal(appliedMenu.items[0].submenu.items[0].label, '新建窗口');
  assert.equal(appliedMenu.items[0].submenu.items[1].label, '版本 2.35.0');
  assert.equal(appliedMenu.items[0].submenu.items[2].label, '退出 Antigravity');
  assert.equal(sandbox.module.exports.wslConnectMenuTemplate().label, '连接至 WSL');
});

test('主进程托盘菜单（tray.js）、右键上下文菜单（ipcHandlers.js）与更新器（updater.js）补丁', () => {
  // 1. tray.js
  const mockTraySrc = `
    "use strict";
    let tray = { setContextMenu() {} };
    let contextMenu = { items: [{ id: 'running-agents', label: '' }], insert() {} };
    function createTray(actions, onClick) { return actions; }
    function insertTrayMenuItem(position, options) { return options; }
    function updateTrayAgentCount(count) {
      const countItem = contextMenu.items[0];
      countItem.label = (count > 0 ? \`\${count}\` : 'No') + ' agent' + (count === 1 ? '' : 's') + ' running';
      return countItem.label;
    }
    module.exports = { createTray, insertTrayMenuItem, updateTrayAgentCount };
  `;
  const patchedTray = patchTrayJs(mockTraySrc);
  assert.ok(patchedTray);
  const trayBox = { module: { exports: {} }, exports: {} };
  vm.runInNewContext(patchedTray, trayBox);
  const trayActions = trayBox.module.exports.createTray([
    { label: 'No agents running' },
    { label: 'Open Antigravity' },
    { label: 'Quit' },
  ]);
  assert.equal(trayActions[0].label, '无运行中的智能体');
  assert.equal(trayActions[1].label, '打开 Antigravity');
  assert.equal(trayActions[2].label, '退出');
  assert.equal(trayBox.module.exports.updateTrayAgentCount(0), '无运行中的智能体');
  assert.equal(trayBox.module.exports.updateTrayAgentCount(3), '3 个智能体运行中');

  // 2. ipcHandlers.js
  const mockIpcSrc = `
    "use strict";
    function buildContextMenuTemplate(items, onSelect) {
      return items;
    }
    module.exports = { buildContextMenuTemplate };
  `;
  const patchedIpc = patchIpcHandlersJs(mockIpcSrc);
  assert.ok(patchedIpc);
  const ipcBox = { module: { exports: {} }, exports: {} };
  vm.runInNewContext(patchedIpc, ipcBox);
  const translatedCtx = ipcBox.module.exports.buildContextMenuTemplate([
    { id: 'copy', label: 'Copy Message' },
    { id: 'group-project-name', label: 'Copy' }, // 动态分组名受保护不翻译
    { id: 'tabs', label: 'Close Tab', submenu: [{ label: 'Close Other Tabs' }] },
  ]);
  assert.equal(translatedCtx[0].label, '复制消息');
  assert.equal(translatedCtx[1].label, 'Copy');
  assert.equal(translatedCtx[2].label, '关闭标签页');
  assert.equal(translatedCtx[2].submenu[0].label, '关闭其他标签页');

  // 3. updater.js
  const mockUpdaterSrc = `
    "use strict";
    const MenuUpdateStep = {};
    MenuUpdateStep["CheckForUpdates"] = "Check for Updates";
    MenuUpdateStep["CheckingForUpdates"] = "Checking for Updates...";
    MenuUpdateStep["DownloadingUpdate"] = "Downloading Update...";
    MenuUpdateStep["RestartToUpdate"] = "Restart to Update";
    const dlg = {
                title: 'Check for Updates',
                message: 'No updates available',
                buttons: ['OK'],
    };
    module.exports = { MenuUpdateStep, dlg };
  `;
  const patchedUpdater = patchUpdaterJs(mockUpdaterSrc);
  assert.ok(patchedUpdater);
  const upBox = { module: { exports: {} }, exports: {} };
  vm.runInNewContext(patchedUpdater, upBox);
  assert.equal(upBox.module.exports.MenuUpdateStep.CheckForUpdates, '检查更新');
  assert.equal(upBox.module.exports.MenuUpdateStep.RestartToUpdate, '重启以更新');
  assert.equal(upBox.module.exports.dlg.message, '暂无可用更新');
});
