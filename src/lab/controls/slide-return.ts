/**
 * "← 수업 화면으로"(판 1.6.0, DECISIONS C173·C175 보충 — 걷기 조사 walk-teacher-new A3·synthesis A-9).
 *
 * 수업 화면(present.ts)에서 [실습실에서 크게 열기]를 누르면 실습실이 **새 탭**으로 열리고 주소에 ?from=slide&n=<단계 번호>가 붙는다.
 * 예전에는 같은 탭에서 열려, [실행] 뒤 [뒤로]를 누르면 수업 화면이 꺼진 교과서 쪽 맨 위로 돌아와 같은 자리까지 →를 20번쯤 눌러야 했다.
 * 실습실 쪽에서는 이 표시가 있을 때만 맨 위에 "← 수업 화면으로"를 보인다(SlideReturn.astro):
 *  - 누르면 먼저 이 탭을 닫아 본다(수업 화면 탭이 그 단계 그대로 남아 있다). 닫히지 않으면(브라우저가 막으면) 그 단계 주소(#slide=N)로 간다.
 *  - 돌아갈 주소는 이 탭을 연 쪽(같은 사이트의 교과서 원문 쪽·따라 하기 쪽 — document.referrer)이다. 모르면 이 예제의 차시 링크(LabShell의 [data-lab-lesson-link]).
 * 순수 함수는 Vitest가 본다(tests/unit/lab/slide-return.test.ts).
 */

/** 주소 검색 글에 ?from=slide&n=N이 있으면 N(1부터), 아니면 undefined */
export function slideReturnStep(search: string): number | undefined {
  const params = new URLSearchParams(search);
  if (params.get('from') !== 'slide') {
    return undefined;
  }
  const raw = params.get('n') ?? '';
  const number = /^\d{1,4}$/u.test(raw) ? Number(raw) : Number.NaN;
  return Number.isInteger(number) && number >= 1 ? number : undefined;
}

export interface SlideReturnInput {
  /** 실습실 주소의 검색 글(location.search) */
  readonly search: string;
  /** 이 탭을 연 쪽의 주소(document.referrer — 빈 글일 수 있다) */
  readonly referrer: string;
  /** 이 사이트의 출처(location.origin) */
  readonly origin: string;
  /** 사이트 하위 경로(끝이 /). 예: /ai-physical-computing/ */
  readonly basePath: string;
  /** referrer를 쓸 수 없을 때 돌아갈 차시 쪽 주소(base가 붙은 사이트 안 주소) */
  readonly fallback?: string | undefined;
}

/** 수업 화면이 있는 쪽인가(교과서 원문 /book/<id>/ · 따라 하기 /learn/uN/<차시>/) */
function isSlidePage(pathname: string, basePath: string): boolean {
  const base = basePath.endsWith('/') ? basePath : `${basePath}/`;
  if (!pathname.startsWith(base)) {
    return false;
  }
  const rest = pathname.slice(base.length);
  return /^book\/[a-z\d-]+\/$/u.test(rest) || /^learn\/u[1-4]\/[a-z\d-]+\/$/u.test(rest);
}

/**
 * "← 수업 화면으로"가 갈 주소(사이트 안, #slide=N 붙음). ?from=slide&n=N이 없거나 돌아갈 쪽을 모르면 undefined(링크를 보이지 않는다).
 * 다른 사이트에서 온 referrer는 쓰지 않는다.
 */
export function slideReturnHref(input: SlideReturnInput): string | undefined {
  const step = slideReturnStep(input.search);
  if (step === undefined) {
    return undefined;
  }
  const candidates = [input.referrer, input.fallback ?? ''];
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    let url: URL;
    try {
      url = new URL(candidate, input.origin);
    } catch {
      continue;
    }
    if (url.origin !== input.origin || !isSlidePage(url.pathname, input.basePath)) {
      continue;
    }
    // 수업 화면으로 바로 여는 표시(view=slide)는 #slide=N이 대신한다 — 다른 값은 그대로
    const params = new URLSearchParams(url.search);
    params.delete('view');
    const rest = params.toString();
    return `${url.pathname}${rest ? `?${rest}` : ''}#slide=${step}`;
  }
  return undefined;
}

/** 실습실 쪽의 "← 수업 화면으로" 링크를 채운다(SlideReturn.astro가 부른다) */
export function installSlideReturn(doc: Document = document, basePath: string): void {
  const box = doc.querySelector<HTMLElement>('[data-lab-slide-return]');
  const link = box?.querySelector<HTMLAnchorElement>('a');
  const win = doc.defaultView;
  if (!box || !link || !win) {
    return;
  }
  const resolve = () =>
    slideReturnHref({
      search: win.location.search,
      referrer: doc.referrer,
      origin: win.location.origin,
      basePath,
      fallback: doc.querySelector<HTMLAnchorElement>('[data-lab-lesson-link]')?.getAttribute('href') ?? undefined,
    });
  const show = () => {
    const href = resolve();
    if (href) {
      link.href = href;
      box.hidden = false;
    }
    return href;
  };
  // 차시 링크는 실습실 스크립트가 예제를 고른 뒤 채운다 — referrer가 없으면 조금 뒤에 한 번 더 본다
  if (!show() && slideReturnStep(win.location.search) !== undefined) {
    win.setTimeout(show, 1200);
  }
  link.addEventListener('click', (event) => {
    const href = resolve() ?? link.href;
    // 수업 화면에서 새 탭으로 열린 탭이면 닫아 본다 — 수업 화면 탭이 그 단계 그대로 남아 있다. 닫히지 않으면 그 단계 주소로 간다.
    if (win.history.length <= 1) {
      event.preventDefault();
      win.close();
      win.setTimeout(() => {
        if (!win.closed) {
          win.location.href = href;
        }
      }, 150);
    }
  });
}
