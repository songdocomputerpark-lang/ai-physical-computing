/**
 * 파일 패널의 순수 논리(P2-10): 작업 폴더 목록과 화면이 아는 바이트를 합쳐 한 줄씩 보일 항목을 만들고, 크기 글·파일 형식·내려받기를 다룬다.
 * DOM을 만지는 코드는 index.ts에 있다. 여기 함수는 단위 테스트가 검사한다(tests/unit/runtime-extras/files.test.ts).
 */

/** 파일이 어디서 왔는지 */
export type FileKind = 'saved' | 'uploaded' | 'provided' | 'other';

export const KIND_LABELS: Readonly<Record<FileKind, string>> = Object.freeze({
  saved: '코드가 저장',
  uploaded: '내가 넣음',
  provided: '사이트 제공',
  other: '작업 폴더',
});

/**
 * 코드가 작업 폴더의 파일을 쓰는 흔한 모양(파일 패널을 열지 정할 때, 2026-09-17 Phase 2 검토 반영 — "한 페이지 한 개념").
 * 에지 검출 첫 실습처럼 파일을 쓰지 않는 예제에서는 파일 패널을 닫아 두고, 아래 모양이 코드에 보이면 연다.
 * - 맨 이름 open(…)(webbrowser.open·Image.open 같은 점 뒤 open은 따로 본다), Image.open(…)
 * - cv2.imread·imwrite, ImageFont.truetype, pyautogui.screenshot, os.listdir, numpy loadtxt·savetxt·load·save
 * - 그림·표 저장 .save(…)·.to_csv(…)·read_csv(…), 파일 경로를 준 VideoCapture('영상.mp4'), 사이트 파일 이름 mask.png
 * 틀려도 해가 작다: 놓치면 코드가 파일을 저장하거나 [파일 넣기]를 쓰는 순간 패널이 열린다(index.ts).
 */
export const WORK_FILE_USE_PATTERN =
  /(?<![.\w])open\s*\(|\bImage\s*\.\s*open\s*\(|\b(?:imread|imwrite|truetype|screenshot|listdir|loadtxt|savetxt|read_csv)\s*\(|\bnp\s*\.\s*(?:load|save)\s*\(|\.(?:save|to_csv)\s*\(|VideoCapture\s*\(\s*(?:[rbuf]{0,2})['"]|\bmask\.png\b/u;

/** 이 코드가 작업 폴더의 파일을 쓰는지(WORK_FILE_USE_PATTERN) */
export function usesWorkFiles(code: string): boolean {
  return WORK_FILE_USE_PATTERN.test(code);
}

/** 항목 정렬 순서: 코드가 저장한 것(내려받을 것)이 맨 위 */
const KIND_ORDER: Readonly<Record<FileKind, number>> = Object.freeze({ saved: 0, uploaded: 1, provided: 2, other: 3 });

export interface ListedFile {
  readonly name: string;
  readonly size: number;
}

export interface FileEntry {
  readonly name: string;
  readonly size: number;
  readonly kind: FileKind;
  /** 화면이 바이트를 가지고 있어 [내려받기]가 되는지 */
  readonly downloadable: boolean;
}

export interface KnownBytes {
  readonly provided: ReadonlyMap<string, Uint8Array>;
  readonly uploaded: ReadonlyMap<string, Uint8Array>;
  readonly saved: ReadonlyMap<string, Uint8Array>;
}

/**
 * 파이썬이 알려 준 작업 폴더 목록(listing)과 화면이 아는 바이트를 합친다. 목록에 없어도 화면이 아는 파일(방금 저장 알림이 온 것)은 넣고,
 * 같은 이름이면 코드가 저장한 것 > 내가 넣은 것 > 사이트 제공 순으로 종류를 정한다(코드가 mask.png를 덮어쓰면 "코드가 저장").
 */
export function mergeFileEntries(listing: readonly ListedFile[], known: KnownBytes): FileEntry[] {
  const sizes = new Map<string, number>();
  for (const file of listing) {
    sizes.set(file.name, file.size);
  }
  const names = new Set<string>([...sizes.keys(), ...known.provided.keys(), ...known.uploaded.keys(), ...known.saved.keys()]);
  const entries: FileEntry[] = [];
  for (const name of names) {
    let kind: FileKind = 'other';
    let bytes: Uint8Array | undefined;
    if (known.saved.has(name)) {
      kind = 'saved';
      bytes = known.saved.get(name);
    } else if (known.uploaded.has(name)) {
      kind = 'uploaded';
      bytes = known.uploaded.get(name);
    } else if (known.provided.has(name)) {
      kind = 'provided';
      bytes = known.provided.get(name);
    }
    entries.push({ name, size: sizes.get(name) ?? bytes?.length ?? 0, kind, downloadable: bytes !== undefined });
  }
  entries.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.name.localeCompare(b.name, 'ko-KR', { numeric: true }));
  return entries;
}

/** 크기를 사람 말로: 1023바이트 → "1,023바이트", 1536 → "1.5KB", 2,097,152 → "2.0MB" */
export function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size < 0) {
    return '0바이트';
  }
  if (size < 1024) {
    return `${size.toLocaleString('ko-KR')}바이트`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)}KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)}MB`;
}

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = Object.freeze({
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
  txt: 'text/plain;charset=utf-8',
  csv: 'text/csv;charset=utf-8',
  json: 'application/json',
  py: 'text/x-python;charset=utf-8',
  md: 'text/markdown;charset=utf-8',
  ttf: 'font/ttf',
  otf: 'font/otf',
});

/** 파일 이름의 확장자로 MIME 형식을 고른다(모르면 application/octet-stream). */
export function mimeTypeFor(name: string): string {
  const extension = name.toLowerCase().split('.').pop() ?? '';
  return MIME_BY_EXTENSION[extension] ?? 'application/octet-stream';
}

/** 그림 파일인지(패널의 작은 미리 보기용) */
export function isImageFile(name: string): boolean {
  return mimeTypeFor(name).startsWith('image/');
}

interface ObjectUrlApi {
  createObjectURL?(blob: Blob): string;
  revokeObjectURL?(url: string): void;
}

/**
 * 바이트를 파일로 내려받는다(src/lab/controls/download.ts의 downloadTextFile과 같은 방법, 서버 없음).
 * 내려받기를 시작하지 못하는 환경이면 false.
 */
export function downloadBytes(fileName: string, bytes: Uint8Array, doc: Document = document): boolean {
  const urlApi = (globalThis as { URL?: ObjectUrlApi }).URL;
  if (typeof Blob === 'undefined' || !urlApi?.createObjectURL || !urlApi.revokeObjectURL) {
    return false;
  }
  const blob = new Blob([bytes as BlobPart], { type: mimeTypeFor(fileName) });
  const url = urlApi.createObjectURL(blob);
  const link = doc.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  link.hidden = true;
  doc.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => urlApi.revokeObjectURL?.(url), 1000);
  return true;
}
