/**
 * 대단원 소개 글(판 1.3.0 R1-083·R1-084) — "이 단원을 마치면 할 수 있는 것", 큰 그림(보고 → 판단하고 → 움직여요)에서 이 단원의 자리, 걸리는 시간.
 * 순수 함수라 Vitest가 검사한다(tests/unit/lesson/unit-about.test.ts).
 *
 * 큰 그림 단계 이름과 단원 몫은 홈의 흐름 그림(src/components/home/home-content.ts)과 같다:
 *   I 보고 판단하기 · II 움직이기 · III 잇기(판단한 것을 보드로 보냄) · IV 합치기
 * 학생 글이라 고1 눈높이로, 한 줄에 하나만 적는다. 단원 설명(nav.ts)과 겹치지 않게 "무엇을 할 수 있게 되는지"만 말한다.
 */
import type { LessonUnitNumber } from './unit-style.ts';

/** 큰 그림 단계 */
export type FlowStage = 'see' | 'judge' | 'act';

export const FLOW_STAGES: readonly { readonly id: FlowStage; readonly label: string }[] = Object.freeze([
  { id: 'see', label: '보고' },
  { id: 'judge', label: '판단하고' },
  { id: 'act', label: '움직여요' },
]);

export interface UnitAbout {
  /** 이 단원이 맡은 큰 그림 단계 */
  readonly stages: readonly FlowStage[];
  /** 단원 몫을 '-기' 꼴 한두 낱말로("보고 판단하기") — 홈 배움 지도 칩(home-content.ts homeMap.stages)과 같은 글 */
  readonly role: string;
  /** 이 단원을 마치면 할 수 있는 것(3줄) */
  readonly outcomes: readonly string[];
}

export const UNIT_ABOUT: Readonly<Record<LessonUnitNumber, UnitAbout>> = Object.freeze({
  1: Object.freeze({
    stages: Object.freeze<FlowStage[]>(['see', 'judge']),
    role: '보고 판단하기',
    outcomes: Object.freeze([
      '카메라 영상에서 인공지능이 손, 얼굴, 몸을 어떻게 알아보는지 설명할 수 있어요.',
      '손 좌표를 읽어 손가락 수나 손끝 사이의 거리를 알아내는 프로그램을 만들 수 있어요.',
      '얼굴과 몸의 점을 비교해 고개를 돌렸는지, 손을 들었는지 판단하는 프로그램을 만들 수 있어요.',
    ]),
  }),
  2: Object.freeze({
    stages: Object.freeze<FlowStage[]>(['act']),
    role: '움직이기',
    outcomes: Object.freeze([
      '입력, 처리, 출력으로 보드가 움직이는 원리를 설명할 수 있어요.',
      'MicroPython으로 LED, 화면, 소리, 모터를 움직일 수 있어요.',
      '센서 값에 따라 부품이 바뀌는 작은 프로그램을 만들 수 있어요.',
    ]),
  }),
  3: Object.freeze({
    stages: Object.freeze<FlowStage[]>(['judge', 'act']),
    role: '잇기',
    outcomes: Object.freeze([
      '인공지능이 알아낸 결과가 바이트가 되어 보드까지 가는 길을 설명할 수 있어요.',
      '시리얼과 블루투스로 컴퓨터와 보드가 글자를 주고받게 할 수 있어요.',
      '손 모양이나 얼굴 인식 결과로 보드의 부품을 움직이는 프로그램을 만들 수 있어요.',
    ]),
  }),
  4: Object.freeze({
    stages: Object.freeze<FlowStage[]>(['see', 'judge', 'act']),
    role: '합치기',
    outcomes: Object.freeze([
      '얼굴 인식과 블루투스를 이어, 눈길을 따라 움직이는 마우스를 만들어 볼 수 있어요.',
      '컴퓨터가 알아낸 신호를 보드의 빛과 소리로 알려 주는 장치를 만들 수 있어요.',
      '배운 것을 모아 우리 곁의 문제를 푸는 나만의 지능화 사물을 계획할 수 있어요.',
    ]),
  }),
});

/** 단원 번호로 소개를 찾는다 */
export function getUnitAbout(unit: LessonUnitNumber): UnitAbout {
  return UNIT_ABOUT[unit];
}

/** 큰 그림 단계 하나가 이 단원 몫인지 */
export function isStageOfUnit(unit: LessonUnitNumber, stage: FlowStage): boolean {
  return UNIT_ABOUT[unit].stages.includes(stage);
}

/** 한 줄 안내: "이 단원은 큰 그림의 "보고 판단하기" 칸이에요." */
export function flowRoleText(unit: LessonUnitNumber): string {
  return `이 단원은 큰 그림의 "${UNIT_ABOUT[unit].role}" 칸이에요.`;
}

function minutesText(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) {
    return `${minutes}분`;
  }
  return rest === 0 ? `${hours}시간` : `${hours}시간 ${rest}분`;
}

/**
 * 걸리는 시간 한 줄. 모든 차시가 같은 시간이면 "18차시 × 50분 = 15시간", 다르면 "18차시, 모두 약 15시간 30분".
 * 시간을 적지 않은 차시는 합에서 빼고, 하나도 없으면 undefined.
 */
export function unitDurationText(durations: readonly (number | undefined)[]): string | undefined {
  const known = durations.filter((minutes): minutes is number => minutes !== undefined && minutes > 0);
  if (known.length === 0) {
    return undefined;
  }
  const total = known.reduce((sum, minutes) => sum + minutes, 0);
  const first = known[0] as number;
  const same = known.every((minutes) => minutes === first);
  const text = same ? `${known.length}차시 × ${first}분 = ${minutesText(total)}` : `${known.length}차시, 모두 약 ${minutesText(total)}`;
  // 시간이 없는 차시(대단원 마무리 등)가 있으면 진도 글("18차시 중 …")과 수가 달라 보이므로 뺀 것을 밝힌다(통합 확인)
  const missing = durations.length - known.length;
  return missing > 0 ? `${text}(시간이 정해지지 않은 ${missing}차시는 빼고 셌어요)` : text;
}
