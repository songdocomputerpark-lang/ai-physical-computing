// 실물 펌웨어에 없는 모듈 알림(미해결 222) — 가상 보드(Pyodide)에서는 불러와지지만 실물 MicroPython v1.29.0 ESP32_GENERIC에는 없는 모듈을
// 학생 코드가 import하면 실행은 그대로 두고 콘솔에 한 번 알린다(apc_board.py FIRMWARE_MODULES·_notice_missing_on_board).
// tests/unit/lab/pyodide-board-module-notices.test.ts가 공유 도우미(pyodide-board-run.mjs --steps=이 파일)로 돌린다(src/lab/README.md 7.9).
// 받는 도구: step(이름, 코드, { … }), pyodide, rootDir.
//
// 뒤쪽 "거짓 알림 0" 훑기: examples/esp32/**(보드 라이브러리 lib/ 빼고)의 예제마다, 차시 md의 보드 코드 블록마다, 블록 모드가 만드는 import마다
// 그 import 문만 학생 코드로 다시 돌려(exec — 실패하는 import는 넘김) 알림이 하나도 나오지 않는지 본다. 보드 라이브러리(examples/esp32/lib/**)는
// 화면(modules/board/index.ts)처럼 /board/lib/<파일 이름>에 넣는다.
import fs from 'node:fs';
import path from 'node:path';

/** 알림 글을 고르는 낱말(apc_board.missing_module_notice) — 테스트 파일도 이 값으로 고른다 */
export const NOTICE_MARK = '실물 ESP32 보드(MicroPython)에는 없어요';

/** 단계 이름 머리: 예제·차시 코드 블록·블록 모드 훑기 */
export const SWEEP_PREFIX = { example: 'sweep:example:', lesson: 'sweep:lesson:', blocks: 'sweep:blocks' };

/** 차시 코드 블록이 보드 코드인지 고르는 모듈(하나라도 import하면 보드 코드 — 컴퓨터 쪽 cv2·serial 블록은 영상 처리 실습실 코드) */
const BOARD_CODE_MODULES = new Set([
  'machine',
  'micropython',
  'neopixel',
  'network',
  'bluetooth',
  'ubluetooth',
  'umqtt',
  'utime',
  'uasyncio',
  'esp',
  'esp32',
  'dht',
  'framebuf',
]);

function walkPython(dir, skipDirs = []) {
  if (!fs.existsSync(dir)) return [];
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!skipDirs.includes(entry.name)) found.push(...walkPython(full, skipDirs));
    } else if (entry.name.endsWith('.py')) {
      found.push(full);
    }
  }
  return found.sort();
}

function walkMarkdown(dir) {
  if (!fs.existsSync(dir)) return [];
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walkMarkdown(full));
    else if (entry.name.endsWith('.md')) found.push(full);
  }
  return found.sort();
}

/** 마크다운의 파이썬 코드 블록(```python·```py·말 없는 ```) — [시작 줄 번호, 코드] */
function pythonFences(markdown) {
  const lines = markdown.split(/\r?\n/u);
  const blocks = [];
  for (let i = 0; i < lines.length; i += 1) {
    const open = /^(\s*)(`{3,}|~{3,})\s*([\w+-]*)/u.exec(lines[i]);
    if (!open) continue;
    const [, indent, fence, lang] = open;
    const body = [];
    let j = i + 1;
    while (j < lines.length && !lines[j].trim().startsWith(fence)) {
      body.push(lines[j].startsWith(indent) ? lines[j].slice(indent.length) : lines[j]);
      j += 1;
    }
    if (['python', 'py', 'python3', 'micropython', ''].includes(lang.toLowerCase())) blocks.push([i + 1, body.join('\n')]);
    i = j;
  }
  return blocks;
}

/**
 * 블록 모드가 만드는 import(src/lab/blocks/**의 ImportNeed `from: '…'`, 통신 블록의 `plainImports: [...]`) + Blockly 기본 블록의 import random.
 * 새 블록이 같은 모양으로 import를 더하면 저절로 들어온다.
 */
function blocksImportStatements(rootDir) {
  const dir = path.join(rootDir, 'src', 'lab', 'blocks');
  const files = [];
  const walk = (folder) => {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ts')) files.push(full);
    }
  };
  walk(dir);
  const modules = new Set(['random']);
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(/\bfrom:\s*'([A-Za-z_][\w.]*)'/gu)) modules.add(match[1]);
    for (const match of text.matchAll(/\bplainImports:\s*\[([^\]]*)\]/gu)) {
      for (const name of match[1].matchAll(/'([A-Za-z_][\w.]*)'/gu)) modules.add(name[1]);
    }
  }
  return [...modules].sort().map((name) => `import ${name}`);
}

/** 학생 코드로 돌릴 "import 문만 다시 돌리기" 코드 — 실패하는 import(일부러 오류인 예제·아직 없는 모듈)는 넘긴다 */
function replayCode(statements) {
  return [
    `_apc_statements = ${JSON.stringify(statements)}`,
    '_apc_failed = []',
    'for _apc_statement in _apc_statements:',
    '    try:',
    '        exec(_apc_statement)',
    '    except Exception as _apc_error:',
    '        _apc_failed.append(_apc_statement + " -> " + type(_apc_error).__name__)',
    '[len(_apc_statements), _apc_failed]',
  ].join('\n');
}

export default async function moduleNoticeSteps({ step, pyodide, rootDir }) {
  // ── 알림이 나오는 모양 ──
  // 같은 실행 안에서 여러 번(모양을 바꿔·함수 안에서) import해도 모듈 하나에 한 번, 실행은 그대로(값이 나온다)
  await step(
    'notice_once_per_run',
    [
      'import datetime',
      'from datetime import date',
      'import datetime as dt',
      'def f():',
      '    import datetime',
      'f()',
      'f()',
      'dt.date(2026, 10, 6).isoformat()',
    ].join('\n'),
  );
  // 다음 실행(보드를 새로 켬)에서는 다시 알린다
  await step('notice_next_run', 'import datetime\n"again"');
  // 모듈마다 하나씩(Pyodide 전용 js 포함)
  await step('notice_each_module', ['import threading', 'import typing', 'import js', 'from itertools import count', 'import threading', '"many"'].join('\n'));
  // 점 이름: 실물에서 처음 없는 깊이(실물 오류 "no module named '…'"와 같게) — 붙박이 모듈은 꾸러미가 아니다
  await step(
    'notice_dotted',
    ['import os.path', 'import collections.abc', 'import xml.etree.ElementTree', 'from xml.dom import minidom', 'import json.decoder', '"dotted"'].join('\n'),
  );
  // exec 안의 import 문도 학생 코드다
  await step('notice_in_exec', 'exec("import fractions")\n"exec"');
  // 실물에서는 network가 확장 불가 붙박이라 unetwork가 안 된다(가상 보드는 옛 이름으로 등록해 둠 — 알림만)
  await step('notice_unetwork', 'import unetwork\nunetwork.STA_IF');

  // ── 알리지 않는 것 ──
  // 실물 펌웨어 모듈과 u-이름(확장 가능 붙박이 + usys), 얼린 모듈·꾸러미(asyncio·umqtt.simple), 사이트 흉내(/apc)
  await step(
    'firmware_and_site_quiet',
    [
      'import machine, micropython, time, utime, errno, uerrno, network, bluetooth, ubluetooth, framebuf, neopixel',
      'import sys, usys, gc, math, cmath, builtins, array, uarray, collections, ucollections, io, uio, json, ujson, os, uos',
      'import random, urandom, re, ure, struct, ustruct, binascii, ubinascii, hashlib, uhashlib, heapq, uheapq',
      'import select, uselect, socket, usocket, platform, uplatform, umachine, _thread, asyncio, uasyncio, __main__',
      'from umqtt.simple import MQTTClient',
      'import umqtt',
      'import ssd1306, sh1106, apc_runtime, apc_board',
      'from machine import Pin',
      'from time import sleep_ms',
      '"quiet"',
    ].join('\n'),
  );
  // 실패한 import는 알리지 않는다 — 오류가 알린다(없는 이름·컴퓨터용 패키지·아직 없는 펌웨어 모듈)
  await step('failed_missing', 'import nonexistent_module_for_notice_test');
  await step('failed_pc_package', 'import numpy');
  await step('failed_firmware_not_yet', 'import ucryptolib');
  // C 코드가 부른 import(datetime.strptime → _strptime)는 학생이 쓴 import 문이 아니라 알리지 않는다(datetime 알림 하나만)
  await step('c_level_import', ['import datetime', 'datetime.datetime.strptime("2026-10-06", "%Y-%m-%d").year'].join('\n'));
  // __import__를 직접 부르면 import 문이 아니라 알리지 않는다(드묾 — importlib.import_module도 훅을 거치지 않는다)
  await step('direct_dunder_import', '__import__("decimal").Decimal("1.5").as_integer_ratio()');

  // 보드 라이브러리(/board/lib) 안쪽의 import는 알리지 않고, 학생 파일(작업 폴더)은 학생 코드라 알린다. 라이브러리·학생 파일 이름 자체도 알리지 않는다.
  pyodide.FS.mkdirTree('/board/lib');
  pyodide.FS.writeFile('/board/lib/notice_test_lib.py', 'import datetime\nVALUE = "lib"\n');
  pyodide.FS.writeFile('/home/pyodide/notice_test_mine.py', 'import typing\nVALUE = "mine"\n');
  await step('library_and_student_file', ['import notice_test_lib', 'import notice_test_mine', '[notice_test_lib.VALUE, notice_test_mine.VALUE]'].join('\n'));
  pyodide.runPython(
    "import sys\nfor _n in ('notice_test_lib', 'notice_test_mine'):\n    sys.modules.pop(_n, None)",
    { globals: pyodide.toPy({ __name__: 'notice_test_cleanup', __file__: '/apc/notice_test_cleanup.py' }) },
  );
  pyodide.FS.unlink('/board/lib/notice_test_lib.py');
  pyodide.FS.unlink('/home/pyodide/notice_test_mine.py');

  // ── 순수 함수와 표 맞춤(한 실행 — 학생 코드라 표준 모듈은 쓰지 않는다) ──
  await step(
    'pure_functions',
    [
      'import apc_board as B',
      'names = ["datetime", "threading", "typing", "js", "os.path", "collections.abc", "xml.etree.ElementTree", "json.decoder",',
      '         "machine", "ujson", "usys", "utime", "unetwork", "umath", "ugc", "umqtt.simple", "umqtt.robust", "asyncio.core", "asyncio.events",',
      '         "uasyncio", "requests", "_thread", "ucryptolib", "uwebsocket", "inisetup"]',
      'missing = {n: B.missing_on_board(n) or "" for n in names}  # 다 있으면 빈 글(None은 JS로 넘어오며 빠진다)',
      'u_alias_bad = sorted(n for n in B.U_ALIASES if not B.firmware_has_module(n))',
      'not_yet_bad = sorted(n for n, kind in B.NOT_YET_MODULES.items() if kind == "firmware" and not B.firmware_has_module(n))',
      'only_bad = sorted(n for n in B.FIRMWARE_ONLY_MODULES if not B.firmware_has_module(n))',
      'registered = sorted(n for n in B._board_modules if not B.firmware_has_module(n))',
      'pc_overlap = sorted(B.pc_package_names() & B.FIRMWARE_MODULES)',
      '{"missing": missing, "u_alias_bad": u_alias_bad, "not_yet_bad": not_yet_bad, "only_bad": only_bad, "registered": registered,',
      ' "pc_overlap": pc_overlap, "text": B.missing_module_notice("datetime"),',
      ' "sizes": [len(B.FIRMWARE_BUILTIN_MODULES), len(B.FIRMWARE_EXTENSIBLE_MODULES), len(B.FIRMWARE_FROZEN_MODULES), len(B.FIRMWARE_FROZEN_SUBMODULES)]}',
    ].join('\n'),
  );

  // ── 거짓 알림 0 훑기 ──
  // import 문 뽑기는 학생 코드가 아닌 곳(사이트 폴더 이름 — 훅이 보지 않음)에서 파이썬 ast로
  const extractGlobals = pyodide.toPy({ __name__: 'notice_test_extract', __file__: '/apc/notice_test_extract.py' });
  pyodide.runPython(
    [
      'import ast',
      'def _apc_imports_of(tree):',
      '    out = []',
      '    for node in ast.walk(tree):',
      '        if isinstance(node, ast.Import) or (isinstance(node, ast.ImportFrom) and node.level == 0):',
      '            out.append(ast.unparse(node))',
      '    return out',
      'def apc_import_statements(source):',
      '    """파일 전체를 파이썬으로 읽은 import 문(상대 import 빼고) — 읽지 못하면 None"""',
      '    try:',
      '        return _apc_imports_of(ast.parse(source))',
      '    except SyntaxError:',
      '        return None',
      'def apc_import_lines(source):',
      '    """전체가 파이썬이 아닌 코드(빈칸 채우기 ___①___ 등): import·from으로 시작하는 줄만 하나씩 읽는다"""',
      '    out = []',
      '    for line in source.splitlines():',
      '        text = line.strip()',
      '        if text.startswith(("import ", "from ")):',
      '            try:',
      '                out.extend(_apc_imports_of(ast.parse(text)))',
      '            except SyntaxError:',
      '                pass',
      '    return out',
    ].join('\n'),
    { globals: extractGlobals },
  );
  const extractStrict = extractGlobals.get('apc_import_statements');
  const extractLines = extractGlobals.get('apc_import_lines');
  const toList = (result) => {
    if (result === undefined || result === null) return null;
    const list = result.toJs();
    result.destroy();
    return list;
  };
  /** import 문 목록 — 전체를 읽고, 안 되면 import 줄만(빈 목록일 수 있음) */
  const statementsOf = (source) => toList(extractStrict(source)) ?? toList(extractLines(source)) ?? [];

  // 보드 라이브러리를 화면처럼 /board/lib에 넣는다(폴더 없이 파일 이름으로)
  const libDir = path.join(rootDir, 'examples', 'esp32', 'lib');
  const libraryNames = [];
  for (const file of walkPython(libDir)) {
    pyodide.FS.writeFile(`/board/lib/${path.basename(file)}`, fs.readFileSync(file, 'utf8'));
    libraryNames.push(path.basename(file, '.py'));
  }

  const examplesDir = path.join(rootDir, 'examples', 'esp32');
  const unparsed = [];
  for (const file of walkPython(examplesDir, ['lib'])) {
    const relative = path.relative(path.join(rootDir, 'examples'), file).replace(/\\/gu, '/');
    const source = fs.readFileSync(file, 'utf8');
    let statements = toList(extractStrict(source));
    if (statements === null) {
      // 원고 줄 번호가 든 원본 파일(일부러 SyntaxError — 사이드카 smoke error, 예: u2/2-2-3-fan-library.py)은
      // 줄 앞 번호 칸(가장 긴 번호 + 빈칸 하나 — "1  from …"·"10 time…")을 떼고 다시 읽는다. 그래도 안 되면 import 줄만.
      const lines = source.split(/\r?\n/u);
      const numberWidths = lines.map((line) => /^\d+/u.exec(line)?.[0].length ?? 0);
      const column = Math.max(...numberWidths) + 1;
      statements = statementsOf(lines.map((line, index) => (numberWidths[index] > 0 ? line.slice(column) : line)).join('\n'));
      if (statements.length === 0 && /\bimport\b/u.test(source)) {
        unparsed.push(relative);
        continue;
      }
    }
    await step(`${SWEEP_PREFIX.example}${relative}`, replayCode(statements));
  }

  // 차시 md의 코드 블록 가운데 보드 코드(보드 모듈이나 보드 라이브러리를 import)만 — 빈칸 채우기 문제(___①___)도 import 줄로 읽는다
  const boardHeads = new Set([...BOARD_CODE_MODULES, ...libraryNames]);
  for (const file of walkMarkdown(path.join(rootDir, 'content', 'lessons'))) {
    const relative = path.relative(rootDir, file).replace(/\\/gu, '/');
    for (const [line, code] of pythonFences(fs.readFileSync(file, 'utf8'))) {
      const statements = statementsOf(code);
      const heads = statements.map((statement) => /^(?:from|import)\s+([A-Za-z_]\w*)/u.exec(statement)?.[1]);
      if (!heads.some((head) => boardHeads.has(head))) continue; // import가 없거나 컴퓨터 쪽 코드 블록
      await step(`${SWEEP_PREFIX.lesson}${relative}:${line}`, replayCode(statements));
    }
  }

  await step(SWEEP_PREFIX.blocks, replayCode(blocksImportStatements(rootDir)));

  extractStrict.destroy();
  extractLines.destroy();
  extractGlobals.destroy();
  await step('sweep_unparsed', `${JSON.stringify(unparsed)}`);
}
