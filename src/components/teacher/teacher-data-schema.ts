/**
 * 교사용 자료실의 데이터 파일(content/teacher/*.yaml) 모양 검사 — 순수 함수(Node·Playwright 테스트에서도 돈다).
 * 파일을 읽는 곳은 teacher-data.ts(빌드 전용, import.meta.glob). 모양이 틀리면 한국어로 무엇을 고칠지 알려 주는 오류를 던져
 * 빌드가 멈춘다 — 오류 사전(content/help/errors/errors.yaml)과 같은 방식(교사가 항목을 더하다 틀렸을 때 바로 알게).
 *
 * - assessment.yaml: 과목 정보, 평가 방법, 고려 사항, 성취기준마다 볼 것과 모을 자료(사이트 제안), 성취기준을 비워 둔 까닭
 * - corrections.yaml: 교과서 원고 정정 목록(묶음 > 항목)과 교과서 코드 파일에서 고칠 곳
 * 글 안의 `…`는 코드 글꼴로 보인다(formatInline). 그 밖의 마크다운은 쓰지 않는다.
 */
import YAML from 'yaml';

export interface CourseFact {
  readonly label: string;
  readonly value: string;
  /** curriculum = 인천광역시교육청 게시물, subject_list = 과목 목록 게시물 */
  readonly source: 'curriculum' | 'subject_list';
}

export interface Consideration {
  readonly quote: string;
  readonly use: string;
}

export interface StandardAssessment {
  readonly look: string;
  readonly evidence: string;
}

export interface UnmappedReason {
  readonly labels: readonly string[];
  readonly kinds: readonly string[];
  readonly reason: string;
}

export interface AssessmentData {
  readonly course: readonly CourseFact[];
  readonly subjectList: { readonly title: string; readonly url: string };
  readonly methods: readonly string[];
  readonly considerations: readonly Consideration[];
  readonly standards: Readonly<Record<string, StandardAssessment>>;
  readonly unmapped: readonly UnmappedReason[];
}

export const CORRECTION_KINDS = ['code', 'text', 'figure', 'question'] as const;
export type CorrectionKind = (typeof CORRECTION_KINDS)[number];

/** 화면에 보이는 종류 이름 */
export const CORRECTION_KIND_LABELS: Readonly<Record<CorrectionKind, string>> = Object.freeze({
  code: '코드',
  text: '글',
  figure: '그림',
  question: '문항과 정답',
});

export interface CorrectionItem {
  readonly page: string;
  readonly lesson?: string;
  readonly kind: CorrectionKind;
  readonly original: string;
  readonly fix: string;
  readonly note?: string;
}

export interface CorrectionPart {
  readonly id: string;
  readonly title: string;
  readonly items: readonly CorrectionItem[];
}

export interface CodeFileCorrection {
  readonly code: string;
  readonly lesson?: string;
  readonly problem: string;
  readonly site: string;
}

export interface CorrectionsData {
  readonly parts: readonly CorrectionPart[];
  readonly codeFiles: readonly CodeFileCorrection[];
}

const ID_PATTERN = /^[a-z\d]+(?:-[a-z\d]+)*$/u;

class TeacherDataError extends Error {
  constructor(file: string, where: string, message: string) {
    super(`[교사용 자료실] ${file}: ${where} — ${message}`);
    this.name = 'TeacherDataError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(file: string, where: string, value: unknown, optional = false): string | undefined {
  if (value === undefined || value === null) {
    if (optional) {
      return undefined;
    }
    throw new TeacherDataError(file, where, '글을 적어요(비어 있어요).');
  }
  if (typeof value === 'number') {
    return String(value);
  }
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TeacherDataError(file, where, '글자로 적어요.');
  }
  return value.trim();
}

function list(file: string, where: string, value: unknown, optional = false): unknown[] {
  if (value === undefined || value === null) {
    if (optional) {
      return [];
    }
    throw new TeacherDataError(file, where, '목록(- 로 시작하는 줄)으로 적어요.');
  }
  if (!Array.isArray(value)) {
    throw new TeacherDataError(file, where, '목록(- 로 시작하는 줄)으로 적어요.');
  }
  return value;
}

function parseYaml(file: string, source: string): Record<string, unknown> {
  let data: unknown;
  try {
    data = YAML.parse(source);
  } catch (error) {
    throw new TeacherDataError(file, 'YAML 형식', error instanceof Error ? error.message : String(error));
  }
  if (!isRecord(data)) {
    throw new TeacherDataError(file, '파일 전체', '맨 위에 이름: 값 모양의 칸을 적어요.');
  }
  return data;
}

/** 과목 정보 한 줄의 출처 이름인지 */
function isCourseSource(value: string | undefined): value is CourseFact['source'] {
  return value === 'curriculum' || value === 'subject_list';
}

/** content/teacher/assessment.yaml 글을 읽어 검사한다 */
export function parseAssessment(source: string, file = 'content/teacher/assessment.yaml'): AssessmentData {
  const data = parseYaml(file, source);
  const course = list(file, 'course', data.course).map((item, index): CourseFact => {
    const where = `course ${index + 1}번째`;
    if (!isRecord(item)) {
      throw new TeacherDataError(file, where, 'label·value·source 칸을 적어요.');
    }
    const sourceName = text(file, `${where} source`, item.source);
    if (!isCourseSource(sourceName)) {
      throw new TeacherDataError(file, `${where} source`, 'curriculum 또는 subject_list로 적어요.');
    }
    return { label: text(file, `${where} label`, item.label) ?? '', value: text(file, `${where} value`, item.value) ?? '', source: sourceName };
  });
  if (!isRecord(data.subject_list)) {
    throw new TeacherDataError(file, 'subject_list', 'title과 url 칸을 적어요.');
  }
  const subjectUrl = text(file, 'subject_list url', data.subject_list.url) ?? '';
  if (!/^https:\/\//u.test(subjectUrl)) {
    throw new TeacherDataError(file, 'subject_list url', 'https://로 시작하는 주소로 적어요.');
  }
  const methods = list(file, 'methods', data.methods).map((item, index) => text(file, `methods ${index + 1}번째`, item) ?? '');
  const considerations = list(file, 'considerations', data.considerations).map((item, index) => {
    const where = `considerations ${index + 1}번째`;
    if (!isRecord(item)) {
      throw new TeacherDataError(file, where, 'quote와 use 칸을 적어요.');
    }
    return { quote: text(file, `${where} quote`, item.quote) ?? '', use: text(file, `${where} use`, item.use) ?? '' };
  });
  if (!isRecord(data.standards)) {
    throw new TeacherDataError(file, 'standards', '성취기준 코드: { look, evidence } 모양으로 적어요.');
  }
  const standards: Record<string, StandardAssessment> = {};
  for (const [code, value] of Object.entries(data.standards)) {
    if (!/^12인피0[1-4]-0[1-9]$/u.test(code)) {
      throw new TeacherDataError(file, `standards ${code}`, '성취기준 코드는 12인피01-01 모양으로 적어요.');
    }
    if (!isRecord(value)) {
      throw new TeacherDataError(file, `standards ${code}`, 'look과 evidence 칸을 적어요.');
    }
    standards[code] = { look: text(file, `standards ${code} look`, value.look) ?? '', evidence: text(file, `standards ${code} evidence`, value.evidence) ?? '' };
  }
  const unmapped = list(file, 'unmapped', data.unmapped, true).map((item, index) => {
    const where = `unmapped ${index + 1}번째`;
    if (!isRecord(item)) {
      throw new TeacherDataError(file, where, 'labels(또는 kinds)와 reason 칸을 적어요.');
    }
    const labels = list(file, `${where} labels`, item.labels, true).map((label) => text(file, `${where} labels`, label) ?? '');
    const kinds = list(file, `${where} kinds`, item.kinds, true).map((kind) => text(file, `${where} kinds`, kind) ?? '');
    if (labels.length === 0 && kinds.length === 0) {
      throw new TeacherDataError(file, where, 'labels(차시 번호) 또는 kinds(차시 종류) 가운데 하나는 적어요.');
    }
    return { labels, kinds, reason: text(file, `${where} reason`, item.reason) ?? '' };
  });
  return {
    course,
    subjectList: { title: text(file, 'subject_list title', data.subject_list.title) ?? '', url: subjectUrl },
    methods,
    considerations,
    standards,
    unmapped,
  };
}

/** content/teacher/corrections.yaml 글을 읽어 검사한다 */
export function parseCorrections(source: string, file = 'content/teacher/corrections.yaml'): CorrectionsData {
  const data = parseYaml(file, source);
  const seen = new Set<string>();
  const parts = list(file, 'parts', data.parts).map((part, partIndex) => {
    const where = `parts ${partIndex + 1}번째`;
    if (!isRecord(part)) {
      throw new TeacherDataError(file, where, 'id·title·items 칸을 적어요.');
    }
    const id = text(file, `${where} id`, part.id) ?? '';
    if (!ID_PATTERN.test(id)) {
      throw new TeacherDataError(file, `${where} id`, '영문 소문자·숫자·하이픈으로 적어요(예: u1).');
    }
    if (seen.has(id)) {
      throw new TeacherDataError(file, `${where} id`, `"${id}"가 두 번 있어요. 묶음마다 달라야 해요.`);
    }
    seen.add(id);
    const items = list(file, `${where} items`, part.items).map((item, index) => {
      const itemWhere = `${where}(${id}) items ${index + 1}번째`;
      if (!isRecord(item)) {
        throw new TeacherDataError(file, itemWhere, 'page·kind·original·fix 칸을 적어요.');
      }
      const kind = text(file, `${itemWhere} kind`, item.kind) ?? '';
      if (!(CORRECTION_KINDS as readonly string[]).includes(kind)) {
        throw new TeacherDataError(file, `${itemWhere} kind`, `${CORRECTION_KINDS.join('·')} 가운데 하나로 적어요.`);
      }
      return {
        page: text(file, `${itemWhere} page`, item.page) ?? '',
        lesson: text(file, `${itemWhere} lesson`, item.lesson, true),
        kind: kind as CorrectionKind,
        original: text(file, `${itemWhere} original`, item.original) ?? '',
        fix: text(file, `${itemWhere} fix`, item.fix) ?? '',
        note: text(file, `${itemWhere} note`, item.note, true),
      };
    });
    return { id, title: text(file, `${where} title`, part.title) ?? '', items };
  });
  const codeFiles = list(file, 'code_files', data.code_files, true).map((item, index) => {
    const where = `code_files ${index + 1}번째`;
    if (!isRecord(item)) {
      throw new TeacherDataError(file, where, 'code·problem·site 칸을 적어요.');
    }
    return {
      code: text(file, `${where} code`, item.code) ?? '',
      lesson: text(file, `${where} lesson`, item.lesson, true),
      problem: text(file, `${where} problem`, item.problem) ?? '',
      site: text(file, `${where} site`, item.site) ?? '',
    };
  });
  return { parts, codeFiles };
}

function escapeHtml(value: string): string {
  return value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;');
}

/** 글의 `…`만 <code>로 바꾼 HTML(나머지는 글자 그대로 — HTML 특수 문자는 바꿔 적는다) */
export function formatInline(value: string): string {
  return value
    .split(/(`[^`]+`)/u)
    .map((piece) => (piece.startsWith('`') && piece.endsWith('`') && piece.length > 1 ? `<code>${escapeHtml(piece.slice(1, -1))}</code>` : escapeHtml(piece)))
    .join('');
}

/** 성취기준을 비워 둔 차시의 까닭(맞는 줄이 없으면 undefined) */
export function unmappedReasonFor(reasons: readonly UnmappedReason[], label: string, kind: string): string | undefined {
  const key = label.toLowerCase();
  return reasons.find((reason) => reason.labels.some((candidate) => candidate.toLowerCase() === key) || reason.kinds.includes(kind))?.reason;
}
