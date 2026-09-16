/**
 * 음성 인식 흉내 모듈(P2-13, 선택 차시 1-4-3 "말을 글로 바꾸는 기술")의 manifest — 순수 데이터(src/lab/README.md 4.2).
 * 워커 번들에도 들어가므로 DOM·다른 모듈을 import하지 않는다.
 *
 * shims가 비어 있는 이유: `speech_recognition`은 **Pyodide에 없는 패키지**다(원본은 PyAudio 녹음 + HTTP 전송이라
 * 브라우저에서 아예 받을 수 없다 — CODE_MAPPING §3.5, 소켓 비작동 확인됨). 그래서 "받아 둔 진짜 패키지를 덮어쓰는" shims 방식 대신
 * 같은 폴더의 `speech_recognition.py`를 워커가 /apc(sys.path 맨 앞)에 넣어 **학생 코드의 `import speech_recognition as sr`가
 * 바로 이 파일을 불러오게** 한다. 그래서 내려받기 0바이트로 f044·f045가 그대로 돈다.
 */
import type { LabModuleManifest } from '../types.ts';

const manifest: LabModuleManifest = {
  id: 'speech',
  title: '말을 글로 바꾸기(speech_recognition 흉내)',
  labs: ['vision'],
  shims: {},
  packages: [],
  /** 파이썬 r.listen(...) → 화면이 글자(또는 브라우저 음성 인식 결과)를 답한다 */
  requestKinds: ['speech.listen'],
  /** 화면 → 파이썬 최신 값: 지금 고른 방식과, 제한 모드(JSPI 없음)에서 쓸 미리 적어 둔 문장 */
  channels: ['speech.mode', 'speech.text'],
  placement: 'panel',
};

export default manifest;
