// 가상 MP3 모듈(DFPlayer Mini 계열) — 프레임 해석(8·10바이트, 체크섬 있음·없음)·명령·응답 프레임·원본 f070·f071을 실제 Pyodide로 확인(P3-05 구역 C).
// 단계는 tests/unit/board-uart/steps/mp3.mjs, 규약 근거는 src/lab/modules/board/parts/mp3/apc_part_mp3.py 머리말.
import { describe, expect, it } from 'vitest';
import { boardPyodideReady, runBoardSteps, stepOf } from '../lab/helpers/pyodide-board.ts';
import { deviceStates } from './helpers.ts';

interface Mp3State {
  status: string;
  track?: number | null;
  volume: number;
  loop: string;
  playId: number;
  commands: number;
  last?: { cmd: number; name: string; param: number; bytes: number; feedback: number } | null;
  ignored: number;
  issue?: string | null;
  issueText?: string | null;
  replies: number;
}

describe.skipIf(!boardPyodideReady)('가상 MP3 모듈(실제 Pyodide, JSPI)', () => {
  const out = runBoardSteps('tests/unit/board-uart/steps/mp3.mjs');

  it('프레임 해석: 체크섬 없는 8바이트와 있는 10바이트를 모두 읽고, 틀린 체크섬·VER·LEN·끝 바이트를 가린다', () => {
    const record = stepOf(out, 'mp3_parser');
    expect(record.errorType).toBeUndefined();
    const value = record.value as unknown[];
    // [종류, 바이트 수, 명령, 값, 체크섬(없음 null·맞음 true·틀림 false), 버린 까닭]
    expect(value[0]).toEqual([['frame', 8, 3, 1, null, null]]);
    expect(value[1]).toEqual([['frame', 10, 3, 1, true, null]]);
    // 설명서 예시의 FF E6은 라이브러리 계산식(-합 = FE F7)과 달라 틀린 체크섬
    expect(value[2]).toEqual([['frame', 10, 3, 1, false, null]]);
    // f070: bytearray(10)에 8바이트만 채워 보낸 7E FF 06 03 00 00 01 EF 00 00 → 8바이트 프레임 하나 + 뒤 00 00은 잡음 2
    expect(value[3]).toEqual([['frame', 8, 3, 1, null, null], 2]);
    // 앞 잡음 2바이트, 프레임이 두 번에 나눠 와도 이어 읽는다(볼륨 10)
    expect(value[4]).toEqual([2]);
    expect(value[5]).toEqual([['frame', 8, 6, 10, null, null]]);
    // VER이 FF가 아니면 버리고 뒤의 바이트는 잡음
    expect(value[6]).toEqual([['invalid', null, null, null, null, 'version'], 6]);
    // LEN이 06이 아닌 프레임 안에서 새 7E를 찾아 다시 읽는다
    expect(value[7]).toEqual([['invalid', null, null, null, null, 'length'], ['frame', 8, 22, 0, null, null]]);
    // 10번째 바이트가 EF가 아니면 버린다
    expect(value[8]).toEqual([['invalid', null, null, null, null, 'end']]);
    // 모듈이 보내는 프레임: ACK 41, 곡 끝 3D 1(체크섬 FE BD), 볼륨 15 명령의 체크섬 FEE6, 곡 길이·전원 볼륨 30
    expect(value[9]).toEqual([
      [0x7e, 0xff, 0x06, 0x41, 0x00, 0x00, 0x00, 0xfe, 0xba, 0xef],
      [0x7e, 0xff, 0x06, 0x3d, 0x00, 0x00, 0x01, 0xfe, 0xbd, 0xef],
      0xfee6,
      [3600, 4800, 4200],
      30,
    ]);
  });

  it('원본 f070 파일 그대로: 1번 곡 재생(8바이트) → 곡이 끝나 멈춤 → 정지 명령(0x16), 곡 끝 응답 한 번', () => {
    const record = stepOf(out, 'f070_file');
    expect(record.errorType).toBeUndefined();
    const states = deviceStates<Mp3State>(record, 'mp3');
    expect(states.some((state) => state.status === 'playing' && state.track === 1 && state.playId === 1)).toBe(true);
    expect(states.at(-1)).toMatchObject({ status: 'stopped', track: 1, volume: 30, commands: 2, ignored: 0, replies: 1 });
    expect(states.at(-1)?.last).toMatchObject({ cmd: 0x16, bytes: 8, name: '정지' });
  });

  it('원본 f071 파일 그대로: 볼륨 10 → 1번 곡 재생, 콘솔에 "안내 방송 출력"', () => {
    const record = stepOf(out, 'f071_file');
    expect(record.errorType).toBe('KeyboardInterrupt');
    expect(record.stdout).toContain('안내 방송 출력');
    expect(deviceStates<Mp3State>(record, 'mp3').at(-1)).toMatchObject({ status: 'playing', track: 1, volume: 10 });
  });

  it('응답 프레임: 틀린 체크섬은 무시하고 오류 4, 피드백 1이면 ACK, 볼륨 묻기는 0x43 12, 없는 곡은 오류 5, 모르는 명령은 답 없이 화면 안내', () => {
    const record = stepOf(out, 'mp3_replies');
    expect(record.errorType).toBeUndefined();
    expect(record.value).toEqual([
      [[0x7e, 0xff, 0x06, 0x40, 0x00, 0x00, 0x04, 0xfe, 0xb7, 0xef]],
      [[0x7e, 0xff, 0x06, 0x41, 0x00, 0x00, 0x00, 0xfe, 0xba, 0xef]],
      [[0x7e, 0xff, 0x06, 0x43, 0x00, 0x00, 0x0c, 0xfe, 0xac, 0xef]],
      [[0x7e, 0xff, 0x06, 0x40, 0x00, 0x00, 0x05, 0xfe, 0xb6, 0xef]],
      [],
    ]);
    const last = deviceStates<Mp3State>(record, 'mp3').at(-1);
    expect(last).toMatchObject({ volume: 12, commands: 3, ignored: 2, issue: 'unsupported' });
    expect(last?.issueText).toContain('0x08');
  });

  it('재생 흐름: 곡 끝(가상 시계) → 3D 응답·다음 곡 번호, 다음 곡·일시 정지·이어서·이전 곡·한 곡 반복·잠자기(오류 2)·정지', () => {
    const record = stepOf(out, 'mp3_playback_flow');
    expect(record.errorType).toBeUndefined();
    const value = record.value as unknown[][];
    expect(value[0]).toEqual(['playing', 1, 1, 30, 'none', 1]);
    expect(value[1]).toEqual(['stopped', 1, 2, 30, 'none', 1, [0x7e, 0xff, 0x06, 0x3d, 0x00, 0x00, 0x01, 0xfe, 0xbd, 0xef]]);
    // 1번 곡을 끝까지 들은 뒤(곡 번호 2)의 "다음 곡"은 3번(설명서 3.3.2 4번)
    expect(value[2]).toEqual(['playing', 3, 3, 30, 'none', 2]);
    expect(value[3]).toEqual(['paused', 3, 3, 30, 'none', 2, true]);
    expect(value[4]).toEqual(['paused', 3, 3, 30, 'none', 2]);
    expect(value[5]).toEqual(['playing', 3, 3, 30, 'none', 2]);
    expect(value[6]).toEqual(['playing', 2, 2, 30, 'none', 3]);
    // 한 곡 반복(0x19 0): 4.8초 곡이 끝나면 처음부터 다시(playId +1)
    expect(value[7]).toEqual(['playing', 2, 2, 30, 'one', 4]);
    expect(value[8]).toEqual(['sleep', 2, 2, 30, 'one', 4, 'sleeping']);
    expect(value[9]).toEqual(['stopped', 2, 2, 30, 'one', 4]);
  });

  it('긴 sleep 안의 곡 끝: time.sleep(5) 안에서도 3.6초 곡이 끝나는 가상 시각에 멈추고, 잔 양(5초)과 곡 끝 응답(0x3D)은 그대로다(미해결 177)', () => {
    const record = stepOf(out, 'mp3_song_end_in_long_sleep');
    expect(record.errorType).toBeUndefined();
    const [gap, insideSleep, slept, reply, status, pointer, stops] = record.value as [number, boolean, number, number[] | null, string, number, number];
    // 재생을 시작한 가상 시각에서 곡 길이(3600ms)만큼 뒤에 멈춘다 — sleep(5)가 끝나기 전에
    expect(gap).toBeGreaterThanOrEqual(3600);
    expect(gap).toBeLessThanOrEqual(3605);
    expect(insideSleep).toBe(true);
    expect(slept).toBeGreaterThanOrEqual(5000);
    expect(slept).toBeLessThanOrEqual(5002);
    expect(reply).toEqual([0x7e, 0xff, 0x06, 0x3d, 0x00, 0x00, 0x01, 0xfe, 0xbd, 0xef]);
    expect([status, pointer, stops]).toEqual(['stopped', 2, 1]);
    // 화면에도 sleep 도중에 '멈춤'이 간다(마지막 상태)
    expect(deviceStates<Mp3State>(record, 'mp3').at(-1)).toMatchObject({ status: 'stopped', track: 1 });
  });

  it('가상 시각 알람 규약: 알려 준 시각에 sleep이 끊겨 다시 불리고, 지난 시각은 잠을 끊지 않으며, 훅 오류는 한 번만 알리고 코드는 계속 돈다', () => {
    const record = stepOf(out, 'wake_hook_contract');
    expect(record.errorType).toBeUndefined();
    const [calls, late, total, badCalled, fewPastCalls] = record.value as [number, number | null, boolean, boolean, boolean];
    expect(calls).toBe(1);
    expect(late).not.toBeNull();
    expect(late).toBeGreaterThanOrEqual(0);
    expect(late).toBeLessThanOrEqual(2);
    expect(total).toBe(true);
    expect(badCalled).toBe(true);
    expect(fewPastCalls).toBe(true);
    expect(record.notices.filter((text) => text.includes('가상 부품의 시간 처리에서 오류가 났어요'))).toHaveLength(1);
  });

  it('보드 UART가 9600bps가 아니면 모듈이 알아듣지 못하고 까닭(baud)을 남긴다', () => {
    const record = stepOf(out, 'mp3_wrong_baud');
    expect(record.errorType).toBeUndefined();
    expect(record.value).toEqual(['stopped', 'baud', 0]);
    expect(deviceStates<Mp3State>(record, 'mp3').at(-1)?.issueText).toContain('9600bps');
  });
});
