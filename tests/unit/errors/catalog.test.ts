// 오류 사전 데이터(content/help/errors/errors.yaml)와 그 검사기(src/lab/errors/catalog-schema.ts) 단위 테스트.
//
// 두 가지를 본다.
//  ① 실제 데이터 파일이 규칙에 맞고, PLAN §8.2 P2-06이 요구한 오류 15가지 이상을 담고 있는지(교사가 항목을 더해도 계속 통과해야 한다).
//  ② 형식이 틀린 데이터를 넣으면 어디가 틀렸는지 한국어로 알려 주는지(빌드가 멈춰 바로 고칠 수 있게).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CATALOG_FILE, cardCatalog, catalogJson, loadCatalogFromYaml } from '../../../src/lab/errors/catalog-build.ts';
import { CatalogFormatError, catalogFromJson, entriesByGroup, normalizeCatalog } from '../../../src/lab/errors/catalog-schema.ts';
import { explain } from '../../../src/lab/errors/explain.ts';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const source = fs.readFileSync(path.join(ROOT, CATALOG_FILE), 'utf8');
const catalog = loadCatalogFromYaml(source);

/** PLAN §8.2 P2-06이 이름을 대어 요구한 오류들 — 항목 id로 찾는다. */
const REQUIRED_ENTRY_IDS = [
  'name-error',
  'indentation-expected',
  'indentation-unexpected',
  'syntax-error',
  'type-error',
  'attribute-error',
  'index-error',
  'key-error',
  'value-error',
  'zero-division',
  'module-not-found',
  'module-not-found-site',
  'cv2-channels',
  'cv2-empty-image',
  'keyboard-interrupt',
  'failsafe',
  'forced-restart',
];

describe('오류 사전 데이터', () => {
  it('규칙에 맞고 항목이 15개보다 많다', () => {
    expect(catalog.entries.length).toBeGreaterThanOrEqual(15);
    expect(catalog.groups.length).toBeGreaterThanOrEqual(4);
    expect(new Set(catalog.entries.map((entry) => entry.id)).size).toBe(catalog.entries.length);
    expect(catalog.entries.filter((entry) => entry.fallback)).toHaveLength(1);
  });

  it('PLAN P2-06이 이름을 댄 오류가 모두 들어 있다', () => {
    const ids = new Set(catalog.entries.map((entry) => entry.id));
    const missing = REQUIRED_ENTRY_IDS.filter((id) => !ids.has(id));
    expect(missing).toEqual([]);
  });

  it('모든 묶음에 항목이 있고, 모든 항목이 있는 묶음에 속한다', () => {
    const groups = entriesByGroup(catalog);
    expect(groups.map((item) => item.group.id)).toEqual(catalog.groups.map((group) => group.id));
    for (const item of groups) {
      expect(item.entries.length, item.group.id).toBeGreaterThan(0);
    }
    const groupIds = new Set(catalog.groups.map((group) => group.id));
    for (const entry of catalog.entries) {
      expect(groupIds.has(entry.group), entry.id).toBe(true);
    }
  });

  it('학생이 읽는 글이 한국어이고 제목이 너무 길지 않다', () => {
    for (const entry of catalog.entries) {
      expect(entry.title.length, entry.id).toBeLessThanOrEqual(60);
      // 제목·뜻·고치는 법에는 한글이 들어간다(영어 메시지만 적어 두지 않게).
      for (const text of [entry.title, entry.meaning, ...entry.fix]) {
        expect(/[가-힣]/u.test(text), `${entry.id}: ${text}`).toBe(true);
      }
      // 고1이 읽는 글이라 "하십시오"체·반말을 쓰지 않는다(해요체).
      expect(entry.meaning, entry.id).not.toMatch(/(습니다|하십시오|해라)\b/u);
    }
  });

  it('보기(example)의 오류 줄이 그 항목의 패턴에 맞는다', () => {
    for (const entry of catalog.entries) {
      if (!entry.example || entry.patterns.length === 0) {
        continue;
      }
      const matched = entry.patterns.some((pattern) => new RegExp(pattern, 'u').test(entry.example!.error));
      expect(matched, `${entry.id}의 보기 오류 줄이 patterns에 맞지 않아요: ${entry.example.error}`).toBe(true);
    }
  });

  it('보기의 오류 줄 번호(example.line)는 보기 코드 안에 있다', () => {
    for (const entry of catalog.entries) {
      if (entry.example?.line != null) {
        expect(entry.example.line, entry.id).toBeLessThanOrEqual(entry.example.code.split('\n').length);
        expect(entry.example.line, entry.id).toBeGreaterThanOrEqual(1);
      }
    }
    // 줄 번호를 적은 보기가 있어야 사전 페이지의 "n번째 줄"이 맞는다(문법 오류처럼 마지막 줄이 아닌 경우).
    expect(catalog.entries.filter((entry) => entry.example?.line != null).length).toBeGreaterThan(0);
  });

  it('보기 줄 번호가 코드 밖이면 알려 준다', () => {
    const problems = (() => {
      try {
        normalizeCatalog(
          minimal({
            entries: [
              { id: 'bad-line', group: 'basic', title: '제목', meaning: '뜻', fix: ['고쳐요'], types: ['NameError'], example: { code: 'print(1)\n', error: 'NameError: x', line: 9 } },
              { id: 'unknown', group: 'basic', title: '마지막', fallback: true, meaning: '뜻', fix: ['고쳐요'] },
            ],
          }),
        );
      } catch (error) {
        return error instanceof CatalogFormatError ? error.problems : [];
      }
      return [];
    })();
    expect(problems.join('\n')).toContain('example.line은 보기 코드의 줄 번호');
  });

  it('실습실에 심는 사전(cardCatalog)은 더 작지만 같은 풀이를 고른다', () => {
    const card = cardCatalog(catalog);
    const fullJson = catalogJson(catalog);
    const cardJson = catalogJson(card);
    expect(cardJson.length).toBeLessThan(fullJson.length);
    expect(card.entries.map((entry) => entry.id)).toEqual(catalog.entries.map((entry) => entry.id));
    expect(card.entries.every((entry) => entry.example === null && entry.cases.length === 0)).toBe(true);
    // 되읽어도 형식 검사를 통과한다(화면 쪽이 catalogFromJson으로 읽는 길).
    expect(catalogFromJson(cardJson.replace(/\\u003c/gu, '<'))?.entries.length).toBe(catalog.entries.length);
    /*
     * 같은 오류에 같은 항목·같은 글이 나온다(뺀 필드는 항목을 고르는 데 쓰지 않는다).
     * **JSON으로 심었다가 되읽은 사전으로도** 본다 — 실습실 카드가 실제로 쓰는 길이다(2026-09-18: 이 길에서만
     * 트레이스백 조건이 사라져 학생의 일반 IndexError에 네오픽셀 풀이가 붙었다 — catalog-schema.ts가 두 이름을 모두 받는다).
     */
    const restoredCard = catalogFromJson(cardJson.replace(/\\u003c/gu, '<'));
    expect(restoredCard).not.toBeNull();
    const cases: { type: string; message: string; traceback: string }[] = [
      { type: 'NameError', message: "NameError: name 'total' is not defined", traceback: 'Traceback (most recent call last):\n  File "main.py", line 2, in <module>\n    print(total)\nNameError: name \'total\' is not defined' },
      { type: 'ZeroDivisionError', message: 'ZeroDivisionError: division by zero', traceback: 'Traceback (most recent call last):\n  File "main.py", line 1, in <module>\n    print(1 / 0)\nZeroDivisionError: division by zero' },
      { type: 'ModuleNotFoundError', message: "ModuleNotFoundError: No module named 'pyautogui'", traceback: 'Traceback (most recent call last):\n  File "main.py", line 1, in <module>\n    import pyautogui\nModuleNotFoundError: No module named \'pyautogui\'' },
      // 트레이스백 조건이 살아 있어야 맞는 항목이 나온다: 학생 코드의 목록 IndexError는 index-error,
      { type: 'IndexError', message: 'IndexError: list index out of range', traceback: 'Traceback (most recent call last):\n  File "main.py", line 2, in <module>\n    print(nums[5])\nIndexError: list index out of range' },
      // 네오픽셀 드라이버 안에서 난 것은 네오픽셀 풀이
      {
        type: 'IndexError',
        message: 'IndexError: tuple index out of range',
        traceback: 'Traceback (most recent call last):\n  File "main.py", line 4, in <module>\n  File "/apc/neopixel.py", line 40, in __setitem__\nIndexError: tuple index out of range',
      },
    ];
    for (const error of cases) {
      const full = explain(catalog, { outcome: 'error', error });
      const slim = explain(card, { outcome: 'error', error });
      const fromJson = explain(restoredCard, { outcome: 'error', error });
      expect(slim?.entry.id, error.message).toBe(full?.entry.id);
      expect(slim?.meaning, error.message).toBe(full?.meaning);
      expect(slim?.fix, error.message).toEqual(full?.fix);
      expect(fromJson?.entry.id, `JSON 되읽기: ${error.message}`).toBe(full?.entry.id);
    }
    expect(explain(catalog, { outcome: 'error', error: cases[3]! })?.entry.id).toBe('index-error');
    expect(explain(catalog, { outcome: 'error', error: cases[4]! })?.entry.id).toBe('board-neopixel-color-count');
  });

  it('JSON으로 심었다가 되읽어도 같다(화면 쪽이 읽는 길)', () => {
    const json = catalogJson(catalog);
    expect(json).not.toContain('</script');
    expect(json).not.toContain('<');
    const restored = catalogFromJson(json.replace(/\\u003c/gu, '<'));
    expect(restored?.entries.length).toBe(catalog.entries.length);
    expect(restored?.entries[0]?.id).toBe(catalog.entries[0]?.id);
    expect(catalogFromJson('')).toBeNull();
    expect(catalogFromJson('{ 망가진 JSON')).toBeNull();
  });
});

/** 검사기 테스트용 최소 데이터 */
function minimal(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    groups: [{ id: 'basic', title: '기본', description: '설명' }],
    entries: [
      { id: 'name-error', group: 'basic', title: '이름 오류', types: ['NameError'], meaning: '뜻', fix: ['고쳐요'] },
      { id: 'unknown', group: 'basic', title: '마지막', fallback: true, meaning: '뜻', fix: ['고쳐요'] },
    ],
    ...overrides,
  };
}

describe('데이터 형식 검사', () => {
  it('최소 데이터는 통과한다', () => {
    const result = normalizeCatalog(minimal());
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]?.priority).toBe(0);
    expect(result.entries[0]?.why).toEqual([]);
  });

  function problemsOf(raw: unknown): readonly string[] {
    try {
      normalizeCatalog(raw);
    } catch (error) {
      if (error instanceof CatalogFormatError) {
        return error.problems;
      }
      throw error;
    }
    return [];
  }

  it('id·묶음·필수 항목이 빠지면 어디가 문제인지 알려 준다', () => {
    const problems = problemsOf(
      minimal({
        entries: [
          { id: 'Bad Id', group: 'basic', title: '제목', meaning: '뜻', fix: ['고쳐요'], types: ['NameError'] },
          { id: 'no-group', group: '없는묶음', title: '제목', meaning: '뜻', fix: ['고쳐요'], types: ['NameError'] },
          { id: 'no-fix', group: 'basic', title: '제목', meaning: '뜻', types: ['NameError'] },
          { id: 'no-match', group: 'basic', title: '제목', meaning: '뜻', fix: ['고쳐요'] },
        ],
      }),
    );
    expect(problems.join('\n')).toContain('id는 영문 소문자로 시작');
    expect(problems.join('\n')).toContain('group은 groups에 적은 id');
    expect(problems.join('\n')).toContain('fix(고치는 법)');
    expect(problems.join('\n')).toContain('types나 patterns 가운데 하나는 적어요');
    expect(problems.join('\n')).toContain('fallback: true인 항목');
  });

  it('id가 겹치면 알려 준다', () => {
    const problems = problemsOf(
      minimal({
        entries: [
          { id: 'same', group: 'basic', title: '하나', meaning: '뜻', fix: ['고쳐요'], types: ['NameError'] },
          { id: 'same', group: 'basic', title: '둘', meaning: '뜻', fix: ['고쳐요'], types: ['TypeError'] },
          { id: 'unknown', group: 'basic', title: '마지막', fallback: true, meaning: '뜻', fix: ['고쳐요'] },
        ],
      }),
    );
    expect(problems.join('\n')).toContain('id가 두 번 있어요');
  });

  it('읽을 수 없는 정규식과 잘못된 자리·조사를 알려 준다', () => {
    const problems = problemsOf(
      minimal({
        entries: [
          { id: 'bad-pattern', group: 'basic', title: '제목', meaning: '뜻', fix: ['고쳐요'], types: ['NameError'], patterns: ['('] },
          { id: 'bad-placeholder', group: 'basic', title: '제목', meaning: '{missing}가 있어요', fix: ['고쳐요'], types: ['TypeError'] },
          { id: 'bad-particle', group: 'basic', title: '제목', meaning: '{line:는}', fix: ['고쳐요'], types: ['KeyError'] },
          { id: 'unknown', group: 'basic', title: '마지막', fallback: true, meaning: '뜻', fix: ['고쳐요'] },
        ],
      }),
    );
    expect(problems.join('\n')).toContain('정규식 "("');
    expect(problems.join('\n')).toContain('글의 자리 {missing}');
    expect(problems.join('\n')).toContain('조사는 은/는');
  });

  it('자리 이름은 영문이라 한글을 감싼 중괄호는 그냥 글자로 둔다', () => {
    // {값}처럼 한글을 감싼 것은 자리가 아니라 글자다(파이썬 사전 보기 등을 그대로 쓸 수 있게).
    expect(() => normalizeCatalog(minimal({
      entries: [
        { id: 'braces', group: 'basic', title: '제목', meaning: "사전은 {'도': 262}처럼 써요", fix: ['고쳐요'], types: ['KeyError'] },
        { id: 'unknown', group: 'basic', title: '마지막', fallback: true, meaning: '뜻', fix: ['고쳐요'] },
      ],
    }))).not.toThrow();
  });

  it('패턴의 이름 붙은 묶음은 글의 자리로 쓸 수 있다', () => {
    const result = normalizeCatalog(
      minimal({
        entries: [
          {
            id: 'with-group',
            group: 'basic',
            title: '제목',
            meaning: "이름 '{name}'을 찾지 못했어요",
            fix: ['{name:을/를} 정해요'],
            types: ['NameError'],
            patterns: ["name '(?<name>[^']+)' is not defined"],
          },
          { id: 'unknown', group: 'basic', title: '마지막', fallback: true, meaning: '뜻', fix: ['고쳐요'] },
        ],
      }),
    );
    expect(result.entries[0]?.patterns).toHaveLength(1);
  });

  it('YAML이 망가지면 파일 이름과 함께 알려 준다', () => {
    expect(() => loadCatalogFromYaml('entries: [\n  - id: a\n   bad indent')).toThrowError(new RegExp(CATALOG_FILE.replace(/[/.]/gu, '\\$&'), 'u'));
  });
});
