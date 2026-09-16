// 실습실 공통 조작의 순수 논리 단위 테스트 — 예제 목록(examples.ts), 글자 크기(editor/font-size.ts), 기록 지우기(records.ts), 파일 이름(download.ts).
// 화면 논리(lab-shell.ts)와 에디터는 브라우저 테스트(tests/e2e/lab-editor.spec.ts)에서 확인한다.
import { describe, expect, it } from 'vitest';
import { safeFileName } from '../../../src/lab/controls/download.ts';
import {
  DEFAULT_FILE_NAME,
  SCRATCH_EXAMPLE_ID,
  assertValidExamples,
  exampleFileName,
  findExample,
  findExampleByFile,
  isValidExampleFile,
  validateExamples,
  type LabExample,
} from '../../../src/lab/controls/examples.ts';
import { CLEAR_RECORDS_LABEL, clearAllRecords, describeCleared } from '../../../src/lab/controls/records.ts';
import {
  DEFAULT_FONT_SIZE_PX,
  FONT_SIZE_STEPS_PX,
  FONT_SIZE_STORAGE_NAME,
  canStepFontSize,
  clampFontSize,
  fontSizeCss,
  readFontSize,
  saveFontSize,
  stepFontSize,
} from '../../../src/lab/editor/font-size.ts';
import { STORAGE_KEY_PREFIX, storageKey, type KeyedStorageLike } from '../../../src/lib/storage.ts';

class MemoryStorage implements KeyedStorageLike {
  readonly values = new Map<string, string>();
  get length(): number {
    return this.values.size;
  }
  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }
  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const EXAMPLES: LabExample[] = [
  { id: 'v1-pixels', title: '사진은 숫자다', code: 'print(1)\n', file: 'vision/u1/v1-pixels.py' },
  { id: 'hello', title: '인사', code: "print('안녕')\n" },
];

describe('예제 목록', () => {
  it('id·file로 찾고, 내려받기 파일 이름을 만든다', () => {
    expect(findExample(EXAMPLES, 'hello')?.title).toBe('인사');
    expect(findExample(EXAMPLES, 'none')).toBeUndefined();
    expect(findExample(EXAMPLES, null)).toBeUndefined();
    expect(findExampleByFile(EXAMPLES, 'vision/u1/v1-pixels.py')?.id).toBe('v1-pixels');
    expect(findExampleByFile(EXAMPLES, undefined)).toBeUndefined();
    expect(exampleFileName(EXAMPLES[0])).toBe('v1-pixels.py');
    expect(exampleFileName(EXAMPLES[1])).toBe('hello.py');
    expect(exampleFileName(null)).toBe(DEFAULT_FILE_NAME);
  });

  it('빈 목록은 통과하고, id 규칙·중복·file 모양을 검사한다', () => {
    expect(validateExamples([])).toEqual([]);
    expect(validateExamples(EXAMPLES)).toEqual([]);
    expect(() => assertValidExamples(EXAMPLES)).not.toThrow();
    const bad: LabExample[] = [
      { id: 'Bad Id', title: 'x', code: '' },
      { id: 'hello', title: '', code: '' },
      { id: 'hello', title: 'y', code: '', file: '../secret.py' },
      { id: SCRATCH_EXAMPLE_ID, title: 'z', code: '' },
    ];
    const errors = validateExamples(bad);
    expect(errors).toHaveLength(5);
    expect(errors[0]).toContain('영문 소문자');
    expect(errors[1]).toContain('title');
    expect(errors[2]).toContain('겹쳐요');
    expect(errors[3]).toContain('examples/');
    expect(() => assertValidExamples(bad)).toThrow(/예제 목록에 문제/u);
  });

  it('examples/ 경로 모양', () => {
    expect(isValidExampleFile('vision/u1/1-2-1-flip.py')).toBe(true);
    expect(isValidExampleFile('esp32/lib/third-party/i2c_lcd.py')).toBe(true);
    expect(isValidExampleFile('vision/../x.py')).toBe(false);
    expect(isValidExampleFile('vision/a.txt')).toBe(false);
    expect(isValidExampleFile('한글.py')).toBe(false);
  });
});

describe('글자 크기', () => {
  it('단계 안에서만 오르내리고 끝에서는 그대로다', () => {
    expect(FONT_SIZE_STEPS_PX).toContain(DEFAULT_FONT_SIZE_PX);
    expect(stepFontSize(15, 1)).toBe(17);
    expect(stepFontSize(15, -1)).toBe(13);
    expect(stepFontSize(13, -1)).toBe(13);
    expect(stepFontSize(24, 1)).toBe(24);
    expect(canStepFontSize(13, -1)).toBe(false);
    expect(canStepFontSize(13, 1)).toBe(true);
    expect(clampFontSize(16)).toBe(15);
    expect(clampFontSize(19)).toBe(20);
    expect(clampFontSize(Number.NaN)).toBe(DEFAULT_FONT_SIZE_PX);
    expect(fontSizeCss(16)).toBe('0.9375rem');
    expect(fontSizeCss(24)).toBe('1.5rem');
  });

  it('저장 이름 규칙으로 저장하고 읽으며, 이상한 값은 기본값', () => {
    const storage = new MemoryStorage();
    expect(readFontSize(storage)).toBe(DEFAULT_FONT_SIZE_PX);
    expect(saveFontSize(20, storage)).toBe(true);
    expect(storage.getItem(storageKey(FONT_SIZE_STORAGE_NAME))).toBe('20');
    expect(readFontSize(storage)).toBe(20);
    storage.setItem(storageKey(FONT_SIZE_STORAGE_NAME), '99');
    expect(readFontSize(storage)).toBe(DEFAULT_FONT_SIZE_PX);
    expect(readFontSize(null)).toBe(DEFAULT_FONT_SIZE_PX);
    expect(saveFontSize(17, null)).toBe(false);
  });
});

describe('기록 지우기', () => {
  it('localStorage·sessionStorage에서 이 사이트의 이름만 지우고 개수를 센다', () => {
    const local = new MemoryStorage();
    const session = new MemoryStorage();
    local.setItem(`${STORAGE_KEY_PREFIX}editor:vision:v1`, 'print(1)');
    local.setItem(`${STORAGE_KEY_PREFIX}editor:font-size`, '17');
    local.setItem('other-site:token', 'keep');
    session.setItem(`${STORAGE_KEY_PREFIX}mqtt:prefix`, 'abc');
    session.setItem('other-site:session', 'keep');
    expect(clearAllRecords({ local, session })).toBe(3);
    expect([...local.values.keys()]).toEqual(['other-site:token']);
    expect([...session.values.keys()]).toEqual(['other-site:session']);
    expect(clearAllRecords({ local, session })).toBe(0);
    expect(clearAllRecords({ local: null, session: null })).toBe(0);
  });

  it('안내 문장', () => {
    expect(CLEAR_RECORDS_LABEL).toBe('이 컴퓨터에서 내 기록 지우기');
    expect(describeCleared(0)).toContain('지울 기록이 없었어요');
    expect(describeCleared(3)).toBe('기록 3개를 지웠어요.');
  });
});

describe('내려받기 파일 이름', () => {
  it('경로 구분자·따옴표·제어 문자를 -로 바꾸고 빈 이름은 기본값', () => {
    expect(safeFileName('1-2-1-flip.py')).toBe('1-2-1-flip.py');
    expect(safeFileName('a/b\\c:d*e?f"g<h>i|j.py')).toBe('a-b-c-d-e-f-g-h-i-j.py');
    expect(safeFileName('  ')).toBe('main.py');
    expect(safeFileName('...hidden.py')).toBe('hidden.py');
    expect(safeFileName('', 'x.py')).toBe('x.py');
  });
});
