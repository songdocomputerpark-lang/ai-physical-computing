// 펌웨어에 굳힌 모듈을 가상 보드에서 import할 때(판 1.1.1 최종 점검 LB-15) — Node의 실제 Pyodide(JSPI).
// 단계는 tests/unit/lab/helpers/board-steps/firmware-modules.mjs. 오류 풀이는 오류 사전의 board-not-emulated가 골라져야 한다
// (전에는 `import dht`가 "이 모듈은 PC 프로그램용이에요 — pip install" 풀이로 갔다).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCatalogFromYaml } from '../../../src/lab/errors/catalog-build.ts';
import { explain } from '../../../src/lab/errors/explain.ts';
import { boardPyodideReady, runBoardSteps, stepOf } from './helpers/pyodide-board.ts';

const catalog = loadCatalogFromYaml(fs.readFileSync(path.join(process.cwd(), 'content', 'help', 'errors', 'errors.yaml'), 'utf8'));

/** 보드 쪽 트레이스백 모양(학생 코드 1번째 줄) */
function boardTrace(code: string, last: string): string {
  return ['Traceback (most recent call last):', '  File "main.py", line 1, in <module>', `    ${code}`, last].join('\n');
}

describe.skipIf(!boardPyodideReady)('가상 ESP32 보드 — 펌웨어에 굳힌 모듈 import(실제 Pyodide, JSPI)', () => {
  const out = runBoardSteps('tests/unit/lab/helpers/board-steps/firmware-modules.mjs');

  it('흉내 내지 않는 펌웨어 모듈은 "가상 보드에 아직 없어요 — 펌웨어에는 들어 있어요" 안내가 든 ModuleNotFoundError', () => {
    for (const name of ['dht', 'ds18x20', 'onewire', 'ntptime', 'requests']) {
      const record = stepOf(out, `import_${name}`);
      expect(record.errorType, name).toBe('ModuleNotFoundError');
      expect(record.errorMessage, name).toContain(`No module named '${name}'`);
      expect(record.errorMessage, name).toContain('가상 보드에 아직 없어요');
      expect(record.errorMessage, name).toContain('펌웨어에는 들어 있는 모듈');
      // 모든 Phase가 끝난 판에서 "다음 단계에서 들어와요"를 약속하지 않는다
      expect(record.errorMessage, name).not.toContain('다음 단계');
    }
  });

  it('requests는 Pyodide의 PC용 패키지를 부르지 않고, Pyodide의 영어 덧말(micropip.install)도 붙지 않는다', () => {
    const record = stepOf(out, 'import_requests');
    expect(`${record.errorMessage ?? ''}\n${record.stderr}`).not.toContain('micropip');
  });

  it('흉내가 있는 모듈(umqtt)·Pyodide 표준 모듈(asyncio)은 그대로, 학생이 둔 같은 이름 파일은 그 파일을 쓴다', () => {
    expect(stepOf(out, 'import_asyncio').value).toBe('asyncio');
    expect(stepOf(out, 'import_umqtt').value).toBe('MQTTClient');
    const own = stepOf(out, 'import_requests_user_file');
    expect(own.errorType).toBeUndefined();
    expect(own.value).toBe('내 requests.py');
  });

  it('오류 풀이는 "가상 보드에 아직 없는 기능이에요"(board-not-emulated)가 골라진다', () => {
    for (const name of ['dht', 'requests']) {
      const record = stepOf(out, `import_${name}`);
      const last = `ModuleNotFoundError: ${record.errorMessage ?? ''}`;
      const explanation = explain(catalog, { outcome: 'error', error: { type: 'ModuleNotFoundError', message: last, traceback: boardTrace(`import ${name}`, last) } });
      expect(explanation?.entry.id, name).toBe('board-not-emulated');
    }
  });
});
