// 실제 용어사전 항목(content/glossary/*.md)이 사이트 규칙을 지키는지 검사한다(PLAN §8.1 P1-07, SPEC §7.1).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import {
  applyGlossary,
  createGlossaryRegistry,
  findGlossaryMarkers,
  findRelatedProblems,
  resolveGlossaryMarker,
} from '../../../src/components/glossary/glossary.ts';
import {
  CONTENT_DIRS,
  ENTRY_ID_PATTERN,
  GLOSSARY_SUMMARY_MAX,
  glossarySchema,
  type GlossaryData,
} from '../../../src/config/content-schemas.ts';
import { renderMarkdown } from './helpers.ts';

interface ContentEntry {
  readonly id: string;
  readonly data: GlossaryData;
  readonly body: string;
}

const glossaryDir = path.resolve(CONTENT_DIRS.glossary);

function readGlossaryFiles(): ContentEntry[] {
  return fs
    .readdirSync(glossaryDir)
    .filter((fileName) => fileName.endsWith('.md'))
    .sort()
    .map((fileName) => {
      const source = fs.readFileSync(path.join(glossaryDir, fileName), 'utf8');
      const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/u.exec(source);
      if (!match) {
        throw new Error(`${fileName}: frontmatter(--- … ---)가 없어요.`);
      }
      const parsed = glossarySchema.safeParse(parseYaml(match[1]));
      if (!parsed.success) {
        throw new Error(`${fileName}: ${parsed.error.issues.map((issue) => issue.message).join(' / ')}`);
      }
      return { id: fileName.slice(0, -'.md'.length), data: parsed.data, body: match[2] };
    });
}

/** 인라인 코드와 용어 표시 문법을 걷어 낸 뒤 문장 끝(. ! ?)을 센다. */
function countSentences(markdown: string): number {
  const text = markdown.replace(/`[^`]*`/gu, '').replace(/:(?:용어|term)\[([^\]]*)\](?:\{[^}]*\})?/gu, '$1');
  return text.match(/[.!?](?=\s|$)/gu)?.length ?? 0;
}

const entries = readGlossaryFiles();
const registry = createGlossaryRegistry(entries);

/** PLAN §8.1 P1-07에 적힌 용어 20개 */
const PLAN_TERMS = [
  '픽셀',
  '프레임',
  'BGR·RGB',
  '랜드마크',
  '정규화 좌표',
  '라이브러리',
  '에이전트',
  '센서',
  '액추에이터',
  'MicroPython',
  'ESP32',
  'GPIO',
  'PWM',
  'I2C',
  'UART',
  'BLE',
  '펌웨어',
  '드라이버',
  '임계값',
  '에지',
];

/** 영어 약자 표제어(SPEC §7.1 "영어 약자는 풀어쓴다") */
const ACRONYM_TITLES = ['GPIO', 'PWM', 'I2C', 'UART', 'BLE'];

describe('용어사전 항목(content/glossary/)', () => {
  it('20개 이상이고 파일 이름이 영문 소문자·숫자·하이픈이다', () => {
    expect(entries.length).toBeGreaterThanOrEqual(20);
    for (const entry of entries) {
      expect(entry.id, entry.id).toMatch(ENTRY_ID_PATTERN);
    }
  });

  it('PLAN §8.1 P1-07의 용어 20개를 모두 이름으로 찾을 수 있다', () => {
    for (const term of PLAN_TERMS) {
      expect(registry.byName(term), term).toBeDefined();
    }
  });

  it('한 줄 풀이는 100자 안의 해요체 문장이고, 조금 더 알기는 2~3문장이다', () => {
    for (const entry of entries) {
      expect(entry.data.summary.length, entry.id).toBeLessThanOrEqual(GLOSSARY_SUMMARY_MAX);
      expect(entry.data.summary.endsWith('요.'), `${entry.id}: 한 줄 풀이 끝`).toBe(true);
      const sentences = countSentences(entry.body);
      expect(sentences, `${entry.id}: 조금 더 알기 문장 수`).toBeGreaterThanOrEqual(2);
      expect(sentences, `${entry.id}: 조금 더 알기 문장 수`).toBeLessThanOrEqual(3);
    }
  });

  it('영어 약자 표제어는 풀어쓴 이름을 english에 적고 한 줄 풀이도 그 이름으로 시작한다', () => {
    for (const title of ACRONYM_TITLES) {
      const found = registry.byName(title);
      expect(found?.english, title).toBeTruthy();
      expect(found?.summary.startsWith(found.english ?? '(없음)'), title).toBe(true);
    }
  });

  it('related는 모두 있는 다른 항목을 가리키고, 묶음(group)이 적혀 있다', () => {
    expect(findRelatedProblems(registry)).toEqual([]);
    for (const entry of entries) {
      expect(entry.data.group, entry.id).toBeTruthy();
    }
  });

  it('조금 더 알기 본문의 :용어[…]는 모두 다른 항목으로 이어진다', async () => {
    for (const entry of entries) {
      const html = await renderMarkdown(entry.body);
      for (const marker of findGlossaryMarkers(html)) {
        const found = resolveGlossaryMarker(registry, marker);
        expect(found, `${entry.id}: :용어[${marker.text}]`).toBeDefined();
        expect(found?.id, `${entry.id}: 자기 자신을 가리키면 안 돼요`).not.toBe(entry.id);
      }
      expect(applyGlossary(html, registry, { scope: entry.id, self: entry.id }).problems, entry.id).toEqual([]);
    }
  });

  it('용어사전 페이지의 예시 문단은 모든 용어를 찾고, 같은 낱말은 첫 번째만 링크한다', async () => {
    const source = fs.readFileSync(path.resolve('src/components/glossary/glossary-example.md'), 'utf8');
    const result = applyGlossary(await renderMarkdown(source), registry, { scope: 'example' });
    expect(result.problems).toEqual([]);
    expect(result.used).toEqual(['pixel', 'frame', 'esp32', 'sensor', 'actuator']);
  });
});
