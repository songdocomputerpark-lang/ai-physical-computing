// 오프라인 배포판 zip 쓰기 도구(PLAN §5.6, P6-07) — scripts/build-offline.mjs가 쓴다.
//
// 바깥 패키지 없이 Node.js 내장 zlib(deflateRawSync·crc32)만 써서 파일에 차례로 적는다(수백 MB도 메모리에 모으지 않는다).
// 지원 범위는 오프라인판에 필요한 만큼:
//   - 저장(0)·deflate(8). 이미 압축된 형식(휠·zip·woff2·webp·png·pdf·모델 등)은 저장, 나머지는 deflate(더 커지면 저장).
//   - 이름은 UTF-8로 적고 범용 비트 11(UTF-8 표시)을 켠다 — "시작하기.bat"·"읽어보세요.txt"가 Windows 탐색기·Expand-Archive·
//     tar에서 그대로 풀리는 것을 2026-09-26 한국어 Windows 11(코드 페이지 949)에서 확인했다(Shell.Application CopyHere 포함).
//   - "만든 곳"을 Unix(3)로 적고 외부 속성에 권한(파일 0644, 실행 파일 0755, 폴더 0755)을 넣는다 — macOS·Linux의 unzip이
//     server/serve.py 실행 권한을 살린다. 폴더 항목에는 MS-DOS 폴더 비트(0x10)도 켠다.
//   - 시각은 MS-DOS 날짜·시간(2초 단위, 이 컴퓨터의 지역 시각).
//   - ZIP64는 쓰지 않는다: 항목 65,535개·파일 하나와 전체 4GiB를 넘으면 오류로 멈춘다(오프라인판은 약 700개·100MB대).
// 읽기(검사)는 scripts/lib/zip-read.mjs(예제 이관 도구가 쓰는 읽기 도구)로 한다 — 단위 테스트 tests/unit/offline/zip.test.ts.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_DIR_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIR_SIGNATURE = 0x06054b50;
const FLAG_UTF8 = 0x0800;
const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;
/** 만든 곳: Unix(3), 규격 판 2.0 */
const VERSION_MADE_BY = (3 << 8) | 20;
const VERSION_NEEDED = 20;
const MAX_UINT32 = 0xffffffff;
const MAX_ENTRIES = 0xffff;
const MSDOS_DIRECTORY = 0x10;
const UNIX_FILE = 0o100000;
const UNIX_DIRECTORY = 0o040000;

/** 이미 압축돼 있어 deflate해도 거의 줄지 않는 확장자(저장으로 넣어 시간을 아낀다) */
export const STORED_EXTENSIONS = new Set([
  '.whl',
  '.zip',
  '.woff2',
  '.woff',
  '.webp',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.avif',
  '.pdf',
  '.task',
  '.mp3',
  '.ogg',
  '.gz',
  '.br',
]);

/**
 * 이름으로 압축 방식을 고른다(저장할 형식이면 0, 아니면 8).
 * @param {string} name
 * @returns {0 | 8}
 */
export function methodFor(name) {
  return STORED_EXTENSIONS.has(path.posix.extname(name).toLowerCase()) ? METHOD_STORED : METHOD_DEFLATE;
}

/**
 * Date → MS-DOS 날짜·시간(지역 시각, 2초 단위). 1980년 앞은 1980-01-01로 올린다.
 * @param {Date} date
 * @returns {{ time: number, date: number }}
 */
export function dosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  return { time: dosTime & 0xffff, date: dosDate & 0xffff };
}

/**
 * zip 안 이름 규칙: / 구분, 앞에 /·드라이브·.. 없음(푸는 쪽이 폴더 밖에 쓰지 않게).
 * @param {string} name
 */
export function assertSafeEntryName(name) {
  if (name === '' || name.startsWith('/') || name.includes('\\') || /^[a-z]:/iu.test(name) || name.split('/').some((part) => part === '..')) {
    throw new Error(`zip 안 이름 "${name}"은(는) 쓸 수 없어요(/로 구분한 상대 경로만).`);
  }
}

/**
 * 파일에 차례로 적는 zip 쓰기 도구.
 *   const zip = new ZipWriter('out.zip', { date: new Date() });
 *   zip.addDirectory('top/');
 *   zip.addFile('top/a.txt', Buffer.from('안녕'));
 *   zip.addFile('top/server/serve.py', data, { executable: true });
 *   const summary = zip.close(); // { entries, files, bytes, uncompressedBytes }
 */
export class ZipWriter {
  /**
   * @param {string} filePath
   * @param {{ date?: Date }} [options]
   */
  constructor(filePath, options = {}) {
    this.filePath = filePath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    this.fd = fs.openSync(filePath, 'w');
    this.offset = 0;
    /** @type {Buffer[]} */
    this.central = [];
    this.entries = 0;
    this.files = 0;
    this.uncompressedBytes = 0;
    this.names = new Set();
    this.stamp = dosDateTime(options.date ?? new Date());
    this.closed = false;
  }

  /** @param {Buffer} buffer */
  #write(buffer) {
    let written = 0;
    while (written < buffer.length) {
      written += fs.writeSync(this.fd, buffer, written, buffer.length - written);
    }
    this.offset += buffer.length;
    if (this.offset > MAX_UINT32) {
      throw new Error('zip이 4GiB를 넘었어요(ZIP64는 지원하지 않아요).');
    }
  }

  /**
   * @param {string} name
   * @param {Buffer} data
   * @param {{ method?: 0 | 8, directory?: boolean, executable?: boolean }} [options]
   */
  #add(name, data, options = {}) {
    if (this.closed) {
      throw new Error('이미 닫은 zip이에요.');
    }
    assertSafeEntryName(name);
    if (this.names.has(name)) {
      throw new Error(`zip에 같은 이름이 두 번 들어가요: ${name}`);
    }
    if (this.entries + 1 > MAX_ENTRIES) {
      throw new Error('zip 항목이 65,535개를 넘었어요(ZIP64는 지원하지 않아요).');
    }
    if (data.length > MAX_UINT32) {
      throw new Error(`${name}이(가) 4GiB를 넘어요(ZIP64는 지원하지 않아요).`);
    }
    this.names.add(name);
    const directory = options.directory === true;
    const nameBytes = Buffer.from(name, 'utf8');
    const crc = directory ? 0 : zlib.crc32(data);
    let method = directory ? METHOD_STORED : (options.method ?? methodFor(name));
    let body = data;
    if (method === METHOD_DEFLATE) {
      const deflated = zlib.deflateRawSync(data, { level: 9 });
      if (deflated.length < data.length) {
        body = deflated;
      } else {
        method = METHOD_STORED;
      }
    }
    const headerOffset = this.offset;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_HEADER_SIGNATURE, 0);
    local.writeUInt16LE(VERSION_NEEDED, 4);
    local.writeUInt16LE(FLAG_UTF8, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(this.stamp.time, 10);
    local.writeUInt16LE(this.stamp.date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    this.#write(local);
    this.#write(nameBytes);
    if (body.length > 0) {
      this.#write(body);
    }

    const unixMode = directory ? UNIX_DIRECTORY | 0o755 : UNIX_FILE | (options.executable ? 0o755 : 0o644);
    const external = ((unixMode << 16) >>> 0) | (directory ? MSDOS_DIRECTORY : 0);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL_DIR_SIGNATURE, 0);
    central.writeUInt16LE(VERSION_MADE_BY, 4);
    central.writeUInt16LE(VERSION_NEEDED, 6);
    central.writeUInt16LE(FLAG_UTF8, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(this.stamp.time, 12);
    central.writeUInt16LE(this.stamp.date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(external >>> 0, 38);
    central.writeUInt32LE(headerOffset, 42);
    this.central.push(central, nameBytes);
    this.entries += 1;
    if (!directory) {
      this.files += 1;
      this.uncompressedBytes += data.length;
    }
  }

  /** 폴더 항목(이름 끝에 /) */
  addDirectory(name) {
    this.#add(name.endsWith('/') ? name : `${name}/`, Buffer.alloc(0), { directory: true });
  }

  /**
   * @param {string} name
   * @param {Buffer | string} data 글이면 UTF-8로 적는다
   * @param {{ method?: 0 | 8, executable?: boolean }} [options]
   */
  addFile(name, data, options = {}) {
    this.#add(name, Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8'), options);
  }

  /** 중앙 디렉터리와 끝 기록을 적고 파일을 닫는다. */
  close() {
    if (this.closed) {
      throw new Error('이미 닫은 zip이에요.');
    }
    const centralOffset = this.offset;
    const centralDir = Buffer.concat(this.central);
    this.#write(centralDir);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(END_OF_CENTRAL_DIR_SIGNATURE, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(this.entries, 8);
    eocd.writeUInt16LE(this.entries, 10);
    eocd.writeUInt32LE(centralDir.length, 12);
    eocd.writeUInt32LE(centralOffset, 16);
    eocd.writeUInt16LE(0, 20);
    this.#write(eocd);
    fs.closeSync(this.fd);
    this.closed = true;
    return { entries: this.entries, files: this.files, bytes: this.offset, uncompressedBytes: this.uncompressedBytes };
  }

  /** 오류가 났을 때 열린 파일을 닫고 반쯤 쓴 zip을 지운다. */
  abort() {
    if (!this.closed) {
      try {
        fs.closeSync(this.fd);
      } catch {
        // 이미 닫힘
      }
      this.closed = true;
    }
    fs.rmSync(this.filePath, { force: true });
  }
}
