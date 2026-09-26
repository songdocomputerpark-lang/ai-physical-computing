// 가상 MP3 모듈(DFPlayer Mini 계열) 흉내를 실제 Pyodide로 확인하는 단계들(P3-05 구역 C) — 프레임 해석 8·10바이트, 명령, 응답 프레임, 원본 f070·f071.
// tests/unit/board-uart/pyodide-mp3.test.ts가 공유 도우미(--steps=이 파일)로 돌린다.
import fs from 'node:fs';
import path from 'node:path';

/** 배선: MP3 모듈(모듈 RX ← 보드 TX 17, 모듈 TX → 보드 RX 16 — 원고 162쪽) */
export const MP3_WIRING = {
  parts: [{ part: 'mp3', id: 'mp3', label: 'MP3 모듈', pins: { rx: 17, tx: 16 }, directions: { rx: 'out', tx: 'in' }, known: true }],
};

export default async function mp3Steps({ step, rootDir }) {
  // 1. 프레임 해석(순수 파이썬): 8바이트(체크섬 없음)·10바이트(체크섬 맞음·틀림)·f070의 뒤 00 00·나눠 온 바이트·앞 잡음·VER/LEN 틀림·다시 맞추기
  await step(
    'mp3_parser',
    [
      'import apc_part_mp3 as m',
      'P = m.FrameParser',
      'r = []',
      'def kinds(items):',
      "    return [(i['kind'], i.get('bytes'), i.get('cmd'), i.get('param'), i.get('checksum'), i.get('reason')) for i in items]",
      'p = P()',
      'r.append(kinds(p.feed(bytes([0x7E, 0xFF, 0x06, 0x03, 0x00, 0x00, 0x01, 0xEF]))))',
      'r.append(kinds(p.feed(bytes([0x7E, 0xFF, 0x06, 0x03, 0x00, 0x00, 0x01, 0xFE, 0xF7, 0xEF]))))',
      'r.append(kinds(p.feed(bytes([0x7E, 0xFF, 0x06, 0x03, 0x00, 0x00, 0x01, 0xFF, 0xE6, 0xEF]))))',
      'p = P()',
      'r.append(kinds(p.feed(bytes([0x7E, 0xFF, 0x06, 0x03, 0x00, 0x00, 0x01, 0xEF, 0x00, 0x00]))) + [p.noise])',
      'p = P()',
      'r.append(kinds(p.feed(bytes([0x11, 0x22, 0x7E, 0xFF, 0x06, 0x06])) ) + [p.noise])',
      'r.append(kinds(p.feed(bytes([0x00, 0x00, 0x0A, 0xEF]))))',
      'p = P()',
      'r.append(kinds(p.feed(bytes([0x7E, 0xFE, 0x06, 0x03, 0x00, 0x00, 0x01, 0xEF]))) + [p.noise])',
      'p = P()',
      'r.append(kinds(p.feed(bytes([0x7E, 0xFF, 0x05, 0x7E, 0xFF, 0x06, 0x16, 0x00, 0x00, 0x00, 0xEF]))))',
      'p = P()',
      'r.append(kinds(p.feed(bytes([0x7E, 0xFF, 0x06, 0x03, 0x00, 0x00, 0x01, 0xFE, 0xF7, 0x00]))))',
      'r.append([list(m.build_frame(0x41)), list(m.build_frame(0x3D, 1)), m.frame_checksum([0xFF, 0x06, 0x06, 0x00, 0x00, 0x0F]), m.TRACK_LENGTHS_MS, m.DEFAULT_VOLUME])',
      'r',
    ].join('\n'),
  );

  // 2. 원본 f070 파일 그대로: 1번 곡 재생(8바이트 + 뒤 00 00) → 5초 → 정지(0x16). 1번 곡(3.6초)은 5초 안에 끝나 멈추고 곡 번호가 2로 넘어간다.
  const f070 = fs.readFileSync(path.join(rootDir, 'examples/esp32/u2/2-2-2-mp3-check.py'), 'utf8');
  await step('f070_file', f070, { wiring: MP3_WIRING });

  // 3. 원본 f071 파일 그대로(10초마다 볼륨 10 → 1번 곡): 2.5초 뒤 [정지]
  const f071 = fs.readFileSync(path.join(rootDir, 'examples/esp32/u2/2-2-2-mp3-announcement.py'), 'utf8');
  await step('f071_file', f071, { wiring: MP3_WIRING, stopAfterMs: 2500 });

  // 4. 체크섬이 틀린 10바이트는 무시하고 오류 프레임(0x40, 4)을 보드 RX로 돌려준다. 피드백(FB=1)이면 ACK(0x41). 0x43 볼륨 묻기 답. 없는 곡은 오류 5.
  await step(
    'mp3_replies',
    [
      'from machine import UART',
      'import apc_part_mp3 as m',
      'import time',
      'u = UART(2, baudrate=9600, tx=17, rx=16, timeout=50)',
      'def frame(cmd, param=0, feedback=0, checksum=True):',
      '    body = [0xFF, 0x06, cmd, feedback, param >> 8, param & 0xFF]',
      '    c = m.frame_checksum(body)',
      '    if not checksum:',
      '        c ^= 0x0101',
      '    return bytes([0x7E] + body + [c >> 8, c & 0xFF, 0xEF])',
      'def replies():',
      '    time.sleep_ms(40)',
      '    data = u.read()',
      '    return [] if data is None else [list(data[i:i + 10]) for i in range(0, len(data), 10)]',
      'r = []',
      'u.write(frame(0x06, 15, checksum=False))',
      'r.append(replies())',
      'u.write(frame(0x06, 12, feedback=1))',
      'r.append(replies())',
      'u.write(frame(0x43))',
      'r.append(replies())',
      'u.write(frame(0x03, 9))',
      'r.append(replies())',
      'u.write(bytes([0x7E, 0xFF, 0x06, 0x08, 0x00, 0x00, 0x01, 0xEF]))',
      'r.append(replies())',
      'r',
    ].join('\n'),
    { wiring: MP3_WIRING },
  );

  // 5. 재생 흐름: 1번 곡 → 가상 시계로 끝까지(0x3D 1 응답, 곡 번호 2) → 다음 곡(0x01)은 3번 → 일시 정지·이어서·이전 곡·한 곡 반복·잠자기
  await step(
    'mp3_playback_flow',
    [
      'from machine import UART',
      'import time',
      'u = UART(2, baudrate=9600, tx=17, rx=16)',
      'def cmd(c, p=0):',
      '    u.write(bytearray([0x7E, 0xFF, 0x06, c, 0x00, p >> 8, p & 0xFF, 0xEF]))',
      'import apc_board',
      "dev = apc_board.wired_devices('mp3')[0][1]",
      'def snap():',
      '    return [dev.status, dev.track, dev.pointer, dev.volume, dev.loop, dev.play_id]',
      'r = []',
      'cmd(0x03, 1)',
      'r.append(snap())',
      'time.sleep_ms(3700)',
      'data = u.read()',
      'r.append(snap() + [list(data) if data else None])',
      'cmd(0x01)',
      'r.append(snap())',
      'time.sleep_ms(500)',
      'cmd(0x0E)',
      'r.append(snap() + [dev.position_ns // 1_000_000 >= 500])',
      'time.sleep_ms(3000)',
      'r.append(snap())',
      'cmd(0x0D)',
      'r.append(snap())',
      'cmd(0x02)',
      'r.append(snap())',
      'cmd(0x19, 0)',
      'time.sleep_ms(4900)',
      'r.append(snap())',
      'cmd(0x0A)',
      'cmd(0x03, 1)',
      'r.append(snap() + [dev.issue])',
      'cmd(0x0B)',
      'cmd(0x16)',
      'r.append(snap())',
      'r',
    ].join('\n'),
    { wiring: MP3_WIRING },
  );

  // 5-1. 긴 sleep 안의 곡 끝(2026-09-26 PROGRESS 미해결 177): time.sleep(5) 한 번 안에서도 3.6초 곡이 끝나는 그 가상 시각에 멈추고 화면에 알린다.
  //      모듈이 화면에 알리는 순간(publish)의 가상 시각을 적어 둔다. sleep한 양(5초)은 그대로이고, 곡 끝 응답(0x3D)도 곡이 끝난 시각에 온다.
  await step(
    'mp3_song_end_in_long_sleep',
    [
      'from machine import UART',
      'import time, apc_board',
      'u = UART(2, baudrate=9600, tx=17, rx=16)',
      "dev = apc_board.wired_devices('mp3')[0][1]",
      'log = []',
      'publish = dev.publish',
      'def logged():',
      '    log.append((dev.status, apc_board.BOARD.clock.now_ns() // 1_000_000))',
      '    publish()',
      'dev.publish = logged',
      'u.write(bytearray([0x7E, 0xFF, 0x06, 0x03, 0x00, 0x00, 0x01, 0xEF]))',
      "start = [t for s, t in log if s == 'playing'][0]",
      'sleep_start = apc_board.BOARD.clock.now_ns() // 1_000_000',
      't0 = time.ticks_ms()',
      'time.sleep(5)',
      'slept = time.ticks_diff(time.ticks_ms(), t0)',
      'sleep_end = apc_board.BOARD.clock.now_ns() // 1_000_000',
      "stops = [t for s, t in log if s == 'stopped']",
      'data = u.read()',
      '[stops[0] - start, sleep_start < stops[0] < sleep_end, slept, list(data) if data else None, dev.status, dev.pointer, len(stops)]',
    ].join('\n'),
    { wiring: MP3_WIRING },
  );

  // 5-2. 가상 시각 알람 규약(apc_board.register_wake_hook): 훅이 알려 준 시각에 sleep이 끊겨 훅이 다시 불리고, 지난 시각은 잠을 끊지 않으며,
  //      훅의 오류는 학생 코드를 멈추지 않고 한 번만 알린다(부품 흉내의 잘못).
  await step(
    'wake_hook_contract',
    [
      'import time, apc_board',
      'calls = []',
      'alarm = [apc_board.BOARD.clock.now_ns() + 1_234_000_000]',
      'def hook(now):',
      '    if alarm[0] is not None and now >= alarm[0]:',
      '        calls.append(now // 1_000_000)',
      '        alarm[0] = None',
      '    return alarm[0]',
      'apc_board.register_wake_hook(hook)',
      'bad_calls = [0]',
      'def bad(now):',
      '    bad_calls[0] += 1',
      '    raise ValueError("시험 오류")',
      'apc_board.register_wake_hook(bad)',
      'past = []',
      'def past_hook(now):',
      '    past.append(1)',
      '    return now - 1',
      'apc_board.register_wake_hook(past_hook)',
      'origin = apc_board.BOARD.clock.now_ns() // 1_000_000',
      'target = alarm[0] // 1_000_000',
      'time.sleep(3)',
      'total = apc_board.BOARD.clock.now_ns() // 1_000_000 - origin',
      'for h in (hook, bad, past_hook):',
      '    apc_board._wake_hooks.remove(h)',
      '[len(calls), calls[0] - target if calls else None, 3000 <= total <= 3010, bad_calls[0] > 1, len(past) < 50]',
    ].join('\n'),
  );

  // 6. 보드 UART 속도가 9600이 아니면 모듈이 알아듣지 못하고(깨진 바이트) 화면에 까닭을 남긴다
  await step(
    'mp3_wrong_baud',
    [
      'from machine import UART',
      'import time, apc_board',
      'u = UART(2, baudrate=115200, tx=17, rx=16)',
      'u.write(bytearray([0x7E, 0xFF, 0x06, 0x03, 0x00, 0x00, 0x01, 0xEF]))',
      'time.sleep_ms(20)',
      "dev = apc_board.wired_devices('mp3')[0][1]",
      '[dev.status, dev.issue, dev.commands]',
    ].join('\n'),
    { wiring: MP3_WIRING },
  );
}
