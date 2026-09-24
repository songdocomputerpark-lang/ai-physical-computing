import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  LARGE_FILE_LIMIT_BYTES,
  buildOriginalNameNeedles,
  checkRepoFiles,
  findPrivacyNeedles,
  findPrivacyPatterns,
  hashPrivacyNeedle,
  isPrivacyExceptionPathAllowed,
  originalDocumentNamesFromInventory,
  originalFolderNamesFromGitignore,
  runRepoCheck,
  type RepoRules,
} from '../../scripts/lib/repo-check.mjs';
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

  it('이진 확장자가 아닌 파일의 앞부분에 NUL이 있으면 건너뛰지 않고 알린다(개인정보 검사를 피하는 구멍)', () => {
    const nul = String.fromCharCode(0);
    const problems = checkRepoFiles(
      [
        repoFile('docs/notes.md', `기록${nul}${realLookingMac}`),
        repoFile('public/models/a.bin', `x${nul}y`),
      ],
      rules(),
    );
    expect(problemKeys(problems)).toEqual(['nul-text:docs/notes.md']);
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
      'public/big.bin': Buffer.alloc(LARGE_FILE_LIMIT_BYTES + 1024),
      'content/lessons/u2/2-1-1.md': '원고 파일 고등_인공지능과피지컬_2단원-1.pdf에서 옮겼어요.\n',
    });
    git(rootDir, 'add', 'docs/INVENTORY.md', 'docs/SPEC.md', 'public/big.bin', 'content/lessons/u2/2-1-1.md');

    const result = runRepoCheck({ rootDir });
    expect(problemKeys(result.problems).sort()).toEqual(
      ['forbidden:docs/SPEC.md', 'large-file:public/big.bin', 'original-name:content/lessons/u2/2-1-1.md'].sort(),
    );
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
