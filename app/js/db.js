/* 端末内保存（IndexedDB）。サーバーへは何も送らない。
   stores: boards（ボード） / images（取り込んだ写真。ArrayBufferで保存） */
'use strict';

var DB = (function () {
  var NAME = 'imatsugi-board';
  var VERSION = 1;
  var dbp = null;

  function AppError(code, message) {
    var e = new Error(message || code);
    e.appCode = code;
    return e;
  }

  function isQuota(err) {
    if (!err) return false;
    return err.name === 'QuotaExceededError' || err.code === 22 ||
      /quota|space|storage/i.test(String(err.message || ''));
  }

  function wrapErr(err) {
    if (err && err.appCode) return err;
    if (isQuota(err)) return AppError('quota', '保存できる容量が足りません');
    return AppError('db', (err && err.message) || '保存に失敗しました');
  }

  function open() {
    if (dbp) return dbp;
    dbp = new Promise(function (resolve, reject) {
      if (!('indexedDB' in window) || !window.indexedDB) {
        reject(AppError('nodb', 'このブラウザでは端末内に保存できません'));
        return;
      }
      var req;
      try { req = indexedDB.open(NAME, VERSION); } catch (e) { reject(AppError('nodb', e.message)); return; }
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('boards')) db.createObjectStore('boards', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('images')) db.createObjectStore('images', { keyPath: 'id' });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(AppError('nodb', (req.error && req.error.message) || '保存領域を開けません')); };
      req.onblocked = function () { reject(AppError('nodb', 'ほかのタブで開いているため保存領域を開けません')); };
    });
    dbp.catch(function () { dbp = null; });
    return dbp;
  }

  // work(tx) の中で行った変更は、すべて成功したときだけ確定する（途中で失敗したら元のまま）。
  function tx(stores, mode, work) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t, result;
        try { t = db.transaction(stores, mode); } catch (e) { reject(wrapErr(e)); return; }
        t.oncomplete = function () { resolve(result); };
        t.onabort = function () { reject(wrapErr(t.error)); };
        try {
          result = work(t);
        } catch (e) {
          try { t.abort(); } catch (e2) { /* 既に終了 */ }
          reject(wrapErr(e));
        }
      });
    });
  }

  function reqP(r) {
    return new Promise(function (resolve, reject) {
      r.onsuccess = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error); };
    });
  }

  function getAll(store) {
    return open().then(function (db) {
      return reqP(db.transaction(store, 'readonly').objectStore(store).getAll());
    }).catch(function (e) { throw wrapErr(e); });
  }

  function get(store, id) {
    return open().then(function (db) {
      return reqP(db.transaction(store, 'readonly').objectStore(store).get(id));
    }).catch(function (e) { throw wrapErr(e); });
  }

  return {
    AppError: AppError,
    open: open,
    boards: function () { return getAll('boards'); },
    board: function (id) { return get('boards', id); },
    image: function (id) { return get('images', id); },
    imageIds: function () {
      return open().then(function (db) {
        return reqP(db.transaction('images', 'readonly').objectStore('images').getAllKeys());
      });
    },
    putBoard: function (b) {
      return tx(['boards'], 'readwrite', function (t) { t.objectStore('boards').put(b); });
    },
    putImage: function (img) {
      return tx(['images'], 'readwrite', function (t) { t.objectStore('images').put(img); });
    },
    // ボードと写真をまとめて保存（復元・複製用）。1件でも失敗したら何も保存しない。
    putMany: function (boards, images) {
      return tx(['boards', 'images'], 'readwrite', function (t) {
        images.forEach(function (i) { t.objectStore('images').put(i); });
        boards.forEach(function (b) { t.objectStore('boards').put(b); });
      });
    },
    deleteBoard: function (id) {
      return tx(['boards'], 'readwrite', function (t) { t.objectStore('boards').delete(id); });
    },
    deleteImages: function (ids) {
      if (!ids.length) return Promise.resolve();
      return tx(['images'], 'readwrite', function (t) {
        ids.forEach(function (id) { t.objectStore('images').delete(id); });
      });
    },
    clearAll: function () {
      return tx(['boards', 'images'], 'readwrite', function (t) {
        t.objectStore('boards').clear();
        t.objectStore('images').clear();
      });
    }
  };
})();
