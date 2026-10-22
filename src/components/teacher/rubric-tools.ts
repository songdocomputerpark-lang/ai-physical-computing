/**
 * 채점 기준 표를 종이로 쓰거나 한글·엑셀·구글 시트에 붙여 넣는 도구(판 1.7.0 구역 Z3, 미해결 258 — 다시 걷기 teacher-new N1).
 *
 * 왜: 교사는 채점 기준 표를 종이로 쓰고 싶어 하는데 차시 쪽 하나가 15,000px가 넘어 그냥 인쇄하면 수십 장이 나왔고, 표만 따로 가져가는 방법이 없었다.
 * 학생에게 나눠 줄 평가지(문항지)는 아직 없지만, 모든 교과서·보충 차시의 교사용 칸에 채점 기준 표(관찰 항목 × 잘함·보통·노력 요함)가 있다.
 *
 * 무엇: 표 위의 [표 인쇄]·[표 복사] 단추(RubricTools.astro)가 이 모듈을 부른다. 서버로 아무것도 보내지 않는다.
 * - [표 복사]: 표를 탭으로 나눈 글(한 줄에 한 행)로 클립보드에 넣는다 — 한글·엑셀·구글 시트에 붙이면 칸마다 들어간다.
 * - [표 인쇄]: 이 표만 담은 인쇄용 상자(제목 + 표 + 쪽 주소)를 <body> 끝에 잠깐 붙이고 html에 data-rubric-printing을 달아 window.print()를 부른다.
 *   인쇄 규칙(@media print — RubricTools.astro)이 그 상자 말고 모든 것을 숨긴다. 인쇄가 끝나면(afterprint) 상자와 속성을 지운다.
 *
 * 순수 함수(cleanCellText·rowsToTsv·printTitle)는 DOM 없이 도는 Vitest로 검사하고, DOM 쪽(installRubricTools)은 jsdom 시험과
 * 브라우저 시험(tests/e2e/teacher.spec.ts)이 본다. 새 부품이 아니라 단추 마크업(data-rubric-*)만 맞으면 어느 쪽에서든 된다.
 *
 * 마크업 약속(RubricTools.astro가 그린다)
 *   [data-rubric-tools]            단추 줄. 처음에는 hidden — 이 도구가 켜지면 보인다(자바스크립트가 꺼져 있으면 단추가 일을 못 하니 보이지 않는다)
 *     data-rubric-target="<id>"    표 앞 "### 채점 기준" 제목의 id. 그 제목 다음에 처음 나오는 <table>이 대상이다(다음 제목 앞까지)
 *     data-rubric-title="<글>"     인쇄 제목에 쓸 차시 이름(없으면 쪽의 첫 <h1> 글)
 *   [data-rubric-print] [data-rubric-copy]   두 단추
 *   [data-rubric-status]           결과 한 줄(role="status")
 */

/** 단추 줄의 표시 */
export const RUBRIC_TOOLS_SELECTOR = '[data-rubric-tools]';

/** 인쇄용 상자의 class와 html 속성(RubricTools.astro의 인쇄 규칙과 짝) */
export const RUBRIC_PRINT_ROOT_CLASS = 'rubric-print-root';
export const RUBRIC_PRINTING_ATTRIBUTE = 'data-rubric-printing';

/** 결과 한 줄(쉬운 말) */
export const RUBRIC_MESSAGES = Object.freeze({
  copied: '표를 복사했어요. 한글·엑셀·구글 시트에서 붙여 넣으면 칸마다 들어가요.',
  copyFailed: '복사하지 못했어요. 표를 끌어서 고른 뒤 Ctrl+C로 복사해 주세요.',
  noTable: '표를 찾지 못했어요. 쪽을 새로 고친 뒤 다시 눌러 주세요.',
  printing: '인쇄 창을 열었어요.',
});

/** 칸 글에서 줄바꿈·탭·겹친 빈칸을 한 칸으로 줄인다 */
export function cleanCellText(text: string): string {
  return text.replace(/\s+/gu, ' ').trim();
}

/** 탭으로 나눈 글의 한 칸: 큰따옴표가 들어 있으면 표 프로그램이 칸을 잘못 읽지 않게 따옴표로 감싼다(안의 따옴표는 두 개로) */
function tsvCell(text: string): string {
  const clean = cleanCellText(text);
  return clean.includes('"') ? `"${clean.replace(/"/gu, '""')}"` : clean;
}

/** 표 행들 → 탭으로 칸을 나누고 줄바꿈으로 행을 나눈 글(한글·엑셀·구글 시트에 붙여 넣는 모양). 끝에 줄바꿈은 붙이지 않는다 */
export function rowsToTsv(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => row.map(tsvCell).join('\t')).join('\n');
}

/** 인쇄 제목: "2-1-2 LCD 제어하기 — 채점 기준". 차시 이름이 없으면 "채점 기준" */
export function printTitle(lessonName: string): string {
  const name = cleanCellText(lessonName);
  return name === '' ? '채점 기준' : `${name} — 채점 기준`;
}

/** <table>의 행·칸 글(머리 줄 포함) */
export function tableRows(table: HTMLTableElement): string[][] {
  return [...table.rows].map((row) => [...row.cells].map((cell) => cleanCellText(cell.textContent ?? '')));
}

/**
 * 채점 기준 제목(<h3>) 다음에 처음 나오는 표. 다음 제목(h1~h3)을 만나면 찾지 않는다(다음 칸의 표를 잘못 집지 않게).
 * 표가 <div> 같은 감싸개 안에 있어도 찾는다. 제목이 없으면 null.
 */
export function findRubricTable(heading: Element | null): HTMLTableElement | null {
  for (let node = heading?.nextElementSibling ?? null; node; node = node.nextElementSibling) {
    if (/^H[1-3]$/u.test(node.tagName)) {
      return null;
    }
    if (node.tagName === 'TABLE') {
      return node as HTMLTableElement;
    }
    const inner = node.querySelector('table');
    if (inner) {
      return inner;
    }
  }
  return null;
}

/** 제목과 표 사이의 안내 글(예: "수행평가나 형성평가에서 세 단계로 판단할 때 쓰는 기준 예시이다.") — 인쇄 상자에 함께 싣는다 */
export function rubricIntroText(heading: Element | null, table: HTMLTableElement): string {
  const parts: string[] = [];
  for (let node = heading?.nextElementSibling ?? null; node && node !== table && !node.contains(table); node = node.nextElementSibling) {
    if (node.tagName === 'P') {
      parts.push(cleanCellText(node.textContent ?? ''));
    }
  }
  return parts.filter(Boolean).join(' ');
}

/** 인쇄용 상자: 제목 + 안내 글 + 표 복사본 + 쪽 주소. 복사본에서는 id·초점·스크롤 도우미 표식을 뗀다(원래 쪽과 id가 겹치지 않게) */
export function buildPrintRoot(doc: Document, table: HTMLTableElement, title: string, intro: string, address: string): HTMLElement {
  const root = doc.createElement('div');
  root.className = RUBRIC_PRINT_ROOT_CLASS;
  root.setAttribute('data-rubric-print-root', '');
  const heading = doc.createElement('h1');
  heading.textContent = title;
  root.append(heading);
  if (intro !== '') {
    const note = doc.createElement('p');
    note.textContent = intro;
    root.append(note);
  }
  const clone = table.cloneNode(true) as HTMLTableElement;
  for (const element of [clone, ...clone.querySelectorAll('*')]) {
    element.removeAttribute('id');
    element.removeAttribute('tabindex');
    element.removeAttribute('role');
    element.removeAttribute('aria-label');
    element.removeAttribute('data-scroll-more');
    element.removeAttribute('data-scroll-focus');
    element.removeAttribute('data-scroll-shade');
  }
  root.append(clone);
  if (address !== '') {
    const source = doc.createElement('p');
    source.className = 'rubric-print-root__source';
    source.textContent = `이 표가 있는 쪽: ${address}`;
    root.append(source);
  }
  return root;
}

/** 클립보드에 글을 넣는다. 안 되는 브라우저(주소가 https가 아닌 개발 서버 등)는 보이지 않는 입력칸을 골라 복사 명령으로 */
export async function copyText(win: Window, text: string): Promise<boolean> {
  try {
    if (win.navigator.clipboard?.writeText) {
      await win.navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 권한이 없으면 아래 방법으로
  }
  const doc = win.document;
  const area = doc.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.insetBlockStart = '0';
  area.style.opacity = '0';
  doc.body.append(area);
  area.select();
  let ok = false;
  try {
    ok = doc.execCommand('copy');
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}

/** 표 인쇄: 인쇄용 상자를 붙이고 인쇄 창을 열고, 끝나면 치운다. 이미 인쇄 중이면 앞의 상자를 먼저 치운다 */
export function printRubricTable(win: Window, table: HTMLTableElement, title: string, intro: string): void {
  const doc = win.document;
  const root = doc.documentElement;
  doc.querySelectorAll('[data-rubric-print-root]').forEach((old) => old.remove());
  const printRoot = buildPrintRoot(doc, table, title, intro, win.location.href.split('#')[0] ?? '');
  doc.body.append(printRoot);
  root.setAttribute(RUBRIC_PRINTING_ATTRIBUTE, '');

  const cleanup = (): void => {
    printRoot.remove();
    root.removeAttribute(RUBRIC_PRINTING_ATTRIBUTE);
    win.removeEventListener('afterprint', cleanup);
    doc.removeEventListener('pointerdown', cleanup, true);
    doc.removeEventListener('keydown', cleanup, true);
  };
  // 인쇄가 끝났다는 신호(afterprint)가 오면 치운다. 그 신호가 안 오는 브라우저를 위해 다음에 누르거나 키를 칠 때도 치운다 —
  // 상자가 남으면 나중에 그냥 Ctrl+P를 눌러도 이 표만 인쇄되기 때문이다.
  win.addEventListener('afterprint', cleanup);
  doc.addEventListener('pointerdown', cleanup, true);
  doc.addEventListener('keydown', cleanup, true);
  win.print();
}

/** 단추 줄 하나를 켠다(이미 켠 줄은 건너뛴다) */
function bindToolbar(win: Window, bar: HTMLElement): void {
  if (bar.dataset.rubricReady === 'true') {
    return;
  }
  bar.dataset.rubricReady = 'true';
  const doc = win.document;
  const status = bar.querySelector<HTMLElement>('[data-rubric-status]');
  let clearTimer: number | undefined;
  const say = (message: string): void => {
    if (!status) {
      return;
    }
    status.textContent = message;
    win.clearTimeout(clearTimer);
    clearTimer = win.setTimeout(() => {
      status.textContent = '';
    }, 8000);
  };
  const target = (): { table: HTMLTableElement; heading: Element | null } | null => {
    const heading = doc.getElementById(bar.dataset.rubricTarget ?? '');
    const table = findRubricTable(heading);
    return table ? { table, heading } : null;
  };

  bar.querySelector<HTMLButtonElement>('[data-rubric-copy]')?.addEventListener('click', () => {
    const found = target();
    if (!found) {
      say(RUBRIC_MESSAGES.noTable);
      return;
    }
    void copyText(win, rowsToTsv(tableRows(found.table))).then((ok) => {
      say(ok ? RUBRIC_MESSAGES.copied : RUBRIC_MESSAGES.copyFailed);
    });
  });
  bar.querySelector<HTMLButtonElement>('[data-rubric-print]')?.addEventListener('click', () => {
    const found = target();
    if (!found) {
      say(RUBRIC_MESSAGES.noTable);
      return;
    }
    const name = bar.dataset.rubricTitle ?? doc.querySelector('h1')?.textContent ?? '';
    printRubricTable(win, found.table, printTitle(name), rubricIntroText(found.heading, found.table));
    say(RUBRIC_MESSAGES.printing);
  });
  bar.hidden = false;
}

/** 쪽의 모든 단추 줄을 켠다(브라우저에서만 부른다). 여러 번 불러도 한 번씩만 켠다 */
export function installRubricTools(win: Window = window): void {
  for (const bar of win.document.querySelectorAll<HTMLElement>(RUBRIC_TOOLS_SELECTOR)) {
    bindToolbar(win, bar);
  }
}
