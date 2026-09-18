/**
 * 영상처리 ↔ 가상 보드 선([보내기] 패널·한 화면 모드) 모듈의 manifest — 순수 데이터(src/lab/README.md 4.2). P4-02.
 * 워커 번들에도 들어가므로 DOM·다른 모듈을 import하지 않는다.
 *
 * 왜 실습실 두 곳에 붙나: 선은 **양 끝이 있어야** 이어진다. 영상처리 실습실에서는 컴퓨터 쪽('pc')이 되어 [보내기] 패널과
 * 한 화면 모드를 그리고, ESP32 실습실에서는 보드 쪽('board')이 되어 받은 바이트를 가상 USB-UART 변환기 부품에 넣는다.
 * 파이썬 파일이 없다 — 컴퓨터 쪽 파이썬(serial.py)은 serial-pc 모듈에, 보드 쪽은 이미 board 모듈의 UART 부품에 있다.
 *
 * 요청·이벤트·채널 이름을 하나도 적지 않은 까닭: 이 모듈은 **다른 모듈이 이미 정한 이름**(board.device.input·board.uart.tx·
 * board.device)으로 보드와 이야기한다. manifest에 적으면 board 모듈과 이름이 겹쳐 검사에서 막히므로(manifests.ts),
 * 보드 쪽 잇기는 ctx.runtime을 그대로 쓰고 어떤 이름을 쓰는지 board-uart.ts 머리말에 적어 둔다.
 */
import type { LabModuleManifest } from '../types.ts';

const manifest: LabModuleManifest = {
  id: 'vision-bridge',
  title: '영상처리 ↔ 가상 보드 선(보내기 패널)',
  labs: ['vision', 'esp32'],
  shims: {},
  packages: [],
  placement: 'wide',
};

export default manifest;
