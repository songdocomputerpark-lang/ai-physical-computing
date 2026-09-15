// 단위 테스트용 임시 폴더 도구. 실제 저장소에는 파일을 만들지 않고 운영체제 임시 폴더만 쓴다.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** 새 임시 폴더를 만든다. */
export function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** { '저장소 기준 경로': 내용 } 모양으로 파일을 쓴다. */
export function writeFiles(rootDir: string, files: Record<string, string | Buffer>): void {
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(rootDir, ...relativePath.split('/'));
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content);
  }
}

/** 임시 폴더를 지운다. */
export function removeDir(rootDir: string): void {
  fs.rmSync(rootDir, { recursive: true, force: true });
}
