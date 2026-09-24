/**
 * 컴퓨터 쪽 시리얼(pyserial 흉내) 모듈의 manifest — 순수 데이터(src/lab/README.md 4.2). P4-02, PLAN §8.4 설계 메모 ③.
 * 워커 번들에도 들어가므로 DOM·다른 모듈을 import하지 않는다.
 *
 * shims가 비어 있는 이유: `serial`(pyserial)은 **Pyodide에 없는 패키지**다. 그래서 "받아 둔 진짜 패키지를 덮어쓰는" shims 대신
 * 같은 폴더의 `serial.py`를 워커가 /apc(sys.path 맨 앞)에 넣어 학생 코드의 `import serial`이 바로 이 파일을 불러오게 한다
 * (speech_recognition.py와 같은 방식 — src/lab/python/modules.ts 머리말). 그래서 내려받기 0바이트로 f084·f085가 그대로 돈다.
 *
 * 이름
 * - 요청(파이썬 → 화면, 답을 기다림): serial-pc.open  시리얼 통로 열기. ESP32 실습실 탭이 없으면 한국어 까닭을 답한다.
 * - 이벤트(파이썬 → 화면, 답 없음): serial-pc.tx  보낼 바이트{bytes, baud}, serial-pc.control  닫기 같은 조작{kind}
 * - 채널(화면 → 파이썬): serial-pc.rx  보드에서 온 바이트(쌓이는 값), serial-pc.info  선 상태·포트 목록(최신 값)
 *
 * 선(통로)은 같은 폴더가 아니라 vision-bridge 모듈의 link.ts가 들고 있다 — [보내기] 패널·한 화면 모드와 **같은 선**을 써야
 * 통로를 바꿔도 원본 코드가 그대로 돌기 때문이다(§7.2 규칙 6).
 */
import type { LabModuleManifest } from '../types.ts';

const manifest: LabModuleManifest = {
  id: 'serial-pc',
  title: '컴퓨터 쪽 시리얼(pyserial 흉내)',
  labs: ['vision'],
  shims: {},
  packages: [],
  requestKinds: ['serial-pc.open'],
  eventKinds: ['serial-pc.tx', 'serial-pc.control'],
  channels: ['serial-pc.rx', 'serial-pc.info'],
};

export default manifest;
