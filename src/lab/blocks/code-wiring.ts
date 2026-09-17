/**
 * 블록에서 온 코드의 머리말 `# @part` 줄을 가상 보드 배선으로 읽는다(순수 함수 — PLAN §8.3 P3-06).
 *
 * [코드로 바꾸기] 뒤 코드 모드에서도(새로고침·공유 링크로 연 뒤에도) 블록이 쓰던 부품이 배선도에 남게 한다.
 * 첫 줄이 블록 표시(BLOCKS_CODE_MARKER)인 코드만 읽는다 — 예제 코드의 배선은 예제 목록(LabExample.parts)이 맡는다.
 * 머리말 모양은 사이트 예제와 같다(src/lab/README.md 2절 ⑦ `# @part touch-digital 17` · `# @part rgb-led r=27 g=32 b=33 as rgb`).
 * 학생이 코드 모드에서 `# @part` 줄의 핀 번호를 고치면 배선도도 따라간다(Pin(…) 번호와 함께 고쳐야 실물과 같다).
 */
import { readExampleMeta } from '../controls/example-meta.ts';
import type { WiringEntry } from '../modules/board/part-types.ts';
import { normalizeWiringSpecs } from '../modules/board/wiring-spec.ts';
import { PART_KINDS, isBlocksCode } from './catalog.ts';

const LABEL_BY_PART = new Map(PART_KINDS.flatMap((info) => (info.boardPart ? [[info.boardPart, info.label] as const] : [])));

/** 블록에서 온 코드면 배선 목록(바깥 부품이 없으면 빈 목록), 아니면 null */
export function wiringFromBlocksCode(code: string): WiringEntry[] | null {
  if (!isBlocksCode(code)) {
    return null;
  }
  const { parts } = readExampleMeta(code);
  const { entries } = normalizeWiringSpecs(parts, '블록 코드 머리말 # @part');
  return entries.map((entry) => {
    const label = LABEL_BY_PART.get(entry.part);
    return label && entry.label === undefined ? { ...entry, label } : entry;
  });
}
