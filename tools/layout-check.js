/* 検証用：ブラウザの開発者ツール（コンソール）に貼って実行する。配布物には含めない。
   すべてのボードについて、枚数2/4/6・文字の大きさ・文字だけ表示・ひらがな/漢字・予定一覧の組み合わせで
   「いま・つぎ」「つたえる」「拡大表示」を描画し、はみ出し・重なり・小さすぎるボタンを数える。 */
window.__check = function () {
  const iss = [];
  const W = innerWidth, H = innerHeight;
  const within = (r) => r.left >= -1 && r.top >= -1 && r.right <= W + 1 && r.bottom <= H + 1;
  document.querySelectorAll('.kid-head, .kid-foot, .frame, .tellgrid .card-btn, .strip, .big-overlay .btn').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width && !within(r)) iss.push('outside:' + el.className + ' ' + Math.round(r.right) + 'x' + Math.round(r.bottom));
  });
  document.querySelectorAll('.card').forEach(card => {
    const cr = card.getBoundingClientRect();
    const t = card.querySelector('.card-text'); const tr = t.getBoundingClientRect();
    if (tr.left < cr.left - 1 || tr.right > cr.right + 1 || tr.bottom > cr.bottom + 1 || tr.top < cr.top - 1) iss.push('text-overflow:' + t.textContent + ' fs=' + getComputedStyle(t).fontSize);
    if (t.scrollWidth > t.clientWidth + 1) iss.push('text-scroll:' + t.textContent);
    const im = card.querySelector('.card-img');
    if (im && im.getBoundingClientRect().height < 24) iss.push('img-too-small:' + t.textContent + ' h=' + Math.round(im.getBoundingClientRect().height));
  });
  const btns = [...document.querySelectorAll('.tellgrid .card-btn')].map(b => b.getBoundingClientRect());
  for (let i = 0; i < btns.length; i++) for (let j = i + 1; j < btns.length; j++) {
    const a = btns[i], b = btns[j];
    if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) iss.push('overlap ' + i + '-' + j);
  }
  document.querySelectorAll('button, a.btn').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width && r.height < 43 && !el.closest('.modal')) iss.push('small-target:' + el.textContent.trim().slice(0, 12) + ' ' + Math.round(r.height));
  });
  if (document.documentElement.scrollWidth > W + 1) iss.push('page-hscroll');
  return iss;
};
window.__matrix = function () {
  const out = {}; let n = 0;
  for (const b of S.boards) {
    const orig = JSON.stringify(b.settings); const origPos = b.pos;
    for (const choices of [2, 4, 6]) for (const fontScale of [1, 1.3, 1.6]) for (const show of ['both', 'text']) for (const script of ['hira', 'kanji']) for (const showAll of [false, true]) {
      Object.assign(b.settings, { choices, fontScale, show, script, showAll });
      const key = b.name + '/c' + choices + '/f' + fontScale + '/' + show + '/' + script + (showAll ? '/all' : '');
      viewNow(b); n++; let r = __check(); if (r.length) out['now:' + key] = r;
      if (showAll) continue;
      viewTell(b); n++; r = __check(); if (r.length) out['tell:' + key] = r;
      const c = b.requests.reduce((a, x) => (cardText(x, b).length > cardText(a, b).length ? x : a));
      showBig(b, c);
      document.querySelectorAll('.tellgrid').forEach(g => g.remove());
      n++; r = __check(); if (r.length) out['big:' + key] = r;
      document.querySelector('.close-big').click();
    }
    b.settings = JSON.parse(orig); b.pos = origPos;
  }
  viewList();
  return { screens: n, issues: out };
};
