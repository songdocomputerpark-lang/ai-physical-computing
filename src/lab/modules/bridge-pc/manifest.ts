/**
 * 새 예제용 통신 모듈 `bridge`(컴퓨터 쪽 — 영상 처리 실습실)의 manifest — 순수 데이터(src/lab/README.md 4.2).
 * PLAN §7.6 "새 예제용 bridge 모듈"(P4-08)의 파이썬 파일 bridge.py가 판 1.1.0(PROGRESS 미해결 139)에서 **자기 폴더·자기 이름**을 가졌다.
 * 전에는 vision-bridge의 하위 폴더(finger-count/)에 있어 manifest가 없었고, 그래서 serial-pc 모듈의 요청·이벤트 이름을 빌려 썼다
 * (README 4.7 "다른 모듈의 이름을 쓰지 않는다"의 예외). 이제 이름은 모두 `bridge-pc.`로 시작한다.
 * 워커 번들에도 들어가므로 DOM·다른 모듈을 import하지 않는다.
 *
 * 폴더 이름이 `bridge-pc`인 까닭
 * - 컴퓨터 쪽 흉내 `serial-pc`·`ble-pc`와 같은 이름 규칙이다(파이썬 import 이름은 파일 이름 bridge.py 그대로 `import bridge`).
 * - `bridge`로 두면 브릿지 핵심 `src/lab/bridge/`와 헷갈리고, 빌드 청크 이름도 겹친다(둘 다 `_astro/bridge.<해시>.js` —
 *   성능 검사의 통신 모듈 청크 가르기 scripts/perf-rules.mjs commModuleOf가 모듈과 핵심을 가를 수 없다).
 *
 * shims가 비어 있는 이유: `bridge`는 Pyodide에도 PyPI에도 없는 사이트 모듈이다(serial.py·bluetooth.py와 같이 파일 이름이 곧 import 이름).
 *
 * labs에 'esp32'도 있는 까닭: ESP32 실습실 워커에도 bridge.py를 넣어 `import bridge`가 실물 MicroPython처럼 ModuleNotFoundError +
 * 한국어 안내(오류 사전 comm-bridge-on-board)로 끝나게 한다. 화면 쪽(index.ts)은 ESP32 실습실에서 아무것도 하지 않는다.
 *
 * 이름
 * - 요청(파이썬 → 화면, 답을 기다림): bridge-pc.open     통로 열기. 받을 쪽이 없으면 { ok: false, reason: 'no-peer', error }
 * - 이벤트(파이썬 → 화면, 답 없음):   bridge-pc.tx       보낼 바이트 { bytes, baud: 0, category?: 'state' | 'event' }
 *                                    bridge-pc.control  닫기 { kind: 'close' }
 * - 채널(화면 → 파이썬):              bridge-pc.rx       보드에서 온 바이트(쌓이는 값, 통로를 연 동안만)
 *                                    bridge-pc.info     선 상태(최신 값 — { ready, label, prefix, peers })
 *
 * 선(통로)은 vision-bridge의 link.ts가 들고 있다 — [보내기] 패널·serial 흉내와 **같은 선**이라 통로를 바꿔도 같은 코드가 돈다(§7.2 규칙 6).
 */
import type { LabModuleManifest } from '../types.ts';

const manifest: LabModuleManifest = {
  id: 'bridge-pc',
  title: '새 예제용 통신 모듈(bridge — 컴퓨터 쪽)',
  labs: ['vision', 'esp32'],
  shims: {},
  packages: [],
  requestKinds: ['bridge-pc.open'],
  eventKinds: ['bridge-pc.tx', 'bridge-pc.control'],
  channels: ['bridge-pc.rx', 'bridge-pc.info'],
  // 쓸 때만 받는다(Phase 6 P6-02, 미해결 157 — 통신 무리 'comm'은 함께 받는다, DECISIONS C17).
  // 학생 코드의 import bridge·from bridge import(이 폴더의 bridge.py)가 보이면. 통로를 등록하지 않으므로 order는 기본(0).
  load: { group: 'comm', code: /\bbridge\b/u },
};

export default manifest;
