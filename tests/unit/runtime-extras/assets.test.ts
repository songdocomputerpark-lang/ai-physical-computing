// 러너 공통 모듈의 자산 이름·경로(src/lab/modules/runtime-extras/assets.ts)와 직접 그린 가면 그림(assets/mask.svg) 검사(P2-10).
// 화면과 파이썬(apc_files.py)이 같은 값을 써야 하므로 .py 파일 글자에서 상수를 읽어 맞춰 본다(실제 동작은 pyodide-runtime-extras.test.ts).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MASK_FILE_NAME,
  MASK_HEIGHT,
  MASK_WIDTH,
  SITE_FONT_CANDIDATES,
  SITE_FONT_FILE,
  SITE_FONT_FS_PATH,
  SITE_FONT_LABEL,
  WORK_DIR,
  isPng,
} from '../../../src/lab/modules/runtime-extras/assets.ts';
import { maskSvgSource } from '../../../src/lab/modules/runtime-extras/mask.ts';
import { BASE_PATH } from '../../../src/lib/url.ts';

const PY = fs.readFileSync(path.join(process.cwd(), 'src', 'lab', 'modules', 'runtime-extras', 'apc_files.py'), 'utf8');

function pythonConstant(name: string): string {
  const match = new RegExp(`^${name} = "([^"]*)"`, 'mu').exec(PY);
  if (!match) {
    throw new Error(`apc_files.py에서 ${name} 상수를 찾지 못했어요.`);
  }
  return match[1]!;
}

describe('화면과 파이썬이 같은 값을 쓴다', () => {
  it('작업 폴더와 글꼴 이름·경로가 apc_files.py와 같다', () => {
    expect(WORK_DIR).toBe(pythonConstant('WORK_DIR'));
    expect(SITE_FONT_FILE).toBe(pythonConstant('SITE_FONT_FILE'));
    expect(SITE_FONT_LABEL).toBe(pythonConstant('SITE_FONT_LABEL'));
    expect(SITE_FONT_FS_PATH).toBe(`${pythonConstant('SITE_FONT_DIR')}/${SITE_FONT_FILE}`);
  });

  it('글꼴 파일은 같은 사이트 주소에서만 받는다(원칙 2: 밖으로 나가지 않는다)', () => {
    expect(SITE_FONT_CANDIDATES.length).toBeGreaterThan(0);
    for (const url of SITE_FONT_CANDIDATES) {
      expect(url.startsWith(BASE_PATH)).toBe(true);
      expect(url.endsWith(SITE_FONT_FILE)).toBe(true);
      expect(/^[a-z]+:/u.test(url)).toBe(false);
    }
  });
});

describe('직접 그린 가면 그림', () => {
  const svg = maskSvgSource();

  it('사이트가 만든 SVG 한 장이고 바깥 자료를 끌어오지 않는다(저작권·서버 제로)', () => {
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain(`width="${MASK_WIDTH}"`);
    expect(svg).toContain(`height="${MASK_HEIGHT}"`);
    expect(svg).not.toContain('data:');
    expect(svg).not.toContain('<image');
    expect(svg).not.toContain('href');
    expect(svg).not.toContain('<script');
    // 주소는 SVG 이름 공간(xmlns) 하나뿐이다 — 그림을 그릴 때 밖에서 받아 오는 것이 없다.
    expect(svg.match(/https?:\/\/[^"' ]+/gu)).toEqual(['http://www.w3.org/2000/svg']);
  });

  it('눈 구멍이 뚫려 있어 얼굴 위에 얹을 수 있다(투명 배경·evenodd)', () => {
    expect(svg).toContain('fill-rule="evenodd"');
    expect(svg).toContain('<title');
    expect(svg).toContain('<desc');
  });

  it('파이썬이 읽는 파일 이름은 mask.png다(f039 15행 cv2.imread("mask.png"))', () => {
    expect(MASK_FILE_NAME).toBe('mask.png');
    const example = fs.readFileSync(path.join(process.cwd(), 'examples', 'vision', 'u1', '1-3-3-adv-face-mask.py'), 'utf8');
    expect(example).toContain(`cv2.imread("${MASK_FILE_NAME}", cv2.IMREAD_UNCHANGED)`);
  });

  it('PNG 머리 검사가 맞다', () => {
    expect(isPng(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]))).toBe(true);
    expect(isPng(Uint8Array.from([0x89, 0x50]))).toBe(false);
    expect(isPng(new Uint8Array(0))).toBe(false);
  });
});
