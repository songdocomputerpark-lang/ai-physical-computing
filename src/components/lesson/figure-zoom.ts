/**
 * 차시 그림의 [그림 크게 보기] — 사이트가 그린 SVG 그림은 이 쪽 안의 크게 보기 창(<dialog>)으로 연다(판 1.1.0 검토 반영, PROGRESS 미해결 209).
 *
 * 왜: 링크(lesson-html.ts addImageZoomLinks — 좁은 화면에서만 보인다)는 그림 파일 자체를 연다. 사진(WebP·JPG)은 휴대폰 브라우저가 화면 폭에
 * 맞춰 보여 주고 손가락으로 키울 수 있지만, SVG 파일은 휴대폰 기본 창 폭(980px)으로 그려져 **본문보다 작게**(폭 640 그림이 약 245px — 글자
 * 약 6px) 보였고, 휴대폰이 받은 좁은 화면용 그림(x.narrow.svg)이 아니라 가로 배치의 원래 그림이 열렸다(1.1.0 교실 사용성 검토 사소 4).
 *
 * 그래서 SVG 그림의 링크를 누르면 파일 대신 이 창을 연다:
 * - 본문에 보이던 **그 그림**(<picture>가 고른 것 — 휴대폰이면 좁은 그림)을 본문보다 크게: 폭 = max(그림 원래 폭, 본문 폭 × ZOOM_SCALE),
 *   ZOOM_MAX_WIDTH까지. 칸이 넘치면 옆으로 밀어 보고, 손가락으로 더 키울 수도 있다.
 * - 닫기: [닫기]·Esc·창 바깥(어두운 곳)을 누름. 닫으면 초점을 누른 링크로 돌려준다.
 * - 사진·자바스크립트가 꺼진 브라우저·<dialog>가 없는 옛 브라우저는 전처럼 링크가 파일을 연다(점진적 향상).
 * 창 모양은 LessonBody.astro의 스타일(스크립트가 만드는 요소라 :global).
 */

/** 크게 보기 창의 그림 폭 — 본문에 보이던 폭의 몇 배로 키울지 */
export const ZOOM_SCALE = 1.6;
/** 크게 보기 창의 그림 폭 상한(px) */
export const ZOOM_MAX_WIDTH = 1280;

/** 크게 보기 창의 그림 폭(px): 원래 폭과 본문 폭 × ZOOM_SCALE 가운데 큰 것, ZOOM_MAX_WIDTH까지 */
export function zoomDisplayWidth(intrinsicWidth: number, renderedWidth: number): number {
  const intrinsic = Number.isFinite(intrinsicWidth) && intrinsicWidth > 0 ? intrinsicWidth : 0;
  const rendered = Number.isFinite(renderedWidth) && renderedWidth > 0 ? renderedWidth : 0;
  const wanted = Math.max(intrinsic, Math.round(rendered * ZOOM_SCALE));
  return Math.min(wanted > 0 ? wanted : ZOOM_MAX_WIDTH, ZOOM_MAX_WIDTH);
}

/** 이 링크가 크게 보기 창으로 열 SVG 그림을 가리키는지(주소 끝이 .svg) */
export function isSvgHref(href: string | null | undefined): boolean {
  return typeof href === 'string' && /\.svg(?:[?#].*)?$/iu.test(href);
}

const DIALOG_CLASS = 'figure-zoom-dialog';

/** 링크 옆의 그림(<figure> 안, 또는 같은 문단의 그림) */
function imageFor(link: HTMLAnchorElement): HTMLImageElement | null {
  const figure = link.closest('figure');
  if (figure) {
    return figure.querySelector('img');
  }
  const parent = link.parentElement;
  return parent ? parent.querySelector('img') : null;
}

/** 한 쪽에 하나만 만들어 두고 다시 쓴다 */
function ensureDialog(doc: Document): { dialog: HTMLDialogElement; image: HTMLImageElement; close: HTMLButtonElement } {
  const found = doc.querySelector<HTMLDialogElement>(`dialog.${DIALOG_CLASS}`);
  if (found) {
    return {
      dialog: found,
      image: found.querySelector('img') as HTMLImageElement,
      close: found.querySelector('[data-figure-zoom-close]') as HTMLButtonElement,
    };
  }
  const dialog = doc.createElement('dialog');
  dialog.className = DIALOG_CLASS;
  dialog.dataset.figureZoom = '';
  dialog.setAttribute('aria-labelledby', 'figure-zoom-title');
  const bar = doc.createElement('div');
  bar.className = `${DIALOG_CLASS}__bar`;
  const title = doc.createElement('p');
  title.className = `${DIALOG_CLASS}__title`;
  title.id = 'figure-zoom-title';
  title.textContent = '그림 크게 보기 — 옆으로 밀거나 손가락으로 더 키워 봐요';
  const close = doc.createElement('button');
  close.type = 'button';
  close.className = `${DIALOG_CLASS}__close`;
  close.dataset.figureZoomClose = '';
  close.textContent = '닫기';
  bar.append(title, close);
  const scroll = doc.createElement('div');
  scroll.className = `${DIALOG_CLASS}__scroll`;
  // 그림이 칸보다 넓으면 키보드로도 밀어 보게(역할 있는 칸 — 역할 없는 칸에 이름을 달지 않는다: axe aria-prohibited-attr)
  scroll.setAttribute('role', 'group');
  scroll.setAttribute('aria-label', '크게 본 그림');
  scroll.tabIndex = 0;
  const image = doc.createElement('img');
  image.decoding = 'async';
  scroll.append(image);
  dialog.append(bar, scroll);
  doc.body.append(dialog);
  close.addEventListener('click', () => dialog.close());
  // 어두운 바깥(창 자체)을 누르면 닫는다 — 안쪽(막대·그림 칸)을 누른 것은 그대로
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) {
      dialog.close();
    }
  });
  return { dialog, image, close };
}

/** 크게 보기 창을 연다(열었으면 true) */
function openZoom(doc: Document, link: HTMLAnchorElement, source: HTMLImageElement): boolean {
  const { dialog, image, close } = ensureDialog(doc);
  if (typeof dialog.showModal !== 'function') {
    return false;
  }
  const src = source.currentSrc || source.src;
  const rect = source.getBoundingClientRect();
  const intrinsic = source.naturalWidth || Number(source.getAttribute('width')) || 0;
  const width = zoomDisplayWidth(intrinsic, rect.width);
  image.src = src;
  image.alt = source.alt;
  image.style.width = `${width}px`;
  image.style.height = 'auto';
  dialog.dataset.figureZoomSrc = src;
  const onClose = () => {
    dialog.removeEventListener('close', onClose);
    // 닫으면 누른 링크로 초점을 돌려준다(브라우저가 이미 돌려줬으면 그대로 — 화면은 움직이지 않는다)
    if (doc.activeElement === null || doc.activeElement === doc.body || dialog.contains(doc.activeElement)) {
      link.focus({ preventScroll: true });
    }
  };
  dialog.addEventListener('close', onClose);
  dialog.showModal();
  close.focus();
  return true;
}

/** 차시 본문의 [그림 크게 보기] 링크 가운데 SVG 그림을 크게 보기 창으로 연다(한 쪽에 한 번 부른다). 해제 함수를 돌려준다. */
export function installFigureZoom(doc: Document = document): () => void {
  const onClick = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    const target = event.target instanceof Element ? event.target : null;
    const link = target?.closest<HTMLAnchorElement>('a.figure-zoom') ?? null;
    if (!link || !isSvgHref(link.getAttribute('href'))) {
      return; // 사진은 전처럼 파일을 연다
    }
    const source = imageFor(link);
    if (!source || typeof HTMLDialogElement === 'undefined') {
      return;
    }
    if (openZoom(doc, link, source)) {
      event.preventDefault();
    }
  };
  doc.addEventListener('click', onClick);
  return () => doc.removeEventListener('click', onClick);
}
