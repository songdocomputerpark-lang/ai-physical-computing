/**
 * 실제 보드의 파일 쓰기·확인(P3-08 실제 보드 ② — SPEC §6.2 "[보드에 저장]은 main.py로 저장해 전원만 켜도 실행",
 * PLAN §8.3 "코드가 부르는 라이브러리 함께 올리기"). raw REPL 명령을 하나씩 보내는 쪽(ReplCommandRunner — raw-repl.ts의 도구)만 알면 되므로
 * Node 단위 테스트가 모의 보드·정한 응답으로 검사한다(tests/unit/serial/real-board-files.test.ts).
 *
 * 쓰는 방식은 MicroPython 공식 도구 mpremote와 같다(2026-09-18 v1.29.0 원문 확인)
 * - tools/mpremote/mpremote/transport.py fs_writefile: 명령 "f=open(<경로>,'wb')\nw=f.write" → 256바이트씩 "w(<bytes 글자>)" 명령 → "f.close()".
 *   명령은 하나씩 raw REPL(transport_serial.py exec — raw-paste)로 보낸다.
 * - docs/reference/mpremote.rst "By default cp will skip copying files to the remote device if the SHA256 hash of the source and destination file
 *   matches" — 보드 쪽 해시는 fs_hashfile처럼 hashlib로 256바이트씩 읽어 만든다(hashlib이 없으면 모르는 것으로 보고 쓴다).
 * - "Auto soft-reset is performed the first time one of the following commands are executed: … fs" — [보드에 저장]은 먼저 소프트 리셋한다
 *   (board-connection.ts save).
 * 사이트가 더한 것
 * - 임시 이름(<경로>.part)에 쓰고 크기를 확인한 뒤 제자리로 옮긴다: 쓰다 끊기거나 [정지]해도 보드에 있던 파일이 반쪽이 되지 않는다(.part만 남고 다음에 다시 올린다).
 * - 닫은 뒤 os.stat(경로)[6](크기)을 받아 보낸 바이트 수와 견준다(덜 써진 파일을 알아채려고).
 * - 출력에서 표시 글자("apc:size"·"apc:file")가 든 줄만 읽는다 — 지난 실행의 Timer 콜백이 명령 사이에 글을 찍어도 섞이지 않게.
 * - 저장 위치는 보드 뿌리(/main.py, /i2c_lcd.py …): 교과서가 Thonny "MicroPython 장치"에 라이브러리를 저장하는 자리(원고 124~125쪽 단계 1~4)이고,
 *   ESP32의 sys.path가 ['', '.frozen', '/lib'] 순서라(py/runtime.c mp_init + ports/esp32/main.c) /lib에 올리면 뿌리에 있던 옛 파일에 가려진다.
 *   공식 문서 docs/reference/packages.rst도 손으로 올릴 때 "mpremote fs cp path/to/package.py :package.py"(뿌리)를 예로 든다.
 * - 순서: 라이브러리 먼저, main.py는 마지막(도중에 끊겨도 "main.py는 새것인데 라이브러리가 없는" 보드가 되지 않게).
 */
import { librariesNeededBy, type BoardLibrary } from '../esp32/board-libraries.ts';
import type { PythonErrorInfo } from '../runtime/protocol.ts';

/** [보드에 저장]이 쓰는 파일 이름(PLAN §6 "보드 저장 이름" — 원고·교안의 boot.py가 아니라 main.py) */
export const BOARD_MAIN_FILE = 'main.py';

/** 명령 하나에 싣는 바이트 수(mpremote fs_writefile chunk_size 기본값) */
export const FILE_CHUNK_BYTES = 256;

/** raw REPL 명령 하나의 결과 */
export interface ReplCommandOutput {
  /** 보드 출력(\r\n → \n) */
  readonly stdout: string;
  /** 트레이스백 원문 */
  readonly stderr: string;
  readonly error: PythonErrorInfo | null;
}

/** 명령을 보내는 쪽(raw-repl.ts의 ReplTools가 따른다) */
export interface ReplCommandRunner {
  command(code: string): Promise<ReplCommandOutput>;
}

export type BoardFileErrorCode =
  /** 보드 저장 공간이 모자람(ENOSPC) */
  | 'no-space'
  /** 보드 메모리가 모자람(MemoryError) */
  | 'memory'
  /** 플래시 입출력 오류(EIO) */
  | 'io'
  /** 쓰고 난 크기가 보낸 크기와 다름 */
  | 'verify'
  /** 약속한 표시 글자가 출력에 없음 */
  | 'protocol'
  /** 그 밖의 보드 오류 */
  | 'board-error';

export class BoardFileError extends Error {
  override readonly name = 'BoardFileError';
  readonly code: BoardFileErrorCode;
  readonly path: string;
  /** 보드가 보낸 오류 마지막 줄(없으면 빈 글자) */
  readonly boardMessage: string;
  constructor(code: BoardFileErrorCode, path: string, message: string, boardMessage = '') {
    super(message);
    this.code = code;
    this.path = path;
    this.boardMessage = boardMessage;
  }
}

const SAFE_PATH = /^[A-Za-z0-9_][A-Za-z0-9_.-]*(?:\/[A-Za-z0-9_][A-Za-z0-9_.-]*)*$/u;

/** 보드에 쓸 수 있는 경로 모양인지(영문·숫자·밑줄·점·하이픈, 따옴표·빈칸·..·앞의 / 없음) */
export function isSafeBoardPath(path: string): boolean {
  return SAFE_PATH.test(path) && !path.split('/').some((part) => part === '..' || part === '.');
}

/** 경로 → 파이썬 글자 'main.py'(안전한 모양만 — 아니면 오류) */
export function pythonPathLiteral(path: string): string {
  if (!isSafeBoardPath(path)) {
    throw new Error(`보드에 쓸 수 없는 파일 이름이에요: ${JSON.stringify(path)}`);
  }
  return `'${path}'`;
}

/** 바이트 → 파이썬 bytes 글자 b'…'(보이는 ASCII는 그대로, 나머지는 \xNN — MicroPython 글자 해석이 받는 모양) */
export function pythonBytesLiteral(bytes: Uint8Array): string {
  let out = "b'";
  for (const byte of bytes) {
    if (byte === 0x5c) {
      out += '\\\\';
    } else if (byte === 0x27) {
      out += "\\'";
    } else if (byte === 0x0a) {
      out += '\\n';
    } else if (byte === 0x0d) {
      out += '\\r';
    } else if (byte === 0x09) {
      out += '\\t';
    } else if (byte >= 0x20 && byte <= 0x7e) {
      out += String.fromCharCode(byte);
    } else {
      out += `\\x${byte.toString(16).padStart(2, '0')}`;
    }
  }
  return `${out}'`;
}

/** fs_writefile 1단계: 열기 */
export function openForWriteCommand(path: string): string {
  return `f=open(${pythonPathLiteral(path)},'wb')\nw=f.write`;
}

/** fs_writefile 2단계: 조각 쓰기 */
export function writeChunkCommand(chunk: Uint8Array): string {
  return `w(${pythonBytesLiteral(chunk)})`;
}

/** fs_writefile 3단계: 닫기 + (사이트) 크기 확인 */
export function closeAndStatCommand(path: string): string {
  return `f.close()\nimport os\nprint('apc:size',os.stat(${pythonPathLiteral(path)})[6])`;
}

/** 임시 이름(<경로>.part) — 다 쓰고 크기를 확인한 뒤에 제자리로 옮긴다 */
export function partPath(path: string): string {
  return `${path}.part`;
}

/**
 * (사이트) 4단계: 임시 파일을 제자리로 옮긴다. 도중에 끊겨도 원래 파일이 반쪽이 되지 않게 — 쓰다 멈추면 .part만 남고 다음에 다시 올린다.
 * rename이 이미 있는 파일을 덮지 못하는 파일 시스템(FAT)도 있어 먼저 지운다(LittleFS는 덮어써도 된다).
 */
export function moveIntoPlaceCommand(path: string): string {
  const literal = pythonPathLiteral(path);
  return ['import os', 'try:', ` os.remove(${literal})`, 'except OSError:', ' pass', `os.rename(${pythonPathLiteral(partPath(path))},${literal})`, `print('apc:moved',${literal})`].join('\n');
}

/** moveIntoPlaceCommand 출력의 경로(없으면 null) */
export function parseMoved(stdout: string): string | null {
  let found: RegExpMatchArray | null = null;
  for (const match of stdout.matchAll(/apc:moved (\S+)/gu)) {
    found = match;
  }
  return found ? found[1]! : null;
}

/**
 * 파일이 있는지·크기·SHA256(16진수). 출력 "apc:file <크기 또는 -1> <해시 또는 ?>".
 * hashlib이 없거나(모의 보드) 읽다 오류가 나면 해시는 ?. 한 줄 들여쓰기만 쓰고 def·with 없이(모의 보드 mini-python도 도는 모양).
 */
export function fileInfoCommand(path: string): string {
  const literal = pythonPathLiteral(path);
  return [
    'import os',
    'try:',
    ` _s=os.stat(${literal})[6]`,
    'except OSError:',
    ' _s=-1',
    "_d='?'",
    'if _s>=0:',
    ' try:',
    '  import hashlib,binascii',
    '  _h=hashlib.sha256()',
    `  _f=open(${literal},'rb')`,
    '  while True:',
    '   _b=_f.read(256)',
    '   if not _b:',
    '    break',
    '   _h.update(_b)',
    '  _f.close()',
    '  _d=binascii.hexlify(_h.digest()).decode()',
    ' except Exception:',
    "  _d='?'",
    "print('apc:file',_s,_d)",
  ].join('\n');
}

export interface BoardFileInfo {
  readonly exists: boolean;
  /** 바이트(없으면 -1) */
  readonly size: number;
  /** 소문자 16진수 SHA256(모르면 null) */
  readonly sha256: string | null;
}

/** fileInfoCommand 출력 읽기(표시 줄이 없으면 null) */
export function parseFileInfo(stdout: string): BoardFileInfo | null {
  let found: RegExpMatchArray | null = null;
  for (const match of stdout.matchAll(/apc:file (-?\d+) ([0-9a-fA-F]{64}|\?)/gu)) {
    found = match;
  }
  if (!found) {
    return null;
  }
  const size = Number(found[1]);
  return Object.freeze({ exists: size >= 0, size, sha256: found[2] === '?' ? null : found[2]!.toLowerCase() });
}

/** closeAndStatCommand 출력의 크기(없으면 null) */
export function parseStatSize(stdout: string): number | null {
  let found: RegExpMatchArray | null = null;
  for (const match of stdout.matchAll(/apc:size (\d+)/gu)) {
    found = match;
  }
  return found ? Number(found[1]) : null;
}

/** 바이트의 SHA256(소문자 16진수). Web Crypto가 없으면(보안 연결이 아닌 주소) null */
export async function sha256Hex(bytes: Uint8Array): Promise<string | null> {
  const subtle = (globalThis as { crypto?: Crypto }).crypto?.subtle;
  if (!subtle) {
    return null;
  }
  try {
    const digest = new Uint8Array(await subtle.digest('SHA-256', new Uint8Array(bytes)));
    return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

/** 보드 오류(트레이스백 마지막 줄) → 파일 오류 종류 */
export function boardFileErrorFrom(path: string, error: PythonErrorInfo): BoardFileError {
  const message = error.message;
  if (/ENOSPC|\[Errno 28\]/u.test(message)) {
    return new BoardFileError('no-space', path, `보드 저장 공간이 모자라 ${path} 파일을 쓰지 못했어요.`, message);
  }
  if (error.type === 'MemoryError') {
    return new BoardFileError('memory', path, `보드 메모리가 모자라 ${path} 파일을 쓰지 못했어요.`, message);
  }
  if (/EIO|\[Errno 5\]/u.test(message)) {
    return new BoardFileError('io', path, `보드 플래시에 ${path} 파일을 쓰다 입출력 오류가 났어요.`, message);
  }
  return new BoardFileError('board-error', path, `${path} 파일을 다루다 보드가 오류를 보냈어요: ${message}`, message);
}

async function checked(runner: ReplCommandRunner, path: string, code: string): Promise<ReplCommandOutput> {
  const output = await runner.command(code);
  if (output.error) {
    throw boardFileErrorFrom(path, output.error);
  }
  return output;
}

/** 보드 파일 정보(있는지·크기·해시) */
export async function readBoardFileInfo(runner: ReplCommandRunner, path: string): Promise<BoardFileInfo> {
  const output = await checked(runner, path, fileInfoCommand(path));
  const info = parseFileInfo(output.stdout);
  if (!info) {
    throw new BoardFileError('protocol', path, `보드에서 ${path} 파일 정보를 읽지 못했어요.`, output.stdout.slice(-200));
  }
  return info;
}

/**
 * 파일 하나를 mpremote fs_writefile 방식으로 쓰고(임시 이름 → 크기 확인 → 제자리로 옮기기) 끝낸다. onChunk(쓴 바이트 수)
 */
export async function writeBoardFile(runner: ReplCommandRunner, path: string, bytes: Uint8Array, onChunk?: (written: number) => void): Promise<void> {
  const temp = partPath(path);
  await checked(runner, path, openForWriteCommand(temp));
  let written = 0;
  try {
    for (let offset = 0; offset < bytes.length; offset += FILE_CHUNK_BYTES) {
      const chunk = bytes.subarray(offset, Math.min(offset + FILE_CHUNK_BYTES, bytes.length));
      await checked(runner, path, writeChunkCommand(chunk));
      written += chunk.length;
      onChunk?.(written);
    }
  } catch (error) {
    if (error instanceof BoardFileError) {
      // 쓰다 실패하면 열린 파일을 닫아 둔다(닫기도 실패하면 그대로 — 다음 소프트 리셋이 정리한다). 원래 파일은 그대로다(임시 이름에 썼다)
      await runner.command('f.close()').catch(() => undefined);
    }
    throw error;
  }
  const closed = await checked(runner, path, closeAndStatCommand(temp));
  const size = parseStatSize(closed.stdout);
  if (size === null) {
    throw new BoardFileError('protocol', path, `${path} 파일을 쓴 뒤 크기를 확인하지 못했어요.`, closed.stdout.slice(-200));
  }
  if (size !== bytes.length) {
    throw new BoardFileError('verify', path, `${path} 파일이 ${bytes.length}바이트 중 ${size}바이트만 써졌어요.`);
  }
  const moved = await checked(runner, path, moveIntoPlaceCommand(path));
  if (parseMoved(moved.stdout) !== path) {
    throw new BoardFileError('protocol', path, `${path} 파일을 제자리로 옮기지 못했어요.`, moved.stdout.slice(-200));
  }
}

export interface BoardFilePlanItem {
  /** 보드 뿌리 기준 경로(main.py, i2c_lcd.py) */
  readonly path: string;
  readonly bytes: Uint8Array;
  readonly kind: 'main' | 'library';
  /** 다른 저작자의 파일(examples/esp32/lib/third-party/ — 안의 저작권 고지를 그대로 올린다) */
  readonly thirdParty: boolean;
}

/** [보드에 저장] 계획: 코드가 부르는 사이트 라이브러리(부르는 라이브러리의 라이브러리까지) → main.py */
export function planBoardSave(code: string, libraries: readonly BoardLibrary[]): BoardFilePlanItem[] {
  const encoder = new TextEncoder();
  const items: BoardFilePlanItem[] = librariesNeededBy(code, libraries).map((library) => ({
    path: library.fileName,
    bytes: encoder.encode(library.source),
    kind: 'library',
    thirdParty: library.thirdParty,
  }));
  items.push({ path: BOARD_MAIN_FILE, bytes: encoder.encode(code), kind: 'main', thirdParty: false });
  return items;
}

export interface BoardSaveProgress {
  /** check = 보드 파일과 견주는 중, write = 쓰는 중 */
  readonly phase: 'check' | 'write';
  readonly path: string;
  /** 이 파일에서 쓴 바이트 */
  readonly written: number;
  readonly size: number;
  /** 몇 번째 파일(1부터) */
  readonly fileNumber: number;
  readonly fileCount: number;
  /** 모든 파일에서 끝난 바이트(같아서 건너뛴 파일 포함) */
  readonly doneBytes: number;
  readonly totalBytes: number;
}

export interface BoardSavedFile {
  readonly path: string;
  readonly kind: 'main' | 'library';
  readonly size: number;
  /** written = 썼음, same = 보드 파일이 이미 같아 건너뜀(SHA256) */
  readonly status: 'written' | 'same';
  /** 쓰기 전에 같은 이름의 파일이 보드에 있었는지(바꿨는지) */
  readonly replaced: boolean;
  readonly thirdParty: boolean;
}

export interface BoardSaveResult {
  readonly files: readonly BoardSavedFile[];
  readonly totalBytes: number;
  /** 실제로 보낸 바이트(건너뛴 파일 제외) */
  readonly writtenBytes: number;
  /** 보드 해시로 견줄 수 있었는지(hashlib이 없으면 늘 씀) */
  readonly hashChecked: boolean;
  readonly durationMs: number;
  /** main.py가 input()을 기다리는 코드인지(USB 없이 전원만 넣으면 계속 기다린다는 안내) */
  readonly mainUsesInput: boolean;
}

/** 계획대로 파일을 올린다(보드 파일이 이미 같으면 건너뛴다). 오류는 BoardFileError(보드 오류)·연결 오류를 그대로 던진다 */
export async function saveFilesToBoard(
  runner: ReplCommandRunner,
  plan: readonly BoardFilePlanItem[],
  options: { readonly onProgress?: (progress: BoardSaveProgress) => void; readonly now?: () => number; readonly mainUsesInput?: boolean } = {},
): Promise<BoardSaveResult> {
  const now = options.now ?? (() => Date.now());
  const startedAt = now();
  const totalBytes = plan.reduce((sum, item) => sum + item.bytes.length, 0);
  const files: BoardSavedFile[] = [];
  let doneBytes = 0;
  let writtenBytes = 0;
  let hashChecked = true;
  for (const [index, item] of plan.entries()) {
    const base = { path: item.path, size: item.bytes.length, fileNumber: index + 1, fileCount: plan.length, totalBytes };
    options.onProgress?.({ ...base, phase: 'check', written: 0, doneBytes });
    const [info, local] = await Promise.all([readBoardFileInfo(runner, item.path), sha256Hex(item.bytes)]);
    if (info.exists && (info.sha256 === null || local === null)) {
      hashChecked = false;
    }
    if (info.exists && info.sha256 !== null && info.sha256 === local && info.size === item.bytes.length) {
      doneBytes += item.bytes.length;
      files.push({ path: item.path, kind: item.kind, size: item.bytes.length, status: 'same', replaced: false, thirdParty: item.thirdParty });
      options.onProgress?.({ ...base, phase: 'check', written: item.bytes.length, doneBytes });
      continue;
    }
    const before = doneBytes;
    await writeBoardFile(runner, item.path, item.bytes, (written) => {
      options.onProgress?.({ ...base, phase: 'write', written, doneBytes: before + written });
    });
    doneBytes += item.bytes.length;
    writtenBytes += item.bytes.length;
    files.push({ path: item.path, kind: item.kind, size: item.bytes.length, status: 'written', replaced: info.exists, thirdParty: item.thirdParty });
  }
  return Object.freeze({ files, totalBytes, writtenBytes, hashChecked, durationMs: now() - startedAt, mainUsesInput: options.mainUsesInput ?? false });
}

export interface LibraryProvision {
  readonly path: string;
  /** uploaded = 보드에 없어 올림, same = 사이트판과 같음, different = 다른 파일이 있음(그대로 씀), present = 있음(해시를 몰라 견주지 않음) */
  readonly status: 'uploaded' | 'same' | 'different' | 'present';
}

/**
 * [실행] 전에 코드가 부르는 사이트 라이브러리를 보드에 갖춰 둔다: 없으면 올리고, 있으면 건드리지 않는다
 * (학생이 고친 파일을 [실행]이 덮어쓰지 않게 — 사이트판으로 바꾸는 일은 [보드에 저장]).
 */
export async function provisionLibraries(
  runner: ReplCommandRunner,
  libraries: readonly BoardLibrary[],
  options: { readonly onUpload?: (path: string, size: number) => void } = {},
): Promise<LibraryProvision[]> {
  const encoder = new TextEncoder();
  const results: LibraryProvision[] = [];
  for (const library of libraries) {
    const bytes = encoder.encode(library.source);
    const info = await readBoardFileInfo(runner, library.fileName);
    if (!info.exists) {
      // 큰 파일(i2c_lcd.py 13KB)은 실물에서 몇 초 걸릴 수 있어 올리기 전에 알린다
      options.onUpload?.(library.fileName, bytes.length);
      await writeBoardFile(runner, library.fileName, bytes);
      results.push({ path: library.fileName, status: 'uploaded' });
      continue;
    }
    const local = await sha256Hex(bytes);
    if (info.sha256 === null || local === null) {
      results.push({ path: library.fileName, status: 'present' });
    } else {
      results.push({ path: library.fileName, status: info.sha256 === local && info.size === bytes.length ? 'same' : 'different' });
    }
  }
  return results;
}
