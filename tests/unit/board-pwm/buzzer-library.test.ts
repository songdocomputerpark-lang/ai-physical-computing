// 버저 라이브러리 buzzer.py 사이트판(PROGRESS 미해결 175, PLAN §6.5 — 원본 f008에서 게임 음악 선율 목록 mario만 뺀 판)과
// 교과서 157쪽 화면의 코드 예제(examples/esp32/u2/2-2-1-buzzer-library.py)를 글자로·실제 Pyodide로 확인한다.
// 사이트판을 만든 방법과 원본 대조 기록은 scripts/examples-manifest.yaml의 f008 주석(원본은 비공개 자료 저장소에만 있어 여기서는 대조하지 않는다).
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { librariesNeededBy } from '../../../src/lab/esp32/board-libraries.ts';
import { BOARD_LIBRARIES } from '../../../src/lab/esp32/board-library-files.ts';
import { boardPyodideReady, REPO_ROOT, runBoardSteps, stepOf } from '../lab/helpers/pyodide-board.ts';

const LIBRARY = path.join(REPO_ROOT, 'examples', 'esp32', 'lib', 'third-party', 'buzzer.py');
const EXAMPLE = path.join(REPO_ROOT, 'examples', 'esp32', 'u2', '2-2-1-buzzer-library.py');
const SITE_MARK = '# [사이트판] 게임 음악 선율 데이터 제외';
/** 만든 날(2026-09-26)의 사이트판 SHA-256 — 파일을 고치면 이 값과 manifest의 f008 주석을 함께 고친다(원본과 다른 곳이 머리말에 적힌 두 가지뿐인지 다시 대조) */
const SITE_SHA256 = 'd3b15122ec5c85616eb9dc1f634f8cfe0bd9ad0e7b81e413f0b5048805faf438';

describe('buzzer.py 사이트판(글자 검사)', () => {
  const source = fs.readFileSync(LIBRARY, 'utf8');
  const lines = source.split('\n');
  const header = lines.slice(0, lines.findIndex((line) => !line.startsWith('#')));
  const body = lines.slice(header.length);

  it('게임 음악 선율 목록(mario)이 없고 그 자리에 사이트판 표시 한 줄이 있으며, 머리말이 바꾼 곳·출처·쓰는 법을 밝힌다', () => {
    expect(source).not.toContain('\r');
    expect(source.endsWith('\n')).toBe(true);
    expect(body.filter((line) => /mario/iu.test(line))).toEqual([]);
    expect(body.filter((line) => line === SITE_MARK)).toHaveLength(1);
    const text = header.join('\n');
    for (const needle of ['[사이트판]', 'f008', '128~141', 'mario', 'TechToTinker', 'George Bantique', 'O5', 'sources.yaml', '156~157쪽', 'BUZZER(15)']) {
      expect(text).toContain(needle);
    }
  });

  it('남은 코드는 원본 그대로의 모양이다: BUZZER 클래스(play·tone), 음 이름 B0~DS8, jingle·twinkle 목록', () => {
    const code = body.join('\n');
    expect(body.slice(0, 7)).toEqual(['from machine import Pin', 'from machine import PWM', 'from time import sleep_ms', '', 'class BUZZER: ', '    def __init__(self, sig_pin):', '        self.pwm = PWM(Pin(sig_pin),duty_u16=0)      ']);
    expect(code).toContain('    def play(self, melodies, wait, duty=32767):');
    expect(code).toContain('    def tone(self, notes, wait, duty=32767):');
    expect(code).toMatch(/^B0 {2}= 31 {3}# B$/mu);
    expect(code).toMatch(/^DS8 = 4978 # D#\/Eb$/mu);
    expect(code).toContain('# This is the list of notes for jingle bells\njingle = [');
    expect(code).toContain('# This is the list of notes for Twinkle, Twinkle Little Star\ntwinkle = [');
    // 본문 150줄 = 원본 163줄 − 지운 14줄 + 표시 1줄(끝 줄바꿈 뒤 빈 조각 하나를 뺀 수)
    expect(body.length - 1).toBe(150);
    expect(createHash('sha256').update(source).digest('hex')).toBe(SITE_SHA256);
  });

  it('보드 라이브러리 목록에 들어가 `from buzzer import *` 코드가 부르면 실물 보드에도 함께 올라간다(third-party)', () => {
    const library = BOARD_LIBRARIES.find((item) => item.name === 'buzzer');
    expect(library).toMatchObject({ fileName: 'buzzer.py', file: 'esp32/lib/third-party/buzzer.py', thirdParty: true });
    const example = fs.readFileSync(EXAMPLE, 'utf8');
    expect(librariesNeededBy(example, BOARD_LIBRARIES).map((item) => item.fileName)).toEqual(['buzzer.py']);
  });

  it('교과서 157쪽 화면의 코드(7줄)를 줄 번호까지 그대로 옮겼다', () => {
    expect(fs.readFileSync(EXAMPLE, 'utf8')).toBe(['from buzzer import *', 'from time import sleep_ms', '', 'bu = BUZZER(15)', '', 'while True:', '    bu.play(jingle, 100)', ''].join('\n'));
  });
});

describe.skipIf(!boardPyodideReady)('buzzer.py 사이트판(실제 Pyodide, JSPI)', () => {
  const out = runBoardSteps('tests/unit/board-pwm/steps/buzzer-library.mjs');

  it('라이브러리 이름: 음 이름(C4 = 262 …), 징글벨 58음·반짝반짝 작은 별 48음, BUZZER — mario는 없다', () => {
    const record = stepOf(out, 'library_names');
    expect(record.errorType).toBeUndefined();
    expect(record.value).toEqual([262, 2637, 3136, 1047, 4978, 58, 48, false, true, [2637, 2637, 2637, 0], [1047, 1047, 1568, 1568, 1760, 1760, 1568, 0]]);
  });

  it('교과서 156~157쪽 흐름: BUZZER(15)로 PWM을 열고 play(jingle[:6], 100)이 음마다 주파수를 바꾸며(쉼표 0은 앞 음 그대로), 끝나면 무음(duty 0)', () => {
    const record = stepOf(out, 'textbook_flow');
    expect(record.errorType, record.errorMessage).toBeUndefined();
    const [seen, afterPlay, afterTone, pwmOn] = record.value as [number[], number, number, boolean];
    // 징글벨 앞 여섯 음: E7 E7 E7 (쉼) E7 E7 → freq()는 0이 아닌 음에서만 불린다. 이어서 tone(C4, 200)
    expect(seen).toEqual([2637, 2637, 2637, 2637, 2637, 262]);
    expect(afterPlay).toBe(0);
    expect(afterTone).toBe(0);
    expect(pwmOn).toBe(true);
    // 화면으로 간 핀 상태에 15번 핀 PWM(징글벨 E7 약 2637Hz, 도 약 262Hz)이 보인다
    const freqs = record.events.flatMap((event) => event.pins.filter((pin) => pin.id === 15 && pin.mode === 'pwm').map((pin) => Math.round(pin.freq ?? 0)));
    expect(freqs.some((freq) => Math.abs(freq - 2637) <= 5)).toBe(true);
    expect(freqs.some((freq) => Math.abs(freq - 262) <= 5)).toBe(true);
  });

  it('교과서 157쪽 코드 파일 그대로: ImportError 없이 징글벨이 끝없이 울리다가 [정지]로 멈춘다', () => {
    const record = stepOf(out, 'textbook_file');
    expect(record.errorType).toBe('KeyboardInterrupt');
    expect(record.stderr).not.toMatch(/ImportError|ModuleNotFoundError/u);
    const sounding = record.events.flatMap((event) => event.pins.filter((pin) => pin.id === 15 && pin.mode === 'pwm' && (pin.duty ?? 0) > 0));
    expect(sounding.length).toBeGreaterThan(0);
    // 징글벨의 다섯 음(C7 2093·D7 2349·E7 2637·F7 2794·G7 3136Hz) — 핀 상태의 주파수는 실물처럼 PWM 해상도에 맞춘 값이라 몇 Hz 다르다(3136 → 3133)
    const notes = [2093, 2349, 2637, 2794, 3136];
    expect(sounding.map((pin) => pin.freq ?? 0).filter((freq) => !notes.some((note) => Math.abs(freq - note) <= 5))).toEqual([]);
    expect(sounding.some((pin) => Math.abs((pin.freq ?? 0) - 3136) <= 5)).toBe(true);
  });

  it('이름을 틀리게 적으면(from buzer import *) 가상 보드에서도 ModuleNotFoundError다(2-2-1 오류 상자)', () => {
    const record = stepOf(out, 'typo_import');
    expect(record.errorType).toBe('ModuleNotFoundError');
    expect(record.errorMessage).toContain("No module named 'buzer'");
  });
});
