// 가상 블루투스(BLE)의 파이썬 쪽을 Node의 **실제 Pyodide**로 확인한다(src/lab/README.md 7.7, PLAN §8.4 P4-03).
// 단계는 steps/ble.mjs, 도구는 tests/unit/lab/helpers/pyodide-board.ts(공유 도우미는 고치지 않는다).
//
// 기기 주소(MAC)는 실행마다 새로 만드는 **가상 주소**라 값이 아니라 모양만 본다(PLAN §10 — 저장소에 실제 주소를 적지 않는다).
import { describe, expect, it } from 'vitest';
import { boardPyodideReady, runBoardSteps, stepOf } from '../lab/helpers/pyodide-board.ts';

describe.skipIf(!boardPyodideReady)('가상 블루투스(BLE) — 실제 Pyodide', () => {
  const out = runBoardSteps('tests/unit/board-ble/steps/ble.mjs');

  it('저수준 bluetooth·ubluetooth 흉내가 공식 문서와 같은 모양이다', () => {
    const step = stepOf(out, 'ble_core');
    expect(step.errorType).toBeUndefined();
    const [same, before, after, handles, pair, readBack, addrType, addrLength, flags, uuid16, uuidText, errors] = step.value as [
      boolean,
      boolean,
      boolean,
      number[][],
      number[],
      string,
      number,
      number,
      number[],
      number[],
      string,
      string[],
    ];
    // BLE()는 실물처럼 늘 같은 객체이고, bluetooth와 ubluetooth는 같은 모듈이다
    expect(same).toBe(true);
    expect([before, after]).toEqual([false, true]);
    // "The return value is a list (one element per service) of tuples (each element is a value handle)."
    expect(handles).toEqual([[1, 2]]);
    expect(pair).toEqual([1, 2]);
    expect(readBack).toBe('hello');
    // config('mac') → (addr_type, addr) — 주소는 6바이트(값은 가상이라 보지 않는다)
    expect(addrType).toBe(0);
    expect(addrLength).toBe(6);
    // FLAG_READ 0x0002, FLAG_WRITE_NO_RESPONSE 0x0004, FLAG_WRITE 0x0008, FLAG_NOTIFY 0x0010, FLAG_INDICATE 0x0020
    expect(flags).toEqual([2, 4, 8, 16, 32]);
    // UUID(0x2908) → 2바이트(리틀 엔디언), 128비트 UUID는 글자로 보인다
    expect(uuid16).toEqual([0x08, 0x29]);
    expect(uuidText).toBe("UUID('6e400001-b5a3-f393-e0a9-e50e24dcca9e')");
    // 실물과 같게 막는 것: 없는 핸들, 틀린 UUID, 연결 없는 알림
    expect(errors[0]).toContain('ValueError');
    expect(errors[1]).toContain('invalid UUID string');
    expect(errors[2]).toContain('out of range');
    expect(errors[3]).toContain('[Errno 128] ENOTCONN');
  });

  it('IRQ는 연결(1) → 쓰기(3) → 끊김(2) 차례로 오고 값 모양이 문서와 같다', () => {
    const step = stepOf(out, 'ble_events');
    expect(step.errorType).toBeUndefined();
    const [log, rx, sent, after] = step.value as [(number | number[] | string)[][], number, string[], number[]];
    // 1·2번은 (conn_handle, addr_type, addr) — 주소는 6바이트. 3번은 (conn_handle, attr_handle)이고 값은 gatts_read로 읽는다.
    expect(log).toEqual([
      [1, 0, 6],
      [3, [0, rx], 'a'],
      [2, 0, 6],
    ]);
    // 연결돼 있으면 알림이 나가고, 끊긴 뒤에는 실물처럼 막힌다
    expect(sent).toEqual(['sent']);
    expect(after).toEqual([128]);
  });

  it('특성 한 칸은 기본 20바이트 — 넘치면 실물처럼 잘리고 한국어로 알린다(gatts_set_buffer로 늘어난다)', () => {
    const step = stepOf(out, 'ble_truncate');
    expect(step.errorType).toBeUndefined();
    const [lengths, first, second] = step.value as [number[], string, string];
    expect(lengths).toEqual([20, 24]);
    expect(first).toBe('DATA,1920,1080,1,0,e');
    expect(second).toBe('DATA,1920,1080,1,0,extra');
    expect(step.notices.join(' ')).toContain('앞 20바이트만 남고 잘렸어요');
  });

  it('보드 라이브러리 ESP32BLE.py 원본이 고치지 않고 돈다 — 상태 LED 깜빡임·연결 표시·한 칸 덮어쓰기', () => {
    const step = stepOf(out, 'esp32ble_original');
    expect(step.errorType).toBeUndefined();
    const [blink, onConnect, first, second, overwritten, after] = step.value as [number[], number[], string, string | null, string, number[]];
    // 연결 전에는 GPIO12가 100ms마다 뒤집힌다(Timer(0) — 원본 disconnected())
    expect(blink).toEqual([0, 1]);
    // 연결되면 타이머를 멈추고 계속 켜 둔다(원본 connected())
    expect(onConnect).toEqual([1, 1]);
    // read()는 한 칸이라 한 번 읽으면 비워진다
    expect(first).toBe('355,152');
    expect(second).toBeNull();
    // 루프가 바쁜 동안 두 번 오면 마지막 값만 남는다(PLAN §7.7 "한 칸 덮어쓰기")
    expect(overwritten).toBe('DATA,3,4');
    // 끊기면 다시 깜빡인다
    expect(after).toEqual([0, 1]);
    // 원본이 주소를 출력한다(가상 주소라 값이 아니라 모양만 본다 — 저장소에 실제 주소를 적지 않는다)
    expect(step.stdout).toContain('ESP32 블루투스 주소:');
    expect(step.stdout).toMatch(/ESP32 블루투스 주소: (?:[0-9a-f]{2}:){5}[0-9a-f]{2}/u);
  });

  it('사이트판 esp32_ble_util.py로 스마트폰 앱 프레임(f002)을 받는다', () => {
    const step = stepOf(out, 'esp32_ble_util_site');
    expect(step.errorType).toBeUndefined();
    const [before, connected, got, buf, name] = step.value as [boolean, boolean, number[][], string, string];
    expect(before).toBe(false);
    expect(connected).toBe(true);
    // 앞 네 바이트 FF 02 01 01 — f002가 이것으로 프레임을 가린다
    expect(got[0].slice(0, 4)).toEqual([0xff, 0x02, 0x01, 0x01]);
    expect(buf).toBe('2');
    // 이름을 글자로 넘겨도 광고 데이터가 만들어진다(사이트판의 bytes + str 고침)
    expect(name).toBe('esp32ble');
    expect(step.stdout).toContain('New connection 0');
  });

  it('배선에 블루투스 칸이 없어도 코드는 돌고, 콘솔로 칸을 여는 법을 알린다', () => {
    const step = stepOf(out, 'ble_without_part');
    expect(step.errorType).toBeUndefined();
    expect(step.value).toBe(true);
    expect(step.notices.join(' ')).toContain('# @part ble 12');
  });
});
