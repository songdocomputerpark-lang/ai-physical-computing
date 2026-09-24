// 오류 → 한국어 풀이 고르기(src/lab/errors/explain.ts) 단위 테스트 — PLAN §8.2 P2-06 "Vitest(오류 문자열 → 설명 매핑)".
//
// 가장 중요한 검사는 아래 EXPECTED 표다: **실제로 채집한 트레이스백**(tests/unit/errors/fixtures/tracebacks.json,
// Node의 진짜 Pyodide 314.0.7 + opencv-python 4.11.0.86)을 넣으면 오류 사전(content/help/errors/errors.yaml)의
// 어떤 항목이 골라지는지 하나하나 적어 두었다. 사전의 패턴을 고치다 다른 오류의 풀이가 바뀌면 여기서 바로 알 수 있다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadCatalogFromYaml } from '../../../src/lab/errors/catalog-build.ts';
import { BUILTIN_PLACEHOLDERS, type ErrorCatalog } from '../../../src/lab/errors/catalog-schema.ts';
import { consoleSummary, describeLocation, entryPreview, explain, fillTemplate, shortenMessage } from '../../../src/lab/errors/explain.ts';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));

interface Fixture {
  cases: Record<string, { code: string; type: string; message: string; traceback: string }>;
}

const fixtures = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'unit', 'errors', 'fixtures', 'tracebacks.json'), 'utf8')) as Fixture;
const catalog: ErrorCatalog = loadCatalogFromYaml(fs.readFileSync(path.join(ROOT, 'content', 'help', 'errors', 'errors.yaml'), 'utf8'));

/** 채집한 사례(왼쪽)를 넣으면 사전의 이 항목(오른쪽)이 골라져야 한다. */
const EXPECTED: Readonly<Record<string, string>> = {
  // 코드 모양(문법)
  'syntax-assign-compare': 'syntax-assign-compare',
  'syntax-missing-colon': 'syntax-missing-colon',
  'syntax-unclosed': 'syntax-unclosed',
  'syntax-print': 'syntax-print',
  'syntax-invalid-character': 'syntax-invalid-character',
  'indentation-expected': 'indentation-expected',
  'indentation-unexpected': 'indentation-unexpected',
  'indentation-mismatch': 'indentation-unexpected',
  // 이름·값
  'name-error': 'name-error',
  'name-error-typo': 'name-error',
  'name-error-in-function': 'name-error',
  'unbound-local': 'unbound-local',
  'index-error': 'index-error',
  'key-error': 'key-error',
  'value-error-int': 'value-error-int',
  'value-error-unpack': 'value-error-unpack',
  'numpy-shape': 'value-error',
  'chained-context': 'value-error',
  // 자료형·계산
  'type-error-str-int': 'type-error-str-int',
  'type-error-none': 'type-error-none',
  'type-error-not-subscriptable': 'type-error-none',
  'type-error-args': 'type-error-args',
  'attribute-error-none': 'attribute-error-none',
  'attribute-error-module': 'attribute-error-module',
  'attribute-error-list': 'attribute-error',
  'zero-division': 'zero-division',
  'site-frame-between': 'zero-division',
  'recursion-error': 'recursion-error',
  'assertion-error': 'assertion-error',
  'stop-iteration': 'stop-iteration',
  // 영상 처리(OpenCV)
  'cv2-empty-image': 'cv2-empty-image',
  'cv2-empty-imread': 'cv2-empty-image',
  'cv2-channels': 'cv2-channels',
  'cv2-channels-add': 'cv2-channels',
  'cv2-size-mismatch': 'cv2-channels',
  'cv2-kernel-odd': 'cv2-kernel-odd',
  'cv2-bad-argument': 'cv2-bad-argument',
  // 모듈·파일
  'module-not-found': 'module-not-found',
  'module-not-found-site': 'module-not-found-site',
  'import-error': 'import-error',
  'file-not-found': 'file-not-found',
  'os-error-font': 'os-error-font',
  // 실습실 안내
  'keyboard-interrupt': 'keyboard-interrupt',
  'eof-error': 'eof-error',
  // 사전에 없는 오류는 마지막 풀이로
  'chained-cause': 'unknown',
};

function explainFixture(id: string) {
  const found = fixtures.cases[id];
  if (!found) {
    throw new Error(`채집본에 "${id}" 사례가 없어요.`);
  }
  const explanation = explain(catalog, {
    outcome: 'error',
    error: { type: found.type, message: found.message, traceback: found.traceback },
  });
  if (!explanation) {
    throw new Error(`"${id}" 사례에서 풀이가 나오지 않았어요.`);
  }
  return explanation;
}

describe('채집한 오류 → 사전 항목', () => {
  it(`사례 ${Object.keys(EXPECTED).length}개가 모두 표대로 이어진다`, () => {
    const actual: Record<string, string> = {};
    for (const id of Object.keys(EXPECTED)) {
      actual[id] = explainFixture(id).entry.id;
    }
    expect(actual).toEqual(EXPECTED);
  });

  it('서로 다른 오류 15가지 이상에 다른 풀이가 붙는다(PLAN P2-06 기준)', () => {
    const picked = new Set(Object.keys(EXPECTED).map((id) => explainFixture(id).entry.id));
    picked.delete('unknown');
    expect(picked.size).toBeGreaterThanOrEqual(15);
  });

  it('모든 사례가 줄 번호·제목·고치는 법을 갖춘다', () => {
    for (const id of Object.keys(EXPECTED)) {
      const explanation = explainFixture(id);
      expect(explanation.title, id).not.toBe('');
      expect(explanation.fix.length, id).toBeGreaterThan(0);
      // 글의 자리({name} 등)에 값이 들어갔다(값이 없으면 "(알 수 없음)"·"?번째 줄"이 보인다).
      const texts = [explanation.title, explanation.meaning, ...explanation.why, ...explanation.fix, ...explanation.mistakes];
      expect(texts.join('\n'), id).not.toContain('(알 수 없음)');
      expect(texts.join('\n'), id).not.toContain('?번째 줄');
      if (id !== 'stop-iteration') {
        expect(explanation.location, id).not.toBeNull();
      }
    }
  });
});

describe('풀이 내용', () => {
  it('NameError는 이름과 줄 번호를 글에 넣는다', () => {
    const explanation = explainFixture('name-error-in-function');
    expect(explanation.entry.id).toBe('name-error');
    expect(explanation.typeLabel).toBe('NameError');
    expect(explanation.meaning).toContain("'total'");
    expect(explanation.locationText).toBe('내 코드 2번째 줄(함수 show 안)');
    expect(explanation.fix[0]).toContain('2번째 줄');
    expect(explanation.matched).toBe('type+pattern');
    expect(explanation.dictionaryPath).toBe('help/errors/#name-error');
    expect(consoleSummary(explanation)).toBe('[오류 풀이] NameError — 정해 준 적이 없는 이름을 썼어요 (내 코드 2번째 줄(함수 show 안)). 자세한 풀이는 콘솔 위 "오류 풀이" 카드에 있어요.');
  });

  it('모듈·함수 이름이 글에 그대로 들어가고 조사는 소리에 맞게 붙는다', () => {
    // cv3의 끝소리는 "삼"이라 "이"가 붙는다(src/lib/korean.ts).
    expect(explainFixture('module-not-found').meaning).toBe("import cv3에서 cv3이 무엇인지 파이썬이 몰라요. 이름을 잘못 쳤거나, 이 파이썬에 없는 모듈이에요.");
    expect(explainFixture('module-not-found-site').meaning).toContain('mediapipe 모듈은');
    // 영문 이름 뒤에는 "이(가)"처럼 두 조사를 적게 되므로(korean.ts) 사전 글은 조사가 필요 없는 말로 쓴다.
    expect(explainFixture('attribute-error-module').meaning).toBe('cv2 모듈에 destoyAllWindows 함수가 없어요. 이름을 잘못 쳤거나, 그 판의 모듈에는 없는 함수예요.');
    const englishParticles = catalog.entries.flatMap((entry) =>
      [entry.title, entry.meaning, ...entry.why, ...entry.fix, ...entry.mistakes].filter((text) => /\{(?:name|attr|func|path|kind|arg):/u.test(text)),
    );
    expect(englishParticles, '영문 이름이 들어가는 자리에는 조사를 붙이지 않아요(을(를)처럼 보여요)').toEqual([]);
  });

  it('OpenCV 오류는 함수 이름을 넣고 긴 빌드 경로를 줄인다', () => {
    const explanation = explainFixture('cv2-empty-image');
    expect(explanation.entry.id).toBe('cv2-empty-image');
    expect(explanation.typeLabel).toBe('cv2.error');
    expect(explanation.meaning).toContain('cv2.cvtColor');
    expect(explanation.lastLine).toContain('OpenCV(4.11.0) color.cpp:199');
    expect(explanation.lastLine).not.toContain('/home/runner');
  });

  it('짧은 트레이스백에는 파이썬 안쪽 프레임이 없다', () => {
    const explanation = explainFixture('name-error');
    expect(explanation.simplified).toContain('File "main.py", line 2, in <module>');
    expect(explanation.simplified).not.toContain('_pyodide');
  });

  it('사전에 없는 오류는 마지막 풀이로 가고 메시지를 그대로 보여 준다', () => {
    const explanation = explainFixture('chained-cause');
    expect(explanation.entry.fallback).toBe(true);
    expect(explanation.matched).toBe('fallback');
    expect(explanation.meaning).toContain('처리 실패');
  });
});

describe('정지·다시 시작', () => {
  it('[정지]로 멈추면 오류가 아니라고 알려 준다', () => {
    const explanation = explain(catalog, { outcome: 'stopped' });
    expect(explanation?.kind).toBe('stopped');
    expect(explanation?.entry.id).toBe('keyboard-interrupt');
    expect(explanation?.typeLabel).toBe('정지');
    expect(explanation?.location).toBeNull();
    expect(explanation?.simplified).toBeNull();
  });

  it('정지 2단계는 다시 시작 풀이를 보여 준다', () => {
    const explanation = explain(catalog, { outcome: 'killed' });
    expect(explanation?.entry.id).toBe('forced-restart');
    expect(explanation?.typeLabel).toBe('파이썬 다시 시작');
    expect(explanation?.fix.length).toBeGreaterThan(0);
  });

  it('잘 끝난 실행에는 풀이가 없다', () => {
    expect(explain(catalog, { outcome: 'ok' })).toBeNull();
  });

  it('실습실이 만든 오류(패키지·준비·제한 모드)도 항목이 있다', () => {
    const cases: [string, string, string][] = [
      ['PackageLoadError', '필요한 파이썬 패키지를 받지 못했어요: 네트워크 오류', 'package-load-error'],
      ['RuntimeNotReady', '파이썬이 아직 준비되지 않았어요.', 'runtime-not-ready'],
      ['RuntimeBusy', '이미 다른 코드가 실행 중이에요.', 'runtime-not-ready'],
      ['RuntimeError', '이 브라우저에는 JSPI(파이썬 기다리기 기능)가 없어서 입력이나 카메라를 기다리는 코드는 실행할 수 없어요.', 'limited-mode'],
    ];
    for (const [type, message, entryId] of cases) {
      const explanation = explain(catalog, { outcome: 'error', error: { type, message: `${type}: ${message}`, traceback: '' } });
      expect(explanation?.entry.id, type).toBe(entryId);
    }
  });

  it('pyautogui 안전장치(FailSafeException)도 이어진다', () => {
    const traceback = [
      'Traceback (most recent call last):',
      '  File "main.py", line 5, in <module>',
      '    pyautogui.moveTo(0, 0)',
      '  File "/apc/apc_pyautogui.py", line 120, in moveTo',
      '    _fail_safe_check()',
      'pyautogui.FailSafeException: PyAutoGUI fail-safe triggered from mouse moving to a corner of the screen.',
    ].join('\n');
    const explanation = explain(catalog, { outcome: 'error', error: { type: 'FailSafeException', message: 'PyAutoGUI fail-safe triggered…', traceback } });
    expect(explanation?.entry.id).toBe('failsafe');
    expect(explanation?.location?.line).toBe(5);
  });

  it('가상 ESP32 보드 오류(P3-01): 실물과 같은 문구에 보드 풀이가 붙고, 학생 코드 줄을 가리킨다', () => {
    const board = (line: number, code: string, last: string) =>
      [
        'Traceback (most recent call last):',
        `  File "main.py", line ${line}, in <module>`,
        `    ${code}`,
        '  File "/apc/machine.py", line 150, in __new__',
        '    gpio = apc_board.find_pin(id)',
        last,
      ].join('\n');
    const cases: [string, string, string, string][] = [
      ['ValueError', 'led = Pin(24, Pin.OUT)', 'ValueError: invalid pin', 'board-invalid-pin'],
      ['ValueError', 'led = Pin(34, Pin.OUT)', 'ValueError: pin can only be input', 'board-input-only-pin'],
      ['ValueError', 't = Timer(4)', "ValueError: Timer(4) doesn't exist, there are only 4 hardware timers", 'board-timer-id'],
      ['ValueError', 'Timer(0).init(period=0)', 'ValueError: Timer period is too short for this timer', 'board-timer-period'],
      ['OverflowError', 'time.ticks_add(0, 2**29)', 'OverflowError: ticks interval overflow', 'board-ticks-overflow'],
      ['ImportError', 'from machine import PWM', 'ImportError: machine.PWM은(는) 가상 보드에 아직 없어요(실물 ESP32에는 있어요).', 'board-not-emulated'],
      ['ModuleNotFoundError', 'import bluetooth', "ModuleNotFoundError: No module named 'bluetooth' (가상 보드의 블루투스는 아직 흉내 내지 않아요)", 'board-not-emulated'],
      // 영상처리 실습실(보드 흉내 없음)의 import machine은 예전처럼 "실습실을 옮기세요" 풀이
      ['ModuleNotFoundError', 'import machine', "ModuleNotFoundError: No module named 'machine'", 'module-not-found-site'],
      // 보드와 상관없는 ValueError는 원래 풀이
      ['ValueError', "int('x')", "ValueError: invalid literal for int() with base 10: 'x'", 'value-error-int'],
    ];
    for (const [type, code, last, entryId] of cases) {
      const explanation = explain(catalog, { outcome: 'error', error: { type, message: last, traceback: board(2, code, last) } });
      expect(explanation?.entry.id, last).toBe(entryId);
      expect(explanation?.location?.line, last).toBe(2);
    }
    const timer = explain(catalog, { outcome: 'error', error: { type: 'ValueError', message: cases[2]![2], traceback: board(3, cases[2]![1], cases[2]![2]) } });
    expect(timer?.meaning).toContain('Timer(4)');
    expect(timer?.fix.join('\n')).toContain('3번째 줄');
  });

  it('통신 오류(Phase 4): 흉내 모듈이 내는 문구마다 통신 묶음의 맞는 풀이가 붙는다', () => {
    const trace = (line: number, code: string, last: string, inner = '/apc/serial.py') =>
      ['Traceback (most recent call last):', `  File "main.py", line ${line}, in <module>`, `    ${code}`, `  File "${inner}", line 90, in open`, '    raise error', last].join('\n');
    const cases: [string, string, string, string][] = [
      // 컴퓨터 쪽 시리얼(P4-02): 받을 보드 화면 없음 / 글자를 그대로 씀
      ['SerialException', "uart = serial.Serial('COM10', 115200)", 'serial.SerialException: ESP32 실습실 탭을 찾지 못했어요. [보내기] 패널의 …', 'comm-serial-no-peer'],
      ['TypeError', "uart.write('a')", "TypeError: unicode strings are not supported, please encode to bytes: 'a'", 'comm-serial-write-str'],
      // 새 예제용 bridge 모듈(P4-08): 받을 쪽 없음 / 보드(ESP32 실습실)에서 import
      ['BridgeNoPeer', 'bridge.send("3")', 'bridge.BridgeNoPeer: ESP32 실습실 탭을 찾지 못했어요. …', 'comm-no-peer'],
      ['ModuleNotFoundError', 'import bridge', "ModuleNotFoundError: No module named 'bridge' (bridge는 컴퓨터(영상처리 실습실)에서 쓰는 사이트 모듈이라 ESP32 보드에는 없어요.)", 'comm-bridge-on-board'],
      // 흉내가 붙지 않은 실습실의 컴퓨터 쪽 모듈
      ['ModuleNotFoundError', 'import bluetooth', "ModuleNotFoundError: No module named 'bluetooth'", 'comm-pc-module-not-yet'],
      // 가상 BLE(P4-03): 연결 없이 알림 / 흉내 내지 않는 함수
      ['OSError', 'ble.send("COUNT,1")', 'OSError: [Errno 128] ENOTCONN', 'comm-ble-not-connected'],
      ['AttributeError', 'bluetooth.BLE().gap_scan(2000)', "AttributeError: 'BLE' object has no attribute 'gap_scan' (가상 보드의 블루투스는 …)", 'comm-ble-not-supported'],
      // MQTT(P4-06·P4-10)
      ['OSError', 'client.publish(b"led", b"on")', 'OSError: MQTT에 아직 연결하지 않았어요. client.connect()를 먼저 불러요.', 'comm-mqtt-not-connected'],
      ['OSError', 'client.publish(b"", b"on")', 'OSError: 토픽 ""는 쓸 수 없어요. 비어 있지 않은 글자여야 하고, 줄바꿈이나 널 문자는 넣을 수 없어요.', 'comm-mqtt-bad-topic'],
      ['OSError', 'client.connect()', 'OSError: 중계 서버 wss://broker.emqx.io:8084/mqtt에 연결하지 못했어요(8초 동안 답이 없음).', 'comm-mqtt-connect-failed'],
      ['AttributeError', 'client.check_msg()', "AttributeError: 'NoneType' object has no attribute 'check_msg'", 'comm-mqtt-connect-first'],
      // 통신과 상관없는 OSError·AttributeError는 원래 풀이
      ['AttributeError', 'x.upper()', "AttributeError: 'NoneType' object has no attribute 'upper'", 'attribute-error-none'],
    ];
    for (const [type, code, last, entryId] of cases) {
      const explanation = explain(catalog, { outcome: 'error', error: { type, message: last, traceback: trace(4, code, last) } });
      expect(explanation?.entry.id, last).toBe(entryId);
      expect(explanation?.location?.line, last).toBe(4);
    }
    const connectFirst = explain(catalog, { outcome: 'error', error: { type: 'AttributeError', message: cases[10]![2], traceback: trace(5, cases[10]![1], cases[10]![2]) } });
    expect(connectFirst?.meaning).toContain('client.check_msg()');
    const failed = explain(catalog, { outcome: 'error', error: { type: 'OSError', message: cases[9]![2], traceback: trace(5, cases[9]![1], cases[9]![2]) } });
    expect(failed?.meaning).toContain('wss://broker.emqx.io:8084/mqtt');
  });

  it('카메라 프레임을 못 받은 흉내 모듈 오류는 카메라 항목으로 간다', () => {
    const traceback = [
      'Traceback (most recent call last):',
      '  File "main.py", line 3, in <module>',
      '    ok, frame = cap.read()',
      '  File "/apc/apc_cv2.py", line 210, in read',
      '    width = answer.width',
      "AttributeError: 'JsNull' object has no attribute 'width'",
    ].join('\n');
    const explanation = explain(catalog, { outcome: 'error', error: { type: 'AttributeError', message: "AttributeError: 'JsNull' object has no attribute 'width'", traceback } });
    expect(explanation?.entry.id).toBe('camera-frame-missing');
    expect(explanation?.location?.line).toBe(3);
  });
});

describe('도우미 함수', () => {
  it('자리 채우기: 값이 없으면 알아볼 수 있게 적는다', () => {
    expect(fillTemplate('{name}을 찾지 못했어요', { name: 'total' })).toBe('total을 찾지 못했어요');
    expect(fillTemplate('{name:이/가} 없어요', { name: '픽셀' })).toBe('픽셀이 없어요');
    expect(fillTemplate('{name:이/가} 없어요', { name: '카메라' })).toBe('카메라가 없어요');
    expect(fillTemplate('{line}번째 줄', {})).toBe('?번째 줄');
    expect(fillTemplate('{module} 모듈', {})).toBe('(알 수 없음) 모듈');
  });

  it('위치 글은 함수 이름이 있을 때만 괄호를 붙인다', () => {
    expect(describeLocation(null)).toBeNull();
    expect(describeLocation({ file: 'main.py', line: 7, scope: '<module>', source: null })).toBe('내 코드 7번째 줄');
    expect(describeLocation({ file: 'main.py', line: 7, scope: 'draw', source: null })).toBe('내 코드 7번째 줄(함수 draw 안)');
  });

  it('OpenCV 메시지의 빌드 경로만 줄이고 뜻은 그대로 둔다', () => {
    const long = "cv2.error: OpenCV(4.11.0) /home/runner/work/pyodide-recipes/packages/opencv/modules/imgproc/src/color.cpp:199: error: (-215:Assertion failed) !_src.empty() in function 'cvtColor'";
    const short = shortenMessage(long);
    expect(short).toBe("cv2.error: OpenCV(4.11.0) color.cpp:199: error: (-215:Assertion failed) !_src.empty() in function 'cvtColor'");
    expect(shortenMessage('NameError: name \'x\' is not defined')).toBe('NameError: name \'x\' is not defined');
  });

  it('붙박이 자리 이름은 어느 항목에서나 쓸 수 있다', () => {
    expect([...BUILTIN_PLACEHOLDERS]).toEqual(['line', 'type', 'message', 'scope', 'file']);
  });
});

describe('사전 페이지용 미리 채우기(entryPreview)', () => {
  it('모든 항목의 글에 빈 자리나 "(알 수 없음)"이 남지 않는다', () => {
    for (const entry of catalog.entries) {
      const preview = entryPreview(entry);
      const texts = [preview.title, preview.meaning, ...preview.why, ...preview.fix, ...preview.mistakes].join('\n');
      expect(texts, entry.id).not.toContain('(알 수 없음)');
      expect(texts, entry.id).not.toContain('?번째 줄');
      // 겹친 중괄호({{age}})는 코드에 쓰는 중괄호 한 쌍으로 풀린다.
      expect(texts, entry.id).not.toContain('{{');
    }
  });

  it('보기의 오류 줄에서 이름을 뽑아 넣는다', () => {
    const entry = catalog.entries.find((item) => item.id === 'name-error')!;
    const preview = entryPreview(entry);
    expect(preview.meaning).toContain("'undefined_name'");
    expect(preview.vars.line).toBe('1');
  });

  it('보기가 없는 항목은 줄 번호 대신 일반 말로 적는다', () => {
    const entry = { ...catalog.entries.find((item) => item.fallback)!, example: null };
    const preview = entryPreview(entry);
    expect(preview.fix.join('\n')).toContain('오류가 난 줄');
    expect(preview.fix.join('\n')).not.toContain('?번째 줄');
  });

  it('마지막 풀이도 보기가 있어 사전 페이지에서 읽힌다', () => {
    const entry = catalog.entries.find((item) => item.fallback)!;
    expect(entry.example).not.toBeNull();
    expect(entryPreview(entry).meaning).toContain('RuntimeError 오류가 났어요');
  });
});
