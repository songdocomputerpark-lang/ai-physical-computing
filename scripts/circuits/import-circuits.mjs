// 회로 그림 들이기: 내보낸 PNG(.cache/v140-staging/circuits/<id>.png)의 투명 여백을 자르고 WebP로 바꿔
// public/images/circuits/third-party/kit-vendor/<id>.webp에 쓰고, 그림 크기와 sha256을 scripts/circuits/circuits.yaml의 `image` 칸에 적는다.
//
// 쓰는 법(저장소 뿌리에서)
//   npm run circuits:import                    staging 폴더에 있는 PNG를 모두(없는 id는 건너뜀)
//   npm run circuits:import -- 2-2-1-1         적은 id만
//   npm run circuits:import -- --check         쓰지 않고 circuits.yaml의 `image` 기록이 파일과 같은지만 본다(WebP·sharp 없이도 됨, 다르면 종료 코드 1)
//   옵션: --in <폴더>(기본 .cache/v140-staging/circuits)  --out <폴더>(기본 public/images/circuits/third-party/kit-vendor)  --list <yaml>(기본 이 폴더의 circuits.yaml)  --margin <픽셀>(자른 뒤 사방에 남길 투명 여백, 기본 16)  --quality <1~100>(기본 90)
//
// 하는 일
//   ① PNG의 투명하지 않은 부분(알파 > 8)의 바깥 상자를 찾아 그만큼만 남기고 ② 사방에 투명 여백 16px을 두르고
//   ③ **흰 바탕을 깔지 않고** WebP(알파 100, 품질 90)로 바꾼다. 메타데이터(EXIF·ICC)는 넣지 않는다.
//   배경이 투명하지 않은 PNG(도구가 바뀐 경우)는 오류로 알리고 건너뛴다.
// 이미지 처리는 sharp를 쓴다 — 새 npm 패키지를 더하지 않고 Astro가 이미 끌어온 것(node_modules/sharp)을 그대로 쓴다(package.json에는 없음).
// 없어지면 이 스크립트의 `loadSharp`만 Pillow 등으로 바꾸면 된다(여백 자르기 규칙은 `findContentBox`에 따로 있다).
// 만든 WebP는 저장소에 넣기 전에 눈으로 확인하고(그림마다 업체 제품 사진이 들어 있음 — sources.yaml 제3자 항목·이미지 확인 기록), 아래 `image` 칸은 손으로 고치지 않는다.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const circuitsDir = fileURLToPath(new URL('.', import.meta.url));
const rootDir = path.resolve(circuitsDir, '..', '..');
const DEFAULT_LIST = path.join(circuitsDir, 'circuits.yaml');
const DEFAULT_IN = path.join(rootDir, '.cache', 'v140-staging', 'circuits');
const DEFAULT_OUT = path.join(rootDir, 'public', 'images', 'circuits', 'third-party', 'kit-vendor');
const ALPHA_THRESHOLD = 8;
const MIN_SIZE = 300;

function parseArgs(argv) {
  const options = { ids: [], inDir: DEFAULT_IN, outDir: DEFAULT_OUT, listPath: DEFAULT_LIST, margin: 16, quality: 90, check: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === '--in') {
      options.inDir = path.resolve(next());
    } else if (arg === '--out') {
      options.outDir = path.resolve(next());
    } else if (arg === '--list') {
      options.listPath = path.resolve(next());
    } else if (arg === '--margin') {
      options.margin = Number(next());
    } else if (arg === '--quality') {
      options.quality = Number(next());
    } else if (arg === '--check') {
      options.check = true;
    } else if (arg.startsWith('--')) {
      throw new Error(`[들이기] 모르는 옵션: ${arg}`);
    } else {
      options.ids.push(arg);
    }
  }
  if (!Number.isInteger(options.margin) || options.margin < 0 || options.margin > 200) {
    throw new Error('[들이기] --margin은 0~200 사이 정수예요.');
  }
  if (!Number.isInteger(options.quality) || options.quality < 1 || options.quality > 100) {
    throw new Error('[들이기] --quality는 1~100 사이 정수예요.');
  }
  return options;
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function loadSharp() {
  try {
    return (await import('sharp')).default;
  } catch (error) {
    throw new Error(`[들이기] sharp를 불러오지 못했어요(${error.message}). npm ci로 의존성을 다시 깔아 보고, 그래도 없으면 loadSharp를 다른 도구로 바꿔요.`);
  }
}

/** RGBA 픽셀에서 투명하지 않은 부분의 바깥 상자를 찾는다. 하나도 없으면 null. */
export function findContentBox(data, width, height, channels = 4) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * width * channels;
    for (let x = 0; x < width; x += 1) {
      if (data[rowStart + x * channels + (channels - 1)] > ALPHA_THRESHOLD) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) {
    return null;
  }
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** PNG 하나를 자르고 WebP로 바꾼다. 돌려주는 값: { buffer, width, height, source, box }. (시험에서도 쓰려고 내보낸다) */
export async function convertPng(sharp, pngFile, options) {
  const { data, info } = await sharp(pngFile).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width < MIN_SIZE || info.height < MIN_SIZE) {
    throw new Error(`그림이 너무 작아요(${info.width}×${info.height}).`);
  }
  const cornerAlpha = [0, (info.width - 1) * 4, (info.height - 1) * info.width * 4, ((info.height * info.width) - 1) * 4].map((offset) => data[offset + 3]);
  if (cornerAlpha.some((alpha) => alpha > ALPHA_THRESHOLD)) {
    throw new Error('배경이 투명하지 않아요(네 모서리 중 칠해진 곳이 있어요). 도구의 이미지 저장 방식이 바뀌었을 수 있어요.');
  }
  const box = findContentBox(data, info.width, info.height);
  if (!box) {
    throw new Error('그려진 것이 하나도 없어요(전부 투명).');
  }
  const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
  const buffer = await sharp(pngFile)
    .ensureAlpha()
    .extract(box)
    .extend({ top: options.margin, bottom: options.margin, left: options.margin, right: options.margin, background: transparent })
    .webp({ quality: options.quality, alphaQuality: 100, effort: 5 })
    .toBuffer();
  const meta = await sharp(buffer).metadata();
  return { buffer, width: meta.width, height: meta.height, source: { width: info.width, height: info.height }, box };
}

function relativeToRoot(file) {
  const relative = path.relative(rootDir, file);
  return (relative.startsWith('..') ? file : relative).split(path.sep).join('/');
}

/** `--check`: circuits.yaml의 image 기록이 실제 파일과 같은지 본다(sharp 없이). */
function checkRecords(doc) {
  const figures = doc.toJS().figures ?? [];
  const problems = [];
  let recorded = 0;
  for (const figure of figures) {
    if (!figure.image) {
      continue;
    }
    recorded += 1;
    const file = path.resolve(rootDir, figure.image.file ?? '');
    if (!figure.image.file || !fs.existsSync(file)) {
      problems.push(`${figure.id}: 기록한 파일이 없어요(${figure.image.file ?? '칸 비어 있음'})`);
      continue;
    }
    const buffer = fs.readFileSync(file);
    if (sha256(buffer) !== figure.image.sha256) {
      problems.push(`${figure.id}: 파일의 sha256이 기록과 달라요(그림을 바꿨으면 npm run circuits:import로 기록을 다시 써요)`);
    }
    if (buffer.length !== figure.image.bytes) {
      problems.push(`${figure.id}: 파일 크기가 기록과 달라요`);
    }
  }
  const missing = figures.filter((figure) => !figure.image).map((figure) => figure.id);
  console.log(`[들이기 대조] 목록 ${figures.length}장 중 기록 ${recorded}장${problems.length === 0 ? ' — 모두 파일과 같아요.' : ''}`);
  if (missing.length > 0) {
    console.log(`  아직 안 들인 그림 ${missing.length}장: ${missing.join(', ')}`);
  }
  for (const problem of problems) {
    console.error(`- ${problem}`);
  }
  if (problems.length > 0) {
    process.exitCode = 1;
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const doc = YAML.parseDocument(fs.readFileSync(options.listPath, 'utf8'));
  if (options.check) {
    checkRecords(doc);
    return;
  }

  const figuresNode = doc.get('figures');
  const figureIds = figuresNode.items.map((node) => node.get('id'));
  const unknown = options.ids.filter((id) => !figureIds.includes(id));
  if (unknown.length > 0) {
    throw new Error(`[들이기] 목록에 없는 id: ${unknown.join(', ')}`);
  }
  const targets = options.ids.length > 0 ? options.ids : figureIds;

  const sharp = await loadSharp();
  fs.mkdirSync(options.outDir, { recursive: true });
  const done = [];
  const skipped = [];
  const failed = [];
  for (const id of targets) {
    const pngFile = path.join(options.inDir, `${id}.png`);
    if (!fs.existsSync(pngFile)) {
      if (options.ids.length > 0) {
        failed.push({ id, reason: `PNG가 없어요(${relativeToRoot(pngFile)}) — npm run circuits:export로 먼저 받아요.` });
        console.error(`[들이기] ${id} 실패 — PNG가 없어요(${relativeToRoot(pngFile)})`);
      } else {
        skipped.push(id);
      }
      continue;
    }
    try {
      const result = await convertPng(sharp, pngFile, options);
      const outFile = path.join(options.outDir, `${id}.webp`);
      fs.writeFileSync(outFile, result.buffer);
      const node = figuresNode.items.find((item) => item.get('id') === id);
      node.set('image', doc.createNode({
        file: relativeToRoot(outFile),
        width: result.width,
        height: result.height,
        bytes: result.buffer.length,
        sha256: sha256(result.buffer),
        png_sha256: sha256(fs.readFileSync(pngFile)),
      }));
      done.push(id);
      console.log(`[들이기] ${id}: ${result.source.width}×${result.source.height} → 자른 ${result.box.width}×${result.box.height} + 여백 ${options.margin} = ${result.width}×${result.height}px, ${Math.round(result.buffer.length / 1024)}KB`);
    } catch (error) {
      failed.push({ id, reason: error.message });
      console.error(`[들이기] ${id} 실패 — ${error.message}`);
    }
  }

  if (done.length > 0) {
    fs.writeFileSync(options.listPath, doc.toString({ lineWidth: 0 }), 'utf8');
  }
  console.log(`\n[들이기] 끝: 들임 ${done.length}장, 건너뜀(PNG 없음) ${skipped.length}장, 실패 ${failed.length}장`);
  if (skipped.length > 0 && options.ids.length === 0) {
    console.log(`  PNG가 없는 id: ${skipped.join(', ')} — npm run circuits:export로 먼저 받아요.`);
  }
  if (done.length > 0) {
    console.log(`  WebP: ${relativeToRoot(options.outDir)}/  — 눈으로 확인한 뒤 저장소에 넣어요(제3자 업체 그림: sources.yaml·이미지 확인 기록).`);
  }
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
