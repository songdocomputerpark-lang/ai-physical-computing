import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  LARGE_FILE_LIMIT_BYTES,
  buildOriginalNameNeedles,
  checkRepoFiles,
  findPrivacyPatterns,
  originalDocumentNamesFromInventory,
  originalFolderNamesFromGitignore,
  runRepoCheck,
  type RepoRules,
} from '../../scripts/lib/repo-check.mjs';
import { makeTempDir, removeDir, writeFiles } from './helpers/fixture.ts';

const CHECK_REPO_CLI = fileURLToPath(new URL('../../scripts/check-repo.mjs', import.meta.url));

// 이 테스트 파일도 저장소 검사를 받는다. 검사에 걸리는 모양(사용자 폴더 경로·MAC 주소)은
// 소스에 그대로 쓰지 않고 조각을 이어 붙여 만든다.
const windowsUserPath = ['C:', 'Users', 'kimteacher', 'Desktop', 'lesson.py'].join('\\');
const gitBashUserPath = ['', 'c', 'Users', 'kimteacher', 'Desktop'].join('/');
const genericLabAccountPath = ['C:', 'Users', 'COM', 'Desktop'].join('/');
const placeholderUserPath = ['C:', 'Users', '<사용자>', 'Desktop'].join('\\');
const oneDrivePath = ['D:', 'OneDrive - 어느 기관', 'lesson', 'a.txt'].join('\\');
const realLookingMac = ['A4', 'CF', '12', '9B', '3E', '01'].join(':');
const placeholderMac = Array(6).fill('XX').join(':');

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

  it('공개 이미지는 눈 확인 기록(reviewed)이 "통과"여야 커밋할 수 있다', () => {
    const imagePath = 'public/images/lessons/u1/pixel.png';
    const files = [
      repoFile(imagePath, PNG_BYTES),
      repoFile('public/images/site/flow.svg', '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>'),
      repoFile('public/images/site/photo.svg', '<svg><image href="data:image/png;base64,AAAA"/></svg>'),
      repoFile('tests/e2e/home.png', PNG_BYTES),
    ];
    expect(problemKeys(checkRepoFiles(files, rules()))).toEqual([
      `image-review:${imagePath}`,
      'image-review:public/images/site/photo.svg',
    ]);

    const reviewed = new Map<string, unknown>([
      [imagePath, { path: imagePath, reviewed: { by: 'claude', date: '2026-09-16', result: '통과 — 얼굴·이름·경로 없음' } }],
      ['public/images/site/photo.svg', { reviewed: { by: 'claude', date: '2026-09-16', result: '문제 있음 — 얼굴' } }],
    ]);
    const problems = checkRepoFiles(files, rules({ imageReviews: reviewed }));
    expect(problemKeys(problems)).toEqual(['image-review:public/images/site/photo.svg']);
    expect(problems[0].detail).toContain('"통과"로 시작하지 않아요');
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
});
