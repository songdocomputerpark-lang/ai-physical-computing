/**
 * 블록 모드 → 가상 보드 배선 알림(PLAN §8.3 P3-06, PD-05 "예제별 배선").
 *
 * 블록 프로그램은 예제 목록에 없는 "내가 만든 코드"라, 가상 보드가 그릴 부품(터치 센서·버저 …)을 예제의 배선(LabExample.parts)으로 알 수 없다.
 * 그래서 블록 모드가 쓰는 부품의 배선을 실습실 뿌리 요소에 알린다:
 *   1. data-board-wiring-override 속성: 배선 목록 JSON(WiringEntry[]) — 보드 모듈이 나중에 붙어도 처음에 읽는다. 없애면 예제 배선으로 돌아감
 *   2. apc:board-wiring 이벤트(detail { source, entries }) — 바뀔 때마다. entries가 null이면 예제 배선으로 돌아감
 * 가상 보드 모듈(src/lab/modules/board/index.ts)이 이 둘을 읽어 예제 배선 대신 그린다(P3-11 통합에서 반영 — applyWiring·renderPractice).
 *
 * 순수 함수(같은 배선인지)는 DOM 없이 단위 테스트한다.
 */
import type { WiringEntry } from '../modules/board/part-types.ts';

/** 배선이 바뀔 때 뿌리 요소에 보내는 이벤트 이름 */
export const BOARD_WIRING_EVENT = 'apc:board-wiring';

/** 뿌리 요소에 적는 속성(data-board-wiring-override)의 dataset 이름 */
export const BOARD_WIRING_DATASET_KEY = 'boardWiringOverride';

/** 누가 알렸는지(dataset boardWiringSource) */
export const BOARD_WIRING_SOURCE_KEY = 'boardWiringSource';

export interface BoardWiringEventDetail {
  /** 알린 곳: 'blocks' */
  readonly source: string;
  /** 배선 목록. null이면 예제 배선으로 돌아간다 */
  readonly entries: readonly WiringEntry[] | null;
}

/** 두 배선 목록이 같은지(순서까지) */
export function sameWiring(a: readonly WiringEntry[] | null, b: readonly WiringEntry[] | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** 뿌리 요소의 속성에서 지금 알려 둔 배선을 읽는다(없거나 망가졌으면 null) */
export function readAnnouncedWiring(root: HTMLElement): WiringEntry[] | null {
  const text = root.dataset[BOARD_WIRING_DATASET_KEY];
  if (!text) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(text);
    return Array.isArray(parsed) ? (parsed as WiringEntry[]) : null;
  } catch {
    return null;
  }
}

/** 배선을 알린다(같은 배선이면 다시 보내지 않는다). entries가 null이면 알려 둔 배선을 거둔다. 보냈으면 true */
export function announceBoardWiring(root: HTMLElement, entries: readonly WiringEntry[] | null, source = 'blocks'): boolean {
  const previous = readAnnouncedWiring(root);
  if (sameWiring(previous, entries === null ? null : [...entries])) {
    return false;
  }
  if (entries === null) {
    delete root.dataset[BOARD_WIRING_DATASET_KEY];
    delete root.dataset[BOARD_WIRING_SOURCE_KEY];
  } else {
    root.dataset[BOARD_WIRING_DATASET_KEY] = JSON.stringify(entries);
    root.dataset[BOARD_WIRING_SOURCE_KEY] = source;
  }
  root.dispatchEvent(new CustomEvent<BoardWiringEventDetail>(BOARD_WIRING_EVENT, { detail: { source, entries: entries === null ? null : [...entries] } }));
  return true;
}
