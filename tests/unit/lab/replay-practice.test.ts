// 재생 입력(합성 좌표)의 자동 전환 동작으로는 판정이 나지 않는 예제에 "이 예제 실습 방법"(사이드카 practice)이 있는지 지킨다
// (2026-09-30 최종 점검 LV-05 — 하품 예제는 '고개 돌리기'로 저절로 바뀌어 하품이 한 번도 세어지지 않았고, 고를 동작은
// 사이드카 **주석**에만 있어 갤러리·예제 목록으로 바로 온 학생은 몰랐다).
// 규칙: 사이드카(주석·practice)에 적은 재생 동작 가운데 그 종류의 자동 전환 동작(DEFAULT_SEQUENCE_FOR_KIND)이 아닌 것이 있으면,
// practice 가운데 한 줄이 그 동작 가운데 하나를 이름(화면 목록 글자 그대로)으로 고르게 해야 한다.
// "'두 손'으로 골라도 한 손만 와요"처럼 고르지 않아도 된다는 말은 세지 않는다.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { DEFAULT_SEQUENCE_FOR_KIND, listReplaySequences } from '../../../src/lab/modules/mediapipe/sequences.ts';

const VISION_EXAMPLES = path.resolve('examples/vision');

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const sequences = listReplaySequences();
const defaults = new Set<string>(Object.values(DEFAULT_SEQUENCE_FOR_KIND));

/** 글에서 "재생 동작 '…'"·"재생 동작을 '…'"로 적은 동작 이름(화면 목록의 이름과 같은 것만, "…로 골라도"는 빼고) */
function namedActions(text: string): string[] {
  const names = new Set<string>();
  for (const match of text.matchAll(/재생 동작(?:을|은|이)? ['‘]([^'’]+)['’](?!(?:으로|로) 골라도)/gu)) {
    names.add(match[1] ?? '');
  }
  return [...names].filter((name) => sequences.some((sequence) => sequence.label === name));
}

describe('재생 입력 — 기본이 아닌 동작이 필요한 예제의 실습 방법', () => {
  const sidecars = walk(VISION_EXAMPLES).filter((file) => file.endsWith('.meta.yaml'));

  it('동작 이름표가 화면 목록과 같다(이 검사가 찾는 글자)', () => {
    const labels = sequences.map((sequence) => sequence.label);
    expect(labels).toEqual(expect.arrayContaining(['입 벌리기(하품)', '어깨 기울이기', '엄지·검지 핀치', '검지로 그리기', '눈 깜빡이기']));
  });

  it('사이드카가 기본이 아닌 재생 동작을 적었으면 practice가 그 동작을 고르라고 알린다', () => {
    const missing: string[] = [];
    let checked = 0;
    for (const file of sidecars) {
      const text = fs.readFileSync(file, 'utf8');
      const data = (parseYaml(text) ?? {}) as { practice?: unknown };
      const practice = Array.isArray(data.practice) ? data.practice.map(String) : [];
      const required = namedActions(text).filter((name) => {
        const sequence = sequences.find((item) => item.label === name);
        return sequence !== undefined && !defaults.has(sequence.id);
      });
      if (required.length === 0) {
        continue;
      }
      checked += 1;
      if (!required.some((name) => practice.some((line) => line.includes(`'${name}'`)))) {
        missing.push(`${path.relative(VISION_EXAMPLES, file).replace(/\\/gu, '/')}: ${required.map((name) => `'${name}'`).join(' 또는 ')}`);
      }
    }
    expect(checked, '기본이 아닌 동작을 적은 사이드카 수').toBeGreaterThanOrEqual(10);
    expect(missing, 'practice에 "재생 입력이면 재생 동작 \'…\'를 골라 [실행]해요." 한 줄을 더해요').toEqual([]);
  });
});
