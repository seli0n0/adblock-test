const http = require('http');
const fs = require('fs');
const path = require('path');
const { loadEasyListBaits } = require('./easylist');

const GIF_1x1 = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

const JS_BAIT = (marker) =>
  `window.${marker}=1;try{if(typeof canRunAds==="undefined"){} }catch(e){}\n`;

const POPSUP_HTML = `<!doctype html><meta charset="utf-8"><title>Advertisement</title>
<body style="margin:0;font-family:Arial;background:#ffd83d;display:flex;align-items:center;justify-content:center;height:100vh">
<div style="text-align:center"><div style="font-size:11px;color:#7a6200;border:1px solid #7a6200;display:inline-block;padding:1px 6px">Ad</div>
<h2 style="margin:8px 0">Тестовое popup-окно</h2><button onclick="close()">Закрыть</button></div></body>`;

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => resolve(data));
  });
}

async function startTestServer({ onReport, basePort = 8746 } = {}) {
  let testPage = fs.readFileSync(path.join(__dirname, 'testpage.html'), 'utf8');
  const el = await loadEasyListBaits(10);
  const elPaths = new Map();
  el.baits.forEach((b) => elPaths.set(b.path.split('?')[0], b.kind));
  testPage = testPage.replace('<!--EL_BAITS-->',
    '<script>window.__ELBAITS=' + JSON.stringify(el.baits) +
    ';window.__ELMETA=' + JSON.stringify(el.sources) + ';</script>');
  const dashboardHtml = fs.readFileSync(path.join(__dirname, 'renderer', 'index.html'), 'utf8');
  const dashboardJs = fs.readFileSync(path.join(__dirname, 'renderer', 'app.js'), 'utf8');
  const dashboardCss = fs.readFileSync(path.join(__dirname, 'renderer', 'style.css'), 'utf8');
  const allReports = [];

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;

    if (req.method === 'POST' && p === '/api/report') {
      const raw = await readBody(req);
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*' });
      res.end();
      try {
        const report = JSON.parse(raw);
        allReports.push(report);
        if (onReport) onReport(report);
      } catch (e) { /* ignore malformed */ }
      return;
    }

    if (req.method === 'POST' && p === '/api/reset') {
      allReports.length = 0;
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*' });
      return res.end();
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      return res.end();
    }

    const routes = {
      '/': () => send(res, 200, 'text/html; charset=utf-8', testPage),
      '/test': () => send(res, 200, 'text/html; charset=utf-8', testPage),
      '/dashboard': () => send(res, 200, 'text/html; charset=utf-8',
        dashboardHtml.replace('href="style.css"', 'href="/dashboard/style.css"')
          .replace('src="app.js"', 'src="/dashboard/app.js"')),
      '/dashboard/app.js': () => send(res, 200, 'application/javascript', dashboardJs),
      '/dashboard/style.css': () => send(res, 200, 'text/css', dashboardCss),
      '/api/reports': () => send(res, 200, 'application/json',
        JSON.stringify({ url: `http://127.0.0.1:${server.address().port}`, reports: allReports })),
      '/popup-ad': () => send(res, 200, 'text/html; charset=utf-8', POPSUP_HTML),
      '/scripts/ads.js': () => send(res, 200, 'application/javascript', 'var canRunAds = true;'),
      '/pagead/ads': () => send(res, 200, 'application/javascript', JS_BAIT('__pageadBait')),
      '/adv/banner.gif': () => sendBuf(res, 200, 'image/gif', GIF_1x1),
      '/banners/rotator.gif': () => sendBuf(res, 200, 'image/gif', GIF_1x1),
      '/ads/doubleclick/an.js': () => send(res, 200, 'application/javascript', JS_BAIT('__dtBait')),
      '/ads/googlesyndication/abp.js': () => send(res, 200, 'application/javascript', JS_BAIT('__gscBait')),
      '/ads/adframe.js': () => send(res, 200, 'application/javascript', JS_BAIT('__adframeBait')),
      '/ads/banner.gif': () => sendBuf(res, 200, 'image/gif', GIF_1x1),
      '/ads/doubleclick/banner.gif': () => sendBuf(res, 200, 'image/gif', GIF_1x1),
      '/api/ping': () => send(res, 200, 'application/json', '{"ok":true}'),
    };

    if (routes[p]) return routes[p]();

    // dynamic baits из EasyList/RU AdList: тип берём из параметра k (запрашивает страница)
    if (elPaths.has(p)) {
      const kind = url.searchParams.get('k') || elPaths.get(p);
      if (kind === 'image') return sendBuf(res, 200, 'image/gif', GIF_1x1);
      if (kind === 'css') return send(res, 200, 'text/css', '/* ad bait */');
      return send(res, 200, 'application/javascript', JS_BAIT('__elBait'));
    }

    send(res, 404, 'text/plain', 'not found');
  });

  const port = await listenWithFallback(server, basePort);
  return { server, port, url: `http://127.0.0.1:${port}` };
}

function listenWithFallback(server, basePort) {
  return new Promise((resolve, reject) => {
    let attempt = 0;
    const tryListen = (port) => {
      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE' && attempt < 20) {
          attempt += 1;
          tryListen(port + 1);
        } else reject(err);
      });
      server.listen(port, '127.0.0.1', () => resolve(port));
    };
    tryListen(basePort);
  });
}

function send(res, code, type, body) {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

function sendBuf(res, code, type, buf) {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(buf);
}

module.exports = { startTestServer };
