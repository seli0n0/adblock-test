function makeBrowserFallback(origin) {
  let seen = 0;
  let pollCb = null;
  setInterval(async () => {
    try {
      const s = await fetch(origin + '/api/reports').then((r) => r.json());
      if (s.reports.length < seen) { seen = 0; clearAll(); render(); }
      while (seen < s.reports.length) { if (pollCb) pollCb(s.reports[seen]); seen += 1; }
    } catch (e) { /* server not reachable yet */ }
  }, 1500);
  return {
    getState: async () => {
      try { return await fetch(origin + '/api/reports').then((r) => r.json()); }
      catch (e) { return { url: origin, reports: [] }; }
    },
    openTestPage: () => window.open(origin + '/test', '_blank'),
    reset: async () => { await fetch(origin + '/api/reset', { method: 'POST' }); },
    onReport: (cb) => { pollCb = cb; },
    onReset: () => {},
  };
}

const api = window.adblockApi || makeBrowserFallback(location.origin);

const LATEST = new Map(); // key: group|id -> report (в рамках выбранного прогона)
let doneReceived = false;
let onlineFlag = null;

const RUNS = new Map(); // runId -> { done, seq, byKey: Map }
let runSeq = 0;
let currentRunId = null;

const STATUS_UI = {
  loaded: ['загружен', 'ok'],
  'not-loaded': ['не загружен (блок или нет сети)', 'warn'],
  timeout: ['таймаут', 'warn'],
  visible: ['не скрыт', 'ok'],
  hidden: ['скрыт', 'bad'],
  removed: ['удалён из DOM', 'bad'],
  fired: ['адблок обнаружен', 'bad'],
  clear: ['не сработал', 'ok'],
  displayed: ['показан', 'ok'],
  suppressed: ['подавлен', 'bad'],
  opened: ['окно открыто', 'ok'],
  blocked: ['окно заблокировано', 'warn'],
  online: ['интернет есть', 'info'],
  offline: ['нет интернета', 'warn'],
  net: ['списки загружены по сети', 'info'],
  cache: ['списки из кэша', 'warn'],
  none: ['списки недоступны', 'warn'],
  done: ['завершено', 'info'],
};

function key(r) { return r.group + '|' + r.id; }

function ingest(r) {
  const runId = r.run || 'default';
  let run = RUNS.get(runId);
  if (!run) {
    runSeq += 1;
    run = { done: false, seq: runSeq, byKey: new Map() };
    RUNS.set(runId, run);
  }
  if (r.group === 'meta' && r.id === 'done') run.done = true;
  run.byKey.set(key(r), r);
  selectRun();
  render();
}

// страница могла перезагрузиться посреди прогона — берём последний
// завершённый прогон, а если завершённых нет, самый свежий начатый
function selectRun() {
  let doneBest = null, openBest = null;
  for (const [id, run] of RUNS) {
    if (run.done) { if (!doneBest || run.seq > doneBest.run.seq) doneBest = { id, run }; }
    else if (!openBest || run.seq > openBest.run.seq) openBest = { id, run };
  }
  const pick = doneBest || openBest;
  currentRunId = pick ? pick.id : null;
  const cur = pick ? pick.run : null;
  LATEST.clear();
  if (cur) for (const v of cur.byKey.values()) LATEST.set(key(v), v);
  doneReceived = !!(cur && cur.done);
  const ctl = cur && cur.byKey.get('meta|ctl-online');
  onlineFlag = ctl ? ctl.status === 'online' : null;
}

function clearAll() {
  RUNS.clear();
  currentRunId = null;
  LATEST.clear();
  doneReceived = false;
  onlineFlag = null;
}

function rowsFor(group) {
  const out = [];
  for (const r of LATEST.values()) if (r.group === group) out.push(r);
  return out;
}

function renderRows(group) {
  const el = document.getElementById('rows-' + group);
  const rows = rowsFor(group);
  if (!rows.length) {
    el.innerHTML = '<li class="empty">нет данных — запустите тест в браузере</li>';
    return;
  }
  el.innerHTML = '';
  rows.forEach((r) => {
    const li = document.createElement('li');
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = r.label;
    label.title = r.label;
    const badge = document.createElement('span');
    const ui = STATUS_UI[r.status] || [r.status, ''];
    badge.className = 'badge ' + ui[1];
    badge.textContent = ui[0];
    li.append(label, badge);
    el.appendChild(li);
  });
}

function computeVerdict() {
  const net = rowsFor('network');
  const det = rowsFor('detector');
  const cos = rowsFor('cosmetic');
  const pop = rowsFor('popup');

  const realNet = net.filter((r) => r.id.startsWith('net-'));
  const localNet = net.filter((r) => r.id.startsWith('loc-'));
  // если ни одна дальняя ad-сеть не загрузилась, они просто недоступны
  // (блокировка провайдером и т.п.) — не считаем их свидетельством блока
  const netReachable = realNet.some((r) => r.status === 'loaded');
  const decisiveReal = netReachable ? realNet : [];
  const blockedReal = decisiveReal.filter((r) => r.status === 'not-loaded' || r.status === 'timeout');
  const blockedLocal = localNet.filter((r) => r.status === 'not-loaded' || r.status === 'timeout');
  // надёжен только canRunAds (грузит скрипт с нашего сервера);
  // сетевые детекторы достоверны лишь когда ad-домены достижимы
  const firedDetLocal = det.filter((r) => r.id === 'det-canRunAds' && r.status === 'fired');
  const firedDetInfo = netReachable
    ? det.filter((r) => r.id !== 'det-canRunAds' && r.status === 'fired') : [];
  const hiddenCos = cos.filter((r) => r.status === 'hidden' || r.status === 'removed');
  const suppressedOverlays = pop.filter((r) => r.status === 'suppressed');

  const scored = [...decisiveReal, ...localNet, ...det.filter((r) => r.id === 'det-canRunAds' || netReachable),
    ...cos, ...pop];
  const blocking = [...blockedReal, ...blockedLocal, ...firedDetLocal, ...firedDetInfo,
    ...hiddenCos, ...suppressedOverlays];
  const score = scored.length ? Math.round((blocking.length / scored.length) * 100) : null;

  let state = 'waiting';
  let text = 'Ожидание результатов…';
  let note = 'Тест идёт в браузере по умолчанию — там, где установлен ваш блокировщик рекламы.';

  if (onlineFlag === false) {
    state = 'waiting';
    text = 'Нет доступа в интернет';
    note = 'Проверки по реальным рекламным сетям недостоверны без сети. Итог может быть неверным.';
  } else if (!doneReceived && scored.length === 0) {
    // waiting
  } else {
    const strong =
      firedDetLocal.length >= 1 ||
      blockedLocal.length >= 2 ||
      hiddenCos.length >= 4 ||
      suppressedOverlays.length >= 2;
    const hard =
      strong &&
      hiddenCos.length >= 4 &&
      (blockedLocal.length >= Math.max(2, localNet.length - 1) || firedDetLocal.length >= 1);

    if (!doneReceived && scored.length < 8) {
      text = 'Тест выполняется…';
    } else if (hard) {
      state = 'hard';
      text = 'Блокировщик найден — жёсткий режим';
      note = 'Блокируются рекламные скрипты и ресурсы по фильтрам, косметика скрывает ad-элементы, '
        + 'навязчивые форматы подавляются.';
    } else if (strong) {
      state = 'blocked';
      text = 'Блокировщик рекламы обнаружен';
      note = `Локальные приманки заблокированы: ${blockedLocal.length}, скрыто ad-элементов: ${hiddenCos.length}, `
        + `сработало детекторов: ${firedDetLocal.length + firedDetInfo.length} (из них по сетевым доменам: ${firedDetInfo.length}).`;
    } else if (doneReceived) {
      state = 'clean';
      text = 'Блокировщик не обнаружен';
      note = 'Приманки загружаются, косметика не применяется, детекторы не сработали. '
        + 'Возможно, адблок отключён или сайт в белом списке.';
    } else {
      text = 'Частичные результаты…';
    }
  }

  if (!netReachable && realNet.length && state !== 'waiting') {
    note += ' Дальние ad-домены (Google и т.п.) из этой сети недоступны — они исключены из оценки.';
  }

  return { state, text, note, score };
}

function render() {
  ['network', 'detector', 'cosmetic', 'popup'].forEach(renderRows);
  const v = computeVerdict();
  const st = document.getElementById('verdict-state');
  st.textContent = v.text;
  st.className = 'verdict-state ' + v.state;
  document.getElementById('verdict-note').textContent = v.note;
  document.getElementById('score-num').textContent = v.score === null ? '—' : v.score + '%';
}

document.getElementById('btn-open').onclick = () => api.openTestPage();
document.getElementById('btn-reset').onclick = () => {
  clearAll();
  render();
  api.reset();
};

api.onReport(ingest);
api.onReset(() => {
  clearAll();
  render();
});

(async () => {
  const s = await api.getState();
  document.getElementById('server-url').textContent = s.url ? 'тест: ' + s.url + '/test' : 'сервер не запущен';
  (s.reports || []).forEach(ingest);
})();
