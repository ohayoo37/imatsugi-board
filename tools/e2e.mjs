// 自動検証：ヘッドレスChromeをDevToolsプロトコルで操作し、主要な完了条件を確かめる。
// 使い方（app/ をローカルで配信した状態で）:
//   python3 -m http.server 8942 --bind 127.0.0.1 --directory app   （別ターミナル）
//   node --experimental-websocket tools/e2e.mjs
// 結果: 検証/結果.json・検証/画面/*.png・検証/印刷/*.pdf
// テスト画像は図形だけの合成画像（実在の人物・児童の写真は使わない）。
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE || 'http://localhost:8942/';
const ORIGIN = new URL(BASE).origin;
const OUT = path.resolve(HERE, '..', '検証');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;
fs.mkdirSync(path.join(OUT, '画面'), { recursive: true });
fs.mkdirSync(path.join(OUT, '印刷'), { recursive: true });
const DL = fs.mkdtempSync(path.join(os.tmpdir(), 'imatsugi-dl-'));
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'imatsugi-prof-'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function record(id, name, ok, detail) {
  results.push({ id, name, ok: !!ok, detail });
  console.log((ok ? 'OK  ' : 'NG  ') + id + ' ' + name + (detail ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''));
}

// ---- 合成テスト画像（PNG、位置情報などは含まない） ----
function makePng(w, h) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const o = y * (w * 3 + 1) + 1 + x * 3;
      const inCircle = (x - w * 0.3) ** 2 + (y - h * 0.5) ** 2 < (h * 0.3) ** 2;
      const inRect = x > w * 0.6 && x < w * 0.9 && y > h * 0.3 && y < h * 0.8;
      const c = inCircle ? [159, 211, 168] : inRect ? [245, 185, 138] : [207, 232, 255];
      raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2];
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
// 位置情報（Exif GPS）入りJPEGは tools/testphoto-exif.b64 があれば使う
const exifJpegB64 = fs.existsSync(path.join(HERE, 'testphoto-exif.b64')) ? fs.readFileSync(path.join(HERE, 'testphoto-exif.b64'), 'utf8').trim() : null;
const pngB64 = makePng(900, 600).toString('base64');

// ---- Chrome 起動と CDP ----
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--window-size=1180,820', 'about:blank'], { stdio: 'ignore' });
async function getJSON(u) {
  for (let i = 0; i < 60; i++) { try { const r = await fetch(u); if (r.ok) return await r.json(); } catch (e) { /* 起動待ち */ } await sleep(250); }
  throw new Error('chrome did not start');
}
const version = await getJSON(`http://127.0.0.1:${PORT}/json/version`);
const ws = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let msgId = 0; const pending = new Map(); const listeners = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
  else listeners.forEach((f) => f(m));
};
const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const id = ++msgId; pending.set(id, { res, rej }); ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params })); });

// 通信の記録（ページとService Workerの両方）
const requests = [];
listeners.push((m) => {
  if (m.method === 'Network.requestWillBeSent') requests.push(m.params.request.url);
  if (m.method === 'Target.attachedToTarget') {
    const sid = m.params.sessionId;
    send('Network.enable', {}, sid).catch(() => {});
    send('Runtime.runIfWaitingForDebugger', {}, sid).catch(() => {});
  }
});
await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL, eventsEnabled: true });
const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId: S } = await send('Target.attachToTarget', { targetId, flatten: true });
const P = (method, params) => send(method, params, S);
await P('Page.enable'); await P('Runtime.enable'); await P('Network.enable');
await P('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
await send('Target.setDiscoverTargets', { discover: true });
listeners.push((m) => {
  if (m.method === 'Target.targetCreated' && m.params.targetInfo.type === 'service_worker') {
    send('Target.attachToTarget', { targetId: m.params.targetInfo.targetId, flatten: true }).then((r) => send('Network.enable', {}, r.sessionId)).catch(() => {});
  }
});
const consoleErrors = [];
listeners.push((m) => {
  if (m.sessionId === S && m.method === 'Runtime.exceptionThrown') consoleErrors.push(m.params.exceptionDetails.text + ' ' + (m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || ''));
  if (m.sessionId === S && m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') consoleErrors.push(m.params.args.map((a) => a.value || a.description).join(' '));
});

async function ev(body) {
  const r = await P('Runtime.evaluate', { expression: `(async()=>{${body}})()`, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text);
  return r.result.value;
}
async function waitFor(expr, ms = 5000) {
  const t = Date.now();
  while (Date.now() - t < ms) { try { if (await ev(`return !!(${expr});`)) return true; } catch (e) { /* 読み込み中 */ } await sleep(100); }
  return false;
}
async function viewport(w, h, mobile = false) { await P('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile }); await sleep(150); }
async function shot(name) { const r = await P('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, '画面', name + '.png'), Buffer.from(r.data, 'base64')); }
async function nav(url) { await P('Page.navigate', { url }); await waitFor('document.readyState === "complete" && typeof S !== "undefined" && document.querySelector("#app .screen")', 8000); await sleep(200); }
async function reload() { await P('Page.reload', { ignoreCache: false }); await sleep(300); await waitFor('document.readyState === "complete" && typeof S !== "undefined" && document.querySelector("#app .screen")', 8000); await sleep(300); }
const settle = () => sleep(350);

try {
  await viewport(1180, 820);
  await nav(BASE);

  // 1. 初回：サンプルを選び、写真と文字を変更して使い始める
  record('1-a', '初回はボードがなく、はじめにの説明とサンプル3種を表示', await ev(`return S.boards.length===0 && !!document.querySelector('.intro') && document.querySelectorAll('.sample').length===3;`));
  await shot('01_はじめに');
  await ev(`document.querySelector('.sample').click();`);
  await waitFor(`location.hash.includes('/edit')`);
  await settle();
  record('1-b', 'サンプル（未就学児向け）を作ると編集画面が開く', await ev(`return S.boards.length===1 && location.hash.includes('/edit') && document.querySelectorAll('.card-row').length===5;`));
  await shot('02_編集_予定');
  // カード編集：写真を取り込み、言葉を変える
  await ev(`cardEditor(S.boards[0],'schedule',0);`);
  await ev(`document.getElementById('m-photo').click();`);
  const photoB64 = exifJpegB64 || pngB64;
  const photoType = exifJpegB64 ? 'image/jpeg' : 'image/png';
  await ev(`const bin=atob('${photoB64}'); const a=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);
    const f=new File([a],'test.${exifJpegB64 ? 'jpg' : 'png'}',{type:'${photoType}'}); const dt=new DataTransfer(); dt.items.add(f);
    const inp=document.getElementById('f-photo'); inp.files=dt.files; inp.dispatchEvent(new Event('change'));`);
  await waitFor(`document.getElementById('f-z')`);
  await ev(`const z=document.getElementById('f-z'); z.value=140; z.dispatchEvent(new Event('input'));
    const hi=document.getElementById('f-hira'); hi.value='こうえんで あそぶ'; hi.dispatchEvent(new Event('input'));
    const ka=document.getElementById('f-kanji'); ka.value='公園で遊ぶ'; ka.dispatchEvent(new Event('input'));`);
  await shot('03_カード編集_写真');
  await ev(`document.getElementById('editor-save').click();`);
  await waitFor(`!document.querySelector('.modal-back') && S.boards[0].schedule[0].img.type==='photo'`);
  const photoInfo = await ev(`const c=S.boards[0].schedule[0]; const rec=await DB.image(c.img.id); const u=new Uint8Array(rec.data);
    let s=''; for(let i=0;i<Math.min(u.length,2000);i++) s+=String.fromCharCode(u[i]);
    return {hira:c.hira, type:rec.type, bytes:rec.data.byteLength, exif:s.includes('Exif'), gpsMaker:s.includes('TestCamera'), jpeg:u[0]===0xFF&&u[1]===0xD8};`);
  record('1-c', '写真を取り込み、言葉を変えて保存できる', photoInfo.hira === 'こうえんで あそぶ' && photoInfo.jpeg, photoInfo);
  record('1-d', '保存した写真に撮影情報（Exif・位置情報）が残らない', !photoInfo.exif && !photoInfo.gpsMaker, exifJpegB64 ? 'GPS付きJPEGで確認' : 'PNGで確認（Exif入り画像なし）');

  // 2. 再読み込み後も写真・順序・位置が保存される
  await ev(`moveCard(S.boards[0],'schedule',4,1);`); await settle();
  await ev(`location.hash='#/b/'+S.boards[0].id;`); await settle();
  await ev(`document.querySelector('.done-btn').click();`); await settle();
  const before = await ev(`const b=S.boards[0]; return {order:b.schedule.map(c=>c.hira).join('/'), pos:b.pos};`);
  await reload();
  const after = await ev(`const b=S.boards[0]; return {order:b.schedule.map(c=>c.hira).join('/'), pos:b.pos, photo:!!S.urls[b.schedule[0].img.id] || b.schedule[0].img.type==='photo'};`);
  record('2-a', '再読み込み後も並び順・いまの位置・写真が残る', before.order === after.order && before.pos === after.pos && after.photo, { before, after });

  // 3. いま・つぎ から「やすみたい」を伝え、誤タップを取り消せる
  await ev(`location.hash='#/b/'+S.boards[0].id;`); await settle();
  const undo = await ev(`const p0=S.boards[0].pos; document.querySelector('.done-btn').click(); await new Promise(r=>setTimeout(r,200));
    const p1=S.boards[0].pos; document.querySelector('.back-btn').click(); await new Promise(r=>setTimeout(r,200)); return {p0,p1,p2:S.boards[0].pos};`);
  record('3-a', '「おわった」の押し間違いを「もどす」で取り消せる', undo.p1 === undo.p0 + 1 && undo.p2 === undo.p0, undo);
  await shot('04_いまつぎ_タブレット横');
  await ev(`document.querySelector('.tell-btn').click();`);
  await waitFor(`location.hash.endsWith('/tell') && document.querySelector('.tellgrid .card-btn')`);
  await settle();
  const oneTap = await ev(`return [...document.querySelectorAll('.tellgrid .card-btn')].map(b=>b.getAttribute('aria-label'));`);
  record('3-b', '「いま・つぎ」から1回の操作で「つたえる」が開き、「やすみたい」がある', oneTap.includes('やすみたい'), oneTap);
  await shot('05_つたえる');
  await ev(`[...document.querySelectorAll('.tellgrid .card-btn')].find(b=>b.getAttribute('aria-label')==='やすみたい').click();`);
  await waitFor(`document.querySelector('.big-overlay')`);
  await shot('06_つたえる_拡大');
  const bigOk = await ev(`return document.querySelector('.big-overlay .card-text').textContent;`);
  await ev(`document.querySelector('.close-big').click();`);
  const closed = await ev(`return !document.querySelector('.big-overlay') && location.hash.endsWith('/tell');`);
  record('3-c', 'カードを拡大して見せ、「とじる」で戻れる（誤タップの取り消し）', bigOk === 'やすみたい' && closed);
  const posAfterTell = await ev(`return S.boards[0].pos;`);
  record('3-d', '「つたえる」を使っても予定は進まない・止まらない（得点・制限なし）', posAfterTell === undo.p0);

  // 読み上げ：初期は無音
  const speech = await ev(`let n=0; const orig=window.speechSynthesis&&speechSynthesis.speak; if(orig) speechSynthesis.speak=function(){n++;};
    const b=S.boards[0]; showBig(b,b.requests[0]); document.querySelector('.close-big').click(); step(b,1); step(b,-1);
    if(orig) speechSynthesis.speak=orig; return {speechSetting:b.settings.speech, calls:n};`);
  record('3-e', '読み上げは初期状態で無音（音声APIを呼ばない）', speech.speechSetting === false && speech.calls === 0, speech);

  // キーボード操作
  await ev(`location.hash='#/b/'+S.boards[0].id;`); await settle();
  const kb = {};
  kb.p0 = await ev(`document.querySelector('.done-btn').focus(); return S.boards[0].pos;`);
  await P('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
  await P('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await settle();
  kb.p1 = await ev(`return S.boards[0].pos;`);
  kb.focusAfter = await ev(`return document.activeElement && document.activeElement.className;`);
  await ev(`document.querySelector('.back-btn').click();`); await settle();
  await ev(`location.hash='#/b/'+S.boards[0].id+'/tell';`); await settle();
  await ev(`document.querySelector('.tellgrid .card-btn').focus();`);
  await P('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, text: ' ' });
  await P('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
  await settle();
  kb.bigOpen = await ev(`return !!document.querySelector('.big-overlay');`);
  await P('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await settle();
  kb.bigClosed = await ev(`return !document.querySelector('.big-overlay');`);
  const outline = await ev(`const b=document.querySelector('.tellgrid .card-btn'); b.focus(); const cs=getComputedStyle(b); return cs.outlineStyle+' '+cs.outlineWidth;`);
  kb.focusStyle = outline;
  record('4-a', 'キーボードで「おわった」・カード選択・拡大の終了ができ、フォーカス枠が見える', kb.p1 === kb.p0 + 1 && kb.bigOpen && kb.bigClosed && /solid 4px/.test(outline), kb);

  // 支援者メニューへの確認（長押しでなく数字の順番）
  await ev(`S.adultUntil=0; location.hash='#/b/'+S.boards[0].id;`); await settle();
  await ev(`document.querySelector('.adult-btn').click();`); await settle();
  const gate = await ev(`const seq=document.querySelector('.gate-seq strong').textContent.split(' → ').map(Number);
    const keys=[...document.querySelectorAll('.keypad .key')];
    const wrong=keys.find(k=>Number(k.textContent)!==seq[0]); wrong.click(); await new Promise(r=>setTimeout(r,50));
    const afterWrong=!!document.querySelector('.keypad');
    for(const n of seq){ keys.find(k=>Number(k.textContent)===n).click(); await new Promise(r=>setTimeout(r,50)); }
    await new Promise(r=>setTimeout(r,200));
    return {afterWrong, menu: !!document.querySelector('.menu-list')};`);
  record('4-b', '子ども用画面から編集へは確認（数字を順番に押す）を通らないと入れない', gate.afterWrong && gate.menu, gate);
  await ev(`closeModal();`);

  // 見た目の調整（2・4・6枚、文字、表記、配色）
  await ev(`location.hash='#/b/'+S.boards[0].id+'/edit/look';`); await settle();
  await shot('07_見た目と操作');
  await ev(`document.getElementById('s-choices-6').click();`); await settle();
  await ev(`document.getElementById('s-script-kanji').click();`); await settle();
  await ev(`document.getElementById('s-fontScale-1.6').click();`); await settle();
  const look = await ev(`const s=(await DB.board(S.boards[0].id)).settings; return {choices:s.choices, script:s.script, fontScale:s.fontScale};`);
  record('4-c', '枚数・表記・文字の大きさの変更が保存される', look.choices === 6 && look.script === 'kanji' && look.fontScale === 1.6, look);
  await ev(`location.hash='#/b/'+S.boards[0].id+'/tell';`); await settle();
  const six = await ev(`return document.querySelectorAll('.tellgrid .card-btn').length;`);
  record('4-d', '6枚表示の設定で1画面に6枚出る', six === 6, six);
  await ev(`const s=S.boards[0].settings; s.choices=4; s.fontScale=1; s.script='hira'; await DB.putBoard(S.boards[0]);`);

  // 入力文字をHTMLとして実行しない
  const xss = await ev(`const b=S.boards[0]; b.requests[0].hira='<img src=x onerror="window.__xss=1">'; viewTell(b);
    await new Promise(r=>setTimeout(r,300)); const t=document.querySelector('.tellgrid .card-text').textContent;
    const injected=[...document.querySelectorAll('img')].some(i=>i.getAttribute('src')==='x');
    b.requests[0].hira='やすみたい'; return {shownAsText:t.startsWith('<img'), injected, executed:!!window.__xss};`);
  record('5-a', '入力した文字はHTMLとして実行されず、文字のまま表示される', xss.shownAsText && !xss.injected && !xss.executed, xss);

  // 写真込みの書き出し・復元
  await ev(`createBoard('older');`); await waitFor(`S.boards.length===2`); await settle();
  await ev(`location.hash='#/data';`); await settle();
  await shot('08_データの保存');
  for (const f of fs.readdirSync(DL)) fs.unlinkSync(path.join(DL, f));
  await ev(`document.querySelector('.panel .btn.primary').click();`);
  let backupFile = null;
  for (let i = 0; i < 50 && !backupFile; i++) { await sleep(200); backupFile = fs.readdirSync(DL).find((f) => f.endsWith('.json')); }
  let backup = null;
  if (backupFile) backup = JSON.parse(fs.readFileSync(path.join(DL, backupFile), 'utf8'));
  record('5-b', 'バックアップを書き出すと、写真を含むファイルが保存される', backup && backup.format === 'imatsugi-tsutaeru-backup' && backup.boards.length === 2 && backup.images.length === 1 && backup.note.includes('写真'),
    backup ? { file: backupFile, boards: backup.boards.length, images: backup.images.length, bytes: fs.statSync(path.join(DL, backupFile)).size } : 'ダウンロードなし');
  if (backup) fs.writeFileSync(path.join(OUT, 'テスト用バックアップ_合成画像のみ.json'), JSON.stringify(backup));

  async function importText(text, name = 'backup.json') {
    await ev(`window.__lastNotice=''; const f=new File([${JSON.stringify(text)}], ${JSON.stringify(name)}, {type:'application/json'}); importBackup(f);`);
    await sleep(900);
    return ev(`return {notice: document.getElementById('notice').textContent, confirm: !!document.querySelector('.modal-back'), confirmText: document.querySelector('.modal-body') ? document.querySelector('.modal-body').textContent : ''};`);
  }
  if (backup) {
    const r = await importText(JSON.stringify(backup));
    await ev(`[...document.querySelectorAll('.modal-actions .btn')].find(b=>b.textContent==='追加する').click();`);
    await sleep(800);
    const st = await ev(`return {names:S.boards.map(b=>b.name), photos:S.boards.filter(b=>b.schedule.some(c=>c.img.type==='photo')).length, imgs:(await DB.imageIds()).length};`);
    record('5-c', '復元は今のボードを上書きせず「追加」する（写真も戻る）', r.confirm && /今あるボードはそのまま残ります/.test(r.confirmText) && st.names.length === 4 && st.names.filter((n) => n.includes('復元')).length === 2 && st.photos === 2 && st.imgs === 2, { confirm: r.confirmText, ...st });
  }
  const broken = {};
  broken.notJson = await importText('{これは壊れた');
  broken.otherFormat = await importText(JSON.stringify({ format: 'something-else', boards: [] }));
  broken.newVersion = await importText(JSON.stringify({ format: 'imatsugi-tsutaeru-backup', version: 2, boards: [], images: [] }));
  broken.empty = await importText(JSON.stringify({ format: 'imatsugi-tsutaeru-backup', version: 1, boards: [], images: [] }));
  const cntBefore = await ev(`return S.boards.length;`);
  record('5-d', '壊れたファイル・別形式・新しい版・空のファイルは読み込まず、理由を表示する',
    /読み取れません/.test(broken.notJson.notice) && /バックアップファイルではありません/.test(broken.otherFormat.notice) && /新しい版/.test(broken.newVersion.notice) && /入っていません/.test(broken.empty.notice) && !broken.notJson.confirm && cntBefore === 4,
    Object.fromEntries(Object.entries(broken).map(([k, v]) => [k, v.notice.replace('閉じる', '')])));
  // 画像部分が壊れている → 写真だけ外して追加（カードは絵に戻す）
  if (backup) {
    const bad = JSON.parse(JSON.stringify(backup)); bad.boards = [bad.boards[0]]; bad.images = [{ id: bad.images[0].id, type: 'image/jpeg', data: 'AAAAAAAA' }];
    bad.boards[0].schedule[0].hira = '<b>テスト</b>';
    const r = await importText(JSON.stringify(bad));
    record('5-e', '写真データが壊れていても、その写真だけ外して追加を確認する', r.confirm && /読み取れなかった写真が1枚/.test(r.confirmText), r.confirmText);
    await ev(`closeModal();`);
    // 容量の上限を超えるファイル
    const r2 = await ev(`const old=LIMITS.backupBytes; LIMITS.backupBytes=100; importBackup(new File(['x'.repeat(200)],'big.json')); LIMITS.backupBytes=old; await new Promise(r=>setTimeout(r,300)); return document.getElementById('notice').textContent;`);
    record('5-f', '大きすぎるファイルは読み込まない', /大きすぎます/.test(r2), r2);
  }

  // 保存容量不足：保存できる容量を実際に小さくして、写真の保存を試す
  // Chrome 153 では DevTools の容量上書き（Storage.overrideQuotaForOrigin）が効かないため、
  // IndexedDB への書き込みで QuotaExceededError を起こして、アプリ側の扱いを確認する（疑似的な容量不足）。
  const quota = await ev(`const origPut=IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put=function(v,k){ if(this.name==='images') throw new DOMException('The quota has been exceeded.','QuotaExceededError'); return origPut.apply(this,arguments); };
    const b=S.boards[0]; const before=JSON.stringify((await DB.board(b.id)).requests.map(c=>c.hira));
    const imgsBefore=(await DB.imageIds()).length;
    location.hash='#/b/'+b.id+'/edit/requests'; await new Promise(r=>setTimeout(r,300));
    cardEditor(b,'requests',-1); document.getElementById('m-photo').click();
    const c=document.createElement('canvas'); c.width=1600; c.height=1600; const x=c.getContext('2d');
    for(let i=0;i<4000;i++){ x.fillStyle='hsl('+(i*37%360)+',70%,'+(30+i%50)+'%)'; x.fillRect(Math.random()*1600,Math.random()*1600,40,40); }
    const blob=await new Promise(r=>c.toBlob(r,'image/png')); const f=new File([blob],'noise.png',{type:'image/png'});
    const dt=new DataTransfer(); dt.items.add(f); const inp=document.getElementById('f-photo'); inp.files=dt.files; inp.dispatchEvent(new Event('change'));
    for(let i=0;i<40&&!document.getElementById('f-z');i++) await new Promise(r=>setTimeout(r,100));
    document.getElementById('f-hira').value='ようりょうテスト'; document.getElementById('editor-save').click();
    for(let i=0;i<40&&document.querySelector('.form-error')&&!document.querySelector('.form-error').textContent;i++) await new Promise(r=>setTimeout(r,100));
    const fe=document.querySelector('.form-error'); const msg=fe?fe.textContent:'(保存された) '+document.getElementById('notice').textContent; closeModal();
    IDBObjectStore.prototype.put=origPut;
    const reloaded=await DB.board(b.id);
    return {msg, sameRequests: JSON.stringify(reloaded.requests.map(c=>c.hira))===before, imgsAfter:(await DB.imageIds()).length, imgsBefore};`);
  record('5-g', '保存容量が足りないとき（疑似的に発生）、今までのデータを守って分かりやすく知らせる', /容量が足りない/.test(quota.msg) && /そのまま残っています/.test(quota.msg) && quota.sameRequests && quota.imgsAfter === quota.imgsBefore, quota);

  // 印刷（A4・PDF）
  const printOpts = [['cards', 'both', 'L'], ['cards', 'both', 'S'], ['board', 'schedule', 'L'], ['board', 'schedule', 'S']];
  const pdfInfo = [];
  for (const [kind, target, size] of printOpts) {
    await ev(`PRINT.kind='${kind}'; PRINT.target='${target}'; PRINT.size='${size}'; S.adultUntil=Date.now()+600000; location.hash='#/b/'+S.boards[0].id+'/print'; viewPrint(S.boards[0]);`);
    await sleep(700);
    const expect = await ev(`return document.querySelectorAll('.sheet').length;`);
    const cards = await ev(`return document.querySelectorAll('.pcard').length;`);
    const clipped = await ev(`return [...document.querySelectorAll('.pcard')].filter(p=>{const t=p.querySelector('.pcard-text'); return t.scrollWidth>p.clientWidth || t.getBoundingClientRect().right>p.getBoundingClientRect().right+0.5 || t.getBoundingClientRect().left<p.getBoundingClientRect().left-0.5;}).map(p=>p.textContent);`);
    const imgsLoaded = await ev(`return [...document.querySelectorAll('.sheet img')].every(i=>i.complete&&i.naturalWidth>0);`);
    const r = await P('Page.printToPDF', { preferCSSPageSize: true, printBackground: true });
    const name = `印刷_${kind === 'cards' ? 'カードだけ' : '台紙つき'}_${size === 'L' ? '10cm' : '6cm'}.pdf`;
    const buf = Buffer.from(r.data, 'base64');
    fs.writeFileSync(path.join(OUT, '印刷', name), buf);
    let pages = -1;
    try { pages = Number((execFileSync('pdfinfo', [path.join(OUT, '印刷', name)]).toString().match(/Pages:\s+(\d+)/) || [])[1]); } catch (e) { /* pdfinfo がない環境 */ }
    pdfInfo.push({ name, sheets: expect, pdfPages: pages, cards, clipped, imgsLoaded });
    if (kind === 'cards' && size === 'L') await shot('09_印刷_見本');
  }
  record('6-a', 'A4印刷・PDF保存で、見本の枚数とPDFのページ数が一致し、文字の欠け・画像の読み込み漏れがない',
    pdfInfo.every((p) => p.sheets === p.pdfPages && p.clipped.length === 0 && p.imgsLoaded), pdfInfo);
  const same = await ev(`const b=S.boards[0]; PRINT.kind='cards'; PRINT.target='both'; PRINT.size='L'; viewPrint(b); await new Promise(r=>setTimeout(r,300));
    const printed=[...document.querySelectorAll('.pcard')].map(p=>({t:p.querySelector('.pcard-text').textContent, src:(p.querySelector('img')||{}).getAttribute ? p.querySelector('img').getAttribute('src') : null}));
    const screen=b.schedule.concat(b.requests).map(c=>({t:cardText(c,b), src:cardSrc(c,b)}));
    return {same: JSON.stringify(printed)===JSON.stringify(screen), n:printed.length};`);
  record('6-b', '画面と紙で、言葉と写真・絵が同じ', same.same, same);

  // 7. 通信：外部への送信がない
  const external = [...new Set(requests.filter((u) => !u.startsWith(ORIGIN) && !u.startsWith('blob:') && !u.startsWith('data:') && !u.startsWith('about:')))];
  record('7-a', '操作中の通信は、アプリを置いた場所（' + ORIGIN + '）の読み込みだけ', external.length === 0, { total: requests.length, external });
  const posts = await ev(`return performance.getEntriesByType('resource').filter(e=>!e.name.startsWith(location.origin)).map(e=>e.name);`);
  record('7-b', 'ページが読み込んだリソースに外部のものがない', posts.length === 0, posts);

  // 2-b. 通信を切っても主要画面が使える
  await ev(`location.hash='#/b/'+S.boards[0].id;`); await settle();
  const swReady = await waitFor(`navigator.serviceWorker && navigator.serviceWorker.controller`, 8000);
  await P('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await reload();
  const off = await ev(`const r={}; r.now=!!document.querySelector('.frame-now'); const imgs=[...document.images]; r.imgs=imgs.every(i=>i.complete&&i.naturalWidth>0);
    location.hash='#/b/'+S.boards[0].id+'/tell'; await new Promise(r=>setTimeout(r,400)); r.tell=document.querySelectorAll('.tellgrid .card-btn').length>0;
    r.tellImgs=[...document.images].every(i=>i.complete&&i.naturalWidth>0);
    location.hash='#/data'; await new Promise(r=>setTimeout(r,300)); r.data=document.body.textContent.includes('通信がなくても開けます'); return r;`);
  record('2-b', '通信を切って再読み込みしても、いま・つぎ／つたえる／データ画面が使える', swReady && off.now && off.imgs && off.tell && off.tellImgs && off.data, off);
  await P('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

  // 見本画面（スマホ縦・小学生サンプル・暗め）
  await viewport(390, 844, true);
  await ev(`const b=S.boards.find(x=>x.name==='サンプル（小学生）'); location.hash='#/b/'+b.id;`); await settle();
  await shot('10_いまつぎ_スマホ縦_小学生');
  await ev(`const b=S.boards.find(x=>x.name==='サンプル（小学生）'); location.hash='#/b/'+b.id+'/tell';`); await settle();
  await shot('11_つたえる_スマホ縦_小学生');
  await viewport(1180, 820);

  // 全消去（確認つき）
  await ev(`location.hash='#/data';`); await settle();
  const clear = await ev(`document.querySelector('.danger-zone .btn.danger').click(); await new Promise(r=>setTimeout(r,200));
    const go=document.getElementById('clear-go'); const disabledFirst=go.disabled;
    document.getElementById('f-clear').click(); await new Promise(r=>setTimeout(r,50)); const enabled=!go.disabled; go.click();
    await new Promise(r=>setTimeout(r,600)); return {disabledFirst, enabled, boards:(await DB.boards()).length, images:(await DB.imageIds()).length, list: location.hash};`);
  record('5-h', '全消去は確認のチェックを入れるまで押せず、実行するとボードと写真が消える', clear.disabledFirst && clear.enabled && clear.boards === 0 && clear.images === 0, clear);

  record('8-a', '操作中にJavaScriptのエラーが出ない', consoleErrors.length === 0, consoleErrors.slice(0, 5));
} catch (e) {
  record('X', 'テストの実行中に止まった', false, String(e && e.stack || e));
} finally {
  const summary = { date: new Date().toISOString(), base: BASE, browser: version.Browser, passed: results.filter((r) => r.ok).length, total: results.length, results };
  fs.writeFileSync(path.join(OUT, '結果.json'), JSON.stringify(summary, null, 2));
  console.log(`\n${summary.passed} / ${summary.total} 合格  (${version.Browser})`);
  try { ws.close(); } catch (e) { /* */ }
  chrome.kill();
  await sleep(800);
  try { fs.rmSync(PROFILE, { recursive: true, force: true }); fs.rmSync(DL, { recursive: true, force: true }); } catch (e) { /* 一時フォルダは残っても害はない */ }
  process.exit(0);
}
