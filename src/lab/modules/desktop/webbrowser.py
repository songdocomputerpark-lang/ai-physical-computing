"""webbrowser 흉내 모듈 — 가상 데스크톱 안의 가상 브라우저 창을 연다(PLAN §8.2 P2-12, CODE_MAPPING §3.4 WEB, SPEC §6.1·§8).

왜 필요한가
- 브라우저 안(웹 워커)에서는 파이썬 표준 라이브러리 `webbrowser`가 돌지 않는다. Pyodide 314.0.7이 등록해 둔 'default' 브라우저는
  `from js import window` → `window.open(url)`을 쓰는데, 모듈 워커의 전역은 `self`라 `window`가 없다.
  실제로 확인한 결과(2026-09-16, Node의 진짜 Pyodide): `webbrowser.open("https://example.com/")` →
  `ImportError: cannot import name 'window' from 'js'`. 학생에게 아무 뜻이 없는 영어 오류다.
- 설령 열 수 있어도 다른 웹사이트를 새 탭으로 여는 것은 수업에 맞지 않고(학생 컴퓨터 밖으로 나가는 요청), 그 화면을 흉내 내는 것은
  상표·사칭 문제가 된다(SPEC §8). 그래서 **페이지 안에 그린 가상 브라우저 창**을 연다.

이 모듈이 하는 일: `open(url)`이 화면에 `desktop.browser` 이벤트를 보낸다 → 가상 데스크톱이 브라우저 창을 열고 주소를 보여 준다.
우리 사이트 주소면 "진짜로 열어 볼 수 있어요", 그 밖의 주소면 "가상 브라우저에서만 열려요"라고 알린다(browser.ts의 허용 목록).
**진짜 인터넷 요청은 한 번도 나가지 않는다.**

/apc 폴더가 sys.path 맨 앞이라 이 파일이 표준 라이브러리 webbrowser를 가린다(apc_shims의 등록표는 쓰지 않는다 —
등록표는 '받아 둔 진짜 패키지를 덮어쓸 때'만 쓴다). 규칙(src/lab/README.md 4.4): apc_runtime의 emit·notice만 쓴다.
"""

import apc_runtime

__all__ = ["Error", "open", "open_new", "open_new_tab", "get", "register"]

EVENT_BROWSER = "desktop.browser"  # manifest.ts의 eventKinds와 같아야 한다


class Error(Exception):
    """표준 라이브러리와 같은 이름의 오류(브라우저를 찾지 못했을 때). 이 흉내 모듈은 언제나 가상 브라우저를 쓰므로 나지 않는다."""


def open(url, new=0, autoraise=True):  # noqa: A001 - 표준 라이브러리와 같은 이름을 써야 한다
    """가상 브라우저 창에 주소를 연다. 표준 라이브러리처럼 True를 돌려준다(연 것으로 본다).

    new·autoraise는 진짜 모듈과 맞추려고 받기만 한다(가상 브라우저는 창이 하나다).
    """
    address = str(url)
    apc_runtime.emit(EVENT_BROWSER, {"url": address, "new": int(new or 0)})
    return True


def open_new(url):
    """새 창으로 열기(가상 브라우저는 창이 하나라 open과 같다)."""
    return open(url, 1)


def open_new_tab(url):
    """새 탭으로 열기(가상 브라우저는 탭이 없어 open과 같다)."""
    return open(url, 2)


class _VirtualBrowser:
    """webbrowser.get()이 돌려주는 브라우저 객체(표준 라이브러리와 같은 모양)."""

    name = "apc-virtual"
    basename = "apc-virtual"

    def open(self, url, new=0, autoraise=True):
        return open(url, new, autoraise)

    def open_new(self, url):
        return open_new(url)

    def open_new_tab(self, url):
        return open_new_tab(url)


_BROWSER = _VirtualBrowser()


def get(using=None):
    """이름으로 브라우저를 고른다. 이 사이트에는 가상 브라우저 하나뿐이라 무엇을 적어도 같은 것을 돌려준다."""
    if using not in (None, "", "apc-virtual"):
        apc_runtime.notice(
            f"'{using}' 브라우저는 이 사이트에 없어서 가상 브라우저를 써요(진짜 PC에서는 그 브라우저가 열려요).",
            "info",
        )
    return _BROWSER


def register(name, klass, instance=None, *, preferred=False):
    """브라우저 등록(표준 라이브러리와 같은 이름). 가상 브라우저만 쓰므로 받아만 두고 아무 일도 하지 않는다."""
    return None
