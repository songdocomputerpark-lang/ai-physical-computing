/**
 * 펌웨어 목록(public/firmware/manifest.json)의 모양과 검사 — PLAN §8.3 P3-09, PD-02·PD-13(펌웨어는 같은 사이트에 둔다).
 *
 * 목록 파일은 교사·운영자가 펌웨어 판을 올릴 때 고치는 곳이다(MAINTENANCE.md "펌웨어 버전 올리기"):
 *   1. 공식 페이지(https://micropython.org/download/ESP32_GENERIC/)에서 새 .bin을 받아 public/firmware/v<판>/에 둔다.
 *   2. manifest.json의 version·releaseDate·path·size·sha256·sourceUrl을 새 파일에 맞게 고친다
 *      (크기·SHA-256은 PowerShell `Get-FileHash -Algorithm SHA256 <파일>`·`(Get-Item <파일>).Length`로 잰다 — 대문자여도 된다).
 *   3. 고지 파일(NOTICE.txt)과 sources.yaml 항목을 새 판으로 고친다.
 * 형식이 틀리면 어디가 틀렸는지 한국어로 모아 알린다(빌드가 멈추고, tests/unit/firmware/manifest.test.ts도 실패한다).
 *
 * 이 파일은 브라우저 번들(굽기 화면)과 빌드(Astro 컴포넌트)·단위 테스트가 함께 쓰므로 Node 모듈을 import하지 않는다.
 * 파일을 디스크에서 읽는 일은 빌드 전용 manifest-file.ts가 한다.
 *
 * 경로 규칙: path·notice는 사이트 뿌리 기준(public/ 아래) — "firmware/"로 시작하고 판이 든 폴더에 둔다.
 * 판이 주소에 들어가야 서비스 워커의 firmware/ 캐시 우선 규칙(src/sw/sw.js)이 옛 파일을 새 판으로 착각하지 않는다.
 * 목록 파일 자체는 페이지를 빌드할 때 HTML 안에 심으므로 브라우저가 따로 받지 않는다(캐시 우선 규칙에 묶여 낡은 목록을 읽을 일이 없다).
 */

/** 목록 파일 위치(public/ 기준) */
export const FIRMWARE_MANIFEST_PATH = 'firmware/manifest.json';

/** 지금 읽을 줄 아는 목록 형식 번호 */
export const FIRMWARE_MANIFEST_SCHEMA = 1;

/** 이 사이트의 굽기 화면이 다루는 칩(ESP32 ROM 부트로더와 직접 주고받는 흐름 — PD-38) */
export const SUPPORTED_FIRMWARE_CHIPS: readonly string[] = Object.freeze(['ESP32']);

/** 플래시 섹터 크기. ROM 부트로더로 쓸 때 시작 위치는 섹터 경계여야 한다(esptool write_flash --no-stub 규칙) */
export const FLASH_SECTOR_SIZE = 0x1000;

/** 펌웨어 파일 하나의 크기 상한(ESP32 플래시 16MB) */
export const MAX_FIRMWARE_BYTES = 16 * 1024 * 1024;

export interface FirmwareInfo {
  /** 영문 소문자·숫자·하이픈 */
  readonly id: string;
  /** 화면에 보이는 이름(예: MicroPython) */
  readonly title: string;
  /** 공식 보드 이름(예: ESP32_GENERIC) */
  readonly board: string;
  /** 칩 이름(지금은 ESP32만) */
  readonly chip: string;
  /** 판(예: 1.29.0 — 앞에 v를 붙이지 않는다) */
  readonly version: string;
  /** 공식 출시일 YYYY-MM-DD */
  readonly releaseDate: string;
  /** 사이트 뿌리 기준 파일 경로(예: firmware/v1.29.0/ESP32_GENERIC-20260824-v1.29.0.bin) */
  readonly path: string;
  /** 경로의 마지막 이름 */
  readonly fileName: string;
  /** 바이트 수 */
  readonly size: number;
  /** 소문자 16진수 64글자 */
  readonly sha256: string;
  /** 보드 플래시에 쓰는 위치(바이트) */
  readonly offset: number;
  /** 이 펌웨어가 필요로 하는 가장 작은 플래시 크기(바이트). 모르면 null */
  readonly minFlashBytes: number | null;
  /** 라이선스 이름(예: MIT) */
  readonly license: string;
  /** 사이트 뿌리 기준 고지 파일 경로. 없으면 null */
  readonly noticePath: string | null;
  /** 공식 파일 주소 */
  readonly sourceUrl: string;
  /** 공식 내려받기·설치 안내 페이지 */
  readonly downloadPage: string;
  /** 위 정보를 공식 출처와 대조한 날짜 YYYY-MM-DD */
  readonly checked: string;
  /** SHA-256을 어디서 얻었는지(공식 페이지에 해시가 없을 때의 설명) */
  readonly hashSource: string | null;
}

export interface FirmwareManifest {
  readonly schema: number;
  /** 첫 항목이 굽기 화면의 기본 펌웨어다 */
  readonly firmware: readonly FirmwareInfo[];
}

export class FirmwareManifestError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`펌웨어 목록(public/${FIRMWARE_MANIFEST_PATH})에 문제가 있어요.\n${problems.map((problem) => `- ${problem}`).join('\n')}`);
    this.name = 'FirmwareManifestError';
    this.problems = problems;
  }
}

const ID_PATTERN = /^[a-z][a-z0-9-]*$/u;
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/u;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
/** 사이트 안 파일 경로: firmware/로 시작, 영문·숫자와 . _ - / 만(빈 칸·..·\ 금지) */
const SITE_FILE_PATTERN = /^firmware\/(?:[A-Za-z0-9_-][A-Za-z0-9._-]*\/)*[A-Za-z0-9_-][A-Za-z0-9._-]*$/u;
const SIZE_LABEL_PATTERN = /^(\d+)\s*(KB|MB)$/iu;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) {
    return false;
  }
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

/** 사이트 안 파일 경로가 규칙에 맞는지(firmware/…, ..·빈 칸·역슬래시 없음) */
export function isSiteFirmwarePath(value: string): boolean {
  return SITE_FILE_PATTERN.test(value) && !value.split('/').some((part) => part === '..' || part === '.');
}

/** 굽는 위치: 4096 같은 수 또는 "0x1000" 같은 16진수 글자 → 바이트. 읽을 수 없으면 null */
export function parseOffset(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^0x[0-9a-f]+$/iu.test(trimmed)) {
      return Number.parseInt(trimmed.slice(2), 16);
    }
    if (/^\d+$/u.test(trimmed)) {
      return Number.parseInt(trimmed, 10);
    }
  }
  return null;
}

/** "4MB"·"512KB" → 바이트(1024 단위). 읽을 수 없으면 null */
export function parseSizeLabel(value: unknown): number | null {
  if (typeof value !== 'string') {
    return null;
  }
  const match = SIZE_LABEL_PATTERN.exec(value.trim());
  if (!match) {
    return null;
  }
  const amount = Number(match[1]);
  return match[2]!.toUpperCase() === 'MB' ? amount * 1024 * 1024 : amount * 1024;
}

function normalizeFirmware(raw: unknown, where: string, problems: string[]): FirmwareInfo | null {
  if (!isRecord(raw)) {
    problems.push(`${where}: 펌웨어 항목은 id·version·path … 필드를 가진 객체예요.`);
    return null;
  }
  const before = problems.length;
  const id = text(raw.id);
  if (id === null || !ID_PATTERN.test(id)) {
    problems.push(`${where}: id는 영문 소문자로 시작하고 소문자·숫자·하이픈만 써요(지금: ${JSON.stringify(raw.id)}).`);
  }
  const title = text(raw.title);
  if (title === null) {
    problems.push(`${where}: title(화면에 보일 이름, 예: MicroPython)을 적어요.`);
  }
  const board = text(raw.board);
  if (board === null || !/^[A-Z0-9_]+$/u.test(board)) {
    problems.push(`${where}: board는 공식 보드 이름(예: ESP32_GENERIC)이에요(지금: ${JSON.stringify(raw.board)}).`);
  }
  const chip = text(raw.chip);
  if (chip === null || !SUPPORTED_FIRMWARE_CHIPS.includes(chip)) {
    problems.push(`${where}: chip은 ${SUPPORTED_FIRMWARE_CHIPS.join('·')} 가운데 하나예요(지금: ${JSON.stringify(raw.chip)}). 굽기 화면은 ESP32 ROM 부트로더와만 주고받아요.`);
  }
  const version = text(raw.version);
  if (version === null || !VERSION_PATTERN.test(version)) {
    problems.push(`${where}: version은 1.29.0처럼 숫자 세 개예요(앞에 v 없이, 지금: ${JSON.stringify(raw.version)}).`);
  }
  const releaseDate = text(raw.releaseDate);
  if (releaseDate === null || !isValidDate(releaseDate)) {
    problems.push(`${where}: releaseDate는 YYYY-MM-DD 날짜예요(지금: ${JSON.stringify(raw.releaseDate)}).`);
  }
  const path = text(raw.path);
  if (path === null || !isSiteFirmwarePath(path) || !path.endsWith('.bin')) {
    problems.push(`${where}: path는 "firmware/v<판>/<파일 이름>.bin"처럼 사이트 뿌리 기준 경로예요(지금: ${JSON.stringify(raw.path)}).`);
  } else if (version !== null && !path.split('/').slice(1, -1).some((part) => part.includes(version))) {
    problems.push(`${where}: path의 폴더 이름에 판(${version})을 넣어요(예: firmware/v${version}/…). 서비스 워커가 판이 다른 파일을 헷갈리지 않게 해요.`);
  }
  const size = raw.size;
  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size <= 0 || size > MAX_FIRMWARE_BYTES) {
    problems.push(`${where}: size는 1부터 ${MAX_FIRMWARE_BYTES}까지의 바이트 수(정수)예요(지금: ${JSON.stringify(size)}).`);
  }
  const sha256 = text(raw.sha256)?.toLowerCase() ?? null;
  if (sha256 === null || !SHA256_PATTERN.test(sha256)) {
    problems.push(`${where}: sha256은 16진수 64글자예요(지금: ${JSON.stringify(raw.sha256)}).`);
  }
  const offset = parseOffset(raw.offset);
  if (offset === null || offset % FLASH_SECTOR_SIZE !== 0 || offset >= MAX_FIRMWARE_BYTES) {
    problems.push(`${where}: offset은 "0x1000"처럼 4096의 배수인 굽는 위치예요(지금: ${JSON.stringify(raw.offset)}).`);
  }
  let minFlashBytes: number | null = null;
  if (raw.minFlashSize !== undefined && raw.minFlashSize !== null) {
    minFlashBytes = parseSizeLabel(raw.minFlashSize);
    if (minFlashBytes === null) {
      problems.push(`${where}: minFlashSize는 "4MB"처럼 적어요(지금: ${JSON.stringify(raw.minFlashSize)}).`);
    }
  }
  if (typeof size === 'number' && offset !== null && minFlashBytes !== null && offset + size > minFlashBytes) {
    problems.push(`${where}: offset + size(${offset + size})가 minFlashSize(${minFlashBytes})보다 커요.`);
  }
  const license = text(raw.license);
  if (license === null) {
    problems.push(`${where}: license(라이선스 이름, 예: MIT)를 적어요.`);
  }
  let noticePath: string | null = null;
  if (raw.notice !== undefined && raw.notice !== null) {
    noticePath = text(raw.notice);
    if (noticePath === null || !isSiteFirmwarePath(noticePath)) {
      problems.push(`${where}: notice는 "firmware/v<판>/NOTICE.txt"처럼 사이트 뿌리 기준 경로예요(지금: ${JSON.stringify(raw.notice)}).`);
      noticePath = null;
    }
  }
  const sourceUrl = text(raw.sourceUrl);
  if (sourceUrl === null || !isHttpsUrl(sourceUrl)) {
    problems.push(`${where}: sourceUrl은 공식 파일의 https 주소예요(지금: ${JSON.stringify(raw.sourceUrl)}).`);
  } else if (path !== null && !sourceUrl.endsWith(`/${path.split('/').pop()}`)) {
    problems.push(`${where}: sourceUrl의 파일 이름과 path의 파일 이름이 달라요. 공식 파일 이름을 그대로 써요.`);
  }
  const downloadPage = text(raw.downloadPage);
  if (downloadPage === null || !isHttpsUrl(downloadPage)) {
    problems.push(`${where}: downloadPage는 공식 내려받기 페이지의 https 주소예요(지금: ${JSON.stringify(raw.downloadPage)}).`);
  }
  const checked = text(raw.checked);
  if (checked === null || !isValidDate(checked)) {
    problems.push(`${where}: checked는 공식 출처와 대조한 날짜 YYYY-MM-DD예요(지금: ${JSON.stringify(raw.checked)}).`);
  }
  const hashSource = raw.hashSource === undefined || raw.hashSource === null ? null : text(raw.hashSource);
  if (problems.length > before) {
    return null;
  }
  return {
    id: id!,
    title: title!,
    board: board!,
    chip: chip!,
    version: version!,
    releaseDate: releaseDate!,
    path: path!,
    fileName: path!.split('/').pop()!,
    size: size as number,
    sha256: sha256!,
    offset: offset!,
    minFlashBytes,
    license: license!,
    noticePath,
    sourceUrl: sourceUrl!,
    downloadPage: downloadPage!,
    checked: checked!,
    hashSource,
  };
}

/** 펌웨어 항목 하나(페이지에 심은 JSON 등)를 검사한다. 틀리면 FirmwareManifestError */
export function parseFirmwareInfo(raw: unknown): FirmwareInfo {
  const problems: string[] = [];
  const info = normalizeFirmware(raw, 'firmware', problems);
  if (!info) {
    throw new FirmwareManifestError(problems);
  }
  return info;
}

/** 목록 파일 전체를 검사한다. 틀리면 FirmwareManifestError(문제 목록) */
export function parseFirmwareManifest(raw: unknown): FirmwareManifest {
  const problems: string[] = [];
  if (!isRecord(raw)) {
    throw new FirmwareManifestError(['목록은 { "schema": 1, "firmware": [ … ] } 모양의 JSON 객체예요.']);
  }
  if (raw.schema !== FIRMWARE_MANIFEST_SCHEMA) {
    problems.push(`schema는 ${FIRMWARE_MANIFEST_SCHEMA}이에요(지금: ${JSON.stringify(raw.schema)}).`);
  }
  const list = raw.firmware;
  const firmware: FirmwareInfo[] = [];
  if (!Array.isArray(list) || list.length === 0) {
    problems.push('firmware: 펌웨어 항목을 한 개 이상 적어요(첫 항목이 굽기 화면의 기본 펌웨어예요).');
  } else {
    const ids = new Set<string>();
    list.forEach((item, index) => {
      const info = normalizeFirmware(item, `firmware[${index}]`, problems);
      if (!info) {
        return;
      }
      if (ids.has(info.id)) {
        problems.push(`firmware[${index}]: id "${info.id}"이(가) 겹쳐요.`);
      }
      ids.add(info.id);
      firmware.push(info);
    });
  }
  if (problems.length > 0) {
    throw new FirmwareManifestError(problems);
  }
  return { schema: FIRMWARE_MANIFEST_SCHEMA, firmware };
}

/** 굽기 화면의 기본 펌웨어(목록의 첫 항목) */
export function defaultFirmware(manifest: FirmwareManifest): FirmwareInfo {
  const first = manifest.firmware[0];
  if (!first) {
    throw new FirmwareManifestError(['firmware: 펌웨어 항목이 없어요.']);
  }
  return first;
}

/** 1790544 → "1.7MB", 4194304 → "4MB"(1024 단위, 소수 한 자리 — .0은 뺀다). 1MB보다 작으면 KB */
export function formatMegabytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/u, '')}MB`;
}

/** 1790544 → "1,790,544" */
export function formatWithCommas(value: number): string {
  return String(Math.trunc(value)).replace(/\B(?=(\d{3})+(?!\d))/gu, ',');
}

/** 4096 → "0x1000" */
export function formatOffset(offset: number): string {
  return `0x${offset.toString(16)}`;
}
