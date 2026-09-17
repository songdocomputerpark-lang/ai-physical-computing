// 실제 보드 패널의 한국어 글·단추(src/lab/modules/real-board/status-text.ts)와 탭 키보드 규칙(index.ts nextTabForKey) 검사(P3-07, P3-08 저장·되찾기·자동 실행 파일).
import { describe, expect, it } from 'vitest';
import type { BoardConnectionSnapshot } from '../../../src/lab/serial/board-connection.ts';
import type { BoardSaveResult } from '../../../src/lab/serial/board-files.ts';
import type { SerialSupport } from '../../../src/lab/serial/support.ts';
import { nextTabForKey } from '../../../src/lab/modules/real-board/index.ts';
import manifest from '../../../src/lab/modules/real-board/manifest.ts';
import { FIRMWARE_LINK, PORT_HELP_LINK, autorunNotes, describeRealBoard, describeSave, saveNoticeText } from '../../../src/lab/modules/real-board/status-text.ts';
import { validateManifests } from '../../../src/lab/modules/manifests.ts';

const chrome: SerialSupport = { level: 'supported', recommended: true, browserName: 'Chrome', firefox: false, mobile: false, summary: 'USB로 보드를 연결하는 기능이 있어요.', advice: '' };
const firefox: SerialSupport = { ...chrome, recommended: false, browserName: 'Firefox', firefox: true };
const safari: SerialSupport = { level: 'unsupported', recommended: false, browserName: 'Safari', firefox: false, mobile: false, summary: '이 브라우저에는 USB 보드 연결 기능이 없어요.', advice: '컴퓨터용 Chrome이나 Edge로 열어 주세요.' };

const banner = { version: 'v1.29.0', buildDate: '2026-08-24', machine: 'Generic ESP32 module with ESP32', line: 'MicroPython v1.29.0 on 2026-08-24; Generic ESP32 module with ESP32' };
const port = { kind: 'usb' as const, usbId: '1a86:7523', chip: 'CH340', maker: 'WCH', text: 'CH340(WCH) · USB 1a86:7523' };

function snapshot(partial: Partial<BoardConnectionSnapshot>): BoardConnectionSnapshot {
  return { state: 'idle', port: null, banner: null, verdict: null, firmware: null, esp32: null, problem: null, replugged: false, hasLastPort: false, runStage: null, ...partial };
}

describe('describeRealBoard — 상태마다 글과 단추', () => {
  it('연결 전: [보드 연결]을 강조하고 포트 고르기 안내, Firefox면 부가 기능 안내', () => {
    const view = describeRealBoard(snapshot({}), chrome);
    expect(view).toMatchObject({ tone: 'neutral', title: '실제 보드가 연결되지 않았어요', actions: ['connect'], primary: 'connect', portHelp: 'shown', notes: [] });
    expect(describeRealBoard(snapshot({}), firefox).notes[0]).toContain('부가 기능');
    expect(describeRealBoard(snapshot({ problem: { code: 'not-selected', detail: '' } }), chrome).title).toBe('포트를 고르지 않았어요');
  });

  it('지원하지 않는 브라우저: 단추 없이 대처와 [가상 보드] 안내', () => {
    const view = describeRealBoard(snapshot({ state: 'unsupported', problem: { code: 'unsupported', detail: '' } }), safari);
    expect(view.actions).toEqual([]);
    expect(view.detail).toContain('Chrome');
    expect(view.notes[0]).toContain('[가상 보드]');
  });

  it('연결됨: 펌웨어·보드·USB 칩 정보, 옛 펌웨어·ESP32 아님 안내', () => {
    const ready = describeRealBoard(snapshot({ state: 'ready', port, banner, firmware: 'same', esp32: true, hasLastPort: true }), chrome);
    expect(ready).toMatchObject({
      tone: 'success',
      title: '실제 보드가 연결됐어요',
      actions: ['save', 'check', 'choose', 'disconnect'],
      primary: null,
      info: { firmware: 'MicroPython v1.29.0 (2026-08-24)', machine: 'Generic ESP32 module with ESP32', chip: 'CH340(WCH) · USB 1a86:7523' },
      notes: [],
      guide: null,
      saved: null,
      progress: null,
    });
    expect(ready.detail).toContain('[보드에 저장]');
    const old = describeRealBoard(snapshot({ state: 'ready', port, banner: { ...banner, version: 'v1.22.2', machine: 'Raspberry Pi Pico with RP2040' }, firmware: 'older', esp32: false }), chrome);
    expect(old.notes).toHaveLength(2);
    expect(old.notes[0]).toContain('v1.22.2');
    expect(old.notes[1]).toContain('ESP32가 아닌');
  });

  it('실행 중: 단계 글, [연결 끊기]만', () => {
    const view = describeRealBoard(snapshot({ state: 'running', port, banner, runStage: 'upload' }), chrome);
    expect(view).toMatchObject({ tone: 'progress', title: '실제 보드에서 코드가 돌고 있어요', detail: '코드를 보드로 보내는 중이에요.', actions: ['disconnect'] });
  });

  it('MicroPython 없음: 판별 결과마다 까닭과 펌웨어 굽기 안내 링크(포트 놓기)', () => {
    const silent = describeRealBoard(snapshot({ state: 'no-micropython', port, verdict: { kind: 'silent' } }), chrome);
    expect(silent).toMatchObject({ tone: 'warning', title: '보드가 대답하지 않아요', primary: 'check' });
    // 조용히 도는(멈춤 신호를 삼키는) 프로그램일 수도 있어 [보드 되찾기]도 보인다(P3-08)
    expect(silent.guide?.steps).toHaveLength(4);
    expect(silent.actions).toEqual(['check', 'recover', 'restart', 'choose', 'disconnect']);
    expect(silent.guide?.links).toEqual([FIRMWARE_LINK]);
    expect(FIRMWARE_LINK).toMatchObject({ path: 'start/board/#firmware', releasePort: true });
    expect(describeRealBoard(snapshot({ state: 'no-micropython', verdict: { kind: 'no-firmware', evidence: 'invalid-header' } }), chrome).title).toBe('보드에 MicroPython 펌웨어가 없어요');
    expect(describeRealBoard(snapshot({ state: 'no-micropython', verdict: { kind: 'download-mode' } }), chrome).primary).toBe('restart');
    expect(describeRealBoard(snapshot({ state: 'no-micropython', verdict: { kind: 'other-python', name: 'CircuitPython 9.2.1' } }), chrome).title).toContain('CircuitPython 9.2.1');
    expect(describeRealBoard(snapshot({ state: 'no-micropython', verdict: { kind: 'other-output', garbled: true } }), chrome).title).toBe('보드가 알아볼 수 없는 글자를 보내요');
  });

  it('멈추지 않음·끊김·포트 사용 중·약속 어긋남', () => {
    expect(describeRealBoard(snapshot({ state: 'busy', verdict: { kind: 'busy' } }), chrome)).toMatchObject({ primary: 'recover', actions: ['recover', 'restart', 'check', 'disconnect'] });
    const lost = describeRealBoard(snapshot({ state: 'lost', problem: { code: 'lost', detail: '' }, hasLastPort: true }), chrome);
    expect(lost).toMatchObject({ tone: 'danger', title: '보드 연결이 끊겼어요', primary: 'reconnect' });
    expect(describeRealBoard(snapshot({ state: 'lost', replugged: true }), chrome).detail).toBe('보드가 다시 꽂혔어요. [다시 연결]을 눌러요.');
    expect(describeRealBoard(snapshot({ state: 'error', problem: { code: 'port-in-use', detail: 'NetworkError' } }), chrome).detail).toContain('Thonny');
    expect(describeRealBoard(snapshot({ state: 'error', problem: { code: 'protocol', detail: '' } }), chrome).primary).toBe('check');
    expect(describeRealBoard(snapshot({ state: 'error', problem: { code: 'security', detail: '' } }), chrome).title).toBe('포트 선택 창을 열 수 없어요');
    expect(PORT_HELP_LINK.path).toBe('start/board/#port-not-found');
  });
});

describe('describeRealBoard — [보드에 저장]·[보드 되찾기]·자동 실행 파일(P3-08)', () => {
  const saved: BoardSaveResult = {
    files: [
      { path: 'i2c_lcd.py', kind: 'library', size: 13040, status: 'written', replaced: false, thirdParty: true },
      { path: 'servo_library.py', kind: 'library', size: 1116, status: 'same', replaced: false, thirdParty: false },
      { path: 'main.py', kind: 'main', size: 3412, status: 'written', replaced: true, thirdParty: false },
    ],
    totalBytes: 17568,
    writtenBytes: 16452,
    hashChecked: true,
    durationMs: 2100,
    mainUsesInput: false,
  };

  it('저장 중: 단추 없이 파일별 진행 글과 바이트 진행률', () => {
    const preparing = describeRealBoard(snapshot({ state: 'writing', port, banner, task: { kind: 'save', progress: null } }), chrome);
    expect(preparing).toMatchObject({ tone: 'progress', title: '보드에 저장하는 중이에요…', actions: [], progress: { value: 0, max: 1 } });
    const writing = describeRealBoard(
      snapshot({
        state: 'writing',
        port,
        banner,
        task: { kind: 'save', progress: { phase: 'write', path: 'i2c_lcd.py', written: 2560, size: 13040, fileNumber: 1, fileCount: 3, doneBytes: 2560, totalBytes: 17568 } },
      }),
      chrome,
    );
    expect(writing.detail).toBe('i2c_lcd.py: 보드로 보내고 있어요(2,560/13,040바이트).');
    expect(writing.progress).toEqual({ value: 2560, max: 17568, text: '파일 3개 중 1번째' });
    const renaming = describeRealBoard(snapshot({ state: 'writing', task: { kind: 'disable-autorun', file: 'boot.py' } }), chrome);
    expect(renaming.title).toBe('boot.py 파일 이름을 바꾸는 중이에요…');
  });

  it('저장 결과 상자: 파일마다 한 줄(새로·바꿈·같아서 그대로), 전원만 넣으면 실행된다는 안내, input() 코드 안내', () => {
    const box = describeSave({ ok: true, result: saved });
    expect(box).toMatchObject({ tone: 'success', title: '보드에 저장했어요' });
    expect(box?.items).toEqual([
      'i2c_lcd.py — 코드가 쓰는 라이브러리를 함께 올렸어요(13,040바이트)',
      'servo_library.py — 보드에 이미 같은 파일이 있어서 그대로 뒀어요',
      'main.py — 보드에 있던 파일을 이 코드로 바꿨어요(3,412바이트)',
    ]);
    expect(box?.tips).toHaveLength(1);
    expect(describeSave({ ok: true, result: { ...saved, mainUsesInput: true } })?.tips[1]).toContain('input()');
    const ready = describeRealBoard(snapshot({ state: 'ready', port, banner, lastSave: { ok: true, result: saved } }), chrome);
    expect(ready.saved?.items).toHaveLength(3);
    expect(saveNoticeText({ ok: true, result: saved })).toBe(
      '보드에 저장했어요: i2c_lcd.py(라이브러리 함께 올림), servo_library.py(이미 같아서 그대로), main.py(3,412바이트 — 바꿔 씀). USB를 다시 꽂거나 보드의 EN(RST) 버튼을 누르면 main.py가 저절로 실행돼요.',
    );
    const failed = describeSave({ ok: false, error: { name: 'BoardFileError', code: 'no-space', path: 'main.py', message: '보드 저장 공간이 모자라 main.py 파일을 쓰지 못했어요.' } });
    expect(failed).toMatchObject({ tone: 'danger', title: '보드에 저장하지 못했어요', items: ['보드 저장 공간이 모자라 main.py 파일을 쓰지 못했어요.'] });
    expect(failed?.tips[0]).toContain('공간');
    expect(describeSave(null)).toBeNull();
  });

  it('되찾는 중: 단계마다 글, EN 버튼 단계는 주의 색', () => {
    const interrupt = describeRealBoard(snapshot({ state: 'recovering', recoveryStage: 'interrupt' }), chrome);
    expect(interrupt).toMatchObject({ tone: 'progress', title: '보드를 되찾는 중이에요…', actions: [] });
    expect(describeRealBoard(snapshot({ state: 'recovering', recoveryStage: 'reset' }), chrome).detail).toContain('다시 켜면서');
    expect(describeRealBoard(snapshot({ state: 'recovering', recoveryStage: 'press-button' }), chrome)).toMatchObject({ tone: 'warning', title: '보드의 EN(RST) 버튼을 한 번 눌러 주세요' });
    const failed = describeRealBoard(snapshot({ state: 'busy', problem: { code: 'recover-failed', detail: '' } }), chrome);
    expect(failed).toMatchObject({ tone: 'danger', title: '보드를 되찾지 못했어요', primary: 'recover' });
    expect(failed.guide?.links).toEqual([FIRMWARE_LINK]);
  });

  it('자동 실행 파일: 삼키는 반복이면 [boot.py 끄기]를 강조, 일부러 둔 boot.py 반복이면 안내와 단추만, 끈 뒤에는 새 이름', () => {
    const stuck = describeRealBoard(snapshot({ state: 'ready', port, banner, autorun: { file: 'boot.py', stuck: true, disabledAs: null } }), chrome);
    expect(stuck).toMatchObject({ primary: 'disable-autorun', actionLabels: { 'disable-autorun': 'boot.py 끄기' } });
    expect(stuck.actions[0]).toBe('disable-autorun');
    expect(stuck.notes[0]).toContain('[boot.py 끄기]');
    const loop = describeRealBoard(snapshot({ state: 'ready', port, banner, autorun: { file: 'boot.py', stuck: false, disabledAs: null } }), chrome);
    expect(loop).toMatchObject({ primary: null, actionLabels: { 'disable-autorun': 'boot.py 끄기' } });
    expect(loop.actions).toEqual(['save', 'check', 'choose', 'disable-autorun', 'disconnect']);
    expect(loop.notes[0]).toContain('그대로 둬도 돼요');
    const main = describeRealBoard(snapshot({ state: 'ready', port, banner, autorun: { file: 'main.py', stuck: false, disabledAs: null } }), chrome);
    expect(main.actions).not.toContain('disable-autorun');
    const done = describeRealBoard(snapshot({ state: 'ready', port, banner, autorun: { file: 'main.py', stuck: true, disabledAs: 'main_off.py' } }), chrome);
    expect(done.actions).not.toContain('disable-autorun');
    expect(autorunNotes({ file: 'main.py', stuck: true, disabledAs: 'main_off.py' })[0]).toContain('main.py → main_off.py');
    const busy = describeRealBoard(snapshot({ state: 'busy', autorun: { file: 'boot.py', stuck: true, disabledAs: null } }), chrome);
    expect(busy.detail).toContain('boot.py');
  });
});

describe('탭 키보드와 manifest', () => {
  it('←·→는 돌아가며, Home·End는 처음·끝, 다른 키는 무시', () => {
    expect(nextTabForKey('ArrowRight', 'virtual')).toBe('real');
    expect(nextTabForKey('ArrowRight', 'real')).toBe('virtual');
    expect(nextTabForKey('ArrowLeft', 'virtual')).toBe('real');
    expect(nextTabForKey('Home', 'real')).toBe('virtual');
    expect(nextTabForKey('End', 'virtual')).toBe('real');
    expect(nextTabForKey('Enter', 'virtual')).toBeNull();
  });

  it('manifest는 폴더 규약을 지키고 ESP32 실습실에만 붙는다(파이썬 이름 없음)', () => {
    expect(validateManifests({ './real-board/manifest.ts': { default: manifest } })).toEqual([]);
    expect(manifest).toMatchObject({ id: 'real-board', labs: ['esp32'], requestKinds: [], eventKinds: [], channels: [] });
  });
});
