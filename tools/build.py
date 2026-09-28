#!/usr/bin/env python3
"""app/ のオフライン保存リストを作り、配布用ZIPを作る。
使い方: python3 tools/build.py
"""
import hashlib, os, zipfile, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.path.dirname(HERE)
APP = os.path.join(BASE, 'app')
DIST = os.path.join(BASE, '配布用')
VERSION = '1.0.0'
SKIP = {'.DS_Store', 'precache-list.js'}

def app_files():
    out = []
    for d, _, fs in os.walk(APP):
        for f in sorted(fs):
            if f in SKIP or f.startswith('.'):
                continue
            out.append(os.path.relpath(os.path.join(d, f), APP).replace(os.sep, '/'))
    return sorted(out)

def main():
    files = app_files()
    h = hashlib.sha256()
    for f in files:
        h.update(f.encode()); h.update(open(os.path.join(APP, f), 'rb').read())
    ver = VERSION + '-' + h.hexdigest()[:10]
    cache = ['./'] + [f for f in files if f != 'sw.js']
    with open(os.path.join(APP, 'precache-list.js'), 'w') as fp:
        fp.write('// tools/build.py が自動生成（手で編集しない）\n')
        fp.write('self.PRECACHE = ' + repr({'version': ver, 'files': cache}).replace("'", '"') + ';\n')

    os.makedirs(DIST, exist_ok=True)
    zname = os.path.join(DIST, f'imatsugi-board-v{VERSION}.zip')
    root = f'imatsugi-board-v{VERSION}'
    with zipfile.ZipFile(zname, 'w', zipfile.ZIP_DEFLATED) as z:
        for f in files + ['precache-list.js']:
            z.write(os.path.join(APP, f), f'{root}/app/{f}')
        for extra, p in [('はじめにお読みください.txt', os.path.join(DIST, 'はじめにお読みください.txt')), ('使い方.pdf', os.path.join(DIST, '使い方.pdf')), ('LICENSE', os.path.join(BASE, 'LICENSE'))]:
            if os.path.exists(p):
                z.write(p, f'{root}/{extra}')
    print('version', ver)
    print('files', len(files))
    print('zip', zname, os.path.getsize(zname), 'bytes')

if __name__ == '__main__':
    main()
