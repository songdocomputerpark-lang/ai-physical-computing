import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  LARGE_FILE_LIMIT_BYTES,
  buildOriginalNameNeedles,
  checkRepoFiles,
  collectHandoutRecords,
  findDeviceAddresses,
  findPrivacyNeedles,
  findPrivacyPatterns,
  formatBuildOutputReport,
  formatHistoryReport,
  hashPrivacyNeedle,
  inspectRasterLeftovers,
  isPrivacyExceptionPathAllowed,
  originalDocumentNamesFromInventory,
  originalFolderNamesFromGitignore,
  rasterFormatOf,
  runBuildOutputCheck,
  runHistoryCheck,
  runRepoCheck,
  type RepoRules,
} from '../../scripts/lib/repo-check.mjs';
import { sha256Hex } from '../../scripts/lib/lesson-images.mjs';
import { makeTempDir, removeDir, writeFiles } from './helpers/fixture.ts';

const CHECK_REPO_CLI = fileURLToPath(new URL('../../scripts/check-repo.mjs', import.meta.url));

// 이 테스트 파일도 저장소 검사를 받는다. 검사에 걸리는 모양(사용자 폴더 경로·MAC 주소·이메일·전화번호·data: 그림)은
// 소스에 그대로 쓰지 않고 조각을 이어 붙여 만든다.
const windowsUserPath = ['C:', 'Users', 'kimteacher', 'Desktop', 'lesson.py'].join('\\');
const gitBashUserPath = ['', 'c', 'Users', 'kimteacher', 'Desktop'].join('/');
const genericLabAccountPath = ['C:', 'Users', 'COM', 'Desktop'].join('/');
const placeholderUserPath = ['C:', 'Users', '<사용자>', 'Desktop'].join('\\');
const oneDriveWord = ['One', 'Drive'].join('');
const oneDrivePath = ['D:', `${oneDriveWord} - 어느 기관`, 'lesson', 'a.txt'].join('\\');
const oneDriveInSentence = `파일은 ${oneDriveWord} - 어느 교육청/바탕 화면/수업 폴더에 있어요.`;
const realLookingMac = ['A4', 'CF', '12', '9B', '3E', '01'].join(':');
const placeholderMac = Array(6).fill('XX').join(':');
const realLookingEmail = ['kim.teacher', 'school-example.kr'].join('@');
const realLookingPhone = ['010', '2345', '6789'].join('-');
/** 래스터 그림의 data: 주소 앞부분(png) */
const rasterDataUrl = ['data:', 'image/png;base64,AAAA'].join('');
const svgDataUrl = ['data:', 'image/svg+xml;utf8,<svg/>'].join('');
/** 검사용 가짜 비공개 이름(실제 이름이 아니다) */
const FAKE_SECRET_NAME = '가나다고등학교';
const NEEDLE_SALT = 'test-salt-0123456789';

function rules(overrides: Partial<RepoRules> = {}): RepoRules {
  const folderNames = ['교과서_안', 'dll 오류', 'materials'];
  return {
    originalFormatAllowed: [],
    largeFileAllowed: [],
    imageReviews: new Map(),
    originalFolderNames: folderNames,
    originalNameNeedles: buildOriginalNameNeedles(folderNames, ['고등_인공지능과피지컬_2단원-1.pdf', 'opmp.zip']),
    ...overrides,
  };
}

function repoFile(filePath: string, content: string | Buffer, size?: number) {
  const buffer = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
  return { path: filePath, size: size ?? buffer.length, content: buffer };
}

function problemKeys(problems: { kind: string; path: string }[]): string[] {
  return problems.map((problem) => `${problem.kind}:${problem.path}`);
}

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);

describe('저장소 검사 규칙(checkRepoFiles)', () => {
  it('문제가 없는 파일은 통과한다(교실 PC 공용 계정 경로 같은 일반 이름 포함)', () => {
    const problems = checkRepoFiles(
      [
        repoFile('src/pages/index.astro', '<h1>홈</h1>'),
        repoFile('docs/INVENTORY.md', `캡처에는 ${genericLabAccountPath} 같은 일반 계정명만 보여요.`),
        repoFile('content/help/faq.md', 'dll 오류가 나면 드라이버를 다시 설치해요.'),
      ],
      rules(),
    );
    expect(problems).toEqual([]);
  });

  it('.pdf 같은 원본 형식은 막고, 허용 목록에 적은 편집본은 통과시킨다', () => {
    const files = [repoFile('handout.pdf', '%PDF-1.4'), repoFile('public/teacher/bt-redacted.pdf', '%PDF-1.4')];
    expect(problemKeys(checkRepoFiles(files, rules()))).toEqual([
      'original-format:handout.pdf',
      'original-format:public/teacher/bt-redacted.pdf',
    ]);
    const allowed = rules({ originalFormatAllowed: [{ path: 'public/teacher/*.pdf', reason: '가린 편집본(PD-31)' }] });
    expect(problemKeys(checkRepoFiles(files, allowed))).toEqual(['original-format:handout.pdf']);
  });

  it('가린 편집본 PDF(public/teacher/handouts/)는 쪽별 눈 확인 기록과 sha256이 맞아야 통과한다(P5-14, Phase 5 통합)', () => {
    const pdf = repoFile('public/teacher/handouts/demo-redacted.pdf', '%PDF-1.4 편집본');
    const sha256 = sha256Hex(pdf.content);
    const review = [1, 2, 3].map((page) => ({ page, by: 'claude', date: '2026-09-25', result: `통과 — ${page}쪽 확인` }));
    const allowPdf = { originalFormatAllowed: [{ path: 'public/teacher/handouts/*.pdf', reason: '가린 편집본(PD-31)' }] };
    const recordFile = (records: object) =>
      repoFile('scripts/handout-redactions.yaml', `documents:\n  demo:\n${Object.entries(records).map(([key, value]) => `    ${key}: ${JSON.stringify(value)}`).join('\n')}\n`);

    // 기록 있음·sha 같음·모든 쪽 통과 → 통과
    const good = collectHandoutRecords([recordFile({ source: { pages: 3 }, output: { path: pdf.path, sha256 }, review })]);
    expect(good.errors).toEqual([]);
    expect(checkRepoFiles([pdf], rules({ ...allowPdf, handoutReviews: good.records }))).toEqual([]);

    // 기록이 없으면 막는다
    expect(problemKeys(checkRepoFiles([pdf], rules(allowPdf)))).toEqual([`handout-review:${pdf.path}`]);

    // 쪽 하나가 빠지면 막는다
    const missingPage = collectHandoutRecords([recordFile({ source: { pages: 3 }, output: { path: pdf.path, sha256 }, review: review.slice(0, 2) })]);
    const missingProblems = checkRepoFiles([pdf], rules({ ...allowPdf, handoutReviews: missingPage.records }));
    expect(problemKeys(missingProblems)).toEqual([`handout-review:${pdf.path}`]);
    expect(missingProblems[0]?.detail).toContain('3쪽');

    // 편집본이 바뀌어 sha가 다르면 막는다
    const changed = collectHandoutRecords([recordFile({ source: { pages: 3 }, output: { path: pdf.path, sha256: '0'.repeat(64) }, review })]);
    const changedProblems = checkRepoFiles([pdf], rules({ ...allowPdf, handoutReviews: changed.records }));
    expect(problemKeys(changedProblems)).toEqual([`handout-review:${pdf.path}`]);
    expect(changedProblems[0]?.detail).toContain('output.sha256');

    // 끝에 덧붙인 출처·라이선스 쪽(credits_page, P6-04)이 있으면 그 쪽(원본 쪽 수 + 1)의 기록도 있어야 통과한다
    const credits_page = { title: '출처와 라이선스', subtitle: '안내', sections: [{ heading: '칸', text: '글' }] };
    const withCredits = collectHandoutRecords([recordFile({ source: { pages: 3 }, output: { path: pdf.path, sha256 }, credits_page, review })]);
    expect(withCredits.records.get(pdf.path)?.pages).toBe(4);
    const creditsProblems = checkRepoFiles([pdf], rules({ ...allowPdf, handoutReviews: withCredits.records }));
    expect(problemKeys(creditsProblems)).toEqual([`handout-review:${pdf.path}`]);
    expect(creditsProblems[0]?.detail).toContain('4쪽');
    const creditsReviewed = collectHandoutRecords([
      recordFile({
        source: { pages: 3 },
        output: { path: pdf.path, sha256 },
        credits_page,
        review: [...review, { page: 4, by: 'claude', date: '2026-09-26', result: '통과 — 출처·라이선스 쪽' }],
      }),
    ]);
    expect(checkRepoFiles([pdf], rules({ ...allowPdf, handoutReviews: creditsReviewed.records }))).toEqual([]);
  });

  it('.pyc와 __pycache__ 폴더를 막는다', () => {
    const problems = checkRepoFiles([repoFile('examples/__pycache__/lib.cpython-311.pyc', Buffer.from([0x00, 0x01]))], rules());
    expect(problemKeys(problems)).toEqual(['original-format:examples/__pycache__/lib.cpython-311.pyc']);
  });

  it('5MB를 넘는 파일은 막고, 허용 목록의 max_mb 안이면 통과시킨다', () => {
    const big = repoFile('public/models/hand.task', Buffer.alloc(8), LARGE_FILE_LIMIT_BYTES + 1);
    expect(problemKeys(checkRepoFiles([big], rules()))).toEqual(['large-file:public/models/hand.task']);

    const allowed = rules({ largeFileAllowed: [{ path: 'public/models/*.task', reason: '모델', maxMb: 10 }] });
    expect(checkRepoFiles([big], allowed)).toEqual([]);

    const tooBig = repoFile('public/models/hand.task', Buffer.alloc(8), 11 * 1024 * 1024);
    const problems = checkRepoFiles([tooBig], allowed);
    expect(problemKeys(problems)).toEqual(['large-file:public/models/hand.task']);
    expect(problems[0].detail).toContain('최대 10MB');
  });

  it('docs/SPEC.md와 원본 자료 폴더의 파일은 추적하면 안 된다', () => {
    const problems = checkRepoFiles([repoFile('docs/SPEC.md', '# 사양'), repoFile('교과서_안/메모.txt', '원본')], rules());
    expect(problemKeys(problems)).toEqual(['forbidden:docs/SPEC.md', 'original-folder:교과서_안/메모.txt']);
  });

  it('public/·examples/·content/·src/ 안의 원본 파일 이름을 찾는다(docs/는 설명용이라 뺀다)', () => {
    const problems = checkRepoFiles(
      [
        repoFile('content/lessons/u2/2-1-1.md', '출처: 고등_인공지능과피지컬_2단원-1.pdf 12쪽'),
        repoFile('src/lib/paths.ts', "const root = '교과서_안';"),
        repoFile('examples/notes.txt', '압축 파일 OPMP.ZIP에서 옮김'),
        repoFile('docs/INVENTORY.md', '고등_인공지능과피지컬_2단원-1.pdf'),
        repoFile('content/notes/materials.md', 'materials 필드를 적어요.'),
      ],
      rules(),
    );
    expect(problemKeys(problems)).toEqual([
      'original-name:content/lessons/u2/2-1-1.md',
      'original-name:src/lib/paths.ts',
      'original-name:examples/notes.txt',
    ]);
  });

  it('사용자 폴더 경로·OneDrive 경로·MAC 주소를 찾고, 자리표시자는 통과시킨다', () => {
    const problems = checkRepoFiles(
      [
        repoFile('examples/vision/a.py', `print(1)\nopen(r"${windowsUserPath}")\n`),
        repoFile('scripts/tool.mjs', `const dir = '${gitBashUserPath}';`),
        repoFile('PROGRESS.md', `기록: ${oneDrivePath}`),
        repoFile('examples/esp32/ble.py', `ADDRESS = "${realLookingMac}"`),
        repoFile('content/lessons/ble.md', `주소는 ${placeholderMac}처럼 가려요. 경로 예: ${placeholderUserPath}`),
        repoFile('src/lib/errors.ts', 'File "/home/pyodide/main.py", line 1'),
      ],
      rules(),
    );
    expect(problemKeys(problems)).toEqual([
      'privacy:examples/vision/a.py',
      'privacy:scripts/tool.mjs',
      'privacy:PROGRESS.md',
      'privacy:examples/esp32/ble.py',
    ]);
    expect(problems[0].detail).toContain('2번째 줄');
    // 공개 CI 기록에 다시 퍼지지 않게 찾은 값은 가려서 알린다.
    expect(problems.map((problem) => problem.detail).join('\n')).not.toContain('kimteacher');
    expect(problems.map((problem) => problem.detail).join('\n')).not.toContain(realLookingMac);
  });

  it('문장 가운데 적힌 OneDrive 경로, 이메일, 전화번호도 찾고, noreply·example·전부 0인 번호는 통과시킨다(2026-09-16 검토 반영)', () => {
    const problems = checkRepoFiles(
      [
        repoFile('docs/notes.md', oneDriveInSentence),
        repoFile('content/help/contact.md', `문의: ${realLookingEmail}\n전화 ${realLookingPhone}\n`),
        repoFile('docs/DECISIONS.md', '커밋 작성자: 249858253+someone@users.noreply.github.com, noreply@anthropic.com'),
        repoFile('tests/unit/link.test.ts', '<a href="mailto:someone@example.com">메일</a> <img srcset="a@2x.webp 2x">'),
        repoFile('content/help/placeholder.md', '전화번호 예: 010-0000-0000, 버전 2026-09-16, 0.10.35'),
        repoFile('scripts/lib/check.mjs', `const ${oneDriveWord.toLowerCase()}Rule = '${oneDriveWord} 경로는 지워요';`),
      ],
      rules(),
    );
    expect(problemKeys(problems)).toEqual(['privacy:docs/notes.md', 'privacy:content/help/contact.md', 'privacy:content/help/contact.md']);
    const details = problems.map((problem) => problem.detail).join('\n');
    expect(details).toContain('OneDrive 폴더 경로');
    expect(details).toContain('이메일 주소 모양');
    expect(details).toContain('전화번호 모양');
    expect(details).not.toContain('kim.teacher');
    expect(details).not.toContain(realLookingPhone);
  });

  it('privacy_exceptions는 public/licenses/ 고지 원문의 이메일 모양만 건너뛰고, 다른 파일·다른 모양은 그대로 잡는다(2026-09-16 P2-02)', () => {
    const noticeText = `MIT License\n\nCopyright (C) 2018 by Someone <${realLookingEmail}> and others\n`;
    const exceptions = [{ path: 'public/licenses/*.txt', kinds: ['email'], reason: '라이선스 고지 원문' }];
    const problems = checkRepoFiles(
      [
        repoFile('public/licenses/editor.txt', `${noticeText}전화 ${realLookingPhone}\n`),
        repoFile('public/licenses/other.md', noticeText),
        repoFile('content/help/contact.md', noticeText),
      ],
      rules({ privacyExceptions: exceptions }),
    );
    // 예외 파일에서는 이메일만 빠지고 전화번호는 잡힌다. 패턴 밖 파일은 이메일도 잡힌다.
    expect(problemKeys(problems)).toEqual(['privacy:public/licenses/editor.txt', 'privacy:public/licenses/other.md', 'privacy:content/help/contact.md']);
    expect(problems[0].detail).toContain('전화번호 모양');
    expect(problems[1].detail).toContain('이메일 주소 모양');
    expect(findPrivacyPatterns(noticeText, { skipKinds: ['email'] })).toEqual([]);
    expect(findPrivacyPatterns(noticeText)).toHaveLength(1);
  });

  it('privacy_exceptions의 path는 public/licenses/ 아래나 package-lock.json만 되고, npm 잠금 파일의 deprecated 안내문 이메일은 예외로 건너뛴다(2026-09-16 병렬 제작 준비)', () => {
    expect(isPrivacyExceptionPathAllowed('public/licenses/codemirror.txt')).toBe(true);
    expect(isPrivacyExceptionPathAllowed('public/licenses/*.txt')).toBe(true);
    expect(isPrivacyExceptionPathAllowed('package-lock.json')).toBe(true);
    expect(isPrivacyExceptionPathAllowed('package.json')).toBe(false);
    expect(isPrivacyExceptionPathAllowed('content/help/contact.md')).toBe(false);
    expect(isPrivacyExceptionPathAllowed('public/images/site/a.svg')).toBe(false);
    const lockText = `{\n  "node_modules/glob": {\n    "version": "11.1.0",\n    "deprecated": "Old versions are not supported. Contact ${realLookingEmail}"\n  }\n}\n`;
    const exceptions = [{ path: 'package-lock.json', kinds: ['email'], reason: 'npm이 기록한 다른 패키지의 안내문' }];
    expect(problemKeys(checkRepoFiles([repoFile('package-lock.json', lockText)], rules()))).toEqual(['privacy:package-lock.json']);
    expect(problemKeys(checkRepoFiles([repoFile('package-lock.json', lockText)], rules({ privacyExceptions: exceptions })))).toEqual([]);
    // 예외는 이메일만이라 같은 파일의 전화번호 모양은 그대로 잡힌다.
    expect(problemKeys(checkRepoFiles([repoFile('package-lock.json', `${lockText}${realLookingPhone}\n`)], rules({ privacyExceptions: exceptions })))).toEqual(['privacy:package-lock.json']);
  });

  it('UTF-16으로 저장된 글도 읽어서 사용자 폴더 경로를 찾는다(PowerShell 5.1 기본 저장 형식)', () => {
    const text = `경로: ${windowsUserPath}\n`;
    const utf16le = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]);
    const utf16be = Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(text, 'utf16le').swap16()]);
    const problems = checkRepoFiles([repoFile('docs/utf16le.md', utf16le), repoFile('docs/utf16be.md', utf16be)], rules());
    expect(problemKeys(problems)).toEqual(['privacy:docs/utf16le.md', 'privacy:docs/utf16be.md']);
  });

  it('해시로만 적어 둔 비공개 이름(학교명 등)을 띄어쓰기·조사와 상관없이 찾고, 이름은 알리지 않는다', () => {
    const needle = hashPrivacyNeedle(FAKE_SECRET_NAME, NEEDLE_SALT);
    expect(needle).toEqual({ sha256: expect.stringMatching(/^[0-9a-f]{64}$/u), length: 7, script: 'hangul' });
    expect(hashPrivacyNeedle('가나다 고등학교', NEEDLE_SALT).sha256).toBe(needle.sha256);
    expect(() => hashPrivacyNeedle('가나다 High', NEEDLE_SALT)).toThrow();

    const privacyNeedles = { salt: NEEDLE_SALT, needles: [{ label: '학교 이름', ...needle }] };
    expect(findPrivacyNeedles(`첫 줄\n우리 ${FAKE_SECRET_NAME}의 실습실`, privacyNeedles)).toEqual([
      expect.stringContaining('2번째 줄: 비공개 이름(학교 이름'),
    ]);
    expect(findPrivacyNeedles('인천 가나다 고등학교 1학년', privacyNeedles)).toHaveLength(1);
    // 문장 부호로 나뉜 낱말은 하나로 붙여 보지 않는다.
    expect(findPrivacyNeedles('가나다·"고등학교" 형태', privacyNeedles)).toEqual([]);
    expect(findPrivacyNeedles('다른 고등학교 이야기', privacyNeedles)).toEqual([]);
    expect(findPrivacyNeedles(FAKE_SECRET_NAME, undefined)).toEqual([]);

    const problems = checkRepoFiles([repoFile('content/lessons/u1/intro.md', `${FAKE_SECRET_NAME} 학생들이`)], rules({ privacyNeedles }));
    expect(problemKeys(problems)).toEqual(['privacy:content/lessons/u1/intro.md']);
    expect(problems[0].detail).not.toContain(FAKE_SECRET_NAME);
  });

  it('공개 이미지는 눈 확인 기록(reviewed)이 "통과"여야 커밋할 수 있다', () => {
    const imagePath = 'public/images/lessons/u1/pixel.png';
    const files = [
      repoFile(imagePath, PNG_BYTES),
      repoFile('public/images/site/flow.svg', '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>'),
      repoFile('public/images/site/photo.svg', `<svg><image href="${rasterDataUrl}"/></svg>`),
      repoFile('tests/e2e/home.png', PNG_BYTES),
    ];
    expect(problemKeys(checkRepoFiles(files, rules()))).toEqual([
      `image-review:${imagePath}`,
      'image-review:public/images/site/photo.svg',
      'image-review:tests/e2e/home.png',
    ]);

    const reviewed = new Map<string, unknown>([
      [imagePath, { path: imagePath, reviewed: { by: 'claude', date: '2026-09-16', result: '통과 — 얼굴·이름·경로 없음' } }],
      ['public/images/site/photo.svg', { reviewed: { by: 'claude', date: '2026-09-16', result: '문제 있음 — 얼굴' } }],
      ['tests/e2e/home.png', { reviewed: { by: 'claude', date: '2026-09-16', result: '통과 — 합성 화면' } }],
    ]);
    const problems = checkRepoFiles(files, rules({ imageReviews: reviewed }));
    expect(problemKeys(problems)).toEqual(['image-review:public/images/site/photo.svg']);
    expect(problems[0].detail).toContain('"통과"로 시작하지 않아요');
  });

  it('폴더에 상관없이 래스터 이미지와, 글·코드 파일 안에 data: 주소로 넣은 래스터 그림도 눈 확인 기록이 있어야 한다(2026-09-16 검토 반영)', () => {
    const files = [
      repoFile('.github/banner.jpg', PNG_BYTES),
      repoFile('root-photo.PNG', PNG_BYTES),
      repoFile('content/lessons/embedded.md', `![얼굴](${rasterDataUrl})`),
      repoFile('src/components/Embedded.astro', `<img src="${rasterDataUrl}" alt="">`),
      repoFile('public/images/site/css-raster.svg', `<svg><style>.a{background:url(${rasterDataUrl})}</style><rect/></svg>`),
      repoFile('public/images/site/filter.svg', `<svg><filter><feImage xlink:href="${rasterDataUrl}"/></filter></svg>`),
      repoFile('public/images/site/vector.svg', `<svg><image href="${svgDataUrl}"/></svg>`),
      repoFile('src/styles/icons.css', `.icon{background:url("${svgDataUrl}")}`),
    ];
    const problems = checkRepoFiles(files, rules());
    expect(problemKeys(problems)).toEqual([
      'image-review:.github/banner.jpg',
      'image-review:root-photo.PNG',
      'image-review:content/lessons/embedded.md',
      'image-review:src/components/Embedded.astro',
      'image-review:public/images/site/css-raster.svg',
      'image-review:public/images/site/filter.svg',
    ]);
    expect(problems[2].detail).toContain('data: 주소로 넣은 래스터 그림');
  });

  // 2026-09-25 P5-01: 차시 그림 목록의 기록에는 도구가 적은 sha256이 있어, 눈으로 본 뒤 그림이 바뀌면 다시 보게 한다.
  it('기록에 sha256이 있으면 그림 내용과 같아야 한다', () => {
    const imagePath = 'public/images/lessons/1-1-2/a.webp';
    const bytes = cleanWebp();
    const record = (sha256: string) =>
      new Map<string, unknown>([[imagePath, { reviewed: { by: 'claude', date: '2026-09-25', result: '통과 — 사람 없음' }, sha256, recordFile: 'content/lessons/u1/1-1-2.images.yaml' }]]);
    expect(checkRepoFiles([repoFile(imagePath, bytes)], rules({ imageReviews: record(sha256Hex(bytes)) }))).toEqual([]);
    const problems = checkRepoFiles([repoFile(imagePath, bytes)], rules({ imageReviews: record('0'.repeat(64)) }));
    expect(problemKeys(problems)).toEqual([`image-review:${imagePath}`]);
    expect(problems[0].detail).toContain('sha256');
    expect(problems[0].detail).toContain('content/lessons/u1/1-1-2.images.yaml');
  });

  it('그림 안에 메타데이터(WebP EXIF, PNG 글 조각, JPEG APP1)가 남았거나 확인할 수 없는 형식이면 막는다', () => {
    const reviewedAll = (paths: string[]) =>
      new Map<string, unknown>(paths.map((item) => [item, { reviewed: { by: 'claude', date: '2026-09-25', result: '통과 — 사람 없음' } }]));
    const files = [
      repoFile('public/images/lessons/x/clean.webp', cleanWebp()),
      repoFile('public/images/lessons/x/exif.webp', cleanWebp(riffChunk('EXIF', Buffer.from('Exif..')))),
      repoFile('public/images/lessons/x/text.png', pngWithText()),
      repoFile('public/images/lessons/x/camera.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0xff, 0xd9])),
      repoFile('public/images/lessons/x/phone.heic', Buffer.from('ftypheic')),
    ];
    const problems = checkRepoFiles(files, rules({ imageReviews: reviewedAll(files.map((file) => file.path)) }));
    expect(problemKeys(problems)).toEqual([
      'image-metadata:public/images/lessons/x/exif.webp',
      'image-metadata:public/images/lessons/x/text.png',
      'image-metadata:public/images/lessons/x/camera.jpg',
      'image-metadata:public/images/lessons/x/phone.heic',
    ]);
    expect(problems.map((problem) => problem.detail).join('\n')).toContain('WebP EXIF 조각');
  });
});

/** 64×32 손실 WebP(메타데이터 없음). 조각을 더 넣으면 그 뒤에 붙는다. */
function riffChunk(type: string, payload: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.write(type, 0, 'latin1');
  header.writeUInt32LE(payload.length, 4);
  return Buffer.concat([header, payload, payload.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
}
function cleanWebp(...extra: Buffer[]): Buffer {
  const body = Buffer.concat([Buffer.from('WEBP', 'latin1'), riffChunk('VP8 ', Buffer.from([0, 0, 0, 0x9d, 0x01, 0x2a, 0x40, 0x00, 0x20, 0x00])), ...extra]);
  const header = Buffer.alloc(8);
  header.write('RIFF', 0, 'latin1');
  header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}
function pngWithText(): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    return Buffer.concat([length, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)]);
  };
  return Buffer.concat([PNG_BYTES.subarray(0, 8), chunk('IHDR', Buffer.alloc(13)), chunk('tEXt', Buffer.from('Software tool')), chunk('IEND', Buffer.alloc(0))]);
}

// ── 그림에 남은 것(2026-09-26 P6-05): 끝 뒤 바이트·모르는 조각·썸네일·글 확장·색 프로필 경로 ──
function pngChunkOf(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  return Buffer.concat([length, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)]);
}
function pngFile(...chunks: Buffer[]): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(4, 0);
  header.writeUInt32BE(2, 4);
  return Buffer.concat([PNG_BYTES.subarray(0, 8), pngChunkOf('IHDR', header), ...chunks, pngChunkOf('IDAT', Buffer.alloc(4)), pngChunkOf('IEND', Buffer.alloc(0))]);
}
function jpegSegmentOf(marker: number, payload: Buffer): Buffer {
  const head = Buffer.from([0xff, marker, 0, 0]);
  head.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([head, payload]);
}
/** JFIF 머리(썸네일 가로·세로 x·y — 0이면 썸네일 없음) */
function jfif(x: number, y: number): Buffer {
  return jpegSegmentOf(0xe0, Buffer.concat([Buffer.from('JFIF\0', 'latin1'), Buffer.from([1, 1, 0, 0, 1, 0, 1, x, y]), Buffer.alloc(3 * x * y)]));
}
/** 영상 자료 구간 하나(채움 00과 재시작 표시가 섞임) */
function jpegScan(): Buffer {
  return Buffer.concat([jpegSegmentOf(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0])), Buffer.from([0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56])]);
}
function jpegFile(...parts: Buffer[]): Buffer {
  const frame = jpegSegmentOf(0xc2, Buffer.from([8, 0, 2, 0, 4, 1, 1, 0x11, 0]));
  return Buffer.concat([Buffer.from([0xff, 0xd8]), ...parts.slice(0, 1), frame, ...parts.slice(1), Buffer.from([0xff, 0xd9])]);
}
function gifFile(...blocks: Buffer[]): Buffer {
  const header = Buffer.concat([Buffer.from('GIF89a', 'latin1'), Buffer.from([4, 0, 2, 0, 0, 0, 0])]);
  const image = Buffer.from([0x2c, 0, 0, 0, 0, 4, 0, 2, 0, 0, 0x02, 0x02, 0x4c, 0x01, 0x00]);
  return Buffer.concat([header, ...blocks, image, Buffer.from([0x3b])]);
}
function gifApplication(name: string): Buffer {
  return Buffer.concat([Buffer.from([0x21, 0xff, 0x0b]), Buffer.from(name, 'latin1'), Buffer.from([0x03, 0x01, 0x00, 0x00, 0x00])]);
}
/** BMP(머리 크기 40 = 옛 머리, 124 = V5 — colorSpace는 V5의 bV5CSType 네 글자) */
function bmpFile(headerSize: 40 | 124, colorSpace?: string): Buffer {
  const buffer = Buffer.alloc(14 + headerSize + 4);
  buffer.write('BM', 0, 'latin1');
  buffer.writeUInt32LE(buffer.length, 2);
  buffer.writeUInt32LE(14 + headerSize, 10);
  buffer.writeUInt32LE(headerSize, 14);
  if (colorSpace) buffer.writeUInt32LE(Buffer.from(colorSpace, 'latin1').readUInt32BE(0), 70);
  return buffer;
}
function icoWith(image: Buffer): Buffer {
  const header = Buffer.from([0, 0, 1, 0, 1, 0]);
  const entry = Buffer.alloc(16);
  entry.writeUInt32LE(image.length, 8);
  entry.writeUInt32LE(22, 12);
  return Buffer.concat([header, entry, image]);
}

describe('그림에 남은 것(inspectRasterLeftovers, 2026-09-26 P6-05)', () => {
  it('깨끗한 그림은 통과한다(WebP·PNG의 그리기 조각·점진 JPEG·반복 재생 GIF·옛 BMP·ICO 안 PNG)', () => {
    const clean: [string, Buffer][] = [
      ['WebP', cleanWebp()],
      ['PNG(pHYs·sRGB·gAMA)', pngFile(pngChunkOf('pHYs', Buffer.alloc(9)), pngChunkOf('sRGB', Buffer.alloc(1)), pngChunkOf('gAMA', Buffer.alloc(4)))],
      ['JPEG(썸네일 없는 JFIF, 영상 구간 둘)', jpegFile(jfif(0, 0), jpegScan(), jpegSegmentOf(0xc4, Buffer.alloc(3)), jpegScan())],
      ['GIF(반복 재생)', gifFile(gifApplication('NETSCAPE2.0'))],
      ['BMP(옛 머리)', bmpFile(40)],
      ['BMP(V5, 표준 색 공간)', bmpFile(124, 'sRGB')],
      ['ICO(PNG)', icoWith(pngFile())],
    ];
    for (const [name, bytes] of clean) {
      expect({ name, format: rasterFormatOf(bytes) === null, found: inspectRasterLeftovers(bytes) }).toEqual({ name, format: false, found: [] });
    }
  });

  it('끝 뒤 바이트·모르는 조각·썸네일·글 확장·색 프로필 경로·ICO 안 메타데이터를 알린다', () => {
    const note = Buffer.from('saved by an editor', 'latin1');
    const cases: [string, Buffer, string][] = [
      ['WebP 끝 뒤', Buffer.concat([cleanWebp(), note]), 'WebP 끝(RIFF 크기) 뒤에 붙은 바이트'],
      ['PNG 끝 뒤', Buffer.concat([pngFile(), note]), 'PNG 끝(IEND) 뒤에 붙은 바이트'],
      ['PNG 편집기 전용 조각', pngFile(pngChunkOf('iDOT', Buffer.alloc(28))), 'PNG의 알 수 없는 조각 "iDOT"'],
      ['PNG 출처 기록 조각', pngFile(pngChunkOf('caBX', note)), 'PNG의 알 수 없는 조각 "caBX"'],
      ['JPEG 끝 뒤', Buffer.concat([jpegFile(jfif(0, 0), jpegScan()), note]), 'JPEG 끝(EOI) 뒤에 붙은 바이트'],
      ['JPEG JFIF 썸네일', jpegFile(jfif(2, 2), jpegScan()), 'JPEG JFIF 썸네일'],
      ['GIF 글 확장', gifFile(Buffer.concat([Buffer.from([0x21, 0x01, 0x0c]), Buffer.alloc(12), Buffer.from([0x05]), Buffer.from('hello', 'latin1'), Buffer.from([0])])), 'GIF 글 확장'],
      ['GIF 색 프로필 응용 확장', gifFile(gifApplication('ICCRGBG1012')), 'GIF 응용 확장 "ICCRGBG1012"'],
      ['GIF 끝 뒤', Buffer.concat([gifFile(), note]), 'GIF 끝 뒤에 붙은 바이트'],
      ['BMP 색 프로필 경로', bmpFile(124, 'LINK'), 'BMP 색 프로필 경로(LINK)'],
      ['BMP 색 프로필', bmpFile(124, 'MBED'), 'BMP 색 프로필(MBED)'],
      ['ICO 안 PNG 글 조각', icoWith(pngFile(pngChunkOf('tEXt', note))), 'ICO 1번째 그림(PNG): PNG tEXt 조각'],
    ];
    for (const [name, bytes, expected] of cases) {
      expect({ name, found: inspectRasterLeftovers(bytes).join(' / ') }).toEqual({ name, found: expect.stringContaining(expected) });
    }
  });

  it('저장소 검사는 그림 확장자인데 내용 형식을 모르는 파일도 막고, 남은 것은 메타데이터 문제로 알린다', () => {
    const reviewedAll = (paths: string[]) =>
      new Map<string, unknown>(paths.map((item) => [item, { reviewed: { by: 'claude', date: '2026-09-26', result: '통과 — 사람 없음' } }]));
    const files = [
      repoFile('public/images/site/renamed.png', Buffer.from('not really an image')),
      repoFile('public/images/site/tail.webp', Buffer.concat([cleanWebp(), Buffer.from('note', 'latin1')])),
      repoFile('public/images/site/ok.webp', cleanWebp()),
    ];
    const problems = checkRepoFiles(files, rules({ imageReviews: reviewedAll(files.map((file) => file.path)) }));
    expect(problemKeys(problems)).toEqual(['image-metadata:public/images/site/renamed.png', 'image-metadata:public/images/site/tail.webp']);
    expect(problems[0]?.detail).toContain('내용이 PNG·JPEG·GIF·WebP·BMP·ICO가 아니라');
    expect(problems[1]?.detail).toContain('WebP 끝(RIFF 크기) 뒤에 붙은 바이트 4개');
  });
});

describe('원본 이름 목록 만들기', () => {
  it('.gitignore의 "원본 자료" 묶음에서만 폴더 이름을 읽는다', () => {
    const gitignore = ['# 원본 자료(운영자 PC에만 있음)', '/교과서_안/', '/dll 오류/', '', '# 빌드', '/dist/', 'node_modules/'].join('\n');
    expect(originalFolderNamesFromGitignore(gitignore)).toEqual(['교과서_안', 'dll 오류']);
  });

  it('INVENTORY의 `…` 안 문서·압축 파일 이름을 읽는다', () => {
    const inventory = '| `교과서_안/고등_인공지능과피지컬_2단원-1.pdf` | `3.(응용)(값을 받음)…/thonny_블루투스.zip` | `main.py` |';
    expect(originalDocumentNamesFromInventory(inventory)).toEqual(['고등_인공지능과피지컬_2단원-1.pdf', 'thonny_블루투스.zip']);
  });

  it('일반 낱말과 겹치는 폴더 이름과 짧은 이름은 확장자 없이 찾지 않는다', () => {
    const needles = buildOriginalNameNeedles(['교과서_안', 'dll 오류', 'materials'], ['opmp.zip', 'thonny_블루투스.zip']);
    expect(needles).toEqual(['opmp.zip', 'thonny_블루투스', 'thonny_블루투스.zip', '교과서_안']);
  });

  it('findPrivacyPatterns는 줄 번호를 알려 준다', () => {
    expect(findPrivacyPatterns(`첫 줄\n둘째 줄 ${realLookingMac}`)).toEqual([expect.stringContaining('2번째 줄: MAC 주소 모양')]);
  });

  // 2026-09-25 Phase 4 검토 반영(S8): 콜론·붙임표 말고도 기기 주소가 적히는 모양 — MicroPython config('mac')의 bytes print 결과 등.
  it('bytes 글자·점·주소 낱말 옆 12자리·빈칸·bytes([0x…]) 모양의 기기 주소도 찾고, 흔한 6바이트와 가상 주소는 통과시킨다', () => {
    const pairs = ['02', '11', '22', '33', '44', '55'];
    const escape = ['b"', ...pairs.map((pair) => ['\\', 'x', pair].join('')), '"'].join('');
    const dotted = ['0211', '2233', '4455'].join('.');
    const bare = pairs.join('');
    const spaced = pairs.join(' ');
    const list = `bytes([${pairs.map((pair) => `0x${pair}`).join(', ')}])`;
    const found = {
      escape: findPrivacyPatterns(`print(${escape})`),
      dotted: findPrivacyPatterns(`기록 ${dotted}`),
      bare: findPrivacyPatterns(`mac = "${bare}"`),
      spaced: findPrivacyPatterns(`보드 주소: ${spaced}`),
      list: findPrivacyPatterns(`addr = ${list}`),
    };
    for (const [shape, findings] of Object.entries(found)) {
      expect({ shape, count: findings.length }).toEqual({ shape, count: 1 });
      expect(findings[0]).toContain('MAC 주소 모양');
      expect(findings.join('\n')).not.toContain(bare);
    }
    // 주소 낱말이 없는 6바이트(I2C 명령·MP3 프레임·16진수 기록)와 사이트 가상 주소(02:00:00:00:00:xx), 전부 0·FF는 통과
    const virtual = ['b"', ...['02', '00', '00', '00', '00', '01'].map((pair) => ['\\', 'x', pair].join('')), '"'].join('');
    const zeros = ['b"', ...Array(6).fill(['\\', 'x', '00'].join('')), '"'].join('');
    expect(findPrivacyPatterns(`i2c.writeto(0x3C, ${list})`)).toEqual([]);
    expect(findPrivacyPatterns(`받은 바이트 ${spaced}`)).toEqual([]);
    expect(findPrivacyPatterns(`return ${virtual}`)).toEqual([]);
    expect(findPrivacyPatterns(`mac = ${zeros}`)).toEqual([]);
    expect(findPrivacyPatterns(`sha256 ${'0123456789abcdef'.repeat(4)}`)).toEqual([]);
  });

  it('영상·소리는 사람이 보고(듣고) 적은 기록(sha256 포함)이 있어야 하고 바이트 속 경로·주소도 훑는다, 이진 파일은 정해진 자리에만(2026-09-26 Phase 6 안전 검토 지적 6)', () => {
    const clip = Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x18]), Buffer.from(`ftypmp42 author ${realLookingEmail} ${windowsUserPath}`, 'latin1')]);
    const noRecord = checkRepoFiles([repoFile('public/images/lessons/2-1-1/class-demo.mp4', clip)], rules());
    expect(problemKeys(noRecord)).toEqual([
      'media-review:public/images/lessons/2-1-1/class-demo.mp4',
      'privacy:public/images/lessons/2-1-1/class-demo.mp4',
      'privacy:public/images/lessons/2-1-1/class-demo.mp4',
    ]);
    const audio = repoFile('content/lessons/u2/voice.mp3', Buffer.from([0x49, 0x44, 0x33, 0x04, 0x00]));
    const reviewedWithoutHash = rules({ imageReviews: new Map([[audio.path, { reviewed: { by: '운영자', date: '2026-09-26', result: '통과' } }]]) });
    expect(problemKeys(checkRepoFiles([audio], reviewedWithoutHash))).toEqual(['media-review:content/lessons/u2/voice.mp3']);
    const reviewed = rules({
      imageReviews: new Map([[audio.path, { reviewed: { by: '운영자', date: '2026-09-26', result: '통과 — 끝까지 들음' }, sha256: sha256Hex(audio.content) }]]),
    });
    expect(checkRepoFiles([audio], reviewed)).toEqual([]);

    // 이진 파일의 자리: 펌웨어 .bin은 public/firmware/ 아래, 목록의 sha256과 같아야
    const firmware = repoFile('public/firmware/v1.29.0/board.bin', Buffer.from([0xe9, 0x03, 0x02, 0x20]));
    const firmwareHashes = new Set([sha256Hex(firmware.content)]);
    expect(checkRepoFiles([firmware], rules({ firmwareHashes }))).toEqual([]);
    const backup = repoFile('public/firmware/v1.29.0/flash-backup.bin', Buffer.from([0xe9, 0x03, 0x02, 0x21]));
    expect(problemKeys(checkRepoFiles([backup], rules({ firmwareHashes })))).toEqual(['binary-path:public/firmware/v1.29.0/flash-backup.bin']);
    const misplaced = [
      repoFile('content/lessons/u2/dump.bin', Buffer.from('ssid=우리집')),
      repoFile('public/images/site/a.woff2', Buffer.from([0x77, 0x4f, 0x46, 0x32])),
      repoFile('tests/fixtures/model.task', Buffer.from([0x00])),
    ];
    expect(problemKeys(checkRepoFiles(misplaced, rules())).sort()).toEqual(
      ['binary-path:content/lessons/u2/dump.bin', 'binary-path:public/images/site/a.woff2', 'binary-path:tests/fixtures/model.task'].sort(),
    );
    const placed = [repoFile('public/models/hand.task', Buffer.from([0x00])), repoFile('public/fonts/pretendard/a.woff2', Buffer.from([0x77, 0x4f, 0x46, 0x32]))];
    expect(checkRepoFiles(placed, rules())).toEqual([]);
  });

  it('국제 형식·괄호·줄표 전화번호, 전각 ＠ 이메일, 네트워크 공유·%5C로 적은 사용자 폴더 경로도 찾는다(2026-09-26 Phase 6 안전 검토 지적 10)', () => {
    const middle = ['2345', '6789'];
    const found = (text: string) => findPrivacyPatterns(text).length;
    expect(found(`연락처 +82-10-${middle.join('-')}`)).toBe(1);
    expect(found(`연락처 +82 10 ${middle.join(' ')}`)).toBe(1);
    expect(found(`연락처 (010) ${middle.join('-')}`)).toBe(1);
    expect(found(`연락처 010–${middle.join('–')}`)).toBe(1);
    expect(found(`연락처 010－${middle.join('－')}`)).toBe(1);
    expect(found(`메일 ${realLookingEmail.replace('@', '＠')}`)).toBe(1);
    expect(found(['\\\\교무실PC', 'Users', 'kimteacher', 'Desktop', 'a.py'].join('\\'))).toBe(1);
    expect(found(['//LAB-PC', 'c$', 'Users', 'kimteacher', 'a.py'].join('/'))).toBe(1);
    expect(found(`file:///C:${['%5CUsers', 'kimteacher', 'Desktop'].join('%5C')}`)).toBe(1);
    // 자리표시자와 일반 주소는 그대로 통과
    expect(found('+82-10-0000-0000, (010) 0000-0000, 010–0000–0000')).toBe(0);
    expect(found('https://github.com/Users/guide 과 //cdn.example.com/Users/x')).toBe(0);
    expect(found(['\\\\교무실PC', 'Users', '<사용자>', 'a.py'].join('\\'))).toBe(0);
  });

  it('예제·차시의 와이파이 비밀번호는 자리표시자만 된다(값은 알리지 않는다, 2026-09-26 Phase 6 안전 검토 지적 10)', () => {
    const secret = ['k1ms', 'chool', '2026!'].join('');
    const leaky = [
      repoFile('examples/esp32/u3/net.py', `wlan.connect("교실공유기", "${secret}")\n`),
      repoFile('content/lessons/u3/c9.md', `WIFI_PASSWORD = '${secret}'\n`),
    ];
    const problems = checkRepoFiles(leaky, rules());
    expect(problemKeys(problems)).toEqual(['privacy:examples/esp32/u3/net.py', 'privacy:content/lessons/u3/c9.md']);
    expect(problems.map((problem) => problem.detail).join('\n')).not.toContain(secret);
    const placeholders = [
      repoFile('examples/esp32/u3/ok.py', 'wlan.connect("classroom-wifi", "my-password")\nsta.connect("이름", "비밀번호")\nWIFI_PASSWORD = "1234"\n'),
      repoFile('content/lessons/u3/ok.md', '`wlan.connect("이름", "비밀번호")`\npassword = ""\n'),
      // 사이트 코드·검사는 가짜 값이 있어도 이 규칙으로 보지 않는다(예제·차시에서만)
      repoFile('src/lab/mock.ts', `wlan.connect("x", "${secret}")\n`),
    ];
    expect(checkRepoFiles(placeholders, rules())).toEqual([]);
  });

  it('이진 확장자가 아닌 파일의 앞부분에 NUL이 있으면 건너뛰지 않고 알린다(개인정보 검사를 피하는 구멍)', () => {
    const nul = String.fromCharCode(0);
    const problems = checkRepoFiles(
      [
        repoFile('docs/notes.md', `기록${nul}${realLookingMac}`),
        repoFile('public/firmware/v0/a.bin', `x${nul}y`),
      ],
      rules(),
    );
    expect(problemKeys(problems)).toEqual(['nul-text:docs/notes.md']);
  });
});

// ── 미해결 160(2026-09-26 P6-05에서 넓힘): 기기 주소 모양의 미탐·오탐 증명 ──
// 값은 모두 조각에서 만든다(이 파일도 저장소 검사를 받는다). 여섯 바이트짜리 목록을 소스에 그대로 쓰지 않고 세 바이트씩 나눠 둔다.

/**
 * 파이썬이 bytes를 찍는 모양 — MicroPython v1.29.0 py/objstr.c의 mp_str_print_quoted(2026-09-26 원문 확인)와 CPython repr이 같다:
 * 글자로 보이는 바이트(0x20~0x7E)는 글자 그대로, 줄바꿈·복귀·탭은 \n·\r·\t, 따옴표·역슬래시는 앞에 역슬래시, 나머지는 \x와 16진수 두 자리.
 */
function pyBytesRepr(bytes: number[]): string {
  const quote = bytes.includes(0x27) && !bytes.includes(0x22) ? '"' : "'";
  let body = '';
  for (const value of bytes) {
    if (value === quote.charCodeAt(0)) body += `\\${quote}`;
    else if (value === 0x5c) body += '\\\\';
    else if (value >= 0x20 && value < 0x7f) body += String.fromCharCode(value);
    else if (value === 0x0a) body += '\\n';
    else if (value === 0x0d) body += '\\r';
    else if (value === 0x09) body += '\\t';
    else body += ['\\', 'x', value.toString(16).padStart(2, '0')].join('');
  }
  return `b${quote}${body}${quote}`;
}
/** 두 자리 16진수 조각 → 파이썬 \x 이스케이프를 이은 글자 */
const hexEscapes = (pairs: string[]) => pairs.map((pair) => ['\\', 'x', pair].join('')).join('');
/** 정해진 씨앗으로 늘 같은 수열을 내는 난수(mulberry32) — 테스트가 매번 같은 주소들을 본다 */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('기기 주소 모양(미해결 160 — P6-05에서 넓힘): 미탐·오탐 증명', () => {
  const pairs = ['a4', 'cf', '12', '9b', '3e', '01'];
  const upper = pairs.map((pair) => pair.toUpperCase());
  const sampleBytes = pairs.map((pair) => parseInt(pair, 16));
  /** 앞 세 바이트가 모두 글자로 찍히는 제조사 번호 모양과 뒤 세 바이트 */
  const printableFront = [0x24, 0x6f, 0x28];
  const hexBack = [0x9b, 0xa1, 0x02];
  const listOf = (items: string[]) => items.map((pair) => `0x${pair}`).join(', ');

  it('미탐 증명: 실물 확인 결과를 옮겨 적을 때 나오는 모양을 모두 잡고, 값은 알리지 않는다', () => {
    const cases: [string, string][] = [
      ['콜론(대문자)', `연결할 보드: ${upper.join(':')}`],
      ['붙임표(Windows getmac 결과)', `물리적 주소 . . . : ${upper.join('-')}`],
      ['점 모양', `기록 ${[pairs.slice(0, 2), pairs.slice(2, 4), pairs.slice(4)].map((part) => part.join('')).join('.')}`],
      ['bytes 글자 — 여섯 바이트 모두 \\x(ESP-NOW 짝 주소 코드)', `peer = b'${hexEscapes(pairs)}'`],
      ['bytes 글자 — 글자로 찍힌 바이트가 섞인 print 결과', `${pyBytesRepr(sampleBytes)}`],
      ['bytes 글자 — 앞 세 바이트가 글자, \\x 세 개', pyBytesRepr([...printableFront, ...hexBack])],
      ['REPL — 윗줄 명령, \\x 두 개(ble.config 튜플)', `>>> ble.config('mac')\n(0, ${pyBytesRepr([...printableFront, 0x41, 0x9b, 0x02])})`],
      ['같은 줄 기기 주소 낱말 + \\x 하나', `MAC: ${pyBytesRepr([...printableFront, 0x41, 0x42, 0x9b])}`],
      ['같은 줄 기기 주소 낱말 + 여섯 바이트 모두 글자', `mac = ${pyBytesRepr([...printableFront, 0x41, 0x42, 0x43])}`],
      ['hexlify 결과', `b'${pairs.join('')}'`],
      ['hexlify 결과(콜론)', `b'${pairs.join(':')}'`],
      ['주소 낱말 옆 12자리', `mac = "${upper.join('')}"`],
      ['BSSID 옆 12자리', `bssid ${pairs.join('')}`],
      ['기기 주소 낱말 옆 빈칸 여섯 묶음', `보드 주소: ${upper.join(' ')}`],
      ["'%x'로 찍은 한두 자리 묶음", `mac: ${['24', '6f', '28', 'a', 'b', 'c'].join(':')}`],
      ['0x 목록(기기 주소 낱말)', `PEER_MAC = [${listOf(upper)}]`],
      ['bytes([…]) (addr)', `addr = bytes([${listOf(pairs)}])`],
      ['bytearray([…]) + 뒤 주석의 낱말', `peer = bytearray([${listOf(pairs)}])  # 짝 보드 MAC 주소`],
      ['십진수 목록(윗줄 명령)', `>>> list(wlan.config('mac'))\n[${sampleBytes.join(', ')}]`],
      ['I2C 줄이라도 같은 줄에 기기 주소 낱말', `i2c.writeto(0x3C, b'${hexEscapes(pairs)}')  # 보드 MAC 주소를 보냄`],
      ['JS·JSON 글자 안에 한 번 더 이스케이프', `'print(b"${pairs.map((pair) => ['\\\\', 'x', pair].join('')).join('')}")'`],
      // ── 2026-09-26 Phase 6 안전 검토 지적 5: ESP32 unique_id(= 공장 MAC)·0x 정수·밑줄·표 속 값·EUI-64·fromhex·전각 쌍점 ──
      ['REPL — unique_id 명령 다음 줄, \\x 두 개', `>>> machine.unique_id()\n${pyBytesRepr([...printableFront, 0x41, 0x9b, 0x02])}`],
      ['같은 줄 unique_id + 주석의 print 결과(\\x 하나)', `print(machine.unique_id())  # ${pyBytesRepr([...printableFront, 0x41, 0x42, 0x9b])}`],
      ['unique_id를 hexlify한 결과(따옴표 글자, 윗줄 명령)', `>>> ubinascii.hexlify(machine.unique_id()).decode()\n'${pairs.join('')}'`],
      ['unique_id 흉내의 연속 값(가상 주소가 아닌 값)', `unique_id: () => Uint8Array.from([${listOf(['0a', '0b', '0c', '0d', '0e', '0f'])}])`],
      ['0x 정수 12자리(mac 낱말)', `mac = 0x${pairs.join('')}`],
      ['0x 정수 11자리(앞 0이 빠진 hex 결과, 윗줄 명령)', `>>> hex(int.from_bytes(wlan.config('mac'), 'big'))\n'0x${['0a', ...pairs.slice(1)].join('').slice(1)}'`],
      ['밑줄로 이은 여섯 묶음(mac 낱말)', `board_mac = "${pairs.join('_')}"`],
      ['마크다운 표 값 줄(머리 줄에 블루투스 주소)', `| 모둠 | 블루투스 주소 |\n|---|---|\n| 1모둠 | ${upper.join('')} |`],
      ['마크다운 표 값 줄(머리 줄에 MAC, 빈칸 묶음)', `| 모둠 | MAC |\n| --- | --- |\n| 2모둠 | 비고 없음 |\n| 3모둠 | ${upper.join(' ')} |`],
      ['IPv6 링크 로컬 EUI-64(가운데 ff:fe)', `ip: fe80::${pairs[0]}${pairs[1]}:${pairs[2]}ff:fe${pairs[3]}:${pairs[4]}${pairs[5]}`],
      ['bytes.fromhex(ESP-NOW 짝)', `peer = bytes.fromhex('${pairs.join('')}')`],
      ['unhexlify(콜론 없는 12자리)', `peer = ubinascii.unhexlify("${pairs.join('')}")`],
      ['전각 쌍점으로 적은 주소', `보드 ${upper.join('：')}`],
    ];
    for (const [name, text] of cases) {
      expect({ name, count: findDeviceAddresses(text).length }).toEqual({ name, count: 1 });
      const report = findPrivacyPatterns(text).join('\n');
      expect({ name, report }).toEqual({ name, report: expect.stringContaining('MAC 주소 모양') });
      for (const value of [pairs.join(''), upper.join(':'), hexEscapes(pairs), pyBytesRepr(sampleBytes)]) {
        expect({ name, leaked: report.includes(value) }).toEqual({ name, leaked: false });
      }
    }
  });

  it('오탐 증명: 흔한 6바이트·6개 숫자, 장치로 보내는 명령, 사이트 가상 주소와 가린 자리표시자는 통과시킨다', () => {
    const virtual = ['02', '00', '00', '00', '00'];
    // 이 파일의 줄에는 설명 글과 값이 함께 있어, 값 여섯 개를 소스에 그대로 쓰면 설명 속 낱말 때문에 이 파일이 걸린다 — 세 개씩 이어 만든다
    const six = (open: string, first: number[], second: number[], close: string) => `${open}${[...first, ...second].join(', ')}${close}`;
    const passes: [string, string][] = [
      ['I2C 전송 줄의 addr와 bytes([…])', `i2c.writeto(addr, bytes([${listOf(['AE', 'D5', '80', 'A8', '3F', 'D3'])}]))`],
      ['I2C 전송 줄의 6바이트 bytes 글자', `i2c.writeto_mem(addr, 0x00, b'${hexEscapes(['00', '10', '20', '30', '40', '50'])}')`],
      ['UART로 보내는 명령 조각', `uart.write(b'${hexEscapes(['7e', 'ff', '06', '03', '00', '01'])}')`],
      ['MP3 프레임 여덟 묶음(주소 낱말 옆이어도 여섯 묶음이 아님)', `명령 주소 ${['7E', 'FF', '06', '03', '00', '00', '01', 'EF'].join(' ')}`],
      ['받은 바이트 여섯 묶음(주소 낱말 없음)', `받은 바이트 ${upper.join(' ')}`],
      ['machine 낱말 속 세 글자는 기기 주소 낱말이 아님(윗줄)', `from machine import Pin\npins = ${six('(', [12, 13, 14], [15, 16, 17], ')')}`],
      ['얼굴 랜드마크 번호', `LEFT_EYE = ${six('[', [33, 160, 158], [133, 153, 144], ']')}`],
      ['주소 낱말이 값 뒤에 있음', `RIGHT_EYE = ${six('[', [249, 7, 163], [144, 145, 153], ']')}  # addr와 상관없는 눈 번호`],
      ['주소 낱말이 값보다 40자 넘게 앞에 있음', `| 주소 칸 | 이 칸의 설명은 길게 이어지고 숫자는 여기 없어요 | 눈 번호 ${six('[', [33, 160, 158], [133, 153, 144], ']')} |`],
      [
        '긴 줄에서 80자 넘게 떨어진 기기 주소 낱말',
        `블루투스 기기 주소 대신 광고 이름을 써요. ${'설명을 덧붙이는 글이 길게 이어져요. '.repeat(5)}눈 번호 ${six('[', [33, 160, 158], [133, 153, 144], ']')}`,
      ],
      ['한 줄에 몰아 담은 JSON의 "b": 모양(빌드 결과 HTML)', '{"part":"rgb-led","pins":{"r":12,"g":5,"b":4}}],"practice":["보드 MAC 주소를 확인해요"]'],
      ['서보 duty 목록', `for duty in ${six('(', [23, 73, 124], [40, 77, 115], ')')}:`],
      ['공백·제어 문자 모음(\\x 두 개, 문맥 없음)', `_WS = b" \\t\\r\\n${hexEscapes(['0c', '00'])}"`],
      ['기기 정보 줄 다음의 여섯 글자 bytes', ["mac = wlan.config('mac')", `send(${'b'}'ready\\n')`].join('\n')],
      ['addr 옆 여섯 글자 bytes(\\x 없음)', 'addr_hint = b"abcdef"'],
      ['UUID의 마지막 열두 자리 묶음(같은 줄에 기기 주소 낱말)', "ble.config('mac') 대신 서비스 UUID '6E400001-B5A3-F393-E0A9-E50E24DCCA9E'로 찾아요"],
      ['사이트 가상 주소 — 콜론', `bssid ${[...virtual, '01'].join(':')}`],
      ['사이트 가상 주소 — bytes 글자', `mac = b'${hexEscapes([...virtual, '02'])}'`],
      ['사이트 가상 주소 — hexlify', `mac = b'${[...virtual, '03'].join('')}'`],
      ['사이트 가상 주소 — 십진수(윗줄 명령)', `>>> list(wlan.config('mac'))\n[${[2, 0, 0].join(', ')}, ${[0, 0, 4].join(', ')}]`],
      ['모두 FF·모두 00', `mac = ${Array(6).fill('FF').join(':')}, b'${hexEscapes(Array(6).fill('00'))}'`],
      ['가린 자리표시자', `mac = ${placeholderMac}`],
      ['시각·IPv6·SHA-256', `12:34:56 fe80::1 sha256 ${'0123456789abcdef'.repeat(4)}`],
      ['I2C 스캔 결과', '>>> i2c.scan()\n[39, 60]'],
      // unique_id는 이제 기기 주소 낱말이라(ESP32 공장 MAC), 모의 보드 흉내 값은 사이트 가상 주소 모양으로 둔다(src/lab/serial/mock/mini-python.ts)
      ['unique_id 흉내 — 사이트 가상 주소', `unique_id: () => Uint8Array.from([${listOf([...virtual, '0f'])}])`],
      ['기기 주소 낱말 없는 밑줄 이름(색 이름 조각)', `color_${['aa', 'bb', 'cc', 'dd', 'ee', 'ff'].join('_')}_theme = 1`],
      ['글꼴 fromhex(길이가 12자리가 아님)', `_FONT = bytes.fromhex('${'00'.repeat(20)}')`],
      ['IPv6 링크 로컬이지만 EUI-64가 아님', 'fe80::1234:5678:9abc:def0'],
      ['0x 정수지만 문맥 없음(색 값 목록 옆)', `COLOR = 0x${['12', '34', '56', '78', '9a', 'bc'].join('')}`],
      ['마크다운 표지만 머리 줄에 기기 주소 낱말 없음', `| 차시 | 커밋 |\n|---|---|\n| 1-1-1 | ${pairs.join('')} |`],
    ];
    for (const [name, text] of passes) {
      expect({ name, found: findDeviceAddresses(text) }).toEqual({ name, found: [] });
    }
  });

  it('MicroPython이 찍은 기기 주소 2,000개씩: 옛 규칙(\\x 여섯 개뿐)은 거의 못 잡았고, 새 규칙은 혼자 적혀도 대부분·명령 옆이면 모두 잡는다', () => {
    // 제조사 번호: 아무 유니캐스트 주소, 그리고 원본 자료에서 본 ESP32 제조사 번호 두 가지(INVENTORY §6 — 앞 세 바이트만, 기기를 가리키지 않음)
    const fronts: [string, number[] | null, number][] = [
      ['아무 주소', null, 0.8],
      ['제조사 번호 ㄱ', [0xb0, 0xa7, 0x32], 0.9],
      ['제조사 번호 ㄴ', [0x48, 0xe7, 0x29], 0.6],
    ];
    for (const [name, front, aloneAtLeast] of fronts) {
      const random = seededRandom(160);
      const total = 2000;
      const counts = { oldRule: 0, alone: 0, afterCommand: 0, sameLine: 0, allPrinted: 0 };
      for (let index = 0; index < total; index += 1) {
        const bytes = Array.from({ length: 6 }, () => Math.floor(random() * 256));
        if (front) bytes.splice(0, 3, ...front);
        else bytes[0] &= 0xfc; // 유니캐스트·제조사가 정한 주소
        const repr = pyBytesRepr(bytes);
        const hexEscaped = bytes.filter((value) => !(value >= 0x20 && value < 0x7f) && ![0x09, 0x0a, 0x0d].includes(value)).length;
        if (hexEscaped === 6) counts.oldRule += 1; // 옛 규칙: \x와 16진수 두 자리가 정확히 여섯 번인 bytes 글자만
        if (hexEscaped === 0) counts.allPrinted += 1;
        if (findDeviceAddresses(repr).length === 1) counts.alone += 1;
        if (findDeviceAddresses(`>>> wlan.config('mac')\n${repr}`).length === 1) counts.afterCommand += 1;
        if (findDeviceAddresses(`print('mac', ${repr})`).length === 1) counts.sameLine += 1;
      }
      expect({ name, oldRuleRate: counts.oldRule / total < 0.1 }).toEqual({ name, oldRuleRate: true });
      expect({ name, aloneRate: counts.alone / total >= aloneAtLeast }).toEqual({ name, aloneRate: true });
      // 명령 다음 줄: 여섯 바이트가 모두 글자로 찍힌 드문 것(아무 주소 2,000개 가운데 몇 개)만 빠진다 — 알려진 한계
      expect({ name, afterCommand: counts.afterCommand }).toEqual({ name, afterCommand: total - counts.allPrinted });
      expect({ name, sameLine: counts.sameLine }).toEqual({ name, sameLine: total });
    }
  });
});

describe('git 인덱스 검사(runRepoCheck, scripts/check-repo.mjs)', () => {
  const tempDirs: string[] = [];
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      removeDir(dir);
    }
  });

  function git(rootDir: string, ...args: string[]) {
    execFileSync('git', args, { cwd: rootDir, stdio: 'pipe' });
  }

  it('스테이징된 .pdf는 막고, 스테이징하지 않은 파일은 보지 않는다', () => {
    const rootDir = makeTempDir('apc-repo-');
    tempDirs.push(rootDir);
    git(rootDir, 'init', '-q');
    writeFiles(rootDir, {
      '.gitignore': '# 원본 자료\n/교과서_안/\n',
      'src/ok.ts': 'export const ok = true;\n',
      'handout.pdf': '%PDF-1.4\n',
      'public/unstaged.pdf': '%PDF-1.4\n',
    });
    git(rootDir, 'add', '.gitignore', 'src/ok.ts', 'handout.pdf');

    const result = runRepoCheck({ rootDir });
    expect(result.ok).toBe(false);
    expect(problemKeys(result.problems)).toEqual(['original-format:handout.pdf']);

    const blocked = spawnSync(process.execPath, [CHECK_REPO_CLI, '--root', rootDir], { encoding: 'utf8' });
    expect(blocked.status).toBe(1);
    expect(blocked.stderr).toContain('handout.pdf');

    git(rootDir, 'rm', '--cached', '-q', 'handout.pdf');
    const passing = spawnSync(process.execPath, [CHECK_REPO_CLI, '--root', rootDir], { encoding: 'utf8' });
    expect(passing.status).toBe(0);
    expect(passing.stdout).toContain('[저장소 검사] 통과 — 추적 파일 2개');
  });

  it('5MB 넘는 파일, docs/SPEC.md, 원본 파일 이름이 스테이징되면 막는다', () => {
    const rootDir = makeTempDir('apc-repo-');
    tempDirs.push(rootDir);
    git(rootDir, 'init', '-q');
    writeFiles(rootDir, {
      'docs/INVENTORY.md': '| `교과서_안/고등_인공지능과피지컬_2단원-1.pdf` |\n',
      'docs/SPEC.md': '# 사양\n',
      'public/firmware/v0/big.bin': Buffer.alloc(LARGE_FILE_LIMIT_BYTES + 1024),
      'content/lessons/u2/2-1-1.md': '원고 파일 고등_인공지능과피지컬_2단원-1.pdf에서 옮겼어요.\n',
    });
    git(rootDir, 'add', 'docs/INVENTORY.md', 'docs/SPEC.md', 'public/firmware/v0/big.bin', 'content/lessons/u2/2-1-1.md');

    const result = runRepoCheck({ rootDir });
    expect(problemKeys(result.problems).sort()).toEqual(
      ['forbidden:docs/SPEC.md', 'large-file:public/firmware/v0/big.bin', 'original-name:content/lessons/u2/2-1-1.md'].sort(),
    );
  });

  it('눈 확인 기록은 스테이징된 기록 파일(차시 그림 목록 + 옛 공용 기록)에서 읽는다 — 디스크에만 있는 기록은 통하지 않는다(P5-01)', () => {
    const rootDir = makeTempDir('apc-repo-');
    tempDirs.push(rootDir);
    git(rootDir, 'init', '-q');
    const image = cleanWebp();
    const manifest = [
      'images:',
      '  - name: a',
      '    use: 시험',
      '    alt: 시험 그림이에요 여덟 글자',
      '    from: { source: U1, page: 14, region: [0, 0, 10, 10] }',
      '    file: public/images/lessons/t-1/a.webp',
      `    sha256: "${sha256Hex(image)}"`,
      '    reviewed: { by: claude, date: 2026-09-25, result: "통과 — 사람 없음" }',
      '',
    ].join('\n');
    writeFiles(rootDir, {
      'public/images/lessons/t-1/a.webp': image,
      'public/images/site/b.png': PNG_BYTES,
      'content/lessons/u1/t-1.images.yaml': manifest,
      'scripts/image-allowlist.yaml': 'images:\n  - path: public/images/site/b.png\n    reviewed: { by: claude, date: 2026-09-25, result: "통과 — 사이트 그림" }\n',
    });
    git(rootDir, 'add', 'public/images/lessons/t-1/a.webp', 'public/images/site/b.png');
    // 기록 파일을 스테이징하지 않았다 → 두 그림 모두 기록 없음
    expect(problemKeys(runRepoCheck({ rootDir }).problems).sort()).toEqual([
      'image-review:public/images/lessons/t-1/a.webp',
      'image-review:public/images/site/b.png',
    ]);
    git(rootDir, 'add', 'content/lessons/u1/t-1.images.yaml', 'scripts/image-allowlist.yaml');
    expect(runRepoCheck({ rootDir }).problems).toEqual([]);

    // 같은 그림의 기록이 두 곳에 있으면 형식 오류로 알린다
    writeFiles(rootDir, {
      'scripts/image-allowlist.yaml':
        'images:\n  - path: public/images/site/b.png\n    reviewed: { by: claude, date: 2026-09-25, result: "통과 — 사이트 그림" }\n  - path: public/images/lessons/t-1/a.webp\n    reviewed: { by: claude, date: 2026-09-25, result: "통과 — 겹친 기록" }\n',
    });
    git(rootDir, 'add', 'scripts/image-allowlist.yaml');
    const duplicated = runRepoCheck({ rootDir });
    expect(problemKeys(duplicated.problems)).toEqual(['config:scripts/image-allowlist.yaml']);
    expect(duplicated.problems[0].detail).toContain('한 곳에만');
  });

  it('scripts/privacy-needles.json의 해시 이름을 읽어 스테이징된 글에서 찾고, 파일 모양이 틀리면 알린다', () => {
    const rootDir = makeTempDir('apc-repo-');
    tempDirs.push(rootDir);
    git(rootDir, 'init', '-q');
    const needle = hashPrivacyNeedle(FAKE_SECRET_NAME, NEEDLE_SALT);
    writeFiles(rootDir, {
      'scripts/privacy-needles.json': JSON.stringify({ salt: NEEDLE_SALT, needles: [{ label: '학교 이름', ...needle }] }),
      'content/lessons/u1/intro.md': `${FAKE_SECRET_NAME} 학생들이 만든 예제\n`,
      'content/lessons/u1/other.md': '다른 학교 이야기\n',
    });
    git(rootDir, 'add', 'scripts/privacy-needles.json', 'content/lessons/u1/intro.md', 'content/lessons/u1/other.md');
    const result = runRepoCheck({ rootDir });
    expect(problemKeys(result.problems)).toEqual(['privacy:content/lessons/u1/intro.md']);

    writeFiles(rootDir, { 'scripts/privacy-needles.json': JSON.stringify({ salt: 'short', needles: 'x' }) });
    git(rootDir, 'add', 'scripts/privacy-needles.json');
    git(rootDir, 'rm', '--cached', '-q', 'content/lessons/u1/intro.md');
    const broken = runRepoCheck({ rootDir });
    expect(problemKeys(broken.problems)).toEqual(['config:scripts/privacy-needles.json']);
  });

  // ── 손으로 돌리는 훑기(2026-09-26 P6-05): --worktree·--history·--dist ──
  /** 임시 저장소에서 커밋한다(이 컴퓨터·CI에 git 사용자 설정이 없어도 되게 이름·주소를 넘긴다 — 예약된 예시 도메인) */
  function commit(rootDir: string, message: string) {
    git(rootDir, '-c', 'user.name=tester', '-c', 'user.email=tester@example.com', 'commit', '-q', '-m', message);
  }

  it('--worktree: 스테이징하지 않은 새 파일·고친 파일도 보고, 작업 폴더에서 지운 파일은 빼요', () => {
    const rootDir = makeTempDir('apc-repo-');
    tempDirs.push(rootDir);
    git(rootDir, 'init', '-q');
    writeFiles(rootDir, {
      'src/ok.ts': 'export const ok = true;\n',
      'src/gone.ts': 'export const gone = true;\n',
      'docs/new-note.md': `연락처 ${realLookingPhone}\n`,
    });
    git(rootDir, 'add', 'src/ok.ts', 'src/gone.ts');
    removeDir(`${rootDir}/src/gone.ts`);
    // 커밋 전 훅과 같은 인덱스 검사는 스테이징한 것만 본다
    expect(runRepoCheck({ rootDir }).ok).toBe(true);
    const worktree = runRepoCheck({ rootDir, source: 'worktree' });
    expect(problemKeys(worktree.problems)).toEqual(['privacy:docs/new-note.md']);
    expect(worktree.fileCount).toBe(2);
    const cli = spawnSync(process.execPath, [CHECK_REPO_CLI, '--root', rootDir, '--worktree'], { encoding: 'utf8' });
    expect(cli.status).toBe(1);
    expect(cli.stderr).toContain('docs/new-note.md');
    expect(cli.stderr).not.toContain(realLookingPhone);
  });

  it('--history: 지운 파일의 옛 내용과 옛 그림의 메타데이터도 찾고, history_reviewed에 적은 blob만 통과시켜요', () => {
    const rootDir = makeTempDir('apc-repo-');
    tempDirs.push(rootDir);
    git(rootDir, 'init', '-q');
    writeFiles(rootDir, {
      'notes.md': `보드 주소 ${realLookingMac}\n`,
      'public/images/site/old.webp': cleanWebp(riffChunk('EXIF', Buffer.from('Exif..'))),
      'src/ok.ts': 'export const ok = true;\n',
    });
    git(rootDir, 'add', 'notes.md', 'public/images/site/old.webp', 'src/ok.ts');
    commit(rootDir, '처음');
    const noteBlob = execFileSync('git', ['rev-parse', 'HEAD:notes.md'], { cwd: rootDir, encoding: 'utf8' }).trim();
    git(rootDir, 'rm', '-q', 'notes.md', 'public/images/site/old.webp');
    commit(rootDir, '지움');

    const byPath = (result: ReturnType<typeof runHistoryCheck>) =>
      [...result.findings].sort((left, right) => (left.paths[0] ?? '').localeCompare(right.paths[0] ?? ''));
    const first = runHistoryCheck({ rootDir });
    expect(first.ok).toBe(false);
    const firstFindings = byPath(first);
    expect(firstFindings.map((finding) => ({ paths: finding.paths, inHead: finding.inHead, reviewed: finding.reviewed }))).toEqual([
      { paths: ['notes.md'], inHead: false, reviewed: null },
      { paths: ['public/images/site/old.webp'], inHead: false, reviewed: null },
    ]);
    expect(firstFindings[0]?.details.join('\n')).toContain('MAC 주소 모양');
    expect(firstFindings[1]?.details.join('\n')).toContain('WebP EXIF 조각');
    const report = formatHistoryReport(first);
    expect(report).toContain('기록에만 있음');
    expect(report).not.toContain(realLookingMac);

    // 사람이 보고 적어 둔 blob은 통과(그림은 아직 남음), 모양이 틀린 기록은 설정 오류
    writeFiles(rootDir, { 'scripts/repo-allowlist.yaml': `history_reviewed:\n  - blob: ${noteBlob}\n    reason: 시험용 가짜 값이에요\n` });
    const second = runHistoryCheck({ rootDir });
    expect(byPath(second).map((finding) => finding.reviewed)).toEqual(['시험용 가짜 값이에요', null]);
    expect(second.ok).toBe(false);
    writeFiles(rootDir, { 'scripts/repo-allowlist.yaml': 'history_reviewed:\n  - blob: xyz\n    reason: 틀린 번호\n' });
    expect(runHistoryCheck({ rootDir }).errors.map((error) => error.message)).toEqual([expect.stringContaining('git blob 번호')]);
    const cli = spawnSync(process.execPath, [CHECK_REPO_CLI, '--root', rootDir, '--history'], { encoding: 'utf8' });
    expect(cli.status).toBe(1);
    expect(cli.stderr).toContain('[저장소 기록 검사]');
  });

  it('--dist: 빌드 결과에 이 컴퓨터의 절대 경로·개인정보 모양이 있으면 막고, vendor/ 아래 복사해 온 그림의 메타데이터는 참고로만 알려요', () => {
    const rootDir = makeTempDir('apc-repo-');
    tempDirs.push(rootDir);
    const absoluteRoot = rootDir.split('\\').join('/');
    writeFiles(rootDir, {
      'out/index.html': `<script src="${absoluteRoot}/src/main.ts"></script>`,
      'out/help/index.html': `<p>open('${['C:', 'Users', '…', '사진.jpg'].join('/')}')처럼 PC 경로를 쓰지 않아요</p>`,
      'out/about/index.html': `<p>문의 ${realLookingPhone}</p>`,
      'out/licenses/lib.txt': `MIT License\nCopyright (c) Someone <${realLookingEmail}>\n`,
      'out/vendor/lib/media/icon.png': pngWithText(),
      'out/images/site/photo.png': pngWithText(),
    });
    const result = runBuildOutputCheck({ rootDir, outDir: 'out' });
    // Windows 임시 폴더는 사용자 폴더 아래라 index.html은 절대 경로와 사용자 폴더 모양 두 가지로 함께 걸릴 수 있다 — 파일 단위로 본다
    expect([...new Set(problemKeys(result.problems))].sort()).toEqual(['image-metadata:images/site/photo.png', 'privacy:about/index.html', 'privacy:index.html']);
    expect(result.problems.find((problem) => problem.path === 'index.html')?.detail).toContain('이 컴퓨터의 절대 경로');
    expect(result.notes).toEqual([expect.stringContaining('vendor/lib/media/icon.png: PNG tEXt 조각')]);
    expect(result.fileCount).toBe(6);
    const report = formatBuildOutputReport(result);
    expect(report).toContain('[빌드 결과 검사] 실패');
    expect(report).not.toContain(realLookingPhone);
    const cli = spawnSync(process.execPath, [CHECK_REPO_CLI, '--root', rootDir, '--dist', 'out'], { encoding: 'utf8' });
    expect(cli.status).toBe(1);
  });

  // 2026-09-18 검토 반영: 검사 스크립트 본문에 리터럴 NUL 바이트(해시 소금 구분자)가 있어 grep·ripgrep이 바이너리로 보고 내용을 건너뛰었다.
  // 개인정보 노출을 막는 유일한 관문이라 코드 검색에서 보여야 한다 — 해시 입력 바이트는 같으므로 '\0' 이스케이프로 적는다.
  it('검사 스크립트 본문에는 리터럴 NUL 바이트가 없다(코드 검색에서 바이너리로 보이지 않게)', () => {
    const files = ['../../scripts/lib/repo-check.mjs', '../../scripts/check-repo.mjs', '../../scripts/privacy-needle.mjs'];
    for (const file of files) {
      const bytes = readFileSync(fileURLToPath(new URL(file, import.meta.url)));
      expect({ file, nul: bytes.includes(0) }).toEqual({ file, nul: false });
    }
  });
});
