// 가상 보드가 아는 "실물 펌웨어 모듈 표"(src/lab/modules/board/apc_board.py의 FIRMWARE_*_MODULES)가 사이트가 굽는 펌웨어 파일과 같은지 — 미해결 222(2026-10-06).
// 표의 근거는 public/firmware/manifest.json 첫 항목의 .bin을 읽어 푼 모듈 표(firmware-image.ts — 읽기만, 실행 없음)다. 펌웨어 판을 바꾸면
// (MAINTENANCE 8-6) 이 검사가 apc_board.py의 표·출처 주석과 보드 라이브러리 금지 이름(RESERVED_LIBRARY_NAMES)에서 고칠 곳을 알려 준다.
// 표를 쓰는 알림 동작(학생 코드 import → 콘솔 "[알림]")은 tests/unit/lab/pyodide-board-module-notices.test.ts가 실제 Pyodide로 본다.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { RESERVED_LIBRARY_NAMES } from '../../../src/lab/esp32/board-libraries.ts';
import { frozenSubmoduleNames, frozenTopLevelNames, readFirmwareModuleTables } from './firmware-image.ts';

const ROOT = process.cwd();
const BOARD_SOURCE = fs.readFileSync(path.join(ROOT, 'src', 'lab', 'modules', 'board', 'apc_board.py'), 'utf8');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'firmware', 'manifest.json'), 'utf8')) as {
  firmware: { path: string; version: string; board: string }[];
};
const FIRMWARE = MANIFEST.firmware[0]!;

/** apc_board.py의 `이름 = frozenset({ "…", … })` 글에서 이름들(이름 순) */
function pythonFrozenset(name: string): string[] {
  const block = new RegExp(`^${name} = frozenset\\(\\{([\\s\\S]*?)\\}\\)`, 'mu').exec(BOARD_SOURCE)?.[1] ?? '';
  return [...block.matchAll(/"([^"]+)"/gu)].map((match) => match[1]!).sort();
}

const BUILTIN = pythonFrozenset('FIRMWARE_BUILTIN_MODULES');
const EXTENSIBLE = pythonFrozenset('FIRMWARE_EXTENSIBLE_MODULES');
const FROZEN = pythonFrozenset('FIRMWARE_FROZEN_MODULES');
const FROZEN_SUB = pythonFrozenset('FIRMWARE_FROZEN_SUBMODULES');

/** apc_board.firmware_has_module과 같은 규칙(점 없는 이름) — 표 밖 이름이 "실물에 있다"고 적히지 않았는지 보는 데만 쓴다 */
function firmwareHas(name: string): boolean {
  if (name.includes('.')) return FROZEN_SUB.includes(name);
  return BUILTIN.includes(name) || EXTENSIBLE.includes(name) || FROZEN.includes(name) || name === 'usys' || (name.startsWith('u') && EXTENSIBLE.includes(name.slice(1)));
}

describe('실물 펌웨어 모듈 표(미해결 222)', () => {
  it('apc_board.py의 표를 읽었다(글 모양이 바뀌어 빈손으로 통과하지 않게 아는 이름부터)', () => {
    expect(BUILTIN).toEqual(expect.arrayContaining(['micropython', 'builtins', 'sys', 'network', 'esp32']));
    expect(EXTENSIBLE).toEqual(expect.arrayContaining(['machine', 'time', 'json', 'os', 'bluetooth']));
    expect(FROZEN).toEqual(expect.arrayContaining(['asyncio', 'neopixel', 'umqtt', 'dht', 'requests']));
    expect(FROZEN_SUB).toEqual(expect.arrayContaining(['umqtt.simple', 'asyncio.core']));
    // 출처 주석이 지금 펌웨어 파일을 가리킨다(파일을 바꾸면 주석과 표를 함께 고친다)
    expect(BOARD_SOURCE).toContain(path.basename(FIRMWARE.path));
    expect(BOARD_SOURCE).toContain(`v${FIRMWARE.version}`);
  });

  it(`사이트가 굽는 펌웨어 파일(${FIRMWARE.path})을 풀어 얻은 붙박이·얼린 모듈 표와 apc_board.py의 표가 같다`, () => {
    const tables = readFirmwareModuleTables(fs.readFileSync(path.join(ROOT, 'public', FIRMWARE.path)));
    // qstr 풀이 제대로 풀렸는지(글자 수 1,641개 — v1.29.0 ESP32_GENERIC, 2026-10-06)
    expect(tables.qstrCount).toBeGreaterThan(1000);
    expect(tables.builtin, 'apc_board.py FIRMWARE_BUILTIN_MODULES').toEqual(BUILTIN);
    expect(tables.extensible, 'apc_board.py FIRMWARE_EXTENSIBLE_MODULES').toEqual(EXTENSIBLE);
    expect(frozenTopLevelNames(tables.frozenFiles), 'apc_board.py FIRMWARE_FROZEN_MODULES').toEqual(FROZEN);
    expect(frozenSubmoduleNames(tables.frozenFiles), 'apc_board.py FIRMWARE_FROZEN_SUBMODULES').toEqual(FROZEN_SUB);
    // 학생이 쓰지만 실물에 없는 이름은 표에 없다(가상 보드에서만 되는 모듈 — 알림 대상)
    for (const name of ['datetime', 'threading', 'typing', 'itertools', 'functools', 'js']) {
      expect(firmwareHas(name), name).toBe(false);
    }
  });

  it('보드 라이브러리 금지 이름(RESERVED_LIBRARY_NAMES)에 펌웨어 모듈 이름과 u-이름이 모두 있다', () => {
    const names = [...BUILTIN, ...EXTENSIBLE, ...FROZEN, 'usys', ...EXTENSIBLE.map((name) => `u${name}`)];
    const missing = [...new Set(names)].filter((name) => !RESERVED_LIBRARY_NAMES.includes(name));
    expect(missing, 'src/lab/esp32/board-libraries.ts의 RESERVED_LIBRARY_NAMES에 더해요').toEqual([]);
  });

  it('u-이름 별칭·"펌웨어에는 들어 있어요" 이름(NOT_YET firmware·FIRMWARE_ONLY)은 모두 실물 표로 설명된다', () => {
    const aliasBlock = /^U_ALIASES = \{([\s\S]*?)^\}/mu.exec(BOARD_SOURCE)?.[1] ?? '';
    const aliases = [...aliasBlock.matchAll(/^\s+"([A-Za-z0-9_]+)":/gmu)].map((match) => match[1]!);
    const notYetBlock = /^NOT_YET_MODULES = \{([\s\S]*?)^\}/mu.exec(BOARD_SOURCE)?.[1] ?? '';
    const firmwareNames = [...notYetBlock.matchAll(/"([A-Za-z0-9_]+)":\s*"firmware"/gu)].map((match) => match[1]!);
    const onlyBlock = /^FIRMWARE_ONLY_MODULES = \{([^}]*)\}/mu.exec(BOARD_SOURCE)?.[1] ?? '';
    const firmwareOnly = [...onlyBlock.matchAll(/"([A-Za-z0-9_]+)"/gu)].map((match) => match[1]!);
    expect(aliases).toEqual(expect.arrayContaining(['umachine', 'ustruct', 'usys', 'uasyncio']));
    expect(firmwareNames).toEqual(expect.arrayContaining(['dht', 'esp32', 'ucryptolib', 'uwebsocket']));
    expect(firmwareOnly).toEqual(expect.arrayContaining(['requests', 'ssl']));
    expect([...aliases, ...firmwareNames, ...firmwareOnly].filter((name) => !firmwareHas(name))).toEqual([]);
  });
});
