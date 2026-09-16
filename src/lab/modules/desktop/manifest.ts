/**
 * 가상 데스크톱 모듈(pyautogui 흉내)의 manifest — PLAN §8.2 P2-11(①)·P2-12(②), CODE_MAPPING §3.4, SPEC §6.1, src/lab/README.md 4절.
 *
 * 학생 코드의 `import pyautogui`는 이 폴더의 pyautogui.py(워커가 /apc에 써 둔 파이썬 모듈)를 받는다. 진짜 pyautogui는 Pyodide에
 * 없으므로 덮어쓸 패키지가 없고(shims 없음), 파일 이름 = import 이름 규칙(python/modules.ts)으로 바로 import된다.
 * 화면 쪽(index.ts)은 영상처리 실습실(labs: vision)에 붙어 전체 폭(placement 'wide')의 가상 모니터를 그린다 — pyautogui 예제는
 * PLAN §2.5대로 영상처리 실습실 예제이고, 3-1-4(f091)·4단원(f095~f097·f104)은 카메라·손 인식과 함께 쓴다.
 *
 * 파이썬 파일이 둘이다: pyautogui.py(마우스·키보드·화면 캡처)와 webbrowser.py(가상 브라우저 창, P2-12).
 * 둘 다 진짜 패키지를 덮어쓰는 것이 아니라 없는 자리를 채우는 것이라 shims 표는 비어 있다(webbrowser는 표준 라이브러리지만
 * /apc가 sys.path 맨 앞이라 파일 이름만으로 가려진다 — 워커에서는 원본이 `from js import window`로 ImportError를 낸다).
 *
 * 이름(모두 "desktop."로 시작, 뜻은 index.ts·pyautogui.py 머리말)
 * - 이벤트(파이썬 → 화면, 기다리지 않음): desktop.open(모듈 첫 사용) · desktop.cursor(커서 이동) · desktop.mouse(버튼 누름·끌기·놓음) ·
 *   desktop.click(클릭 n번째) · desktop.key(키 누름·뗌) · desktop.hotkey(조합키) · desktop.scroll(스크롤) ·
 *   desktop.browser(webbrowser.open → 가상 브라우저 창) · desktop.file(screenshot 저장 → '내 파일' 미리보기·내려받기)
 * - 요청(파이썬이 답을 기다림): desktop.screenshot(가상 모니터의 RGBA 바이트 — pyautogui.screenshot())
 * - 채널(화면 → 파이썬): desktop.state(최신 값: 모니터 크기와 지금 커서 위치, 실행 시작마다 다시 넣음) ·
 *   desktop.pointer(쌓이는 값: 학생이 가상 모니터를 눌러 커서를 옮긴 위치 — 왼쪽 위 모서리는 FAILSAFE)
 */
import type { LabModuleManifest } from '../types.ts';

const manifest: LabModuleManifest = {
  id: 'desktop',
  title: '가상 데스크톱(pyautogui 흉내)',
  labs: ['vision'],
  shims: {},
  requestKinds: ['desktop.screenshot'],
  eventKinds: [
    'desktop.open',
    'desktop.cursor',
    'desktop.mouse',
    'desktop.click',
    'desktop.key',
    'desktop.hotkey',
    'desktop.scroll',
    'desktop.browser',
    'desktop.file',
  ],
  channels: ['desktop.state', 'desktop.pointer'],
  placement: 'wide',
};

export default manifest;
