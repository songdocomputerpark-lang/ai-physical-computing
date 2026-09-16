/**
 * mediapipe 흉내 모듈(PLAN §8.2 P2-08 손, P2-09 얼굴·자세)의 manifest — 순수 데이터(src/lab/README.md 4.2절).
 *
 * 학생 코드의 `import mediapipe as mp` → 이 폴더의 mediapipe.py(레거시 mp.solutions 모양)가 받는다. 진짜 mediapipe 패키지는
 * Pyodide에 없으므로 shims의 install()은 덮어쓰기가 아니라 실행마다 초기화 함수를 등록하는 자리다(apc_mediapipe.install).
 * 추론은 화면 쪽 index.ts가 MediaPipe Tasks Vision(같은 사이트에서 받는 WASM·모델)으로 하고, 카메라가 없으면 합성 좌표를
 * 재생한다(PD-30). 요청 이름 두 개만 쓴다: mediapipe.open(Hands()·FaceMesh()·Pose()·FaceDetection() 생성 — 엔진 준비),
 * mediapipe.detect(process() — 한 장 추론). 어느 solution인지는 payload.solution('hands'·'face_mesh'·'face_detection'·'pose')로 갈린다.
 */
import type { LabModuleManifest } from '../types.ts';

const manifest: LabModuleManifest = {
  id: 'mediapipe',
  title: '손·얼굴·자세 인식(mediapipe 흉내)',
  labs: ['vision'],
  shims: { mediapipe: 'apc_mediapipe' },
  // numpy·opencv-python은 영상처리 실습실이 미리 받는다(VISION_PACKAGES). 이 모듈이 더 받을 Pyodide 패키지는 없다.
  packages: [],
  requestKinds: ['mediapipe.open', 'mediapipe.detect'],
  eventKinds: [],
  channels: [],
  placement: 'panel',
};

export default manifest;
