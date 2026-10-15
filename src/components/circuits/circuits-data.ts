/**
 * 회로 그림 목록을 빌드 때 한 번 읽는 곳 — **빌드 전용**(.astro 프런트매터에서만 import, 판 1.4.0 C5).
 * scripts/circuits/circuits.yaml을 Vite의 ?raw로 글자로 가져와 circuits-schema.ts로 검사한다(부품 사전 parts-data.ts·오류 사전 catalog-data.ts와 같은 방법).
 * 형식이 틀리면 여기서 오류가 나서 빌드가 멈춘다. yaml 패키지가 브라우저 번들에 들어가면 출처 검사가 실패하므로 <script>에서는 쓰지 않는다.
 *
 * 쓰는 곳: src/pages/book/[id].astro(교과서 쪽의 ::회로 자리), src/pages/learn/[unit]/[lesson].astro(실제 키트 배선 보기),
 * src/pages/start/board/index.astro(키트에 부품을 꽂는 예). Node 쪽 검사(check:book)는 이 파일을 쓰지 못하므로 circuits-schema.ts를 직접 읽는다.
 */
import { CIRCUITS_FILE, circuitsForLesson, findCircuit, parseCircuitsYaml, type CircuitFigure, type CircuitList } from './circuits-schema.ts';

// 저장소 뿌리 기준 경로(parts-data.ts가 content/parts/를 읽는 방법과 같다)
const files = import.meta.glob<string>('/scripts/circuits/*.yaml', { query: '?raw', eager: true, import: 'default' });
const source = files[`/${CIRCUITS_FILE}`];

if (source === undefined) {
  throw new Error(`회로 그림 목록 ${CIRCUITS_FILE}을(를) 찾지 못했어요.`);
}

/** 검사를 마친 회로 그림 목록 */
export const circuitList: CircuitList = parseCircuitsYaml(source);

/** 번호로 그림 하나(없으면 undefined) */
export function circuitById(id: string): CircuitFigure | undefined {
  return findCircuit(circuitList, id);
}

/** 한 차시(label, 예: "2-1-2")의 그림들 — 목록의 차례 그대로 */
export function circuitsOfLesson(label: string): CircuitFigure[] {
  return circuitsForLesson(circuitList, label);
}
