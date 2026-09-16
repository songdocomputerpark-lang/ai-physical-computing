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

/** 에디터에 보이는 코드(줄을 \n으로 이음. 끝 줄바꿈은 CodeMirror가 빈 줄로 보여 마지막에 \n이 붙는다) */
export async function editorText(page: Page): Promise<string> {
  return page.locator('[data-lab-editor] .cm-line').evaluateAll((lines) => lines.map((line) => line.textContent ?? '').join('\n'));
}

/** 끝의 빈 줄을 뗀다(에디터가 마지막에 줄바꿈을 하나 더 두는 일이 있다). */
function trimTrailingNewlines(text: string): string {
  return text.replace(/\n+$/u, '');
}

/** 실제로 편집칸에 들어 있는 글(자리 글 `.cm-placeholder`는 뺀다 — 코드를 비우면 그 자리에 보인다) */
async function editorDocText(page: Page): Promise<string> {
  return page.locator('[data-lab-editor] .cm-line').evaluateAll((lines) =>
    lines
      .map((line) => {
        const clone = line.cloneNode(true) as HTMLElement;
        for (const placeholder of clone.querySelectorAll('.cm-placeholder')) {
          placeholder.remove();
        }
        return clone.textContent ?? '';
      })
      .join('\n'),
  );
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
