// 판 1.5.0 구역 K3a — 키트 장치 도감 2.08 OLED 1.3인치(SH1106) 예제 두 개가 가상 보드에서 끝까지 도는지를 Node의 실제 Pyodide(JSPI)로 본다.
// 브릭셀 코드는 robert-hh 판 sh1106 드라이버의 호출 모양 SH1106_I2C(128, 64, i2c, None, addr=0x3C)(넷째 자리 res)를 쓴다 —
// 가상 보드의 sh1106 흉내(src/lab/modules/board/parts/oled-i2c/sh1106.py)가 그 차례와 교과서 판(넷째 자리 주소)을 함께 받는지.
// tests/unit/kit/pyodide-kit-sh1106.test.ts가 공유 도우미(tests/unit/lab/helpers/pyodide-board-run.mjs --steps=이 파일)로 돌린다.
import fs from 'node:fs';
import path from 'node:path';

const OLED = { part: 'oled-i2c', id: 'oled', label: 'OLED 1.3인치(128×64)', pins: { sda: 21, scl: 22 }, directions: { sda: 'out', scl: 'out' }, known: true };

export default async function kitSh1106Steps({ step, rootDir }) {
  const read = (file) => fs.readFileSync(path.join(rootDir, 'examples', ...file.split('/')), 'utf8');
  const wiring = { parts: [OLED] };

  // 예제 두 개를 그대로(끝없이 도는 코드) — 첫 화면이 그려질 만큼 돈 뒤 [정지]
  await step('kit_2_08_step1', read('esp32/kit/ch2/2-08-oled-13-1.py'), { wiring, stopAfterMs: 1500 });
  await step('kit_2_08_step2', read('esp32/kit/ch2/2-08-oled-13-2.py'), { wiring, stopAfterMs: 1500 });

  // 두 인자 차례: robert-hh 판(넷째 자리 res — None·Pin, reset()이 리셋 핀을 누른다)과 교과서 판(넷째 자리 주소·다섯째 external_vcc)
  await step(
    'sh1106_argument_orders',
    [
      'from machine import Pin, SoftI2C',
      'from sh1106 import SH1106_I2C',
      'i2c = SoftI2C(scl=Pin(22), sda=Pin(21))',
      'a = SH1106_I2C(128, 64, i2c, None, addr=0x3C)',
      'res = Pin(16)',
      'b = SH1106_I2C(128, 64, i2c, res)',
      'b.reset()',
      'c = SH1106_I2C(128, 64, i2c, 0x3C, True)',
      'd = SH1106_I2C(128, 64, i2c, addr=0x3C)',
      '[a.addr, a.res is None, b.addr, b.res is res, res.value(), c.addr, c.res is None, c.external_vcc, d.addr, d.external_vcc]',
    ].join('\n'),
    { wiring },
  );
}
