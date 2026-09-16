/**
 * 한국어 오류 사전 모듈의 manifest(PLAN §8.2 P2-06, 규약은 src/lab/README.md 4절).
 *
 * 이 모듈은 파이썬 쪽이 없다(.py 없음, shims 없음). 실행이 오류로 끝났을 때 화면에서 트레이스백을 읽어
 * 한국어 풀이 카드를 보여 주는 일만 하므로 요청·이벤트·채널도 쓰지 않는다.
 * 모든 실습실(labs: '*')에 붙는다 — 영상처리·개발용 시험 페이지는 물론 앞으로 만들 ESP32·통신 실습실도 그대로 받는다.
 * 카드는 콘솔 바로 위(placement 'wide', LabShell의 .lab__modules 줄)에 넓게 그린다.
 */
import type { LabModuleManifest } from '../types.ts';

const manifest: LabModuleManifest = {
  id: 'errors',
  title: '오류 풀이',
  labs: '*',
  placement: 'wide',
};

export default manifest;
