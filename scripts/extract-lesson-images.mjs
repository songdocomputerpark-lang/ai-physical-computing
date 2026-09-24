// 원고 이미지 추출 도구(PLAN §8.5 P5-01, §9.3, PD-18·PD-32)
//
// 차시마다 따로인 그림 목록(content/lessons/<단원 폴더>/<차시>.images.yaml — 허용 목록 + 눈 확인 기록)에 적은 그림만
// 원본(교과서 원고·블루투스 교안 PDF, PyAutoGUI 슬라이드 PPTX)에서 꺼내 메타데이터 없는 WebP로 다시 인코딩한다.
// 제외 쪽(scripts/image-exclusions.yaml)은 목록에 적어도 꺼내지 않는다. 규칙 전체는 scripts/lib/lesson-images.mjs 머리말,
// 넣는 절차는 MAINTENANCE.md 3절.
//
// 쓰는 법(저장소 뿌리에서)
//   npm run images:extract -- 1-1-2                   그 차시 목록의 그림을 모두 꺼낸다(목록 파일 경로를 적어도 된다)
//   npm run images:extract -- 1-1-2 --only cnn-stages  적은 이름의 그림만
//   npm run images:extract -- --all                   모든 차시 목록
//   npm run images:show -- U1 14                      원고 14쪽을 좌표 격자·그림 번호·권리 표기 자리와 함께 PNG로 그린다
//                                                     (.cache/lesson-images/show/U1-014.png — git 제외, 이 컴퓨터에만)
//   npm run images:check                              원본 없이 모든 목록 검사(npm test에도 들어 있다)
// 선택: --materials <원본 폴더>  원본 위치(기본: 저장소 뿌리 = 운영자 PC. 그 밖에는 비공개 자료 저장소의 originals/)
//       --dry-run                쓰지 않고 검사·계획만
//       --skip-face-check        얼굴 검사를 건너뛴다(제외 쪽에서 잘라 내는 그림은 이 설정으로 꺼낼 수 없다)
//       --root <폴더>            다른 저장소 뿌리(단위 테스트용)
// 필요한 것: PyMuPDF·Pillow·numpy가 있는 파이썬 3(APC_PYTHON으로 정할 수 있다), 얼굴 검사는 npm test가 받아 둔 Pyodide OpenCV 휠.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractLessonImages, findImagePython, resolveManifestTargets, showPage } from './lib/lesson-images-extract.mjs';
import { EXCLUSIONS_FILE, listManifestFiles, parseExclusions, validateLessonImages } from './lib/lesson-images.mjs';
import { REGISTRY_FILE, parseRegistry } from './lib/sources-registry.mjs';

const args = process.argv.slice(2);

/**
 * @param {string} name
 * @returns {string | undefined}
 */
function readOption(name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  args.splice(index, 2);
  return value;
}

/** @param {string} name */
function readFlag(name) {
  const index = args.indexOf(name);
  if (index < 0) return false;
  args.splice(index, 1);
  return true;
}

const rootOption = readOption('--root');
const rootDir = rootOption ? path.resolve(rootOption) : fileURLToPath(new URL('..', import.meta.url));
const materialsDir = path.resolve(readOption('--materials') ?? rootDir);
const only = (readOption('--only') ?? '').split(',').map((name) => name.trim()).filter(Boolean);
const dryRun = readFlag('--dry-run');
const skipFaceCheck = readFlag('--skip-face-check');
const all = readFlag('--all');
const show = readFlag('--show');
const check = readFlag('--check');

/** 이 컴퓨터 시계의 오늘 날짜(YYYY-MM-DD) — toISOString()은 세계 표준시라 한국 아침에는 어제가 된다 */
function localDate() {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
}

const REVIEW_TEMPLATE = [
  '    reviewed:',
  '      by: claude',
  `      date: ${localDate()}`,
  '      result: 통과 — 얼굴·이름·화면 속 경로·파일명·기기 주소·학교명 없음(그림을 열어 보고 본 것을 적어요)',
].join('\n');

function runCheck() {
  const registry = parseRegistry(fs.readFileSync(path.join(rootDir, REGISTRY_FILE), 'utf8'));
  const exclusions = parseExclusions(fs.readFileSync(path.join(rootDir, EXCLUSIONS_FILE), 'utf8'));
  const result = validateLessonImages({ rootDir, registryEntries: registry.entries, exclusionRules: exclusions.rules });
  const errors = [...registry.errors.map((e) => `${REGISTRY_FILE}: ${e}`), ...exclusions.errors.map((e) => `${EXCLUSIONS_FILE}: ${e}`), ...result.errors];
  const count = result.manifests.reduce((sum, manifest) => sum + manifest.images.length, 0);
  for (const warning of result.warnings) console.warn(`[원고 그림] 참고: ${warning}`);
  if (errors.length > 0) {
    console.error(`[원고 그림] 실패 — 문제 ${errors.length}건`);
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`[원고 그림] 통과 — 목록 ${result.manifests.length}개, 그림 ${count}장`);
}

function runShow() {
  const [source, pageText] = args.filter((arg) => !arg.startsWith('--'));
  const page = Number(pageText);
  if (!source || !Number.isInteger(page)) {
    console.error('쓰는 법: npm run images:show -- <원본 약칭 U1|U2A|U2B|U2C|U3|BT|PPT> <쪽 번호>');
    process.exitCode = 1;
    return;
  }
  const result = showPage({ rootDir, materialsDir, source: source.toUpperCase(), page });
  console.log(`[원고 그림] 미리 보기: ${result.out}`);
  if (result.exclusion) {
    console.log(`  ※ 제외 쪽이에요(${result.exclusion.override === 'never' ? '꺼낼 수 없음' : 'region + privacy_override로 일부만'}): ${result.exclusion.reasons.join(' / ')}`);
  }
  if (result.size_pt) {
    console.log(`  쪽 크기 ${result.size_pt[0]}×${result.size_pt[1]}pt — region은 이 쪽의 왼쪽 위를 (0, 0)으로 한 pt 좌표예요(격자 한 칸 50pt).`);
  }
  for (const image of result.images ?? []) {
    console.log(`  image ${image.image}: 자리 [${image.bbox.join(', ')}], 원본 ${image.pixels.join('×')}px${image.hidden_risk ? ' — 쪽에 보이는 모습과 달라요(가려진 부분·겹친 그림). region으로 꺼내요' : ''}`);
  }
  if (result.small_pieces) {
    console.log(`  (작은 그림 조각 ${result.small_pieces}개는 표에서 뺐어요 — 벡터 그림은 region으로 꺼내요)`);
  }
  for (const picture of result.pictures ?? []) {
    console.log(`  picture ${picture.picture}: ${picture.media} ${picture.width}×${picture.height}px`);
  }
  for (const item of result.rights ?? []) {
    const info = item.info ?? {};
    console.log(
      `  권리 표기 자리 [${item.bbox.join(', ')}]: ${item.publisher ? `출판 편집 삽화(이름표 ${info.title}) → third_party: publisher` : `제작자 ${info.creator ?? '-'}, 권리 문구 ${info.rights ?? '-'}, 제목 ${info.title ?? '-'}${info.web ? `, ${info.web}` : ''} → third_party`}`,
    );
  }
}

async function runExtract() {
  const targets = args.filter((arg) => !arg.startsWith('--'));
  const manifestFiles = all ? listManifestFiles(rootDir) : [...new Set(targets.flatMap((target) => resolveManifestTargets(rootDir, target)))];
  if (manifestFiles.length === 0) {
    console.error(all ? '[원고 그림] 그림 목록(content/lessons/**/*.images.yaml)이 하나도 없어요.' : `[원고 그림] 목록을 찾지 못했어요: ${targets.join(' ') || '(차시 이름을 적어요. 예: npm run images:extract -- 1-1-2)'}`);
    process.exitCode = 1;
    return;
  }
  const report = await extractLessonImages({
    rootDir,
    materialsDir,
    manifestFiles,
    only,
    dryRun,
    python: dryRun ? null : findImagePython(),
    faceCheck: skipFaceCheck ? 'skip' : 'on',
  });
  for (const line of report.done) console.log(`[원고 그림] 완료: ${line}`);
  for (const warning of report.warnings) console.warn(`[원고 그림] 참고: ${warning}`);
  for (const error of report.errors) console.error(`[원고 그림] 실패: ${error}`);
  if (report.needReview.length > 0) {
    console.log(`\n눈 확인이 필요한 그림 ${report.needReview.length}장 — 한 장씩 열어 얼굴·이름·화면 속 경로·파일명·기기 주소·학교명이 없는지 보고,`);
    console.log('목록 파일의 그 그림 항목 맨 끝에 이렇게 적어요(본 것을 result에 구체적으로):');
    console.log(REVIEW_TEMPLATE);
    for (const file of report.needReview) console.log(`  - ${file}`);
  }
  if (report.errors.length > 0) process.exitCode = 1;
}

try {
  if (check) runCheck();
  else if (show) runShow();
  else await runExtract();
} catch (error) {
  console.error(`[원고 그림] 멈췄어요: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
