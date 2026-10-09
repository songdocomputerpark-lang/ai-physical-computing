// 개인정보·저장 안내의 "본 차시·끝낸 차시 표시" 문장(판 1.3.0) — 한 곳(src/config/privacy-text.ts)에서 적어 네 곳이 같은 말을 하게 한다.
// 진도 저장(src/lib/progress.ts)이 실제로 저장하는 것과 문장이 어긋나지 않는지, 네 곳이 모두 그 문장을 쓰는지 지킨다.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROGRESS_PRIVACY_NOTE } from '../../src/config/privacy-text.ts';
import { emptyProgress, sanitizeProgress } from '../../src/lib/progress.ts';

const root = path.resolve(import.meta.dirname, '..', '..');
const read = (file: string): string => fs.readFileSync(path.join(root, file), 'utf8');

/** 문장을 싣는 네 곳 — 문제 해결·교사용 자료실 첫 화면·교사용 시작하기·설정(파일, 그 파일에서 본 config 상대 경로) */
const PLACES = [
  ['src/pages/help/index.astro', '../../config/privacy-text.ts'],
  ['src/pages/teacher/index.astro', '../../config/privacy-text.ts'],
  ['src/pages/start/teacher/index.astro', '../../../config/privacy-text.ts'],
  ['src/pages/settings/index.astro', '../../config/privacy-text.ts'],
] as const;

describe('진도 개인정보 문장', () => {
  it('"본 차시·끝낸 차시 표시"가 이 브라우저에만 남는다고, 무엇이 남는지 말한다', () => {
    expect(PROGRESS_PRIVACY_NOTE).toContain('본 차시·끝낸 차시 표시');
    expect(PROGRESS_PRIVACY_NOTE).toContain('이 브라우저에만');
    expect(PROGRESS_PRIVACY_NOTE).toContain('차시 번호');
    expect(PROGRESS_PRIVACY_NOTE).toContain('시각');
  });

  it('두 문장이고, 대괄호 단추 이름([이 컴퓨터에서 내 기록 지우기])을 되풀이하지 않는다(교사용 시작하기 e2e의 getByText가 하나만 찾는다)', () => {
    const sentences = PROGRESS_PRIVACY_NOTE.split(/(?<=요\.)\s+/u).filter(Boolean);
    expect(sentences).toHaveLength(2);
    expect(PROGRESS_PRIVACY_NOTE).not.toContain('[');
  });

  it('네 곳이 모두 상수를 불러와 쓴다', () => {
    for (const [file, importPath] of PLACES) {
      const text = read(file);
      expect(text, file).toContain(`from '${importPath}'`);
      expect(text, file).toContain('{PROGRESS_PRIVACY_NOTE}');
    }
  });

  it('진도가 저장하는 것은 차시 번호·제목·주소·시각과 마지막 실습실뿐이다(개인정보 문장의 근거)', () => {
    const state = sanitizeProgress({
      version: 1,
      seen: ['u1/1-1-1'],
      done: [],
      last: { id: 'u1/1-1-1', href: '/x/', label: '1-1-1', title: '제목', at: 1, name: '아무개', score: 100 },
      lastLab: { path: '/x/labs/vision/', title: '영상처리 실습실', at: 2, memo: '개인 메모' },
      name: '아무개',
    });
    expect(Object.keys(state).sort()).toEqual(['done', 'last', 'lastLab', 'seen', 'version']);
    expect(Object.keys(state.last ?? {}).sort()).toEqual(['at', 'href', 'id', 'label', 'title']);
    expect(Object.keys(state.lastLab ?? {}).sort()).toEqual(['at', 'path', 'title']);
    expect(Object.keys(emptyProgress()).sort()).toEqual(['done', 'last', 'lastLab', 'seen', 'version']);
  });
});
