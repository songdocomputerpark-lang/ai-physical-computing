// 교과서 쪽의 매체 표시(src/components/book/book-media.ts, 판 1.6.0 R6): 한 줄 범례는 "없으면 어떻게 하나"를 함께 적는다(걷기 보고 B-59 — 카메라 꼬리표를 보고 웹캠을 사야 하는 줄 알았다).
import { describe, expect, it } from 'vitest';
import { BOOK_MEDIA_INFO, BOOK_MEDIA_ORDER, mediaLegendText } from '../../../src/components/book/book-media.ts';

describe('매체 범례', () => {
  it('한 줄 범례는 카메라·마이크·보드에 "없으면"의 길을 적는다', () => {
    expect(mediaLegendText()).toBe('카메라(없으면 샘플 영상) · 마이크(없으면 글자 입력) · 인터넷 · 보드(없으면 화면 속 보드)');
  });

  it('칩 글자(label)는 짧은 이름 그대로다 — 차시 카드 꼬리표에는 풀이를 붙이지 않는다', () => {
    expect(BOOK_MEDIA_ORDER.map((key) => BOOK_MEDIA_INFO[key].label)).toEqual(['카메라', '마이크', '인터넷', '보드']);
  });

  it('모든 매체에 풀이(legend)가 있고 label로 시작한다', () => {
    for (const key of BOOK_MEDIA_ORDER) {
      expect(BOOK_MEDIA_INFO[key].legend.startsWith(BOOK_MEDIA_INFO[key].label), key).toBe(true);
    }
  });
});
