/**
 * 4단원 통합 화면(/labs/unit4/, PLAN §8.4 P4-09) 브라우저 테스트 — 완료 기준 "f104~f115가 돈다 · 측정값" 을 이 파일이 지킨다.
 *
 * 묶음
 *   1. 순수 논리(브라우저 없이 Node에서 — 데스크톱 프로젝트에서만 한 번): 성능 요약·표, 주소 값 나누기, 짝 예제·목록 규칙이 실제 파일과 맞는지.
 *   2. 화면: 두 실습실이 한 문서에 뜨고(4단원 예제만), 가상 모니터가 3840×2160이며 그 값을 모듈이 기억하지 않고, 겹친 id가 없고,
 *      실제 보드 블루투스 칸은 숨는다. 공유 링크·?example=이 맞는 칸으로 간다. 휴대폰 폭에서 가로로 넘치지 않는다.
 *   3. [함께 실행](카메라 없이 — 재생 입력의 합성 얼굴, PD-30): f104 → f110 사이트판. 콘솔 `Sent: DATA,…`, 보드가 받은 줄 수 = 보낸 줄 수,
 *      초당 10줄 제한, LCD·서보·레이저·가상 모니터 커서가 따라 움직이고 [함께 정지]로 둘 다 멈춘다.
 *   4. 짝 예제마다(f100↔f099, f104↔f105·f106·f109·f110·f111·f113, f114↔f115 — 원본이 실물에서도 멈추는 f111·f113은 사이트판 —
 *      그리고 같은 블루투스 길의 3단원 f089↔f086·교안 f158↔f157, PLAN §8.4 P4-02 완료 기준) 보드가 컴퓨터 코드의 글을 받아 LCD·콘솔이 바뀐다.
 *      원본 파일의 결과(ModuleNotFoundError 등)는 예제 스모크(사이드카 smoke)가 지킨다.
 *   5. 성능 기록: 두 파이썬 + 얼굴 그물 + 가상 데스크톱 + 가상 보드를 함께 돌리며 fps·긴 작업·메모리(이 탭의 힙과 운영체제가 본 브라우저
 *      프로세스 메모리)를 재어 표로 남긴다(testInfo 첨부 + 표준 출력). `UNIT4_PERF=full`이면 웹캠(가짜 카메라)+얼굴 모델과
 *      영상처리·ESP32 실습실 단독 비교까지 잰다. `UNIT4_PERF_OUT=<파일>`이면 표를 그 파일에도 쓴다.
 *
 * 돌리는 법(병렬 제작 — 개발 서버): PW_BASE_URL=http://localhost:4708/ai-physical-computing/ npx playwright test tests/e2e/unit4.spec.ts --project=desktop --workers=1
 * 파이썬 두 벌을 띄우는 무거운 검사라 한 파일 안에서는 차례로 돈다(describe mode 'default'). 8GB 컴퓨터에서는 --workers=1을 권한다.
 * 개발 서버에 대고 돌릴 때 다른 사람이 파일을 저장하면 Vite가 페이지를 새로 고쳐 실행이 끊길 수 있다(빌드 결과·CI에는 없다 — README 5.3).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { encodeShareCode } from '../../src/lab/controls/share-link.ts';
import { guessSideFromCode, sideForExampleId, sideForFile, takeAddressStash } from '../../src/lab/unit4/address.ts';
import { ADDRESS_STASH_KEY, DESKTOP_SCREEN_STORAGE_NAME, UNIT4_SCREEN_VALUE } from '../../src/lab/unit4/config.ts';
import {
  DEFAULT_BOARD_FILE,
  DEFAULT_PC_FILE,
  PAIRS,
  UNIT4_BOARD_GLOB,
  UNIT4_EXTRA_BOARD_FILES,
  UNIT4_EXTRA_PC_FILES,
  UNIT4_PC_GLOB,
  boardExampleId,
  findPairView,
  isUnit4BoardFile,
  isUnit4PcFile,
  normalizePairParam,
  pairQuery,
  pairViews,
  pcExampleId,
  type Unit4PairView,
} from '../../src/lab/unit4/examples.ts';
import {
  FrameMeter,
  TARGET_INPUT_FPS,
  ratePerSec,
  reportMarkdown,
  summarize,
  summaryText,
  type PerfSample,
  type PerfSummary,
} from '../../src/lab/unit4/perf.ts';
import { storageKey } from '../../src/lib/storage.ts';
import { withBase } from '../../src/lib/url.ts';

const UNIT4_PATH = withBase('labs/unit4/');
const VISION_PATH = withBase('labs/vision/');
const ESP32_PATH = withBase('labs/esp32/');
const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');
/** 파이썬 두 벌(과 OpenCV)을 받는 시간 — 개발 서버·8GB 컴퓨터·병렬 제작 중에는 90초로 모자랐다(구역 A 보고) */
const READY_TIMEOUT = 180_000;
/** 빈 글자 칸에 넣는 줄바꿈 없는 공백(U+00A0 — LCD 부품이 빈 칸을 이것으로 그린다) */
const NBSP = String.fromCharCode(0xa0);

// ── 찾기 도우미 ──

function pcLab(page: Page): Locator {
  return page.locator('[data-lab][data-lab-id="vision"]');
}

function boardLab(page: Page): Locator {
  return page.locator('[data-lab][data-lab-id="esp32"]');
}

function bar(page: Page): Locator {
  return page.locator('[data-unit4]');
}

function part(page: Page, id: string): Locator {
  return boardLab(page).locator(`[data-board-part="${id}"]`);
}

async function lcdRow(page: Page, row: number): Promise<string> {
  const cells = await part(page, 'lcd').locator(`[data-lcd-line="${row}"] [data-lcd-cell]`).allTextContents();
  return cells.map((text) => text.replaceAll(NBSP, ' ')).join('');
}

async function consoleText(lab: Locator): Promise<string> {
  return (await lab.locator('[data-lab-console]').textContent()) ?? '';
}

/** 그 실습실 편집칸의 코드 전체(가상 스크롤과 상관없이 CodeMirror 문서에서 — tests/e2e/helpers/lab.ts editorText와 같은 길) */
async function editorText(lab: Locator): Promise<string> {
  return lab.evaluate((root) => {
    const content = root.querySelector('[data-lab-editor] .cm-content') as (Element & { cmTile?: { root?: { view?: { state?: { doc?: unknown } } } } }) | null;
    const doc = content?.cmTile?.root?.view?.state?.doc;
    if (doc !== undefined && doc !== null && String(doc) !== '[object Object]') {
      return String(doc);
    }
    return [...root.querySelectorAll('[data-lab-editor] .cm-line')].map((line) => line.textContent ?? '').join('\n');
  });
}

/** 컴퓨터 칸이 보낸 줄 수(ble-pc 모듈)와 보드가 받은 줄 수(가상 블루투스 조작 칸) */
async function lineCounts(page: Page): Promise<{ sent: number; received: number }> {
  return page.evaluate(() => {
    const pc = document.querySelector<HTMLElement>('[data-lab][data-lab-id="vision"]');
    const ble = document.querySelector<HTMLElement>('[data-lab][data-lab-id="esp32"] [data-board-part-controls][data-part="ble"]');
    return { sent: Number(pc?.dataset.blePcSent ?? 0), received: Number(ble?.dataset.bleSent ?? 0) };
  });
}

async function openUnit4(page: Page, suffix = ''): Promise<void> {
  const response = await page.goto(`${UNIT4_PATH}${suffix}`);
  expect(response?.status()).toBe(200);
  await expect(bar(page)).toHaveAttribute('data-unit4-ready', 'yes', { timeout: READY_TIMEOUT });
}

async function waitBothReady(page: Page): Promise<void> {
  await expect(pcLab(page)).toHaveAttribute('data-state', 'idle', { timeout: READY_TIMEOUT });
  await expect(boardLab(page)).toHaveAttribute('data-state', 'idle', { timeout: READY_TIMEOUT });
}

/** 조작 줄의 입력 고르기(영상처리 칸의 선택 상자와 같은 값) */
async function chooseInput(page: Page, value: string): Promise<void> {
  const select = bar(page).locator('[data-unit4-input]');
  await expect(select.locator(`option[value="${value}"]`)).toHaveCount(1, { timeout: READY_TIMEOUT });
  await select.selectOption(value);
  await expect(pcLab(page)).toHaveAttribute('data-vision-source', value);
  await expect(pcLab(page).locator('[data-vision-source-select]')).toHaveValue(value);
}

/** 재생 입력 + 합성 얼굴 동작 고르기(mediapipe 모듈 패널 — 코드에 mediapipe가 있어 열려 있다) */
async function chooseReplay(page: Page, sequence = 'face-turn'): Promise<void> {
  await chooseInput(page, 'replay');
  const select = pcLab(page).locator('[data-mediapipe-sequence]');
  await expect(select.locator(`option[value="${sequence}"]`)).toHaveCount(1, { timeout: 60_000 });
  await select.selectOption(sequence);
}

async function runTogether(page: Page): Promise<void> {
  await expect(bar(page).locator('[data-unit4-run]')).toBeEnabled({ timeout: READY_TIMEOUT });
  await bar(page).locator('[data-unit4-run]').click();
  await expect(bar(page)).toHaveAttribute('data-unit4-phase', 'running', { timeout: READY_TIMEOUT });
}

async function stopTogether(page: Page): Promise<void> {
  await bar(page).locator('[data-unit4-stop]').click();
  await expect(bar(page)).toHaveAttribute('data-unit4-phase', 'idle', { timeout: 60_000 });
  await expect(pcLab(page)).toHaveAttribute('data-state', /^(idle|failed)$/u, { timeout: 30_000 });
  await expect(boardLab(page)).toHaveAttribute('data-state', /^(idle|failed)$/u, { timeout: 30_000 });
}

/** examples/ 아래 폴더의 .py 목록(examples/ 뒤 경로, 하위 폴더 포함) */
function pyFilesUnder(relativeDir: string): string[] {
  const root = path.join(REPO_ROOT, 'examples', relativeDir);
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.py')) {
        found.push(path.relative(path.join(REPO_ROOT, 'examples'), full).split(path.sep).join('/'));
      }
    }
  };
  walk(root);
  return found.sort();
}

/**
 * 한 문서에 실습실이 둘이라 생길 수 있는 id 문제 — 같은 id가 두 번 나오거나, 한 실습실 안의 이름표·aria 참조가 다른 실습실을 가리키는 것.
 * 실행하면서 모듈이 새로 그리는 조각도 있으므로 페이지를 연 직후와 실행한 뒤에 모두 본다.
 */
async function idProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const found: string[] = [];
    const seen = new Map<string, number>();
    for (const element of document.querySelectorAll<HTMLElement>('[id]')) {
      seen.set(element.id, (seen.get(element.id) ?? 0) + 1);
    }
    for (const [id, count] of seen) {
      if (count > 1) {
        found.push(`id ${id} ×${count}`);
      }
    }
    for (const root of document.querySelectorAll<HTMLElement>('[data-lab]')) {
      for (const element of root.querySelectorAll<HTMLElement>('[for],[aria-labelledby],[aria-describedby],[aria-controls]')) {
        for (const name of ['for', 'aria-labelledby', 'aria-describedby', 'aria-controls']) {
          for (const token of (element.getAttribute(name) ?? '').split(/\s+/u).filter(Boolean)) {
            const target = document.getElementById(token);
            const targetLab = target?.closest('[data-lab]');
            if (!target) {
              found.push(`${name}=${token} 대상 없음`);
            } else if (targetLab && targetLab !== root) {
              found.push(`${name}=${token}이(가) 다른 실습실을 가리킴`);
            }
          }
        }
      }
    }
    return found;
  });
}

/** 이 화면이 싣는 예제 파일(4단원 폴더 + 같은 블루투스 길의 다른 단원 짝) — 페이지의 예제 목록과 견줄 기준 */
function unit4Files(side: 'pc' | 'board'): string[] {
  const base = side === 'pc' ? pyFilesUnder('vision/u4') : pyFilesUnder('esp32/u4');
  const extra = side === 'pc' ? UNIT4_EXTRA_PC_FILES : UNIT4_EXTRA_BOARD_FILES;
  return [...new Set([...base, ...extra])].sort();
}

function allPairViews(): Unit4PairView[] {
  const pcIds = new Set(unit4Files('pc').map(pcExampleId));
  const boardIds = new Set(unit4Files('board').map(boardExampleId));
  return pairViews(pcIds, boardIds).views;
}

// ── 1. 순수 논리 ──

test.describe('4단원 통합 화면 — 순수 논리(브라우저 없이)', () => {
  test.beforeEach(() => {
    test.skip(test.info().project.name !== 'desktop', '브라우저를 쓰지 않는 검사라 데스크톱 프로젝트에서 한 번만 돌린다');
  });

  test('성능 요약은 0을 "아직 안 돎"으로 빼고, 표·한 줄 글·빈도 계산이 맞다', () => {
    const samples: PerfSample[] = [
      { at: 0, inputFps: 0, outputFps: null, pageFps: null, longTaskMsPerSec: 0, sentPerSec: null, heapMb: 50 },
      { at: 500, inputFps: 12, outputFps: 11, pageFps: 60, longTaskMsPerSec: 30, sentPerSec: 9, heapMb: 60 },
      { at: 1000, inputFps: 14, outputFps: 13, pageFps: 50, longTaskMsPerSec: 0, sentPerSec: 10, heapMb: 70 },
    ];
    const summary = summarize(samples);
    expect(summary.samples).toBe(3);
    expect(summary.seconds).toBe(1);
    expect(summary.inputFps).toEqual({ min: 12, avg: 13, max: 14, count: 2 });
    expect(summary.pageFps).toEqual({ min: 50, avg: 55, max: 60, count: 2 });
    // 긴 작업 0은 "한가함"이라 평균에 넣는다
    expect(summary.longTaskMsPerSec).toEqual({ min: 0, avg: 10, max: 30, count: 3 });
    expect(summary.heapLastMb).toBe(70);
    expect(summaryText(summary)).toContain('카메라 → 파이썬 13.0장/초');
    expect(summaryText(summarize([]))).toContain('아직 잰 값이 없어요');
    const table = reportMarkdown(summary, { where: '시험', input: '재생 입력', examples: 'a → b' });
    expect(table).toContain(`| 카메라 → 파이썬 입력 fps (최대 ${TARGET_INPUT_FPS}) | 12.0 | 13.0 | 14.0 | 2 |`);
    expect(table).toContain('| 보드에 닿은 줄 1초당 (최대 10) | 9.0 | 9.5 | 10.0 | 2 |');
    expect(table).toContain('- 입력: 재생 입력 · 예제: a → b');

    expect(ratePerSec(null, { count: 5, at: 1000 })).toBeNull();
    expect(ratePerSec({ count: 0, at: 0 }, { count: 10, at: 1000 })).toBe(10);
    // 실행을 새로 시작해 셈이 0으로 돌아가면 빈도를 만들지 않는다
    expect(ratePerSec({ count: 10, at: 0 }, { count: 2, at: 500 })).toBeNull();

    // 화면 그리기 빈도: 가짜 시계로 0.5초에 30번 그리면 60장/초
    let now = 0;
    const queue: FrameRequestCallback[] = [];
    const meter = new FrameMeter({
      raf: (callback) => queue.push(callback),
      cancel: () => undefined,
      now: () => now,
    });
    meter.start();
    for (let index = 0; index < 30; index += 1) {
      now += 500 / 30;
      queue.shift()?.(now);
    }
    expect(meter.take()).toBeCloseTo(60, 5);
    meter.stop();
  });

  test('주소의 공유 링크·?example=은 예제 목록과 코드 모양으로 맞는 칸을 고른다', () => {
    expect(sideForFile('vision/u4/4-2-1-face-mouse-ble-tx.py')).toBe('pc');
    expect(sideForFile('esp32/u4/4-2-1-adv-ble-data-lcd.py')).toBe('board');
    expect(sideForFile('esp32/u2/2-1-1-led.py')).toBe('board');
    expect(sideForFile('desktop/01-screen-size.py')).toBe('pc');
    expect(sideForFile('other/x.py')).toBeNull();
    expect(sideForFile('')).toBeNull();

    const pcIds = new Set(['u4-a', 'same']);
    const boardIds = new Set(['u4-b', 'same']);
    expect(sideForExampleId('u4-a', pcIds, boardIds)).toBe('pc');
    expect(sideForExampleId('u4-b', pcIds, boardIds)).toBe('board');
    expect(sideForExampleId('same', pcIds, boardIds)).toBeNull(); // 모호하면 고르지 않는다
    expect(sideForExampleId(undefined, pcIds, boardIds)).toBeNull();

    expect(guessSideFromCode('import ESP32BLE\nble = ESP32BLE.init("ESP32")\n')).toBe('board');
    expect(guessSideFromCode('from machine import Pin\n')).toBe('board');
    expect(guessSideFromCode('import cv2\nimport time, bluetooth\n')).toBe('pc');
    expect(guessSideFromCode('# import machine 은 주석이라 보지 않는다\nprint(1)\n')).toBe('pc');

    const target: Record<string, unknown> = { [ADDRESS_STASH_KEY]: { hash: '#code=abc&ex=u4-b', example: 'esp32/u4/a.py' } };
    expect(takeAddressStash(target)).toEqual({ hash: '#code=abc&ex=u4-b', example: 'esp32/u4/a.py' });
    expect(ADDRESS_STASH_KEY in target).toBe(false); // 한 번 꺼내면 지운다
    expect(takeAddressStash(target)).toBeNull();
    expect(takeAddressStash({ [ADDRESS_STASH_KEY]: { hash: 3 } })).toBeNull();
    // ?pair=(짝 이름)도 맡겨 둔다(미해결 179)
    expect(takeAddressStash({ [ADDRESS_STASH_KEY]: { pair: '4-1-4' } })).toEqual({ pair: '4-1-4' });
  });

  test('?pair=: 짝 이름(id)은 겹치지 않고 차시 번호로 시작하며, 차시 번호만 적으면 그 차시의 첫 짝이다(미해결 179)', () => {
    const ids = PAIRS.map((pair) => pair.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const pair of PAIRS) {
      expect(normalizePairParam(pair.id), pair.label).toBe(pair.id);
      // 차시 짝은 이름이 화면 이름의 차시 번호로 시작한다(4-2-1 심화 → 4-2-1-adv)
      const lesson = /\d-\d-\d/u.exec(pair.label)?.[0];
      if (lesson !== undefined) {
        expect(pair.id === lesson || pair.id.startsWith(`${lesson}-`), `${pair.id} ← ${pair.label}`).toBe(true);
      }
    }
    const views = allPairViews();
    expect(findPairView('4-1-4', views)?.label).toBe('4-1-4 — 코 좌표를 LCD에');
    expect(findPairView(' 4-2-1-ADV ', views)?.label).toBe('4-2-1 심화 — 서보 두 개');
    expect(findPairView('4-2-2', views)?.label).toBe('4-2-2 기본 — 서보와 RGB LED');
    // 차시 번호로 시작하는 짝이 여럿이어도 id가 딱 맞는 것이 먼저, 없으면 목록 차례의 첫 짝
    expect(findPairView('4-2', views)?.id).toBe('4-2-1');
    expect(findPairView('9-9-9', views)).toBeNull();
    expect(findPairView('<script>', views)).toBeNull();
    expect(findPairView('', views)).toBeNull();
    expect(pairQuery('4-1-4')).toBe('?pair=4-1-4');
  });

  test('차시 md의 4단원 통합 실습실 ?pair= 링크가 모두 있는 짝을 가리킨다(짝 이름을 바꾸면 차시 링크도 함께 — 미해결 179)', () => {
    const lessonsDir = path.join(REPO_ROOT, 'content', 'lessons');
    const links: { file: string; value: string }[] = [];
    for (const unit of fs.readdirSync(lessonsDir)) {
      const dir = path.join(lessonsDir, unit);
      if (!fs.statSync(dir).isDirectory()) {
        continue;
      }
      for (const name of fs.readdirSync(dir).filter((file) => file.endsWith('.md'))) {
        const text = fs.readFileSync(path.join(dir, name), 'utf8');
        for (const match of text.matchAll(/\/labs\/unit4\/\?pair=([^)\s"'#&]+)/gu)) {
          links.push({ file: `${unit}/${name}`, value: decodeURIComponent(match[1] ?? '') });
        }
      }
    }
    // 4-1-4 따라하기(와 4-2-1·4-2-2 2단계)가 링크 하나로 두 칸을 채운다
    expect(links.map((link) => link.file)).toEqual(expect.arrayContaining(['u4/4-1-4.md', 'u4/4-2-1.md', 'u4/4-2-2.md']));
    const views = allPairViews();
    for (const link of links) {
      expect(findPairView(link.value, views), `${link.file}의 ?pair=${link.value}`).not.toBeNull();
      // 차시 링크는 짝 이름을 그대로 적는다(차시 번호만 적는 줄임은 주소를 손으로 칠 때만)
      expect(views.some((view) => view.id === link.value), `${link.file}의 ?pair=${link.value}는 짝 이름 그대로`).toBe(true);
    }
  });

  test('짝 예제와 목록 규칙이 실제 예제 파일과 맞는다', () => {
    const pcFiles = unit4Files('pc');
    const boardFiles = unit4Files('board');
    expect(pcFiles).toContain(DEFAULT_PC_FILE);
    expect(boardFiles).toContain(DEFAULT_BOARD_FILE);
    for (const file of [...UNIT4_EXTRA_PC_FILES, ...UNIT4_EXTRA_BOARD_FILES]) {
      expect(fs.existsSync(path.join(REPO_ROOT, 'examples', file)), `함께 싣는 예제 ${file}`).toBe(true);
    }
    for (const file of pcFiles) {
      expect(isUnit4PcFile(file), file).toBe(true);
      expect(isUnit4BoardFile(file), file).toBe(false);
    }
    for (const file of boardFiles) {
      expect(isUnit4BoardFile(file), file).toBe(true);
      expect(isUnit4PcFile(file), file).toBe(false);
    }
    // 짝이 가리키는 파일이 모두 있다(빠지면 화면에서 그 짝이 조용히 사라진다 — 여기서 먼저 잡는다)
    const views = allPairViews();
    expect(views.map((view) => view.label)).toEqual(PAIRS.map((pair) => pair.label));
    // 페이지가 읽는 파일 모양(import.meta.glob은 글자 그대로만 받는다)이 설정과 같다
    const page = fs.readFileSync(path.join(REPO_ROOT, 'src', 'pages', 'labs', 'unit4', 'index.astro'), 'utf8');
    for (const glob of [UNIT4_PC_GLOB, UNIT4_BOARD_GLOB, ...[...UNIT4_EXTRA_PC_FILES, ...UNIT4_EXTRA_BOARD_FILES].map((file) => `/examples/${file}`)]) {
      expect(page, `페이지의 glob에 ${glob}`).toContain(`'${glob}'`);
      expect(page, `페이지의 사이드카 glob에 ${glob}`).toContain(`'${glob.replace(/\.py$/u, '.meta.yaml')}'`);
    }
  });
});

// ── 2. 화면 ──

test.describe('4단원 통합 화면 — 한 문서에 두 실습실', () => {
  test.describe.configure({ mode: 'default', timeout: 300_000 });

  test('두 실습실이 뜨고(4단원 예제만), 가상 모니터는 3840×2160이며 겹친 id·넘침이 없다', async ({ page }, testInfo) => {
    await openUnit4(page);
    await expect(pcLab(page)).toHaveCount(1);
    await expect(boardLab(page)).toHaveCount(1);

    // 4단원 폴더의 예제만 싣는다(두 실습실 전체를 싣지 않는다 — 페이지 무게)
    const lists = await page.evaluate(() =>
      Object.fromEntries(
        [...document.querySelectorAll<HTMLElement>('[data-lab]')].map((root) => {
          const script = root.querySelector('script[data-lab-examples]');
          const examples = JSON.parse(script?.textContent ?? '[]') as { file?: string }[];
          return [root.dataset.labId ?? '', examples.map((example) => example.file ?? '').sort()];
        }),
      ),
    );
    expect(lists.vision).toEqual(unit4Files('pc'));
    expect(lists.esp32).toEqual(unit4Files('board'));

    // 처음 고르는 짝: 4-2-1 최종판 → 4-2-2 심화 사이트판
    await expect(pcLab(page)).toHaveAttribute('data-example', pcExampleId(DEFAULT_PC_FILE));
    await expect(boardLab(page)).toHaveAttribute('data-example', boardExampleId(DEFAULT_BOARD_FILE));

    // 가상 모니터 3840×2160 — 그 값을 가상 데스크톱 모듈이 기억하지 않는다(영상처리 실습실의 1920×1080 예제에 번지지 않게)
    await expect(bar(page)).toHaveAttribute('data-unit4-screen', UNIT4_SCREEN_VALUE, { timeout: READY_TIMEOUT });
    await expect(pcLab(page).locator('[data-desktop-screen]')).toHaveValue(UNIT4_SCREEN_VALUE);
    await expect(bar(page).locator('[data-unit4-screen-note]')).toContainText('3840×2160');
    expect(await page.evaluate((key) => window.localStorage.getItem(key), storageKey(DESKTOP_SCREEN_STORAGE_NAME))).toBeNull();

    // 겹친 id가 없고, 이름표·aria 참조가 같은 실습실 안(또는 실습실 밖)을 가리킨다
    expect(Number(await bar(page).getAttribute('data-unit4-ids'))).toBeGreaterThan(0);
    expect(await idProblems(page)).toEqual([]);

    // 실제 보드 블루투스 칸은 이 화면에서 숨는다(컴퓨터 코드의 좌표가 그 보드로 가지 않으므로)
    const realBle = page.locator('[data-lab-module-panel="web-bluetooth"]');
    await expect(realBle).toHaveCount(2);
    await expect(realBle.nth(0)).toBeHidden();
    await expect(realBle.nth(1)).toBeHidden();

    // 좁은 화면에서도 가로로 넘치지 않는다
    if (testInfo.project.name === 'mobile') {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    }

    // [바로 가기] — 보드 그림으로 옮겨 가고 초점도 그리로 간다
    await bar(page).locator('[data-unit4-jump="board"]').click();
    await expect(boardLab(page).locator('[data-board-stage-wrap]')).toBeFocused();
    await expect(boardLab(page).locator('[data-board-stage-wrap]')).toBeInViewport();
  });

  test('공유 링크(#code=)와 ?example=은 맞는 칸으로 가고 다른 칸은 그대로다', async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop', '주소 처리는 화면 크기와 상관없어 데스크톱에서만');
    const boardFile = 'esp32/u4/4-2-1-adv-ble-data-lcd.py';
    const boardCode = '# 공유 링크 시험(보드 칸)\nfrom machine import Pin\nprint("board share")\n';
    await openUnit4(page, `#code=${encodeShareCode(boardCode)}&ex=${boardExampleId(boardFile)}`);
    await expect(bar(page)).toHaveAttribute('data-unit4-address', 'share:board');
    await expect(boardLab(page)).toHaveAttribute('data-example', boardExampleId(boardFile));
    await expect(boardLab(page)).toHaveAttribute('data-share-loaded', 'yes');
    await expect.poll(() => editorText(boardLab(page))).toContain('board share');
    expect(await editorText(pcLab(page))).not.toContain('board share');
    await expect(pcLab(page)).toHaveAttribute('data-example', pcExampleId(DEFAULT_PC_FILE));
    expect(page.url()).not.toContain('code=');

    const other = 'esp32/u4/4-2-1-adv-ble-servo-lcd.py';
    await openUnit4(page, `?example=${encodeURIComponent(other)}`);
    await expect(bar(page)).toHaveAttribute('data-unit4-address', 'example:board');
    await expect(boardLab(page)).toHaveAttribute('data-example', boardExampleId(other));
    // 영상처리 칸이 "링크에 적힌 예제를 찾지 못했어요"를 띄우지 않는다
    expect(await pcLab(page).getAttribute('data-example-missing')).toBeNull();
    expect(page.url()).not.toContain('example=');
  });

  test('?pair=<짝 이름>은 두 칸에 짝 예제를 함께 불러오고, 모르는 짝이면 안내만 한다(4-1-4 따라하기 링크 — 미해결 179)', async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop', '주소 처리는 화면 크기와 상관없어 데스크톱에서만');
    await openUnit4(page, '?pair=4-1-4');
    await expect(bar(page)).toHaveAttribute('data-unit4-address', 'pair:4-1-4');
    await expect(pcLab(page)).toHaveAttribute('data-example', pcExampleId('vision/u4/4-1-4-adv-face-ble-tx.py'));
    await expect(boardLab(page)).toHaveAttribute('data-example', boardExampleId('esp32/u4/4-1-4-ble-lcd-rx.py'));
    await expect(bar(page).locator('[data-unit4-status]')).toContainText('4-1-4 — 코 좌표를 LCD에');
    await expect(bar(page).locator('[data-unit4-status]')).toContainText('[함께 실행]');
    // 두 실습실 틀이 ?pair=을 모르는 주소 값으로 보고 "찾지 못했어요"를 띄우지 않는다(주소에서 지웠다)
    expect(page.url()).not.toContain('pair=');
    expect(await pcLab(page).getAttribute('data-example-missing')).toBeNull();
    expect(await boardLab(page).getAttribute('data-example-missing')).toBeNull();
    await bar(page).screenshot({ path: test.info().outputPath('unit4-pair-4-1-4.png') });

    await openUnit4(page, '?pair=4-2-1-adv');
    await expect(bar(page)).toHaveAttribute('data-unit4-address', 'pair:4-2-1-adv');
    await expect(boardLab(page)).toHaveAttribute('data-example', boardExampleId('esp32/u4/4-2-1-adv-ble-servo-lcd.py'));

    await openUnit4(page, '?pair=없는짝');
    await expect(bar(page)).toHaveAttribute('data-unit4-address', 'pair:missing');
    await expect(bar(page).locator('[data-unit4-status]')).toContainText('짝 예제를 이 화면에서 찾지 못했어요');
    // 두 칸은 처음 짝(4-2-1 최종판 → 4-2-2 심화 사이트판) 그대로다
    await expect(pcLab(page)).toHaveAttribute('data-example', pcExampleId(DEFAULT_PC_FILE));
    await expect(boardLab(page)).toHaveAttribute('data-example', boardExampleId(DEFAULT_BOARD_FILE));
  });
});

// ── 3·4. [함께 실행] ──

test.describe('4단원 통합 화면 — [함께 실행](재생 입력, 카메라 없이)', () => {
  test.describe.configure({ mode: 'default', timeout: 600_000 });

  test.beforeEach(() => {
    test.skip(test.info().project.name !== 'desktop', '파이썬 두 벌을 돌리는 무거운 검사라 데스크톱에서만(휴대폰 폭은 화면 검사가 본다)');
  });

  test('f104 → f110 사이트판: 합성 얼굴이 고개를 돌리면 좌표가 보드로 가 LCD·서보·레이저·가상 모니터가 따라 움직인다', async ({ page }) => {
    await openUnit4(page);
    await waitBothReady(page);
    await chooseReplay(page, 'face-turn');
    await runTogether(page);
    await expect(bar(page)).toHaveAttribute('data-unit4-connected', 'true');
    await expect(bar(page).locator('[data-unit4-status]')).toContainText('두 칸이 함께 돌고 있어요');

    // 컴퓨터 칸: 원본처럼 `Sent: …`(§7.6 ⑤), 보드 칸: 받은 줄 수가 보낸 줄 수를 따라온다
    await expect.poll(() => consoleText(pcLab(page)), { timeout: 60_000 }).toMatch(/Sent: DATA,\d+,\d+,0,0/u);
    // 원본이 연결될 때 찍는 줄은 이어졌을 때 한 번만(ble-pc bluetooth.py)
    expect((await consoleText(pcLab(page))).match(/Connected to 가상 ESP32 보드/gu)?.length ?? 0).toBe(1);
    await expect.poll(async () => (await lineCounts(page)).received, { timeout: 30_000 }).toBeGreaterThanOrEqual(10);
    const first = await lineCounts(page);
    const firstAt = Date.now();

    // LCD: 첫 줄에 좌표, 둘째 줄의 19글자가 넘쳐 첫 줄 앞 3칸을 덮는 원본 그대로(CODE_MAPPING f105 비고)
    await expect.poll(() => lcdRow(page, 1), { timeout: 30_000 }).toContain('d_c:');
    await expect.poll(() => lcdRow(page, 0), { timeout: 30_000 }).toContain('Y:');

    // 서보 X는 고개를 돌리는 동안 여러 각도를 지난다(좌표 → map(x, 0, 3840, 0, 180))
    const angles = new Set<string>();
    const lit = new Set<string>();
    const until = Date.now() + 8_000;
    while (Date.now() < until) {
      angles.add((await part(page, 'servo-x').getAttribute('data-visual-angle')) ?? '');
      lit.add((await part(page, 'laser').getAttribute('data-visual-lit')) ?? '');
      await page.waitForTimeout(60);
    }
    expect(angles.size, `서보 X 각도: ${[...angles].join(', ')}`).toBeGreaterThanOrEqual(3);
    // 사이트판은 값이 올 때 켜고 안 오면 끈다(PD-23) — 켜진 순간이 한 번은 보인다
    expect([...lit]).toContain('true');

    // 상태 글이 화면 밖이면(아래 보드 칸을 보는 동안) 화면 위에 같은 글이 한 줄 떠 있다(2026-09-25 Phase 4 검토 반영 — 사용성 I6)
    await page.locator('[data-board-io]').scrollIntoViewIfNeeded();
    await expect(bar(page).locator('[data-unit4-status]')).not.toBeInViewport();
    const float = bar(page).locator('[data-unit4-float]');
    await expect(float).toBeVisible();
    await expect(float).toBeInViewport();
    await expect(float.locator('[data-unit4-float-text]')).toContainText('두 칸이 함께 돌고 있어요');
    await float.getByRole('button', { name: '조작 줄 보기' }).click();
    await expect(bar(page).locator('[data-unit4-status]')).toBeInViewport();
    await expect(float).toBeHidden();

    // 가상 모니터 커서가 가운데(1920, 1080)에서 움직였다
    await expect(pcLab(page).locator('[data-desktop-cursor]')).toContainText('3840×2160');
    await expect.poll(async () => (await pcLab(page).locator('[data-desktop-cursor]').textContent()) ?? '', { timeout: 20_000 }).not.toContain('(1920, 1080)');

    // 보낸 줄 = 받은 줄(차례에 남은 한두 줄은 오가는 중), 초당 10줄 제한(PLAN §7.2 규칙 4)
    const later = await lineCounts(page);
    expect(Math.abs(later.sent - later.received)).toBeLessThanOrEqual(2);
    const perSecond = ((later.received - first.received) * 1000) / (Date.now() - firstAt);
    expect(perSecond).toBeLessThanOrEqual(10.5);
    expect(perSecond).toBeGreaterThan(2);

    // 성능 칸: 컴퓨터 코드가 도는 동안 잰 값
    await expect.poll(async () => Number(await bar(page).getAttribute('data-unit4-samples')), { timeout: 20_000 }).toBeGreaterThanOrEqual(6);
    const summary = JSON.parse((await bar(page).getAttribute('data-unit4-summary')) ?? '{}') as PerfSummary;
    expect(summary.inputFps?.avg ?? 0).toBeGreaterThan(1);
    expect(summary.sentPerSec?.max ?? 0).toBeLessThanOrEqual(12);
    await bar(page).locator('summary', { hasText: '성능 재기' }).click();
    await expect(bar(page).locator('[data-unit4-perf]')).toContainText('카메라 → 파이썬');
    await expect(bar(page).locator('[data-unit4-report]')).toHaveValue(/\| 화면 그리기 fps/u);

    await stopTogether(page);
    await expect(bar(page).locator('[data-unit4-status]')).toHaveText('멈췄어요.');
    await expect(bar(page).locator('[data-unit4-run]')).toBeEnabled();
    // 실행하며 모듈이 새로 그린 조각(출력 창 탭·부품 조작 칸 등)까지 id가 겹치지 않는다
    expect(await idProblems(page)).toEqual([]);
  });

  test('윙크 재생 입력(face-wink): 합성 얼굴이 눈을 오래 감으면 클릭 줄이 합쳐지지 않고 보드까지 간다(§7.6 ③, 2026-09-24 통합)', async ({ page }) => {
    await openUnit4(page);
    await waitBothReady(page);
    await chooseReplay(page, 'face-wink');
    await runTogether(page);
    await expect(bar(page)).toHaveAttribute('data-unit4-connected', 'true');

    // 컴퓨터 칸: 원본 f104가 왼쪽 눈을 0.4초 넘게 감으면 더블클릭, 두 눈이면 우클릭을 찍는다(카메라 없이 — PD-30 합성 좌표)
    await expect.poll(() => consoleText(pcLab(page)), { timeout: 60_000 }).toContain('더블클릭!');
    await expect.poll(() => consoleText(pcLab(page)), { timeout: 60_000 }).toContain('우클릭!');

    // 보드 칸: 받은 기록에 클릭 표시가 1인 줄이 있다 — 초당 10줄로 줄이며 상태 줄은 바꿔 끼워도 클릭 줄은 그대로 간다(§7.6 ③)
    const seen = new Set<string>();
    const log = boardLab(page).locator('[data-board-part-controls][data-part="ble"] [data-ble-log]');
    const until = Date.now() + 30_000;
    while (Date.now() < until && seen.size < 2) {
      for (const match of (await log.inputValue()).matchAll(/DATA,\d+,\d+,(1,0|0,1)/gu)) {
        seen.add(match[1]!);
      }
      await page.waitForTimeout(200);
    }
    expect([...seen].sort(), '보드가 받은 클릭 줄(더블클릭 1,0 · 우클릭 0,1)').toEqual(['0,1', '1,0']);

    await stopTogether(page);
    await expect(boardLab(page).locator('[data-lab-console]')).not.toContainText('Traceback');
  });

  test('짝 예제마다 보드가 컴퓨터 코드의 글을 받는다(f100↔f099, f104↔f105·f106·f109·f110·f111·f113, f114↔f115, f089↔f086, f158↔f157)', async ({ page }) => {
    /** 보드 예제마다 확인할 것 — LCD(보드 코드의 lcd.putstr) 또는 보드 콘솔(print). 적지 않은 4-2 보드는 LCD 둘째 줄 d_c: */
    type BoardCheck = { kind: 'lcd'; row: number; text: RegExp } | { kind: 'console'; text: RegExp };
    const boardChecks: Record<string, BoardCheck> = {
      'esp32/u4/4-1-4-ble-lcd-rx.py': { kind: 'lcd', row: 0, text: /X:\d+\s+Y:\d+/u },
      'esp32/u4/4-2-2-explore-rgb-buzzer-site.py': { kind: 'lcd', row: 1, text: /Moving|Double|Right/u },
      'esp32/u3/3-1-3-ble-xy-rgb.py': { kind: 'console', text: /Received finger_x: \d+, finger_y: \d+/u },
      'esp32/bt/b10-two-values-rgb.py': { kind: 'console', text: /Received finger_x: \d+, finger_y: \d+/u },
    };
    const views = allPairViews();
    expect(views.length).toBe(PAIRS.length);
    await openUnit4(page);
    await waitBothReady(page);
    await chooseReplay(page, 'face-turn');
    await bar(page).locator('summary', { hasText: '짝 예제 바꾸기' }).click();
    const results: string[] = [];
    for (const [index, view] of views.entries()) {
      const pair = PAIRS[index]!;
      await bar(page).getByRole('button', { name: `${view.label} 짝 불러오기` }).click();
      await expect(pcLab(page)).toHaveAttribute('data-example', view.pcId);
      await expect(boardLab(page)).toHaveAttribute('data-example', view.boardId);
      await expect(bar(page).locator('[data-unit4-pair-status]')).toContainText('불러왔어요');

      await runTogether(page);
      await expect(bar(page)).toHaveAttribute('data-unit4-connected', 'true', { timeout: 30_000 });
      await expect.poll(async () => (await lineCounts(page)).received, { timeout: 60_000, message: `${view.label}: 보드가 받은 줄` }).toBeGreaterThanOrEqual(3);
      const check: BoardCheck = boardChecks[pair.board] ?? { kind: 'lcd', row: 1, text: /d_c:/u };
      let seen: string;
      if (check.kind === 'lcd') {
        await expect.poll(() => lcdRow(page, check.row), { timeout: 30_000, message: `${view.label}: LCD ${check.row}번 줄` }).toMatch(check.text);
        seen = `LCD "${(await lcdRow(page, 0)).trim()}" / "${(await lcdRow(page, 1)).trim()}"`;
      } else {
        await expect.poll(() => consoleText(boardLab(page)), { timeout: 30_000, message: `${view.label}: 보드 콘솔` }).toMatch(check.text);
        seen = `보드 콘솔 "${check.text.exec(await consoleText(boardLab(page)))?.[0] ?? ''}"`;
      }
      const counts = await lineCounts(page);
      results.push(`${view.label}: 보냄 ${counts.sent} · 받음 ${counts.received} · ${seen}`);
      await stopTogether(page);
    }
    test.info().annotations.push({ type: '짝 예제 결과', description: results.join('\n') });
    console.log(`[4단원 통합 화면 짝 예제]\n${results.join('\n')}`);
  });
});

// ── 컴퓨터 쪽 bluetooth 흉내(ble-pc) — 이 화면이 기대는 모듈을 보드가 없는 영상처리 실습실에서 ──

test.describe('컴퓨터 쪽 bluetooth 흉내 — 보드가 없는 화면', () => {
  test.describe.configure({ mode: 'default', timeout: 300_000 });

  test('영상처리 실습실만 열면 보드가 없다고 한 번 알리고, 연결 전 send는 2초에 한 번만 알린다', async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop', '파이썬 흉내 동작이라 데스크톱에서만');
    const response = await page.goto(VISION_PATH);
    expect(response?.status()).toBe(200);
    const lab = page.locator('[data-lab]');
    await expect(lab).toHaveAttribute('data-state', 'idle', { timeout: READY_TIMEOUT });
    const code = [
      'import bluetooth, bluetooth_lib',
      'b = bluetooth.init("XX:XX:XX:XX:XX:XX")',
      'print("connected:", b.connected)',
      'for i in range(40):',
      '    b.send("DATA,1,2,0,0")',
      'c = bluetooth_lib.init("XX:XX:XX:XX:XX:XX")',
      'print("same class:", type(b) is type(c))',
      'b.disconnect()',
      'print("끝")',
      '',
    ].join('\n');
    // 편집칸 넣기(tests/e2e/helpers/lab.ts setEditorCode와 같은 길 — 이 페이지는 실습실이 하나다)
    const content = lab.locator('[data-lab-editor] .cm-content');
    await content.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Backspace');
    await page.keyboard.insertText(code);
    await expect.poll(() => editorText(lab)).toContain('print("끝")');
    await lab.getByRole('button', { name: '실행', exact: true }).click();
    await expect(lab).toHaveAttribute('data-outcome', 'ok', { timeout: 120_000 });
    const text = await consoleText(lab);
    expect(text).toContain('4단원 통합 실습실');
    expect(text).toContain('connected: False');
    expect(text.match(/Unable to send data: Not connected\./gu)?.length ?? 0).toBe(1);
    expect(text).toContain('same class: True');
    expect(text).not.toContain('Connected to');
    expect(text).not.toContain('Disconnected from');
    expect(text).toContain('끝');
    await expect(lab).toHaveAttribute('data-ble-pc-sent', '0');
  });
});

// ── 5. 성능 기록 ──

interface ProcessMemory {
  /** 이 페이지(두 파이썬 워커 포함)의 렌더러 프로세스 — 렌더러 가운데 가장 큰 것(MB, 운영체제가 본 전용 메모리) */
  readonly rendererMb: number;
  /** 브라우저 프로세스 전체(렌더러·GPU·브라우저·유틸리티) 합(MB) */
  readonly totalMb: number;
  /** 프로세스 종류별 합(MB) */
  readonly byType: Record<string, number>;
}

/**
 * 운영체제가 본 브라우저 프로세스 메모리. CDP SystemInfo.getProcessInfo로 이 브라우저의 프로세스 번호를 얻고,
 * Windows는 Get-Process의 PrivateMemorySize64(전용 바이트), 리눅스는 /proc/<번호>/status의 VmRSS(상주 메모리)를 읽는다.
 * 크로뮴 계열이 아니거나 읽지 못하면 null.
 */
async function processMemory(browser: Browser): Promise<ProcessMemory | null> {
  if (browser.browserType().name() !== 'chromium') {
    return null;
  }
  let info: { processInfo: { type: string; id: number }[] };
  try {
    const session = await browser.newBrowserCDPSession();
    try {
      info = (await session.send('SystemInfo.getProcessInfo')) as unknown as { processInfo: { type: string; id: number }[] };
    } finally {
      await session.detach().catch(() => undefined);
    }
  } catch {
    return null;
  }
  const pids = info.processInfo.map((item) => item.id).filter((id) => Number.isInteger(id) && id > 0);
  if (pids.length === 0) {
    return null;
  }
  const bytesByPid = new Map<number, number>();
  try {
    if (process.platform === 'win32') {
      const output = execFileSync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', `Get-Process -Id ${pids.join(',')} -ErrorAction SilentlyContinue | Select-Object Id,PrivateMemorySize64 | ConvertTo-Json -Compress`],
        { encoding: 'utf8', timeout: 30_000 },
      ).trim();
      const parsed = JSON.parse(output || '[]') as { Id: number; PrivateMemorySize64: number } | { Id: number; PrivateMemorySize64: number }[];
      for (const item of Array.isArray(parsed) ? parsed : [parsed]) {
        bytesByPid.set(item.Id, item.PrivateMemorySize64);
      }
    } else if (process.platform === 'linux') {
      for (const pid of pids) {
        const status = fs.readFileSync(`/proc/${pid}/status`, 'utf8');
        const match = /^VmRSS:\s+(\d+)\s+kB/mu.exec(status);
        if (match) {
          bytesByPid.set(pid, Number(match[1]) * 1024);
        }
      }
    } else {
      return null;
    }
  } catch {
    return null;
  }
  const mb = (bytes: number) => bytes / (1024 * 1024);
  const byType: Record<string, number> = {};
  let rendererMb = 0;
  let totalMb = 0;
  for (const item of info.processInfo) {
    const bytes = bytesByPid.get(item.id);
    if (bytes === undefined) {
      continue;
    }
    byType[item.type] = (byType[item.type] ?? 0) + mb(bytes);
    totalMb += mb(bytes);
    if (item.type === 'renderer') {
      rendererMb = Math.max(rendererMb, mb(bytes));
    }
  }
  return { rendererMb, totalMb, byType };
}

/**
 * 페이지 안에서 0.5초마다 재는 탐침(4단원 화면의 재기와 같은 값을 영상처리·ESP32 실습실 단독에서도 같은 방식으로 재려고 둔다).
 * 입력·출력 fps는 영상처리 칸의 data-fps, 보낸 줄은 ble-pc 모듈의 data-ble-pc-sent, 힙은 performance.memory.
 */
async function startProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const samples: unknown[] = [];
    let frames = 0;
    let longTaskMs = 0;
    let running = true;
    const count = () => {
      frames += 1;
      if (running) {
        requestAnimationFrame(count);
      }
    };
    requestAnimationFrame(count);
    let observer: PerformanceObserver | null = null;
    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          longTaskMs += entry.duration;
        }
      });
      observer.observe({ type: 'longtask', buffered: false });
    } catch {
      observer = null;
    }
    const readFps = (selector: string) => {
      const raw = document.querySelector<HTMLElement>(selector)?.dataset.fps;
      return raw === undefined || raw === '' ? null : Number(raw);
    };
    let last = performance.now();
    let lastSent: number | null = null;
    const timer = window.setInterval(() => {
      const now = performance.now();
      const elapsed = now - last;
      const sentRaw = document.querySelector<HTMLElement>('[data-lab][data-lab-id="vision"]')?.dataset.blePcSent;
      const sent = sentRaw === undefined || sentRaw === '' ? null : Number(sentRaw);
      const memory = (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory;
      samples.push({
        at: now,
        inputFps: readFps('[data-vision-input-status]'),
        outputFps: readFps('[data-vision-output-status]'),
        pageFps: (frames * 1000) / elapsed,
        longTaskMsPerSec: observer ? (longTaskMs * 1000) / elapsed : null,
        sentPerSec: sent !== null && lastSent !== null && sent >= lastSent ? ((sent - lastSent) * 1000) / elapsed : null,
        heapMb: typeof memory?.usedJSHeapSize === 'number' ? memory.usedJSHeapSize / (1024 * 1024) : null,
      });
      frames = 0;
      longTaskMs = 0;
      last = now;
      lastSent = sent;
    }, 500);
    (window as unknown as { __unit4Probe: unknown }).__unit4Probe = {
      stop() {
        running = false;
        window.clearInterval(timer);
        observer?.disconnect();
        return samples;
      },
    };
  });
}

async function stopProbe(page: Page): Promise<PerfSample[]> {
  return page.evaluate(() => (window as unknown as { __unit4Probe: { stop(): PerfSample[] } }).__unit4Probe.stop());
}

interface ScenarioResult {
  readonly name: string;
  readonly readyMs: number;
  readonly idle: ProcessMemory | null;
  readonly running: ProcessMemory | null;
  readonly summary: PerfSummary;
}

interface Scenario {
  readonly name: string;
  readonly url: string;
  /** 'unit4' = [함께 실행], 'vision' = 영상처리 실습실 [실행], 'esp32' = ESP32 실습실 [실행] */
  readonly mode: 'unit4' | 'vision' | 'esp32';
  /** 영상처리 입력(replay·webcam) */
  readonly input?: string;
  readonly seconds: number;
}

async function measureScenario(browser: Browser, scenario: Scenario): Promise<ScenarioResult> {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, permissions: ['camera'], locale: 'ko-KR' });
  const page = await context.newPage();
  try {
    const started = Date.now();
    const response = await page.goto(scenario.url);
    expect(response?.status()).toBe(200);
    const labs = scenario.mode === 'unit4' ? [pcLab(page), boardLab(page)] : [page.locator('[data-lab]')];
    for (const lab of labs) {
      await expect(lab).toHaveAttribute('data-state', 'idle', { timeout: READY_TIMEOUT });
    }
    const readyMs = Date.now() - started;
    await page.waitForTimeout(3_000); // 준비 직후 흔들림(모듈 붙이기·첫 그리기)이 가라앉게
    const idle = await processMemory(browser);

    if (scenario.mode === 'unit4') {
      if (scenario.input === 'replay') {
        await chooseReplay(page, 'face-turn');
      } else if (scenario.input) {
        await chooseInput(page, scenario.input);
      }
      await startProbe(page);
      await runTogether(page);
    } else {
      if (scenario.mode === 'vision' && scenario.input) {
        const select = page.locator('[data-vision-source-select]');
        await expect(select.locator(`option[value="${scenario.input}"]`)).toHaveCount(1, { timeout: READY_TIMEOUT });
        await select.selectOption(scenario.input);
      }
      await startProbe(page);
      await page.getByRole('button', { name: '실행', exact: true }).click();
      await expect(page.locator('[data-lab]')).toHaveAttribute('data-state', 'running', { timeout: READY_TIMEOUT });
    }
    await page.waitForTimeout(scenario.seconds * 1000);
    const running = await processMemory(browser);
    const summary = summarize(await stopProbe(page));
    if (scenario.mode === 'unit4') {
      await stopTogether(page);
    } else {
      await page.getByRole('button', { name: '정지', exact: true }).click();
    }
    return { name: scenario.name, readyMs, idle, running, summary };
  } finally {
    await context.close();
  }
}

function perfTable(results: readonly ScenarioResult[], where: string): string {
  const one = (value: number | null | undefined, digits = 1) => (typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '—');
  const lines: string[] = [];
  lines.push(`### 4단원 통합 화면 성능 측정 (${where})`);
  lines.push('');
  lines.push('| 경우 | 준비까지 | 렌더러 메모리(준비 → 실행 중) | 브라우저 전체 메모리(실행 중) | 탭 힙(평균·최대) | 입력 fps(평균·최저) | 출력 fps | 화면 fps(평균·최저) | 긴 작업 ms/초(평균·최대) | 보드로 줄/초 |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|');
  for (const result of results) {
    const s = result.summary;
    lines.push(
      [
        '',
        result.name,
        `${one(result.readyMs / 1000)}초`,
        `${one(result.idle?.rendererMb, 0)} → ${one(result.running?.rendererMb, 0)}MB`,
        `${one(result.running?.totalMb, 0)}MB`,
        `${one(s.heapMb?.avg)}·${one(s.heapMb?.max)}MB`,
        `${one(s.inputFps?.avg)}·${one(s.inputFps?.min)}`,
        one(s.outputFps?.avg),
        `${one(s.pageFps?.avg)}·${one(s.pageFps?.min)}`,
        `${one(s.longTaskMsPerSec?.avg)}·${one(s.longTaskMsPerSec?.max)}`,
        one(s.sentPerSec?.avg),
        '',
      ].join(' | ').trim(),
    );
  }
  lines.push('');
  lines.push('- 렌더러 메모리 = 이 탭의 렌더러 프로세스(메인 스레드 + 파이썬 워커 + WebAssembly)의 전용 메모리(Windows Get-Process PrivateMemorySize64 · 리눅스 VmRSS).');
  lines.push('- 입력 fps의 최대는 15(사이트가 막음), 보드로 보내는 줄의 최대는 초당 10(브릿지 규칙). 화면 fps는 requestAnimationFrame 빈도.');
  return lines.join('\n');
}

test.describe('4단원 통합 화면 — 성능 기록', () => {
  test.describe.configure({ mode: 'default', timeout: 900_000 });

  test('두 파이썬 + 얼굴 그물 + 가상 데스크톱 + 가상 보드를 함께 돌릴 때 fps·메모리를 잰다', async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', '성능 기록은 데스크톱 1366×768에서만');
    const full = process.env.UNIT4_PERF === 'full';
    // 오래 켜 둘 때 메모리가 느는지 보려면 UNIT4_PERF_SECONDS=180처럼 첫 경우의 시간을 늘린다(기본 15초)
    const firstSeconds = Math.max(5, Number(process.env.UNIT4_PERF_SECONDS ?? 15) || 15);
    test.setTimeout(900_000 + firstSeconds * 1000);
    const scenarios: Scenario[] = [{ name: `4단원 통합 · 재생 입력(f104 → f110 사이트판)${firstSeconds !== 15 ? ` · ${firstSeconds}초` : ''}`, url: UNIT4_PATH, mode: 'unit4', input: 'replay', seconds: firstSeconds }];
    if (full) {
      scenarios.push(
        { name: '4단원 통합 · 웹캠(가짜 카메라) + 얼굴 모델', url: UNIT4_PATH, mode: 'unit4', input: 'webcam', seconds: 15 },
        { name: '영상처리 실습실만 · 재생 입력(f104)', url: `${VISION_PATH}?example=${encodeURIComponent(DEFAULT_PC_FILE)}`, mode: 'vision', input: 'replay', seconds: 15 },
        { name: 'ESP32 실습실만(f110 사이트판)', url: `${ESP32_PATH}?example=${encodeURIComponent(DEFAULT_BOARD_FILE)}`, mode: 'esp32', seconds: 15 },
      );
    }
    const results: ScenarioResult[] = [];
    for (const scenario of scenarios) {
      results.push(await measureScenario(browser, scenario));
    }
    const where = `${browser.browserType().name()} ${browser.version()} · ${process.platform} · 1366×768${process.env.PW_BASE_URL ? ' · 개발 서버' : ' · 빌드 결과'}`;
    const table = perfTable(results, where);
    await testInfo.attach('unit4-perf.md', { body: table, contentType: 'text/markdown' });
    console.log(table);
    const out = process.env.UNIT4_PERF_OUT;
    if (out) {
      fs.writeFileSync(out, `${table}\n`, 'utf8');
    }

    // 합격선은 느슨하게(컴퓨터마다 다르다): 카메라 장이 파이썬에 들어가고, 화면이 멈추지 않고, 보드로 줄이 간다.
    const together = results[0]!.summary;
    expect(together.inputFps?.avg ?? 0).toBeGreaterThan(1);
    expect(together.pageFps?.avg ?? 0).toBeGreaterThan(10);
    expect(together.sentPerSec?.avg ?? 0).toBeGreaterThan(1);
  });
});
