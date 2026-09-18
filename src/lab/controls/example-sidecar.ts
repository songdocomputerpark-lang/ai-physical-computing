/**
 * 예제 사이드카(<이름>.meta.yaml) 읽기(PLAN §8.0 PD-33, §2.6, src/lab/README.md 3절).
 *
 * 원본 자료에서 옮긴 예제는 코드 파일에 머리말을 넣지 않는다(줄 번호 보존, PD-10). 대신 같은 이름의 사이드카에 제목·설명·차시·쪽·태그·
 * 미리 받을 패키지를 적고, 실습실 목록(src/lab/vision/examples.ts)·갤러리(P4-11)·차시 임베드(P2-14)가 이 파일로 읽는다.
 * 사이드카는 scripts/import-examples.mjs가 처음 한 번 만들고(목록의 meta), 그 뒤로는 사람이 고친다.
 *
 * **빌드 때만 쓰는 파일이다.** YAML 파서(devDependency `yaml`)를 쓰므로 .astro 프런트매터·Node 테스트에서만 import하고,
 * 브라우저로 가는 코드(src/lab/vision/vision-lab.ts 등)에서는 import하지 않는다(번들에 yaml이 들어가 출처 검사가 실패한다).
 *
 * 필드(모두 선택, 빠지면 null·빈 목록)
 *   title        목록·갤러리 카드에 보이는 제목
 *   description  한 줄 설명
 *   lesson       붙는 차시 slug(content/lessons/ 파일 이름)
 *   page         교과서 쪽(숫자)
 *   source_id    이관 기록 id(scripts/examples-manifest.yaml, 예: f026)
 *   tags         갤러리·검색용 낱말 목록
 *   packages     실행 전에 미리 받을 Pyodide 패키지 이름(pyodide-lock.json 기준). 적지 않으면 실습실 기본값
 *   parts        (ESP32 예제) 배선 목록 — [{ part: touch-digital, pin: 17 }] 모양(src/lab/modules/board/wiring-spec.ts, README 7.4).
 *                틀린 줄은 빼고 까닭을 partErrors에 모은다(빌드는 경고만 — PD-35)
 *   practice     (선택) 실습 방법 — 실습실에서 무엇을 누르고 무엇을 보는지 단계 목록(ESP32 실습실이 보드 그림 위에 보인다, P3-02)
 *   unit·difficulty·virtual_ok·comm   예제 갤러리(P4-11) 태그 — 단원 1~4, 난이도 1~3, 하드웨어 없이 되나, 통신 방식 목록.
 *                규약과 합치는 규칙은 src/lab/gallery/facets.ts(차시 md가 먼저, 없으면 사이드카). 모르면 적지 않는다
 *   smoke        예제 스모크 테스트(tests/e2e/examples-smoke.spec.ts)가 기대하는 결과. 이 파서는 읽지 않고 그 테스트만 본다.
 *                input(sample|replay|webcam)·outcome(ok|stopped|error)·error(오류 이름)·seconds(지켜보는 시간)·skip(건너뛰는 이유)
 */
import YAML from 'yaml';
import { normalizeCommKinds } from '../gallery/facets.ts';
import type { WiringEntry } from '../modules/board/part-types.ts';
import { normalizeWiringSpecs } from '../modules/board/wiring-spec.ts';

export const SIDECAR_SUFFIX = '.meta.yaml';

export interface ExampleSidecar {
  readonly title: string | null;
  readonly description: string | null;
  readonly lesson: string | null;
  readonly page: number | null;
  readonly sourceId: string | null;
  readonly tags: readonly string[];
  /** 적지 않았으면 null(실습실 기본값을 쓴다), 적었으면 그 목록(빈 목록 포함) */
  readonly packages: readonly string[] | null;
  /** 배선(적지 않았으면 이 칸이 없다 — ESP32 예제만 씀). 모양이 틀린 줄은 뺐다 */
  readonly parts?: readonly WiringEntry[] | null;
  /** parts에서 뺀 줄의 까닭(한국어) */
  readonly partErrors?: readonly string[];
  /** 실습 방법 단계(적지 않았으면 이 칸이 없다) */
  readonly practice?: readonly string[];
  /** 갤러리 태그(P4-11, src/lab/gallery/facets.ts) — 모르면 null·빈 목록 */
  readonly unit: number | null;
  readonly difficulty: number | null;
  readonly virtualOk: boolean | null;
  readonly comm: readonly string[];
}

/** 정수 칸 읽기(범위 밖·정수가 아니면 null) */
function intInRange(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : null;
}

const LESSON_SLUG = /^[a-z0-9][a-z0-9-]*$/u;

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const items: string[] = [];
  for (const item of value) {
    const trimmed = typeof item === 'string' ? item.trim() : typeof item === 'number' ? String(item) : '';
    if (trimmed !== '' && !items.includes(trimmed)) {
      items.push(trimmed);
    }
  }
  return items;
}

/** 사이드카 글자(YAML)를 읽는다. 모양이 틀린 필드는 무시하고(null·빈 목록) 파일 전체가 YAML이 아니면 오류를 던진다. */
export function parseExampleSidecar(source: string): ExampleSidecar {
  const raw: unknown = YAML.parse(source);
  const data = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const lesson = text(data.lesson);
  const page = typeof data.page === 'number' && Number.isInteger(data.page) && data.page > 0 ? data.page : null;
  const wiring = data.parts === undefined ? null : normalizeWiringSpecs(data.parts, '사이드카');
  return {
    title: text(data.title),
    description: text(data.description),
    lesson: lesson !== null && LESSON_SLUG.test(lesson) ? lesson : null,
    page,
    sourceId: text(data.source_id),
    tags: stringList(data.tags),
    packages: Array.isArray(data.packages) ? stringList(data.packages) : null,
    ...(wiring === null ? {} : { parts: wiring.entries, partErrors: wiring.errors }),
    ...(Array.isArray(data.practice) ? { practice: stringList(data.practice) } : {}),
    unit: intInRange(data.unit, 1, 4),
    difficulty: intInRange(data.difficulty, 1, 3),
    virtualOk: typeof data.virtual_ok === 'boolean' ? data.virtual_ok : null,
    comm: normalizeCommKinds(data.comm),
  };
}

/** 사이드카 경로(…/a.meta.yaml) → 짝이 되는 예제 파일 경로(…/a.py). 사이드카가 아니면 null */
export function examplePathForSidecar(sidecarPath: string): string | null {
  if (!sidecarPath.endsWith(SIDECAR_SUFFIX)) {
    return null;
  }
  return `${sidecarPath.slice(0, -SIDECAR_SUFFIX.length)}.py`;
}

/**
 * import.meta.glob(?raw)으로 읽은 사이드카 묶음({ '/examples/vision/u1/a.meta.yaml': '글자' })을
 * 예제 파일 경로 기준 사전({ '/examples/vision/u1/a.py': 사이드카 })으로 바꾼다. 읽기 실패는 경로와 함께 오류로 던진다(빌드가 멈춰 바로 알 수 있게).
 */
export function readExampleSidecars(files: Readonly<Record<string, string>>): Record<string, ExampleSidecar> {
  const result: Record<string, ExampleSidecar> = {};
  for (const [sidecarPath, source] of Object.entries(files)) {
    const examplePath = examplePathForSidecar(sidecarPath.replace(/\\/gu, '/'));
    if (!examplePath) {
      continue;
    }
    try {
      result[examplePath] = parseExampleSidecar(source);
    } catch (error) {
      throw new Error(`예제 사이드카 ${sidecarPath}을(를) 읽지 못했어요: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return result;
}
