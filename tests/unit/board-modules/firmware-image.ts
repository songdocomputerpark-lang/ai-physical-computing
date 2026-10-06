/**
 * MicroPython ESP32 펌웨어 묶음(.bin — 플래시 0x1000부터 굽는 파일)을 읽어 "그 펌웨어에서 import되는 모듈 표"를 푸는 시험 도구(미해결 222, 2026-10-06).
 * 실물 보드 없이 운영자 할 일 2(Thonny `help('modules')`)와 같은 목록을 얻으려고 만들었다 — 읽기만 하고 아무것도 실행하지 않는다.
 *
 * 푸는 차례(MicroPython v1.29.0 소스로 확인한 자료 모양 — py/qstr.h·py/obj.h·py/objmodule.c, ESP-IDF 앱 이미지 형식):
 *   1. 파티션 표(플래시 0x8000, 항목 32바이트·머리 0x50AA)에서 앱 파티션 → 앱 이미지 머리(0xE9, 세그먼트 수, 24바이트 머리) → 세그먼트(적재 주소·길이)
 *   2. 읽기 전용 데이터(DROM 0x3F400000~)와 초기값 데이터(DRAM 0x3FFB0000~) 세그먼트에서 qstr 풀 사슬:
 *      qstr_pool_t { prev, total_prev_len:31|is_sorted:1, alloc, len, hashes, lengths(1바이트), qstrs[len] } — 첫 풀은 prev 0·total 0,
 *      다음 풀은 prev = 앞 풀 주소·total = 앞 풀 total + len. 모든 글자의 길이가 lengths 표와 같아야 풀로 인정한다.
 *   3. mp_type_module: 타입 객체 { base(=mp_type_type), flags u16, name u16 } 가운데 name이 qstr "module"이고 base의 name이 "type"인 것
 *   4. 모듈 표: mp_map_t { used<<3 | is_ordered<<2 | is_fixed<<1 | all_keys_are_qstrs, alloc, table } 가운데 키가 모두 qstr(id<<3 | 2)이고
 *      값이 모두 mp_type_module 객체인 표 — `builtins`가 든 표가 mp_builtin_module_table(확장 불가), 나머지 가운데 가장 큰 표가
 *      mp_builtin_extensible_module_table(확장 가능 — u-이름이 되는 모듈)
 *   5. 얼린 모듈 이름 mp_frozen_names: NUL로 나뉜 "이름.py" 줄(빈 글자로 끝남) — 모든 이름이 qstr 풀에도 있어야 한다
 */

export interface FirmwareModuleTables {
  /** 확장할 수 없는 붙박이 모듈(MP_REGISTER_MODULE) — 이름 순 */
  readonly builtin: readonly string[];
  /** 확장할 수 있는 붙박이 모듈(MP_REGISTER_EXTENSIBLE_MODULE) — 이름 순 */
  readonly extensible: readonly string[];
  /** 얼린 파일 이름(asyncio/core.py …) — 펌웨어 안의 차례 그대로 */
  readonly frozenFiles: readonly string[];
  /** qstr 풀 사슬의 글자 수 */
  readonly qstrCount: number;
  /** 풀 개수 */
  readonly poolCount: number;
}

interface Segment {
  readonly addr: number;
  readonly length: number;
  readonly fileOffset: number;
}

const APP_IMAGE_MAGIC = 0xe9;
const PARTITION_MAGIC = 0x50aa;
const DROM_START = 0x3f400000;
const DROM_END = 0x3f800000;
const DRAM_START = 0x3ffb0000;
const DRAM_END = 0x40000000;
const FROZEN_FILE_PATTERN = /^[A-Za-z_]\w*(?:\/[A-Za-z_]\w*)*\.(?:py|mpy)$/u;

class ImageReader {
  readonly bin: Buffer;
  readonly segments: Segment[];

  constructor(bin: Buffer, segments: Segment[]) {
    this.bin = bin;
    this.segments = segments;
  }

  fileOf(addr: number): number {
    for (const segment of this.segments) {
      if (addr >= segment.addr && addr < segment.addr + segment.length) {
        return segment.fileOffset + (addr - segment.addr);
      }
    }
    return -1;
  }

  has(addr: number, bytes = 4): boolean {
    const at = this.fileOf(addr);
    return at >= 0 && this.fileOf(addr + bytes - 1) >= 0;
  }

  u32(addr: number): number | null {
    return this.has(addr, 4) ? this.bin.readUInt32LE(this.fileOf(addr)) : null;
  }

  u16(addr: number): number | null {
    return this.has(addr, 2) ? this.bin.readUInt16LE(this.fileOf(addr)) : null;
  }

  u8(addr: number): number | null {
    return this.has(addr, 1) ? this.bin[this.fileOf(addr)]! : null;
  }

  /** NUL로 끝나는 바이트 줄(latin1 — 바이트 수 = 글자 수, qstr 길이 표와 맞춰 본다). max 바이트 안에 NUL이 없으면 null */
  cstring(addr: number, max = 512): string | null {
    const start = this.fileOf(addr);
    if (start < 0) return null;
    const end = this.bin.indexOf(0, start);
    return end >= 0 && end - start <= max ? this.bin.toString('latin1', start, end) : null;
  }
}

function readSegments(bin: Buffer, flashBase: number): Segment[] {
  const at = (flash: number) => flash - flashBase;
  // 파티션 표에서 첫 앱 파티션(type 0)
  let appOffset = -1;
  for (let index = 0; index < 96; index += 1) {
    const entry = at(0x8000) + index * 32;
    if (entry + 32 > bin.length || bin.readUInt16LE(entry) !== PARTITION_MAGIC) break;
    if (bin[entry + 2] === 0) {
      appOffset = bin.readUInt32LE(entry + 4);
      break;
    }
  }
  if (appOffset < 0) throw new Error('파티션 표에서 앱 파티션을 찾지 못했어요.');
  const image = at(appOffset);
  if (bin[image] !== APP_IMAGE_MAGIC) throw new Error(`앱 이미지 머리(0xE9)가 아니에요: 0x${(bin[image] ?? 0).toString(16)}`);
  const count = bin[image + 1]!;
  const segments: Segment[] = [];
  let cursor = image + 24;
  for (let index = 0; index < count; index += 1) {
    const addr = bin.readUInt32LE(cursor);
    const length = bin.readUInt32LE(cursor + 4);
    const data = cursor + 8;
    if ((addr >= DROM_START && addr < DROM_END) || (addr >= DRAM_START && addr < DRAM_END)) {
      segments.push({ addr, length, fileOffset: data });
    }
    cursor = data + length;
  }
  if (!segments.some((segment) => segment.addr >= DROM_START && segment.addr < DROM_END)) {
    throw new Error('읽기 전용 데이터(DROM) 세그먼트가 없어요.');
  }
  return segments;
}

interface Pool {
  readonly addr: number;
  readonly totalPrev: number;
  readonly strings: string[];
}

/** addr에 qstr 풀이 있으면 읽는다(모든 글자 길이가 길이 표와 같을 때만) */
function readPool(reader: ImageReader, addr: number, expectedPrev: number, expectedTotal: number): Pool | null {
  const prev = reader.u32(addr);
  const packed = reader.u32(addr + 4);
  const alloc = reader.u32(addr + 8);
  const length = reader.u32(addr + 12);
  const lengths = reader.u32(addr + 20);
  if (prev !== expectedPrev || packed === null || alloc === null || length === null || lengths === null) return null;
  if ((packed & 0x7fffffff) !== expectedTotal || length < 16 || length > 20_000 || alloc > 1_000_000) return null;
  if (!reader.has(lengths, length) || !reader.has(addr + 24, length * 4)) return null;
  const strings: string[] = [];
  for (let index = 0; index < length; index += 1) {
    const pointer = reader.u32(addr + 24 + 4 * index);
    const text = pointer === null ? null : reader.cstring(pointer, 256);
    if (text === null || text.length !== reader.u8(lengths + index)) return null;
    strings.push(text);
  }
  return { addr, totalPrev: expectedTotal, strings };
}

/** 세그먼트 안의 4바이트 정렬 주소 전부 */
function alignedAddresses(reader: ImageReader, tail: number): number[] {
  const list: number[] = [];
  for (const segment of reader.segments) {
    for (let addr = Math.ceil(segment.addr / 4) * 4; addr + tail <= segment.addr + segment.length; addr += 4) list.push(addr);
  }
  return list;
}

function readQstrChain(reader: ImageReader, candidates: readonly number[]): Pool[] {
  const find = (prev: number, total: number): Pool | null => {
    for (const addr of candidates) {
      if (reader.u32(addr) !== prev || ((reader.u32(addr + 4) ?? -1) & 0x7fffffff) !== total) continue;
      const pool = readPool(reader, addr, prev, total);
      if (pool) return pool;
    }
    return null;
  };
  const first = find(0, 0);
  if (!first) throw new Error('첫 qstr 풀을 찾지 못했어요.');
  const chain = [first];
  for (;;) {
    const last = chain[chain.length - 1]!;
    const next = find(last.addr, last.totalPrev + last.strings.length);
    if (!next) break;
    chain.push(next);
  }
  return chain;
}

/** 펌웨어 묶음(.bin)에서 모듈 표를 푼다. flashBase는 그 파일을 굽는 플래시 주소(ESP32 = 0x1000) */
export function readFirmwareModuleTables(bin: Buffer, flashBase = 0x1000): FirmwareModuleTables {
  const reader = new ImageReader(bin, readSegments(bin, flashBase));
  const words = alignedAddresses(reader, 12);
  const pools = readQstrChain(reader, words);
  const qstrs = pools.flatMap((pool) => pool.strings);
  const idOf = (text: string) => qstrs.indexOf(text);
  const qstrOf = (word: number | null) => (word !== null && (word & 7) === 2 && word >>> 3 < qstrs.length ? qstrs[word >>> 3]! : null);

  // mp_type_module: name이 "module"이고 base 타입의 name이 "type"인 타입 객체
  const moduleId = idOf('module');
  const typeId = idOf('type');
  if (moduleId < 0 || typeId < 0) throw new Error('qstr "module"·"type"이 없어요.');
  const moduleTypes = words.filter((addr) => {
    if (reader.u16(addr + 6) !== moduleId) return false;
    const base = reader.u32(addr);
    return base !== null && reader.has(base, 8) && reader.u16(base + 6) === typeId;
  });
  if (moduleTypes.length !== 1) throw new Error(`mp_type_module 후보가 ${moduleTypes.length}개예요.`);
  const moduleType = moduleTypes[0]!;

  // 모든 항목이 (qstr 키, 모듈 객체)인 고정 사전
  const tables: string[][] = [];
  for (const addr of words) {
    const bits = reader.u32(addr);
    if (bits === null || (bits & 7) !== 7) continue;
    const used = bits >>> 3;
    if (used < 1 || used > 400 || reader.u32(addr + 4) !== used) continue;
    const table = reader.u32(addr + 8);
    if (table === null || !reader.has(table, used * 8)) continue;
    const names: string[] = [];
    for (let index = 0; index < used; index += 1) {
      const name = qstrOf(reader.u32(table + 8 * index));
      const value = reader.u32(table + 8 * index + 4);
      if (name === null || value === null || !reader.has(value, 4) || reader.u32(value) !== moduleType) break;
      names.push(name);
    }
    if (names.length === used) tables.push(names);
  }
  const builtinTables = tables.filter((names) => names.includes('builtins') && names.includes('__main__'));
  if (builtinTables.length !== 1) throw new Error(`붙박이 모듈 표(builtins·__main__)가 ${builtinTables.length}개예요.`);
  const builtin = builtinTables[0]!;
  const others = tables.filter((names) => names !== builtin).sort((a, b) => b.length - a.length);
  const extensible = others[0] ?? [];

  // 얼린 모듈 이름 표: NUL로 나뉜 파일 이름 줄 — 첫 이름 앞의 바이트가 이름 글자처럼 보일 수 있어 qstr 풀에 있는 가장 긴 꼬리를 쓴다
  const qstrSet = new Set(qstrs);
  let best: string[] = [];
  for (const segment of reader.segments) {
    const start = segment.fileOffset;
    const end = segment.fileOffset + segment.length;
    let cursor = start;
    while (cursor < end) {
      const zero = bin.indexOf(0, cursor);
      if (zero < 0 || zero >= end) break;
      // 이름 꼴(.py·.mpy로 끝남)인 조각만 — 앞의 바이트가 이름 글자처럼 보일 수 있어 끝에서 128자 안의 꼬리 가운데 qstr인 가장 긴 것
      const raw = bin.toString('latin1', Math.max(cursor, zero - 128), zero);
      let first: string | null = null;
      if (raw.endsWith('.py') || raw.endsWith('.mpy')) {
        for (let cut = 0; cut < raw.length; cut += 1) {
          const tail = raw.slice(cut);
          if (FROZEN_FILE_PATTERN.test(tail) && qstrSet.has(tail)) {
            first = tail;
            break;
          }
        }
      }
      if (first === null) {
        cursor = zero + 1;
        continue;
      }
      const names = [first];
      let next = zero + 1;
      let terminated = false;
      for (;;) {
        const nul = bin.indexOf(0, next);
        if (nul < 0 || nul >= end) break;
        if (nul === next) {
          terminated = true; // 빈 글자 = 표의 끝(mp_frozen_names는 "\0"으로 끝난다 — 이름 꼴 qstr이 나란히 놓인 풀 조각과 가른다)
          break;
        }
        const name = bin.toString('latin1', next, nul);
        if (!FROZEN_FILE_PATTERN.test(name) || !qstrSet.has(name)) break;
        names.push(name);
        next = nul + 1;
      }
      if (terminated && names.length > best.length) best = names;
      cursor = Math.max(zero + 1, next);
    }
  }

  return {
    builtin: [...builtin].sort(),
    extensible: [...extensible].sort(),
    frozenFiles: best,
    qstrCount: qstrs.length,
    poolCount: pools.length,
  };
}

/** 얼린 파일 이름 → 맨 앞 모듈 이름(asyncio/core.py → asyncio, dht.py → dht) */
export function frozenTopLevelNames(files: readonly string[]): string[] {
  return [...new Set(files.map((file) => file.replace(/\.(?:py|mpy)$/u, '').split('/')[0]!))].sort();
}

/** 얼린 꾸러미의 하위 모듈(점 이름, __init__ 빼고): asyncio/core.py → asyncio.core */
export function frozenSubmoduleNames(files: readonly string[]): string[] {
  return files
    .map((file) => file.replace(/\.(?:py|mpy)$/u, ''))
    .filter((name) => name.includes('/') && !name.endsWith('/__init__'))
    .map((name) => name.replace(/\//gu, '.'))
    .sort();
}
