// 실물 점검 도우미 항목 목록 규칙(P3-11) — 순수 데이터라 DOM 없이 본다.
import { describe, expect, it } from 'vitest';
import { CHECK_ITEMS, totalMinutes, wiringItems } from '../../../src/lab/esp32/check/items.ts';
import { PART_DEFINITIONS, resolveWiring } from '../../../src/lab/modules/board/parts.ts';
import { BOARD_LIBRARIES } from '../../../src/lab/esp32/board-library-files.ts';
import { librariesNeededBy } from '../../../src/lab/esp32/board-libraries.ts';

describe('실물 점검 도우미 항목', () => {
  it('id·부록 B-2 번호·질문 id가 겹치지 않고, 예상 시간이 1분 이상이다', () => {
    const ids = CHECK_ITEMS.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of CHECK_ITEMS) {
      expect(item.b2).toBeGreaterThan(0);
      expect(item.minutes).toBeGreaterThanOrEqual(1);
      expect(item.questions.length).toBeGreaterThan(0);
      const questionIds = item.questions.map((question) => question.id);
      expect(new Set(questionIds).size, item.id).toBe(questionIds.length);
    }
    // 부록 B-2 Phase 3 항목(6·9~14·16)과 P3-07·P3-08 요청(17~23)을 모두 다룬다
    const covered = new Set(CHECK_ITEMS.map((item) => item.b2));
    for (const number of [6, 9, 10, 11, 12, 13, 14, 16, 17, 18, 19, 20, 21, 22, 23]) {
      expect(covered.has(number), `부록 B-2 ${number}번`).toBe(true);
    }
  });

  it('글은 고1이 읽을 한국어 해요체다(제목·왜·질문)', () => {
    for (const item of CHECK_ITEMS) {
      expect(item.title.length, item.id).toBeLessThanOrEqual(40);
      expect(item.why, item.id).toMatch(/[요다]\.$/u);
      for (const question of item.questions) {
        // 물음표로 끝나거나, 물음 뒤에 괄호 보기가 붙는다("…보였나요? (Windows는 …)")
        expect(question.text, `${item.id}:${question.id}`).toMatch(/\?(\s*\(.+\))?$/u);
      }
    }
  });

  it('코드는 실물 MicroPython 이름만 쓰고 끝없는 반복이 없다', () => {
    for (const item of CHECK_ITEMS) {
      expect(item.code.trim(), item.id).not.toBe('');
      // 사이트 흉내 전용 이름(apc_*)이나 컴퓨터용 패키지를 쓰지 않는다
      expect(item.code, item.id).not.toMatch(/\bapc_|\bcv2\b|\bnumpy\b|\bpyautogui\b/u);
      // while True는 [정지]를 눌러야 끝나므로 쓰지 않는다(items.ts 규칙)
      expect(item.code, item.id).not.toMatch(/while\s+True/u);
    }
  });

  it('배선은 실제 부품 정의로 풀리고 오류가 없다', () => {
    for (const item of wiringItems()) {
      const resolved = resolveWiring(item.wiring, PART_DEFINITIONS);
      expect(resolved.unknown, item.id).toEqual([]);
      expect(
        resolved.issues.filter((issue) => issue.level === 'error').map((issue) => issue.text),
        item.id,
      ).toEqual([]);
      for (const entry of item.wiring) {
        expect(PART_DEFINITIONS.has(entry.part), `${item.id}: ${entry.part}`).toBe(true);
      }
    }
  });

  it('libraries에 적은 이름은 실제 보드 라이브러리이고 코드가 그것을 부른다', () => {
    const names = new Set(BOARD_LIBRARIES.map((library) => library.name));
    for (const item of CHECK_ITEMS) {
      for (const name of item.libraries ?? []) {
        expect(names.has(name), `${item.id}: ${name}`).toBe(true);
      }
      const needed = librariesNeededBy(item.code, BOARD_LIBRARIES).map((library) => library.name);
      expect(new Set(needed), item.id).toEqual(new Set(item.libraries ?? []));
    }
  });

  it('예상 시간 합계는 부록 B-2의 어림값(약 2시간)과 가깝다', () => {
    const total = totalMinutes();
    expect(total).toBeGreaterThanOrEqual(90);
    expect(total).toBeLessThanOrEqual(150);
  });
});
