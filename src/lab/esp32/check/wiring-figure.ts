/**
 * 실물 점검 도우미의 배선 그림(PLAN §8.3 P3-11) — 가상 보드 그림을 "움직이지 않는 그림"으로 한 장 그린다.
 *
 * 가상 보드 화면(src/lab/modules/board/view.ts)은 파이썬이 보낸 핀 상태에 따라 부품을 바꿔 그리지만, 점검 도우미는
 * "선을 이렇게 꽂아요"만 보여 주면 되므로 같은 그림 부품(board-drawing.ts·layout.ts·parts.ts)을 꺼진 상태로 한 번만 그린다.
 * 그래서 핀 강조·부품 모습을 바꾸는 논리가 없고(누를 수도 없다), 예제 배선도와 같은 자리·같은 색으로 보인다.
 *
 * 쓰는 곳: src/lab/esp32/check/check-page.ts가 항목마다 한 번 부른다. 배선이 없는 항목은 부르지 않는다.
 */
import { createBoardDrawing } from '../../modules/board/board-drawing.ts';
import { planBoardDrawing } from '../../modules/board/layout.ts';
import type { PartInstance, WiringEntry } from '../../modules/board/part-types.ts';
import { PART_DEFINITIONS, onboardWiring, resolveWiring } from '../../modules/board/parts.ts';
import { EMPTY_SNAPSHOT } from '../../modules/board/state.ts';
import { svgElement } from '../../modules/board/svg.ts';

export interface WiringFigure {
  readonly svg: SVGSVGElement;
  /** 배선 검사가 찾은 것(오류·주의·참고) — 글로 함께 보인다 */
  readonly issues: readonly { readonly level: 'error' | 'warning' | 'info'; readonly text: string }[];
  /** 그림에 놓인 바깥 부품(이름·핀) — 글로 함께 보인다 */
  readonly parts: readonly { readonly label: string; readonly pins: string }[];
}

const REDUCED_MOTION = true;

/** 배선 한 줄 목록 → 보드 그림 한 장(꺼진 모습). 배선이 비면 보드만 그린다. */
export function createWiringFigure(entries: readonly WiringEntry[]): WiringFigure {
  const resolved = resolveWiring([...onboardWiring(PART_DEFINITIONS), ...entries], PART_DEFINITIONS);
  const drawing = createBoardDrawing();
  const plan = planBoardDrawing(resolved.instances, PART_DEFINITIONS);
  drawing.applyPlan(plan);

  const byId = new Map<string, PartInstance>(resolved.instances.map((instance) => [instance.id, instance]));
  for (const placed of plan.parts) {
    const instance = byId.get(placed.id);
    const definition = instance ? PART_DEFINITIONS.get(instance.part) : undefined;
    if (!instance || !definition) {
      continue;
    }
    const group = svgElement('g', {
      class: `board-part board-part--${definition.id}${definition.onboard ? ' board-part--onboard' : ''}`,
      transform: `translate(${placed.x} ${placed.y})`,
      'data-board-part': instance.id,
      'data-part': definition.id,
    });
    const content = svgElement('g', { class: 'board-part__content' });
    group.append(content);
    const apply = definition.render(content, { instance, definition, svg: svgElement });
    // 꺼진 모습 한 번만(파이썬이 보낸 상태가 없으니 EMPTY_SNAPSHOT)
    apply(definition.visual({ snapshot: EMPTY_SNAPSHOT, instance, active: false, reducedMotion: REDUCED_MOTION }), {
      snapshot: EMPTY_SNAPSHOT,
      reducedMotion: REDUCED_MOTION,
    });
    drawing.partsLayer.append(group);
  }
  drawing.updatePins(EMPTY_SNAPSHOT, new Map());
  drawing.svg.setAttribute('aria-label', '배선 그림');

  return {
    svg: drawing.svg,
    issues: resolved.issues.map((issue) => ({ level: issue.level, text: issue.text })),
    parts: resolved.instances
      .filter((instance) => !PART_DEFINITIONS.get(instance.part)?.onboard)
      .map((instance) => ({
        label: instance.label,
        pins: Object.entries(instance.pins)
          .map(([role, gpio]) => `${role.toUpperCase()} → GPIO${gpio}`)
          .join(', '),
      })),
  };
}
