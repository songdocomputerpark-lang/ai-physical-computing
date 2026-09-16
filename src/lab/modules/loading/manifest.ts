/**
 * 로딩 진행률·1분 개념 카드·오프라인 준비 모듈의 manifest(PLAN §5.3~§5.5 PD-11, §8.2 P2-05, src/lab/README.md 4절).
 *
 * 파이썬 쪽(.py)이 없다 — 화면만 다루는 모듈이라 요청·이벤트·채널도 없다. 그래서 워커 번들에는 아무것도 더해지지 않는다.
 * 모든 실습실(labs '*')에 붙는다: 파이썬을 받는 일은 어느 실습실에서나 같기 때문이다.
 * 화면 조각은 전체 폭(placement 'wide')에 둔다 — 진행률 막대와 개념 카드가 좁은 칸에서는 읽기 어렵다.
 */
import type { LabModuleManifest } from '../types.ts';

const manifest: LabModuleManifest = {
  id: 'loading',
  title: '준비 진행률과 오프라인 준비',
  labs: '*',
  placement: 'wide',
};

export default manifest;
