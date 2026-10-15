const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { startTestServer } = require('./server');

let win;
let serverInfo = null;
let reports = [];

function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 900,
    minHeight: 620,
    title: 'Adblock Test',
    backgroundColor: '#101418',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

ipcMain.handle('get-state', () => ({
  url: serverInfo ? serverInfo.url : '',
  reports,
}));

ipcMain.handle('open-test-page', () => {
  if (serverInfo) shell.openExternal(serverInfo.url + '/test');
});

ipcMain.handle('reset', () => {
  reports = [];
  win.webContents.send('reset', null);
  if (serverInfo) shell.openExternal(serverInfo.url + '/test');
});

app.whenReady().then(async () => {
  createWindow();
  serverInfo = await startTestServer({
    onReport: (r) => {
      reports.push(r);
      if (win && !win.isDestroyed()) win.webContents.send('report', r);
    },
  });
  console.log('test server:', serverInfo.url);
  shell.openExternal(serverInfo.url + '/test');

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (serverInfo) serverInfo.server.close();
  app.quit();
});
