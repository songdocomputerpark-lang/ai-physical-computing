// 예제 이관 도구 단위 테스트(PLAN §8.0 PD-33): zip 읽기(scripts/lib/zip-read.mjs)와 이관·대조(scripts/lib/import-examples.mjs).
// 임시 폴더에 자료 zip을 흉내 낸 파일(CP949 이름, CRLF 본문)을 만들어 돌린다. 실제 원본 zip은 쓰지 않는다.
// 마지막 묶음은 실제 저장소의 기록(scripts/examples-manifest.yaml)과 examples/ 파일을 대조한다(원본 없이 되는 검사).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  checkPythonSyntax,
  convertOriginal,
  countLfLines,
  countPythonLines,
  defaultSidecar,
  findPython,
  importExamples,
  nodeLightSyntaxCheck,
  normalizeLineEndings,
  parseManifest,
  sha256Hex,
  sidecarPathFor,
  verifyExamples,
} from '../../scripts/lib/import-examples.mjs';
import { buildZip, decodeZipName, listZipEntries, openZip, readZipEntry } from '../../scripts/lib/zip-read.mjs';
import { makeTempDir, removeDir } from './helpers/fixture.ts';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    removeDir(dir);
  }
});

function tempRoot(): string {
  const dir = makeTempDir('apc-import-');
  tempDirs.push(dir);
  return dir;
}

/** 자료 zip처럼 CP949(euc-kr) 이름 + UTF-8 비트 꺼짐으로 멤버 이름을 넣는다. */
function cp949Name(name: string): Buffer {
  // Node에는 euc-kr 인코더가 없어 정해진 몇 글자만 표로 바꾼다(테스트용).
  const table: Record<string, number[]> = {
    기: [0xb1, 0xe2],
    본: [0xba, 0xbb],
    ' ': [0x20],
  };
  const bytes: number[] = [];
  for (const char of name) {
    const mapped = table[char];
    if (mapped) {
      bytes.push(...mapped);
    } else if (char.charCodeAt(0) < 0x80) {
      bytes.push(char.charCodeAt(0));
    } else {
      throw new Error(`테스트 표에 없는 글자: ${char}`);
    }
  }
  return Buffer.from(bytes);
}

const CRLF_SOURCE = 'import cv2\r\n\r\ncap = cv2.VideoCapture(0)  # 카메라\r\nprint("안녕")';
const LF_SOURCE = 'import cv2\n\ncap = cv2.VideoCapture(0)  # 카메라\nprint("안녕")';

function manifestText(entries: string, materialsRoot = '.'): string {
  return `materials_root: ${materialsRoot}\nsources:\n  demo: originals/demo.zip\nexamples:\n${entries}`;
}

const ENTRY_OK = `  - id: f900
    source: demo
    member: "1. 단원/[고등] 기본 코드(p17).py"
    target: examples/vision/u9/9-1-1-hello.py
    author: operator
    meta:
      title: "9-1-1 기본 실습: 인사"
      description: "인사를 출력해요."
      tags: [인사]
`;

function makeRepo(entries: string, members: Parameters<typeof buildZip>[0]): string {
  const root = tempRoot();
  fs.mkdirSync(path.join(root, 'originals'), { recursive: true });
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'originals', 'demo.zip'), buildZip(members));
  fs.writeFileSync(path.join(root, 'scripts', 'examples-manifest.yaml'), manifestText(entries), 'utf8');
  return root;
}

describe('zip 읽기(zip-read.mjs)', () => {
  it('저장·deflate 멤버를 목록으로 읽고 CRC를 검사한다', () => {
    const zip = buildZip([
      { name: 'a.py', data: 'print(1)\r\n', method: 8 },
      { name: 'folder/b.txt', data: Buffer.from('stored'), method: 0 },
    ]);
    const entries = listZipEntries(zip);
    expect(entries.map((entry) => [entry.name, entry.method, entry.uncompressedSize])).toEqual([
      ['a.py', 8, 10],
      ['folder/b.txt', 0, 6],
    ]);
    expect(readZipEntry(zip, entries[0]!).toString('utf8')).toBe('print(1)\r\n');
    expect(readZipEntry(zip, entries[1]!).toString('utf8')).toBe('stored');
    // 데이터가 깨지면(저장 멤버의 글자 한 바이트 바꿈) CRC 검사가 잡는다
    const broken = Buffer.from(zip);
    const at = broken.indexOf('stored');
    broken[at] = 'S'.charCodeAt(0);
    expect(() => readZipEntry(broken, listZipEntries(broken)[1]!)).toThrow(/CRC-32/u);
  });

  it('UTF-8 비트가 꺼진 CP949 이름을 euc-kr로 읽고, UTF-8 이름은 그대로 읽는다', () => {
    const name = '[고등] 기본 코드.py';
    expect(() => cp949Name(name)).toThrow(); // 표에 없는 글자(고·등·코·드)는 테스트 표가 모른다 → 아래는 표에 있는 글자만
    const zip = buildZip([
      { name: '기본 a.py', nameBytes: cp949Name('기본 a.py'), utf8Flag: false, data: 'x = 1\n' },
      { name: '한글.py', data: 'y = 2\n' },
    ]);
    const entries = listZipEntries(zip);
    expect(entries[0]).toMatchObject({ name: '기본 a.py', utf8Flag: false, nameEncoding: 'euc-kr' });
    expect(entries[1]).toMatchObject({ name: '한글.py', utf8Flag: true, nameEncoding: 'utf-8' });
    expect(decodeZipName(Buffer.from('abc'), false)).toEqual({ name: 'abc', encoding: 'utf-8' });
  });

  it('zip이 아닌 파일·암호·ZIP64는 한국어 오류로 알린다', () => {
    expect(() => listZipEntries(Buffer.from('not a zip'))).toThrow(/zip 파일이 아니거나/u);
    const dir = tempRoot();
    const file = path.join(dir, 'x.zip');
    fs.writeFileSync(file, buildZip([{ name: 'a.py', data: 'a\n' }]));
    const opened = openZip(file);
    expect(opened.find('a.py')?.name).toBe('a.py');
    expect(opened.find('없음')).toBeNull();
    expect(() => opened.read('없음')).toThrow(/멤버가 없어요/u);
  });
});

describe('글자 처리', () => {
  it('CRLF만 LF로 바꾸고 홀로 있는 CR은 세어 둔다', () => {
    expect(normalizeLineEndings('a\r\nb\r\n')).toEqual({ text: 'a\nb\n', crlf: 2, loneCr: 0 });
    expect(normalizeLineEndings('a\rb\r\n')).toEqual({ text: 'a\rb\n', crlf: 1, loneCr: 1 });
  });

  it('줄 수를 파이썬 규칙으로 센다(마지막 줄바꿈 뒤 빈 줄은 세지 않음)', () => {
    expect(countPythonLines('')).toBe(0);
    expect(countPythonLines('a')).toBe(1);
    expect(countPythonLines('a\r\nb')).toBe(2);
    expect(countPythonLines('a\r\nb\r\n')).toBe(2);
    expect(countPythonLines('a\rb\nc')).toBe(3);
    expect(countLfLines('a\nb\n')).toBe(2);
    expect(countLfLines('a\nb')).toBe(2);
  });

  it('가벼운 구문 검사가 괄호·따옴표·들여쓰기 섞임을 잡는다', () => {
    expect(nodeLightSyntaxCheck('print("a")\n')).toEqual({ ok: true, message: null });
    expect(nodeLightSyntaxCheck("s = '''여러\n줄 (괄호 안 글자)'''\n")).toEqual({ ok: true, message: null });
    expect(nodeLightSyntaxCheck('x = (1, 2\n')).toMatchObject({ ok: false });
    expect(nodeLightSyntaxCheck('x = "열림\n')).toMatchObject({ ok: false });
    expect(nodeLightSyntaxCheck('if x:\n\ty = 1\n    z = 2\n')).toMatchObject({ ok: false });
    expect(nodeLightSyntaxCheck('# 주석 안 (괄호는 무시\nx = 1\n')).toEqual({ ok: true, message: null });
  });

  it('파이썬이 있으면 ast.parse로, 없으면 가벼운 검사로 구문을 본다', () => {
    expect(checkPythonSyntax('x = (1\n', { python: null })).toMatchObject({ ok: false, checker: 'node-light' });
    expect(findPython({ candidates: [['definitely-not-a-python-command']] })).toBeNull();
    const python = findPython();
    if (python) {
      expect(checkPythonSyntax('print(1)\n', { python })).toMatchObject({ ok: true, checker: 'python-ast' });
      expect(checkPythonSyntax('1  from x import y\n', { python })).toMatchObject({ ok: false, checker: 'python-ast' });
    }
  });
});

describe('목록 파일 검사(parseManifest)', () => {
  it('바른 목록을 읽는다', () => {
    const parsed = parseManifest(manifestText(ENTRY_OK));
    expect(parsed.errors).toEqual([]);
    expect(parsed.sources).toEqual({ demo: 'originals/demo.zip' });
    expect(parsed.examples[0]).toMatchObject({ id: 'f900', source: 'demo', target: 'examples/vision/u9/9-1-1-hello.py', author: 'operator' });
  });

  it('id·source·target·author 규칙과 third-party/ 폴더 약속을 검사한다', () => {
    const entries = `  - id: F1
    source: nope
    member: a.py
    target: examples/Vision/A.py
    author: someone
  - id: f2
    source: demo
    member: b.py
    target: examples/vision/b.py
    author: third_party
  - id: f3
    source: demo
    member: c.py
    target: examples/vision/third-party/c.py
    author: operator
  - id: f3
    source: demo
    member: d.py
    target: examples/vision/b.py
    author: operator
`;
    const { errors } = parseManifest(manifestText(entries));
    expect(errors.join('\n')).toMatch(/id는 f026처럼/u);
    expect(errors.join('\n')).toMatch(/sources 표에 없어요/u);
    expect(errors.join('\n')).toMatch(/target "examples\/Vision\/A.py"/u);
    expect(errors.join('\n')).toMatch(/author는 operator 또는 third_party/u);
    expect(errors.join('\n')).toMatch(/third-party\/ 폴더 아래에 둬요/u);
    expect(errors.join('\n')).toMatch(/운영자 자료\(operator\)는 third-party\/ 폴더에 두지 않아요/u);
    expect(errors.join('\n')).toMatch(/id가 앞의 항목과 겹쳐요/u);
    expect(errors.join('\n')).toMatch(/target이 앞의 항목과 겹쳐요/u);
  });
});

describe('이관(importExamples)', () => {
  it('CRLF를 LF로만 바꿔 쓰고 줄 수·해시·구문을 기록하며 사이드카를 만든다(있으면 두고)', () => {
    const root = makeRepo(ENTRY_OK, [{ name: '1. 단원/[고등] 기본 코드(p17).py', data: CRLF_SOURCE }]);
    const result = importExamples({ rootDir: root, python: null, today: '2026-09-16' });
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    const target = path.join(root, 'examples', 'vision', 'u9', '9-1-1-hello.py');
    expect(fs.readFileSync(target, 'utf8')).toBe(LF_SOURCE);
    expect(result.results[0]).toMatchObject({ id: 'f900', ok: true, lines: 4, syntax: 'ok', syntaxChecker: 'node-light', sidecar: 'created' });
    expect(result.results[0]?.sha256).toBe(sha256Hex(Buffer.from(LF_SOURCE, 'utf8')));

    // 목록 파일에 기록이 적히고 주석·meta는 남는다
    const manifest = fs.readFileSync(path.join(root, 'scripts', 'examples-manifest.yaml'), 'utf8');
    expect(manifest).toMatch(/lines: 4/u);
    expect(manifest).toMatch(/sha256: [0-9a-f]{64}/u);
    expect(manifest).toMatch(/syntax: ok/u);
    expect(manifest).toMatch(/imported: 2026-09-16/u);
    expect(manifest).toMatch(/title: "9-1-1 기본 실습: 인사"/u);

    // 사이드카: 제목·설명·쪽·id·기본 패키지
    const sidecarPath = path.join(root, sidecarPathFor('examples/vision/u9/9-1-1-hello.py'));
    const sidecar = fs.readFileSync(sidecarPath, 'utf8');
    expect(sidecar).toMatch(/title: "9-1-1 기본 실습: 인사"/u);
    expect(sidecar).toMatch(/page: 17/u);
    expect(sidecar).toMatch(/source_id: f900/u);
    expect(sidecar).toMatch(/opencv-python/u);

    // 다시 옮기면 사이드카는 그대로(사람이 고친 내용 보존)
    fs.writeFileSync(sidecarPath, 'title: 사람이 고침\n', 'utf8');
    const again = importExamples({ rootDir: root, python: null, today: '2026-09-17' });
    expect(again.results[0]?.sidecar).toBe('kept');
    expect(fs.readFileSync(sidecarPath, 'utf8')).toBe('title: 사람이 고침\n');

    // 원본 없이 대조
    expect(verifyExamples({ rootDir: root })).toMatchObject({ ok: true, checked: 1, total: 1 });
    fs.writeFileSync(target, `${LF_SOURCE}\n# 고침\n`, 'utf8');
    const changed = verifyExamples({ rootDir: root });
    expect(changed.ok).toBe(false);
    expect(changed.problems.join('\n')).toMatch(/sha256/u);
    expect(changed.problems.join('\n')).toMatch(/줄 수/u);
  });

  it('구문 오류는 실패로 알리고 expect_syntax_error가 있으면 error-expected로 기록한다', () => {
    const broken = '1  from x import y\r\n2  print(1)\r\n';
    const entries = `${ENTRY_OK}  - id: f901
    source: demo
    member: broken.py
    target: examples/esp32/u9/9-1-2-broken.py
    author: operator
    expect_syntax_error: true
`;
    const python = findPython();
    const root = makeRepo(entries, [
      { name: '1. 단원/[고등] 기본 코드(p17).py', data: broken },
      { name: 'broken.py', data: broken },
    ]);
    const result = importExamples({ rootDir: root, python, today: '2026-09-16' });
    expect(result.ok).toBe(false);
    const first = result.results.find((item) => item.id === 'f900');
    const second = result.results.find((item) => item.id === 'f901');
    if (python) {
      expect(first).toMatchObject({ ok: false });
      expect(first?.problems.join('\n')).toMatch(/구문 오류/u);
      expect(second).toMatchObject({ ok: true, syntax: 'error-expected' });
      expect(fs.existsSync(path.join(root, 'examples', 'esp32', 'u9', '9-1-2-broken.py'))).toBe(true);
    } else {
      // 가벼운 검사는 이 오류를 못 잡으므로 expect_syntax_error 항목이 "오류가 없어요"로 실패한다
      expect(second?.problems.join('\n')).toMatch(/구문 오류가 없어요/u);
    }
    expect(fs.existsSync(path.join(root, 'examples', 'vision', 'u9', '9-1-1-hello.py'))).toBe(Boolean(!python));
  });

  it('없는 멤버·없는 zip·UTF-8이 아닌 원본·홀로 있는 CR을 한국어로 알린다', () => {
    const entries = `${ENTRY_OK}  - id: f902
    source: demo
    member: missing.py
    target: examples/vision/u9/9-1-3-missing.py
    author: operator
  - id: f903
    source: demo
    member: cp949.py
    target: examples/vision/u9/9-1-4-cp949.py
    author: operator
  - id: f904
    source: demo
    member: cr.py
    target: examples/vision/u9/9-1-5-cr.py
    author: operator
`;
    const root = makeRepo(entries, [
      { name: '1. 단원/[고등] 기본 코드(p17).py', data: CRLF_SOURCE },
      { name: 'cp949.py', data: Buffer.from([0x70, 0x72, 0x69, 0x6e, 0x74, 0x28, 0x22, 0xbe, 0xc8, 0x22, 0x29, 0x0d, 0x0a]) },
      { name: 'cr.py', data: 'x = 1\ry = 2\r\n' },
    ]);
    const result = importExamples({ rootDir: root, python: null, write: false });
    const byId = Object.fromEntries(result.results.map((item) => [item.id, item]));
    expect(byId.f900?.ok).toBe(true);
    expect(byId.f902?.problems.join('\n')).toMatch(/멤버 "missing.py"이\(가\) 없어요/u);
    expect(byId.f903?.problems.join('\n')).toMatch(/UTF-8이 아니에요/u);
    expect(byId.f904?.problems.join('\n')).toMatch(/홀로 있는 CR/u);
    expect(fs.existsSync(path.join(root, 'examples'))).toBe(false); // write: false

    const missingZip = importExamples({ rootDir: root, python: null, materialsRoot: 'nowhere', write: false });
    expect(missingZip.errors.join('\n')).toMatch(/원본 zip이 없어요/u);
    const unknownId = importExamples({ rootDir: root, python: null, ids: ['f999'], write: false });
    expect(unknownId.errors.join('\n')).toMatch(/id "f999" 항목이 없어요/u);
  });

  it('convertOriginal·defaultSidecar가 원본 이름에서 쪽과 차시를 읽는다', () => {
    const entry = { id: 'f905', source: 'demo', member: 'x/[고등] 1-2-1_기본 실습 코드(p28).py', target: 'examples/vision/u1/1-2-1-a.py', author: 'operator' as const };
    expect(defaultSidecar(entry)).toMatchObject({ title: '1-2-1 기본 실습 코드(p28)', lesson: '1-2-1', page: 28, source_id: 'f905', packages: ['opencv-python'] });
    expect(defaultSidecar({ ...entry, target: 'examples/desktop/a.py', meta: { title: '제목', packages: [] } })).toMatchObject({ title: '제목', packages: [] });
    // ESP32 예제의 배선·스모크 기대 결과는 씨앗에 있을 때만 그대로 옮긴다(P3-02)
    const esp32 = defaultSidecar({
      ...entry,
      target: 'examples/esp32/u2/a.py',
      meta: { title: '터치', parts: [{ part: 'touch-digital', pin: 17 }], smoke: { outcome: 'error', error: 'ImportError' }, practice: ['[실행]을 눌러요.'] },
    });
    expect(esp32).toMatchObject({ packages: [], parts: [{ part: 'touch-digital', pin: 17 }], smoke: { outcome: 'error', error: 'ImportError' }, practice: ['[실행]을 눌러요.'] });
    expect('parts' in defaultSidecar(entry)).toBe(false);
    expect('smoke' in defaultSidecar(entry)).toBe(false);
    const converted = convertOriginal(Buffer.from(CRLF_SOURCE, 'utf8'), entry, { python: null });
    expect(converted).toMatchObject({ lines: 4, originalLines: 4, syntax: 'ok', problems: [] });
  });
});

describe('저장소의 기록과 실제 examples/ 파일', () => {
  it('scripts/examples-manifest.yaml의 모든 항목이 옮겨져 있고 sha256·줄 수·LF·사이드카가 기록과 같다', () => {
    const result = verifyExamples({ rootDir: ROOT });
    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.checked).toBe(result.total);
    expect(result.total).toBeGreaterThanOrEqual(49);
  });

  it('옮긴 예제 파일에는 머리말(제목 주석)이 없고 CR이 없다 — 줄 번호 보존', () => {
    const manifest = parseManifest(fs.readFileSync(path.join(ROOT, 'scripts', 'examples-manifest.yaml'), 'utf8'));
    expect(manifest.errors).toEqual([]);
    for (const entry of manifest.examples) {
      const text = fs.readFileSync(path.join(ROOT, ...entry.target.split('/')), 'utf8');
      expect(text.includes('\r'), entry.target).toBe(false);
      expect(text.startsWith('# @'), entry.target).toBe(false);
    }
  });
});
