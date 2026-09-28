/* いま・つぎ／つたえるボード
   画面：ボードを選ぶ / いま・つぎ / つたえる / 支援者編集 / 印刷 / データの保存 / 使い方 / このアプリについて
   ユーザーが入力した文字は textContent でのみ表示し、HTMLとして扱わない。 */
'use strict';

var APP_VERSION = '1.0.0';
var BACKUP_FORMAT = 'imatsugi-tsutaeru-backup';
var LIMITS = { name: 20, hira: 20, kanji: 24, cards: 60, boards: 50, backupBytes: 300 * 1024 * 1024, imageBytes: 5 * 1024 * 1024 };

var S = {
  boards: [],
  urls: {},          // 写真ID → objectURL
  adultUntil: 0,     // 支援者メニューの確認を通った時刻＋有効時間
  tellPage: {},
  lastRoute: ''
};

var root = document.getElementById('app');

/* ---------- 小さな道具 ---------- */

function h(tag, props) {
  var el = document.createElement(tag);
  if (props) {
    Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'style' && typeof v === 'object') Object.keys(v).forEach(function (s) { el.style.setProperty(s, v[s]); });
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    });
  }
  for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
  return el;
}
function append(el, c) {
  if (c == null || c === false) return;
  if (Array.isArray(c)) { c.forEach(function (x) { append(el, x); }); return; }
  el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 保存できなくても動作に影響しない */ } }
function fmtBytes(n) {
  if (n == null) return '不明';
  if (n < 1024 * 1024) return Math.max(1, Math.round(n / 1024)) + 'KB';
  if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + 'MB';
  return (n / 1024 / 1024 / 1024).toFixed(1) + 'GB';
}

/* ---------- お知らせ・ダイアログ ---------- */

var noticeTimer = null;
function notify(msg, kind) {
  var box = document.getElementById('notice');
  box.textContent = '';
  box.className = 'notice show' + (kind ? ' ' + kind : '');
  box.appendChild(h('p', { text: msg }));
  box.appendChild(h('button', { type: 'button', class: 'btn small', onclick: function () { box.className = 'notice'; } }, '閉じる'));
  clearTimeout(noticeTimer);
  if (kind !== 'error') noticeTimer = setTimeout(function () { box.className = 'notice'; }, 7000);
}
function announce(msg) {
  var a = document.getElementById('announce');
  a.textContent = '';
  setTimeout(function () { a.textContent = msg; }, 30);
}
function errMsg(e) {
  if (e && e.appCode === 'quota') {
    return '保存できる容量が足りないため、保存できませんでした。今までのデータはそのまま残っています。写真の枚数を減らすか、バックアップを書き出してから使わないボードを消してください。';
  }
  if (e && e.appCode === 'nodb') {
    return 'このブラウザでは端末内に保存できません（プライベートモードや設定で保存が止められている可能性があります）。' + (e.message ? '（' + e.message + '）' : '');
  }
  return (e && e.message) || 'うまくいきませんでした';
}
function fail(e) { console.error(e); notify(errMsg(e), 'error'); }

var openModal = null;
function modal(opts) {
  closeModal();
  var lastFocus = document.activeElement;
  var titleId = 'm' + uid();
  var box = h('div', { class: 'modal' + (opts.wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId });
  box.appendChild(h('h2', { id: titleId, text: opts.title }));
  var body = h('div', { class: 'modal-body' });
  append(body, opts.body);
  box.appendChild(body);
  var bar = h('div', { class: 'modal-actions' });
  (opts.actions || [{ label: '閉じる' }]).forEach(function (a) {
    var b = h('button', { type: 'button', class: 'btn' + (a.primary ? ' primary' : '') + (a.danger ? ' danger' : ''), disabled: a.disabled },
      a.label);
    b.addEventListener('click', function () {
      var r = a.onClick ? a.onClick(b) : undefined;
      if (r !== false) closeModal();
    });
    if (a.id) b.id = a.id;
    bar.appendChild(b);
  });
  box.appendChild(bar);
  var back = h('div', { class: 'modal-back' }, box);
  back.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') { ev.preventDefault(); closeModal(); }
    if (ev.key === 'Tab') {
      var f = box.querySelectorAll('button:not([disabled]), input:not([disabled]), select, textarea, [tabindex="0"]');
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
    }
  });
  document.body.appendChild(back);
  openModal = { el: back, lastFocus: lastFocus, onClose: opts.onClose };
  var ff = box.querySelector(opts.focus || 'input, button');
  if (ff) ff.focus();
  return box;
}
function closeModal() {
  if (!openModal) return;
  var m = openModal;
  openModal = null;
  m.el.remove();
  if (m.onClose) m.onClose();
  if (m.lastFocus && document.body.contains(m.lastFocus)) m.lastFocus.focus();
}
function confirmBox(title, text, okLabel, onOk, danger) {
  modal({
    title: title,
    body: h('p', { text: text }),
    actions: [{ label: 'やめる' }, { label: okLabel, primary: !danger, danger: danger, onClick: onOk }],
    focus: '.modal-actions button'
  });
}

/* ---------- 支援者メニューへの確認（誤って編集画面に入らないように） ---------- */

function requireAdult(next, onCancel) {
  if (Date.now() < S.adultUntil) { next(); return; }
  var passed = false;
  var seq = [];
  while (seq.length < 3) {
    var n = 1 + Math.floor(Math.random() * 9);
    if (seq.indexOf(n) < 0) seq.push(n);
  }
  var pressed = [];
  var status = h('p', { class: 'gate-status', 'aria-live': 'polite', text: '0 / 3' });
  var pad = h('div', { class: 'keypad' });
  for (var i = 1; i <= 9; i++) {
    (function (n) {
      pad.appendChild(h('button', {
        type: 'button', class: 'btn key', onclick: function () {
          pressed.push(n);
          if (pressed[pressed.length - 1] !== seq[pressed.length - 1]) {
            pressed = [];
            status.textContent = 'ちがう順番でした。もう一度はじめから押してください。';
            return;
          }
          status.textContent = pressed.length + ' / 3';
          if (pressed.length === 3) {
            S.adultUntil = Date.now() + 10 * 60 * 1000;
            passed = true;
            closeModal();
            next();
          }
        }
      }, String(n)));
    })(i);
  }
  modal({
    title: 'おとなのかたへ',
    body: [
      h('p', { text: '支援者メニュー（編集・印刷・ボードの切り替え）を開きます。' }),
      h('p', { class: 'gate-seq' }, '数字を順番に押してください：', h('strong', { text: seq.join(' → ') })),
      pad, status,
      h('p', { class: 'hint', text: '一度開くと10分間は確認を省きます。' })
    ],
    actions: [{ label: 'やめる' }],
    focus: '.keypad button',
    onClose: function () { if (!passed && onCancel) onCancel(); }
  });
}

/* ---------- ボードとカード ---------- */

function findBoard(id) { for (var i = 0; i < S.boards.length; i++) if (S.boards[i].id === id) return S.boards[i]; return null; }

function libCard(key) {
  var L = LIB_BY_KEY[key];
  return { id: uid(), key: key, hira: L.hira, kanji: L.kanji, img: { type: 'lib', key: key } };
}

function uniqueName(base) {
  var name = base, n = 2;
  var names = S.boards.map(function (b) { return b.name; });
  while (names.indexOf(name) >= 0) name = base + '（' + (n++) + '）';
  return name.slice(0, LIMITS.name + 6);
}

function makeBoard(sampleKey) {
  var sm = sampleKey ? SAMPLES[sampleKey] : null;
  var now = Date.now();
  return {
    id: uid(),
    name: uniqueName(sm ? sm.name : 'あたらしいボード'),
    createdAt: now, updatedAt: now,
    pos: 0,
    schedule: sm ? sm.schedule.map(libCard) : [],
    requests: sm ? sm.requests.map(libCard) : ['rest', 'help', 'no', 'toilet'].map(libCard),
    settings: Object.assign({}, DEFAULT_SETTINGS, sm ? sm.settings : {})
  };
}

function saveBoard(b) {
  b.updatedAt = Date.now();
  return DB.putBoard(b).catch(function (e) { fail(e); throw e; });
}

function reloadBoards() {
  return DB.boards().then(function (list) {
    list.sort(function (a, b) { return (a.createdAt || 0) - (b.createdAt || 0); });
    S.boards = list;
  });
}

// どのボードからも使われていない写真を消す
function gcImages() {
  var used = {};
  S.boards.forEach(function (b) {
    b.schedule.concat(b.requests).forEach(function (c) { if (c.img && c.img.type === 'photo') used[c.img.id] = true; });
  });
  return DB.imageIds().then(function (ids) {
    var del = ids.filter(function (id) { return !used[id]; });
    del.forEach(function (id) { if (S.urls[id]) { URL.revokeObjectURL(S.urls[id]); delete S.urls[id]; } });
    return DB.deleteImages(del);
  }).catch(function (e) { console.warn('gc', e); });
}

function ensureImages(cards) {
  var need = [];
  cards.forEach(function (c) { if (c.img && c.img.type === 'photo' && !S.urls[c.img.id] && need.indexOf(c.img.id) < 0) need.push(c.img.id); });
  return Promise.all(need.map(function (id) {
    return DB.image(id).then(function (rec) {
      if (rec) S.urls[id] = URL.createObjectURL(new Blob([rec.data], { type: rec.type || 'image/jpeg' }));
    });
  }));
}

/* ---------- 表記（子ども向けの言葉） ---------- */

var WORDS = {
  now: ['いま', '今'], next: ['つぎ', '次'], done: ['おわった', '終わった'], back: ['もどす', '戻す'],
  tell: ['つたえる', '伝える'], close: ['とじる', '閉じる'], allDone: ['ぜんぶ おわり', '全部 終わり'],
  none: ['なし', 'なし'], prevPage: ['まえの カード', '前の カード'], nextPage: ['つぎの カード', '次の カード'],
  toNow: ['いま・つぎ に もどる', '今・次 に 戻る'], read: ['よむ', '読む'], doneMark: ['おわり', '終わり']
};
function W(b, key) { return WORDS[key][b && b.settings.script === 'kanji' ? 1 : 0]; }

function cardText(c, b) {
  if (b.settings.script === 'kanji' && c.kanji) return c.kanji;
  return c.hira || c.kanji || '';
}
function cardSrc(c, b) {
  if (!c.img || c.img.type === 'none') return null;
  if (c.img.type === 'photo') return S.urls[c.img.id] || null;
  var L = LIB_BY_KEY[c.img.key];
  if (!L) return null;
  return libSrc(L, b.settings.pictStyle);
}
function libSrc(L, style) {
  if (style === 'illust' && L.illust) return 'assets/illust/' + L.illust + '.jpg';
  return 'assets/pict/' + L.pict + '.svg';
}

function cardNode(c, b, cls) {
  var text = cardText(c, b);
  var src = b.settings.show === 'text' ? null : cardSrc(c, b);
  var el = h('div', { class: 'card ' + (cls || '') + (src ? '' : ' textonly') });
  if (src) el.appendChild(h('div', { class: 'card-img' }, h('img', { src: src, alt: '', draggable: 'false' })));
  // 2行までに収まる大きさにするため、1行あたりの文字数（半分・切り上げ）をCSSに渡す
  el.appendChild(h('div', { class: 'card-text', text: text, style: { '--half': String(Math.max(1, Math.ceil(text.length / 2))) } }));
  return el;
}

function applyTheme(b) {
  var s = b ? b.settings : { theme: 'white', look: 'older', fontScale: 1 };
  document.body.className = 'theme-' + s.theme + ' look-' + s.look + (b ? ' board' : ' adult');
  document.documentElement.style.setProperty('--fs', String(s.fontScale || 1));
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', getComputedStyle(document.body).getPropertyValue('--bg').trim() || '#f4f6f8');
}

/* ---------- 読み上げ（任意・初期は無音） ---------- */

function jaVoices() {
  if (!('speechSynthesis' in window)) return [];
  return speechSynthesis.getVoices().filter(function (v) { return /^ja/i.test(v.lang); });
}
function speak(b, text) {
  if (!b.settings.speech || !('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP';
    var v = jaVoices();
    if (v.length) u.voice = v[0];
    u.rate = 0.9;
    speechSynthesis.speak(u);
  } catch (e) { /* 音声が使えなくても何もしない */ }
}

/* ---------- ルーティング ---------- */

function route() {
  closeModal();
  if ('speechSynthesis' in window) { try { speechSynthesis.cancel(); } catch (e) { /* */ } }
  var p = (location.hash || '#/').replace(/^#/, '').split('/').filter(Boolean);
  window.scrollTo(0, 0);
  if (p[0] === 'b' && p[1]) {
    var b = findBoard(p[1]);
    if (!b) { go('#/'); return; }
    lsSet('lastBoard', b.id);
    var cards = b.schedule.concat(b.requests);
    ensureImages(cards).then(function () {
      if (p[2] === 'tell') return viewTell(b);
      if (p[2] === 'edit') return guardAdult(b, function () { viewEdit(b, p[3] || 'schedule'); });
      if (p[2] === 'print') return guardAdult(b, function () { viewPrint(b); });
      viewNow(b);
    }).catch(fail);
    return;
  }
  if (p[0] === 'data') return viewData();
  if (p[0] === 'about') return viewAbout();
  if (p[0] === 'help') return viewHelp();
  viewList();
}

function guardAdult(b, next) {
  if (Date.now() < S.adultUntil) { next(); return; }
  viewNow(b);
  requireAdult(next, function () { history.replaceState(null, '', '#/b/' + b.id); });
}

function screen(cls) {
  root.textContent = '';
  var el = h('div', { class: 'screen ' + cls });
  root.appendChild(el);
  return el;
}

function adultHeader(title, backHash, backLabel) {
  return h('header', { class: 'adult-head' },
    backHash ? h('a', { class: 'btn small', href: backHash }, '← ' + (backLabel || '戻る')) : null,
    h('h1', { text: title }));
}

/* ---------- ボードを選ぶ ---------- */

function viewList() {
  applyTheme(null);
  document.title = 'いま・つぎ／つたえるボード';
  var el = screen('list');
  el.appendChild(h('header', { class: 'app-head' },
    h('h1', { text: 'いま・つぎ／つたえるボード' }),
    h('p', { class: 'lead', text: '予定の見通しと「きもち・お願い」を、絵や写真のカードで伝えるための無料ツールです。' })));

  var last = lsGet('lastBoard');
  if (S.boards.length) {
    el.appendChild(h('h2', { text: 'ボードを選ぶ' }));
    var ul = h('ul', { class: 'board-list' });
    S.boards.forEach(function (b) {
      var cur = b.schedule[b.pos];
      var thumbs = h('span', { class: 'thumbs', 'aria-hidden': 'true' });
      b.schedule.slice(0, 4).forEach(function (c) {
        var src = cardSrc(c, b);
        thumbs.appendChild(src ? h('img', { src: src, alt: '' }) : h('span', { class: 'thumb-text', text: cardText(c, b).slice(0, 2) }));
      });
      ul.appendChild(h('li', null,
        h('a', { class: 'board-open', href: '#/b/' + b.id },
          thumbs,
          h('span', { class: 'board-name', text: b.name }),
          h('span', { class: 'board-sub', text: (b.id === last ? '前回使ったボード・' : '') + (cur ? 'いま：' + cardText(cur, b) : (b.schedule.length ? '予定はすべて終わり' : '予定のカードなし')) + '・つたえるカード' + b.requests.length + '枚' })),
        h('button', { type: 'button', class: 'btn small', onclick: function () { requireAdult(function () { go('#/b/' + b.id + '/edit'); }); } }, '編集')));
    });
    el.appendChild(ul);
    // 写真の読み込み後にサムネイルを出し直す
    var photoCards = [];
    S.boards.forEach(function (b) { photoCards = photoCards.concat(b.schedule.slice(0, 4)); });
    if (photoCards.some(function (c) { return c.img && c.img.type === 'photo' && !S.urls[c.img.id]; })) {
      ensureImages(photoCards).then(function () { if (location.hash === '' || location.hash === '#/') viewList(); });
    }
  } else {
    el.appendChild(h('section', { class: 'intro' },
      h('h2', { text: 'はじめに' }),
      h('p', { text: 'まずサンプルを1つ選んでください。あとから言葉・写真・並び順・見た目を、お子さんに合わせて変えられます。' }),
      h('p', { class: 'hint', text: '氏名・生年月日・診断名の入力は不要です。ボードの名前はニックネームにしてください。データはこの端末の中だけに保存され、外部には送信されません。' })));
  }

  el.appendChild(h('h2', { text: S.boards.length ? 'ボードを追加' : 'サンプルを選んで始める' }));
  var add = h('div', { class: 'sample-grid' });
  Object.keys(SAMPLES).forEach(function (k) {
    var sm = SAMPLES[k];
    add.appendChild(h('button', { type: 'button', class: 'sample', onclick: function () { createBoard(k); } },
      h('strong', { text: sm.label }), h('span', { text: sm.desc })));
  });
  add.appendChild(h('button', { type: 'button', class: 'sample', onclick: function () { createBoard(null); } },
    h('strong', { text: '空のボード' }), h('span', { text: '予定なし・つたえるカード4枚から作る' })));
  el.appendChild(add);

  el.appendChild(h('nav', { class: 'foot-links' },
    h('a', { href: '#/help' }, '使い方'),
    h('a', { href: '#/data' }, 'データの保存・バックアップ'),
    h('a', { href: '#/about' }, 'このアプリについて（素材・問い合わせ）')));
  el.appendChild(offlineLine());
}

function createBoard(k) {
  if (S.boards.length >= LIMITS.boards) { notify('ボードは' + LIMITS.boards + '個までです。使わないボードを消してから追加してください。', 'error'); return; }
  var b = makeBoard(k);
  saveBoard(b).then(function () {
    S.boards.push(b);
    S.adultUntil = Math.max(S.adultUntil, Date.now() + 10 * 60 * 1000);
    notify('「' + b.name + '」を作りました。言葉や写真を変えるときは「支援者メニュー」から編集します。');
    go('#/b/' + b.id + '/edit');
  }).catch(function () { /* fail() で通知済み */ });
}

function offlineLine() {
  var p = h('p', { class: 'offline-line' });
  p.textContent = offlineStatus().short;
  return p;
}
function offlineStatus() {
  if (location.protocol === 'file:') {
    return { ok: false, short: 'ファイルから直接開いています。通信なしで動きますが、ホーム画面への追加はできません。',
      long: 'ファイルから直接開いています。アプリは通信なしで動きます。ただし、ブラウザによっては保存したデータが消えやすい場合があるため、公開版のURLで使うか、こまめにバックアップを書き出してください。' };
  }
  if (!('serviceWorker' in navigator)) {
    return { ok: false, short: 'このブラウザは通信なしでの起動に対応していません。', long: 'このブラウザは、通信なしでアプリを起動する仕組み（Service Worker）に対応していません。通信のある状態で使ってください。' };
  }
  if (navigator.serviceWorker.controller) {
    return { ok: true, short: 'この端末に保存済み：通信がなくても開けます。', long: 'アプリ本体はこの端末に保存済みです。同じブラウザ・同じURLなら、通信がなくても開けます。' };
  }
  return { ok: false, short: '通信なしで使う準備中です。数秒待ってから再読み込みしてください。',
    long: 'まだ通信なしで開く準備ができていません。通信のある状態で一度開き、数秒待ってから再読み込みすると、以後は通信なしで開けます。' };
}

/* ---------- いま・つぎ ---------- */

function viewNow(b) {
  applyTheme(b);
  document.title = b.name + '｜いま・つぎ';
  var s = b.settings;
  var el = screen('now');
  var total = b.schedule.length;
  var cur = b.schedule[b.pos], nxt = b.schedule[b.pos + 1];

  el.appendChild(h('header', { class: 'kid-head' },
    h('button', { type: 'button', class: 'btn adult-btn', onclick: function () { requireAdult(function () { adultMenu(b); }); } },
      h('span', { class: 'ico', 'aria-hidden': 'true', text: '⚙' }), '支援者メニュー'),
    h('span', { class: 'board-label', text: b.name }),
    h('a', { class: 'btn tell-btn', href: '#/b/' + b.id + '/tell' },
      h('img', { src: 'assets/pict/trouble.svg', alt: '', class: 'tell-ico' }), W(b, 'tell'))));

  var main = h('main', { class: 'nowgrid' });
  if (!total) {
    main.appendChild(h('div', { class: 'empty' },
      h('p', { text: '予定のカードがありません。' }),
      h('p', { class: 'hint', text: '支援者メニュー →「予定（いま・つぎ）」からカードを追加してください。「つたえる」は右上からいつでも使えます。' })));
  } else {
    var nowFrame = h('section', { class: 'frame frame-now', 'aria-label': W(b, 'now') },
      h('div', { class: 'frame-label' }, W(b, 'now')));
    if (cur) {
      var cn = cardNode(cur, b, 'big');
      if (s.speech) {
        cn = h('button', { type: 'button', class: 'card-btn', 'aria-label': cardText(cur, b) + '（' + W(b, 'read') + '）', onclick: function () { speak(b, cardText(cur, b)); } }, cn);
      }
      nowFrame.appendChild(cn);
    } else {
      nowFrame.appendChild(cardNode({ hira: 'ぜんぶ おわり', kanji: '全部 終わり', img: { type: 'lib', key: 'end' } }, b, 'big'));
    }
    var nextFrame = h('section', { class: 'frame frame-next', 'aria-label': W(b, 'next') },
      h('div', { class: 'frame-label' }, W(b, 'next')));
    nextFrame.appendChild(nxt ? cardNode(nxt, b, 'mid') : h('div', { class: 'card textonly mid nonext' }, h('div', { class: 'card-text', text: W(b, 'none') })));
    main.appendChild(nowFrame);
    main.appendChild(nextFrame);
  }
  el.appendChild(main);

  if (s.showAll && total) {
    var ol = h('ol', { class: 'strip', 'aria-label': '予定の一覧' });
    b.schedule.forEach(function (c, i) {
      var state = i < b.pos ? 'done' : (i === b.pos ? 'cur' : 'todo');
      var src = s.show === 'text' ? null : cardSrc(c, b);
      ol.appendChild(h('li', { class: 'strip-item ' + state, 'aria-current': state === 'cur' ? 'step' : null },
        src ? h('img', { src: src, alt: '' }) : null,
        h('span', { class: 'strip-text', text: cardText(c, b) }),
        state === 'done' ? h('span', { class: 'mark', text: '✓ ' + W(b, 'doneMark') }) : null,
        state === 'cur' ? h('span', { class: 'mark', text: '▶ ' + W(b, 'now') }) : null));
    });
    el.appendChild(ol);
  }

  var foot = h('footer', { class: 'kid-foot' });
  foot.appendChild(h('button', { type: 'button', class: 'btn back-btn', disabled: b.pos <= 0, onclick: function () { step(b, -1); } },
    h('span', { 'aria-hidden': 'true', text: '↶ ' }), W(b, 'back')));
  if (cur) {
    if (s.completer === 'child') {
      foot.appendChild(h('button', { type: 'button', class: 'btn primary done-btn', onclick: function () { step(b, 1); } },
        h('span', { 'aria-hidden': 'true', text: '✓ ' }), W(b, 'done')));
    } else {
      foot.appendChild(h('button', { type: 'button', class: 'btn adult-next', onclick: function () { step(b, 1); } },
        'つぎへ進める（おとな）'));
    }
  }
  el.appendChild(foot);
}

function step(b, d) {
  var np = Math.max(0, Math.min(b.schedule.length, b.pos + d));
  if (np === b.pos) return;
  b.pos = np;
  saveBoard(b).catch(function () { /* 通知済み */ });
  viewNow(b);
  var cur = b.schedule[b.pos];
  announce(cur ? W(b, 'now') + '：' + cardText(cur, b) : W(b, 'allDone'));
  if (cur) speak(b, cardText(cur, b));
  var focusSel = d > 0 ? '.done-btn, .adult-next, .back-btn' : '.back-btn:not([disabled]), .done-btn, .adult-next';
  var f = root.querySelector(focusSel);
  if (f) f.focus();
}

function adultMenu(b) {
  modal({
    title: '支援者メニュー',
    body: h('div', { class: 'menu-list' },
      h('a', { class: 'btn', href: '#/b/' + b.id + '/edit/schedule', onclick: closeModal }, '予定（いま・つぎ）を編集'),
      h('a', { class: 'btn', href: '#/b/' + b.id + '/edit/requests', onclick: closeModal }, 'つたえるカードを編集'),
      h('a', { class: 'btn', href: '#/b/' + b.id + '/edit/look', onclick: closeModal }, '見た目と操作を調整'),
      h('a', { class: 'btn', href: '#/b/' + b.id + '/print', onclick: closeModal }, 'カードを印刷'),
      h('button', { type: 'button', class: 'btn', disabled: b.pos === 0, onclick: function () { b.pos = 0; saveBoard(b); closeModal(); viewNow(b); announce('予定を はじめから にしました'); } }, '予定をはじめからにする'),
      h('a', { class: 'btn', href: '#/', onclick: closeModal }, 'ほかのボードに切り替える')),
    actions: [{ label: '閉じる' }]
  });
}

/* ---------- つたえる ---------- */

function viewTell(b) {
  applyTheme(b);
  document.title = b.name + '｜つたえる';
  var s = b.settings;
  var el = screen('tell');
  var per = s.choices, n = b.requests.length;
  var pages = Math.max(1, Math.ceil(n / per));
  var page = Math.min(S.tellPage[b.id] || 0, pages - 1);

  el.appendChild(h('header', { class: 'kid-head' },
    h('a', { class: 'btn back-now', href: '#/b/' + b.id }, h('span', { 'aria-hidden': 'true', text: '← ' }), W(b, 'toNow')),
    h('h1', { class: 'tell-title', text: W(b, 'tell') })));

  var grid = h('main', { class: 'tellgrid c' + per });
  if (!n) {
    grid.appendChild(h('p', { class: 'empty', text: 'つたえるカードがありません。支援者メニューから追加してください。' }));
  }
  b.requests.slice(page * per, page * per + per).forEach(function (c) {
    grid.appendChild(h('button', { type: 'button', class: 'card-btn', 'aria-label': cardText(c, b), onclick: function () { showBig(b, c); } },
      cardNode(c, b, 'tile')));
  });
  el.appendChild(grid);

  if (pages > 1) {
    el.appendChild(h('footer', { class: 'kid-foot pager' },
      h('button', { type: 'button', class: 'btn', disabled: page === 0, onclick: function () { S.tellPage[b.id] = page - 1; viewTell(b); } }, '← ' + W(b, 'prevPage')),
      h('span', { class: 'page-no', text: (page + 1) + ' / ' + pages }),
      h('button', { type: 'button', class: 'btn', disabled: page >= pages - 1, onclick: function () { S.tellPage[b.id] = page + 1; viewTell(b); } }, W(b, 'nextPage') + ' →')));
  }
}

function showBig(b, c) {
  var lastFocus = document.activeElement;
  var ov = h('div', { class: 'big-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': cardText(c, b) });
  ov.appendChild(cardNode(c, b, 'huge'));
  var bar = h('div', { class: 'big-actions' });
  if (b.settings.speech) bar.appendChild(h('button', { type: 'button', class: 'btn', onclick: function () { speak(b, cardText(c, b)); } }, W(b, 'read')));
  var closeBtn = h('button', { type: 'button', class: 'btn primary close-big', onclick: close }, W(b, 'close'));
  bar.appendChild(closeBtn);
  ov.appendChild(bar);
  function close() {
    ov.remove();
    document.removeEventListener('keydown', onKey);
    if (lastFocus && document.body.contains(lastFocus)) lastFocus.focus();
  }
  function onKey(ev) { if (ev.key === 'Escape') close(); if (ev.key === 'Tab') { ev.preventDefault(); (document.activeElement === closeBtn && bar.firstChild !== closeBtn ? bar.firstChild : closeBtn).focus(); } }
  document.addEventListener('keydown', onKey);
  document.body.appendChild(ov);
  closeBtn.focus();
  speak(b, cardText(c, b));
}

/* ---------- 支援者編集 ---------- */

var TABS = [
  ['schedule', '予定（いま・つぎ）'],
  ['requests', 'つたえるカード'],
  ['look', '見た目と操作'],
  ['board', 'ボード']
];

function viewEdit(b, tab) {
  applyTheme(b);
  document.title = b.name + '｜支援者メニュー';
  var el = screen('edit');
  el.appendChild(h('header', { class: 'adult-head' },
    h('a', { class: 'btn small', href: '#/b/' + b.id }, '← いま・つぎ（子ども用画面）に戻る'),
    h('h1', null, '支援者メニュー：', h('span', { text: b.name })),
    h('a', { class: 'btn small', href: '#/b/' + b.id + '/print' }, 'カードを印刷')));
  var nav = h('nav', { class: 'tabs', 'aria-label': '編集する項目' });
  TABS.forEach(function (t) {
    nav.appendChild(h('a', { class: 'tab' + (t[0] === tab ? ' on' : ''), href: '#/b/' + b.id + '/edit/' + t[0], 'aria-current': t[0] === tab ? 'page' : null }, t[1]));
  });
  el.appendChild(nav);
  var body = h('div', { class: 'edit-body' });
  el.appendChild(body);
  if (tab === 'requests') editCards(b, 'requests', body);
  else if (tab === 'look') editLook(b, body);
  else if (tab === 'board') editBoard(b, body);
  else editCards(b, 'schedule', body);
}

function editCards(b, listKey, body) {
  var isSched = listKey === 'schedule';
  var list = b[listKey];
  if (isSched) {
    body.appendChild(h('p', { class: 'hint', text: '上から順に「いま」「つぎ」に出ます。並べ替えは「↑」「↓」ボタン（パソコンではドラッグも可）。「ここをいまに」で途中から始められます。' }));
  } else {
    body.appendChild(h('div', { class: 'callout' },
      h('strong', { text: 'つたえるカードの使い方' }),
      h('p', { text: 'お子さんがカードを選んだら、まず「〇〇なんだね」と受け止めてください。「やすみたい」「いや」も大切な意思表示です。予定の進み具合や約束と引きかえにせず、できる範囲で応じ方を一緒に考えます。' })));
    body.appendChild(h('p', { class: 'hint', text: '子ども用画面には「見た目と操作」で決めた枚数（いまは' + b.settings.choices + '枚）ずつ出ます。多いときは「つぎのカード」でめくります。' }));
  }
  var ul = h('ol', { class: 'card-rows' });
  var dragFrom = null;
  list.forEach(function (c, i) {
    var src = cardSrc(c, b);
    var li = h('li', { class: 'card-row', draggable: 'true' });
    li.addEventListener('dragstart', function (ev) { dragFrom = i; li.classList.add('dragging'); try { ev.dataTransfer.setData('text/plain', String(i)); } catch (e) { /* */ } });
    li.addEventListener('dragend', function () { li.classList.remove('dragging'); });
    li.addEventListener('dragover', function (ev) { ev.preventDefault(); li.classList.add('over'); });
    li.addEventListener('dragleave', function () { li.classList.remove('over'); });
    li.addEventListener('drop', function (ev) { ev.preventDefault(); li.classList.remove('over'); if (dragFrom != null && dragFrom !== i) moveCard(b, listKey, dragFrom, i); dragFrom = null; });
    var state = '';
    if (isSched) state = i < b.pos ? '終わり' : (i === b.pos ? 'いま' : (i === b.pos + 1 ? 'つぎ' : ''));
    li.appendChild(h('span', { class: 'num', text: String(i + 1) }));
    li.appendChild(h('span', { class: 'row-thumb' }, src && b.settings.show !== 'text' ? h('img', { src: src, alt: '' }) : h('span', { text: '文字' })));
    li.appendChild(h('span', { class: 'row-text' }, h('span', { text: cardText(c, b) }), state ? h('span', { class: 'state', text: state }) : null));
    var tools = h('span', { class: 'row-tools' },
      h('button', { type: 'button', class: 'btn icon', disabled: i === 0, 'aria-label': cardText(c, b) + 'を上へ', onclick: function () { moveCard(b, listKey, i, i - 1); } }, '↑'),
      h('button', { type: 'button', class: 'btn icon', disabled: i === list.length - 1, 'aria-label': cardText(c, b) + 'を下へ', onclick: function () { moveCard(b, listKey, i, i + 1); } }, '↓'),
      isSched && i !== b.pos ? h('button', { type: 'button', class: 'btn small', onclick: function () { b.pos = i; saveBoard(b).then(function () { notify('「' + cardText(c, b) + '」を「いま」にしました。'); route(); }); } }, 'ここをいまに') : null,
      h('button', { type: 'button', class: 'btn small', onclick: function () { cardEditor(b, listKey, i); } }, '編集'),
      h('button', { type: 'button', class: 'btn small danger-text', onclick: function () {
        confirmBox('カードを削除', '「' + cardText(c, b) + '」をこのボードから削除します。', '削除する', function () {
          list.splice(i, 1);
          if (isSched && i < b.pos) b.pos--;
          if (isSched) b.pos = Math.min(b.pos, list.length);
          saveBoard(b).then(gcImages).then(route);
        }, true);
      } }, '削除'));
    li.appendChild(tools);
    ul.appendChild(li);
  });
  body.appendChild(ul);
  if (!list.length) body.appendChild(h('p', { class: 'empty', text: 'カードがありません。下のボタンから追加してください。' }));
  body.appendChild(h('div', { class: 'row-add' },
    h('button', { type: 'button', class: 'btn primary', disabled: list.length >= LIMITS.cards, onclick: function () { pickLibrary(b, listKey); } }, '＋ カードを追加'),
    h('span', { class: 'hint', text: list.length + '枚（最大' + LIMITS.cards + '枚）' })));
}

function moveCard(b, listKey, from, to) {
  var list = b[listKey];
  if (to < 0 || to >= list.length) return;
  var curId = listKey === 'schedule' && b.schedule[b.pos] ? b.schedule[b.pos].id : null;
  var item = list.splice(from, 1)[0];
  list.splice(to, 0, item);
  if (curId) b.pos = list.findIndex(function (c) { return c.id === curId; });
  saveBoard(b).then(function () {
    route();
    var rows = root.querySelectorAll('.card-row');
    var btn = rows[to] && rows[to].querySelector(to > from ? '.btn.icon:nth-child(2)' : '.btn.icon');
    if (btn && !btn.disabled) btn.focus();
    announce('「' + cardText(item, b) + '」を' + (to + 1) + '番目にしました');
  });
}

function pickLibrary(b, listKey, onPickImageOnly) {
  var kind = listKey === 'schedule' ? 'activity' : 'request';
  var style = b.settings.pictStyle;
  var picked = false;
  function grid(items) {
    var g = h('div', { class: 'lib-grid' });
    items.forEach(function (L) {
      g.appendChild(h('button', { type: 'button', class: 'lib-item', onclick: function () {
        picked = true;
        closeModal();
        if (onPickImageOnly) { onPickImageOnly(L.key); return; }
        b[listKey].push(libCard(L.key));
        saveBoard(b).then(function () { route(); notify('「' + cardText(b[listKey][b[listKey].length - 1], b) + '」を追加しました。'); });
      } }, h('img', { src: libSrc(L, style), alt: '' }), h('span', { text: b.settings.script === 'kanji' ? L.kanji : L.hira })));
    });
    return g;
  }
  var main = LIB.filter(function (L) { return L.kind === kind; });
  var other = LIB.filter(function (L) { return L.kind !== kind; });
  modal({
    title: onPickImageOnly ? '絵を選ぶ' : 'カードを追加',
    wide: true,
    body: [
      onPickImageOnly ? null : h('button', { type: 'button', class: 'btn primary', onclick: function () { picked = true; closeModal(); cardEditor(b, listKey, -1); } }, '＋ 自分で作る（写真と言葉を入れる）'),
      h('h3', { text: kind === 'activity' ? '予定に使うカード' : 'きもち・お願いのカード' }), grid(main),
      h('h3', { text: 'ほかのカード' }), grid(other)
    ],
    actions: [{ label: 'やめる' }],
    onClose: function () { if (!picked && onPickImageOnly) setTimeout(function () { onPickImageOnly(null); }, 0); }
  });
}

/* カード編集：言葉・絵／写真・切り抜き */
function cardEditor(b, listKey, index) {
  var isNew = index < 0;
  var orig = isNew ? { id: uid(), hira: '', kanji: '', img: { type: 'none' } } : b[listKey][index];
  var draft = clone(orig);
  var photo = null;            // 新しく選んだ写真（作業用canvas）
  var crop = { zoom: 1, cx: 0.5, cy: 0.5, rot: 0 };
  var mode = draft.img.type;   // lib / photo / none
  var libKey = draft.img.type === 'lib' ? draft.img.key : (draft.key || null);

  var preview = h('div', { class: 'editor-preview' });
  var hiraIn = h('input', { type: 'text', id: 'f-hira', maxlength: LIMITS.hira, value: draft.hira || '', autocomplete: 'off' });
  var kanjiIn = h('input', { type: 'text', id: 'f-kanji', maxlength: LIMITS.kanji, value: draft.kanji || '', autocomplete: 'off' });
  var errBox = h('p', { class: 'form-error', role: 'alert' });
  var cropBox = h('div', { class: 'crop-box' });
  var fileIn = h('input', { type: 'file', accept: 'image/*', class: 'visually-hidden', id: 'f-photo' });
  var camIn = h('input', { type: 'file', accept: 'image/*', capture: 'environment', class: 'visually-hidden', id: 'f-camera' });

  function currentCard() {
    var c = { hira: hiraIn.value.trim(), kanji: kanjiIn.value.trim(), img: { type: 'none' } };
    if (mode === 'lib' && libKey) c.img = { type: 'lib', key: libKey };
    return c;
  }
  function renderPreview() {
    preview.textContent = '';
    var c = currentCard();
    if (!c.hira && !c.kanji) c.hira = '（ことば）';
    var node;
    if (mode === 'photo') {
      node = h('div', { class: 'card tile' + (b.settings.show === 'text' ? ' textonly' : '') });
      if (b.settings.show !== 'text') {
        var cv = h('canvas', { width: 320, height: 320, class: 'crop-canvas', 'aria-label': '切り抜きの確認' });
        if (photo) Photo.draw(cv.getContext('2d'), photo, crop, 320);
        else if (draft.img.type === 'photo' && S.urls[draft.img.id]) node.appendChild(h('div', { class: 'card-img' }, h('img', { src: S.urls[draft.img.id], alt: '' })));
        if (photo) { node.appendChild(h('div', { class: 'card-img' }, cv)); bindDrag(cv); }
      }
      node.appendChild(h('div', { class: 'card-text', text: cardText(c, b) }));
    } else {
      node = cardNode(c, b, 'tile');
    }
    preview.appendChild(node);
    preview.appendChild(h('p', { class: 'hint', text: '子ども用画面と印刷は、この見た目になります' + (b.settings.show === 'text' ? '（いまは「文字だけ」表示の設定です）' : '') + '。' }));
  }
  function bindDrag(cv) {
    var start = null;
    cv.addEventListener('pointerdown', function (ev) { start = { x: ev.clientX, y: ev.clientY, cx: crop.cx, cy: crop.cy }; cv.setPointerCapture(ev.pointerId); });
    cv.addEventListener('pointermove', function (ev) {
      if (!start || !photo) return;
      var rect = cv.getBoundingClientRect();
      var rot = crop.rot % 180 !== 0;
      var rw = rot ? photo.height : photo.width, rh = rot ? photo.width : photo.height;
      var vs = Math.min(rw, rh) / crop.zoom;
      crop.cx = clamp01(start.cx - (ev.clientX - start.x) / rect.width * vs / rw);
      crop.cy = clamp01(start.cy - (ev.clientY - start.y) / rect.height * vs / rh);
      Photo.draw(cv.getContext('2d'), photo, crop, 320);
      syncSliders();
    });
    cv.addEventListener('pointerup', function () { start = null; });
    cv.addEventListener('pointercancel', function () { start = null; });
  }
  function clamp01(v) { return Math.max(0, Math.min(1, v)); }
  var sliders = {};
  function syncSliders() {
    if (sliders.x) sliders.x.value = Math.round(crop.cx * 100);
    if (sliders.y) sliders.y.value = Math.round(crop.cy * 100);
  }
  function renderCrop() {
    cropBox.textContent = '';
    if (mode !== 'photo') return;
    cropBox.appendChild(h('div', { class: 'btn-row' },
      h('button', { type: 'button', class: 'btn', onclick: function () { fileIn.click(); } }, '写真を選ぶ'),
      h('button', { type: 'button', class: 'btn', onclick: function () { camIn.click(); } }, 'カメラで撮る')));
    if (!photo) {
      cropBox.appendChild(h('p', { class: 'hint', text: draft.img.type === 'photo' ? '今の写真を使います。変えるときは新しい写真を選んでください。' : '写真を選ぶと、ここで大きさと位置を調整できます。' }));
      return;
    }
    function slider(label, key, min, max, stepv, get, set) {
      var id = 'f-' + key;
      var inp = h('input', { type: 'range', id: id, min: min, max: max, step: stepv, value: get() });
      inp.addEventListener('input', function () { set(Number(inp.value)); renderPreview(); });
      sliders[key] = inp;
      return h('div', { class: 'slider' }, h('label', { for: id, text: label }), inp);
    }
    cropBox.appendChild(slider('大きさ（拡大）', 'z', 100, 400, 5, function () { return Math.round(crop.zoom * 100); }, function (v) { crop.zoom = v / 100; }));
    cropBox.appendChild(slider('左右の位置', 'x', 0, 100, 1, function () { return Math.round(crop.cx * 100); }, function (v) { crop.cx = v / 100; }));
    cropBox.appendChild(slider('上下の位置', 'y', 0, 100, 1, function () { return Math.round(crop.cy * 100); }, function (v) { crop.cy = v / 100; }));
    cropBox.appendChild(h('div', { class: 'btn-row' },
      h('button', { type: 'button', class: 'btn small', onclick: function () { crop.rot = (crop.rot + 90) % 360; renderPreview(); } }, '90°回す'),
      h('button', { type: 'button', class: 'btn small', onclick: function () { crop = { zoom: 1, cx: 0.5, cy: 0.5, rot: crop.rot }; renderCrop(); renderPreview(); } }, '位置を元に戻す')));
    cropBox.appendChild(h('p', { class: 'hint', text: '見本の写真をドラッグしても位置を動かせます。写真は端末の中で小さくして保存し、撮影場所などの情報は残しません。' }));
  }
  function onFile(inp) {
    var f = inp.files && inp.files[0];
    inp.value = '';
    if (!f) return;
    errBox.textContent = '読み込み中…';
    Photo.loadFile(f).then(function (cv) {
      photo = cv; crop = { zoom: 1, cx: 0.5, cy: 0.5, rot: 0 }; errBox.textContent = '';
      renderCrop(); renderPreview();
    }).catch(function (e) { errBox.textContent = errMsg(e); });
  }
  fileIn.addEventListener('change', function () { onFile(fileIn); });
  camIn.addEventListener('change', function () { onFile(camIn); });
  hiraIn.addEventListener('input', renderPreview);
  kanjiIn.addEventListener('input', renderPreview);

  var modeBox = h('fieldset', { class: 'radios' }, h('legend', { text: '絵・写真' }));
  function modeRadio(val, label) {
    var id = 'm-' + val;
    var r = h('input', { type: 'radio', name: 'imgmode', id: id, value: val, checked: mode === val });
    r.addEventListener('change', function () { mode = val; renderCrop(); renderPreview(); renderLibBtn(); });
    return h('label', { class: 'radio', for: id }, r, h('span', { text: label }));
  }
  modeBox.appendChild(modeRadio('lib', '用意された絵'));
  modeBox.appendChild(modeRadio('photo', '写真'));
  modeBox.appendChild(modeRadio('none', 'なし（文字だけ）'));
  var libBtnBox = h('div', { class: 'btn-row' });
  function renderLibBtn() {
    libBtnBox.textContent = '';
    if (mode !== 'lib') return;
    libBtnBox.appendChild(h('button', { type: 'button', class: 'btn small', onclick: function () {
      // 編集中の内容を保ったまま絵を選ぶ
      var saved = { hira: hiraIn.value, kanji: kanjiIn.value };
      pickLibrary(b, listKey, function (key) {
        if (key) libKey = key;
        reopen(saved);
      });
    } }, libKey ? '絵を選びなおす' : '絵を選ぶ'));
  }
  function reopen(saved) {
    // pickLibraryでモーダルが閉じたので、同じ内容で開き直す
    hiraIn.value = saved.hira; kanjiIn.value = saved.kanji;
    openEditor();
  }

  function save() {
    var hira = hiraIn.value.trim(), kanji = kanjiIn.value.trim();
    if (!hira && !kanji) { errBox.textContent = 'ことばを入れてください。'; hiraIn.focus(); return false; }
    if (!hira) hira = kanji;
    var card = { id: orig.id, key: libKey || orig.key || null, hira: hira.slice(0, LIMITS.hira), kanji: kanji.slice(0, LIMITS.kanji), img: { type: 'none' } };
    var p = Promise.resolve();
    if (mode === 'lib' && libKey) card.img = { type: 'lib', key: libKey };
    else if (mode === 'photo') {
      if (photo) {
        var imgId = uid();
        p = Photo.toJpeg(photo, crop).then(function (blob) {
          return Photo.blobToBuffer(blob).then(function (buf) {
            return DB.putImage({ id: imgId, type: 'image/jpeg', data: buf, createdAt: Date.now() }).then(function () {
              S.urls[imgId] = URL.createObjectURL(blob);
              card.img = { type: 'photo', id: imgId };
              if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () { /* */ });
            });
          });
        });
      } else if (orig.img && orig.img.type === 'photo') {
        card.img = clone(orig.img);
      } else {
        errBox.textContent = '写真を選んでください（または「用意された絵」「なし」を選んでください）。';
        return false;
      }
    }
    var saveBtn = document.getElementById('editor-save');
    if (saveBtn) saveBtn.disabled = true;
    p.then(function () {
      if (isNew) b[listKey].push(card); else b[listKey][index] = card;
      return saveBoard(b);
    }).then(function () {
      closeModal();
      return gcImages();
    }).then(function () {
      route();
      notify('「' + cardText(card, b) + '」を保存しました。');
    }).catch(function (e) {
      // 保存に失敗したら元のカードに戻す（今までのデータは残す）
      if (isNew) { var k = b[listKey].indexOf(card); if (k >= 0) b[listKey].splice(k, 1); } else b[listKey][index] = orig;
      errBox.textContent = errMsg(e);
      if (saveBtn) saveBtn.disabled = false;
    });
    return false;
  }

  function openEditor() {
    modal({
      title: isNew ? 'カードを作る' : 'カードを編集',
      wide: true,
      body: h('div', { class: 'editor' },
        preview,
        h('div', { class: 'editor-form' },
          h('div', { class: 'field' }, h('label', { for: 'f-hira', text: 'ことば（ひらがな）' }), hiraIn,
            h('p', { class: 'hint', text: '短い言葉がおすすめです（' + LIMITS.hira + '文字まで）。' })),
          h('div', { class: 'field' }, h('label', { for: 'f-kanji', text: '漢字まじりの言葉（任意）' }), kanjiIn,
            h('p', { class: 'hint', text: '「見た目と操作」で漢字まじりを選んだときに使います。空欄ならひらがなを表示します。' })),
          modeBox, libBtnBox, cropBox, fileIn, camIn, errBox)),
      actions: [{ label: 'やめる' }, { label: '保存する', primary: true, id: 'editor-save', onClick: save }],
      focus: '#f-hira'
    });
    renderLibBtn(); renderCrop(); renderPreview();
  }
  openEditor();
}

function editLook(b, body) {
  var s = b.settings;
  function group(legend, key, opts, help) {
    var fs = h('fieldset', { class: 'radios' }, h('legend', { text: legend }));
    opts.forEach(function (o) {
      var id = 's-' + key + '-' + o[0];
      var r = h('input', { type: 'radio', name: 's-' + key, id: id, checked: String(s[key]) === String(o[0]) });
      r.addEventListener('change', function () {
        var v = o[0];
        s[key] = v;
        saveBoard(b).then(function () {
          viewEdit(b, 'look');
          var again = document.getElementById(id);
          if (again) again.focus();
          announce(legend + '：' + o[1] + ' を保存しました');
        });
      });
      fs.appendChild(h('label', { class: 'radio', for: id }, r, h('span', { text: o[1] })));
    });
    if (help) fs.appendChild(h('p', { class: 'hint', text: help }));
    return fs;
  }
  body.appendChild(h('p', { class: 'hint', text: '年齢で決めずに、お子さんの理解や操作のしやすさに合わせて選んでください。変更はすぐ保存され、子ども用画面と印刷の両方に反映されます。' }));

  // 見本
  var sample = b.schedule[b.pos] || b.schedule[0] || b.requests[0];
  if (sample) {
    body.appendChild(h('div', { class: 'look-preview', 'aria-label': '見本' },
      h('div', { class: 'frame frame-now mini' }, h('div', { class: 'frame-label' }, W(b, 'now')), cardNode(sample, b, 'mid')),
      h('div', { class: 'mini-btns' },
        h('span', { class: 'btn primary done-btn' }, '✓ ' + W(b, 'done')),
        h('span', { class: 'btn tell-btn' }, W(b, 'tell')))));
  }

  var voices = jaVoices();
  var speechOk = 'speechSynthesis' in window;
  body.appendChild(h('div', { class: 'settings-grid' },
    group('「おわった」を押す人', 'completer', [['child', '子どもが押す'], ['adult', 'おとなが進める']],
      'どちらの場合も、自動で進んだり時間で切り替わったりはしません。間違えたときは「もどす」で戻せます。'),
    group('つたえるカードの枚数（1画面）', 'choices', [[2, '2枚'], [4, '4枚'], [6, '6枚']]),
    group('カードの表示', 'show', [['both', '絵・写真と文字'], ['text', '文字だけ']]),
    group('用意された絵の種類', 'pictStyle', [['illust', 'やわらかいイラスト'], ['pict', 'シンプルな絵']],
      'やわらかいイラストがないカードは、シンプルな絵で表示します。写真を入れたカードは写真のままです。'),
    group('文字の大きさ', 'fontScale', [[1, 'ふつう'], [1.3, '大きい'], [1.6, 'とても大きい']]),
    group('表記', 'script', [['hira', 'ひらがな'], ['kanji', '漢字まじり']]),
    group('配色', 'theme', [['warm', 'あたたかい'], ['white', '白'], ['contrast', 'くっきり（白黒）'], ['dark', '暗め']]),
    group('雰囲気', 'look', [['young', 'やわらかい'], ['older', 'すっきり（小学生にも）']]),
    group('予定の一覧', 'showAll', [[false, '出さない'], [true, '下に出す']], '「いま・つぎ」の下に、全体の予定と終わった印（✓）を出します。'),
    group('読み上げ', 'speech', [[false, '使わない（無音）'], [true, '使う']],
      speechOk
        ? (voices.length ? 'この端末には日本語の音声があります。「いま」のカードやつたえるカードを押すと読み上げます。通信がないと読めない端末もあります。' : 'この端末では、いま日本語の音声が見つかりません。「使う」にしても音が出ない場合があります。音声がなくても、すべての機能が使えます。')
        : 'このブラウザは読み上げに対応していません。音声がなくても、すべての機能が使えます。')));
  if (speechOk && !voices.length) {
    speechSynthesis.addEventListener('voiceschanged', function once() {
      speechSynthesis.removeEventListener('voiceschanged', once);
      if (jaVoices().length && /\/edit\/look$/.test(location.hash)) viewEdit(b, 'look');
    });
  }
}

function editBoard(b, body) {
  var nameIn = h('input', { type: 'text', id: 'f-name', maxlength: LIMITS.name, value: b.name, autocomplete: 'off' });
  body.appendChild(h('div', { class: 'field' },
    h('label', { for: 'f-name', text: 'ボードの名前（ニックネーム）' }), nameIn,
    h('p', { class: 'hint', text: 'ボードを選ぶ画面と、子ども用画面の上に出ます。氏名ではなく、ニックネームや用途（「学校の日」など）にしてください。' }),
    h('button', { type: 'button', class: 'btn primary', onclick: function () {
      var v = nameIn.value.trim();
      if (!v) { notify('名前を入れてください。', 'error'); return; }
      b.name = v.slice(0, LIMITS.name);
      saveBoard(b).then(function () { notify('名前を保存しました。'); viewEdit(b, 'board'); });
    } }, '名前を保存')));

  body.appendChild(h('h2', { text: 'ボードの操作' }));
  body.appendChild(h('div', { class: 'btn-col' },
    h('button', { type: 'button', class: 'btn', onclick: function () {
      if (S.boards.length >= LIMITS.boards) { notify('ボードは' + LIMITS.boards + '個までです。', 'error'); return; }
      var nb = clone(b);
      nb.id = uid(); nb.name = uniqueName(b.name + 'のコピー'); nb.createdAt = nb.updatedAt = Date.now();
      nb.schedule.forEach(function (c) { c.id = uid(); });
      nb.requests.forEach(function (c) { c.id = uid(); });
      saveBoard(nb).then(function () { S.boards.push(nb); notify('「' + nb.name + '」を作りました（写真も共有しています）。'); go('#/b/' + nb.id + '/edit/board'); });
    } }, 'このボードを複製する'),
    h('a', { class: 'btn', href: '#/data' }, 'バックアップ・データの保存について'),
    h('a', { class: 'btn', href: '#/' }, 'ボードを選ぶ画面へ'),
    h('button', { type: 'button', class: 'btn danger', onclick: function () {
      confirmBox('ボードを削除', '「' + b.name + '」を削除します。このボードの写真も（ほかのボードで使っていなければ）消え、元に戻せません。必要ならバックアップを書き出してから削除してください。', '削除する', function () {
        DB.deleteBoard(b.id).then(function () {
          S.boards = S.boards.filter(function (x) { return x.id !== b.id; });
          return gcImages();
        }).then(function () { notify('ボードを削除しました。'); go('#/'); }).catch(fail);
      }, true);
    } }, 'このボードを削除する')));
}

/* ---------- 印刷 ---------- */

var PRINT = { kind: 'cards', target: 'both', size: 'L' };

function viewPrint(b) {
  applyTheme(b);
  document.title = b.name + '｜印刷';
  var el = screen('print');
  el.appendChild(h('header', { class: 'adult-head no-print' },
    h('a', { class: 'btn small', href: '#/b/' + b.id + '/edit' }, '← 支援者メニュー'),
    h('h1', null, 'カードを印刷：', h('span', { text: b.name }))));

  function group(legend, key, opts) {
    var fs = h('fieldset', { class: 'radios inline' }, h('legend', { text: legend }));
    opts.forEach(function (o) {
      var id = 'p-' + key + '-' + o[0];
      var r = h('input', { type: 'radio', name: 'p-' + key, id: id, checked: PRINT[key] === o[0] });
      r.addEventListener('change', function () { PRINT[key] = o[0]; viewPrint(b); var a = document.getElementById(id); if (a) a.focus(); });
      fs.appendChild(h('label', { class: 'radio', for: id }, r, h('span', { text: o[1] })));
    });
    return fs;
  }
  el.appendChild(h('div', { class: 'print-controls no-print' },
    group('印刷するもの', 'kind', [['cards', 'カードだけ'], ['board', '「いま・つぎ」の台紙つき']]),
    group('カード', 'target', [['both', '予定とつたえる'], ['schedule', '予定だけ'], ['requests', 'つたえるだけ']]),
    group('大きさ', 'size', [['L', '大 10cm角（1枚に4つ）'], ['S', '小 6cm角（1枚に12こ）']]),
    h('div', { class: 'btn-row' },
      h('button', { type: 'button', class: 'btn primary', onclick: function () { window.print(); } }, '印刷する／PDFに保存'),
      h('span', { class: 'hint', text: '用紙はA4縦・倍率100%（「ページに合わせる」はオフ）にしてください。PDFに保存するときは、印刷画面の送信先で「PDFに保存」を選びます。' }))));

  var cards = [];
  if (PRINT.target !== 'requests') cards = cards.concat(b.schedule);
  if (PRINT.target !== 'schedule') cards = cards.concat(b.requests);
  var per = PRINT.size === 'L' ? 4 : 12;
  var sheets = [];
  if (PRINT.kind === 'board') sheets.push(boardSheet(b));
  for (var i = 0; i < cards.length; i += per) sheets.push(cardSheet(b, cards.slice(i, i + per)));
  if (!cards.length && PRINT.kind !== 'board') el.appendChild(h('p', { class: 'empty no-print', text: '印刷するカードがありません。' }));

  var area = h('div', { id: 'print-area', class: 'size-' + PRINT.size });
  sheets.forEach(function (s) { area.appendChild(h('div', { class: 'sheet-wrap' }, s)); });
  el.appendChild(h('p', { class: 'hint no-print', text: '下は印刷の見本です（' + sheets.length + '枚）。点線が切り取り線です。' }));
  el.appendChild(area);
  fitSheets();
}

function printCard(c, b) {
  var text = cardText(c, b);
  var src = b.settings.show === 'text' ? null : cardSrc(c, b);
  var el = h('div', { class: 'pcard' + (src ? '' : ' textonly') });
  if (src) el.appendChild(h('div', { class: 'pcard-img' }, h('img', { src: src, alt: '' })));
  // 文字数に合わせて1行に収まる大きさにする（mm）
  var inner = PRINT.size === 'L' ? 86 : 52;
  var base = PRINT.size === 'L' ? (src ? 13 : 20) : (src ? 7.5 : 12);
  var fs = Math.min(base, inner / Math.max(1, text.length) * 0.98);
  el.appendChild(h('div', { class: 'pcard-text', text: text, style: { 'font-size': fs.toFixed(2) + 'mm' } }));
  return el;
}
function cardSheet(b, cards) {
  var s = h('div', { class: 'sheet cards' });
  var g = h('div', { class: 'pgrid' });
  cards.forEach(function (c) { g.appendChild(printCard(c, b)); });
  s.appendChild(g);
  s.appendChild(h('p', { class: 'sheet-foot', text: b.name + '　点線で切り取ってください' }));
  return s;
}
function boardSheet(b) {
  var s = h('div', { class: 'sheet base' });
  s.appendChild(h('div', { class: 'base-title', text: b.name }));
  var wrap = h('div', { class: 'base-frames' });
  ['now', 'next'].forEach(function (k) {
    wrap.appendChild(h('div', { class: 'base-frame ' + k },
      h('div', { class: 'base-label', text: W(b, k) }),
      h('div', { class: 'base-slot', text: 'ここにカードを置く' })));
  });
  s.appendChild(wrap);
  s.appendChild(h('div', { class: 'base-done' }, h('span', { class: 'base-label small', text: W(b, 'doneMark') }), h('span', { class: 'base-note', text: 'おわったカードは ここへ' })));
  return s;
}
function fitSheets() {
  var area = document.getElementById('print-area');
  if (!area) return;
  var avail = area.clientWidth;
  area.querySelectorAll('.sheet-wrap').forEach(function (w) {
    var sheet = w.firstChild;
    var sw = sheet.offsetWidth, sh = sheet.offsetHeight;
    var k = Math.min(1, avail / sw);
    sheet.style.transform = 'scale(' + k + ')';
    w.style.height = (sh * k) + 'px';
    w.style.width = (sw * k) + 'px';
  });
}
window.addEventListener('resize', function () { if (/\/print$/.test(location.hash)) fitSheets(); });

/* ---------- データの保存・バックアップ ---------- */

function viewData() {
  applyTheme(null);
  document.title = 'データの保存・バックアップ';
  var el = screen('data');
  el.appendChild(adultHeader('データの保存・バックアップ', '#/', 'ボードを選ぶ'));

  var info = h('section', { class: 'panel' }, h('h2', { text: 'データはどこに保存される？' }),
    h('ul', null,
      h('li', { text: 'ボード・写真は、この端末のこのブラウザの中だけに保存されます。インターネット上には送信・保存しません。' }),
      h('li', { text: '次のときは消えることがあります：ブラウザの「履歴・サイトデータの消去」、プライベート（シークレット）モードで使ったとき、端末やブラウザを変えたとき、アプリを長く開かず端末の空き容量が少ないとき。' }),
      h('li', { text: '大切なボードは、下の「バックアップを書き出す」でファイルに保存しておいてください。' })));
  var stat = h('p', { class: 'hint', text: '使用量を確認しています…' });
  info.appendChild(stat);
  var persistBtn = h('button', { type: 'button', class: 'btn small', hidden: true, onclick: function () {
    navigator.storage.persist().then(function (ok) { notify(ok ? '消えにくい保存に設定されました。' : 'このブラウザでは設定できませんでした（ホーム画面に追加すると設定できる場合があります）。'); viewData(); });
  } }, 'この端末で消えにくくする');
  info.appendChild(persistBtn);
  el.appendChild(info);
  var photos = 0;
  S.boards.forEach(function (b) { b.schedule.concat(b.requests).forEach(function (c) { if (c.img && c.img.type === 'photo') photos++; }); });
  Promise.all([
    navigator.storage && navigator.storage.estimate ? navigator.storage.estimate() : Promise.resolve(null),
    navigator.storage && navigator.storage.persisted ? navigator.storage.persisted() : Promise.resolve(null)
  ]).then(function (r) {
    var est = r[0], per = r[1];
    stat.textContent = 'ボード ' + S.boards.length + '個・写真入りカード ' + photos + '枚。' +
      (est ? '使用量 約' + fmtBytes(est.usage) + '（使える目安 ' + fmtBytes(est.quota) + '）。' : '') +
      (per === true ? '消えにくい保存：設定済み。' : per === false ? '消えにくい保存：未設定。' : '');
    if (per === false) persistBtn.hidden = false;
  }).catch(function () { stat.textContent = ''; });

  var off = offlineStatus();
  el.appendChild(h('section', { class: 'panel' }, h('h2', { text: '通信なしで使う' }), h('p', { text: off.long }),
    h('p', { class: 'hint', text: 'スマホ・タブレットでは、ブラウザの共有メニューから「ホーム画面に追加」すると、アプリのように開けます（対応はブラウザによります）。' })));

  // 書き出し
  var exp = h('section', { class: 'panel' }, h('h2', { text: 'バックアップを書き出す' }),
    h('p', { class: 'warn', text: 'ファイルには、取り込んだ写真がそのまま含まれます。共有のパソコンやクラウドに置くときは、保管場所と削除に注意してください。' }));
  var checks = h('div', { class: 'checks' });
  S.boards.forEach(function (b) {
    var id = 'x-' + b.id;
    checks.appendChild(h('label', { class: 'radio', for: id }, h('input', { type: 'checkbox', id: id, value: b.id, checked: true }), h('span', { text: b.name })));
  });
  exp.appendChild(checks);
  exp.appendChild(h('button', { type: 'button', class: 'btn primary', disabled: !S.boards.length, onclick: function () {
    var ids = Array.prototype.map.call(checks.querySelectorAll('input:checked'), function (i) { return i.value; });
    if (!ids.length) { notify('書き出すボードを選んでください。', 'error'); return; }
    exportBackup(ids).catch(fail);
  } }, '選んだボードを書き出す'));
  if (!S.boards.length) exp.appendChild(h('p', { class: 'hint', text: 'まだボードがありません。' }));
  el.appendChild(exp);

  // 復元
  var fileIn = h('input', { type: 'file', id: 'f-restore', accept: '.json,application/json', class: 'visually-hidden' });
  fileIn.addEventListener('change', function () { var f = fileIn.files[0]; fileIn.value = ''; if (f) importBackup(f); });
  el.appendChild(h('section', { class: 'panel' }, h('h2', { text: 'バックアップから戻す' }),
    h('p', { text: 'このアプリで書き出したファイル（.json）を選ぶと、中のボードを「追加」します。今あるボードは上書きしません。' }),
    fileIn, h('button', { type: 'button', class: 'btn', onclick: function () { fileIn.click(); } }, 'ファイルを選ぶ')));

  // 全消去
  el.appendChild(h('section', { class: 'panel danger-zone' }, h('h2', { text: 'すべて消す' }),
    h('p', { text: 'この端末に保存したボードと写真をすべて消します。元に戻せません。' }),
    h('button', { type: 'button', class: 'btn danger', disabled: !S.boards.length, onclick: clearAllDialog }, 'すべて消す…')));
}

function exportBackup(ids) {
  var boards = S.boards.filter(function (b) { return ids.indexOf(b.id) >= 0; });
  var imgIds = [];
  boards.forEach(function (b) { b.schedule.concat(b.requests).forEach(function (c) { if (c.img && c.img.type === 'photo' && imgIds.indexOf(c.img.id) < 0) imgIds.push(c.img.id); }); });
  return Promise.all(imgIds.map(function (id) { return DB.image(id); })).then(function (recs) {
    var images = recs.filter(Boolean).map(function (r) { return { id: r.id, type: r.type, data: Photo.bufToBase64(r.data) }; });
    var data = { format: BACKUP_FORMAT, version: 1, app: 'いま・つぎ／つたえるボード', appVersion: APP_VERSION, exportedAt: new Date().toISOString(), note: 'このファイルには写真が含まれます。', boards: clone(boards), images: images };
    var blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    var d = new Date();
    var name = 'imatsugi-backup-' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '.json';
    var a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    notify('バックアップ「' + name + '」を書き出しました（ボード' + boards.length + '個・写真' + images.length + '枚）。写真が含まれるので保管場所に注意してください。');
  });
}

function readText(file) {
  if (file.text) return file.text();
  return new Promise(function (resolve, reject) {
    var r = new FileReader(); r.onload = function () { resolve(r.result); }; r.onerror = function () { reject(r.error); }; r.readAsText(file);
  });
}

function bad(msg) { return DB.AppError('badfile', msg); }

// 復元：形式・容量・中身を確認し、今のボードは残したまま新しいボードとして追加する
function importBackup(file) {
  if (file.size > LIMITS.backupBytes) { notify('ファイルが大きすぎます（300MBまで）。', 'error'); return; }
  notify('ファイルを確認しています…');
  readText(file).then(function (txt) {
    var data;
    try { data = JSON.parse(txt); } catch (e) { throw bad('このファイルは読み取れません（壊れているか、このアプリのバックアップではありません）。'); }
    if (!data || data.format !== BACKUP_FORMAT) throw bad('このアプリのバックアップファイルではありません。');
    if (data.version !== 1) throw bad('このバックアップは新しい版のアプリで作られたため、読み込めません。');
    if (!Array.isArray(data.boards) || !Array.isArray(data.images)) throw bad('バックアップの中身が足りません。');
    if (!data.boards.length) throw bad('バックアップにボードが入っていません。');
    if (S.boards.length + data.boards.length > LIMITS.boards) throw bad('ボードが' + LIMITS.boards + '個を超えるため追加できません。使わないボードを消してからお試しください。');

    // 写真を確認
    var imgMap = {}, jobs = [];
    data.images.forEach(function (im) {
      if (!im || typeof im.id !== 'string' || typeof im.data !== 'string') return;
      if (['image/jpeg', 'image/png', 'image/webp'].indexOf(im.type) < 0) return;
      if (im.data.length > LIMITS.imageBytes * 1.4) return;
      var buf;
      try { buf = Photo.base64ToBuf(im.data); } catch (e) { return; }
      jobs.push(Photo.verifyImage(buf, im.type).then(function (ok) {
        if (ok) imgMap[im.id] = { id: uid(), type: im.type, data: buf, createdAt: Date.now() };
      }));
    });
    return Promise.all(jobs).then(function () {
      var skippedImg = 0;
      var names = S.boards.map(function (b) { return b.name; });
      var boards = data.boards.map(function (src) {
        if (!src || typeof src !== 'object') throw bad('ボードの形式が正しくありません。');
        var nb = makeBoard(null);
        var nm = str(src.name, LIMITS.name) || 'ふくげんしたボード';
        if (names.indexOf(nm) >= 0) nm = nm + '（復元）';
        nb.name = uniqueName(nm);
        names.push(nb.name);
        nb.settings = cleanSettings(src.settings);
        function cleanCards(arr) {
          if (!Array.isArray(arr)) return [];
          return arr.slice(0, LIMITS.cards).map(function (c) {
            if (!c || typeof c !== 'object') return null;
            var card = { id: uid(), key: LIB_BY_KEY[c.key] ? c.key : null, hira: str(c.hira, LIMITS.hira), kanji: str(c.kanji, LIMITS.kanji), img: { type: 'none' } };
            if (!card.hira && !card.kanji) return null;
            if (!card.hira) card.hira = card.kanji;
            var im = c.img || {};
            if (im.type === 'lib' && LIB_BY_KEY[im.key]) card.img = { type: 'lib', key: im.key };
            else if (im.type === 'photo') {
              if (imgMap[im.id]) card.img = { type: 'photo', id: imgMap[im.id].id };
              else { skippedImg++; if (card.key) card.img = { type: 'lib', key: card.key }; }
            }
            return card;
          }).filter(Boolean);
        }
        nb.schedule = cleanCards(src.schedule);
        nb.requests = cleanCards(src.requests);
        nb.pos = Math.max(0, Math.min(nb.schedule.length, Number(src.pos) || 0));
        return nb;
      });
      var images = Object.keys(imgMap).map(function (k) { return imgMap[k]; });
      var bytes = images.reduce(function (s, i) { return s + i.data.byteLength; }, 0);
      var checkQuota = navigator.storage && navigator.storage.estimate ? navigator.storage.estimate() : Promise.resolve(null);
      return checkQuota.then(function (est) {
        if (est && est.quota && est.usage + bytes * 1.2 > est.quota) throw DB.AppError('quota');
        confirmBox('バックアップから戻す',
          'ボード' + boards.length + '個（' + boards.map(function (b) { return b.name; }).join('、') + '）・写真' + images.length + '枚を追加します。今あるボードはそのまま残ります。' + (skippedImg ? '（読み取れなかった写真が' + skippedImg + '枚あり、その分は絵または文字だけにします）' : ''),
          '追加する', function () {
            DB.putMany(boards, images).then(function () {
              return reloadBoards();
            }).then(function () {
              notify('ボードを' + boards.length + '個追加しました。');
              viewData();
            }).catch(fail);
          });
      });
    });
  }).catch(function (e) {
    notify(e && e.appCode === 'badfile' ? e.message : errMsg(e), 'error');
  });
}

function str(v, max) { return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) : ''; }
function cleanSettings(src) {
  var s = Object.assign({}, DEFAULT_SETTINGS);
  src = src && typeof src === 'object' ? src : {};
  var allowed = {
    completer: ['child', 'adult'], choices: [2, 4, 6], show: ['both', 'text'], pictStyle: ['illust', 'pict'],
    fontScale: [1, 1.3, 1.6], script: ['hira', 'kanji'], theme: ['warm', 'white', 'contrast', 'dark'],
    look: ['young', 'older'], showAll: [true, false], speech: [true, false]
  };
  Object.keys(allowed).forEach(function (k) { if (allowed[k].indexOf(src[k]) >= 0) s[k] = src[k]; });
  return s;
}

function clearAllDialog() {
  var cb = h('input', { type: 'checkbox', id: 'f-clear' });
  var box = modal({
    title: 'すべて消す',
    body: [
      h('p', { text: 'ボード' + S.boards.length + '個と、取り込んだ写真をすべて消します。元に戻せません。' }),
      h('p', { text: '必要なら、先に「バックアップを書き出す」でファイルに保存してください。' }),
      h('label', { class: 'radio', for: 'f-clear' }, cb, h('span', { text: '写真を含めてすべて消すことを確認しました' }))
    ],
    actions: [{ label: 'やめる' }, { label: 'すべて消す', danger: true, id: 'clear-go', disabled: true, onClick: function () {
      if (!cb.checked) return false;
      DB.clearAll().then(function () {
        Object.keys(S.urls).forEach(function (k) { URL.revokeObjectURL(S.urls[k]); });
        S.urls = {}; S.boards = [];
        notify('すべて消しました。');
        go('#/');
      }).catch(fail);
    } }]
  });
  cb.addEventListener('change', function () { box.querySelector('#clear-go').disabled = !cb.checked; });
}

/* ---------- 使い方・このアプリについて ---------- */

function viewHelp() {
  applyTheme(null);
  document.title = '使い方';
  var el = screen('doc');
  el.appendChild(adultHeader('使い方（おとなのかたへ）', '#/', 'ボードを選ぶ'));
  var sec = function (t) { var s = h('section', { class: 'panel' }, h('h2', { text: t })); for (var i = 1; i < arguments.length; i++) append(s, arguments[i]); return s; };
  el.appendChild(sec('1. 始める',
    h('ol', null,
      h('li', { text: '「ボードを選ぶ」画面でサンプル（未就学児向け／小学生向け）か空のボードを選びます。' }),
      h('li', { text: '支援者メニューで、予定のカードを実際の流れに合わせて並べ、言葉や写真を変えます。' }),
      h('li', { text: '「いま・つぎ（子ども用画面）に戻る」で子ども用画面にし、お子さんと一緒に見ます。' }))));
  el.appendChild(sec('2. いま・つぎ',
    h('ul', null,
      h('li', { text: '「いま」する活動と「つぎ」の活動を大きく出します。' }),
      h('li', { text: '終わったら「おわった」を押すと次に進みます。押す人（子ども／おとな）は「見た目と操作」で選べます。' }),
      h('li', { text: '間違えて押したときは「もどす」で1つ戻せます。自動で進んだり、時間で切り替わったりはしません。' }))));
  el.appendChild(sec('3. つたえる（きもち・お願い）',
    h('ul', null,
      h('li', { text: '右上の「つたえる」からいつでも開けます。カードを押すと大きく表示され、声を出さなくても相手に見せて伝えられます。' }),
      h('li', { text: '間違えたときは「とじる」で戻れます。' }),
      h('li', { text: 'お子さんがカードを選んだら、まず「〇〇なんだね」と受け止めてください。「やすみたい」「いや」も大切な意思表示です。予定を終えたかどうかや約束と引きかえにしないでください。' }))));
  el.appendChild(sec('4. お子さんに合わせる',
    h('p', { text: '年齢で決めずに、理解や操作のしやすさに合わせて調整します。まず少ない枚数・短い言葉から始め、様子を見て変えてください。' }),
    h('ul', null,
      h('li', { text: 'つたえるカードの枚数：2・4・6枚' }),
      h('li', { text: '絵・写真と文字／文字だけ、やわらかいイラスト／シンプルな絵、写真の差し替え' }),
      h('li', { text: '文字の大きさ、ひらがな／漢字まじり、配色（あたたかい・白・くっきり・暗め）、雰囲気（やわらかい・すっきり）' }),
      h('li', { text: '読み上げ（初期は無音。端末に日本語の音声がある場合のみ）' }))));
  el.appendChild(sec('5. 紙でも使う',
    h('p', { text: '支援者メニューの「カードを印刷」から、同じカードをA4に印刷できます。10cm角（1枚に4つ）と6cm角（1枚に12こ）、「いま・つぎ」の台紙つきを選べます。' })));
  el.appendChild(sec('6. 支援者メニューへの入り方',
    h('p', { text: '子ども用画面の左上「支援者メニュー」を押し、表示された3つの数字を順番に押します。お子さんが誤って編集画面に入らないための確認です（長押しは使いません）。一度入ると10分間は確認を省きます。' })));
  el.appendChild(sec('7. 大切なこと',
    h('ul', null,
      h('li', { text: 'このツールは、予定の見通しと本人の意思表出を支えるためのものです。診断・治療・発達の評価は行わず、療育の効果を保証するものではありません。' }),
      h('li', { text: 'すべてのお子さんに合うとは限りません。使い方や感覚の違いに合わせて、個別に調整してください。' }),
      h('li', { text: 'データはこの端末の中だけに保存されます。「データの保存・バックアップ」もご確認ください。' }))));
}

function viewAbout() {
  applyTheme(null);
  document.title = 'このアプリについて';
  var el = screen('doc');
  el.appendChild(adultHeader('このアプリについて', '#/', 'ボードを選ぶ'));
  el.appendChild(h('section', { class: 'panel' }, h('h2', { text: 'いま・つぎ／つたえるボード' }),
    h('p', { text: '版：' + APP_VERSION + '　無料でご利用いただけます。' }),
    h('p', { text: '利用登録・広告・課金・アクセス解析はありません。入力した言葉や写真を外部に送信しません。' }),
    h('p', { text: 'このツールは診断・治療・発達の評価を行うものではなく、療育の効果を保証するものではありません。' })));
  el.appendChild(h('section', { class: 'panel' }, h('h2', { text: '動作を確認した環境' }),
    h('p', { text: 'パソコン（macOS）のGoogle Chromeで確認しています（タブレット・スマホの画面の大きさは、パソコン上で再現して確認）。iPad・iPhone（Safari）、Android（Chrome）、Windows、Edge・Firefoxの実機では、まだ確認していません。' })));
  el.appendChild(h('section', { class: 'panel' }, h('h2', { text: '素材とライセンス' }),
    h('ul', null,
      h('li', { text: 'シンプルな絵（ピクトグラム28点）：合同会社Robse 制作' }),
      h('li', { text: 'やわらかいイラスト（11点）：合同会社Robse 制作' }),
      h('li', { text: '外部のライブラリ・フォント・画像は使用していません（文字は端末に入っているフォントで表示します）。' })),
    h('p', { text: 'プログラム・絵・イラストはすべて MIT License で公開しています。改変・再配布・商用利用ができます（著作権表示とライセンス文を残してください）。' }),
    h('p', null, 'ソースコード：', h('a', { href: 'https://github.com/ohayoo37/imatsugi-board', target: '_blank', rel: 'noopener' }, 'github.com/ohayoo37/imatsugi-board')),
    h('p', null, '紹介ページ・ダウンロード：', h('a', { href: 'https://robse.jp/tools/imatsugi/', target: '_blank', rel: 'noopener' }, 'robse.jp/tools/imatsugi/'))));
  el.appendChild(h('section', { class: 'panel' }, h('h2', { text: 'お問い合わせ' }),
    h('p', { text: '合同会社Robse' }),
    h('p', { text: 'メール：company@robse.jp' }),
    h('p', { text: 'ウェブサイト：https://robse.jp' }),
    h('p', { class: 'hint', text: 'お問い合わせの際、お子さんの氏名や写真は送らないでください。' })));
}

/* ---------- 起動 ---------- */

function start() {
  window.addEventListener('hashchange', route);
  reloadBoards().then(route).catch(function (e) {
    root.textContent = '';
    root.appendChild(h('div', { class: 'screen doc' }, h('section', { class: 'panel' },
      h('h1', { text: '保存領域を開けませんでした' }),
      h('p', { text: errMsg(e) }),
      h('p', { text: 'プライベート（シークレット）モードをやめる、または別のブラウザでお試しください。' }))));
  });
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    var hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').catch(function (e) { console.warn('sw', e); });
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (hadController) notify('アプリの新しい版を保存しました。もう一度読み込むと新しい版になります（ボードや写真はそのままです）。');
      hadController = true;
    });
  }
}

start();
