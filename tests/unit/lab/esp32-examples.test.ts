// ESP32 실습실 예제 목록 만들기(src/lab/esp32/examples.ts) 단위 테스트 — P3-01.
// 새 예제 = examples/esp32/ 아래 .py 하나(원칙 6). 보드 라이브러리 폴더(esp32/lib/)는 예제가 아니다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readExampleMeta } from '../../../src/lab/controls/example-meta.ts';
import { validateExamples } from '../../../src/lab/controls/examples.ts';
import { esp32ExampleFileFromPath, esp32ExampleIdFromFile, esp32ExamplesFromFiles } from '../../../src/lab/esp32/examples.ts';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));

describe('ESP32 실습실 예제 목록', () => {
  it('경로·id 규칙: esp32/ 뒤 경로를 하이픈으로 잇고, 라이브러리 폴더와 다른 실습실 폴더는 뺀다', () => {
    expect(esp32ExampleFileFromPath('/examples/esp32/01-first-blink.py')).toBe('esp32/01-first-blink.py');
    expect(esp32ExampleFileFromPath('/examples/esp32/lib/third-party/i2c_lcd.py')).toBeNull();
    expect(esp32ExampleFileFromPath('/examples/vision/first-edge.py')).toBeNull();
    expect(esp32ExampleIdFromFile('esp32/01-first-blink.py')).toBe('01-first-blink');
    expect(esp32ExampleIdFromFile('esp32/u2/2-1-1_LED.py')).toBe('u2-2-1-1-led');
  });

  it('사이드카 → 머리말 → 파일 이름 순서로 제목을 정하고, 사이트 예제 → 교과서 폴더 순서로 묶는다. 패키지는 받지 않는다(PD-04)', () => {
    const examples = esp32ExamplesFromFiles(
      {
        '/examples/esp32/u2/2-1-10-last.py': 'print(10)\n',
        '/examples/esp32/u2/2-1-2-touch.py': 'print(2)\n',
        '/examples/esp32/02-second.py': '# 둘째 예제\nprint(2)\n',
        '/examples/esp32/01-first.py': '# 첫 예제\n# 설명 한 줄\nprint(1)\n',
        '/examples/esp32/lib/third-party/i2c_lcd.py': 'class I2cLcd: pass\n',
      },
      {
        '/examples/esp32/u2/2-1-2-touch.py': { title: '2-1-2 터치 센서', description: null, lesson: null, page: null, sourceId: 'f052', tags: [], packages: null },
      },
    );
    expect(examples.map((example) => [example.id, example.title, example.group])).toEqual([
      ['01-first', '첫 예제', '첫 실습·사이트 예제'],
      ['02-second', '둘째 예제', '첫 실습·사이트 예제'],
      ['u2-2-1-2-touch', '2-1-2 터치 센서', '2단원 교과서 실습(피지컬 컴퓨팅)'],
      ['u2-2-1-10-last', 'u2-2-1-10-last', '2단원 교과서 실습(피지컬 컴퓨팅)'],
    ]);
    expect(examples[0]).toMatchObject({ file: 'esp32/01-first.py', description: '설명 한 줄' });
    expect(examples.every((example) => example.packages === undefined)).toBe(true);
    expect(validateExamples(examples)).toEqual([]);
  });

  it('실제 사이트 예제(examples/esp32/)는 머리말·안내 상자를 갖추고 첫 예제가 내장 LED 깜빡이기다', () => {
    const dir = path.join(ROOT, 'examples', 'esp32');
    const files = Object.fromEntries(
      fs
        .readdirSync(dir)
        .filter((name) => name.endsWith('.py'))
        .map((name) => [`/examples/esp32/${name}`, fs.readFileSync(path.join(dir, name), 'utf8')]),
    );
    const examples = esp32ExamplesFromFiles(files);
    expect(examples.length).toBeGreaterThanOrEqual(3);
    expect(examples[0]?.id).toBe('01-first-blink');
    for (const example of examples) {
      const meta = readExampleMeta(example.code);
      expect(meta.title, example.id).not.toBeNull();
      expect(meta.tryIdeas.length, example.id).toBe(3);
      expect(meta.why.length, example.id).toBeGreaterThan(0);
      expect(example.code, example.id).toMatch(/from machine import/u);
    }
  });
});
