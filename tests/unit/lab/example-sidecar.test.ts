// 예제 사이드카(<이름>.meta.yaml) 읽기 단위 테스트 — src/lab/controls/example-sidecar.ts(빌드 전용)와 실습실 목록 합치기(src/lab/vision/examples.ts).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { examplePathForSidecar, parseExampleSidecar, readExampleSidecars } from '../../../src/lab/controls/example-sidecar.ts';
import { validateExamples } from '../../../src/lab/controls/examples.ts';
import { EXAMPLE_GROUPS, exampleGroupKey, exampleGroupLabel, visionExamplesFromFiles } from '../../../src/lab/vision/examples.ts';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));

describe('사이드카 읽기', () => {
  it('필드를 읽고 모양이 틀린 값은 null·빈 목록으로 둔다', () => {
    const sidecar = parseExampleSidecar(
      ['# 주석', 'title: "1-2-1 기본 실습: 반전"', 'description: 거울처럼 뒤집어요.', 'lesson: 1-2-1', 'page: 28', 'source_id: f028', 'tags: [카메라, flip, 카메라]', 'packages: []'].join('\n'),
    );
    expect(sidecar).toEqual({
      title: '1-2-1 기본 실습: 반전',
      description: '거울처럼 뒤집어요.',
      lesson: '1-2-1',
      page: 28,
      sourceId: 'f028',
      tags: ['카메라', 'flip'],
      packages: [],
    });
    expect(parseExampleSidecar('title: ""\nlesson: "Bad Slug"\npage: -1\npackages: 글자\n')).toEqual({
      title: null,
      description: null,
      lesson: null,
      page: null,
      sourceId: null,
      tags: [],
      packages: null,
    });
    expect(parseExampleSidecar('')).toMatchObject({ title: null, packages: null });
  });

  it('사이드카 경로를 예제 경로로 바꾸고 묶음으로 읽는다', () => {
    expect(examplePathForSidecar('/examples/vision/u1/a.meta.yaml')).toBe('/examples/vision/u1/a.py');
    expect(examplePathForSidecar('/examples/vision/u1/a.yaml')).toBeNull();
    const sidecars = readExampleSidecars({ '/examples/vision/u1/a.meta.yaml': 'title: 제목\n', '/examples/vision/readme.yaml': 'x: 1' });
    expect(Object.keys(sidecars)).toEqual(['/examples/vision/u1/a.py']);
    expect(() => readExampleSidecars({ '/examples/vision/u1/b.meta.yaml': 'title: [\n' })).toThrow(/b\.meta\.yaml/u);
  });
});

describe('실습실 목록과 사이드카 합치기', () => {
  it('사이드카가 있으면 제목·설명·패키지를 사이드카에서, 없으면 머리말에서 읽고 묶음·순서를 정한다', () => {
    const files = {
      '/examples/vision/u1/1-2-1-webcam-flip.py': 'import cv2\n',
      '/examples/vision/first-edge.py': '# 첫 실습\n# 설명 줄\nimport cv2\n',
      '/examples/desktop/02-b.py': 'import pyautogui\n',
      '/examples/desktop/01-a.py': 'import pyautogui\n',
      '/examples/vision/opmp/01-cam.py': 'import cv2\n',
      '/examples/esp32/blink.py': '# 다른 실습실\n',
    };
    const sidecars = readExampleSidecars({
      '/examples/vision/u1/1-2-1-webcam-flip.meta.yaml': 'title: 반전\ndescription: 설명\npackages: [opencv-python]\n',
      '/examples/desktop/01-a.meta.yaml': 'title: 데스크톱 A\npackages: []\n',
    });
    const examples = visionExamplesFromFiles(files, sidecars);
    expect(validateExamples(examples)).toEqual([]);
    expect(examples.map((example) => example.id)).toEqual(['first-edge', 'u1-1-2-1-webcam-flip', 'opmp-01-cam', 'desktop-01-a', 'desktop-02-b']);
    expect(examples.map((example) => example.group)).toEqual([
      '첫 실습·사이트 예제',
      '1단원 교과서 실습',
      'OpenCV·MediaPipe 계단(교안)',
      '가상 데스크톱(pyautogui)',
      '가상 데스크톱(pyautogui)',
    ]);
    expect(examples[1]).toMatchObject({ title: '반전', description: '설명', packages: ['opencv-python'], file: 'vision/u1/1-2-1-webcam-flip.py' });
    expect(examples[3]).toMatchObject({ title: '데스크톱 A', packages: [], file: 'desktop/01-a.py' });
    expect(examples[4]).toMatchObject({ title: 'desktop-02-b', packages: ['opencv-python'] });
    expect(examples[0]).toMatchObject({ title: '첫 실습', description: '설명 줄' });
    expect(exampleGroupKey('vision/u1/a.py')).toBe('vision/u1');
    expect(exampleGroupKey('vision/a.py')).toBe('vision');
    expect(exampleGroupKey('desktop/a.py')).toBe('desktop');
    expect(exampleGroupLabel('없는-묶음')).toBe('없는-묶음');
    expect(EXAMPLE_GROUPS.map((group) => group.key)).toEqual(['vision', 'vision/u1', 'vision/opmp', 'desktop']);
  });

  it('저장소의 옮긴 예제마다 사이드카가 있고 제목이 채워져 있다', () => {
    const files: Record<string, string> = {};
    const raw: Record<string, string> = {};
    const walk = (dir: string): void => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.name.endsWith('.py')) {
          files[`/${path.relative(ROOT, full).split(path.sep).join('/')}`] = fs.readFileSync(full, 'utf8');
        } else if (entry.name.endsWith('.meta.yaml')) {
          raw[`/${path.relative(ROOT, full).split(path.sep).join('/')}`] = fs.readFileSync(full, 'utf8');
        }
      }
    };
    walk(path.join(ROOT, 'examples', 'vision'));
    walk(path.join(ROOT, 'examples', 'desktop'));
    const sidecars = readExampleSidecars(raw);
    const examples = visionExamplesFromFiles(files, sidecars);
    expect(validateExamples(examples)).toEqual([]);
    expect(examples.length).toBeGreaterThanOrEqual(52);
    expect(examples[0]?.id).toBe('first-edge');
    for (const [examplePath, sidecar] of Object.entries(sidecars)) {
      expect(files[examplePath], `${examplePath}의 사이드카에 짝이 되는 .py 파일이 없어요`).toBeDefined();
      expect(sidecar.title, `${examplePath} 사이드카의 title`).not.toBeNull();
    }
    // 옮긴 예제(사이드카가 있는 것)는 제목이 파일 이름이 아니다
    for (const example of examples) {
      if (sidecars[`/examples/${example.file ?? ''}`]) {
        expect(example.title).not.toBe(example.id);
      }
    }
  });
});
