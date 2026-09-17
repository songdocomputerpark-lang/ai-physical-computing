/**
 * 가상 ESP32 보드 모듈의 manifest(PLAN §8.3 P3-01, PD-04) — 순수 데이터(src/lab/README.md 4.2·7절).
 * 워커 번들에도 들어가므로 DOM·다른 모듈을 import하지 않는다.
 *
 * 파이썬 쪽(이 폴더의 .py — ESP32 실습실 워커에만 들어간다, python/modules.ts pythonModulesForLab)
 *   machine.py · micropython.py      학생이 import하는 이름 그대로(Pyodide에 없는 모듈이라 파일 이름으로 둔다 — speech_recognition과 같은 방식)
 *   apc_board.py                     보드 핵심: 핀·가상 시계·Timer·콜백·import 훅(time·utime·errno·bluetooth·u-이름)
 *   apc_board_time.py                MicroPython판 time 모듈
 *   (확장) apc_board_*.py · parts/<부품>/apc_part_*.py   부품 단계에서 더하는 주변장치·부품 흉내(등록 파일 수정 없음)
 *
 * shims에 time을 적은 이유: apc_shims.install_available()은 "import할 수 있는 패키지"가 있을 때만 흉내 모듈의 install()을 부른다.
 * time은 늘 있으므로 실행 직전마다 apc_board.install()이 불려(멱등) import 훅·실행 훅이 걸린다. 이 표는 ESP32 실습실의 워커에만
 * 등록되므로(shimTableForLab) 영상처리 실습실의 time은 그대로다. 학생 코드의 `import time`이 MicroPython판이 되는 것은 import 훅이다.
 *
 * 이름(모두 "board."로 시작, 모양은 README 7절)
 * - 이벤트(파이썬 → 화면): board.state(핀 상태 묶음 — 실행 시작·바뀜·코드가 끝난 뒤 대기·끝), board.device(부품 흉내의 상태, 부품 단계에서 씀)
 * - 채널(화면 → 파이썬): board.inputs(최신 값: 입력 부품이 핀을 어떻게 누르는지 전체 — 실행 시작 때 읽음),
 *   board.input(쌓이는 값: 실행 중에 바뀐 입력 하나씩 — 입력 확인 지점에서 반영), board.wiring(최신 값: 이 예제의 배선)
 */
import type { LabModuleManifest } from '../types.ts';

const manifest: LabModuleManifest = {
  id: 'board',
  title: '가상 ESP32 보드(machine·time 흉내)',
  labs: ['esp32'],
  shims: { time: 'apc_board' },
  packages: [],
  requestKinds: [],
  eventKinds: ['board.state', 'board.device'],
  channels: ['board.inputs', 'board.input', 'board.wiring'],
  placement: 'panel',
};

export default manifest;
