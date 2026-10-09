// 점검 표에 보이는 항목 이름(판 1.3.0 검수 R1-041) — 하는 일 이름이 먼저, 영어 이름은 보조.
// 복사 글에 쓰는 기술 이름(src/lib/capabilities.ts의 label)은 그대로 둔다.
import { describe, expect, it } from 'vitest';
import { checkDisplay, quickFixLine } from '../../../src/components/start/check-labels.ts';
import { CHECK_ITEMS } from '../../../src/lib/capabilities.ts';

describe('점검 표 항목 이름', () => {
  it('영어 약자가 이름인 네 항목은 하는 일 이름이 크게, 영어 이름이 보조로 간다', () => {
    const shown = Object.fromEntries(CHECK_ITEMS.map((item) => [item.id, checkDisplay(item.id, item.label)]));
    expect(shown['jspi']).toEqual({ name: '파이썬 기다리기 기능', tech: 'JSPI' });
    expect(shown['web-serial']).toEqual({ name: 'USB로 보드 연결', tech: 'Web Serial' });
    expect(shown['web-bluetooth']?.tech).toBe('Web Bluetooth');
    expect(shown['webassembly']?.tech).toBe('WebAssembly');
  });

  it('바꿀 필요가 없는 항목은 원래 이름 그대로이고, 보이는 이름에 영어 약자만 있는 항목은 없다', () => {
    for (const item of CHECK_ITEMS) {
      const shown = checkDisplay(item.id, item.label);
      expect(shown.name).toMatch(/[가-힣]/u);
      if (!shown.tech) {
        expect(shown.name).toBe(item.label);
      }
    }
  });

  it('미지원 한 줄은 누가 무엇을 하면 되는지 말한다(JSPI는 브라우저를 최신판으로)', () => {
    expect(quickFixLine('jspi')).toContain('최신판');
    expect(quickFixLine('screen')).toBe('');
  });
});
