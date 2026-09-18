// 실습실(LabShell) 브라우저 테스트 공통 도구 — 개발용 시험 페이지(/labs/dev/runtime/)의 요소를 찾고 코드 에디터에 코드를 넣는다.
import { expect, type Locator, type Page } from '@playwright/test';
import { withBase } from '../../../src/lib/url.ts';

/** 개발용 시험 페이지 주소(base 포함) */
export const DEV_LAB_PATH = withBase('labs/dev/runtime/');

/** Pyodide를 CDN에서 받는 시간(약 6MB, 브라우저 캐시 뒤에는 수 초) */
export const LOAD_TIMEOUT = 90_000;

/** 실습실 뿌리([data-lab]) */
export function labRoot(page: Page): Locator {
  return page.locator('[data-lab]');
}

/** CodeMirror 편집 영역(contenteditable) */
export function editorContent(page: Page): Locator {
  return page.locator('[data-lab-editor] .cm-content');
}

/**
 * 편집칸에 들어 있는 코드 전체.
 *
 * DOM(.cm-line)만 읽으면 안 된다 — CodeMirror 6은 **화면에 보이는 줄만** DOM에 두고 나머지 자리는 빈 칸으로 채운다(가상 스크롤).
 * 편집칸이 긴 줄을 접기 시작한 뒤로는(2026-09-18 검토 반영) 같은 예제가 1.5배쯤 길어져 30줄짜리 예제에서도 가운데 줄이 DOM에서 빠졌다.
 * 그래서 CodeMirror가 DOM 요소에 걸어 둔 tile로 EditorView를 찾아 문서 글자를 그대로 읽는다(EditorView.findFromDOM이 쓰는 길과 같다).
 * 그 길이 막히면(CodeMirror 판이 바뀌면) 예전처럼 DOM 줄을 이어 붙인다.
 */
export async function editorText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const content = document.querySelector('[data-lab-editor] .cm-content') as (Element & { cmTile?: { root?: { view?: { state?: { doc?: unknown } } } } }) | null;
    const doc = content?.cmTile?.root?.view?.state?.doc;
    if (doc !== undefined && doc !== null) {
      const text = String(doc);
      if (text !== '[object Object]') {
        return text;
      }
    }
    return [...document.querySelectorAll('[data-lab-editor] .cm-line')].map((line) => line.textContent ?? '').join('\n');
  });
}

/** 편집칸 코드에 이 글이 들어올 때까지 기다린다(가상 스크롤과 상관없이 문서 글자로 본다) */
export async function expectEditorToContain(page: Page, text: string, timeout = 10_000): Promise<void> {
  await expect.poll(() => editorText(page), { timeout }).toContain(text);
}

/** 끝의 빈 줄을 뗀다(에디터가 마지막에 줄바꿈을 하나 더 두는 일이 있다). */
function trimTrailingNewlines(text: string): string {
  return text.replace(/\n+$/u, '');
}

/** 실제로 편집칸에 들어 있는 글(자리 글 `.cm-placeholder`는 뺀다 — 코드를 비우면 그 자리에 보인다) */
async function editorDocText(page: Page): Promise<string> {
  return editorText(page);
}

/**
 * 에디터 코드를 통째로 바꾼다.
 * fill()은 모바일 프로젝트(Pixel 5 흉내)에서 앞 코드를 지우지 못하고 뒤에 붙는 일이 있다(2026-09-16 실측).
 * CodeMirror가 스스로 처리하는 키(선택 모두 → 지움 → 붙여넣기)로 넣고, 들어간 글을 확인한 뒤 돌아온다.
 */
export async function setEditorCode(page: Page, code: string): Promise<void> {
  const content = editorContent(page);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await content.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Backspace');
    await page.keyboard.insertText(code);
    if (trimTrailingNewlines(await editorDocText(page)) === trimTrailingNewlines(code)) {
      return;
    }
  }
  expect(trimTrailingNewlines(await editorDocText(page)), '편집칸에 코드를 넣지 못했어요').toBe(trimTrailingNewlines(code));
}

/** 실습실이 준비될 때까지(Pyodide 받기) 기다린 뒤 페이지를 연다. */
export async function openLabAndWaitReady(page: Page, query = ''): Promise<void> {
  const response = await page.goto(`${DEV_LAB_PATH}${query}`);
  expect(response?.status()).toBe(200);
  await expect(labRoot(page)).toHaveAttribute('data-state', 'idle', { timeout: LOAD_TIMEOUT });
}

/** 코드를 넣고 [실행]을 누른다. */
export async function runCode(page: Page, code: string): Promise<void> {
  await setEditorCode(page, code);
  await page.getByRole('button', { name: '실행', exact: true }).click();
}

/** 실행이 끝날 때까지 기다려 결과(ok·error·stopped·killed)를 돌려준다. */
export async function waitDone(page: Page, timeout = 60_000): Promise<string> {
  await expect(labRoot(page)).toHaveAttribute('data-outcome', /^(ok|error|stopped|killed)$/u, { timeout });
  return (await labRoot(page).getAttribute('data-outcome')) ?? '';
}

/** 이 사이트 머리말로 시작하는 localStorage·sessionStorage 이름 목록 */
export async function ourStorageKeys(page: Page, prefix: string): Promise<{ local: string[]; session: string[] }> {
  return page.evaluate((keyPrefix) => {
    const collect = (storage: Storage) => Object.keys(storage).filter((key) => key.startsWith(keyPrefix)).sort();
    return { local: collect(window.localStorage), session: collect(window.sessionStorage) };
  }, prefix);
}
