// 회로 그림 내보내기: scripts/circuits/<id>.circuit을 키트 업체의 회로 구성 도구에서 열어 [이미지 저장]으로 PNG를 받는다.
//
// 쓰는 법(저장소 뿌리에서, 운영자 PC — 인터넷이 필요하고 도구 사이트에 접속한다)
//   npm run circuits:export                      목록의 모든 그림(.circuit이 없으면 먼저 npm run circuits:build)
//   npm run circuits:export -- 2-2-1-1 2-2-2-1   적은 id만
//   npm run circuits:export -- --headed          브라우저 창을 보면서
//   npm run circuits:export -- --dry-run         접속하지 않고 할 일과 창 크기만 보여 줌
//   옵션: --out <폴더>(기본 .cache/v140-staging/circuits)  --delay <밀리초>(그림 사이 쉬는 시간, 기본 1500, 1000 밑으로는 못 줄임)
//         --url <주소>(기본 https://circuit.gorillacell.kr/)  --channel msedge|chrome|chromium  --timeout <초>(한 그림, 기본 60)
//
// 하는 일(공식 화면 조작만 쓴다 — 도구가 따로 열어 둔 전역 손잡이는 쓰지 않는다)
//   ① 도구를 열고 ② [프로젝트 불러오기]의 숨은 파일 입력칸에 .circuit을 넣고 ③ 그림이 다 그려져 멈출 때까지 기다린 뒤
//   ④ 파란 [이미지 저장] 단추를 눌러 ⑤ 내려받는 circuit-diagram.png를 <out>/<id>.png로 둔다.
// 저장 그림은 도구가 보이는 창 크기(캔버스)를 그대로 2배로 저장하고 배경은 투명이다(코드로 확인, 2026-10-15). 그래서 그림 크기에 맞춰 창을 넉넉히 키운다.
// 한 장씩 천천히(그림 사이 1초 이상 쉼). 한 그림이 실패하면 그 id만 건너뛰고 끝에 요약한다(종료 코드 1).
// PNG는 저장소에 넣지 않는다(.cache 아래). 다음 단계는 npm run circuits:import(투명 여백 자르기 + WebP).
// 브라우저: Playwright 전용 Chromium이 설치돼 있으면 그것, 없으면 Windows에서는 설치된 Microsoft Edge(playwright.config.ts와 같은 규칙).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { circuitPath, readFigureList } from './build-circuits.mjs';
import { circuitBounds } from './lib/build-circuit.mjs';

const rootDir = fileURLToPath(new URL('../..', import.meta.url));
const DEFAULT_URL = 'https://circuit.gorillacell.kr/';
const DEFAULT_OUT = path.join(rootDir, '.cache', 'v140-staging', 'circuits');
const MIN_DELAY_MS = 1000;
const STABLE_SAMPLES = 4; // 캔버스가 이만큼 연달아 같으면 다 그려진 것
const SAMPLE_INTERVAL_MS = 500;
const CANVAS_MARGIN = 60;

function parseArgs(argv) {
  const options = { ids: [], out: DEFAULT_OUT, delay: 1500, url: DEFAULT_URL, headed: false, dryRun: false, channel: undefined, timeout: 60 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === '--out') {
      options.out = path.resolve(next());
    } else if (arg === '--delay') {
      options.delay = Number(next());
    } else if (arg === '--url') {
      options.url = next();
    } else if (arg === '--channel') {
      options.channel = next();
    } else if (arg === '--timeout') {
      options.timeout = Number(next());
    } else if (arg === '--headed') {
      options.headed = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg.startsWith('--')) {
      throw new Error(`[내보내기] 모르는 옵션: ${arg}`);
    } else {
      options.ids.push(arg);
    }
  }
  if (!Number.isFinite(options.delay) || options.delay < MIN_DELAY_MS) {
    options.delay = Math.max(MIN_DELAY_MS, Number.isFinite(options.delay) ? options.delay : 1500);
  }
  return options;
}

/** 브라우저 배포판을 고른다(playwright.config.ts의 pickChannel과 같은 규칙). undefined = Playwright 전용 Chromium. */
function pickChannel(requested) {
  if (requested) {
    return requested === 'chromium' ? undefined : requested;
  }
  try {
    if (fs.existsSync(chromium.executablePath())) {
      return undefined;
    }
  } catch {
    // 전용 Chromium 경로를 알 수 없으면 아래에서 Edge를 쓴다.
  }
  return process.platform === 'win32' ? 'msedge' : undefined;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 그림 크기에 맞는 창 크기(도구는 캔버스가 창 너비의 80%, 높이는 위 막대·아래 광고 띠를 뺀 만큼). 처음엔 넉넉히 잡고, 모자라면 키워 다시 연다. */
function viewportFor(needWidth, needHeight, attempt) {
  const grow = 1 + attempt * 0.25;
  return {
    width: Math.ceil((needWidth / 0.8 + 60) * grow),
    height: Math.ceil((needHeight / 0.72 + 140) * grow),
  };
}

async function waitForCanvasStable(page, timeoutMs) {
  const started = Date.now();
  let previous = null;
  let same = 0;
  while (Date.now() - started < timeoutMs) {
    const sample = await page.evaluate(() => {
      const canvas = document.querySelector('.konvajs-content canvas') ?? document.querySelector('canvas');
      if (!canvas) {
        return null;
      }
      const url = canvas.toDataURL('image/png');
      let hash = 0;
      for (let i = 0; i < url.length; i += 7) {
        hash = (hash * 31 + url.charCodeAt(i)) | 0;
      }
      return `${canvas.width}x${canvas.height}:${url.length}:${hash}`;
    });
    if (sample !== null && sample === previous) {
      same += 1;
      if (same >= STABLE_SAMPLES && Date.now() - started >= 2500) {
        return true;
      }
    } else {
      same = 0;
      previous = sample;
    }
    await sleep(SAMPLE_INTERVAL_MS);
  }
  return false;
}

/** PNG 머리에서 크기를 읽는다(그림 파일이 맞는지 살피는 데만 쓴다). */
function readPngSize(file) {
  const head = fs.readFileSync(file).subarray(0, 24);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (head.length < 24 || !head.subarray(0, 8).equals(signature)) {
    return null;
  }
  return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
}

async function exportOne(context, figure, options, attempt = 0) {
  const circuitFile = circuitPath(figure.id);
  if (!fs.existsSync(circuitFile)) {
    throw new Error(`${figure.id}.circuit이 없어요. 먼저 npm run circuits:build`);
  }
  const circuit = JSON.parse(fs.readFileSync(circuitFile, 'utf8'));
  const bounds = circuitBounds(circuit);
  const needWidth = Math.ceil(bounds.right + CANVAS_MARGIN);
  const needHeight = Math.ceil(bounds.bottom + CANVAS_MARGIN);
  const viewport = viewportFor(needWidth, needHeight, attempt);

  const page = await context.newPage();
  try {
    await page.setViewportSize(viewport);
    page.setDefaultTimeout(options.timeout * 1000);
    await page.goto(options.url, { waitUntil: 'load' });
    await page.waitForSelector('.konvajs-content canvas, canvas');

    const canvasSize = await page.evaluate(() => {
      const canvas = document.querySelector('.konvajs-content canvas') ?? document.querySelector('canvas');
      const rect = canvas.getBoundingClientRect();
      return { width: Math.floor(rect.width), height: Math.floor(rect.height) };
    });
    if (canvasSize.width < needWidth || canvasSize.height < needHeight) {
      await page.close();
      if (attempt >= 3) {
        throw new Error(`캔버스가 그림(${needWidth}×${needHeight})보다 작아요(${canvasSize.width}×${canvasSize.height}). 창을 키워도 안 늘어요.`);
      }
      return exportOne(context, figure, options, attempt + 1);
    }

    // ② 공식 [프로젝트 불러오기]의 숨은 파일 입력칸(.circuit,.json)에 파일을 넣는다.
    await page.locator('input[type="file"][accept*=".circuit"]').setInputFiles(circuitFile);
    // ③ 부품 사진을 받고 선 길을 잡아 다 그려질 때까지.
    const stable = await waitForCanvasStable(page, options.timeout * 1000);
    if (!stable) {
      throw new Error('그림이 제때 안 멈췄어요(캔버스가 계속 바뀜).');
    }
    // 도구가 불러온 부품 수를 알려 주면(전역 손잡이는 있으면 쓰는 정도로만) 맞는지 본다.
    const loaded = await page.evaluate(() => window.__circuitStore?.getState?.().components?.length ?? null);
    if (loaded !== null && loaded !== circuit.components.length) {
      throw new Error(`불러온 부품 수가 달라요(파일 ${circuit.components.length}개, 도구 ${loaded}개).`);
    }

    // ④⑤ [이미지 저장]
    fs.mkdirSync(options.out, { recursive: true });
    const outFile = path.join(options.out, `${figure.id}.png`);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: '이미지 저장' }).click(),
    ]);
    await download.saveAs(outFile);
    const size = readPngSize(outFile);
    const bytes = fs.statSync(outFile).size;
    if (!size || bytes < 2000) {
      throw new Error(`받은 파일이 PNG 그림이 아닌 것 같아요(${bytes}바이트).`);
    }
    return { file: outFile, width: size.width, height: size.height, bytes, viewport };
  } finally {
    if (!page.isClosed()) {
      await page.close();
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { figures } = readFigureList();
  const unknown = options.ids.filter((id) => !figures.some((figure) => figure.id === id));
  if (unknown.length > 0) {
    throw new Error(`[내보내기] 목록에 없는 id: ${unknown.join(', ')}`);
  }
  const targets = options.ids.length > 0 ? figures.filter((figure) => options.ids.includes(figure.id)) : figures;

  if (options.dryRun) {
    console.log(`[내보내기] 할 일(접속 안 함): ${targets.length}장 → ${options.out}`);
    for (const figure of targets) {
      const file = circuitPath(figure.id);
      if (!fs.existsSync(file)) {
        console.log(`- ${figure.id}: .circuit 없음(먼저 npm run circuits:build)`);
        continue;
      }
      const bounds = circuitBounds(JSON.parse(fs.readFileSync(file, 'utf8')));
      const need = { width: Math.ceil(bounds.right + CANVAS_MARGIN), height: Math.ceil(bounds.bottom + CANVAS_MARGIN) };
      const viewport = viewportFor(need.width, need.height, 0);
      console.log(`- ${figure.id}: 캔버스 ${need.width}×${need.height} 이상 → 창 ${viewport.width}×${viewport.height}(저장 PNG는 캔버스의 2배)`);
    }
    return;
  }

  const channel = pickChannel(options.channel);
  let browser;
  try {
    browser = await chromium.launch({ channel, headless: !options.headed });
  } catch (error) {
    throw new Error(`[내보내기] 브라우저를 띄우지 못했어요(${channel ?? 'Playwright 전용 Chromium'}): ${error.message}\n  → npx playwright install chromium 으로 받거나, Windows에서는 Microsoft Edge를 설치해 --channel msedge로 해 봐요.`);
  }
  const context = await browser.newContext({ locale: 'ko-KR', acceptDownloads: true, colorScheme: 'light' });

  const done = [];
  const failed = [];
  try {
    for (let index = 0; index < targets.length; index += 1) {
      const figure = targets[index];
      if (index > 0) {
        await sleep(options.delay);
      }
      try {
        const result = await exportOne(context, figure, options);
        done.push(figure.id);
        console.log(`[내보내기] ${figure.id}: ${result.width}×${result.height}px, ${Math.round(result.bytes / 1024)}KB (${index + 1}/${targets.length})`);
      } catch (error) {
        failed.push({ id: figure.id, reason: error.message });
        console.error(`[내보내기] ${figure.id} 실패 — ${error.message}`);
      }
    }
  } finally {
    await context.close();
    await browser.close();
  }

  console.log(`\n[내보내기] 끝: 성공 ${done.length}장, 실패 ${failed.length}장 → ${options.out}`);
  if (failed.length > 0) {
    for (const item of failed) {
      console.error(`- ${item.id}: ${item.reason}`);
    }
    console.error(`다시 해 보기: npm run circuits:export -- ${failed.map((item) => item.id).join(' ')}`);
    process.exitCode = 1;
  } else {
    console.log('다음 단계: npm run circuits:import');
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
