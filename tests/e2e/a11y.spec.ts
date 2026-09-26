// 접근성 자동 검사 — 모든 쪽(PLAN §8.6 P6-03, Phase 6 구역 B). @axe-core/playwright 4.13.0(axe-core 4.13.0).
//
// 판정: axe가 찾은 위반 가운데 영향도(impact) critical·serious가 **0**이어야 한다(PLAN §8.6 P6-03 완료 기준 "심각 오류 0").
//   규칙은 태그로 거르지 않고 axe 기본 규칙을 모두 돌린다(WCAG 2.0·2.1·2.2 A/AA + 모범 사례). moderate·minor는 실패로 보지 않고
//   테스트 결과의 annotations와 첨부(axe.json)에 남긴다 — 고칠 목록으로 본다.
// 쪽 목록은 손으로 적지 않는다: 사이트 지도(src/config/nav.ts) 전부 + 대단원 4쪽 + 교사용 자료실 아래 쪽(teacher-pages.ts)과 지도 요약 4쪽
//   + content/lessons의 차시 md 전부(draft 제외 — 새 차시 md를 넣으면 코드 수정 없이 검사에 들어온다) + 없는 주소(404 쪽).
//   데스크톱(1366×768)·휴대폰(375×812) 두 프로젝트에서 모두 돈다(휴대폰은 접힌 메뉴·좁은 배치가 따로 있다).
// 실습실은 파이썬 준비가 끝난 뒤(학생이 가장 오래 보는 화면)를 훑는다. 누르거나 실행한 뒤의 화면(퀴즈 채점·발표 모드·실행 결과·블록 모드·
//   대화 상자 등)은 a11y-states.spec.ts, 키보드만으로 다니기·확대·움직임 줄이기는 a11y-keyboard.spec.ts.
// 맨 끝의 바닥글 검사 한 건은 판 표기(P6-06 일부 — 판 번호·"바뀐 점 기록" 링크와 그 누르는 곳 크기)다.
//
// 도구가 오판하는 곳 — 규칙을 끄지 않고 "그 규칙 + 그 요소"만 뺀다(KNOWN_FALSE_POSITIVES, 까닭은 항목마다):
//   CodeMirror 편집칸의 스크롤 칸(.cm-scroller)에 대한 scrollable-region-focusable.
//
// 실행: npm run test:a11y(두 화면 크기) · 병렬 제작 중에는 PW_BASE_URL=http://localhost:4902/ai-physical-computing/ npx playwright test tests/e2e/a11y.spec.ts
// 개발 서버에서 돌 때는 다른 사람이 파일을 고칠 때마다 Vite가 열린 쪽을 새로 고쳐 검사가 흔들리므로 그 신호만 거른다(freezeDevReloads —
// 빌드 결과에는 그 연결이 없어 아무 일도 하지 않는다).
import fs from 'node:fs';
import path from 'node:path';
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { parse } from 'yaml';
import { TEACHER_PAGES } from '../../src/components/teacher/teacher-pages.ts';
import { flattenPages, learnUnits } from '../../src/config/nav.ts';
import { siteConfig } from '../../src/config/site.ts';
import { withBase } from '../../src/lib/url.ts';

type AxeResults = Awaited<ReturnType<AxeBuilder['analyze']>>;
type AxeViolation = AxeResults['violations'][number];
type AxeNode = AxeViolation['nodes'][number];

/** 심각으로 보는 영향도 */
const SEVERE_IMPACTS = new Set(['critical', 'serious']);

/**
 * 도구가 오판하는 곳(규칙 하나 + 그 요소만). 여기에 더할 때는 까닭(도구가 왜 틀렸는지·사람이 실제로 어떻게 쓰는지)과 그것을 확인하는 검사를 함께 적는다.
 */
const KNOWN_FALSE_POSITIVES: readonly { rule: string; target: RegExp; why: string }[] = [
  {
    rule: 'scrollable-region-focusable',
    target: /\.cm-scroller/u,
    why:
      'CodeMirror 스크롤 칸(tabindex=-1) 안의 편집 영역(.cm-content)은 contenteditable이라 Tab으로 초점을 받고 방향키로 스크롤된다. ' +
      'axe는 contenteditable을 초점 받는 요소로 세지 않는다(axe-core lib/commons/dom/is-focusable.js — 기본 초점 요소와 tabindex만 본다). ' +
      '키보드로 편집칸에 들어가고 나오는 것은 a11y-keyboard.spec.ts가 확인한다.',
  },
];

/** 한 쪽 */
interface A11yTarget {
  /** 테스트 이름에 쓰는 주소(base 없이) */
  readonly path: string;
  /** 여는 주소(base 포함) */
  readonly href: string;
  /** 기대하는 HTTP 상태 */
  readonly status: number;
  /** 실습실이면 준비가 끝날 때까지 기다리는 방법 */
  readonly ready?: (page: Page) => Promise<void>;
}

/** 실습실 준비를 기다리는 시간(Pyodide·OpenCV를 jsDelivr에서 받는다 — 두 벌 뜨는 4단원 화면이 가장 느리다) */
const LAB_READY_TIMEOUT = 180_000;

/** 파이썬 실습실 뿌리가 모두 준비(idle)될 때까지 */
async function waitLabsIdle(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const labs = [...document.querySelectorAll('[data-lab]')];
          return labs.length > 0 && labs.every((lab) => lab.getAttribute('data-state') === 'idle');
        }),
      { timeout: LAB_READY_TIMEOUT, intervals: [500, 1000] },
    )
    .toBe(true);
}

/** 가상 보드 그림이 그려질 때까지 */
async function waitBoardReady(page: Page): Promise<void> {
  await expect(page.locator('[data-board-io]').first()).toHaveAttribute('data-board-ready', 'yes', { timeout: LAB_READY_TIMEOUT });
}

/** 실습실 주소 → 준비를 기다리는 방법 */
const LAB_READY: Readonly<Record<string, (page: Page) => Promise<void>>> = {
  '/labs/vision/': async (page) => {
    await waitLabsIdle(page);
    await expect(page.locator('[data-lab]')).toHaveAttribute('data-vision-packages', 'ready', { timeout: LAB_READY_TIMEOUT });
  },
  '/labs/esp32/': async (page) => {
    await waitLabsIdle(page);
    await waitBoardReady(page);
  },
  '/labs/unit4/': async (page) => {
    await waitLabsIdle(page);
    await waitBoardReady(page);
  },
};

/** content/lessons의 차시 md(draft 제외) → 차시 주소(base 없이). learn.spec.ts의 목록과 같은 규칙 */
function lessonPaths(): string[] {
  const walk = (directory: string): string[] =>
    fs.readdirSync(directory, { withFileTypes: true }).flatMap((dirent) => {
      const full = path.join(directory, dirent.name);
      if (dirent.isDirectory()) {
        return walk(full);
      }
      return dirent.name.endsWith('.md') ? [full] : [];
    });
  return walk('content/lessons')
    .flatMap((file) => {
      const match = /^---\r?\n([\s\S]*?)\r?\n---/u.exec(fs.readFileSync(file, 'utf8'));
      const data = (match ? parse(match[1] ?? '') : {}) as { unit?: number; draft?: boolean };
      if (data.draft === true || typeof data.unit !== 'number') {
        return [];
      }
      return [`/learn/u${data.unit}/${path.basename(file, '.md')}/`];
    })
    .sort();
}

/** 검사할 쪽 전부(겹치지 않게) */
function a11yTargets(): A11yTarget[] {
  const paths = [
    ...flattenPages().map((page) => page.path),
    ...learnUnits.map((unit) => unit.path),
    ...TEACHER_PAGES.map((page) => page.path),
    ...learnUnits.map((unit) => `/teacher/guides/u${unit.unit}/`),
    ...lessonPaths(),
  ];
  const unique = [...new Set(paths)];
  return [
    ...unique.map((pagePath) => ({ path: pagePath, href: withBase(pagePath.slice(1)), status: 200, ready: LAB_READY[pagePath] })),
    { path: '/없는-주소/ (404)', href: withBase('a11y-no-such-page/'), status: 404 },
  ];
}

/** 개발 서버의 Vite 새로 고침 신호(full-reload·update)를 거른다. 빌드 결과(미리 보기·실사이트)에는 이 연결이 없다 */
async function freezeDevReloads(page: Page): Promise<void> {
  await page.routeWebSocket(/\/\?token=/u, (socket) => {
    const server = socket.connectToServer();
    server.onMessage((message) => {
      if (typeof message === 'string' && /"type":"(?:full-reload|update|prune)"/u.test(message)) {
        return;
      }
      socket.send(message);
    });
    socket.onMessage((message) => server.send(message));
  });
}

/** 요소 위치 글(iframe 안이면 이어 붙인다) */
function targetText(node: AxeNode): string {
  return node.target.map((part) => (Array.isArray(part) ? part.join(' >>> ') : String(part))).join(' | ');
}

/** 도구 오판을 뺀 위반 */
function withoutFalsePositives(violations: readonly AxeViolation[]): AxeViolation[] {
  return violations.flatMap((violation) => {
    const known = KNOWN_FALSE_POSITIVES.filter((entry) => entry.rule === violation.id);
    if (known.length === 0) {
      return [violation];
    }
    const nodes = violation.nodes.filter((node) => !known.some((entry) => entry.target.test(targetText(node))));
    return nodes.length === 0 ? [] : [{ ...violation, nodes }];
  });
}

/** 실패 메시지·기록용 한 줄 요약 */
function describeViolations(violations: readonly AxeViolation[]): string {
  return violations
    .map(
      (violation) =>
        `- ${violation.id}(${violation.impact}) ${violation.help}\n` +
        violation.nodes
          .slice(0, 5)
          .map((node) => `    · ${targetText(node)}\n      ${node.html.slice(0, 200)}\n      ${(node.failureSummary ?? '').replace(/\s+/gu, ' ').slice(0, 300)}`)
          .join('\n'),
    )
    .join('\n');
}

/** axe로 지금 화면을 훑는다(개발 서버의 Astro 도구 막대는 빌드 결과에 없어 뺀다) */
async function scanPage(page: Page): Promise<AxeResults> {
  return new AxeBuilder({ page }).exclude('astro-dev-toolbar').analyze();
}

/** 결과를 첨부하고 심각 위반이 없는지 본다 */
async function expectNoSevere(results: AxeResults, testInfo: TestInfo, label: string): Promise<void> {
  const violations = withoutFalsePositives(results.violations);
  const severe = violations.filter((violation) => SEVERE_IMPACTS.has(violation.impact ?? ''));
  const minor = violations.filter((violation) => !SEVERE_IMPACTS.has(violation.impact ?? ''));
  for (const violation of minor) {
    testInfo.annotations.push({ type: `axe ${violation.impact}`, description: `${label}: ${violation.id} ${violation.nodes.length}곳` });
  }
  await testInfo.attach('axe.json', {
    body: JSON.stringify(
      {
        label,
        passes: results.passes.length,
        incomplete: results.incomplete.map((item) => ({ id: item.id, impact: item.impact, nodes: item.nodes.length })),
        violations: violations.map((violation) => ({ id: violation.id, impact: violation.impact, nodes: violation.nodes.map(targetText) })),
      },
      null,
      2,
    ),
    contentType: 'application/json',
  });
  expect(severe, `${label} — axe 심각 위반(critical·serious)\n${describeViolations(severe)}`).toEqual([]);
}

test.describe('axe — 모든 쪽 심각 위반 0', () => {
  for (const target of a11yTargets()) {
    test(`${target.path}`, async ({ page }, testInfo) => {
      test.setTimeout(target.ready ? LAB_READY_TIMEOUT + 60_000 : 120_000);
      await freezeDevReloads(page);
      const response = await page.goto(target.href);
      expect(response?.status(), target.href).toBe(target.status);
      await expect(page.locator('html')).toHaveAttribute('lang', 'ko');
      if (target.ready) {
        await target.ready(page);
      }
      // 늦게 붙는 화면(용어 풀이·실습실 모듈 패널·갤러리 카드)이 자리를 잡을 때까지 잠깐 둔다.
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
      await expectNoSevere(await scanPage(page), testInfo, target.path);
    });
  }
});

// 바닥글 판 표기(PLAN §8.6 P6-06 일부 — 구역 B): 판 번호는 package.json → site.ts 한 곳에서 오고, 바뀐 점은 저장소 CHANGELOG.md로 간다.
// 링크는 문장 속 작은 글자라 누르는 곳 높이를 따로 본다(WCAG 2.2 2.5.8 — 24px).
test('바닥글: 판 번호와 "바뀐 점 기록" 링크가 보이고, 링크는 누르는 곳이 24px 이상이다', async ({ page }) => {
  await freezeDevReloads(page);
  await page.goto(withBase(''));
  const version = page.locator('footer.site-footer [data-site-version]');
  await expect(version).toHaveAttribute('data-site-version', siteConfig.version);
  await expect(version).toHaveText(`버전 ${siteConfig.version}`);
  const changelog = page.locator('footer.site-footer').getByRole('link', { name: '바뀐 점 기록', exact: true });
  await expect(changelog).toHaveAttribute('href', `${siteConfig.repositoryUrl}/blob/main/CHANGELOG.md`);
  await changelog.scrollIntoViewIfNeeded();
  const box = await changelog.boundingBox();
  expect(box?.height ?? 0, '링크 높이(px)').toBeGreaterThanOrEqual(24);
});
