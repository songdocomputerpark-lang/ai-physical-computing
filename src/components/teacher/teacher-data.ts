/**
 * 교사용 자료실 데이터 파일을 빌드 때 한 번 읽는 곳 — **빌드 전용**(.astro 프런트매터에서만 import).
 * content/teacher/*.yaml을 Vite의 ?raw로 글자로 가져와 teacher-data-schema.ts로 검사한다(오류 사전 catalog-data.ts와 같은 방법).
 * yaml 패키지가 브라우저 번들에 들어가면 출처 검사가 실패하므로 <script>에서는 쓰지 않는다.
 */
import { parseAssessment, parseCorrections, type AssessmentData, type CorrectionsData } from './teacher-data-schema.ts';

export const ASSESSMENT_FILE = 'content/teacher/assessment.yaml';
export const CORRECTIONS_FILE = 'content/teacher/corrections.yaml';

// 저장소 뿌리 기준 경로(src/lab/errors/catalog-data.ts가 content/help/errors/를 읽는 방법과 같다)
const files = import.meta.glob<string>('/content/teacher/*.yaml', { query: '?raw', eager: true, import: 'default' });

function read(file: string): string {
  const source = files[`/${file}`];
  if (source === undefined) {
    throw new Error(`[교사용 자료실] 데이터 파일 ${file}을(를) 찾지 못했어요.`);
  }
  return source;
}

/** 성취기준과 평가 방향 페이지의 글 */
export function loadAssessment(): AssessmentData {
  return parseAssessment(read(ASSESSMENT_FILE), ASSESSMENT_FILE);
}

/** 원고 정정 목록 */
export function loadCorrections(): CorrectionsData {
  return parseCorrections(read(CORRECTIONS_FILE), CORRECTIONS_FILE);
}
