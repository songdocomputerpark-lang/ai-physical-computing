/**
 * 교과서 쪽의 매체 표시(판 1.4.0) — frontmatter media(camera·mic·web·board)를 아이콘 + 글자로 보인다.
 * 아이콘만으로 뜻을 전하지 않는다(늘 글자와 함께 — DECISIONS C132·C111). 홈 카드·쪽 머리·차례가 같은 표를 쓴다.
 * "보드"는 실제 보드가 있으면 더 좋다는 뜻이다 — 보드가 없어도 가상 ESP32 보드로 끝까지 할 수 있다(절대 원칙 3).
 */
import type { IconName } from '../common/icons.ts';
import type { BookMedia } from './book-data.ts';

export interface BookMediaInfo {
  readonly icon: IconName;
  /** 짧은 이름(칩 글자) */
  readonly label: string;
  /** 범례·툴팁에 쓰는 긴 설명 */
  readonly note: string;
  /**
   * 한 줄 범례에 쓰는 풀이("카메라(없으면 샘플 영상)") — 아이콘이 "필요한 준비물"처럼 읽히지 않게 없어도 되는 길을 함께 적는다(판 1.6.0 R6, 학부모 걷기 13).
   * 칩 글자(label)는 늘 짧은 이름이다 — 차시 카드의 꼬리표에는 label만 쓴다.
   */
  readonly legend: string;
}

export const BOOK_MEDIA_INFO: Readonly<Record<BookMedia, BookMediaInfo>> = Object.freeze({
  camera: { icon: 'camera', label: '카메라', note: '웹캠이 있으면 직접 해 볼 수 있어요. 없으면 샘플 영상으로 해요.', legend: '카메라(없으면 샘플 영상)' },
  mic: { icon: 'mic', label: '마이크', note: '마이크로 말한 소리를 써요. 없으면 글자로 입력해서 해 볼 수 있어요.', legend: '마이크(없으면 글자 입력)' },
  web: { icon: 'browser', label: '인터넷', note: '인터넷에 연결된 상태에서 해 보는 내용이에요.', legend: '인터넷' },
  board: { icon: 'plug', label: '보드', note: '실제 보드가 있으면 더 좋아요. 없어도 가상 보드로 끝까지 할 수 있어요.', legend: '보드(없으면 화면 속 보드)' },
});

/** 범례 한 줄(홈·차례 머리에 쓸 수 있게 순서를 고정) */
export const BOOK_MEDIA_ORDER: readonly BookMedia[] = Object.freeze(['camera', 'mic', 'web', 'board']);

/** 한 줄 범례 글("카메라(없으면 샘플 영상) · 마이크(없으면 글자 입력) · 인터넷 · 보드(없으면 화면 속 보드)") — 홈·차례 머리 어디서든 같은 풀이를 쓴다 */
export function mediaLegendText(order: readonly BookMedia[] = BOOK_MEDIA_ORDER): string {
  return order.map((key) => BOOK_MEDIA_INFO[key].legend).join(' · ');
}
