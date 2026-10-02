// 학생·교사가 보는 글의 브라우저 지원 문장 — "컴퓨터용 Chrome·Edge에만 있어요"처럼 특정 브라우저만 된다고 못박는 말을 찾는다(DECISIONS C78).
// 2026-10-02 최종 전수 점검 3바퀴 ST3-01: 교사용 시작하기가 "실제 보드와 블루투스로 잇는 기능은 컴퓨터용 Chrome·Edge에만 있고"라고 했는데
// Web Bluetooth는 안드로이드 Chrome에도 있어(MDN browser-compat-data api/Bluetooth.json — chrome_android 56, 2026-10-02 확인) 사이트 자체
// 판정(점검 페이지 "Web Bluetooth(블루투스)" 줄)·오류 사전과 어긋났다. 2바퀴(판 1.1.3)가 Web Serial 문장의 "에서만"을 고칠 때 이 줄이 빠졌다.
// 규칙: 브라우저 지원은 기준 브라우저(컴퓨터용 Chrome·Edge)와 점검 페이지 줄로 말하고, 브라우저 이름 바로 뒤에 "에만"·"에서만"을 쓰지 않는다.
// 브라우저 묶음 전체를 말하는 문장("크롬 계열 브라우저에만")은 특정 기기·판을 빼지 않으므로 보지 않는다 — Web Bluetooth가 있는 브라우저는
// 모두 크롬 계열이다(같은 MDN 자료). 그런 글이 있는 곳은 MAINTENANCE.md 11절 5번(연 1회 점검 — 브라우저 지원)이 해마다 본다.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const rootDir = path.resolve(import.meta.dirname, '..', '..', '..');

/** 브라우저 이름 뒤 20글자 안(문장 안)에 "에만"·"에서만" */
const EXCLUSIVE_BROWSER = /(?:Chrome|Edge|크롬|엣지)(?!\s*계열)[^.\n]{0,20}(?:에만|에서만)/gu;

/** 뿌리 기준 경로로, dir 아래에서 이름이 pattern에 맞는 파일 */
function filesUnder(dir: string, pattern: RegExp): string[] {
  const full = path.join(rootDir, dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) return filesUnder(relative, pattern);
    return pattern.test(entry.name) ? [relative] : [];
  });
}

describe('브라우저 지원 문장 — 특정 브라우저에만 된다고 못박지 않는다(C78)', () => {
  const files = [...filesUnder('src', /\.astro$/u), ...filesUnder('content', /\.(?:md|yaml)$/u)];

  it('학생·교사가 보는 .astro·차시·데이터 파일을 읽는다(훑은 파일이 없으면 거짓 통과)', () => {
    expect(files).toContain('src/pages/start/teacher/index.astro');
    expect(files).toContain('content/help/errors/errors.yaml');
    expect(files.length).toBeGreaterThan(100);
  });

  it('브라우저 이름 바로 뒤에 "에만"·"에서만"이 없다', () => {
    const found = files.flatMap((file) => {
      const text = fs.readFileSync(path.join(rootDir, file), 'utf8');
      return text.split('\n').flatMap((line, index) =>
        [...line.matchAll(EXCLUSIVE_BROWSER)].map((match) => `${file}:${index + 1}: …${match[0]}…`),
      );
    });
    expect(found, '기준 브라우저(컴퓨터용 Chrome·Edge)와 점검 페이지 줄로 말해요 — DECISIONS C78, MAINTENANCE.md 11절 5번').toEqual([]);
  });

  it('규칙이 고친 문장의 옛 모양과 2바퀴의 옛 모양을 잡는다(검사 자체 확인)', () => {
    const catches = (text: string) => [...text.matchAll(EXCLUSIVE_BROWSER)].length > 0;
    expect(catches('실제 보드와 블루투스로 잇는 기능은 컴퓨터용 Chrome·Edge에만 있고(아이폰·아이패드·파이어폭스는 없음)')).toBe(true);
    expect(catches('USB 보드 연결(Web Serial)은 컴퓨터용 Chrome·Edge(그리고 Firefox 151 이후)에서만 돼요.')).toBe(true);
    expect(catches('실제 보드와 블루투스로 잇는 기능은 기준 브라우저(컴퓨터용 Chrome·Edge)에서 돼요.')).toBe(false);
    expect(catches('실제 보드와 블루투스로 잇는 기능(Web Bluetooth)은 크롬 계열 브라우저에만 있어요.')).toBe(false);
  });
});
