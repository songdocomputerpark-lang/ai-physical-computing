/**
 * 가상 보드 부품 레지스트리의 모양(PLAN §8.3 P3-01·P3-02, src/lab/README.md 7절). 타입만 있는 파일이라 실행 코드가 없다.
 *
 * 부품 하나 = src/lab/modules/board/parts/<부품 id>/ 폴더 하나
 *   part.ts          default export PartDefinition(아래) — 이름·핀·그림·상태 반영·조작. 등록 파일 수정 없이 parts.ts가 찾는다.
 *   apc_part_*.py    (선택) 파이썬 쪽 부품 흉내(I2C 장치·네오픽셀처럼 핀만으로 안 되는 부품). /apc에 들어가고 보드가 처음 쓸 때 불러온다.
 *   <학생 import 이름>.py (선택) 학생이 import하는 드라이버 이름 그대로(neopixel.py·ssd1306.py 등 — 저장소 전체에서 이름이 하나)
 *   단위 테스트      tests/unit/lab/board-part-<부품 id>.test.ts 파일 하나에 visual·interaction.drive 같은 순수 함수 검사를 둔다(P3-02 규칙 —
 *                   여러 사람이 부품을 동시에 더해도 같은 테스트 파일을 고치지 않게).
 */
import type { BoardSnapshot, PinDrive } from './state.ts';
import type { svgElement } from './svg.ts';

/** 부품 핀 하나(배선 표 pins의 열쇠가 role) */
export interface PartPin {
  /** 영문 소문자 이름: 'led', 'sig', 'r', 'g', 'b', 'ina' … */
  readonly role: string;
  /** 사람이 읽는 이름: 'LED', '신호' */
  readonly label: string;
  /** 보드 쪽에서 본 방향: 'out' = 보드가 부품을 움직임(LED·버저), 'in' = 부품이 보드에 값을 줌(버튼·센서) */
  readonly direction: 'out' | 'in';
}

/** 학생이 화면에서 누르는 입력 부품의 조작 방식 — 마우스·터치·키보드 처리는 보드 화면(view.ts)이 공통으로 한다 */
export interface PartInteraction {
  /** momentary = 누르고 있는 동안만 켜짐(버튼·터치), toggle = 누를 때마다 켜짐·꺼짐이 바뀜(스위치) */
  readonly kind: 'momentary' | 'toggle';
  /** 조작 이름(화면 낭독기·툴팁): 'BOOT 버튼' */
  readonly label: string;
  /** 눌림 상태(active)일 때 그 역할(role)의 핀을 어떻게 누르는지(순수 함수) */
  drive(active: boolean, role: string): PinDrive;
}

/**
 * 배선 표 한 줄(예제의 parts — 차시 md frontmatter·사이드카·예제 머리말 `# @part`에서 온다, README 7.4).
 * 적는 모양 세 가지는 wiring-spec.ts가 이 모양으로 맞춘다.
 */
export interface WiringEntry {
  /** 부품 id(폴더 이름). 예: 'touch-digital' */
  readonly part: string;
  /** 이 배선에서 부품을 부르는 이름(영문 소문자·숫자·하이픈, 배선 안에서 하나). 적지 않으면 부품 id(겹치면 -2, -3…) */
  readonly id?: string;
  /** role → GPIO 번호. 적지 않은 role은 부품의 defaultPins */
  readonly pins?: Readonly<Record<string, number>>;
  /** 핀이 하나뿐인 부품의 줄임 표기: pin: 17 = pins: { <그 핀의 role>: 17 } */
  readonly pin?: number;
  /** 화면에 보일 이름(선택). 가상 보드가 아직 모르는 부품이면 안내 문장에 이 이름을 쓴다. */
  readonly label?: string;
}

/** 검사를 마친 배선 한 줄 */
export interface PartInstance {
  readonly part: string;
  readonly id: string;
  readonly pins: Readonly<Record<string, number>>;
  readonly label: string;
  /** pins가 모두 부품의 defaultPins에서 왔는지(배선이 핀을 따로 적지 않음) — 사이트 배정 핀 안내(notice)에 쓴다 */
  readonly usesDefaultPins: boolean;
}

/** 가상 보드가 아직 모르는 부품(다음 묶음에서 더해질 부품) — 그림은 없고, 적힌 핀만 파이썬에 알린다(배선 없는 핀 안내를 하지 않게) */
export interface UnknownPartEntry {
  readonly part: string;
  readonly id: string;
  readonly label: string;
  readonly pins: Readonly<Record<string, number>>;
}

/** 배선 검사가 찾은 것 하나. 보드 그림 아래 목록에 수준 글("오류"·"주의"·"참고")과 함께 보인다(색만으로 알리지 않음). */
export interface WiringIssue {
  /** error = 이대로는 실물에서 안 되거나 부품을 못 그림, warning = 되지만 조심할 것, info = 알아 두면 좋은 것 */
  readonly level: 'error' | 'warning' | 'info';
  /** 테스트·문서가 읽는 종류 이름(README 7.4 표) */
  readonly code: string;
  /** 학생이 읽는 한국어 문장 */
  readonly text: string;
  /** 관련 GPIO(있으면) */
  readonly gpio?: number;
}

/** 부품의 모습(그림이 읽는 값). 보드 화면이 data-visual-<이름> 속성으로도 적어 브라우저 테스트가 읽는다. */
export type PartVisual = Readonly<Record<string, string | number | boolean>>;

export interface PartVisualContext {
  readonly snapshot: BoardSnapshot;
  readonly instance: PartInstance;
  /** 입력 부품이 눌려 있는지(입력 부품이 아니면 false) */
  readonly active: boolean;
  /** 움직임 줄이기 설정(떨림·깜빡임 대신 표시등) */
  readonly reducedMotion: boolean;
}

export interface PartRenderContext {
  readonly instance: PartInstance;
  readonly definition: PartDefinition;
  readonly svg: typeof svgElement;
}

/** 부품 그림 안의 한 점(부품 그림 왼쪽 위 기준, SVG 단위) */
export interface PartPoint {
  readonly x: number;
  readonly y: number;
}

export interface PartDefinition {
  /** 폴더 이름과 같은 id(영문 소문자·숫자·하이픈) */
  readonly id: string;
  /** 사람이 읽는 이름: '내장 LED' */
  readonly title: string;
  /** 한 줄 설명(화면 낭독기) */
  readonly description: string;
  /** 개발 보드에 붙어 있는 부품(내장 LED·BOOT 버튼): 배선에 늘 들어가고 핀이 defaultPins로 고정된다 */
  readonly onboard?: boolean;
  readonly pins: readonly PartPin[];
  /** role → 기본 GPIO(onboard 부품은 필수, 나머지는 선택) */
  readonly defaultPins?: Readonly<Record<string, number>>;
  /** 그림 크기(SVG 단위) */
  readonly size: { readonly width: number; readonly height: number };
  /**
   * (바깥 부품) 신호선이 닿는 자리: role → 부품 그림 안의 점. 적지 않으면 그림 윗변에 pins 순서대로 x = 9, 27, 45…(18 간격)에 둔다.
   * x는 18의 배수 + 9로 적는다 — 배선도가 보드 핀 머리(18 간격)와 겹치지 않게 선을 긋는 칸이다(layout.ts).
   */
  readonly anchors?: Readonly<Record<string, PartPoint>>;
  /** (바깥 부품) 전원(GND·VCC) 다리가 나오는 자리. 적지 않으면 그림 아랫변 x = 9(GND)·27(VCC). false면 전원선을 그리지 않는다 */
  readonly power?: { readonly gnd: PartPoint; readonly vcc: PartPoint } | false;
  /**
   * (선택) 이 부품을 defaultPins 그대로 이었을 때 배선 목록에 보일 안내 한 문장(수준 info). 원고에 핀 번호가 없어 사이트가 정한 핀처럼
   * 알아 둘 것을 적는다(예: 진동 모터 — PD-36 "사이트 배정, 실물 확인 전").
   */
  readonly defaultPinsNotice?: string;
  readonly interaction?: PartInteraction;
  /** 파이썬 쪽 부품 흉내 모듈 이름(apc_part_<이름>) — 같은 폴더에 그 .py가 있어야 한다 */
  readonly python?: string;
  /** 보드 상태 → 모습(순수 함수 — 단위 테스트한다) */
  visual(context: PartVisualContext): PartVisual;
  /** target 안에 그림을 한 번 그리고, 모습이 바뀔 때마다 부를 함수를 돌려준다(DOM) */
  render(target: SVGGElement, context: PartRenderContext): (visual: PartVisual) => void;
}
