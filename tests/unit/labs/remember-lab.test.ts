// @vitest-environment jsdom
// 지금 연 실습실을 기억하기(src/components/lab/remember-lab.ts) — 홈 "이어서 하기"가 읽는 마지막 실습실.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isEmbedded, labTitleFromDocument, rememberCurrentLab } from '../../../src/components/lab/remember-lab.ts';
import { emptyProgress, readProgress } from '../../../src/lib/progress.ts';
import { clearOurs } from '../../../src/lib/storage.ts';

function page(html: string, title = '영상처리 실습실 | 사이트'): void {
  document.documentElement.removeAttribute('data-embed');
  document.title = title;
  document.body.innerHTML = html;
}

describe('실습실 기억하기', () => {
  beforeEach(() => {
    clearOurs();
  });
  afterEach(() => {
    clearOurs();
    document.documentElement.removeAttribute('data-embed');
  });

  it('쪽 제목(h1)을 이름으로 쓰고 없으면 <title> 앞부분을 쓴다', () => {
    page('<h1 class="page-title"> 영상처리   실습실 </h1>');
    expect(labTitleFromDocument()).toBe('영상처리 실습실');
    page('<p>제목 없음</p>', 'ESP32 실습실 | 사이트');
    expect(labTitleFromDocument()).toBe('ESP32 실습실');
  });

  it('주소(base 포함)와 이름을 저장하고 홈이 읽을 수 있다', () => {
    page('<h1>영상처리 실습실</h1>');
    expect(rememberCurrentLab(document, '/ai-physical-computing/labs/vision/')).toBe(true);
    const state = readProgress();
    expect(state.lastLab?.path).toBe('/ai-physical-computing/labs/vision/');
    expect(state.lastLab?.title).toBe('영상처리 실습실');
    expect(state.seen).toEqual([]);
  });

  it('차시 안 임베드(?embed=1)에서는 기억하지 않는다', () => {
    page('<h1>영상처리 실습실</h1>');
    document.documentElement.dataset.embed = '1';
    expect(isEmbedded()).toBe(true);
    expect(rememberCurrentLab(document, '/ai-physical-computing/labs/vision/')).toBe(false);
    expect(readProgress()).toEqual(emptyProgress());
  });

  it('사이트 안 경로가 아니거나 제목이 없으면 기억하지 않는다', () => {
    page('', '');
    expect(rememberCurrentLab(document, '/labs/vision/')).toBe(false);
    page('<h1>영상처리 실습실</h1>');
    expect(rememberCurrentLab(document, 'https://example.invalid/labs/')).toBe(false);
    expect(readProgress().lastLab).toBeNull();
  });
});
