/**
 * [이 컴퓨터에서 내 기록 지우기](PLAN §8.2 P2-02, §10 "브라우저 저장", SPEC 원칙 2).
 *
 * 로그인이 없는 대신 자동 저장 코드·글자 크기 같은 설정이 브라우저 저장 공간(localStorage)에 남는다.
 * 학교 실습실의 공용 PC에서는 다음 반 학생에게 그 기록이 보일 수 있으므로 한 번에 지우는 버튼을 둔다.
 * 지우는 범위는 이 사이트의 이름(머리말 ai-physical-computing:)뿐이다 — 같은 GitHub Pages 출처를 쓰는 다른 사이트의
 * 기록은 건드리지 않는다(src/lib/storage.ts의 clearOurs). 탭을 닫으면 사라지는 sessionStorage(통신 실습의 무작위 이름 등)도
 * 같은 규칙으로 함께 지운다.
 *
 * 버튼·확인 대화는 src/components/lab/ClearRecordsButton.astro, 실습실 화면은 src/lab/controls/lab-shell.ts가 쓴다.
 */
import { clearOurs, type KeyedStorageLike, type StorageSource } from '../../lib/storage.ts';

/** 버튼 이름(문서·안내와 같은 글자) */
export const CLEAR_RECORDS_LABEL = '이 컴퓨터에서 내 기록 지우기';

/** 확인 대화의 설명 */
export const CLEAR_RECORDS_CONFIRM_TEXT =
  '이 브라우저에 자동 저장된 코드와 설정을 모두 지워요. 지운 기록은 되돌릴 수 없어요. 계속할까요?';

/** 공용 PC 안내(버튼 옆에 늘 보인다) */
export const CLEAR_RECORDS_HINT =
  '여러 사람이 함께 쓰는 컴퓨터에서는 수업이 끝날 때 눌러 주세요. 다음 사람에게 내 코드가 보이지 않게 돼요.';

/** 지우기가 끝났을 때 알리는 이름(document에 CustomEvent로 보낸다). detail: { removed: number } */
export const RECORDS_CLEARED_EVENT = 'apc:records-cleared';

export interface ClearRecordsSources {
  /** 기본 globalThis.localStorage */
  readonly local?: StorageSource;
  /** 기본 globalThis.sessionStorage */
  readonly session?: StorageSource;
}

function defaultSessionStorage(): KeyedStorageLike | null | undefined {
  return (globalThis as { sessionStorage?: KeyedStorageLike }).sessionStorage;
}

/**
 * 이 사이트의 기록을 localStorage·sessionStorage에서 지우고 지운 개수를 돌려준다.
 * 저장 공간을 못 쓰는 브라우저에서는 0을 돌려주고 오류를 내지 않는다.
 */
export function clearAllRecords(sources: ClearRecordsSources = {}): number {
  const local = 'local' in sources ? sources.local : undefined;
  const session = 'session' in sources ? sources.session : defaultSessionStorage;
  return clearOurs(local) + clearOurs(session);
}

/** 지운 개수를 사람이 읽는 문장으로 */
export function describeCleared(removed: number): string {
  return removed === 0
    ? '지울 기록이 없었어요. 이 브라우저에는 이 사이트의 기록이 남아 있지 않아요.'
    : `기록 ${removed}개를 지웠어요.`;
}
