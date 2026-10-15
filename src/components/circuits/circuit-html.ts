/**
 * 회로 그림 한 장의 HTML(판 1.4.0 C5) — 교과서 쪽(book-html.ts가 ::회로[id] 자리를 바꿀 때)과 .astro 부품(CircuitFigure.astro — 웹 차시·보드 준비 쪽)이
 * **같은 모양**을 쓰도록 한 곳에서 만든다. 순수 함수라 Vitest로 검사한다.
 *
 *   <figure class="book-circuit" data-circuit="2-1-2-1" data-pagefind-ignore>
 *     <img class="book-circuit__image" src alt width height loading="lazy" decoding="async">
 *     <figcaption class="book-circuit__caption">
 *       <span class="book-circuit__tag">회로 그림</span> 목록의 한 줄 설명
 *       <span class="book-circuit__note">브릭셀 회로 구성 도구로 그린 배선(ESP32 실드 V3). …같은 번호 핀에 꽂아요.</span>
 *       (그리지 못한 연결이 있으면 <span class="book-circuit__note">이 그림에 없는 연결: …</span>)
 *       <a class="figure-zoom" href="그림 파일">그림 크게 보기<span class="visually-hidden">: 대체 글</span></a>
 *     </figcaption>
 *   </figure>
 *
 * - [그림 크게 보기]는 본문 그림과 같은 링크(lesson-html.ts의 zoomLink)다. 이 링크가 이미 들어 있어 addImageZoomLinks가 또 붙이지 않는다.
 *   회로 그림은 핀 번호 글자가 작아서 넓은 화면에서도 보인다(스타일 src/styles/circuits.css).
 * - 그림은 투명 배경이라 흰 카드 위에 얹는다(스타일). 검색 색인에서는 뺀다 — 같은 글이 교과서 쪽과 웹 차시에 모두 있어서 결과가 겹친다.
 * - 대체 글·캡션은 목록(circuits.yaml)에서 가져와 글자 참조로 바꿔 넣는다. src는 호출하는 쪽이 정한다(마크다운 출력은 /images/… 그대로 두면
 *   rewriteRootRelativeUrls가 base를 붙이고, .astro 부품은 withBase()로 붙여서 준다).
 */
import { zoomLink } from '../lesson/lesson-html.ts';
import { circuitImageUrl, type CircuitFigure } from './circuits-schema.ts';

function escapeHtml(text: string): string {
  return text.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;');
}

/** 그림에 붙는 이름표 글자 */
export const CIRCUIT_TAG_TEXT = '회로 그림';

/**
 * 회로 그림 하나의 <figure> HTML.
 * @param figure 목록에서 읽은 그림
 * @param captionNote 캡션 끝에 붙는 고정 문장(목록의 caption_note)
 * @param src 그림 주소(기본은 base 없는 /images/… — .astro 부품은 withBase()한 값을 준다)
 */
export function circuitFigureHtml(figure: CircuitFigure, captionNote: string, src: string = circuitImageUrl(figure)): string {
  const alt = escapeHtml(figure.alt);
  const notes = [captionNote, ...(figure.undrawnNote ? [figure.undrawnNote] : [])]
    .map((note) => `<span class="book-circuit__note">${escapeHtml(note)}</span>`)
    .join(' ');
  return (
    `<figure class="book-circuit" data-circuit="${escapeHtml(figure.id)}" data-pagefind-ignore>` +
    `<img class="book-circuit__image" src="${escapeHtml(src)}" alt="${alt}" width="${figure.width}" height="${figure.height}" loading="lazy" decoding="async">` +
    `<figcaption class="book-circuit__caption"><span class="book-circuit__tag">${CIRCUIT_TAG_TEXT}</span> ${escapeHtml(figure.caption)} ${notes} ${zoomLink(escapeHtml(src), alt)}</figcaption>` +
    `</figure>\n`
  );
}
