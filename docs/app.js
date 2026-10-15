(function () {
  'use strict';

  var state = new Map();
  var done = false;
  var online = null;

  var STATUS_UI = {
    loaded: ['загружен', 'ok'],
    'not-loaded': ['не загружен', 'bad'],
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
    done: ['завершено', 'info'],
  };

  function set(group, id, label, status) {
    state.set(group + '|' + id, { group: group, id: id, label: label, status: status });
    render();
  }

  function rowsOf(group) {
    var out = [];
    state.forEach(function (v) { if (v.group === group) out.push(v); });
    return out;
  }

  function probe(p) {
    var settled = false;
    function finish(s) {
      if (settled) return;
      settled = true;
      set('network', p.id, p.label, s);
    }
    function fail() {
      if (p.url.indexOf(location.origin) === 0) {
        fetch(p.url, { cache: 'no-store' })
          .then(function (r) { finish(r.ok ? 'loaded' : 'not-loaded'); })
          .catch(function () { finish('not-loaded'); });
      } else finish('not-loaded');
    }
    setTimeout(function () { finish('timeout'); }, 12000);
    var el;
    if (p.kind === 'img') {
      el = new Image();
      el.style.display = 'none';
      el.onload = function () { finish('loaded'); };
      el.onerror = fail;
      el.src = p.url;
    } else {
      el = document.createElement('script');
      el.onload = function () { finish('loaded'); };
      el.onerror = fail;
      el.src = p.url;
    }
    document.body.appendChild(el);
  }

  var BAITS = [
    { id: 'loc-ads',      label: 'baits/scripts/ads.js  (canRunAds)', kind: 'script', url: 'baits/scripts/ads.js' },
    { id: 'loc-pagead',   label: 'baits/pagead/ads.js  (паттерн /pagead/)', kind: 'script', url: 'baits/pagead/ads.js' },
    { id: 'loc-adsg',     label: 'baits/ad/adsbygoogle.js  (паттерн /ad/)', kind: 'script', url: 'baits/ad/adsbygoogle.js' },
    { id: 'loc-adframe',  label: 'baits/ads/adframe.js  (паттерн /ads/)', kind: 'script', url: 'baits/ads/adframe.js' },
    { id: 'loc-dt',       label: 'baits/ads/doubleclick/an.js  (doubleclick)', kind: 'script', url: 'baits/ads/doubleclick/an.js' },
    { id: 'loc-gsc',      label: 'baits/ads/googlesyndication/abp.js  (googlesyndication)', kind: 'script', url: 'baits/ads/googlesyndication/abp.js' },
    { id: 'loc-adv',      label: 'baits/adv/banner.gif  (паттерн /adv/)', kind: 'img', url: 'baits/adv/banner.gif' },
    { id: 'loc-banner',   label: 'baits/banner/rotator.gif  (паттерн /banner/)', kind: 'img', url: 'baits/banner/rotator.gif' },
    { id: 'net-adsbygoogle', label: 'pagead2.googlesyndication.com (script)', kind: 'script',
      url: 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js' },
    { id: 'net-gpt',      label: 'securepubads.g.doubleclick.net (gpt)', kind: 'script',
      url: 'https://securepubads.g.doubleclick.net/tag/js/gpt.js' },
    { id: 'net-gt',       label: 'googletagservices.com (gpt)', kind: 'script',
      url: 'https://www.googletagservices.com/tag/js/gpt.js' },
    { id: 'net-dc',       label: 'ad.doubleclick.net (img)', kind: 'img',
      url: 'https://ad.doubleclick.net/favicon.ico' },
    { id: 'net-gsc',      label: 'pagead2.googlesyndication.com (img)', kind: 'img',
      url: 'https://pagead2.googlesyndication.com/favicon.ico' },
  ];

  var COSMETIC = [
    { sel: '.adsbygoogle', label: 'div.adsbygoogle' },
    { sel: '#adBanner', label: 'div#adBanner' },
    { sel: '.ad-banner', label: 'div.ad-banner' },
    { sel: '#googlead_iframe', label: 'div#googlead_iframe' },
    { sel: '.adsbox', label: 'div.adsbox' },
    { sel: '.text_ad', label: 'p.text_ad' },
  ];

  function injectCosmetic() {
    var host = document.createElement('div');
    host.id = 'cos-host';
    host.innerHTML = '<div class="bait-row">' +
      '<div class="adsbygoogle">Рекламный блок adsbygoogle</div>' +
      '<div id="adBanner">Ad Banner</div>' +
      '<div class="ad-banner"><b>Ad</b> — баннер .ad-banner</div>' +
      '<div id="googlead_iframe">googlead_iframe</div>' +
      '<div class="adsbox">adsbox bait</div>' +
      '<p class="text_ad">text_ad: Sponsored контент</p>' +
      '</div>';
    var style = document.createElement('style');
    style.textContent = '#cos-host{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:14px 18px;margin:14px 0}#cos-host .bait-row{display:flex;flex-wrap:wrap;gap:12px}#cos-host .adsbygoogle,#cos-host #adBanner,#cos-host .ad-banner,#cos-host #googlead_iframe,#cos-host .adsbox,#cos-host .text_ad{background:#ffe9a8;color:#3b2a00;border:1px dashed #b78d00;padding:8px 12px;font-size:13px;margin:0}';
    document.head.appendChild(style);
    document.querySelector('.app').insertBefore(host, document.querySelector('.grid'));
  }

  function visible(el) {
    if (!el || !document.body.contains(el)) return false;
    var cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
    var r = el.getBoundingClientRect();
    return r.width >= 2 && r.height >= 2;
  }

  function checkCosmetic() {
    COSMETIC.forEach(function (b) {
      var el = document.querySelector(b.sel);
      set('cosmetic', 'cos-' + b.sel, b.label,
        el ? (visible(el) ? 'visible' : 'hidden') : 'removed');
    });
  }

  function runDetectors() {
    set('detector', 'det-canRunAds', 'canRunAds после baits/scripts/ads.js',
      typeof window.canRunAds === 'undefined' ? 'fired' : 'clear');
    set('detector', 'det-bootstrap', 'window.adsbygoogle после bootstrap.js',
      typeof window.adsbygoogle === 'undefined' ? 'fired' : 'clear');
    var gptOk = window.google && window.google.pubads;
    set('detector', 'det-gpt', 'window.google.pubads после gpt',
      gptOk ? 'clear' : 'fired');
    set('detector', 'det-adifyplus', 'window.adifyPlus заглушка',
      typeof window.adifyPlus === 'undefined' && state.get('network|net-gpt')
        && state.get('network|net-gpt').status === 'not-loaded' ? 'fired' : 'clear');
  }

  function showOverlays(cb) {
    var inter = document.createElement('div');
    inter.id = 'interstitial-ad';
    inter.style.cssText = 'position:fixed;inset:0;z-index:99998;background:rgba(20,20,20,.94);color:#fff;display:flex;align-items:center;justify-content:center;font-size:18px;text-align:center;padding:20px';
    inter.innerHTML = '<div><div style="font-size:11px;letter-spacing:.15em;color:#ffd83d;margin-bottom:8px">AD</div>Interstitial — полноэкранная тестовая реклама<br><span style="color:#8b949e;font-size:12px">(самозакрывающийся оверлей)</span></div>';
    document.body.appendChild(inter);

    var aab = document.createElement('div');
    aab.id = 'aab-bumper';
    aab.className = 'AAPS-300x250 aap-info';
    aab.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:99999;background:#ffd83d;border:1px solid #7a6200;padding:14px 18px;font-size:14px;border-radius:6px;color:#3b2a00';
    aab.innerHTML = 'AD — AAB bumper (имитация Ad Blocker Advisor)';
    document.body.appendChild(aab);

    setTimeout(function () {
      set('popup', 'ov-interstitial', 'Interstitial overlay', visible(inter) ? 'displayed' : 'suppressed');
      set('popup', 'ov-aab', 'AAB / bumper', visible(aab) ? 'displayed' : 'suppressed');
      var w = null;
      try { w = window.open('', 'adtestpopup', 'width=340,height=240'); } catch (e) { w = null; }
      set('popup', 'pop-window', 'window.open popup', w ? 'opened' : 'blocked');
      if (w) { try { w.document.write('<title>Ad</title><body style="font-family:Arial;background:#ffd83d;text-align:center;padding-top:40px"><b>Ad</b><p>Test popup</p></body>'); w.document.close(); } catch (e) {} setTimeout(function () { try { w.close(); } catch (e) {} }, 1500); }
      setTimeout(function () { inter.remove(); aab.remove(); cb(); }, 1600);
    }, 1200);
  }

  function computeVerdict() {
    var net = rowsOf('network');
    var det = rowsOf('detector');
    var cos = rowsOf('cosmetic');
    var pop = rowsOf('popup');

    var realNet = net.filter(function (r) { return r.id.indexOf('net-') === 0; });
    var localNet = net.filter(function (r) { return r.id.indexOf('loc-') === 0; });
    var netReachable = realNet.some(function (r) { return r.status === 'loaded'; });
    var decisiveReal = netReachable ? realNet : [];
    var blockedReal = decisiveReal.filter(function (r) { return r.status === 'not-loaded' || r.status === 'timeout'; });
    var blockedLocal = localNet.filter(function (r) { return r.status === 'not-loaded' || r.status === 'timeout'; });
    var firedDetLocal = det.filter(function (r) { return r.id === 'det-canRunAds' && r.status === 'fired'; });
    var firedDetInfo = netReachable ? det.filter(function (r) { return r.id !== 'det-canRunAds' && r.status === 'fired'; }) : [];
    var hiddenCos = cos.filter(function (r) { return r.status === 'hidden' || r.status === 'removed'; });
    var suppressedOverlays = pop.filter(function (r) { return r.status === 'suppressed'; });

    var scored = decisiveReal.concat(localNet,
      det.filter(function (r) { return r.id === 'det-canRunAds' || netReachable; }),
      cos, pop);
    var blocking = blockedReal.concat(blockedLocal, firedDetLocal, firedDetInfo, hiddenCos, suppressedOverlays);
    var score = scored.length ? Math.round((blocking.length / scored.length) * 100) : null;

    var state = 'waiting';
    var text = 'Подготовка…';
    var note = '';

    if (!done) {
      text = scored.length < 8 ? 'Тест выполняется…' : 'Частичные результаты…';
      state = 'partial';
    } else {
      var strong =
        firedDetLocal.length >= 1 ||
        blockedLocal.length >= 2 ||
        hiddenCos.length >= 4 ||
        suppressedOverlays.length >= 2;
      var hard = strong &&
        hiddenCos.length >= 4 &&
        (blockedLocal.length >= Math.max(2, localNet.length - 1) || firedDetLocal.length >= 1);

      if (hard) {
        state = 'hard';
        text = 'Блокировщик найден — жёсткий режим';
        note = 'Сетевые фильтры блокируют ресурсы, косметика скрывает ad-элементы, навязчивые форматы подавляются.';
      } else if (strong) {
        state = 'blocked';
        text = 'Блокировщик рекламы обнаружен';
        note = 'Заблокировано локальных приманок: ' + blockedLocal.length +
              '; скрыто ad-элементов: ' + hiddenCos.length +
              '; сработало детекторов: ' + (firedDetLocal.length + firedDetInfo.length) + '.';
      } else {
        state = 'clean';
        text = 'Блокировщик не обнаружен';
        note = 'Приманки загружаются, косметика не применяется, детекторы не сработали. ' +
              'Возможно, адблок отключён, в белом списке или вы зашли на домен github.io, ' +
              'куда некоторые списки фильтров не применяются.';
      }
    }

    if (!netReachable && realNet.length && done) {
      note += ' Дальние ad-домены (Google и т.п.) из этой сети недоступны — они исключены из оценки.';
    }
    return { state: state, text: text, note: note, score: score };
  }

  function renderRows(group) {
    var el = document.getElementById('rows-' + group);
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
    ['network', 'detector', 'cosmetic', 'popup'].forEach(renderRows);
    var v = computeVerdict();
    var st = document.getElementById('verdict-state');
    st.textContent = v.text;
    st.className = 'verdict-state ' + v.state;
    document.getElementById('verdict-note').textContent = v.note;
    document.getElementById('score-num').textContent = v.score === null ? '—' : v.score + '%';
  }

  function onlineControl(cb) {
    var img = new Image();
    img.onload = function () { online = true; cb(); };
    img.onerror = function () { online = false; cb(); };
    img.src = 'https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js?_=' + Date.now();
    setTimeout(function () { if (online === null) { online = true; cb(); } }, 8000);
  }

  function start() {
    state.clear();
    done = false;
    injectCosmetic();
    render();

    var remaining = BAITS.length + 1;
    function tick() {
      remaining -= 1;
      if (remaining === 0) finalize();
    }
    var origSet = set;
    set = function (g, i, l, s) {
      origSet(g, i, l, s);
      if (g === 'network') tick();
    };

    BAITS.forEach(probe);
    onlineControl(function () { origSet('meta', 'online', 'Доступ в интернет', online ? 'online' : 'offline'); tick(); });

    var safety = setTimeout(finalize, 20000);
    function finalize() {
      clearTimeout(safety);
      if (done) return;
      checkCosmetic();
      runDetectors();
      showOverlays(function () {
        done = true;
        set = origSet;
        origSet('meta', 'done', 'Набор проверок завершён', 'done');
        render();
      });
    }
  }

  document.getElementById('btn-rerun').onclick = function () {
    var h = document.getElementById('cos-host'); if (h) h.remove();
    var inter = document.getElementById('interstitial-ad'); if (inter) inter.remove();
    var aab = document.getElementById('aab-bumper'); if (aab) aab.remove();
    start();
  };
  start();
})();
