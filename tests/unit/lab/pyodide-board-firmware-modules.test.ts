// 펌웨어에 굳힌 모듈을 가상 보드에서 import할 때(판 1.1.1 최종 점검 LB-15) — Node의 실제 Pyodide(JSPI).
// 단계는 tests/unit/lab/helpers/board-steps/firmware-modules.mjs. 오류 풀이는 오류 사전의 board-not-emulated가 골라져야 한다
// (전에는 `import dht`가 "이 모듈은 PC 프로그램용이에요 — pip install" 풀이로 갔다).
// 판 1.1.3(최종 전수 점검 2바퀴): 펌웨어 모듈 빈틈(esp32·espnow·mip·urequests·ssl …)과 점 이름(umqtt.robust — LB2-02),
// 컴퓨터용 패키지(numpy·cv2·PIL … — 실물 MicroPython처럼 ImportError, 풀이 board-import-no-module — LB2-01).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCatalogFromYaml } from '../../../src/lab/errors/catalog-build.ts';
import { explain } from '../../../src/lab/errors/explain.ts';
import { boardPyodideReady, runBoardSteps, stepOf, type BoardStepRecord } from './helpers/pyodide-board.ts';
import { FIRMWARE_MODULE_NAMES, PC_PACKAGE_CASES } from './helpers/board-steps/firmware-modules.mjs';

const catalog = loadCatalogFromYaml(fs.readFileSync(path.join(process.cwd(), 'content', 'help', 'errors', 'errors.yaml'), 'utf8'));

/** 보드 쪽 트레이스백 모양(학생 코드 1번째 줄) */
function boardTrace(code: string, last: string): string {
  return ['Traceback (most recent call last):', '  File "main.py", line 1, in <module>', `    ${code}`, last].join('\n');
}

/** 단계 기록의 오류 → 오류 사전 항목 id(워커가 화면에 넘기는 것처럼 마지막 줄 "종류: 메시지") */
function entryIdOf(record: BoardStepRecord, code: string): string | undefined {
  const type = record.errorType ?? '';
  const message = record.errorMessage ?? '';
  const last = message.startsWith(`${type}:`) ? message : `${type}: ${message}`;
  return explain(catalog, { outcome: 'error', error: { type, message: last, traceback: boardTrace(code, last) } })?.entry.id;
}

describe.skipIf(!boardPyodideReady)('가상 ESP32 보드 — 펌웨어에 굳힌 모듈 import(실제 Pyodide, JSPI)', () => {
  const out = runBoardSteps('tests/unit/lab/helpers/board-steps/firmware-modules.mjs');

  it('흉내 내지 않는 펌웨어 모듈은 "가상 보드에 아직 없어요 — 펌웨어에는 들어 있어요" 안내가 든 ModuleNotFoundError', () => {
    for (const name of [...FIRMWARE_MODULE_NAMES, 'requests', 'ssl']) {
      const record = stepOf(out, `import_${name}`);
      expect(record.errorType, name).toBe('ModuleNotFoundError');
      expect(record.errorMessage, name).toContain(`No module named '${name}'`);
      expect(record.errorMessage, name).toContain('가상 보드에 아직 없어요');
      expect(record.errorMessage, name).toContain('펌웨어에는 들어 있는 모듈');
      // 모든 Phase가 끝난 판에서 "다음 단계"를 약속하지 않는다
      expect(record.errorMessage, name).not.toContain('다음 단계');
    }
  });

  it('requests·ssl은 Pyodide의 PC용 모듈을 부르지 않고, Pyodide의 영어 덧말(micropip.install·unvendored)도 붙지 않는다', () => {
    for (const name of ['requests', 'ssl']) {
      const record = stepOf(out, `import_${name}`);
      const text = `${record.errorText ?? ''}\n${record.stderr}`;
      expect(text, name).not.toContain('micropip');
      expect(text, name).not.toContain('Pyodide distribution');
    }
  });

  it('점 이름은 오류가 난 이름 그대로 알리고(umqtt.robust), 바로 다음 줄의 umqtt.simple은 그대로 된다(판 1.1.3 LB2-02)', () => {
    const robust = stepOf(out, 'import_umqtt_robust');
    expect(robust.errorType).toBe('ModuleNotFoundError');
    expect(robust.errorMessage).toContain("No module named 'umqtt.robust'");
    expect(robust.errorMessage).toContain('펌웨어에는 들어 있는 모듈');
    expect(robust.errorMessage).not.toContain("No module named 'umqtt' ");
    expect(entryIdOf(robust, 'import umqtt.robust')).toBe('board-not-emulated');
    expect(stepOf(out, 'import_umqtt').value).toBe('MQTTClient');
  });

  it('흉내가 있는 모듈(umqtt·asyncio)은 그대로, 학생이 둔 같은 이름 파일은 그 파일을 쓴다', () => {
    expect(stepOf(out, 'import_asyncio').value).toBe('asyncio');
    // 실물 v1.29.0이 굳혀 둔 옛 이름 uasyncio도 asyncio로 된다(전에는 "그런 이름의 모듈이 없어요" 카드 — 판 1.1.3 통합).
    // 판 1.1.5부터 둘 다 보드 확장 ext/asyncio의 얇은 모듈(sleep_ms·[정지] — pyodide-board-asyncio.test.ts)
    const uasyncio = stepOf(out, 'import_uasyncio');
    expect(uasyncio.errorType).toBeUndefined();
    expect(uasyncio.value).toEqual(['asyncio', 'sleep']);
    expect(stepOf(out, 'import_umqtt').value).toBe('MQTTClient');
    const own = stepOf(out, 'import_requests_user_file');
    expect(own.errorType).toBeUndefined();
    expect(own.value).toBe('내 requests.py');
  });

  it('오류 풀이는 "가상 보드에 아직 없는 기능이에요"(board-not-emulated)가 골라진다', () => {
    for (const name of ['dht', 'requests', 'ssl', 'esp32', 'espnow', 'mip', 'urequests']) {
      expect(entryIdOf(stepOf(out, `import_${name}`), `import ${name}`), name).toBe('board-not-emulated');
    }
  });

  it('컴퓨터용 패키지(numpy·cv2·PIL …)는 실물 MicroPython과 같은 ImportError: no module named — 받지도 돌지도 않는다(판 1.1.3 LB2-01)', () => {
    for (const [name, code, module] of PC_PACKAGE_CASES) {
      const record = stepOf(out, name);
      expect(record.errorType, name).toBe('ImportError');
      expect(record.errorMessage, name).toContain(`no module named '${module}'`);
      expect(record.errorMessage, name).toContain('컴퓨터용 파이썬 패키지');
      // board-not-emulated 글을 넣으면 "실물에는 있는 기능" 카드로 간다(호환 약속 2)
      expect(record.errorMessage, name).not.toContain('가상 보드에 아직 없어요');
      // Pyodide의 영어 덧말(micropip.install …)이 콘솔·트레이스백에 남지 않는다
      expect(`${record.errorText ?? ''}\n${record.stderr}`, name).not.toContain('micropip');
      // 오류 풀이: "보드에 그 모듈이 없어요"(cv2·numpy 같은 컴퓨터용 패키지는 보드에 없어요 — 영상 처리 실습실에서)
      expect(entryIdOf(record, code), name).toBe('board-import-no-module');
    }
  });

  it('학생이 같은 이름의 파일을 두면 그 파일을 쓰고, 막는 이름 표는 Pyodide 배포판 표에서 읽되 표준·펌웨어·u-이름은 뺀다', () => {
    const own = stepOf(out, 'pc_numpy_user_file');
    expect(own.errorType).toBeUndefined();
    expect(own.value).toBe('내 numpy.py');
    const names = stepOf(out, 'pc_names').value as { count: number; has: string[]; not: string[] };
    expect(names.count, '배포판 import 이름 표(Pyodide 314.0.7 — 300개 안팎)를 읽었어야 해요').toBeGreaterThan(100);
    expect(names.has).toEqual(['PIL', 'cv2', 'micropip', 'numpy', 'sympy']);
    expect(names.not).toEqual([]);
  });

  it('목록 밖의 없는 이름은 지금 모양 그대로(ModuleNotFoundError), 실물에도 있는 표준 모듈은 그대로 된다', () => {
    const typo = stepOf(out, 'typo_machin');
    expect(typo.errorType).toBe('ModuleNotFoundError');
    expect(typo.errorMessage).toContain("No module named 'machin'");
    expect(entryIdOf(typo, 'import machin')).toBe('module-not-found');
    const lib = stepOf(out, 'esp32ble_lib');
    expect(lib.errorType).toBe('ModuleNotFoundError');
    expect(entryIdOf(lib, 'import ESP32BLE_LIB')).toBe('comm-esp32ble-lib-name');
    const ok = stepOf(out, 'stdlib_ok');
    expect(ok.errorType).toBeUndefined();
    expect(ok.value).toEqual(['{"a": 1}', '0201', '4142', 'ba7816bf']);
  });
});
