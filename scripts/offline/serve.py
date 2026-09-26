#!/usr/bin/env python3
"""AI 피지컬 컴퓨팅 오픈랩 — 오프라인판 작은 웹 서버(파이썬판, PLAN §5.6 P6-07).

Windows에서는 시작하기.bat(PowerShell 서버 serve.ps1)를 먼저 써요. 이 파일은 그 방법이 막혔을 때나 macOS·Linux에서 써요.
파이썬 3.8 이상이면 따로 설치할 것이 없어요(표준 라이브러리만 씀).

    python3 server/serve.py              # macOS·Linux (오프라인판 폴더에서)
    py server\\serve.py                  # Windows(파이썬을 설치했을 때)
    python3 server/serve.py --port 9000 --no-browser

- 이 컴퓨터 안(127.0.0.1)에서만 열어요. 다른 컴퓨터에서는 접속할 수 없어요.
- 파일 종류(MIME)를 이 파일의 표로 정해요 — 파이썬의 기본 표는 운영체제마다 달라서 .mjs·.wasm을 잘못 알려 주기도 해요
  (그러면 브라우저가 파이썬 실행기를 불러오지 않아요). 표는 scripts/lib/offline-site.mjs의 OFFLINE_MIME_TYPES와 같아야 해요.
- 폴더 목록을 보여 주지 않고, 점(.)으로 시작하는 파일은 주지 않아요. GET·HEAD만 받아요.
"""

from __future__ import annotations

import argparse
import functools
import http.server
import os
import posixpath
import sys
import urllib.parse
import webbrowser

# 파일 종류(MIME) 표 — scripts/lib/offline-site.mjs의 OFFLINE_MIME_TYPES와 같아야 해요
MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.htm': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.py': 'text/x-python; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.ico': 'image/x-icon',
    '.cur': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.otf': 'font/otf',
    '.ttf': 'font/ttf',
    '.wasm': 'application/wasm',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip',
    '.whl': 'application/zip',
    '.bin': 'application/octet-stream',
    '.task': 'application/octet-stream',
    '.tflite': 'application/octet-stream',
    '.pagefind': 'application/octet-stream',
    '.pf_fragment': 'application/octet-stream',
    '.pf_index': 'application/octet-stream',
    '.pf_meta': 'application/octet-stream',
}
DEFAULT_MIME = 'application/octet-stream'
LOOPBACK = '127.0.0.1'


def long_path(path: str) -> str:
    """Windows에서 전체 경로가 260글자를 넘는 파일도 찾고 열 수 있게 \\\\?\\ 머리를 붙인다(다른 운영체제는 그대로).

    Windows는 긴 경로 설정(LongPathsEnabled)이 꺼져 있으면 260글자가 넘는 파일을 "없다"고 본다. 반디집·7-Zip·tar는 깊은 폴더에도
    끝까지 풀어 버려서, 그런 곳에 풀면 opencv·numpy 휠이 404가 되어 첫 실습이 멈췄다(2026-09-26 Phase 6 검토 — serve.ps1과 같은 까닭).
    """
    if os.name != 'nt':
        return path
    trailing = path.endswith(('/', '\\'))
    full = os.path.abspath(path)
    if full.startswith('\\\\?\\'):
        prefixed = full
    elif full.startswith('\\\\'):
        prefixed = '\\\\?\\UNC\\' + full[2:]
    else:
        prefixed = '\\\\?\\' + full
    return prefixed + ('\\' if trailing and not prefixed.endswith('\\') else '')


class OfflineHandler(http.server.SimpleHTTPRequestHandler):
    """site 폴더만 내보내는 처리기(폴더 목록 없음, 숨은 파일 없음, 사이트의 404 쪽)."""

    server_version = 'apc-offline'
    sys_version = ''
    allowed_hosts: frozenset[str] = frozenset()

    def guess_type(self, path: str) -> str:  # noqa: D401 - 표준 이름
        return MIME_TYPES.get(posixpath.splitext(path)[1].lower(), DEFAULT_MIME)

    def end_headers(self) -> None:
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()

    def list_directory(self, path):  # 폴더 목록은 보여 주지 않는다
        self.send_not_found()
        return None

    def log_message(self, format: str, *args) -> None:  # noqa: A002 - 표준 이름
        # 요청마다 줄을 찍지 않는다(교실 화면이 어지럽지 않게). 오류만 아래에서 알린다.
        return

    def _host_ok(self) -> bool:
        host = (self.headers.get('Host') or '').lower()
        return host in self.allowed_hosts

    def _hidden(self) -> bool:
        path = urllib.parse.unquote(urllib.parse.urlsplit(self.path).path)
        return any(part.startswith('.') for part in path.split('/') if part) or '\\' in path or '\x00' in path

    def translate_path(self, path: str) -> str:
        # 표준 처리기의 경로(site 폴더 기준)에 Windows 긴 경로 머리를 붙인다 — isdir·isfile·open이 모두 이 경로를 쓴다
        return long_path(super().translate_path(path))

    def send_not_found(self) -> None:
        page = long_path(os.path.join(self.directory, '404.html'))
        if os.path.isfile(page):
            with open(page, 'rb') as file:
                body = file.read()
            self.send_response(404)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            if self.command != 'HEAD':
                self.wfile.write(body)
        else:
            self.send_error(404)

    def send_head(self):
        if not self._host_ok():
            # 상태 줄(두 번째 인자)은 영어만(latin-1로 적힌다), 한국어 설명은 본문(세 번째 인자)에
            self.send_error(421, 'Misdirected Request', 'localhost 주소로만 열어요.')
            return None
        if self._hidden():
            self.send_not_found()
            return None
        path = self.translate_path(self.path)
        if not os.path.isdir(path) and not os.path.isfile(path):
            self.send_not_found()
            return None
        return super().send_head()

    def do_POST(self) -> None:  # GET·HEAD만
        self.send_error(405)

    do_PUT = do_POST
    do_DELETE = do_POST
    do_PATCH = do_POST


def open_server(site_dir: str, port: int, tries: int) -> tuple[http.server.ThreadingHTTPServer, int]:
    last_error: Exception | None = None
    for candidate in range(port, port + tries):
        handler = functools.partial(OfflineHandler, directory=site_dir)
        OfflineHandler.allowed_hosts = frozenset({f'localhost:{candidate}', f'{LOOPBACK}:{candidate}'})
        try:
            server = http.server.ThreadingHTTPServer((LOOPBACK, candidate), handler)
            return server, candidate
        except OSError as error:  # 쓰는 중인 포트
            last_error = error
    raise SystemExit(f'[안내] 포트 {port}~{port + tries - 1}을(를) 모두 열지 못했어요: {last_error}')


def main() -> int:
    parser = argparse.ArgumentParser(description='AI 피지컬 컴퓨팅 오픈랩 오프라인판 작은 웹 서버')
    parser.add_argument('--port', type=int, default=8080, help='처음 시도할 포트(기본 8080 — 쓰는 중이면 다음 번호)')
    parser.add_argument('--root', default='', help='내보낼 폴더(기본: 이 파일 옆 폴더의 site)')
    parser.add_argument('--no-browser', action='store_true', help='브라우저를 열지 않아요')
    parser.add_argument('--tries', type=int, default=20, help='포트를 몇 번까지 바꿔 볼지')
    options = parser.parse_args()

    here = os.path.dirname(os.path.abspath(__file__))
    site_dir = os.path.abspath(options.root or os.path.join(here, os.pardir, 'site'))
    if not os.path.isfile(long_path(os.path.join(site_dir, 'index.html'))):
        print(f'[안내] 사이트 파일을 찾지 못했어요: {os.path.join(site_dir, "index.html")} — 압축을 모두 푼 뒤 다시 실행해 주세요.')
        return 1

    server, port = open_server(site_dir, options.port, options.tries)
    address = f'http://localhost:{port}/'
    print()
    print('  AI 피지컬 컴퓨팅 오픈랩 — 오프라인판(파이썬 서버)')
    print(f'  서버가 켜졌어요:  {address}')
    print('  - Chrome이나 Edge에서 위 주소를 열어요. 인터넷 연결은 필요 없어요.')
    print('  - 이 창(터미널)을 닫거나 Ctrl+C를 누르면 멈춰요.')
    print()
    sys.stdout.flush()
    if not options.no_browser:
        try:
            webbrowser.open(address)
        except Exception:  # noqa: BLE001 - 브라우저를 못 열어도 서버는 돈다
            print('  (브라우저를 저절로 열지 못했어요. 주소창에 위 주소를 직접 적어 주세요.)')
    try:
        server.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        print('  서버를 멈췄어요.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
