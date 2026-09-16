/**
 * 시험용 "진짜 글꼴 파일" 찾기(P2-10 러너 공통 테스트 전용).
 *
 * 글꼴 경로 연결(PIL.ImageFont.truetype)이 되는지 보려면 FreeType이 실제로 열 수 있는 .ttf/.otf 파일이 필요한데,
 * 저장소에 글꼴 바이너리를 넣지 않으려고(사이트에 넣을 한글 글꼴은 .cache/phase2-requests/runner.md 1번 요청) 이미 설치된
 * playwright-core의 codicon 아이콘 글꼴(MIT)을 **테스트에서만** 쓴다. 한글 글리프는 없지만 "없는 경로 → 사이트 글꼴 파일로 연결"이
 * 되는지 검사하는 데는 충분하다. 파일이 없으면 null을 돌려주고, 부르는 쪽은 그 검사만 건너뛴다(CI에는 Playwright가 설치되어 있다).
 */
import fs from 'node:fs';
import path from 'node:path';

const FONT_NAME = /^codicon.*\.ttf$/u;

function findIn(dir: string, depth: number): string | null {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (entry.isFile() && FONT_NAME.test(entry.name)) {
      return path.join(dir, entry.name);
    }
  }
  if (depth <= 0) {
    return null;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const found = findIn(path.join(dir, entry.name), depth - 1);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

/** 시험용 글꼴 파일의 전체 경로(없으면 null) */
export function findTestFontFile(root: string = process.cwd()): string | null {
  return findIn(path.join(root, 'node_modules', 'playwright-core', 'lib', 'vite'), 3);
}
