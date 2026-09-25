/**
 * 교사용 접기 맨 끝에 저절로 붙는 "이 차시의 원고와 자료"(PLAN §8.5 P5-02, §2.3, PD-31, DECISIONS C8)의 내용을 만든다.
 * 차시를 쓰는 사람이 차시마다 같은 안내를 손으로 적지 않게 하려는 것이다 — 원천·성취기준·원본 안내·가린 편집본 링크.
 * 순수 함수라 Vitest가 검사한다(tests/unit/lesson/teacher-info.test.ts). 화면은 LessonTeacherInfo.astro가 그린다.
 */
import type { LessonData } from '../../config/content-schemas.ts';
import { CURRICULUM_SOURCE, findStandard, standardAreaName } from '../../config/standards.ts';
import type { LessonSource } from './curriculum.ts';
import { HANDOUT_DOCS, handoutPath, type HandoutDocId } from './handouts.ts';
import { STANDARDS_PENDING_TEXT, pagesText, standardsEmptyText } from './lesson-data.ts';

/** PLAN §2.3이 정한 원고 없는 차시 표시 문구(그대로 쓴다) */
export const NO_MANUSCRIPT_TEXT = '원고 없음: 사이트가 코드 기준으로 쓴 본문';

/** 화면 표기(PLAN §2.2) */
export const STANDARDS_LABEL = '성취기준(인천광역시교육청 승인 교육과정, 차시 연결은 사이트가 붙임)';

export interface TeacherInfoLink {
  readonly text: string;
  /** 사이트 안 경로(base 없음, /로 시작) 또는 https:// 주소 */
  readonly href: string;
}

export interface TeacherInfoStandard {
  readonly code: string;
  /** 영역 이름과 사이트 요약. 15개에 없는 코드면 undefined */
  readonly area?: string;
  readonly summary?: string;
}

export interface TeacherInfoHandout {
  readonly doc: HandoutDocId;
  readonly title: string;
  readonly pages: string;
  readonly note?: string;
  /** 편집본 파일이 있으면 링크(쪽까지), 없으면 undefined → "교사용 자료실에 준비 중" */
  readonly href?: string;
}

export interface TeacherInfo {
  /** 원천 한 줄(원고를 옮겼는지, 원고 없음인지, 보충인지) */
  readonly source?: string;
  readonly noManuscript: boolean;
  readonly standards: readonly TeacherInfoStandard[];
  /** 성취기준이 비었고 대응표에도 없는 새 차시일 때 문장(C8) */
  readonly standardsPending?: string;
  /** 대응표에서 일부러 비운 차시(보충·선택 차시·대단원 마무리)일 때 문장과 까닭을 모아 둔 곳 */
  readonly standardsNone?: { readonly text: string; readonly link: TeacherInfoLink; readonly after: string };
  readonly curriculumLink: TeacherInfoLink;
  /** 원본 파일 안내(원본은 올리지 않음 — PD-31, C6) */
  readonly originals: string;
  readonly originalsLinks: readonly TeacherInfoLink[];
  readonly handouts: readonly TeacherInfoHandout[];
}

export interface TeacherInfoInput {
  readonly data: Pick<LessonData, 'kind' | 'pages' | 'standards' | 'handouts'> & Partial<Pick<LessonData, 'unit' | 'label'>>;
  readonly source: LessonSource | undefined;
  /** 편집본 파일이 public/에 있는지(빌드가 파일을 보고 알려 준다) */
  readonly handoutExists: (doc: HandoutDocId) => boolean;
}

/** 원고 없는 차시의 본문 근거: 예제 코드와 주석은 늘, 수업 교안은 편집본 쪽(handouts)을 적은 차시만, 대단원 마무리 문항은 I단원만(PLAN §2.3) */
function codeOnlyBasis(data: TeacherInfoInput['data'], where: string | undefined): string {
  const basis = [`예제 코드와 주석${where ? `(${where})` : ''}`];
  if ((data.handouts ?? []).length > 0) {
    basis.push('수업 교안');
  }
  if (data.unit === 1) {
    basis.push('대단원 마무리 문항');
  }
  return basis.join(', ');
}

function sourceText(source: LessonSource | undefined, data: TeacherInfoInput['data']): string | undefined {
  const where = pagesText(data.pages);
  const range = where ? `(${where})` : '';
  switch (source) {
    case 'manuscript-code':
      return `교과서 원고${range}의 글, 그림, 표와 예제 코드를 차시 틀에 맞게 옮기고 고1 눈높이로 다듬었어요.`;
    case 'manuscript':
      return data.kind === 'review'
        ? `교과서 원고${range}의 대단원 마무리 문항을 옮겼어요.`
        : `교과서 원고${range}의 글, 그림, 표를 차시 틀에 맞게 옮기고 고1 눈높이로 다듬었어요.`;
    case 'code-only':
      return `${NO_MANUSCRIPT_TEXT}이에요. 교과서 원고가 아직 없어서 ${codeOnlyBasis(data, where)}을 바탕으로 썼어요. 원고를 받으면 원고로 바꿔요.`;
    case 'supplement':
      return data.kind === 'reading'
        ? '사이트가 새로 쓴 읽기 자료: 교과서 원고에 없는 활동 안내를 사이트가 썼어요.'
        : '보충 차시: 교과서에 없는 내용을 사이트가 새로 썼어요.';
    default:
      return undefined;
  }
}

/** 원본을 올리지 않는 까닭과 예제 코드 받는 곳(PD-31, C6). 원고를 옮긴 차시만 "원고 내용은 이 페이지에 옮겼고"를 붙인다 */
function originalsText(source: LessonSource | undefined): string {
  const moved = source === 'manuscript' || source === 'manuscript-code' ? '원고 내용은 이 페이지에 옮겼고, ' : '';
  return (
    '원본 내려받기는 없어요. 원고 PDF, 수업 교안, 코드 압축 파일 같은 원본은 사이트에 올리지 않아요. ' +
    '원본에 사람 얼굴, 컴퓨터 속 파일 경로, 기기 주소 같은 개인정보가 섞여 있을 수 있어서예요. ' +
    `${moved}예제 코드는 실습실의 [.py 내려받기]와 예제 갤러리에서 받을 수 있어요.`
  );
}

/** 교사용 자료실의 "성취기준을 비워 둔 차시"(src/pages/teacher/standards/) */
export const UNMAPPED_STANDARDS_LINK: TeacherInfoLink = Object.freeze({
  text: '교사용 자료실의 성취기준을 비워 둔 차시',
  href: '/teacher/standards/#std-unmapped-title',
});

export function buildTeacherInfo({ data, source, handoutExists }: TeacherInfoInput): TeacherInfo {
  const empty = data.standards.length === 0 ? standardsEmptyText(data.label) : undefined;
  return {
    source: sourceText(source, data),
    noManuscript: source === 'code-only',
    standards: data.standards.map((code) => {
      const standard = findStandard(code);
      return standard ? { code, area: standardAreaName(standard.area), summary: standard.summary } : { code };
    }),
    standardsPending:
      empty && !empty.intentional
        ? `${STANDARDS_PENDING_TEXT} — 이 차시와 분명하게 이어지는 성취기준 코드를 확인하지 못해 비워 두었어요.`
        : undefined,
    standardsNone:
      empty?.intentional && empty.reason
        ? {
            text: `${empty.text} — 이 차시는 ${empty.reason}라서 차시와 성취기준 대응표에서 코드를 일부러 붙이지 않았어요. 까닭은 `,
            link: UNMAPPED_STANDARDS_LINK,
            after: '에 모아 두었어요.',
          }
        : undefined,
    curriculumLink: {
      text: `교육과정 원문 게시물(${CURRICULUM_SOURCE.registered} 등록)`,
      href: CURRICULUM_SOURCE.url,
    },
    originals: originalsText(source),
    originalsLinks: [
      { text: '예제 갤러리', href: '/labs/gallery/' },
      { text: '교사용 자료실', href: '/teacher/' },
      { text: '교과서 원고 정정 목록', href: '/teacher/corrections/' },
      { text: '진짜 PC에서 돌리기', href: '/teacher/real-pc/' },
    ],
    // Astro 콘텐츠 캐시(node_modules/.astro)는 frontmatter 규칙에 칸이 늘어도 바뀌지 않은 md의 옛 값을 되살린다(2026-09-25 빌드에서 확인) —
    // 새 칸(handouts)은 기본값을 믿지 않고 비었으면 빈 목록으로 본다.
    handouts: (data.handouts ?? []).map((handout) => ({
      doc: handout.doc,
      title: HANDOUT_DOCS[handout.doc].title,
      pages: handout.pages,
      note: handout.note,
      href: handoutExists(handout.doc) ? handoutPath(handout.doc, handout.pages) : undefined,
    })),
  };
}
