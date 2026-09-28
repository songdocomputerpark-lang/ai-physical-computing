// @vitest-environment jsdom
// 가상 데스크톱의 "페이지 기본 크기"(src/lab/modules/desktop/index.ts pageDefaultScreen — 판 1.1.0, PROGRESS 미해결 138).
// 4단원 통합 화면이 컴퓨터 칸 조상에 data-desktop-screen-default="3840x2160"을 적으면 모듈이 그 크기로 열고 기억하지 않는다
// (그 쪽만의 우회 — 선택 상자를 바꾼 뒤 기억값을 되돌리기 — 를 걷어냈다). 실제 화면은 tests/e2e/unit4.spec.ts가 본다.
import { describe, expect, it } from 'vitest';
import { SCREEN_DEFAULT_ATTRIBUTE, pageDefaultScreen } from '../../../src/lab/modules/desktop/index.ts';

describe('pageDefaultScreen', () => {
  it('실습실 칸이나 그 조상에 적힌 크기를 읽는다(선택지에 있는 값만)', () => {
    document.body.innerHTML = `<section ${SCREEN_DEFAULT_ATTRIBUTE}="3840x2160"><div data-lab><p id="inside"></p></div></section>`;
    expect(pageDefaultScreen(document.querySelector('[data-lab]'))).toEqual({ width: 3840, height: 2160 });
    expect(pageDefaultScreen(document.getElementById('inside'))).toEqual({ width: 3840, height: 2160 });
  });

  it('적지 않았거나 선택지에 없는 값이면 null(기억해 둔 크기·1920×1080 차례 그대로)', () => {
    document.body.innerHTML = '<div data-lab></div>';
    expect(pageDefaultScreen(document.querySelector('[data-lab]'))).toBeNull();
    document.body.innerHTML = `<div data-lab ${SCREEN_DEFAULT_ATTRIBUTE}="1234x567"></div>`;
    expect(pageDefaultScreen(document.querySelector('[data-lab]'))).toBeNull();
    expect(pageDefaultScreen(null)).toBeNull();
  });
});
