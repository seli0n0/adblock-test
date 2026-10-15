const fs = require('fs');
const path = require('path');

const CACHE_DIR = path.join(__dirname, '..', 'lists-cache');

const SOURCES = [
  {
    name: 'EasyList',
    url: 'https://raw.githubusercontent.com/easylist/easylist/master/easylist/easylist_general_block.txt',
    file: 'easylist_general_block.txt',
  },
  {
    name: 'RU AdList',
    url: 'https://raw.githubusercontent.com/easylist/ruadlist/master/advblock/general_block.txt',
    file: 'advblock_general_block.txt',
  },
];

const ADISH = /(ad|adv|banner|spot|promo|publicit|rekl|sponsor|pop)/i;

function classifyRule(line) {
  line = line.trim();
  if (!line || line[0] === '!' || line[0] === '[') return null;
  if (line.startsWith('@@') || line.includes('#') || line.includes('|')) return null;
  const parts = line.split('$');
  if (parts.length > 2) return null;
  const pattern = parts[0];
  const opts = parts[1] || '';
  if (!pattern.startsWith('/')) return null;
  if (pattern.length < 5 || pattern.length > 40) return null;
  if ((pattern.match(/\*/g) || []).length > 1) return null;
  if (/[^\w\-./?=&%*~]/.test(pattern)) return null;
  if (/domain=|third-party|~|xmlhttprequest|websocket|subdocument|popup|font|media|object|elemhide|generichide|csp|remove|method=|header=/.test(opts)) return null;
  let kind = 'script';
  let typed = false;
  for (const o of opts.split(',').filter(Boolean)) {
    if (o === 'image') { kind = 'image'; typed = true; }
    else if (o === 'script') { kind = 'script'; typed = true; }
    else if (o === 'stylesheet') { kind = 'css'; typed = true; }
    else return null;
  }
  if (opts && !typed) return null;
  if (!ADISH.test(pattern)) return null;

  let p = pattern.replace(/\*/g, 'x');
  if (/^\/(\?|$)/.test(p)) return null; // не должен совпасть с маршрутом /test
  if (/\/$/.test(p)) p += kind === 'image' ? 'banner.gif' : kind === 'css' ? 'style.css' : 'ads.js';
  else if (/\.$/.test(p)) p += kind === 'image' ? 'gif' : kind === 'css' ? 'css' : 'js';
  else if (/[?&=]$/.test(p)) p += '1';
  else if (/_$/.test(p)) p += 'x';
  return { pattern, kind, path: p };
}

function extractGeneric(text, listName, limit) {
  const out = [];
  const seen = new Set();
  for (const line of text.split(/\r?\n/)) {
    if (out.length >= limit) break;
    const r = classifyRule(line);
    if (!r) continue;
    if (seen.has(r.path)) continue;
    seen.add(r.path);
    out.push({ list: listName, rule: r.pattern, kind: r.kind, path: r.path + '?el=' + (out.length + 1) });
  }
  return out;
}

async function loadText(src) {
  try {
    const res = await fetch(src.url, { signal: AbortSignal.timeout(25000) });
    if (res.ok) {
      const text = await res.text();
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      fs.writeFileSync(path.join(CACHE_DIR, src.file), text);
      return { text, from: 'net' };
    }
  } catch (e) { /* fall through to cache */ }
  const f = path.join(CACHE_DIR, src.file);
  if (fs.existsSync(f)) return { text: fs.readFileSync(f, 'utf8'), from: 'cache' };
  return { text: '', from: 'none' };
}

async function loadEasyListBaits(perSource = 10) {
  const baits = [];
  const sources = [];
  for (const src of SOURCES) {
    const { text, from } = await loadText(src);
    const list = extractGeneric(text, src.name, perSource);
    baits.push(...list);
    sources.push({ name: src.name, from, count: list.length });
  }
  return { baits, sources };
}

module.exports = { loadEasyListBaits };
