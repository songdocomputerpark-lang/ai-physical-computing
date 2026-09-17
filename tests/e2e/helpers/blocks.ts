// 블록 모드 브라우저 테스트 도구(tests/e2e/esp32-blocks.spec.ts·scenario-b.spec.ts가 함께 쓴다).
// 병렬 제작 구역 D가 tests/unit/blocks/helpers/에 두었던 파일을 통합(P3-11)에서 이 자리로 옮겼다.
// vitest는 *.test.ts만 모으므로 이 파일은 단위 테스트로 돌지 않는다.
//
// 블록 끌어 놓기는 실제 마우스로 한다(도구 상자 카테고리 누르기 → 펼친 목록(flyout)의 블록을 눌러 끌기 → 놓기). 어디에 놓을지(연결 자리의 화면 좌표)만
// 작업판 칸([data-blocks-workspace])의 apcBlocks 속성({ Blockly, workspace })으로 계산한다 — Blockly 블록은 SVG라 역할·이름으로 찾기 어렵다.
import { expect, type Locator, type Page } from '@playwright/test';
import { withBase } from '../../../src/lib/url.ts';

export const ESP32_LAB_PATH = withBase('labs/esp32/');

/** Pyodide(약 13MB)·Blockly를 처음 받는 시간(개발 서버는 Vite 변환이 더 걸린다) */
export const BLOCKS_LOAD_TIMEOUT = 150_000;

export function labRoot(page: Page): Locator {
  return page.locator('[data-lab]');
}

export function blocksRoot(page: Page): Locator {
  return page.locator('[data-blocks]');
}

export function workspaceHost(page: Page): Locator {
  return page.locator('[data-blocks-workspace]');
}

export function boardPart(page: Page, id: string): Locator {
  return page.locator(`[data-board-part="${id}"]`);
}

/** 편집칸에 보이는 코드(줄을 \n으로 이음, 끝 빈 줄은 뗀다) */
export async function editorCode(page: Page): Promise<string> {
  const text = await page.locator('[data-lab-editor] .cm-line').evaluateAll((lines) => lines.map((line) => line.textContent ?? '').join('\n'));
  return text.replace(/\n+$/u, '');
}

/** 실습실을 열고 파이썬 준비(idle)와 가상 보드 준비를 기다린다. query 예: '?blocks=1' */
export async function openEsp32Lab(page: Page, query = ''): Promise<void> {
  const response = await page.goto(`${ESP32_LAB_PATH}${query}`);
  expect(response?.status()).toBe(200);
  await expect(labRoot(page)).toHaveAttribute('data-state', 'idle', { timeout: BLOCKS_LOAD_TIMEOUT });
  await expect(page.locator('[data-board-io]')).toHaveAttribute('data-board-ready', 'yes', { timeout: 60_000 });
}

/** 블록 모드가 준비될 때까지(Blockly 작업판이 그려짐) */
export async function waitBlocksReady(page: Page): Promise<void> {
  await expect(blocksRoot(page)).toHaveAttribute('data-blocks-ready', 'yes', { timeout: BLOCKS_LOAD_TIMEOUT });
  await expect(labRoot(page)).toHaveAttribute('data-block-mode', 'blocks');
  await expect(page.locator('[data-blocks-workspace] .blocklySvg').first()).toBeVisible();
}

/** [블록] 단추를 눌러 블록 모드로 */
export async function switchToBlocks(page: Page): Promise<void> {
  await page.getByRole('button', { name: '블록', exact: true }).click();
  await waitBlocksReady(page);
}

/** 블록 예시를 불러온다(작업판에 블록이 있으면 대화 상자에서 [예시 불러오기]) */
export async function loadPreset(page: Page, id: string): Promise<void> {
  await page.locator('[data-blocks-preset]').selectOption(id);
  const blockCount = Number((await blocksRoot(page).getAttribute('data-blocks-block-count')) ?? '0');
  await page.getByRole('button', { name: '예시 불러오기', exact: true }).first().click();
  if (blockCount > 0) {
    const dialog = page.locator('[data-blocks-dialog]');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: '예시 불러오기', exact: true }).click();
  }
}

/** 펼친 목록의 블록 고르기: 같은 type이 여럿이면 필드 값·입력 칸으로 가린다 */
export interface FlyoutPick {
  readonly field?: readonly [string, string];
  readonly hasInput?: string;
}

interface FlyoutBlockBox {
  readonly rect: { left: number; top: number; width: number; height: number; right: number; bottom: number };
  readonly flyout: { left: number; top: number; right: number; bottom: number; width: number; height: number };
  readonly connection: { x: number; y: number };
  readonly horizontal: boolean;
}

async function flyoutBlockBox(page: Page, type: string, pick: FlyoutPick): Promise<FlyoutBlockBox> {
  return workspaceHost(page).evaluate(
    (element, { type: blockType, pick: choice }) => {
      const { Blockly, workspace } = (element as HTMLElement & { apcBlocks: { Blockly: any; workspace: any } }).apcBlocks;
      const flyout = workspace.getToolbox().getFlyout();
      const flyoutWorkspace = flyout.getWorkspace();
      const block = flyoutWorkspace
        .getTopBlocks(true)
        .filter((item: any) => item.type === blockType)
        .find((item: any) => (!choice.field || item.getFieldValue(choice.field[0]) === choice.field[1]) && (!choice.hasInput || item.getInput(choice.hasInput)));
      if (!block) {
        throw new Error(`펼친 목록에 ${blockType} 블록이 없어요.`);
      }
      const rect = block.getSvgRoot().getBoundingClientRect();
      const flyoutRect = element.querySelector('.blocklyFlyout')!.getBoundingClientRect();
      const connection = block.previousConnection ?? block.outputConnection;
      const screen = Blockly.utils.svgMath.wsToScreenCoordinates(flyoutWorkspace, new Blockly.utils.Coordinate(connection.x, connection.y));
      return {
        rect: rect.toJSON(),
        flyout: flyoutRect.toJSON(),
        connection: { x: screen.x, y: screen.y },
        horizontal: flyout.horizontalLayout === true,
      };
    },
    { type, pick },
  );
}

/** 작업판에 있는 블록(type과 순서)의 입력 칸 연결 자리 화면 좌표 */
export async function inputConnectionPoint(page: Page, parentType: string, inputName: string, nth = 0): Promise<{ x: number; y: number }> {
  return workspaceHost(page).evaluate(
    (element, { parentType: type, inputName: name, nth: index }) => {
      const { Blockly, workspace } = (element as HTMLElement & { apcBlocks: { Blockly: any; workspace: any } }).apcBlocks;
      const parent = workspace.getAllBlocks(true).filter((block: any) => block.type === type)[index];
      if (!parent) {
        throw new Error(`작업판에 ${type} 블록이 없어요.`);
      }
      const connection = parent.getInput(name)?.connection;
      if (!connection) {
        throw new Error(`${type} 블록에 ${name} 입력 칸이 없어요.`);
      }
      const screen = Blockly.utils.svgMath.wsToScreenCoordinates(workspace, new Blockly.utils.Coordinate(connection.x, connection.y));
      return { x: screen.x, y: screen.y };
    },
    { parentType, inputName, nth },
  );
}

/** 도구 상자 카테고리를 눌러 펼친 목록을 연다 */
export async function openCategory(page: Page, name: string): Promise<void> {
  await page.locator('[data-blocks-workspace] .blocklyToolboxCategory', { hasText: name }).first().click();
  await expect(page.locator('[data-blocks-workspace] .blocklyFlyout').first()).toBeVisible();
}

/** 끌어 놓을 자리: 'free' = 펼친 목록 바깥 빈 곳, 아니면 작업판에 있는 블록(type·몇 번째)의 입력 칸 */
export type DropTarget = 'free' | { readonly block: string; readonly input: string; readonly nth?: number };

/** 작업판 칸 안의 화면 좌표를 펼친 목록에 가리지 않는 자리로 옮기려고 작업판을 굴린다(학생이 빈 곳을 끌어 옮기는 것과 같은 결과) */
async function scrollWorkspaceBy(page: Page, dx: number, dy: number): Promise<void> {
  await workspaceHost(page).evaluate(
    (element, { dx: moveX, dy: moveY }) => {
      const { workspace } = (element as HTMLElement & { apcBlocks: { workspace: any } }).apcBlocks;
      workspace.scroll(workspace.scrollX + moveX, workspace.scrollY + moveY);
    },
    { dx, dy },
  );
}

/**
 * 도구 상자에서 블록을 끌어 놓는다(실제 마우스). 카테고리를 연 뒤에 놓을 자리를 계산하고, 그 자리가 도구 상자(카테고리 줄 — 놓으면
 * 블록이 지워지는 곳)·휴지통 쪽이거나 작업판 칸 밖이면 작업판을 굴려 보이는 곳으로 옮긴다. 펼친 목록은 블록을 끌기 시작하면 저절로
 * 닫혀서(Blockly autoClose — 지우는 곳이 아님) 그 자리에 놓아도 된다. 펼친 목록에서 블록이 보이지 않으면 목록을 휠로 굴린다.
 * 컴퓨터(도구 상자 왼쪽)와 휴대폰(도구 상자 위쪽) 모두.
 */
export async function dragFromToolbox(page: Page, options: { category: string; type: string; pick?: FlyoutPick; to: DropTarget }): Promise<void> {
  await workspaceHost(page).scrollIntoViewIfNeeded();
  await openCategory(page, options.category);
  const pick = options.pick ?? {};
  let box = await flyoutBlockBox(page, options.type, pick);
  const inside = (value: FlyoutBlockBox) =>
    value.horizontal
      ? value.rect.left >= value.flyout.left && value.rect.left + 30 <= value.flyout.right
      : value.rect.top >= value.flyout.top && value.rect.top + 24 <= value.flyout.bottom;
  for (let tries = 0; tries < 12 && !inside(box); tries += 1) {
    await page.mouse.move(box.flyout.left + 16, box.flyout.top + 16);
    const distance = box.horizontal ? box.rect.left - box.flyout.left - 30 : box.rect.top - box.flyout.top - 30;
    await page.mouse.wheel(box.horizontal ? distance : 0, distance);
    await page.waitForTimeout(150);
    box = await flyoutBlockBox(page, options.type, pick);
  }
  expect(inside(box), `펼친 목록에서 ${options.type} 블록을 화면에 보이게 하지 못했어요.`).toBe(true);
  const host = await workspaceHost(page).boundingBox();
  const toolbox = await page.locator('[data-blocks-workspace] .blocklyToolbox').first().boundingBox();
  expect(host).not.toBeNull();
  expect(toolbox).not.toBeNull();
  // 도구 상자(지우는 곳)를 빼고, 오른쪽 휴지통·확대 단추 자리(70px)와 아래 가로 스크롤 막대(40px)를 뺀 작업판 칸
  const safe = box.horizontal
    ? { left: host!.x + 24, right: host!.x + host!.width - 70, top: toolbox!.y + toolbox!.height + 24, bottom: host!.y + host!.height - 40 }
    : { left: toolbox!.x + toolbox!.width + 24, right: host!.x + host!.width - 70, top: host!.y + 24, bottom: host!.y + host!.height - 40 };
  const grab = { x: box.rect.left + 18, y: box.rect.top + 14 };
  let drop: { x: number; y: number };
  if (options.to === 'free') {
    drop = { x: safe.left + 24, y: safe.top + 24 };
  } else {
    const target = options.to;
    let point = await inputConnectionPoint(page, target.block, target.input, target.nth ?? 0);
    const dx = point.x < safe.left ? safe.left + 20 - point.x : point.x > safe.right ? safe.right - 20 - point.x : 0;
    const dy = point.y < safe.top ? safe.top + 20 - point.y : point.y > safe.bottom ? safe.bottom - 20 - point.y : 0;
    if (dx !== 0 || dy !== 0) {
      await scrollWorkspaceBy(page, dx, dy);
      await page.waitForTimeout(100);
      point = await inputConnectionPoint(page, target.block, target.input, target.nth ?? 0);
    }
    drop = { x: point.x + (grab.x - box.connection.x), y: point.y + (grab.y - box.connection.y) };
  }
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await page.mouse.move(grab.x + 12, grab.y + 8, { steps: 3 });
  if (options.to !== 'free') {
    // 연결 자리에는 아래쪽에서 다가간다: 끄는 동안 위쪽 칸(예: 만약의 "하기")에 미리 보기 자리가 생기면 아래 칸(아니면)이 밀려 내려가
    // 놓는 순간 연결 자리를 벗어난다(2026-09-18 데스크톱에서 "아니면"에 놓은 블록이 떠 있던 까닭). 아래에서 올라오면 미리 보기가 목표 칸 아래에만 생긴다.
    await page.mouse.move(drop.x + 30, drop.y + 110, { steps: 14 });
  }
  await page.mouse.move(drop.x, drop.y, { steps: 10 });
  await page.waitForTimeout(80);
  await page.mouse.move(drop.x, drop.y + 1);
  await page.mouse.up();
}

/** 작업판을 직렬화 모양 그대로 바꾼다(끌어 놓기가 목적이 아닌 검사 — 핀 겹침·호환 모드·저장 — 에서만) */
export async function loadWorkspaceState(page: Page, state: unknown): Promise<void> {
  await workspaceHost(page).evaluate((element, value) => {
    const { Blockly, workspace } = (element as HTMLElement & { apcBlocks: { Blockly: any; workspace: any } }).apcBlocks;
    workspace.clear();
    Blockly.serialization.workspaces.load(value, workspace);
  }, state);
}

/**
 * 요소의 속성 값이 바뀌는 차례를 페이지 안에서 빠짐없이 모은다(같은 값이 이어지면 한 번) — 짧게 켜졌다 꺼지는 LED를
 * expect 폴링 간격 사이에 놓치지 않으려고(src/lab/README.md 4.6, lab-esp32-parts.spec.ts와 같은 방법).
 */
export async function recordAttribute(page: Page, selector: string, attribute: string): Promise<() => Promise<string>> {
  const key = `__blocks_record_${attribute}_${Math.random().toString(36).slice(2)}`;
  await page.locator(selector).first().evaluate(
    (element, { name, storeKey }) => {
      const values: string[] = [String(element.getAttribute(name))];
      (window as unknown as Record<string, string[]>)[storeKey] = values;
      new MutationObserver(() => {
        const value = String(element.getAttribute(name));
        if (values[values.length - 1] !== value) {
          values.push(value);
        }
      }).observe(element, { attributes: true, attributeFilter: [name] });
    },
    { name: attribute, storeKey: key },
  );
  return () => page.evaluate((storeKey) => ((window as unknown as Record<string, string[]>)[storeKey] ?? []).join(','), key);
}

/** [실행]을 누르고 가상 보드가 도는 것(phase run)을 기다린다 */
export async function runLab(page: Page): Promise<void> {
  await page.getByRole('button', { name: '실행', exact: true }).click();
  await expect(page.locator('[data-board-io]')).toHaveAttribute('data-board-phase', /^(run|idle)$/u, { timeout: 90_000 });
}

/** [정지]를 누르고 결과가 stopped인지 */
export async function stopLab(page: Page): Promise<void> {
  await page.getByRole('button', { name: '정지', exact: true }).click();
  await expect(labRoot(page)).toHaveAttribute('data-outcome', 'stopped', { timeout: 30_000 });
}

/** 가상 부품을 마우스로 누르고 있는다(돌려준 함수를 부르면 뗀다) */
export async function pressPart(page: Page, id: string): Promise<() => Promise<void>> {
  const part = boardPart(page, id);
  await part.scrollIntoViewIfNeeded();
  const box = await part.boundingBox();
  expect(box, `가상 부품 ${id}이(가) 화면에 없어요.`).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  return async () => {
    await page.mouse.up();
  };
}

/**
 * 편집칸의 한 줄 끝을 키보드로 고친다: 그 줄을 눌러 커서를 두고 End → Backspace를 removeCount번 → insert를 친다.
 * 예: editLineEnd(page, '    if touch.value() == 1:', 2, '0:') → '    if touch.value() == 0:'
 */
export async function editLineEnd(page: Page, line: string, removeCount: number, insert: string): Promise<void> {
  const target = page.locator('[data-lab-editor] .cm-line').filter({ hasText: line.trim() }).first();
  await target.scrollIntoViewIfNeeded();
  expect(await target.textContent(), '고칠 줄을 찾지 못했어요').toBe(line);
  await target.click();
  await page.keyboard.press('End');
  for (let index = 0; index < removeCount; index += 1) {
    await page.keyboard.press('Backspace');
  }
  await page.keyboard.insertText(insert);
}
