// 아주 작은 ZIP 읽기 도구(PLAN §8.0 PD-33 "원본 zip 멤버를 메모리에서 읽어") — 예제 이관 스크립트(scripts/lib/import-examples.mjs)가 쓴다.
//
// 외부 패키지 없이 Node.js 내장 zlib만 쓴다. 지원 범위는 자료의 zip에 필요한 만큼으로 좁혔다:
//   - 중앙 디렉터리(central directory)를 읽어 멤버 목록을 만든다(ZIP64·암호·분할 압축은 지원하지 않고 오류로 알린다).
//   - 압축 방식은 저장(0)과 deflate(8)만.
//   - 멤버 이름 글자 인코딩: 범용 비트 11(UTF-8 표시)이 켜져 있으면 UTF-8, 아니면 UTF-8로 엄격히 읽어 보고 실패하면 EUC-KR(CP949)로 읽는다.
//     자료 zip은 한국어 Windows에서 만든 것이라 이름이 CP949로 들어 있다(2026-09-16 중앙 디렉터리 확인: UTF-8 비트 꺼짐).
//     Node의 TextDecoder('euc-kr')는 WHATWG 규격대로 windows-949(CP949) 표를 쓴다.
//   - 폴더 항목(이름이 /로 끝남)은 목록에 남기되 isDirectory로 표시한다.
//
// 쓰는 법
//   const zip = openZip('교과서_소스코드/….zip');      // { entries: ZipEntry[], read(entry | name): Buffer }
//   const entry = zip.find('1. 영상 처리 인공지능/…/[고등] 1-1-2_기본 실습 코드(p17).py');
//   const bytes = zip.read(entry);

import fs from 'node:fs';
import zlib from 'node:zlib';

const CENTRAL_DIR_SIGNATURE = 0x02014b50;
const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const END_OF_CENTRAL_DIR_SIGNATURE = 0x06054b50;
const ZIP64_END_LOCATOR_SIGNATURE = 0x07064b50;
const FLAG_ENCRYPTED = 0x0001;
const FLAG_UTF8 = 0x0800;
const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;

/**
 * @typedef {object} ZipEntry
 * @property {string} name 멤버 이름(/ 구분, 폴더면 /로 끝남)
 * @property {boolean} isDirectory
 * @property {number} method 압축 방식(0 저장, 8 deflate)
 * @property {number} compressedSize
 * @property {number} uncompressedSize
 * @property {number} crc32
 * @property {number} localHeaderOffset
 * @property {boolean} utf8Flag 이름이 UTF-8이라고 표시돼 있는지
 * @property {'utf-8' | 'euc-kr'} nameEncoding 실제로 이름을 읽은 인코딩
 */

const strictUtf8 = new TextDecoder('utf-8', { fatal: true });
const eucKr = new TextDecoder('euc-kr');

/**
 * 멤버 이름 바이트를 글자로 바꾼다.
 * @param {Uint8Array} bytes
 * @param {boolean} utf8Flag
 * @returns {{ name: string, encoding: 'utf-8' | 'euc-kr' }}
 */
export function decodeZipName(bytes, utf8Flag) {
  if (utf8Flag) {
    return { name: new TextDecoder('utf-8').decode(bytes), encoding: 'utf-8' };
  }
  try {
    return { name: strictUtf8.decode(bytes), encoding: 'utf-8' };
  } catch {
    return { name: eucKr.decode(bytes), encoding: 'euc-kr' };
  }
}

/**
 * zip 파일 전체(Buffer)에서 멤버 목록을 읽는다.
 * @param {Buffer} buffer
 * @returns {ZipEntry[]}
 */
export function listZipEntries(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    throw new TypeError('zip 내용은 Buffer로 넘겨요.');
  }
  // 중앙 디렉터리 끝 기록(EOCD)은 파일 끝에서 22바이트 + 주석(최대 65,535바이트) 안에 있다.
  const minOffset = Math.max(0, buffer.length - 22 - 65_535);
  let eocd = -1;
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === END_OF_CENTRAL_DIR_SIGNATURE) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) {
    throw new Error('zip 파일이 아니거나 끝 기록(EOCD)이 없어요.');
  }
  if (eocd >= 20 && buffer.readUInt32LE(eocd - 20) === ZIP64_END_LOCATOR_SIGNATURE) {
    throw new Error('ZIP64 형식은 지원하지 않아요.');
  }
  const diskNumber = buffer.readUInt16LE(eocd + 4);
  const entryCount = buffer.readUInt16LE(eocd + 10);
  const centralDirSize = buffer.readUInt32LE(eocd + 12);
  const centralDirOffset = buffer.readUInt32LE(eocd + 16);
  if (diskNumber !== 0) {
    throw new Error('분할 압축(여러 디스크) zip은 지원하지 않아요.');
  }
  if (entryCount === 0xffff || centralDirSize === 0xffffffff || centralDirOffset === 0xffffffff) {
    throw new Error('ZIP64 형식은 지원하지 않아요.');
  }

  /** @type {ZipEntry[]} */
  const entries = [];
  let position = centralDirOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (position + 46 > buffer.length || buffer.readUInt32LE(position) !== CENTRAL_DIR_SIGNATURE) {
      throw new Error(`중앙 디렉터리의 ${index + 1}번째 항목이 깨져 있어요.`);
    }
    const flags = buffer.readUInt16LE(position + 8);
    const method = buffer.readUInt16LE(position + 10);
    const crc32 = buffer.readUInt32LE(position + 16);
    const compressedSize = buffer.readUInt32LE(position + 20);
    const uncompressedSize = buffer.readUInt32LE(position + 24);
    const nameLength = buffer.readUInt16LE(position + 28);
    const extraLength = buffer.readUInt16LE(position + 30);
    const commentLength = buffer.readUInt16LE(position + 32);
    const localHeaderOffset = buffer.readUInt32LE(position + 42);
    const nameBytes = buffer.subarray(position + 46, position + 46 + nameLength);
    const utf8Flag = (flags & FLAG_UTF8) !== 0;
    const { name, encoding } = decodeZipName(nameBytes, utf8Flag);
    if ((flags & FLAG_ENCRYPTED) !== 0) {
      throw new Error(`암호가 걸린 멤버(${name})는 지원하지 않아요.`);
    }
    entries.push({
      name,
      isDirectory: name.endsWith('/'),
      method,
      compressedSize,
      uncompressedSize,
      crc32,
      localHeaderOffset,
      utf8Flag,
      nameEncoding: encoding,
    });
    position += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/**
 * 멤버 하나의 내용을 메모리에서 푼다(CRC-32 검사 포함).
 * @param {Buffer} buffer zip 파일 전체
 * @param {ZipEntry} entry
 * @returns {Buffer}
 */
export function readZipEntry(buffer, entry) {
  const header = entry.localHeaderOffset;
  if (header + 30 > buffer.length || buffer.readUInt32LE(header) !== LOCAL_HEADER_SIGNATURE) {
    throw new Error(`멤버 "${entry.name}"의 로컬 헤더가 깨져 있어요.`);
  }
  // 로컬 헤더의 이름·추가 필드 길이는 중앙 디렉터리와 다를 수 있어 로컬 헤더 값을 쓴다.
  const nameLength = buffer.readUInt16LE(header + 26);
  const extraLength = buffer.readUInt16LE(header + 28);
  const dataStart = header + 30 + nameLength + extraLength;
  const compressed = buffer.subarray(dataStart, dataStart + entry.compressedSize);
  let data;
  if (entry.method === METHOD_STORED) {
    data = Buffer.from(compressed);
  } else if (entry.method === METHOD_DEFLATE) {
    data = zlib.inflateRawSync(compressed);
  } else {
    throw new Error(`멤버 "${entry.name}"의 압축 방식(${entry.method})은 지원하지 않아요(저장·deflate만).`);
  }
  if (data.length !== entry.uncompressedSize) {
    throw new Error(`멤버 "${entry.name}"의 크기가 기록(${entry.uncompressedSize})과 달라요(${data.length}).`);
  }
  const crc = zlib.crc32(data);
  if (crc !== entry.crc32) {
    throw new Error(`멤버 "${entry.name}"의 CRC-32가 맞지 않아요(파일이 깨졌을 수 있어요).`);
  }
  return data;
}

/**
 * zip 파일을 열어 멤버 목록과 읽기 함수를 돌려준다.
 * @param {string} filePath
 */
export function openZip(filePath) {
  const buffer = fs.readFileSync(filePath);
  const entries = listZipEntries(buffer);
  const byName = new Map(entries.map((entry) => [entry.name, entry]));
  return {
    path: filePath,
    entries,
    /** @param {string} name */
    find(name) {
      return byName.get(name) ?? null;
    },
    /** @param {ZipEntry | string} entryOrName */
    read(entryOrName) {
      const entry = typeof entryOrName === 'string' ? byName.get(entryOrName) : entryOrName;
      if (!entry) {
        throw new Error(`zip에 "${String(entryOrName)}" 멤버가 없어요.`);
      }
      return readZipEntry(buffer, entry);
    },
  };
}

/**
 * 테스트·도구용: 멤버 목록으로 zip 파일 바이트를 만든다(저장 또는 deflate, 이름은 UTF-8 표시 켬).
 * 실제 자료 zip을 흉내 내려고 utf8Flag를 끄고 CP949 이름을 넣을 수도 있다(nameBytes로 직접 지정).
 * @param {{ name: string, data: Buffer | string, method?: 0 | 8, nameBytes?: Buffer, utf8Flag?: boolean }[]} members
 * @returns {Buffer}
 */
export function buildZip(members) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const member of members) {
    const data = Buffer.isBuffer(member.data) ? member.data : Buffer.from(member.data, 'utf8');
    const method = member.method ?? METHOD_DEFLATE;
    const compressed = method === METHOD_DEFLATE ? zlib.deflateRawSync(data) : data;
    const nameBytes = member.nameBytes ?? Buffer.from(member.name, 'utf8');
    const utf8Flag = member.utf8Flag ?? !member.nameBytes;
    const flags = utf8Flag ? FLAG_UTF8 : 0;
    const crc = zlib.crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_HEADER_SIGNATURE, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, nameBytes, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL_DIR_SIGNATURE, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBytes);

    offset += local.length + nameBytes.length + compressed.length;
  }
  const centralDir = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(END_OF_CENTRAL_DIR_SIGNATURE, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(members.length, 8);
  eocd.writeUInt16LE(members.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDir, eocd]);
}
