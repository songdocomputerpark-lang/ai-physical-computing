// 보드 준비 페이지 [보드 연결] 결과 글(src/components/start/board/connect-view.ts) — 결과마다 무엇이 됐는지와 다음에 갈 곳(PLAN §8.3 P3-10).
import { describe, expect, it } from 'vitest';
import type { BoardCheckResult } from '../../../src/components/start/board/board-check.ts';
import { outcomeForChooseError } from '../../../src/components/start/board/connect-check.ts';
import {
  CONNECT_LINK_LABELS,
  describeConnectIdle,
  describeConnectOutcome,
  describeConnectStep,
  LED_HELP,
  supportNotes,
  type ConnectOutcome,
  type ConnectSupport,
  type ConnectView,
} from '../../../src/components/start/board/connect-view.ts';
import { parseMicroPythonBanner } from '../../../src/lab/serial/banner.ts';
import { describePortInfo } from '../../../src/lab/serial/usb-chips.ts';

const HANGUL = /[가-힣]/u;
/** tests/e2e/start.spec.ts가 getByText로 누르는 글 — 페이지에 하나(요약)뿐이어야 하므로 결과 글에 쓰지 않는다 */
const RESERVED_TEXTS = ['포트 선택 창에 보드가 안 보여요', '충전 전용 케이블로는 연결되지 않아요'];

const CHROME: ConnectSupport = Object.freeze({
  level: 'supported',
  recommended: true,
  browserName: 'Chrome',
  firefox: false,
  mobile: false,
  summary: 'USB로 보드를 연결하는 기능이 있어요.',
  advice: '',
});
const NO_SERIAL: ConnectSupport = Object.freeze({
  level: 'unsupported',
  recommended: false,
  browserName: 'Safari',
  firefox: false,
  mobile: false,
  summary: '이 브라우저에는 USB 보드 연결 기능이 없어요.',
  advice: '실제 ESP32 보드를 연결하려면 컴퓨터용 Chrome이나 Edge로 열어 주세요.',
});

const CH340 = describePortInfo({ usbVendorId: 0x1a86, usbProductId: 0x7523 });
const BANNER = parseMicroPythonBanner('MicroPython v1.29.0 on 2026-08-24; Generic ESP32 module with ESP32\r\n')!;
const OLD_BANNER = parseMicroPythonBanner('MicroPython v1.25.0 on 2025-04-15; Generic ESP32 module with ESP32\r\n')!;

function ready(overrides: Partial<Extract<BoardCheckResult, { kind: 'ready' }>> = {}): BoardCheckResult {
  return { kind: 'ready', port: CH340, banner: BANNER, firmware: 'same', esp32: true, blink: { outcome: 'ok', errorLine: null, stdout: 'LED blink test done\n' }, ...overrides };
}

const ALL_OUTCOMES: ConnectOutcome[] = [
  { kind: 'not-selected' },
  { kind: 'security', detail: 'SecurityError: Must be handling a user gesture' },
  { kind: 'choose-failed', detail: 'TypeError: x' },
  { kind: 'flasher-busy' },
  { kind: 'unsupported' },
  { kind: 'failed', detail: 'Error: 뜻밖' },
  { kind: 'released', port: CH340 },
  { kind: 'port-in-use', port: CH340, detail: 'NetworkError: Failed to open serial port.' },
  { kind: 'open-failed', port: CH340, detail: 'UnknownError' },
  { kind: 'lost', port: CH340 },
  { kind: 'protocol', port: CH340, detail: 'x' },
  { kind: 'busy', port: CH340 },
  { kind: 'no-micropython', port: CH340, verdict: { kind: 'silent' } },
  { kind: 'no-micropython', port: CH340, verdict: null },
  { kind: 'no-micropython', port: CH340, verdict: { kind: 'no-firmware', evidence: 'invalid-header' } },
  { kind: 'no-micropython', port: CH340, verdict: { kind: 'download-mode' } },
  { kind: 'no-micropython', port: CH340, verdict: { kind: 'other-python', name: 'CircuitPython 9.2.1' } },
  { kind: 'no-micropython', port: CH340, verdict: { kind: 'other-output', garbled: true } },
  { kind: 'no-micropython', port: CH340, verdict: { kind: 'other-output', garbled: false } },
  { kind: 'no-micropython', port: CH340, verdict: { kind: 'busy' } },
  ready(),
  ready({ firmware: 'older', banner: OLD_BANNER }),
  ready({ blink: { outcome: 'error', errorLine: "ImportError: no module named 'machine'", stdout: '' } }),
  ready({ blink: { outcome: 'reset', errorLine: null, stdout: '' } }),
  ready({ blink: { outcome: 'interrupted', errorLine: null, stdout: '' } }),
  ready({ blink: { outcome: 'failed', errorLine: 'BoardBusy: x', stdout: '' } }),
];

function allTexts(view: ConnectView): string[] {
  return [view.title, view.detail, ...view.steps, ...view.notes, ...view.ledHelp, ...view.links.map((item) => item.label), ...view.info.flatMap((item) => [item.label, item.value])];
}

describe('connect-view — 결과 글', () => {
  it('모든 결과에 한국어 제목·설명이 있고, 페이지의 다른 곳이 쓰는 글(start.spec getByText)과 겹치지 않는다', () => {
    for (const outcome of ALL_OUTCOMES) {
      const view = describeConnectOutcome(outcome, CHROME);
      const label = `${outcome.kind}:${'verdict' in outcome ? (outcome.verdict?.kind ?? 'null') : ''}`;
      expect(view.title, label).toMatch(HANGUL);
      expect(view.detail, label).toMatch(HANGUL);
      for (const text of allTexts(view)) {
        for (const reserved of RESERVED_TEXTS) {
          expect(text, label).not.toContain(reserved);
        }
      }
      for (const link of view.links) {
        expect(link.label).toBe(CONNECT_LINK_LABELS[link.target]);
      }
    }
  });

  it('포트 선택 창을 닫으면 "연결이 안 될 때" 안내를 펼치고 그곳으로 가는 링크를 준다(PLAN 흐름 [연결] → 포트가 안 보임)', () => {
    const view = describeConnectOutcome({ kind: 'not-selected' }, CHROME);
    expect(view.openPortHelp).toBe(true);
    expect(view.links.map((item) => item.target)).toEqual(['port-help']);
    expect(view.tone).toBe('neutral');
    expect(view.buttonDisabled).toBe(false);
  });

  it('MicroPython이 없으면 3단계 펌웨어 굽기로 보내고, 판별 결과마다 할 일이 다르다', () => {
    const silent = describeConnectOutcome({ kind: 'no-micropython', port: CH340, verdict: { kind: 'silent' } }, CHROME);
    expect(silent.title).toBe('보드가 대답하지 않아요');
    expect(silent.links.map((item) => item.target)).toEqual(['firmware']);
    expect(silent.steps).toHaveLength(3);
    expect(silent.info).toEqual([{ label: '고른 포트(참고)', value: 'CH340(WCH) · USB 1a86:7523' }]);
    expect(describeConnectOutcome({ kind: 'no-micropython', port: CH340, verdict: { kind: 'no-firmware', evidence: 'invalid-header' } }, CHROME).title).toBe(
      '보드에 MicroPython 펌웨어가 없어요',
    );
    expect(describeConnectOutcome({ kind: 'no-micropython', port: CH340, verdict: { kind: 'download-mode' } }, CHROME).steps[0]).toContain('EN(RST)');
    expect(describeConnectOutcome({ kind: 'no-micropython', port: CH340, verdict: { kind: 'other-python', name: 'CircuitPython 9.2.1' } }, CHROME).title).toContain(
      'CircuitPython 9.2.1',
    );
    // 블루투스 포트를 골랐으면 알린다
    const bluetooth = describeConnectOutcome({ kind: 'no-micropython', port: describePortInfo({ bluetoothServiceClassId: 0x1101 }), verdict: { kind: 'silent' } }, CHROME);
    expect(bluetooth.notes.join(' ')).toContain('블루투스 직렬 포트');
  });

  it('보드가 연결되고 LED 시험이 끝나면: 성공, 보드·펌웨어·USB 칩(참고), 4단계 첫 예제 링크, LED가 안 보였을 때 볼 것', () => {
    const view = describeConnectOutcome(ready(), CHROME);
    expect(view.tone).toBe('success');
    expect(view.title).toBe('보드가 연결됐고 MicroPython이 있어요');
    expect(view.info).toEqual([
      { label: '펌웨어', value: 'MicroPython v1.29.0 (2026-08-24)' },
      { label: '보드', value: 'Generic ESP32 module with ESP32' },
      { label: 'USB 칩(참고)', value: 'CH340(WCH) · USB 1a86:7523' },
    ]);
    expect(view.links.map((item) => item.target)).toEqual(['first-example']);
    expect(view.ledHelp).toEqual(LED_HELP);
    expect(view.notes).toEqual([]);
    expect(view.openPortHelp).toBe(false);

    const older = describeConnectOutcome(ready({ firmware: 'older', banner: OLD_BANNER }), CHROME);
    expect(older.notes.join(' ')).toContain('v1.25.0');
    expect(older.notes.join(' ')).toContain('v1.29.0');
    expect(older.links.map((item) => item.target)).toEqual(['first-example', 'firmware']);
    expect(describeConnectOutcome(ready({ esp32: false }), CHROME).notes.join(' ')).toContain('ESP32가 아닌 보드');
  });

  it('LED 시험이 오류·리셋으로 끝나면 경고와 보드가 보낸 오류 줄', () => {
    const error = describeConnectOutcome(ready({ blink: { outcome: 'error', errorLine: "ImportError: no module named 'machine'", stdout: '' } }), CHROME);
    expect(error.tone).toBe('warning');
    expect(error.detail).toContain("ImportError: no module named 'machine'");
    expect(error.ledHelp).toEqual([]);
    const reset = describeConnectOutcome(ready({ blink: { outcome: 'reset', errorLine: null, stdout: '' } }), CHROME);
    expect(reset.detail).toContain('다시 시작');
    expect(reset.links.map((item) => item.target)).toEqual(['port-help']);
  });

  it('다른 프로그램이 포트를 쓰는 중·끊김·굽는 중·포트 넘겨줌', () => {
    expect(describeConnectOutcome({ kind: 'port-in-use', port: CH340, detail: '' }, CHROME).detail).toContain('Thonny');
    expect(describeConnectOutcome({ kind: 'lost', port: CH340 }, CHROME).title).toBe('보드 연결이 끊겼어요');
    expect(describeConnectOutcome({ kind: 'flasher-busy' }, CHROME).title).toBe('펌웨어를 굽는 중이에요');
    expect(describeConnectOutcome({ kind: 'released', port: CH340 }, CHROME).title).toContain('펌웨어 굽기에 포트를 넘겨주고');
    expect(describeConnectOutcome({ kind: 'busy', port: CH340 }, CHROME).steps.join(' ')).toContain('EN(RST)');
  });

  it('Web Serial이 없으면 단추를 막고 점검 페이지로 보낸다', () => {
    const idle = describeConnectIdle(NO_SERIAL);
    expect(idle.buttonDisabled).toBe(true);
    expect(idle.detail).toContain('컴퓨터용 Chrome이나 Edge');
    expect(idle.links.map((item) => item.target)).toEqual(['check-page']);
    expect(idle.notes.join(' ')).toContain('가상 보드');
    expect(describeConnectIdle(CHROME)).toMatchObject({ buttonDisabled: false, title: '아직 연결하지 않았어요', links: [] });
  });

  it('확인하는 동안은 단추를 막고 단계 글을 보인다', () => {
    for (const step of ['choosing', 'opening', 'checking', 'blinking', 'closing'] as const) {
      const view = describeConnectStep(step, CH340, CHROME);
      expect(view.buttonDisabled, step).toBe(true);
      expect(view.tone, step).toBe('progress');
      expect(view.title, step).toMatch(HANGUL);
      for (const reserved of RESERVED_TEXTS) {
        expect(allTexts(view).join(' '), step).not.toContain(reserved);
      }
    }
    expect(describeConnectStep('choosing', null, CHROME).detail).toContain('USB-SERIAL CH340 (COM3)');
    expect(describeConnectStep('opening', CH340, CHROME).detail).toBe('고른 포트: CH340(WCH) · USB 1a86:7523');
  });

  it('포트 선택 창 오류: 창을 닫음(NotFoundError) → not-selected, 사용자 조작 없음·정책(SecurityError) → security, 그 밖 → choose-failed', () => {
    const domError = (name: string, message: string) => Object.assign(new Error(message), { name });
    expect(outcomeForChooseError(domError('NotFoundError', 'No port selected by the user.'))).toEqual({ kind: 'not-selected' });
    expect(outcomeForChooseError(domError('SecurityError', 'Must be handling a user gesture to show a permission request.'))).toEqual({
      kind: 'security',
      detail: 'SecurityError: Must be handling a user gesture to show a permission request.',
    });
    expect(outcomeForChooseError(new TypeError('A filter must provide a property to filter by.'))).toMatchObject({ kind: 'choose-failed' });
    expect(outcomeForChooseError('문자열 오류')).toEqual({ kind: 'choose-failed', detail: '문자열 오류' });
  });

  it('브라우저에 따라 덧붙이는 안내(ESP32 실습실과 같은 뜻)', () => {
    expect(supportNotes(CHROME)).toEqual([]);
    expect(supportNotes({ ...CHROME, firefox: true, recommended: false, browserName: 'Firefox' })[0]).toContain('부가 기능');
    expect(supportNotes({ ...CHROME, level: 'unknown', mobile: true })[0]).toContain('휴대폰·태블릿');
    expect(supportNotes({ ...CHROME, recommended: false, browserName: 'Opera' })[0]).toContain('Opera');
  });
});
