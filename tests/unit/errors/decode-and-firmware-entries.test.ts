// 오류 사전(content/help/errors/errors.yaml) 2026-09-30 최종 점검 고침을 지킨다.
// - comm-uart-decode(EX-01): 통신 템플릿 1(UART 에코)에서 속도를 바꾸면 UnicodeDecodeError로 멈췄는데 일반 풀이만 나왔다.
//   가상 보드·컴퓨터 파이썬(UnicodeDecodeError + "codec can't decode"), 실물 MicroPython(메시지 없는 "UnicodeError: " —
//   v1.29.0 py/objstr.c mp_raise_msg(&mp_type_UnicodeError, NULL)), 파일 읽기(인코딩이 다른 파일) 모두 이 항목이어야 한다.
// - module-not-found-site(E2): dht는 PC 프로그램이 아니라 실물 펌웨어에 굳힌 모듈이라 "pip install" 풀이가 나오면 안 된다.
// - 조사 자리(D6): 영어로 끝날 수 있는 {module}에는 조사 자리를 쓰지 않는다("numpyy이(가)"처럼 보임).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadCatalogFromYaml } from '../../../src/lab/errors/catalog-build.ts';
import { explain } from '../../../src/lab/errors/explain.ts';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const catalog = loadCatalogFromYaml(fs.readFileSync(path.join(ROOT, 'content', 'help', 'errors', 'errors.yaml'), 'utf8'));

/** Pyodide가 내는 모양의 트레이스백(사이트 내부 프레임 한 줄 + 학생 코드 줄) */
function pyodideError(type: string, lastLine: string, line = 2) {
  return {
    type,
    message: lastLine,
    traceback: [
      'Traceback (most recent call last):',
      '  File "/lib/python314.zip/_pyodide/_base.py", line 420, in run_async',
      '    coroutine = eval(self.code, globals, locals)',
      `  File "main.py", line ${line}, in <module>`,
      lastLine,
    ].join('\n'),
  };
}

function pick(error: { type: string; message: string; traceback: string }) {
  return explain(catalog, { outcome: 'error', error });
}

describe('오류 사전 — 바이트를 글자로 바꾸지 못함(comm-uart-decode)', () => {
  it('가상 보드·컴퓨터 파이썬의 UnicodeDecodeError를 이 항목으로 풀고, 사전 보기 코드와 같은 오류 글이다', () => {
    const explanation = pick(pyodideError('UnicodeDecodeError', "UnicodeDecodeError: 'utf-8' codec can't decode byte 0xfe in position 0: invalid start byte"));
    expect(explanation?.entry.id).toBe('comm-uart-decode');
    expect(explanation?.matched).toBe('type+pattern');
    const entry = catalog.entries.find((item) => item.id === 'comm-uart-decode');
    expect(entry?.example?.error).toBe("UnicodeDecodeError: 'utf-8' codec can't decode byte 0xfe in position 0: invalid start byte");
  });

  it('실물 MicroPython은 메시지 없이 "UnicodeError: "로만 알려도 이 항목이다', () => {
    const explanation = pick({
      type: 'UnicodeError',
      message: 'UnicodeError: ',
      traceback: 'Traceback (most recent call last):\n  File "main.py", line 19, in <module>\nUnicodeError: ',
    });
    expect(explanation?.entry.id).toBe('comm-uart-decode');
  });

  it('인코딩이 다른 파일을 읽을 때도 이 항목이고, 풀이가 통신과 파일 두 경우를 함께 말한다', () => {
    const explanation = pick(pyodideError('UnicodeDecodeError', "UnicodeDecodeError: 'utf-8' codec can't decode byte 0xc7 in position 0: invalid continuation byte", 1));
    expect(explanation?.entry.id).toBe('comm-uart-decode');
    const text = [explanation?.meaning, ...(explanation?.why ?? []), ...(explanation?.fix ?? [])].join(' ');
    expect(text).toContain('속도');
    expect(text).toContain('cp949');
    expect(text).toContain('except UnicodeError');
  });
});

describe('오류 사전 — 펌웨어 모듈 dht(module-not-found-site에서 뺌)', () => {
  it('No module named \'dht\'에 "PC 프로그램용 — pip install" 풀이를 붙이지 않는다', () => {
    const explanation = pick(pyodideError('ModuleNotFoundError', "ModuleNotFoundError: No module named 'dht'", 1));
    expect(explanation?.entry.id).not.toBe('module-not-found-site');
  });

  it('가상 보드가 "가상 보드에 아직 없어요"로 알리면 board-not-emulated 풀이다', () => {
    const explanation = pick(pyodideError('ImportError', 'ImportError: dht은(는) 가상 보드에 아직 없어요 — 실물 ESP32 펌웨어에는 들어 있어요.', 1));
    expect(explanation?.entry.id).toBe('board-not-emulated');
  });
});

describe('오류 사전 — 영어로 끝날 수 있는 값에는 조사 자리를 쓰지 않는다', () => {
  it('{module}에 조사 자리가 없고, numpyy 같은 이름이 "이(가)"로 보이지 않는다', () => {
    const withParticle = catalog.entries.flatMap((entry) =>
      [entry.title, entry.meaning, ...entry.why, ...entry.fix, ...entry.mistakes].filter((text) => /\{module:/u.test(text)).map((text) => `${entry.id}: ${text}`),
    );
    expect(withParticle).toEqual([]);
    const explanation = pick(pyodideError('ModuleNotFoundError', "ModuleNotFoundError: No module named 'numpyy'", 1));
    expect(explanation?.entry.id).toBe('module-not-found');
    expect(explanation?.meaning).not.toContain('(가)');
    expect(explanation?.meaning).toContain('numpyy');
  });
});

// 최종 전수 점검 3바퀴 CT3-01(판 1.1.5): 목록 밖의 없는 이름은 두 실습실 모두 이 카드로 온다(DECISIONS C76 ③ — 가상 보드도 실물과 같은
// ModuleNotFoundError). 그런데 고치는 법이 "PC 파이썬에서 pip install로 설치해 돌려요"뿐이라, ESP32 실습실에서 `import tm1637`(보드용
// 드라이버)을 친 학생에게 보드 코드도 pip로 설치하라고 읽혔다. 오류 사전 항목에는 실습실별 글을 고르는 칸이 없어 글 안에서 범위를 나눈다.
describe('오류 사전 — 그런 이름의 모듈이 없어요(module-not-found)는 컴퓨터 쪽과 보드 쪽 고치는 법을 나눠 말한다', () => {
  it("ESP32 실습실의 `import tm1637`도 이 항목이고, pip install로 설치하라는 줄은 컴퓨터 쪽(영상 처리 실습실)에만 쓴다", () => {
    const explanation = pick(pyodideError('ModuleNotFoundError', "ModuleNotFoundError: No module named 'tm1637'", 1));
    expect(explanation?.entry.id).toBe('module-not-found');
    const fixes = explanation?.fix ?? [];
    const installLines = fixes.filter((line) => /pip install로 설치/u.test(line));
    expect(installLines.length, 'pip install로 설치하는 줄이 있어야 해요(영상 처리 실습실 안내)').toBeGreaterThan(0);
    for (const line of installLines) expect(line, '설치 안내는 범위를 밝혀요').toMatch(/영상 처리|컴퓨터 쪽/u);
    const boardLine = fixes.find((line) => line.includes('보드 코드'));
    expect(boardLine, '보드 코드의 고치는 법 줄이 있어야 해요').toBeDefined();
    expect(boardLine).toMatch(/pip install을 쓸 수 없어요/u);
    expect(boardLine).toContain('Thonny');
    // "실습실이 넣어 주는 라이브러리만 쓸 수 있어요"처럼 단정하지 않는다 — [파일 넣기]로 넣은 학생 파일도 import된다(apc_board.py _user_module_file).
    expect(boardLine).not.toMatch(/만 쓸 수 있어요/u);
  });
});
