// 판 1.8.0(DECISIONS C234): 원본(교과서·교안) 코드와 달라진 예제와 차시가 그 사실을 고친 날과 함께 보이는지.
// - 이관 목록(scripts/examples-manifest.yaml)에 rewritten이 적힌 예제는 사이드카에 revised(날짜·판·한 줄)가 있어야 한다 → 실습실 설명 아래 줄.
// - 그 예제를 싣는 차시는 frontmatter revisions가 있어야 한다 → 차시 위 "교과서와 다른 곳" 상자.
// - 진짜 PC 판 번호를 확인한 날은 src/config/pc-versions.ts 한 곳과 교사용 real-pc.md의 checked가 같아야 한다.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { parseExampleSidecar } from '../../../src/lab/controls/example-sidecar.ts';
import { exampleRevisionText } from '../../../src/lab/controls/examples.ts';
import { PC_VERSIONS_CHECKED, koreanDate } from '../../../src/config/pc-versions.ts';
import { lessonSchema } from '../../../src/config/content-schemas.ts';

const ROOT = process.cwd();

interface ManifestEntry {
  id: string;
  target: string;
  rewritten?: { version: string; reason: string };
}

const manifest = YAML.parse(fs.readFileSync(path.join(ROOT, 'scripts/examples-manifest.yaml'), 'utf8')) as { examples: ManifestEntry[] };
const rewritten = manifest.examples.filter((entry) => entry.rewritten);

/** 차시 md의 frontmatter(YAML) */
function lessonFrontmatter(file: string): Record<string, unknown> {
  const source = fs.readFileSync(file, 'utf8');
  const match = /^---\r?\n([\s\S]*?)\r?\n---/u.exec(source);
  return match ? (YAML.parse(match[1]!) as Record<string, unknown>) : {};
}

function lessonFiles(): string[] {
  const dir = path.join(ROOT, 'content/lessons');
  return fs
    .readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.md'))
    .map((name) => path.join(dir, name));
}

describe('사이드카 revised 칸', () => {
  it('날짜·판·한 줄을 읽고, 모양이 틀리면 칸이 없다', () => {
    const ok = parseExampleSidecar('title: 가\nrevised:\n  date: 2026-10-26\n  version: 1.8.0\n  note: "바꿨어요."\n');
    expect(ok.revised).toEqual({ date: '2026-10-26', version: '1.8.0', note: '바꿨어요.' });
    expect(parseExampleSidecar('title: 가\nrevised:\n  date: 어제\n  version: 1.8.0\n  note: 바꿨어요.\n').revised).toBeUndefined();
    expect(parseExampleSidecar('title: 가\nrevised:\n  date: 2026-10-26\n  note: 바꿨어요.\n').revised).toBeUndefined();
    expect(parseExampleSidecar('title: 가\n').revised).toBeUndefined();
  });

  it('실습실 줄 글은 "원본 코드와 달라요 — 고친 날(판)" 다음에 한 줄이다', () => {
    expect(exampleRevisionText({ date: '2026-10-26', version: '1.8.0', note: '최신 판으로 다시 썼어요.' })).toBe(
      '원본 코드와 달라요 — 2026년 10월 26일 고침(사이트 판 1.8.0). 최신 판으로 다시 썼어요.',
    );
    expect(exampleRevisionText(undefined)).toBe('');
  });

  it(`최신 판으로 다시 쓴 이관 예제 ${rewritten.length}개는 모두 사이드카에 같은 판의 revised가 있다`, () => {
    expect(rewritten.length).toBeGreaterThanOrEqual(49);
    for (const entry of rewritten) {
      const sidecar = path.join(ROOT, entry.target.replace(/\.py$/u, '.meta.yaml'));
      const parsed = parseExampleSidecar(fs.readFileSync(sidecar, 'utf8'));
      expect(parsed.revised, `${entry.id} ${sidecar}`).toBeDefined();
      expect(parsed.revised!.version, entry.id).toBe(entry.rewritten!.version);
      expect(parsed.revised!.note, entry.id).not.toMatch(/흉내/u);
      // 교안(opmp·블루투스 교안)에서 온 예제를 "교과서"라고 부르지 않는다
      if (/\/(opmp|bt)\//u.test(entry.target)) {
        expect(parsed.revised!.note, entry.id).not.toMatch(/교과서/u);
      }
    }
  });
});

describe('차시 revisions 칸', () => {
  it('스키마가 날짜(글자·Date)·판·요약을 받고, 틀린 날짜는 한국어로 알린다', () => {
    const base = { title: '가', unit: 1, order: 1 };
    const parsed = lessonSchema.parse({ ...base, revisions: [{ date: new Date('2026-10-26T00:00:00Z'), version: '1.8.0', summary: '바꿨어요.' }] });
    expect(parsed.revisions).toEqual([{ date: '2026-10-26', version: '1.8.0', summary: '바꿨어요.' }]);
    expect(lessonSchema.parse(base).revisions).toEqual([]);
    const bad = lessonSchema.safeParse({ ...base, revisions: [{ date: '10월 26일', version: '1.8.0', summary: '가' }] });
    expect(bad.success).toBe(false);
    expect(JSON.stringify(bad.error?.issues)).toContain('2026-10-26처럼');
  });

  it('최신 판으로 다시 쓴 예제를 싣는 차시는 모두 그 판의 revisions가 있다', () => {
    const rewrittenFiles = new Map(rewritten.map((entry) => [entry.target.replace(/^examples\//u, ''), entry.rewritten!.version]));
    const missing: string[] = [];
    let checked = 0;
    for (const file of lessonFiles()) {
      const data = lessonFrontmatter(file);
      if (data.draft === true) {
        continue;
      }
      const examples = Array.isArray(data.examples) ? (data.examples as { file?: string }[]) : [];
      const versions = new Set(examples.map((example) => rewrittenFiles.get(example.file ?? '')).filter((version): version is string => Boolean(version)));
      if (versions.size === 0) {
        continue;
      }
      checked += 1;
      const revisions = Array.isArray(data.revisions) ? (data.revisions as { version?: unknown; summary?: unknown }[]) : [];
      for (const version of versions) {
        if (!revisions.some((revision) => String(revision.version) === version && typeof revision.summary === 'string')) {
          missing.push(`${path.relative(ROOT, file)} (판 ${version})`);
        }
      }
      for (const revision of revisions) {
        expect(String(revision.summary), file).not.toMatch(/흉내/u);
      }
    }
    expect(checked).toBeGreaterThan(15);
    expect(missing).toEqual([]);
  });
});

describe('진짜 PC 판 번호를 확인한 날', () => {
  it('src/config/pc-versions.ts와 교사용 real-pc.md의 checked가 같다', () => {
    const data = lessonFrontmatter(path.join(ROOT, 'content/teacher/real-pc.md'));
    const checked = data.checked instanceof Date ? data.checked.toISOString().slice(0, 10) : String(data.checked);
    expect(checked).toBe(PC_VERSIONS_CHECKED);
  });

  it('날짜를 한국어로 쓴다', () => {
    expect(koreanDate('2026-10-07')).toBe('2026년 10월 7일');
    expect(koreanDate('어제')).toBe('어제');
  });
});
