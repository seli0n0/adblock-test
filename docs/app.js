/* Тест блокировки ЗАГРУЗКИ рекламных ресурсов.
   Каждая приманка — реальный путь-правило из EasyList / RU AdList (generic block). */
(function () {
  'use strict';

  var state = new Map();
  var done = false;
  var online = null;
  var RUN = Date.now();
  var SEQ = 0;

  var STATUS_UI = {
    loaded: ['загружен', 'ok'],
    blocked: ['блокируется', 'bad'],
    timeout: ['нет ответа', 'warn'],
    ok: ['норма', 'ok'],
    clear: ['не блокируется', 'ok'],
    fired: ['блокируется', 'bad'],
    online: ['сеть есть', 'info'],
    offline: ['нет сети', 'bad'],
  };

  var BAITS = [
    { id: 'b-ads-cbr',    label: '/ads/cbr.js',        kind: 'script', url: 'baits/ads/cbr.js' },
    { id: 'b-ads-custom', label: '/ads/custom_ads.js', kind: 'script', url: 'baits/ads/custom_ads.js' },
    { id: 'b-ads-index',  label: '/ads/index.*',       kind: 'script', url: 'baits/ads/index.js' },
    { id: 'b-ads-show',   label: '/ads/show.*',        kind: 'script', url: 'baits/ads/show.js' },
    { id: 'b-ad-728',     label: '/ad_728.js',         kind: 'script', url: 'baits/ad_728.js' },
    { id: 'b-ad-header',  label: '/ad_header.js',      kind: 'script', url: 'baits/ad_header.js' },
    { id: 'b-adlift',     label: '/adlift.js',         kind: 'script', url: 'baits/adlift.js' },
    { id: 'b-admixer',    label: '/admixer.js',        kind: 'script', url: 'baits/admixer.js' },
    { id: 'b-adfox',      label: '/adfox/loader.js',   kind: 'script', url: 'baits/adfox/loader.js' },
    { id: 'b-vast',       label: '/ads-vast-vpaid.js', kind: 'script', url: 'baits/ads-vast-vpaid.js' },
    { id: 'b-taboola',    label: '/taboola_8.9.1.js',  kind: 'script', url: 'baits/taboola_8.9.1.js' },
    { id: 'b-pogoad',     label: '/pogoadkit.js',      kind: 'script', url: 'baits/pogoadkit.js' },
    { id: 'b-flyad',      label: '/js/flyad.js',       kind: 'script', url: 'baits/js/flyad.js' },
    { id: 'b-criteo',     label: '/criteo_adblock.js', kind: 'script', url: 'baits/criteo_adblock.js' },
    { id: 'b-adsteroid',  label: '/adsteroid.js',      kind: 'script', url: 'baits/adsteroid.js' },
    { id: 'b-utarget',    label: '/utarget.js',        kind: 'script', url: 'baits/utarget.js' },
    { id: 'b-bundle',     label: '/ads.bundle.js',     kind: 'script', url: 'baits/ads.bundle.js' },
    { id: 'b-adasync',    label: '/adasync.min.js',    kind: 'script', url: 'baits/adasync.min.js' },
    { id: 'b-stickyad',   label: '/stickyad.js',       kind: 'script', url: 'baits/stickyad.js' },
    { id: 'b-ad300',      label: '/ad300.jpg',         kind: 'img',    url: 'baits/ad300.jpg' },
    { id: 'b-adchoice',   label: '/adchoice.png',      kind: 'img',    url: 'baits/adchoice.png' },
    { id: 'b-spacer',     label: '/ads/spacer.*',      kind: 'img',    url: 'baits/ads/spacer.gif' },
    { id: 'b-adcss',      label: '/ad.css',            kind: 'css',    url: 'baits/ad.css' },
  ];
  var SCRIPT_BAITS = BAITS.filter(function (p) { return p.kind === 'script'; }).length;

  // настоящие ad-серверы: их блокируют фильтры, но они могут быть недоступны самой сетью
  var REMOTE = [
    { id: 'r-adsbygoogle', label: 'pagead2.googlesyndication.com/pagead/js/adsbygoogle.js', kind: 'script',
      url: 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js' },
    { id: 'r-gpt',         label: 'securepubads.g.doubleclick.net/tag/js/gpt.js', kind: 'script',
      url: 'https://securepubads.g.doubleclick.net/tag/js/gpt.js' },
    { id: 'r-gts',         label: 'www.googletagservices.com/tag/js/gpt.js', kind: 'script',
      url: 'https://www.googletagservices.com/tag/js/gpt.js' },
    { id: 'r-dc',          label: 'ad.doubleclick.net/favicon.ico', kind: 'img',
      url: 'https://ad.doubleclick.net/favicon.ico' },
    { id: 'r-score',       label: 'sb.scorecardresearch.com/beacon.js', kind: 'script',
      url: 'https://sb.scorecardresearch.com/beacon.js' },
    { id: 'r-amazon',      label: 'c.amazon-adsystem.com/aax2/apstag.js', kind: 'script',
      url: 'https://c.amazon-adsystem.com/aax2/apstag.js' },
  ];

  function set(group, id, label, status) {
    state.set(group + '|' + id, { group: group, id: id, label: label, status: status });
    render();
  }

  function rowsOf(group) {
    var out = [];
    state.forEach(function (v) { if (v.group === group) out.push(v); });
    return out;
  }

  function makeEl(kind) {
    if (kind === 'img') return new Image();
    if (kind === 'css') {
      var l = document.createElement('link');
      l.rel = 'stylesheet';
      return l;
    }
    return document.createElement('script');
  }

  function attempt(kind, url, timeoutMs) {
    return new Promise(function (resolve) {
      var el = makeEl(kind);
      var settled = false;
      function finish(result) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (el.remove) el.remove();
        resolve(result);
      }
      var timer = setTimeout(function () { finish('timeout'); }, timeoutMs);
      el.onload = function () { finish('loaded'); };
      el.onerror = function () { finish('blocked'); };
      var busted = url + (url.indexOf('?') === -1 ? '?' : '&') + 'v=' + RUN + '-' + (++SEQ);
      if (kind === 'css') el.href = busted; else el.src = busted;
      el.style.display = 'none';
      document.body.appendChild(el);
    });
  }

  // одиночный onload/onerror может быть гонкой при перезагрузке вкладки:
  // для приманок своего домена повторяем попытку, прежде чем объявить блокировку
  function probe(p, group, cb) {
    var sameOrigin = p.url.indexOf('://') === -1;
    var timeoutMs = sameOrigin ? 9000 : 12000;
    function settle(status) {
      set(group, p.id, p.label, status);
      tick();
      if (cb) cb();
    }
    attempt(p.kind, p.url, timeoutMs).then(function (first) {
      if (first === 'loaded') return settle('loaded');
      if (!sameOrigin) return settle(first);
      return attempt(p.kind, p.url, timeoutMs).then(function (second) {
        settle(second === 'loaded' ? 'loaded' : (second === 'timeout' ? 'timeout' : 'blocked'));
      });
    });
  }

  // браузер держит ограниченное число соединений на хост: очередь не даёт приманкам
  // простаивать в очереди и ошибочно выглядеть заблокированными
  function runQueue(items, group, limit, onEmpty) {
    var i = 0, active = 0;
    function next() {
      while (active < limit && i < items.length) {
        var p = items[i++];
        active += 1;
        probe(p, group, function () { active -= 1; next(); });
      }
      if (i >= items.length && active === 0 && onEmpty) onEmpty();
    }
    next();
  }

  function onlineControl() {
    var img = new Image();
    img.onload = function () { online = true; };
    img.onerror = function () { if (online !== true) online = false; };
    img.src = 'https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js?_=' + RUN;
    setTimeout(function () { if (online === null) online = false; }, 10000);
  }

  var pending = 0;
  function tick() {
    pending -= 1;
    if (pending <= 0) finish();
  }

  function finish() {
    if (done) return;
    done = true;
    var ran = (window.__adRan || []).length;
    // дальний хост ответил хотя бы на один запрос — значит сеть есть, даже если cdnjs недоступен
    var anyRemote = rowsOf('remote').some(function (r) { return r.status === 'loaded'; });
    set('detector', 'online', 'Внешние хосты отвечают (cdnjs + ad-сети)',
      (online === true || anyRemote) ? 'online' : 'offline');
    set('detector', 'ran', 'Выполнилось ad-скриптов (загрузка = выполнение): ' + ran + ' из ' + SCRIPT_BAITS,
      ran === 0 ? 'blocked' : (ran === SCRIPT_BAITS ? 'clear' : 'fired'));
    set('detector', 'allow', 'baits/controls/allow.js — обычный скрипт, не должен блокироваться',
      window.__allowRan ? 'ok' : 'fired');
    render();
  }

  function computeVerdict() {
    var baits = rowsOf('bait');
    var remote = rowsOf('remote');

    var blockedBaits = baits.filter(function (r) { return r.status === 'blocked' || r.status === 'timeout'; });
    var blockedRemote = remote.filter(function (r) { return r.status === 'blocked'; });
    var loadedRemote = remote.filter(function (r) { return r.status === 'loaded'; });

    // оценка строится только на приманках своего домена: сетевой сбой дальнего ad-хоста
    // выглядит так же, как фильтр, а свой домен заведомо достижим
    var blocking = blockedBaits;
    var scored = baits;
    var score = scored.length ? Math.round((blocking.length / scored.length) * 100) : null;

    var st, text, note;
    if (baits.length < BAITS.length) {
      st = 'waiting';
      text = baits.length < 8 ? 'Тест выполняется…' : 'Опрашиваю приманки…';
      note = 'Проверяю загрузку ' + BAITS.length + ' рекламных путей этого домена.';
    } else {
      var ratio = baits.length ? blockedBaits.length / baits.length : 0;
      if (blockedBaits.length >= 3 && ratio >= 0.6) {
        st = 'hard';
        text = 'Загрузка рекламы блокируется — жёсткий режим';
        note = 'Не загрузилось ' + blockedBaits.length + ' из ' + baits.length + ' приманок ('
             + Math.round(ratio * 100) + '%): сетевые фильтры обрывают запросы к ad-скриптам, баннерам и CSS.';
      } else if (blockedBaits.length >= 3) {
        st = 'blocked';
        text = 'Загрузка рекламы блокируется';
        note = 'Не загрузилось ' + blockedBaits.length + ' из ' + baits.length + ' путей из списков фильтров.';
      } else if (blockedBaits.length > 0) {
        st = 'partial';
        text = 'Единичные блокировки загрузок';
        note = 'Не загрузилось ' + blockedBaits.length + ' из ' + baits.length + ' приманок — похоже на '
             + 'отдельные пользовательские правила, а не на полный набор списков.';
      } else {
        st = 'clean';
        text = 'Блокировка загрузок не обнаружена';
        note = 'Все рекламные пути загрузились и скрипты выполнились: адблок отключён, домен в белом списке '
             + 'или списки EasyList / RU AdList не включены.';
      }
      if (remote.length && !loadedRemote.length) {
        note += ' Ad-домены Google и партнёров из этой сети не отвечают — их статус исключён из оценки.';
      }
    }
    return { state: st, text: text, note: note, score: score };
  }

  function renderRows(group) {
    var el = document.getElementById('rows-' + group);
    if (!el) return;
    var rows = rowsOf(group);
    if (!rows.length) { el.innerHTML = '<li class="empty">ожидание…</li>'; return; }
    el.innerHTML = '';
    rows.forEach(function (r) {
      var li = document.createElement('li');
      var label = document.createElement('span');
      label.className = 'label';
      label.textContent = r.label;
      label.title = r.label;
      var badge = document.createElement('span');
      var ui = STATUS_UI[r.status] || [r.status, ''];
      badge.className = 'badge ' + ui[1];
      badge.textContent = ui[0];
      li.appendChild(label);
      li.appendChild(badge);
      el.appendChild(li);
    });
  }

  function render() {
    ['bait', 'remote', 'detector'].forEach(renderRows);
    var v = computeVerdict();
    var st = document.getElementById('verdict-state');
    st.textContent = v.text;
    st.className = 'verdict-state ' + v.state;
    document.getElementById('verdict-note').textContent = v.note;
    document.getElementById('score-num').textContent = v.score === null ? '—' : v.score + '%';
  }

  function start() {
    state.clear();
    done = false;
    online = null;
    window.__adRan = [];
    delete window.__allowRan;
    RUN = Date.now();
    render();

    pending = BAITS.length + REMOTE.length + 1;
    // сначала все локальные приманки: висящие запросы к ad-доменам занимают соединения,
    // и локальные ответы доходят позже, чем истечёт таймаут
    runQueue(BAITS, 'bait', 4, function () {
      onlineControl();
      runQueue(REMOTE, 'remote', 3);
    });
    attempt('script', 'baits/controls/allow.js', 9000).then(tick, tick);
    setTimeout(finish, 45000);
  }

  document.getElementById('btn-rerun').onclick = start;
  start();
})();
