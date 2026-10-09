/**
 * 지금 연 실습실을 기억한다(판 1.3.0 — 홈의 "이어서 하기"가 마지막 실습실 [다시 열기]를 보이려고 읽는다).
 *
 * 저장하는 것은 쪽 주소(base 포함)와 실습실 이름뿐이다(src/lib/progress.ts rememberLab — 개인정보 없음).
 * 차시 안에 끼워 넣은 실습실(?embed=1)은 실습실 쪽을 연 것이 아니므로 기억하지 않는다.
 * 저장이 막혀 있어도(사생활 보호 창 등) 조용히 넘어간다 — progress.ts가 저장 실패를 삼킨다.
 *
 * 실습실 쪽(영상 처리·ESP32·통신·4단원·대시보드)의 쪽 스크립트가 한 줄로 부른다. 실습실 라이브러리를 불러오지 않는 작은 파일이다.
 */
import { rememberLab } from '../../lib/progress.ts';
import type { StorageSource } from '../../lib/storage.ts';

/** 쪽 제목(<title>의 "제목 | 사이트 이름"에서 앞부분). 없으면 빈 글. */
export function labTitleFromDocument(doc: Document = document): string {
  const h1 = doc.querySelector('h1')?.textContent?.replace(/\s+/gu, ' ').trim();
  if (h1 !== undefined && h1 !== '') {
    return h1;
  }
  return (doc.title.split(' | ')[0] ?? '').trim();
}

/** 지금 쪽이 차시 안 임베드인지(BaseLayout이 html[data-embed]를 붙인다) */
export function isEmbedded(doc: Document = document): boolean {
  return doc.documentElement.dataset.embed !== undefined;
}

/** 지금 연 실습실을 기억한다. 기억했으면 true */
export function rememberCurrentLab(doc: Document = document, pathname: string = location.pathname, storage?: StorageSource): boolean {
  if (isEmbedded(doc)) {
    return false;
  }
  const title = labTitleFromDocument(doc);
  if (title === '') {
    return false;
  }
  const state = rememberLab({ path: pathname, title }, storage);
  return state.lastLab?.path === pathname;
}
