// 원고 이미지 추출 흐름(PLAN §8.5 P5-01, §9.3, PD-18) — scripts/extract-lesson-images.mjs가 부른다.
//
//   차시 그림 목록 읽기 → 제외 쪽 규칙 → 파이썬 일꾼(scripts/lib/lesson_images_worker.py: PyMuPDF로 그리기·꺼내기, Pillow로 WebP 다시 인코딩)
//   → Node에서 메타데이터 조각 검사(없어야 통과) → 원본 그림의 권리 표기 → 얼굴 검사(scripts/lib/face-check.mjs, OpenCV 4.11)
//   → sources.yaml 연결 검사 → 목록에 file·크기·sha256·checks를 적는다(주석은 그대로 둔다).
// 한 단계라도 걸리면 그 그림 파일을 지우고 멈춘다 — 검사를 통과하지 못한 그림이 폴더에 남아 커밋되지 않게.
// 그림이 바뀌면(sha256이 달라지면) 전에 적은 눈 확인 기록(reviewed)을 지운다 — 새 그림은 다시 눈으로 봐야 한다.
// 원본(PDF·PPTX)은 읽기만 한다.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';
import { createFaceChecker, FaceCheckUnavailableError } from './face-check.mjs';
import {
  EXCLUSIONS_FILE,
  LESSON_IMAGE_ROOT,
  SOURCES,
  WORK_DIR,
  checkExclusionPolicy,
  checkSourcesLink,
  exclusionFor,
  inspectImageMetadata,
  listManifestFiles,
  locatePage,
  manifestNames,
  outputPathFor,
  parseExclusions,
  parseImageManifest,
  printedPageAt,
  rightsProblem,
  sha256Hex,
} from './lesson-images.mjs';
import { REGISTRY_FILE, parseRegistry } from './sources-registry.mjs';

export const WORKER_FILE = fileURLToPath(new URL('./lesson_images_worker.py', import.meta.url));
const IMPORT_CHECK = 'import pymupdf, PIL, numpy; from PIL import features; assert features.check("webp")';

/**
 * PyMuPDF·Pillow·numpy가 있는 파이썬 3을 찾는다. APC_PYTHON 환경 변수(예: "py -3.11")가 있으면 그것을 먼저 쓴다.
 * @returns {string[] | null}
 */
export function findImagePython() {
  /** @type {string[][]} */
  const candidates = [];
  if (process.env.APC_PYTHON && process.env.APC_PYTHON.trim() !== '') {
    candidates.push(process.env.APC_PYTHON.trim().split(/\s+/u));
  }
  candidates.push(['python'], ['python3'], ['py', '-3']);
  for (const candidate of candidates) {
    const result = spawnSync(candidate[0], [...candidate.slice(1), '-c', IMPORT_CHECK], { encoding: 'utf8', timeout: 60_000 });
    if (!result.error && result.status === 0) {
      return candidate;
    }
  }
  return null;
}

/**
 * 파이썬 일꾼에게 JSON 요청 하나를 보내고 JSON 답을 받는다.
 * @param {string[]} python
 * @param {Record<string, unknown>} request
 * @returns {any}
 */
export function runWorker(python, request) {
  const result = spawnSync(python[0], [...python.slice(1), '-X', 'utf8', WORKER_FILE], {
    input: JSON.stringify(request),
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    timeout: 20 * 60_000,
  });
  if (result.error) {
    throw new Error(`파이썬 일꾼을 실행하지 못했어요: ${result.error.message}`);
  }
  let response;
  try {
    response = JSON.parse(result.stdout);
  } catch {
    throw new Error(`파이썬 일꾼의 답을 읽지 못했어요(종료 코드 ${result.status}).\n${String(result.stderr).slice(0, 2000)}`);
  }
  if (!response.ok) {
    throw new Error(`파이썬 일꾼이 멈췄어요: ${response.error}`);
  }
  return response;
}

/**
 * @param {string} rootDir
 */
function loadRules(rootDir) {
  const registryText = fs.readFileSync(path.join(rootDir, REGISTRY_FILE), 'utf8');
  const registry = parseRegistry(registryText);
  const exclusionsPath = path.join(rootDir, EXCLUSIONS_FILE);
  if (!fs.existsSync(exclusionsPath)) {
    throw new Error(`${EXCLUSIONS_FILE}이(가) 없어요. 제외 쪽 목록 없이 원고 그림을 꺼내지 않아요.`);
  }
  const exclusions = parseExclusions(fs.readFileSync(exclusionsPath, 'utf8'));
  if (exclusions.errors.length > 0 || registry.errors.length > 0) {
    throw new Error(
      [...exclusions.errors.map((error) => `${EXCLUSIONS_FILE}: ${error}`), ...registry.errors.map((error) => `${REGISTRY_FILE}: ${error}`)].join('\n'),
    );
  }
  return { registryEntries: registry.entries, exclusionRules: exclusions.rules };
}

/**
 * 그림을 지운 뒤 비게 된 폴더(third-party/<키>/ 등)를 차시 그림 뿌리까지 거슬러 지운다.
 * @param {string} directory
 * @param {string} stopAt 이 폴더는 지우지 않는다(public/images/lessons)
 */
function removeEmptyFolders(directory, stopAt) {
  let current = path.resolve(directory);
  const root = path.resolve(stopAt);
  while (current.startsWith(root) && current !== root) {
    if (!fs.existsSync(current) || fs.readdirSync(current).length > 0) break;
    fs.rmdirSync(current);
    current = path.dirname(current);
  }
}

/**
 * 차시 이름(1-1-2)이나 목록 파일 경로로 목록 파일을 찾는다.
 * @param {string} rootDir
 * @param {string} target
 * @returns {string[]}
 */
export function resolveManifestTargets(rootDir, target) {
  const all = listManifestFiles(rootDir);
  const posix = target.split('\\').join('/');
  if (posix.endsWith('.images.yaml')) {
    const relative = path.isAbsolute(target) ? path.relative(rootDir, target).split(path.sep).join('/') : posix;
    return all.filter((file) => file === relative);
  }
  return all.filter((file) => manifestNames(file).slug === posix || file.endsWith(`/${posix}.images.yaml`));
}

/**
 * 목록 파일의 한 항목에 도구가 적는 칸을 쓴다(주석·다른 칸은 그대로). reviewed는 맨 뒤로 옮기거나(같은 그림) 지운다(바뀐 그림).
 * update가 null이면 도구 칸과 reviewed를 모두 지운다(다시 꺼내다 검사에 걸려 그림을 지운 경우).
 * @param {string} text
 * @param {Map<number, { file: string, width: number, height: number, bytes: number, sha256: string, checks: Record<string, unknown> } | null>} updates
 * @returns {{ text: string, droppedReviews: number[] }}
 */
export function writeManifestFields(text, updates) {
  const document = parseDocument(text, { uniqueKeys: true });
  const images = /** @type {any} */ (document.get('images', true));
  /** @type {number[]} */
  const droppedReviews = [];
  for (const [index, update] of updates) {
    const item = images?.items?.[index];
    if (!item || typeof item.set !== 'function') continue;
    const previousSha = String(item.get('sha256') ?? '');
    const reviewed = item.get('reviewed', true);
    item.delete('reviewed');
    if (update === null) {
      for (const key of ['file', 'width', 'height', 'bytes', 'sha256', 'checks']) item.delete(key);
      if (reviewed) droppedReviews.push(index);
      continue;
    }
    for (const key of ['file', 'width', 'height', 'bytes']) {
      item.set(key, /** @type {any} */ (update)[key]);
    }
    // sha256은 늘 따옴표로 적는다 — 숫자·e만으로 된 16진수(드물지만 있을 수 있다)를 YAML이 수로 읽지 않게
    const shaNode = /** @type {any} */ (document.createNode(update.sha256));
    shaNode.type = 'QUOTE_DOUBLE';
    item.set('sha256', shaNode);
    const checks = /** @type {any} */ (document.createNode(update.checks));
    const faceBoxes = checks.get?.('face_boxes', true);
    if (faceBoxes) {
      // 얼굴 자리 [x, y, 너비, 높이]는 한 줄에 하나씩 짧게 보이게
      faceBoxes.flow = true;
      for (const box of faceBoxes.items ?? []) box.flow = true;
    }
    item.set('checks', checks);
    if (reviewed) {
      if (previousSha === update.sha256) {
        item.set('reviewed', reviewed);
      } else {
        droppedReviews.push(index);
      }
    }
  }
  // flowCollectionPadding: false — 사람이 적은 [210, 248, 505, 443]을 [ 210, … ]로 바꾸지 않게
  return { text: document.toString({ lineWidth: 0, flowCollectionPadding: false }), droppedReviews };
}

/**
 * @typedef {object} ExtractReport
 * @property {string[]} errors
 * @property {string[]} warnings
 * @property {string[]} done 완료 줄(사람이 읽는 글)
 * @property {string[]} needReview 눈 확인 기록이 필요한 그림 경로
 * @property {number} extracted
 */

/**
 * 목록 파일들의 그림을 꺼낸다.
 * @param {{
 *   rootDir: string,
 *   materialsDir: string,
 *   manifestFiles: string[],
 *   only?: string[],
 *   dryRun?: boolean,
 *   python?: string[] | null,
 *   faceCheck?: 'on' | 'skip',
 * }} options
 * @returns {Promise<ExtractReport>}
 */
export async function extractLessonImages(options) {
  const { rootDir, materialsDir, manifestFiles, only = [], dryRun = false } = options;
  /** @type {ExtractReport} */
  const report = { errors: [], warnings: [], done: [], needReview: [], extracted: 0 };
  const { registryEntries, exclusionRules } = loadRules(rootDir);
  const workDir = path.join(rootDir, WORK_DIR, 'tmp');
  /**
   * 그림이 실제로 놓인 쪽의 제외 규칙(그림 번호로 꺼낼 때 선언한 쪽과 다른 쪽에도 놓였는지 본다).
   * @param {{ entry: import('./lesson-images.mjs').ImageEntry }} plan
   * @param {number} page
   */
  const exclusionForPage = (plan, page) => (plan.entry.from ? exclusionFor(exclusionRules, plan.entry.from.source, page) : null);

  /** @type {{ manifestFile: string, text: string, manifest: import('./lesson-images.mjs').ImageManifest, entry: import('./lesson-images.mjs').ImageEntry, out: string, exclusion: import('./lesson-images.mjs').PageExclusion | null, job: Record<string, unknown> | null }[]} */
  const plans = [];
  for (const manifestFile of manifestFiles) {
    const text = fs.readFileSync(path.join(rootDir, manifestFile), 'utf8');
    const { manifest, errors } = parseImageManifest(text, manifestFile);
    if (!manifest || errors.length > 0) {
      report.errors.push(...errors.map((error) => `${manifestFile}: ${error}`));
      continue;
    }
    for (const entry of manifest.images) {
      if (only.length > 0 && !only.includes(entry.name)) continue;
      const label = `${manifestFile}(${entry.name})`;
      if (!entry.from) {
        // 원본에서 꺼내지 않은 그림(origin): 파일을 그대로 두고 검사·기록만 한다.
        if (!entry.file || !fs.existsSync(path.join(rootDir, entry.file))) {
          report.errors.push(`${label}: origin 그림 ${entry.file ?? '(file 없음)'} 파일이 없어요.`);
          continue;
        }
        plans.push({ manifestFile, text, manifest, entry, out: entry.file, exclusion: null, job: { kind: 'file' } });
        continue;
      }
      const { problem, exclusion } = checkExclusionPolicy(entry, exclusionRules);
      if (problem) {
        report.errors.push(`${label}: ${problem} — 꺼내지 않았어요.`);
        continue;
      }
      const out = outputPathFor(manifest.folder, entry);
      const linkProblem = checkSourcesLink(out, registryEntries);
      if (linkProblem) {
        report.errors.push(`${label}: ${linkProblem}`);
        continue;
      }
      const source = SOURCES[entry.from.source];
      const sourceFile = path.join(materialsDir, ...source.file.split('/'));
      if (!fs.existsSync(sourceFile)) {
        report.errors.push(
          `${label}: 원본 ${source.label}(${source.file})을 ${materialsDir}에서 찾지 못했어요. 운영자 PC의 원본 폴더나 비공개 자료 저장소의 originals/를 --materials로 알려 줘요.`,
        );
        continue;
      }
      const location = /** @type {import('./lesson-images.mjs').PageLocation} */ (locatePage(entry.from.source, entry.from.page));
      const rawName = `${manifest.folder}__${entry.name}.gray`;
      /** @type {Record<string, unknown>} */
      const job = {
        id: `${manifestFile}#${entry.name}`,
        kind: source.kind,
        file: sourceFile,
        out: path.join(rootDir, out),
        face_raw: path.join(workDir, rawName),
        crop: entry.from.crop ?? null,
        max_width: entry.maxWidth,
        quality: entry.quality,
        lossless: entry.lossless,
        printed: entry.from.page,
      };
      if (source.kind === 'pdf') {
        job.pdf_page = location.pdfPage;
        job.side = location.side;
        job.region = entry.from.region ?? null;
        job.xref = entry.from.image ?? null;
        job.dpi = entry.from.dpi;
        job.rights_scan = true;
      } else {
        job.slide = entry.from.page;
        job.picture = entry.from.picture;
      }
      plans.push({ manifestFile, text, manifest, entry, out, exclusion, job });
    }
  }

  if (dryRun || plans.length === 0) {
    for (const plan of plans) {
      report.done.push(`(시험) ${plan.manifestFile}(${plan.entry.name}) → ${plan.out}`);
    }
    return report;
  }

  const python = options.python ?? findImagePython();
  if (!python) {
    report.errors.push('PyMuPDF·Pillow·numpy가 있는 파이썬 3을 찾지 못했어요. APC_PYTHON 환경 변수로 파이썬을 알려 줘요(예: APC_PYTHON="py -3.11").');
    return report;
  }
  fs.mkdirSync(workDir, { recursive: true });
  const extractJobs = plans.filter((plan) => plan.job?.kind !== 'file').map((plan) => plan.job);
  const fileJobs = plans
    .filter((plan) => plan.job?.kind === 'file')
    .map((plan) => ({ id: `${plan.manifestFile}#${plan.entry.name}`, file: path.join(rootDir, plan.out), face_raw: path.join(workDir, `${plan.manifest.folder}__${plan.entry.name}.gray`) }));
  const probe = runWorker(python, { cmd: 'probe' });
  const response = extractJobs.length > 0 ? runWorker(python, { cmd: 'extract', jobs: extractJobs }) : { results: [] };
  const fileResponse = fileJobs.length > 0 ? runWorker(python, { cmd: 'probe-files', jobs: fileJobs }) : { results: [] };
  /** @type {Map<string, any>} */
  const results = new Map([...response.results, ...fileResponse.results].map((result) => [result.id, result]));

  let faceChecker = null;
  let faceCheckNote = null;
  if (options.faceCheck !== 'skip') {
    try {
      faceChecker = await createFaceChecker({ rootDir });
    } catch (error) {
      if (!(error instanceof FaceCheckUnavailableError)) throw error;
      faceCheckNote = error.message;
    }
  } else {
    faceCheckNote = '얼굴 검사를 건너뛰었어요(--skip-face-check).';
  }
  const tool = `PyMuPDF ${probe.pymupdf} · Pillow ${probe.pillow}${faceChecker ? ` · OpenCV ${faceChecker.version}(얼굴 검사)` : ''}`;

  /** @type {Map<string, { text: string, updates: Map<number, any>, oldFiles: string[] }>} */
  const writes = new Map();
  for (const plan of plans) {
    const label = `${plan.manifestFile}(${plan.entry.name})`;
    const result = results.get(`${plan.manifestFile}#${plan.entry.name}`);
    const outAbsolute = path.join(rootDir, plan.out);
    const isFileJob = plan.job?.kind === 'file';
    const fail = (/** @type {string} */ message) => {
      if (!isFileJob && fs.existsSync(outAbsolute)) {
        fs.rmSync(outAbsolute);
        removeEmptyFolders(path.dirname(outAbsolute), path.join(rootDir, LESSON_IMAGE_ROOT));
      }
      report.errors.push(`${label}: ${message}`);
      if (!isFileJob && plan.entry.file) {
        // 전에 꺼내 둔 그림이 있었다면 같은 경로라 방금 지워졌다 → 목록의 도구 칸(file·sha256·checks)과 눈 확인 기록도 지운다.
        const pending = writes.get(plan.manifestFile) ?? { text: plan.text, updates: new Map(), oldFiles: [] };
        pending.updates.set(plan.entry.index, null);
        if (plan.entry.file !== plan.out) pending.oldFiles.push(plan.entry.file);
        writes.set(plan.manifestFile, pending);
      }
    };
    const rawPath = result?.face_probe?.path;
    try {
      if (!result || !result.ok) {
        fail(`꺼내지 못했어요 — ${result?.error ?? '답이 없어요'}`);
        continue;
      }
      // ① 그림이 놓인 쪽(그림 번호로 꺼낼 때)
      if (plan.entry.from?.image !== undefined) {
        // 그림이 놓인 모든 자리의 왼쪽 끝·오른쪽 끝이 어느 인쇄 쪽인지 — 펼침면 가운데를 넘는 그림은 두 쪽 모두에 걸친다.
        const pages = (result.placement_abs ?? []).flatMap((/** @type {number[]} */ box) => [
          printedPageAt(plan.entry.from?.source ?? '', Number(plan.job?.pdf_page), box[0] + 0.5),
          printedPageAt(plan.entry.from?.source ?? '', Number(plan.job?.pdf_page), box[2] - 0.5),
        ]);
        const elsewhere = [...new Set(pages.filter((page) => page !== plan.entry.from?.page))];
        if (elsewhere.length > 0) {
          const excluded = elsewhere.filter((page) => page !== null && exclusionForPage(plan, page) !== null);
          if (excluded.length > 0) {
            fail(`그림 번호 ${plan.entry.from.image}은(는) 제외 쪽(${excluded.join(', ')}쪽)에도 놓여 있어요. region으로 보이는 부분만 꺼내요.`);
            continue;
          }
          if (!pages.includes(plan.entry.from.page)) {
            fail(`그림 번호 ${plan.entry.from.image}은(는) ${elsewhere.join(', ')}쪽에 있어요. page를 고쳐요.`);
            continue;
          }
        }
        if (result.visibility?.hidden_risk) {
          report.warnings.push(
            `${label}: 원본 그림이 쪽에 보이는 모습과 달라요(가려지거나 겹친 부분 ${Math.round((result.visibility.differ ?? 0) * 100)}%). 쪽에서 가려졌던 부분이 나올 수 있으니 눈 확인 때 쪽 미리 보기와 견주고, 되도록 region으로 꺼내요.`,
          );
        }
      }
      // ② 메타데이터(파일 머리부터 조각을 하나씩 읽어 본다)
      const content = fs.readFileSync(outAbsolute);
      const inspected = inspectImageMetadata(content);
      if (inspected.problems.length > 0) {
        fail(isFileJob ? `메타데이터가 남았어요(${inspected.problems.join(', ')}). 편집기에서 메타데이터 없이 다시 저장해요.` : `다시 인코딩했는데 메타데이터가 남았어요(${inspected.problems.join(', ')}).`);
        continue;
      }
      // ③ 원본 그림의 권리 표기
      const hits = (result.rights ?? []).map((/** @type {any} */ hit) => ({ ...hit, info: hit.info ?? {} }));
      const rights = rightsProblem(hits, plan.entry.thirdParty);
      if (rights) {
        fail(rights);
        continue;
      }
      // ④ 얼굴
      /** @type {number | string} */
      let faces = '검사 안 함';
      /** @type {number[][]} */
      let faceBoxes = [];
      if (faceChecker && result.face_probe) {
        const probeInfo = result.face_probe;
        const raw = new Uint8Array(fs.readFileSync(probeInfo.path));
        const found = faceChecker.detect(raw, probeInfo.width, probeInfo.height, Boolean(plan.exclusion?.strictFaces));
        const toOutput = (Number(result.width) || probeInfo.width) / probeInfo.width;
        faceBoxes = found.map((face) => face.box.map((value) => Math.round(value * toOutput)));
        faces = found.length;
        if (plan.exclusion?.strictFaces && found.length > 0) {
          fail(`제외 쪽(얼굴)에서 잘라 낸 그림인데 얼굴 검출이 ${found.length}곳 나왔어요(${faceBoxes.map((box) => `[${box.join(', ')}]`).join(' ')}). region을 더 좁히거나 사이트가 그린 그림으로 바꿔요.`);
          continue;
        }
        if (found.length > 0) {
          report.warnings.push(`${label}: OpenCV가 얼굴로 본 곳이 ${found.length}곳 있어요(${faceBoxes.map((box) => `[${box.join(', ')}]`).join(' ')}, 결과 그림 픽셀). 사람 얼굴이면 쓰지 않아요 — 눈 확인 때 꼭 봐요.`);
        }
      } else if (plan.exclusion?.strictFaces) {
        fail(`제외 쪽(얼굴)에서 잘라 낸 그림은 얼굴 검사 없이 꺼내지 않아요. ${faceCheckNote ?? ''}`);
        continue;
      }
      /** @type {Record<string, unknown>} */
      const checks = {
        metadata: '없음(EXIF·XMP·ICC·글 조각 없음, 다시 인코딩)',
        faces,
      };
      if (faceBoxes.length > 0) checks.face_boxes = faceBoxes;
      if (hits.length > 0) {
        checks.rights = hits
          .map((/** @type {any} */ hit) => (hit.publisher ? `출판 편집 삽화(이름표 ${hit.info.title})` : `제작자 ${hit.info.creator ?? '-'}, 권리 문구 ${hit.info.rights ?? '-'}`))
          .join(' / ');
      }
      if (plan.exclusion) checks.excluded_page = `제외 쪽(${plan.exclusion.kinds.join('·')}) — privacy_override로 일부만 꺼냄`;
      if (result.visibility?.hidden_risk) checks.hidden = '원본 그림이 쪽에 보이는 모습과 달라요 — 눈 확인 때 쪽과 견줘요';
      checks.tool = tool;
      const record = {
        file: plan.out,
        width: Number(inspected.width ?? result.width),
        height: Number(inspected.height ?? result.height),
        bytes: content.length,
        sha256: sha256Hex(content),
        checks,
      };
      const pending = writes.get(plan.manifestFile) ?? { text: plan.text, updates: new Map(), oldFiles: [] };
      pending.updates.set(plan.entry.index, record);
      if (plan.entry.file && plan.entry.file !== plan.out) pending.oldFiles.push(plan.entry.file);
      writes.set(plan.manifestFile, pending);
      report.extracted += isFileJob ? 0 : 1;
      const sizeKb = (content.length / 1024).toFixed(1);
      report.done.push(`${label} → ${plan.out} (${record.width}×${record.height}, ${sizeKb}KB, 얼굴 ${faces}${checks.rights ? `, ${checks.rights}` : ''})`);
      if (plan.entry.sha256 !== record.sha256 || !plan.entry.reviewed) {
        report.needReview.push(plan.out);
      }
    } finally {
      if (rawPath && fs.existsSync(rawPath)) fs.rmSync(rawPath);
    }
  }
  if (faceCheckNote) report.warnings.push(faceCheckNote);

  for (const [manifestFile, pending] of writes) {
    const { text, droppedReviews } = writeManifestFields(pending.text, pending.updates);
    fs.writeFileSync(path.join(rootDir, manifestFile), text);
    for (const index of droppedReviews) {
      report.warnings.push(`${manifestFile}: ${index + 1}번째 그림이 바뀌어 전에 적은 눈 확인 기록(reviewed)을 지웠어요. 다시 보고 적어요.`);
    }
    for (const oldFile of pending.oldFiles) {
      const oldAbsolute = path.join(rootDir, oldFile);
      if (oldFile.startsWith(`${LESSON_IMAGE_ROOT}/`) && fs.existsSync(oldAbsolute)) {
        fs.rmSync(oldAbsolute);
        removeEmptyFolders(path.dirname(oldAbsolute), path.join(rootDir, LESSON_IMAGE_ROOT));
        report.warnings.push(`${manifestFile}: 경로가 바뀌어 옛 그림 ${oldFile}을(를) 지웠어요.`);
      }
    }
  }
  return report;
}

/**
 * 한 쪽을 좌표 격자·그림 번호·권리 표기 자리와 함께 PNG로 그린다(.cache/lesson-images/show/).
 * @param {{ rootDir: string, materialsDir: string, source: string, page: number, python?: string[] | null }} options
 */
export function showPage({ rootDir, materialsDir, source, page, python }) {
  const info = SOURCES[source];
  if (!info) {
    throw new Error(`원본 약칭은 ${Object.keys(SOURCES).join(' ')} 가운데 하나예요.`);
  }
  const location = locatePage(source, page);
  if (!location) {
    throw new Error(`${info.label}에서 ${page}쪽을 찾지 못했어요.`);
  }
  const sourceFile = path.join(materialsDir, ...info.file.split('/'));
  if (!fs.existsSync(sourceFile)) {
    throw new Error(`원본 ${info.file}을(를) ${materialsDir}에서 찾지 못했어요(--materials).`);
  }
  const runner = python ?? findImagePython();
  if (!runner) {
    throw new Error('PyMuPDF·Pillow·numpy가 있는 파이썬 3을 찾지 못했어요(APC_PYTHON).');
  }
  const { exclusionRules } = loadRules(rootDir);
  const exclusion = exclusionFor(exclusionRules, source, page);
  const out = path.join(rootDir, WORK_DIR, 'show', `${source}-${String(page).padStart(3, '0')}${exclusion ? '-excluded' : ''}.png`);
  const request =
    info.kind === 'pptx'
      ? { cmd: 'show', kind: 'pptx', file: sourceFile, slide: page, out }
      : { cmd: 'show', kind: 'pdf', file: sourceFile, pdf_page: location.pdfPage, side: location.side, out };
  const response = runWorker(runner, request);
  return { ...response, exclusion, location };
}
