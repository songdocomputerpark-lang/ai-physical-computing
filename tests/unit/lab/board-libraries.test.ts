// 보드 라이브러리(src/lab/esp32/board-libraries.ts) 단위 테스트 — 병렬 제작 준비(2026-09-17).
// examples/esp32/lib/의 .py를 가상 보드 /board/lib/와 실물 보드 [보드에 저장]이 함께 쓰므로 이름 규칙과 "코드가 부르는 라이브러리" 찾기를 검사한다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BOARD_LIBRARIES, BOARD_LIBRARY_DIR } from '../../../src/lab/esp32/board-library-files.ts';
import { boardLibrariesFromFiles, boardLibraryFileFromPath, importedModuleNames, librariesNeededBy } from '../../../src/lab/esp32/board-libraries.ts';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));

describe('보드 라이브러리 목록', () => {
  it('경로에서 examples/ 뒤 경로를 읽고, 라이브러리 폴더 밖은 뺀다', () => {
    expect(boardLibraryFileFromPath('/examples/esp32/lib/third-party/i2c_lcd.py')).toBe('esp32/lib/third-party/i2c_lcd.py');
    expect(boardLibraryFileFromPath('C:\\repo\\examples\\esp32\\lib\\servo_library.py')).toBe('esp32/lib/servo_library.py');
    expect(boardLibraryFileFromPath('/examples/esp32/u2/2-1-2-lcd-count.py')).toBeNull();
    expect(boardLibraryFileFromPath('/examples/esp32/lib/readme.md')).toBeNull();
  });

  it('파일 이름 = import 이름, third-party 표시, 이름 순서로 만든다', () => {
    const libraries = boardLibrariesFromFiles({
      '/examples/esp32/lib/third-party/i2c_lcd.py': 'class I2cLcd: pass\n',
      '/examples/esp32/lib/servo_library.py': 'from machine import PWM\n',
    });
    expect(libraries.map((library) => [library.name, library.fileName, library.file, library.thirdParty])).toEqual([
      ['i2c_lcd', 'i2c_lcd.py', 'esp32/lib/third-party/i2c_lcd.py', true],
      ['servo_library', 'servo_library.py', 'esp32/lib/servo_library.py', false],
    ]);
  });

  it('겹치는 파일 이름·규칙에 안 맞는 이름·붙박이 이름이면 빌드가 멈추게 오류를 던진다', () => {
    expect(() =>
      boardLibrariesFromFiles({ '/examples/esp32/lib/a.py': '', '/examples/esp32/lib/third-party/a.py': '' }),
    ).toThrow(/a.py이\(가\) examples\/esp32\/lib\/a.py와\(과\) 겹쳐요/u);
    expect(() => boardLibrariesFromFiles({ '/examples/esp32/lib/Servo-Lib.py': '' })).toThrow(/영문 소문자로 시작/u);
    expect(() => boardLibrariesFromFiles({ '/examples/esp32/lib/machine.py': '' })).toThrow(/이미 쓰는 이름/u);
    expect(() => boardLibrariesFromFiles({ '/examples/esp32/lib/apc_board.py': '' })).toThrow(/이미 쓰는 이름/u);
  });

  it('실제 저장소의 examples/esp32/lib/ 파일과 목록이 같고, 가상 보드 폴더는 apc_board.py의 BOARD_LIB_DIR과 같다', () => {
    const libDir = path.join(ROOT, 'examples', 'esp32', 'lib');
    const walk = (dir: string): string[] =>
      fs.existsSync(dir)
        ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walk(path.join(dir, entry.name)) : entry.name.endsWith('.py') ? [entry.name] : []))
        : [];
    expect(BOARD_LIBRARIES.map((library) => library.fileName)).toEqual(walk(libDir).sort((a, b) => a.localeCompare(b, 'en')));
    const boardSource = fs.readFileSync(path.join(ROOT, 'src', 'lab', 'modules', 'board', 'apc_board.py'), 'utf8');
    expect(boardSource).toContain(`BOARD_LIB_DIR = "${BOARD_LIBRARY_DIR}"`);
  });

  it('보드 라이브러리 이름이 흉내 모듈 파일(/apc — src/lab/python·src/lab/modules의 .py)과 겹치지 않는다(겹치면 /apc 파일이 라이브러리를 가린다)', () => {
    const walkPython = (dir: string): string[] =>
      fs.existsSync(dir)
        ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? walkPython(path.join(dir, entry.name)) : entry.name.endsWith('.py') ? [entry.name] : []))
        : [];
    const apcNames = new Set([...walkPython(path.join(ROOT, 'src', 'lab', 'python')), ...walkPython(path.join(ROOT, 'src', 'lab', 'modules'))]);
    const clashes = BOARD_LIBRARIES.filter((library) => apcNames.has(library.fileName)).map((library) => library.file);
    expect(clashes, '같은 이름을 흉내(/apc)와 보드 라이브러리(examples/esp32/lib/)에 함께 두지 않아요 — src/lab/README.md 7.9').toEqual([]);
  });
});

describe('코드가 부르는 라이브러리', () => {
  it('import 줄의 맨 앞 이름을 나온 순서로 찾는다(주석·글자 속 import, 상대 import는 뺀다)', () => {
    const code = [
      'from machine import Pin, SoftI2C',
      'import time, ustruct as st',
      'from i2c_lcd import I2cLcd  # LCD',
      '# import fake_module',
      'text = "import not_a_module"',
      'def f():',
      '    import servo_library.sub as s',
      'from . import local',
      'import time',
    ].join('\n');
    expect(importedModuleNames(code)).toEqual(['machine', 'time', 'ustruct', 'i2c_lcd', 'servo_library']);
  });

  it('라이브러리가 부르는 라이브러리까지 고른다(목록 순서, 한 번씩)', () => {
    const libraries = boardLibrariesFromFiles({
      '/examples/esp32/lib/lcd_api.py': 'class LcdApi: pass\n',
      '/examples/esp32/lib/third-party/i2c_lcd.py': 'from lcd_api import LcdApi\nimport time\n',
      '/examples/esp32/lib/servo_library.py': 'from machine import PWM\n',
    });
    expect(librariesNeededBy('from i2c_lcd import I2cLcd\nimport i2c_lcd', libraries).map((library) => library.name)).toEqual(['i2c_lcd', 'lcd_api']);
    expect(librariesNeededBy('from machine import Pin', libraries)).toEqual([]);
  });
});
