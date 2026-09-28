// 공유 링크(src/lab/controls/share-link.ts) 단위 테스트 — 압축·복원 왕복, # 값 읽기, 길이 한계(PLAN §8.2 P2-02 "Vitest(공유 링크 왕복)").
import { describe, expect, it } from 'vitest';
import {
  SHARE_URL_MAX_LENGTH,
  SHARE_URL_WARN_LENGTH,
  ShareTooLongError,
  buildShareLink,
  decodeShareCode,
  encodeShareCode,
  hasShareHash,
  parseShareHash,
  pickExampleLab,
  pickShareLab,
  shareLengthWarning,
  type LabOnPage,
} from '../../../src/lab/controls/share-link.ts';

const PAGE_URL = 'https://songdocomputerpark-lang.github.io/ai-physical-computing/labs/vision/';

/** 실습실 예제와 비슷한 길이·모양의 코드(한글 주석, 들여쓰기, 여러 줄) */
const SAMPLE_CODE = [
  'import cv2',
  '',
  'cap = cv2.VideoCapture(0)  # 카메라 열기',
  'threshold = 100     # @slider 0 255 1',
  'while True:',
  '    ok, frame = cap.read()',
  '    if not ok:',
  '        break',
  '    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)',
  "    cv2.imshow('결과', gray)",
  "    if cv2.waitKey(1) == ord('q'):",
  '        break',
  'cap.release()',
  '',
].join('\n');

describe('압축과 복원', () => {
  it('한글·들여쓰기·빈 줄·이모지가 든 코드가 그대로 돌아온다', () => {
    for (const code of [SAMPLE_CODE, "print('안녕 🙂')\n", '\t탭\n  두 칸\n', '', 'x = 1']) {
      const packed = encodeShareCode(code);
      expect(packed).toMatch(/^[A-Za-z0-9+\-$]*$/u);
      expect(decodeShareCode(packed), code).toBe(code);
    }
  });

  it('주소에 넣을 수 없는 글자나 망가진 값은 null', () => {
    expect(decodeShareCode('')).toBeNull();
    expect(decodeShareCode('한글')).toBeNull();
    expect(decodeShareCode('abc def')).toBeNull();
    expect(decodeShareCode('%%%')).toBeNull();
  });

  it('예제 50줄 안팎은 압축하면 2,000자 경고보다 훨씬 짧다(길이 한계 근거)', () => {
    const packed = encodeShareCode(SAMPLE_CODE.repeat(4));
    expect(packed.length).toBeLessThan(SHARE_URL_WARN_LENGTH);
  });
});

describe('# 값 읽기', () => {
  it('#code=…&ex=… 를 읽고, 압축값의 +를 공백으로 바꾸지 않는다', () => {
    const code = "print('++ 더하기 ++')\n".repeat(20);
    const packed = encodeShareCode(code);
    expect(packed).toContain('+');
    const parsed = parseShareHash(`#code=${packed}&ex=v1-pixels`);
    expect(parsed.code).toBe(code);
    expect(parsed.example).toBe('v1-pixels');
    expect(parsed.broken).toBe(false);
    expect(parseShareHash(`ex=v1-pixels&code=${packed}`).code).toBe(code);
  });

  it('망가진 code 값은 broken으로 알리고, 모양이 틀린 예제 id는 버린다', () => {
    const parsed = parseShareHash('#code=한글&ex=../etc');
    expect(parsed.code).toBeUndefined();
    expect(parsed.example).toBeUndefined();
    expect(parsed.broken).toBe(true);
    expect(parseShareHash('#other=1')).toEqual({ broken: false });
    expect(parseShareHash('')).toEqual({ broken: false });
  });

  it('hasShareHash는 code= 가 있는 #만 참', () => {
    expect(hasShareHash('#code=abc')).toBe(true);
    expect(hasShareHash('#ex=a&code=abc')).toBe(true);
    expect(hasShareHash('#codex=abc')).toBe(false);
    expect(hasShareHash('#section')).toBe(false);
    expect(hasShareHash('')).toBe(false);
  });
});

describe('공유 링크 만들기', () => {
  it('지금 페이지 주소의 ?와 #을 지우고 #code=…&ex=… 를 붙이며, 새 탭에서 열면 같은 코드가 나온다', () => {
    const link = buildShareLink(`${PAGE_URL}?example=vision/u1/a.py#old`, SAMPLE_CODE, 'v1-pixels');
    expect(link.url.startsWith(`${PAGE_URL}#code=`)).toBe(true);
    expect(link.url).not.toContain('?');
    expect(link.url.endsWith('&ex=v1-pixels')).toBe(true);
    expect(link.length).toBe(link.url.length);
    expect(link.warning).toBeNull();
    const reopened = parseShareHash(new URL(link.url).hash);
    expect(reopened.code).toBe(SAMPLE_CODE);
    expect(reopened.example).toBe('v1-pixels');
  });

  it('예제 id가 없거나 모양이 틀리면 ex= 를 붙이지 않는다', () => {
    expect(buildShareLink(PAGE_URL, 'x = 1', null).url).not.toContain('&ex=');
    expect(buildShareLink(PAGE_URL, 'x = 1', 'Bad Id').url).not.toContain('&ex=');
  });

  it('경고 길이를 넘으면 .py 내려받기를 함께 안내하고, 상한을 넘으면 한국어 오류를 던진다', () => {
    const longCode = Array.from({ length: 400 }, (_, index) => `value_${index} = ${Math.random()}  # 무작위 값 ${index}`).join('\n');
    const link = buildShareLink(PAGE_URL, longCode, null);
    expect(link.length).toBeGreaterThan(SHARE_URL_WARN_LENGTH);
    expect(link.warning).toContain('.py 내려받기');
    expect(shareLengthWarning(SHARE_URL_WARN_LENGTH)).toBeNull();
    expect(shareLengthWarning(SHARE_URL_WARN_LENGTH + 1)).toContain('자로 길어요');

    const hugeCode = Array.from({ length: 6000 }, (_, index) => `value_${index} = ${Math.random()}`).join('\n');
    expect(() => buildShareLink(PAGE_URL, hugeCode, null)).toThrow(ShareTooLongError);
    try {
      buildShareLink(PAGE_URL, hugeCode, null);
    } catch (error) {
      expect(error).toBeInstanceOf(ShareTooLongError);
      expect((error as ShareTooLongError).length).toBeGreaterThan(SHARE_URL_MAX_LENGTH);
      expect((error as Error).message).toContain('너무 길어서');
      expect((error as Error).message).toContain('.py 내려받기');
    }
  });
});

// ── 판 1.1.0(PROGRESS 미해결 138): 어느 칸의 코드인지(lab=) — 한 쪽에 실습실 틀이 둘인 4단원 통합 화면 ──

/** 문서 차례대로 놓인 가짜 칸(예제 id·파일 목록) */
function fakeLab(labId: string, examples: readonly { id: string; file: string }[]): LabOnPage {
  return {
    labId,
    hasExample: (id) => examples.some((example) => example.id === id),
    hasFile: (file) => examples.some((example) => example.file === file),
  };
}

describe('공유 링크의 lab= 과 받을 칸 고르기', () => {
  it('lab= 을 싣고 되읽는다(code= 는 늘 맨 앞 — 옛 링크 모양과 같다), 모양이 틀린 실습실 id는 싣지도 읽지도 않는다', () => {
    const link = buildShareLink(PAGE_URL, SAMPLE_CODE, 'u4-a', 'esp32');
    expect(link.url.startsWith(`${PAGE_URL}#code=`)).toBe(true);
    expect(link.url.endsWith('&ex=u4-a&lab=esp32')).toBe(true);
    const reopened = parseShareHash(new URL(link.url).hash);
    expect(reopened).toMatchObject({ code: SAMPLE_CODE, example: 'u4-a', lab: 'esp32', broken: false });
    expect(buildShareLink(PAGE_URL, 'x = 1', null, 'Bad Lab').url).not.toContain('lab=');
    expect(parseShareHash('#code=abc&lab=../x').lab).toBeUndefined();
    // 예제 없이 칸만(빈 편집칸에서 만든 링크)
    expect(buildShareLink(PAGE_URL, 'x = 1', null, 'vision').url).toMatch(/#code=[^&]+&lab=vision$/u);
  });

  const pc = fakeLab('vision', [
    { id: 'u4-a', file: 'vision/u4/a.py' },
    { id: 'same', file: 'vision/u4/same.py' },
  ]);
  const board = fakeLab('esp32', [
    { id: 'u4-b', file: 'esp32/u4/b.py' },
    { id: 'same', file: 'esp32/u4/same.py' },
  ]);

  it('칸이 하나면 lab= 이 달라도 그 칸이 받는다(옛 링크·다른 실습실의 링크도 연다)', () => {
    expect(pickShareLab({ lab: 'esp32' }, [pc])).toBe(0);
    expect(pickShareLab({}, [pc])).toBe(0);
    expect(pickShareLab({}, [])).toBe(-1);
  });

  it('칸이 여럿이면 lab= 칸 → (옛 링크) ex= 예제를 가진 칸이 하나뿐일 때 그 칸 → 첫 칸', () => {
    expect(pickShareLab({ lab: 'esp32' }, [pc, board])).toBe(1);
    expect(pickShareLab({ lab: 'vision', example: 'u4-b' }, [pc, board])).toBe(0); // lab= 이 먼저
    expect(pickShareLab({ example: 'u4-b' }, [pc, board])).toBe(1);
    expect(pickShareLab({ example: 'u4-a' }, [pc, board])).toBe(0);
    expect(pickShareLab({ example: 'same' }, [pc, board])).toBe(0); // 모호하면 첫 칸
    expect(pickShareLab({ example: 'none' }, [pc, board])).toBe(0);
    expect(pickShareLab({ lab: 'iot' }, [pc, board])).toBe(0); // 이 쪽에 없는 실습실이면 옛 규칙으로
    expect(pickShareLab({ lab: 'iot', example: 'u4-b' }, [pc, board])).toBe(1);
  });

  it('?example=은 그 파일을 가진 첫 칸이 받고, 어느 칸에도 없으면 -1', () => {
    expect(pickExampleLab('esp32/u4/b.py', [pc, board])).toBe(1);
    expect(pickExampleLab('vision/u4/a.py', [pc, board])).toBe(0);
    expect(pickExampleLab('vision/u1/none.py', [pc, board])).toBe(-1);
  });
});
