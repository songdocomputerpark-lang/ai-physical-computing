/**
 * 모듈 뼈대 예시 "hello"의 manifest(순수 데이터, src/lab/README.md 4절).
 * 새 흉내 모듈은 이 폴더를 통째로 복사해 이름을 바꾸는 것으로 시작한다. 개발용 시험 페이지(/labs/dev/runtime/, labId 'dev')에만 붙는다.
 */
import type { LabModuleManifest } from '../types.ts';

const manifest: LabModuleManifest = {
  id: 'hello',
  title: '모듈 뼈대 예시(hello)',
  labs: ['dev'],
  // 이 예시는 진짜 패키지를 덮어쓰지 않는다. 덮어쓰는 모듈은 { mediapipe: 'apc_mediapipe' }처럼 적는다.
  shims: {},
  requestKinds: ['hello.greet'],
  eventKinds: ['hello.wave'],
  channels: ['hello.name', 'hello.clicks'],
  placement: 'panel',
};

export default manifest;
