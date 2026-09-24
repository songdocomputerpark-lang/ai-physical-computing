// 가상 보드의 와이파이·MQTT 파이썬 흉내를 실제 Pyodide로 확인한다 — 구역 D(P4-06, src/lab/README.md 7.9).
// 단계는 같은 폴더의 board-steps-network.mjs. JSPI를 켠 Node와 devDependency pyodide가 있을 때만 돈다.
import { describe, expect, it } from 'vitest';
import { boardPyodideReady, runBoardSteps, stepOf, type BoardRunResult } from '../lab/helpers/pyodide-board.ts';

const STEPS = 'tests/unit/mqtt/board-steps-network.mjs';

describe.skipIf(!boardPyodideReady)('가상 보드 network·umqtt 흉내(실제 Pyodide)', () => {
  let out: BoardRunResult;

  it('단계를 모두 돌린다', () => {
    out = runBoardSteps(STEPS);
    expect(out.jspi).toBe(true);
    // 확장 파일이 보드 모듈 폴더에서 /apc로 들어간다(등록 파일을 고치지 않는다).
    expect(out.files).toEqual(expect.arrayContaining(['apc_board_network.py', 'apc_board_umqtt.py']));
  }, 240_000);

  it('network.WLAN은 늘 연결에 성공한다(PLAN §6.3)', () => {
    const step = stepOf(out, 'network_wlan');
    expect(step.errorMessage).toBeUndefined();
    expect(step.value).toEqual([true, true, '192.168.0.77', true, 2, 'esp32-virtual', true]);
  });

  it('active(True)를 빠뜨리면 대신 켜 주고 콘솔로 알린다', () => {
    const step = stepOf(out, 'network_without_active');
    expect(step.value).toEqual([true, true]);
    expect(step.notices.join('\n')).toContain('wlan.active(True)');
  });

  it('umqtt.simple을 두 모양으로 import할 수 있고, 연결 전에 보내면 한국어 오류', () => {
    const step = stepOf(out, 'umqtt_import');
    const value = step.value as [string, boolean, string, string, boolean];
    expect(value[0]).toContain('client.connect()');
    expect(value[1]).toBe(true);
    expect(value[2]).toBe('board-01');
    expect(value[3]).toBe('broker.emqx.io');
    expect(value[4]).toBe(true);
  });

  it('connect()는 화면에 mqtt.connect 요청을 보내고, 거절은 한국어 OSError가 된다', () => {
    const step = stepOf(out, 'umqtt_connect_request');
    // 학생이 읽는 글에 'PythonError:'·'JsException:' 같은 안쪽 말이 남지 않는다.
    expect(String(step.value)).toBe('화면이 "mqtt.connect" 요청을 처리하지 못해요.');
  });

  it('check_msg·wait_msg가 화면이 보낸 메시지를 bytes로 넘긴다', () => {
    const step = stepOf(out, 'umqtt_receive');
    expect(step.errorMessage).toBeUndefined();
    expect(step.value).toEqual([true, 'led', 'on', true, 1]);
  });

  it('실행이 시작되면 지난 실행에 쌓인 메시지를 버린다', () => {
    const step = stepOf(out, 'umqtt_reset');
    expect(step.value).toBe(0);
  });
});
