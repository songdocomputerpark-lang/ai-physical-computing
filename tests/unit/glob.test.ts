import { describe, expect, it } from 'vitest';
import { matchesGlob, toPosixPath, validateGlob } from '../../scripts/lib/glob.mjs';

describe('경로 패턴(scripts/lib/glob.mjs)', () => {
  it('끝의 **는 그 폴더 안의 모든 파일에 맞는다', () => {
    expect(matchesGlob('examples/a.py', 'examples/**')).toBe(true);
    expect(matchesGlob('examples/esp32/u2/b.py', 'examples/**')).toBe(true);
    expect(matchesGlob('examples', 'examples/**')).toBe(false);
    expect(matchesGlob('examples-old/a.py', 'examples/**')).toBe(false);
  });

  it('가운데 **는 폴더 0개 이상에 맞는다', () => {
    const pattern = 'examples/**/third-party/**';
    expect(matchesGlob('examples/third-party/a.py', pattern)).toBe(true);
    expect(matchesGlob('examples/esp32/lib/third-party/i2c_lcd.py', pattern)).toBe(true);
    expect(matchesGlob('examples/esp32/lib/third-party-old/i2c_lcd.py', pattern)).toBe(false);
  });

  it('*와 ?는 한 칸(폴더 이름 하나) 안에서만 맞는다', () => {
    expect(matchesGlob('public/models/hand.task', 'public/models/*.task')).toBe(true);
    expect(matchesGlob('public/models/v1/hand.task', 'public/models/*.task')).toBe(false);
    expect(matchesGlob('public/a1.png', 'public/a?.png')).toBe(true);
    expect(matchesGlob('public/a12.png', 'public/a?.png')).toBe(false);
  });

  it('점으로 시작하는 파일, 한글 이름, 정규식 특수 문자를 그대로 비교한다', () => {
    expect(matchesGlob('public/.well-known/x.txt', 'public/**')).toBe(true);
    expect(matchesGlob('content/차시(1).md', 'content/차시(1).md')).toBe(true);
    expect(matchesGlob('content/차시X1).md', 'content/차시(1).md')).toBe(false);
    expect(matchesGlob('public/a+b.txt', 'public/a+b.txt')).toBe(true);
  });

  it('Windows 경로 구분자는 /로 바꿔 비교하고, 대소문자는 구분한다', () => {
    expect(toPosixPath('public\\_probe\\probe.mjs')).toBe('public/_probe/probe.mjs');
    expect(matchesGlob('public\\_probe\\probe.mjs', 'public/_probe/**')).toBe(true);
    expect(matchesGlob('Public/a.txt', 'public/**')).toBe(false);
  });

  it('지원하지 않는 모양은 한국어 설명을 돌려준다', () => {
    const invalidPatterns = [
      '',
      ' public/**',
      '/public/**',
      './public/**',
      'public\\**',
      'public/',
      '{a,b}/**',
      '!public/**',
      'public/[ab].txt',
      'public/**x',
      'public//a',
      '../x',
    ];
    for (const pattern of invalidPatterns) {
      expect(validateGlob(pattern), pattern).toMatch(/[가-힣]/u);
    }
    expect(validateGlob('examples/**/third-party/**')).toBeNull();
    expect(validateGlob('public/models/*.task')).toBeNull();
  });
});
