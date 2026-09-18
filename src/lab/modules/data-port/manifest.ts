/**
 * USB 데이터 포트 모듈의 manifest(PLAN §8.4 P4-05 — 순수 데이터, src/lab/README.md 4.2).
 * 워커 번들에도 들어가므로 DOM·다른 모듈을 import하지 않는다.
 *
 * 파이썬 쪽 파일이 없다: 이 모듈은 **브라우저와 USB 선 사이**만 맡는다. 파이썬 코드(`serial.Serial(…)`)를 받는 것은
 * 영상처리 실습실의 흉내 모듈(P4-02)이고, 그 모듈이 브릿지 통로로 `serial`(channel.ts)을 고르면 여기로 바이트가 온다.
 * 그래서 요청·이벤트·채널 이름도 없다(다른 구역의 이름과 부딪히지 않는다).
 *
 * 붙는 실습실
 * - `vision`: 교과서 3-1-2가 **컴퓨터 → 변환기 → 보드 UART2**로 보내는 쪽이다(f084·f085).
 * - `esp32`: 반대 방향(보드 → 변환기 → 컴퓨터)을 보거나, 실제 보드 탭과 나란히 두 포트를 여는 것을 확인할 때.
 * - `dev`: 개발용 시험 페이지(/labs/dev/runtime/)에서 화면 흐름을 시험한다.
 * 패널은 코드가 시리얼을 쓸 때만 열린다(index.ts의 showPanelWhenUsed — README 4.3 "패널은 쓸 때만 연다").
 */
import type { LabModuleManifest } from '../types.ts';

const manifest: LabModuleManifest = {
  id: 'data-port',
  title: 'USB 데이터 포트(USB-UART 변환기)',
  labs: ['vision', 'esp32', 'dev'],
  shims: {},
  packages: [],
  requestKinds: [],
  eventKinds: [],
  channels: [],
  placement: 'panel',
};

export default manifest;
