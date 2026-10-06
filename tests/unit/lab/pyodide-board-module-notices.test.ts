// 실물 펌웨어에 없는 모듈 알림(미해결 222) — Node의 실제 Pyodide(JSPI). 단계는 tests/unit/lab/helpers/board-steps/module-notices.mjs.
// 가상 보드는 컴퓨터 파이썬(Pyodide) 위에서 돌아 datetime·threading·typing·js처럼 실물 MicroPython v1.29.0 ESP32_GENERIC에는 없는 모듈도
// 불러와진다. 실행은 막지 않고(DECISIONS C76 ④ "알림만") 학생 코드의 import 문마다 — 실행마다 모듈 하나에 한 번 — 콘솔에 알린다.
// 실물 모듈 표 자체(펌웨어 파일과 같은지)는 tests/unit/board-modules/firmware-modules.test.ts가 본다.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCatalogFromYaml } from '../../../src/lab/errors/catalog-build.ts';
import { explain } from '../../../src/lab/errors/explain.ts';
import { boardPyodideReady, runBoardSteps, stepOf, type BoardRunResult, type BoardStepRecord } from './helpers/pyodide-board.ts';
import { NOTICE_MARK, SWEEP_PREFIX } from './helpers/board-steps/module-notices.mjs';

const catalog = loadCatalogFromYaml(fs.readFileSync(path.join(process.cwd(), 'content', 'help', 'errors', 'errors.yaml'), 'utf8'));

/** 이 단계의 "실물 펌웨어에 없는 모듈" 알림에서 모듈 이름만(나온 차례) */
function noticedModules(record: BoardStepRecord): string[] {
  return record.notices.filter((text) => text.includes(NOTICE_MARK)).map((text) => text.split(' 모듈은 ')[0]!);
}

function sweepSteps(out: BoardRunResult, prefix: string): [string, BoardStepRecord][] {
  return Object.entries(out.steps).filter(([name]) => name.startsWith(prefix));
}

describe.skipIf(!boardPyodideReady)('가상 ESP32 보드 — 실물 펌웨어에 없는 모듈 알림(실제 Pyodide, JSPI)', () => {
  const out = runBoardSteps('tests/unit/lab/helpers/board-steps/module-notices.mjs');

  it('import한 표준 모듈이 실물에 없으면 실행은 그대로 두고 알린다 — 한 실행 안에서는 모듈 하나에 한 번, 다음 실행에서는 다시', () => {
    const once = stepOf(out, 'notice_once_per_run');
    expect(once.errorType).toBeUndefined();
    expect(once.value).toBe('2026-10-06');
    expect(noticedModules(once)).toEqual(['datetime']);
    const again = stepOf(out, 'notice_next_run');
    expect(again.errorType).toBeUndefined();
    expect(noticedModules(again)).toEqual(['datetime']);
  });

  it('알림 글은 고1이 읽는 한국어 두 문장이고 실물의 오류 글(no module named)을 함께 보여 준다', () => {
    const text = stepOf(out, 'notice_once_per_run').notices.find((line) => line.includes(NOTICE_MARK));
    expect(text).toBe(
      "datetime 모듈은 실물 ESP32 보드(MicroPython)에는 없어요. 가상 보드에서만 돌아가고, 실물 보드에서는 ImportError(no module named 'datetime')가 나요.",
    );
    expect((stepOf(out, 'pure_functions').value as { text: string }).text).toBe(text);
  });

  it('모듈마다 한 번씩 알리고(Pyodide 전용 js 포함), 점 이름은 실물에서 처음 없는 깊이로 알린다', () => {
    expect(noticedModules(stepOf(out, 'notice_each_module'))).toEqual(['threading', 'typing', 'js', 'itertools']);
    const dotted = stepOf(out, 'notice_dotted');
    expect(dotted.errorType).toBeUndefined();
    // 붙박이 모듈(os·collections·json)은 꾸러미가 아니라 하위 모듈이 실물에 없다 — 실물 오류도 그 깊이(os.path)를 말한다
    expect(noticedModules(dotted)).toEqual(['os.path', 'collections.abc', 'xml', 'json.decoder']);
    expect(noticedModules(stepOf(out, 'notice_in_exec'))).toEqual(['fractions']);
    // 실물의 network는 확장 불가 붙박이라 u-이름(unetwork)이 없다 — 가상 보드는 옛 이름으로 받아 주되 알린다
    const unetwork = stepOf(out, 'notice_unetwork');
    expect(unetwork.errorType).toBeUndefined();
    expect(noticedModules(unetwork)).toEqual(['unetwork']);
  });

  it('실물에도 있는 모듈·u-이름·얼린 꾸러미·사이트 흉내는 알리지 않는다', () => {
    const quiet = stepOf(out, 'firmware_and_site_quiet');
    expect(quiet.errorType, quiet.errorMessage).toBeUndefined();
    expect(quiet.value).toBe('quiet');
    expect(noticedModules(quiet)).toEqual([]);
  });

  it('실패한 import(없는 이름·컴퓨터용 패키지·아직 없는 펌웨어 모듈)는 오류가 알리므로 알림을 더하지 않는다', () => {
    const missing = stepOf(out, 'failed_missing');
    expect(missing.errorType).toBe('ModuleNotFoundError');
    expect(noticedModules(missing)).toEqual([]);
    const pc = stepOf(out, 'failed_pc_package');
    expect(pc.errorType).toBe('ImportError');
    expect(noticedModules(pc)).toEqual([]);
    // 실물에서는 확장 가능 붙박이 cryptolib의 u-이름으로 불러진다 — 가상 보드는 "펌웨어에는 들어 있어요" 안내(펌웨어 파일 풀이로 더함)
    const ucryptolib = stepOf(out, 'failed_firmware_not_yet');
    expect(ucryptolib.errorType).toBe('ModuleNotFoundError');
    expect(ucryptolib.errorMessage).toContain("No module named 'ucryptolib'");
    expect(ucryptolib.errorMessage).toContain('펌웨어에는 들어 있는 모듈');
    expect(noticedModules(ucryptolib)).toEqual([]);
    // 오류 풀이는 "가상 보드에 아직 없는 기능이에요"(전에는 "그런 이름의 모듈이 없어요 — 오타이거나 …")
    const last = `ModuleNotFoundError: ${ucryptolib.errorMessage!.replace(/^ModuleNotFoundError:\s*/u, '')}`;
    const traceback = ['Traceback (most recent call last):', '  File "main.py", line 1, in <module>', '    import ucryptolib', last].join('\n');
    expect(explain(catalog, { outcome: 'error', error: { type: 'ModuleNotFoundError', message: last, traceback } })?.entry.id).toBe('board-not-emulated');
  });

  it('학생이 쓰지 않은 import — C 코드가 부른 import(datetime.strptime → _strptime)·__import__ 직접 부름 — 는 알리지 않는다', () => {
    const cLevel = stepOf(out, 'c_level_import');
    expect(cLevel.errorType).toBeUndefined();
    expect(cLevel.value).toBe(2026);
    expect(noticedModules(cLevel)).toEqual(['datetime']);
    const direct = stepOf(out, 'direct_dunder_import');
    expect(direct.errorType).toBeUndefined();
    expect(noticedModules(direct)).toEqual([]);
  });

  it('보드 라이브러리(/board/lib) 안쪽의 import는 알리지 않고, 학생 파일(작업 폴더) 안의 import는 알린다 — 두 파일 이름 자체는 알리지 않는다', () => {
    const record = stepOf(out, 'library_and_student_file');
    expect(record.errorType, record.errorMessage).toBeUndefined();
    expect(record.value).toEqual(['lib', 'mine']);
    expect(noticedModules(record)).toEqual(['typing']);
  });

  it('표 맞춤: u-이름·"펌웨어에는 있어요" 이름은 모두 실물 표 안이고, 등록표에서 실물에 없는 이름은 서보 라이브러리 셋과 unetwork뿐이다', () => {
    const value = stepOf(out, 'pure_functions').value as {
      missing: Record<string, string>;
      u_alias_bad: string[];
      not_yet_bad: string[];
      only_bad: string[];
      registered: string[];
      pc_overlap: string[];
      sizes: number[];
    };
    expect(value.missing).toEqual({
      datetime: 'datetime',
      threading: 'threading',
      typing: 'typing',
      js: 'js',
      'os.path': 'os.path',
      'collections.abc': 'collections.abc',
      'xml.etree.ElementTree': 'xml',
      'json.decoder': 'json.decoder',
      machine: '',
      ujson: '',
      usys: '',
      utime: '',
      unetwork: 'unetwork',
      umath: 'umath',
      ugc: 'ugc',
      'umqtt.simple': '',
      'umqtt.robust': '',
      'asyncio.core': '',
      'asyncio.events': 'asyncio.events',
      uasyncio: '',
      requests: '',
      _thread: '',
      ucryptolib: '',
      uwebsocket: '',
      inisetup: '',
    });
    expect(value.u_alias_bad).toEqual([]);
    expect(value.not_yet_bad).toEqual([]);
    expect(value.only_bad).toEqual([]);
    // 서보 라이브러리 세 이름(servo_library·mg90s_servo·gorillacell_servo — 보드 라이브러리 파일을 불러 주는 등록, apc_part_servo.py)과 unetwork
    expect(value.registered).toEqual(['gorillacell_servo', 'mg90s_servo', 'servo_library', 'unetwork']);
    expect(value.pc_overlap).toEqual([]);
    expect(value.sizes).toEqual([21, 20, 22, 7]);
  });

  it('거짓 알림 0: examples/esp32/의 모든 예제·차시 md의 보드 코드 블록·블록 모드가 만드는 import에서 알림이 하나도 나오지 않는다', () => {
    const examples = sweepSteps(out, SWEEP_PREFIX.example);
    const lessons = sweepSteps(out, SWEEP_PREFIX.lesson);
    const blocks = stepOf(out, SWEEP_PREFIX.blocks);
    // 훑기가 빈손으로 통과하지 않게: 예제는 80개 안팎(lib/ 빼고), 차시 보드 코드 블록은 9개 안팎(2026-10-06 기준), 블록 모드는 알려진 모듈을 모두 돌렸다
    expect(examples.length).toBeGreaterThan(70);
    expect(lessons.length).toBeGreaterThan(5);
    expect((blocks.value as [number, string[]])[0]).toBeGreaterThanOrEqual(11);
    expect(stepOf(out, 'sweep_unparsed').value).toEqual([]);
    const noisy = [...examples, ...lessons, [SWEEP_PREFIX.blocks, blocks] as [string, BoardStepRecord]]
      .map(([name, record]) => [name, noticedModules(record)] as const)
      .filter(([, modules]) => modules.length > 0);
    expect(noisy, '이 이름이 실물 표에 있어야 하는지(펌웨어 파일 풀이) 또는 보드 라이브러리·흉내인지 확인해요').toEqual([]);
    // 돌린 import 가운데 실패한 것은 일부러 오류인 예제(ESP32BLE_LIB — 차시 4-2-2의 라이브러리 이름 바꾸기 실습)뿐 — 훑기 자체가 깨지지 않았는지
    const failed = [...examples, ...lessons, [SWEEP_PREFIX.blocks, blocks] as [string, BoardStepRecord]].flatMap(([name, record]) => {
      if (record.errorType) return [`${name}: ${record.errorType} ${record.errorMessage ?? ''}`];
      return ((record.value as [number, string[]])[1] ?? []).map((line) => `${name}: ${line}`);
    });
    expect(failed.every((line) => line.includes('ESP32BLE_LIB')), failed.join('\n')).toBe(true);
  });
});
