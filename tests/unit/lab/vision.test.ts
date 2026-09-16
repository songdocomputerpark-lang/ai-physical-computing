// 영상처리 실습실의 순수 논리 단위 테스트(PLAN §8.2 P2-03): 예제 목록 만들기(src/lab/vision/examples.ts), 프레임 제한·fps·키 코드·
// 합성 샘플 장면(src/lab/vision/frame.ts), 파일 소스 크기 맞추기(sources.ts의 fitSize), 가짜 카메라용 합성 영상(scripts/gen-test-video.mjs).
// 카메라·캔버스·워커가 필요한 동작은 브라우저 테스트(tests/e2e/lab-vision.spec.ts)에서 확인한다.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_OPTIONS, buildY4m, lumaAt } from '../../../scripts/gen-test-video.mjs';
import { validateExamples } from '../../../src/lab/controls/examples.ts';
import {
  VISION_PACKAGES,
  exampleFileFromPath,
  exampleIdFromFile,
  readExampleHeader,
  visionExamplesFromFiles,
} from '../../../src/lab/vision/examples.ts';
import {
  FpsMeter,
  FrameThrottle,
  MAX_READ_FPS,
  SCREEN_KEYS,
  SampleScene,
  clampFrameSize,
  createFrame,
  keyCodeForEvent,
} from '../../../src/lab/vision/frame.ts';
import { fitSize } from '../../../src/lab/vision/sources.ts';

const ROOT = process.cwd();

describe('예제 목록 만들기(examples/vision/*.py → LabExample[])', () => {
  it('glob 경로에서 examples/ 아래 경로와 id를 뽑는다', () => {
    expect(exampleFileFromPath('/examples/vision/first-edge.py')).toBe('vision/first-edge.py');
    expect(exampleFileFromPath('/examples/vision/u1/v4-blur-edge.py')).toBe('vision/u1/v4-blur-edge.py');
    expect(exampleFileFromPath('/examples/esp32/blink.py')).toBeNull();
    expect(exampleIdFromFile('vision/first-edge.py')).toBe('first-edge');
    expect(exampleIdFromFile('vision/u1/v4-blur-edge.py')).toBe('u1-v4-blur-edge');
    expect(exampleIdFromFile('vision/u1/1-2-1 Flip.py')).toBe('u1-1-2-1-flip');
  });

  it('첫 줄 주석이 제목, 다음 주석이 설명이고 규약 주석(# @slider)은 설명이 아니다', () => {
    expect(readExampleHeader('# 첫 실습: 테두리 찾기\n# 카메라 영상을 회색으로 바꿔요.\nimport cv2\n')).toEqual({
      title: '첫 실습: 테두리 찾기',
      description: '카메라 영상을 회색으로 바꿔요.',
    });
    expect(readExampleHeader('\n# 제목만\nx = 1\n')).toEqual({ title: '제목만', description: null });
    expect(readExampleHeader('# 제목\n# @slider 0 255 1\n# 설명\n')).toEqual({ title: '제목', description: '설명' });
    expect(readExampleHeader('import cv2\n# 나중 주석\n')).toEqual({ title: null, description: null });
  });

  it('파일 여러 개를 폴더 없는 것 → 폴더 → 파일 이름(숫자 크기순)으로 정렬하고 OpenCV를 미리 받게 한다', () => {
    const examples = visionExamplesFromFiles({
      '/examples/vision/u1/10-b.py': '# 열 번째\nprint(10)\n',
      '/examples/vision/u1/2-a.py': '# 두 번째\nprint(2)\n',
      '/examples/vision/first-edge.py': '# 첫 실습\n# 설명 줄\nimport cv2\n',
      '/examples/esp32/blink.py': '# 다른 실습실\n',
      '/examples/vision/readme.txt': '글',
    });
    expect(examples.map((example) => example.id)).toEqual(['first-edge', 'u1-2-a', 'u1-10-b']);
    expect(examples[0]).toMatchObject({
      id: 'first-edge',
      title: '첫 실습',
      description: '설명 줄',
      file: 'vision/first-edge.py',
      packages: ['opencv-python'],
    });
    expect(examples[0]?.code).toBe('# 첫 실습\n# 설명 줄\nimport cv2\n');
    expect(examples[1]?.description).toBeUndefined();
    expect(validateExamples(examples)).toEqual([]);
    expect(VISION_PACKAGES).toEqual(['opencv-python']);
  });

  it('저장소의 examples/vision/ 파일이 모두 목록 규칙에 맞고 첫 실습(first-edge)이 있다', () => {
    const dir = path.join(ROOT, 'examples', 'vision');
    const files: Record<string, string> = {};
    const walk = (current: string) => {
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.name.endsWith('.py')) {
          files[`/${path.relative(ROOT, full).split(path.sep).join('/')}`] = fs.readFileSync(full, 'utf8');
        }
      }
    };
    walk(dir);
    const examples = visionExamplesFromFiles(files);
    expect(validateExamples(examples)).toEqual([]);
    const first = examples.find((example) => example.id === 'first-edge');
    expect(first?.file).toBe('vision/first-edge.py');
    expect(first?.title).toContain('에지');
    expect(first?.code).toContain('# @slider 0 255 1');
    expect(first?.code).toContain('cv2.Canny');
    // 첫 실습이 목록 맨 앞이라 처음 열 때 편집칸에 들어간다(폴더 없는 파일 → 폴더 순).
    expect(examples[0]?.id).toBe('first-edge');
    for (const example of examples) {
      expect(example.title, example.id).not.toMatch(/^#/u);
      expect(example.file, example.id).toMatch(/^vision\/.*\.py$/u);
    }
  });
});

describe('프레임 제한과 fps', () => {
  it('앞 장을 준 뒤 1000/15ms가 지나야 다음 장을 준다', () => {
    const throttle = new FrameThrottle(MAX_READ_FPS);
    expect(throttle.intervalMs).toBeCloseTo(66.67, 1);
    expect(throttle.nextDelay(0)).toBe(0);
    throttle.mark(0);
    expect(throttle.nextDelay(10)).toBe(57);
    expect(throttle.nextDelay(66.7)).toBe(0);
    throttle.reset();
    expect(throttle.nextDelay(20)).toBe(0);
  });

  it('fps 재기: 최근 1초 안의 장으로 센다', () => {
    const meter = new FpsMeter();
    for (let index = 0; index < 16; index += 1) {
      meter.tick(index * 66.67);
    }
    expect(meter.fps(1000)).toBeCloseTo(15, 0);
    expect(meter.fps(3000)).toBe(0);
    meter.reset();
    expect(meter.fps(3000)).toBe(0);
  });

  it('프레임 크기 다듬기와 빈 프레임', () => {
    expect(clampFrameSize(640, 1920)).toBe(640);
    expect(clampFrameSize(4000, 1920)).toBe(1920);
    expect(clampFrameSize(1, 1920)).toBe(8);
    expect(clampFrameSize(Number.NaN, 1920)).toBe(0);
    const frame = createFrame(2, 2);
    expect(frame.data.length).toBe(16);
    expect(frame.data[3]).toBe(255);
    expect(frame.data[0]).toBe(0);
  });
});

describe('키 코드(cv2.waitKey 값)', () => {
  it('글자 한 개와 ESC·Enter·Backspace·Space만 바꾸고 Tab·화살표·조합키는 null', () => {
    expect(keyCodeForEvent({ key: 'q' })).toBe(113);
    expect(keyCodeForEvent({ key: 'Q' })).toBe(81);
    expect(keyCodeForEvent({ key: '1' })).toBe(49);
    expect(keyCodeForEvent({ key: 'Escape' })).toBe(27);
    expect(keyCodeForEvent({ key: 'Enter' })).toBe(13);
    expect(keyCodeForEvent({ key: ' ' })).toBe(32);
    expect(keyCodeForEvent({ key: 'Tab' })).toBeNull();
    expect(keyCodeForEvent({ key: 'ArrowLeft' })).toBeNull();
    expect(keyCodeForEvent({ key: 'ㅂ' })).toBeNull();
    expect(keyCodeForEvent({ key: 'q', ctrlKey: true })).toBeNull();
    expect(SCREEN_KEYS.map((key) => key.code)).toEqual([113, 100, 114, 27]);
  });
});

describe('합성 샘플 장면', () => {
  it('시간이 흐르면 도형이 움직이고 화면 밖으로 나가지 않는다', () => {
    const scene = new SampleScene();
    const before = scene.shapes.map((shape) => [shape.x, shape.y]);
    for (let index = 0; index < 600; index += 1) {
      scene.advance(0.1);
    }
    expect(scene.time).toBeCloseTo(60, 5);
    scene.shapes.forEach((shape, index) => {
      const half = shape.size / 2;
      expect(shape.x).toBeGreaterThanOrEqual(half - 1e-9);
      expect(shape.x).toBeLessThanOrEqual(1 - half + 1e-9);
      expect(shape.y).toBeGreaterThanOrEqual(half - 1e-9);
      expect(shape.y).toBeLessThanOrEqual(1 - half + 1e-9);
      expect([shape.x, shape.y]).not.toEqual(before[index]);
    });
    // 너무 큰 시간 간격은 0.5초로 자른다(탭을 오래 숨겼다 돌아와도 도형이 튀지 않게).
    const jump = new SampleScene();
    jump.advance(100);
    expect(jump.time).toBe(0.5);
  });

  it('파일 소스는 그림을 비율대로 줄여 넣는다', () => {
    expect(fitSize(1280, 720, 640, 480)).toEqual({ width: 640, height: 360 });
    expect(fitSize(300, 200, 640, 480)).toEqual({ width: 300, height: 200 });
    expect(fitSize(1000, 4000, 640, 480)).toEqual({ width: 120, height: 480 });
  });
});

describe('가짜 카메라용 합성 영상(Y4M)', () => {
  it('헤더·프레임 크기가 규격대로이고, 밝은 도형과 어두운 도형이 모두 있다', () => {
    const data = buildY4m({ width: 64, height: 48, fps: 15, frames: 2 });
    const header = 'YUV4MPEG2 W64 H48 F15:1 Ip A1:1 C420jpeg\n';
    expect(new TextDecoder().decode(data.subarray(0, header.length))).toBe(header);
    const frameSize = 6 + 64 * 48 + (32 * 24) * 2;
    expect(data.length).toBe(header.length + frameSize * 2);
    expect(new TextDecoder().decode(data.subarray(header.length, header.length + 6))).toBe('FRAME\n');
    const luma = data.subarray(header.length + 6, header.length + 6 + 64 * 48);
    expect(luma.includes(235)).toBe(true);
    expect(luma.includes(16)).toBe(true);
    expect(luma.includes(80)).toBe(true);
    expect(luma.includes(100)).toBe(true); // 희미한 네모(시나리오 A의 임계값 변화 측정용)
    const chroma = data.subarray(header.length + 6 + 64 * 48, header.length + frameSize);
    expect(chroma.every((value) => value === 128)).toBe(true);
    expect(() => buildY4m({ width: 63, height: 48 })).toThrow(/짝수/u);
  });

  it('기본 설정은 640×480 15fps이고, 흰 네모는 시간에 따라 오른쪽으로 움직인다', () => {
    expect(DEFAULT_OPTIONS).toEqual({ width: 640, height: 480, fps: 15, frames: 16 });
    const at = (t: number) => {
      for (let x = 0; x < 640; x += 1) {
        if (lumaAt(x, 120, t, 640, 480) === 235) {
          return x;
        }
      }
      return -1;
    };
    expect(at(0)).toBeGreaterThanOrEqual(0);
    expect(at(0.5)).toBeGreaterThan(at(0));
    // 희미한 네모(밝기 100)는 오른쪽 아래에 고정이고 다른 도형과 겹치지 않는다(모든 장에서 바탕 80과의 차이가 20).
    for (const t of [0, 0.25, 0.5, 0.75]) {
      expect(lumaAt(600, 420, t, 640, 480)).toBe(100);
      expect(lumaAt(520, 420, t, 640, 480)).toBe(80);
    }
  });
});
