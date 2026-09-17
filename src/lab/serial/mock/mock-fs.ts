/**
 * 모의 MicroPython 보드의 파일 시스템(병렬 제작 준비 2026-09-17) — [보드에 저장](main.py)·라이브러리 올리기·파일 목록을 시험할 때 쓴다.
 * 경로는 보드 뿌리('/') 기준 글자로 둔다: 'main.py', 'lib/i2c_lcd.py'. 앞의 '/'와 './'는 떼고, 빈 폴더는 dirs에 따로 적는다.
 * 테스트 도구다(배포 번들에 들어가지 않음).
 */
import { toBytes, utf8 } from './bytes.ts';

export class MockFileSystem {
  readonly files = new Map<string, Uint8Array>();
  readonly dirs = new Set<string>();

  constructor(initial: Readonly<Record<string, string | Uint8Array>> = {}) {
    for (const [path, content] of Object.entries(initial)) {
      this.write(path, content);
    }
  }

  /** '/lib/a.py'·'./lib/a.py'·'lib//a.py' → 'lib/a.py'. 뿌리는 '' */
  static normalize(path: string): string {
    const parts: string[] = [];
    for (const part of String(path).replace(/\\/gu, '/').split('/')) {
      if (part === '' || part === '.') {
        continue;
      }
      if (part === '..') {
        parts.pop();
        continue;
      }
      parts.push(part);
    }
    return parts.join('/');
  }

  write(path: string, content: string | Uint8Array): void {
    const key = MockFileSystem.normalize(path);
    this.files.set(key, toBytes(content));
    const segments = key.split('/');
    for (let index = 1; index < segments.length; index += 1) {
      this.dirs.add(segments.slice(0, index).join('/'));
    }
  }

  append(path: string, content: string | Uint8Array): void {
    const key = MockFileSystem.normalize(path);
    const before = this.files.get(key) ?? new Uint8Array();
    const extra = toBytes(content);
    const next = new Uint8Array(before.length + extra.length);
    next.set(before, 0);
    next.set(extra, before.length);
    this.write(key, next);
  }

  read(path: string): Uint8Array | null {
    const found = this.files.get(MockFileSystem.normalize(path));
    return found ? new Uint8Array(found) : null;
  }

  readText(path: string): string | null {
    const found = this.read(path);
    return found ? utf8(found) : null;
  }

  exists(path: string): boolean {
    const key = MockFileSystem.normalize(path);
    return key === '' || this.files.has(key) || this.isDir(key);
  }

  isDir(path: string): boolean {
    const key = MockFileSystem.normalize(path);
    if (key === '' || this.dirs.has(key)) {
      return true;
    }
    return [...this.files.keys()].some((file) => file.startsWith(`${key}/`));
  }

  remove(path: string): boolean {
    return this.files.delete(MockFileSystem.normalize(path));
  }

  mkdir(path: string): boolean {
    const key = MockFileSystem.normalize(path);
    if (this.exists(key)) {
      return false;
    }
    this.dirs.add(key);
    return true;
  }

  rmdir(path: string): boolean {
    const key = MockFileSystem.normalize(path);
    if (!this.dirs.has(key) || this.list(key).length > 0) {
      return false;
    }
    this.dirs.delete(key);
    return true;
  }

  rename(from: string, to: string): boolean {
    const source = MockFileSystem.normalize(from);
    const data = this.files.get(source);
    if (!data) {
      return false;
    }
    this.files.delete(source);
    this.write(to, data);
    return true;
  }

  /** 폴더 바로 아래 이름(파일·폴더, 이름 순) */
  list(path = ''): string[] {
    const key = MockFileSystem.normalize(path);
    const prefix = key === '' ? '' : `${key}/`;
    const names = new Set<string>();
    for (const entry of [...this.files.keys(), ...this.dirs]) {
      if (!entry.startsWith(prefix) || entry === key) {
        continue;
      }
      const rest = entry.slice(prefix.length);
      if (rest !== '') {
        names.add(rest.split('/')[0]!);
      }
    }
    return [...names].sort();
  }

  /** 모든 파일 { 경로: 글자 } — 테스트 비교용 */
  snapshot(): Record<string, string> {
    return Object.fromEntries([...this.files.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([path, data]) => [path, utf8(data)]));
  }
}
