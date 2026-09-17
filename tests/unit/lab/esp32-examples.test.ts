// ESP32 실습실 예제 목록 만들기(src/lab/esp32/examples.ts) 단위 테스트 — P3-01.
// 새 예제 = examples/esp32/ 아래 .py 하나(원칙 6). 보드 라이브러리 폴더(esp32/lib/)는 예제가 아니다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readExampleMeta } from '../../../src/lab/controls/example-meta.ts';
import { readExampleSidecars } from '../../../src/lab/controls/example-sidecar.ts';
import { validateExamples } from '../../../src/lab/controls/examples.ts';
import { resolveWiring } from '../../../src/lab/modules/board/parts.ts';
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
    expect(examples.length).toBeGreaterThanOrEqual(4);
    expect(examples[0]?.id).toBe('01-first-blink');
    for (const example of examples) {
      const meta = readExampleMeta(example.code);
      expect(meta.title, example.id).not.toBeNull();
      expect(meta.tryIdeas.length, example.id).toBe(3);
      expect(meta.why.length, example.id).toBeGreaterThan(0);
      expect(example.code, example.id).toMatch(/from machine import/u);
    }
    // 진동 알림 새 예제(PD-36, 2-2-1): 머리말 # @part로 터치 센서 17·진동 모터 19를 잇고, 배선 검사에 오류·주의가 없다(사이트 배정 안내만)
    const alert = examples.find((example) => example.id === '04-touch-vibration-alert');
    expect(alert?.parts).toEqual([
      { part: 'touch-digital', pin: 17 },
      { part: 'vibration-motor', pin: 19 },
    ]);
    expect(resolveWiring(alert?.parts ?? []).issues.map((issue) => issue.code)).toEqual(['site-assigned']);
    expect(readExampleMeta(alert?.code ?? '').lesson).toBe('2-2-1');
    // 사이트 예제는 모두 "실습 방법" 상자(3단계)를 갖춰 보드 그림 위에 보인다(P3-02)
    for (const example of examples) {
      expect(example.practice?.length, example.id).toBe(3);
    }
  });

  it('배선은 차시 md → 사이드카 → 머리말 순서로 처음 찾은 곳만 쓰고, 틀린 줄은 빌드 경고로 알린다', () => {
    const files = {
      '/examples/esp32/u2/a.py': '# 제목\n# @part touch-digital 4\nfrom machine import Pin\n',
      '/examples/esp32/u2/b.py': '# 제목\n# @part touch-digital 4\nfrom machine import Pin\n',
      '/examples/esp32/u2/c.py': '# 제목\n# @part touch-digital 4\n# @part vibration-motor 99x\nfrom machine import Pin\n',
      '/examples/esp32/u2/d.py': 'from machine import Pin\n',
    };
    const sidecars = readExampleSidecars({
      '/examples/esp32/u2/a.meta.yaml': 'title: A\nparts:\n  - { part: touch-digital, pin: 5 }\n  - { pin: 1 }\n',
      '/examples/esp32/u2/b.meta.yaml': 'title: B\nparts:\n  - { part: touch-digital, pin: 5 }\n',
    });
    const warnings: string[] = [];
    const examples = esp32ExamplesFromFiles(files, sidecars, {}, { wiringByFile: { 'esp32/u2/a.py': [{ part: 'touch-digital', pin: 18 }] }, onWarning: (text) => warnings.push(text) });
    const partsOf = (id: string) => examples.find((example) => example.id === id)?.parts;
    expect(partsOf('u2-a')).toEqual([{ part: 'touch-digital', pin: 18 }]);
    expect(partsOf('u2-b')).toEqual([{ part: 'touch-digital', pin: 5 }]);
    expect(partsOf('u2-c')).toEqual([{ part: 'touch-digital', pin: 4 }]);
    expect(partsOf('u2-d')).toBeUndefined();
    // a는 차시 md가 이겨 사이드카의 틀린 줄을 읽지 않는다. c의 머리말 "99x"는 줄째로 버려진다(경고 없음 — 머리말 규약)
    expect(warnings).toEqual([]);
    const withBadSidecar = esp32ExamplesFromFiles(files, sidecars, {}, { onWarning: (text) => warnings.push(text) });
    expect(withBadSidecar.find((example) => example.id === 'u2-a')?.parts).toEqual([{ part: 'touch-digital', pin: 5 }]);
    expect(warnings).toEqual([expect.stringContaining('examples/esp32/u2/a.py: 사이드카 parts 2번째: 부품 이름(part)을 적어요')]);
  });

  it('원본에서 옮긴 ESP32 예제(f046·f015·f052·f053)는 사이드카가 있고, 바깥 부품 배선이 가상 보드 부품과 맞는다', () => {
    const files: Record<string, string> = {};
    const raw: Record<string, string> = {};
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        const key = '/' + path.relative(ROOT, full).split(path.sep).join('/');
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.name.endsWith('.py')) {
          files[key] = fs.readFileSync(full, 'utf8');
        } else if (entry.name.endsWith('.meta.yaml')) {
          raw[key] = fs.readFileSync(full, 'utf8');
        }
      }
    };
    walk(path.join(ROOT, 'examples', 'esp32'));
    const sidecars = readExampleSidecars(raw);
    const examples = esp32ExamplesFromFiles(files, sidecars);
    expect(validateExamples(examples)).toEqual([]);
    const byFile = (file: string) => examples.find((example) => example.file === file);
    expect(byFile('esp32/u2/2-1-1-blink-check.py')).toMatchObject({ title: '2-1-1 동작 테스트: 내장 LED 깜빡이기', group: '2단원 교과서 실습(피지컬 컴퓨팅)' });
    expect(byFile('esp32/u2/2-1-1-blink-check.py')?.parts).toBeUndefined();
    expect(byFile('esp32/hw/boot-button-led-check.py')).toMatchObject({ group: '부품 라이브러리 시험 코드' });
    expect(byFile('esp32/u2/2-1-2-adv-touch-check.py')?.parts).toEqual([{ part: 'touch-digital', pin: 17 }]);
    // 옮긴 예제의 실습 방법은 사이드카 practice에서(코드 파일에는 줄을 더하지 않음)
    for (const file of ['esp32/u2/2-1-1-blink-check.py', 'esp32/hw/boot-button-led-check.py', 'esp32/u2/2-1-2-adv-touch-check.py', 'esp32/u2/2-1-2-adv-touch-lcd-counter.py']) {
      expect(byFile(file)?.practice?.length, file).toBe(3);
    }
    const counter = byFile('esp32/u2/2-1-2-adv-touch-lcd-counter.py');
    expect(counter?.parts?.map((entry) => entry.part)).toEqual(['touch-digital', 'lcd-i2c']);
    // 문자 LCD는 P3-04에서 더해지므로 지금은 "아직 없는 부품" 주의 하나만
    expect(resolveWiring(counter?.parts ?? []).issues.map((issue) => [issue.level, issue.code])).toEqual([['warning', 'unknown-part']]);
    expect(resolveWiring(byFile('esp32/u2/2-1-2-adv-touch-check.py')?.parts ?? []).issues).toEqual([]);
    for (const [examplePath, sidecar] of Object.entries(sidecars)) {
      expect(files[examplePath], examplePath + '의 사이드카에 짝이 되는 .py 파일이 없어요').toBeDefined();
      expect(sidecar.title, examplePath + ' 사이드카의 title').not.toBeNull();
      expect(sidecar.partErrors ?? [], examplePath + ' 사이드카 parts').toEqual([]);
    }
  });
});
