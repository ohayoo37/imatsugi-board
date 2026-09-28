/* 写真の取り込み。端末内で縮小・切り抜き・JPEGに再保存する。
   再保存するため、撮影日時や位置情報（Exif）は残らない。 */
'use strict';

var Photo = (function () {
  var MAX_FILE = 40 * 1024 * 1024; // 40MBを超える画像は受け付けない
  var WORK_MAX = 1600;             // 切り抜き作業用に縮小する長辺
  var OUT = 640;                   // 保存するカード画像の一辺(px)

  function loadViaImg(blob) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('decode')); };
      img.src = url;
    });
  }

  // ファイルを読み、長辺WORK_MAXに縮小したcanvasを返す
  function loadFile(file) {
    if (!file) return Promise.reject(DB.AppError('nofile', '写真が選ばれていません'));
    if (file.size > MAX_FILE) return Promise.reject(DB.AppError('toolarge', '写真のファイルが大きすぎます（40MBまで）'));
    if (file.type && !/^image\//.test(file.type)) return Promise.reject(DB.AppError('notimage', '画像ファイルを選んでください'));
    var p = ('createImageBitmap' in window)
      ? createImageBitmap(file, { imageOrientation: 'from-image' }).catch(function () { return loadViaImg(file); })
      : loadViaImg(file);
    return p.then(function (src) {
      var w = src.width || src.naturalWidth, h = src.height || src.naturalHeight;
      if (!w || !h) throw DB.AppError('decode', 'この写真は読み込めませんでした');
      var k = Math.min(1, WORK_MAX / Math.max(w, h));
      var c = document.createElement('canvas');
      c.width = Math.round(w * k); c.height = Math.round(h * k);
      var ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(src, 0, 0, c.width, c.height);
      if (src.close) src.close();
      return c;
    }, function (e) {
      if (e && e.appCode) throw e;
      throw DB.AppError('decode', 'この写真は読み込めませんでした（別の形式で保存した写真をお試しください）');
    });
  }

  // crop: {zoom:1〜4, cx:0〜1, cy:0〜1, rot:0/90/180/270}
  function draw(ctx, src, crop, size) {
    var rot = ((crop.rot || 0) % 360 + 360) % 360;
    var sw = src.width, sh = src.height;
    var rw = (rot === 90 || rot === 270) ? sh : sw;
    var rh = (rot === 90 || rot === 270) ? sw : sh;
    var vs = Math.min(rw, rh) / (crop.zoom || 1); // 見える範囲（元画像px）
    var cx = clamp((crop.cx == null ? 0.5 : crop.cx) * rw, vs / 2, rw - vs / 2);
    var cy = clamp((crop.cy == null ? 0.5 : crop.cy) * rh, vs / 2, rh - vs / 2);
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    ctx.translate(size / 2, size / 2);
    ctx.scale(size / vs, size / vs);
    ctx.translate(-cx, -cy);
    ctx.translate(rw / 2, rh / 2);
    ctx.rotate(rot * Math.PI / 180);
    ctx.drawImage(src, -sw / 2, -sh / 2);
    ctx.restore();
    return { vs: vs, rw: rw, rh: rh };
  }

  function clamp(v, a, b) { return b < a ? (a + b) / 2 : Math.max(a, Math.min(b, v)); }

  function toJpeg(src, crop) {
    var c = document.createElement('canvas');
    c.width = OUT; c.height = OUT;
    draw(c.getContext('2d'), src, crop, OUT);
    return new Promise(function (resolve, reject) {
      if (c.toBlob) {
        c.toBlob(function (b) { b ? resolve(b) : reject(DB.AppError('encode', '写真を保存用に変換できませんでした')); }, 'image/jpeg', 0.85);
      } else {
        var bin = atob(c.toDataURL('image/jpeg', 0.85).split(',')[1]);
        var arr = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        resolve(new Blob([arr], { type: 'image/jpeg' }));
      }
    });
  }

  function blobToBuffer(blob) {
    if (blob.arrayBuffer) return blob.arrayBuffer();
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error); };
      r.readAsArrayBuffer(blob);
    });
  }

  function bufToBase64(buf) {
    var bytes = new Uint8Array(buf), s = '', CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    }
    return btoa(s);
  }

  function base64ToBuf(b64) {
    var bin = atob(b64);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr.buffer;
  }

  // 復元時：本当に画像として読めるか確認する
  function verifyImage(buf, type) {
    return loadViaImg(new Blob([buf], { type: type })).then(function (img) {
      return img.naturalWidth > 0 && img.naturalHeight > 0;
    }, function () { return false; });
  }

  return {
    loadFile: loadFile, draw: draw, toJpeg: toJpeg,
    blobToBuffer: blobToBuffer, bufToBase64: bufToBase64, base64ToBuf: base64ToBuf,
    verifyImage: verifyImage, OUT: OUT
  };
})();
