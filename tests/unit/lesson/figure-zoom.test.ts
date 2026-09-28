// 차시 그림 [그림 크게 보기]의 크게 보기 창(src/components/lesson/figure-zoom.ts — 1.1.0 교실 사용성 검토 사소 4) 순수 함수.
// 실제 창(휴대폰에서 누르면 본문 그림보다 크게, Esc로 닫으면 링크로 초점)은 tests/e2e/lesson-figures.spec.ts가 본다.
import { describe, expect, it } from 'vitest';
import { ZOOM_MAX_WIDTH, ZOOM_SCALE, isSvgHref, zoomDisplayWidth } from '../../../src/components/lesson/figure-zoom.ts';

describe('크게 보기 폭(zoomDisplayWidth)', () => {
  it('본문 폭의 ZOOM_SCALE배와 그림 원래 폭 가운데 큰 것 — 휴대폰 본문(343px)보다 늘 크다', () => {
    // 좁은 화면용 그림(폭 360)을 본문 343px로 보던 휴대폰 → 549px(글자 13px → 약 20px)
    expect(zoomDisplayWidth(360, 343)).toBe(Math.round(343 * ZOOM_SCALE));
    // 원래 그림(폭 640)을 본문 343px로 보던 휴대폰 → 원래 폭 640px(글자 16px — 본문 8.6px의 거의 두 배)
    expect(zoomDisplayWidth(640, 343)).toBe(640);
    expect(zoomDisplayWidth(640, 343)).toBeGreaterThan(343 * 1.5);
  });

  it('상한을 넘지 않고, 잴 수 없으면(0·NaN) 상한으로', () => {
    expect(zoomDisplayWidth(4000, 900)).toBe(ZOOM_MAX_WIDTH);
    expect(zoomDisplayWidth(0, 0)).toBe(ZOOM_MAX_WIDTH);
    expect(zoomDisplayWidth(Number.NaN, 300)).toBe(Math.round(300 * ZOOM_SCALE));
  });
});

describe('크게 보기 창으로 여는 링크(isSvgHref)', () => {
  it('사이트가 그린 SVG만(사진은 전처럼 파일을 연다 — 휴대폰 브라우저가 화면 폭에 맞춰 보여 줌)', () => {
    expect(isSvgHref('/ai-physical-computing/images/lessons/1-1-1/agent-cycle.svg')).toBe(true);
    expect(isSvgHref('/images/a.SVG?v=2')).toBe(true);
    expect(isSvgHref('/images/lessons/1-1-1/photo.webp')).toBe(false);
    expect(isSvgHref('/images/a.svg.webp')).toBe(false);
    expect(isSvgHref(null)).toBe(false);
  });
});
