// 실습실 틀(LabShell.astro)에 판 1.6.0 C176이 더한 줄들의 소스 약속 — 브라우저 없이 소스 글로만 본다(진짜 화면은 tests/e2e/lab-esp32-kit.spec.ts).
//  · "처음이라면 이것 하나" 묶음(starterExampleId): 선택 상자 맨 위 optgroup, 원래 묶음에서는 뺀다(같은 예제가 두 번 나오지 않게)
//  · 실제 보드 전용 예제 안내 줄(.lab__run-note), "이 장치의 배선표와 회로 그림" 줄, "다음 단계: 2단계 · … →" 줄
//  · ESP32 실습실 쪽(index.astro)이 그 예제 id를 틀에 넘기고 내장 LED·LED 모듈 한 줄을 보인다
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { esp32ExampleIdFromFile } from '../../../src/lab/esp32/examples.ts';

const root = path.resolve(import.meta.dirname, '../../..');
const shell = fs.readFileSync(path.join(root, 'src/components/lab/LabShell.astro'), 'utf8');
const esp32Page = fs.readFileSync(path.join(root, 'src/pages/labs/esp32/index.astro'), 'utf8');
const shellText = fs.readFileSync(path.join(root, 'src/lab/controls/lab-shell.ts'), 'utf8');

describe('"처음이라면 이것 하나" 묶음', () => {
  it('LabShell이 starterExampleId를 받아 선택 상자 맨 위 묶음으로 따로 놓고, 원래 묶음에서는 건너뛴다', () => {
    expect(shell).toContain('starterExampleId?: string;');
    expect(shell).toContain("const STARTER_GROUP_LABEL = '처음이라면 이것 하나';");
    const starterPush = shell.indexOf('exampleGroups.push({ label: STARTER_GROUP_LABEL');
    const loop = shell.indexOf('for (const example of examples) {', starterPush);
    expect(starterPush).toBeGreaterThan(0);
    // 묶음 만들기 반복 전에 맨 앞으로 넣고, 반복 안에서 그 예제는 건너뛴다
    expect(loop).toBeGreaterThan(starterPush);
    expect(shell.slice(loop, loop + 200)).toContain('if (example === starterExample)');
  });

  it('ESP32 실습실 쪽이 기본으로 열리는 첫 예제(내장 LED 깜빡이기)를 넘기고, 내장 LED와 LED 모듈을 가르는 한 줄이 있다', () => {
    const passed = /const STARTER_EXAMPLE_ID = '([^']+)';/u.exec(esp32Page)?.[1];
    expect(passed).toBe(esp32ExampleIdFromFile('esp32/01-first-blink.py'));
    expect(esp32Page).toContain('starterExampleId={STARTER_EXAMPLE_ID}');
    expect(esp32Page).toContain('"처음이라면 이것 하나"');
    expect(esp32Page).toContain('<strong>내장 LED</strong>');
    expect(esp32Page).toContain('<strong>LED 모듈</strong>');
    // 이 예제는 실제로 있다(사이드카/파이썬 파일)
    expect(fs.existsSync(path.join(root, 'examples/esp32/01-first-blink.py'))).toBe(true);
  });
});

describe('키트 예제 줄', () => {
  it('"이 장치의 배선표와 회로 그림" 줄 다음에 "다음 단계" 줄이 있고, 둘 다 임베드에서는 숨고 처음엔 hidden이다', () => {
    const device = shell.indexOf('data-lab-device data-embed-hide hidden');
    const next = shell.indexOf('data-lab-next data-embed-hide hidden');
    expect(device).toBeGreaterThan(0);
    expect(next).toBeGreaterThan(device);
    expect(shell.slice(next, next + 300)).toContain('data-lab-next-link');
  });

  it('lab-shell.ts가 nextStep을 그리고, 누르면 주소로 가는 대신 loadExample로 연다(수정 키는 제외)', () => {
    expect(shellText).toContain('#renderNextStep(): void');
    expect(shellText).toContain("nextLink.dataset.labNextId = next.id;");
    expect(shellText).toMatch(/listen\(e\.nextLink, 'click'[\s\S]{0,400}this\.loadExample\(id\)/u);
    expect(shellText).toMatch(/event\.ctrlKey \|\| event\.metaKey/u);
  });
});

describe('실제 보드 전용 예제 안내 줄', () => {
  it('real-only 글이 [실제 보드] 탭 단추(모듈이 켠다)와 "보드 준비하기" 링크를 갖는다', () => {
    expect(shell).toContain('data-lab-run-note-text="real-only"');
    expect(shell).toContain('data-lab-run-note-real hidden');
    expect(shell).toContain('boardPrepareHref');
  });
});
