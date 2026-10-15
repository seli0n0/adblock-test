// Запуск тестового сервера без Electron — для отладки: node src/standalone-server.js
const { startTestServer } = require('./server');
const fs = require('fs');
const path = require('path');

const logFile = path.join(__dirname, '..', 'logs', 'standalone.log');
fs.mkdirSync(path.dirname(logFile), { recursive: true });

startTestServer({
  onReport: (r) => {
    const line = `[${r.group}] ${r.id} :: ${r.label} -> ${r.status}`;
    console.log(line);
    fs.appendFileSync(logFile, line + '\n');
  },
}).then((info) => {
  console.log('test page:', info.url + '/test');
  fs.appendFileSync(logFile, `server up: ${info.url}/test\n`);
});
