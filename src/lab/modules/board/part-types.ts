/**
 * 가상 보드 부품 레지스트리의 모양(PLAN §8.3 P3-01, src/lab/README.md 7절). 타입만 있는 파일이라 실행 코드가 없다.
 *
 * 부품 하나 = src/lab/modules/board/parts/<부품 id>/ 폴더 하나
 *   part.ts          default export PartDefinition(아래) — 이름·핀·그림·상태 반영·조작. 등록 파일 수정 없이 parts.ts가 찾는다.
 *   apc_part_*.py    (선택) 파이썬 쪽 부품 흉내(I2C 장치·네오픽셀처럼 핀만으로 안 되는 부품). /apc에 들어가고 보드가 처음 쓸 때 불러온다.
 *   <학생 import 이름>.py (선택) 학생이 import하는 드라이버 이름 그대로(neopixel.py·ssd1306.py 등 — 저장소 전체에서 이름이 하나)
 *   단위 테스트      tests/unit/lab/board-parts.test.ts에 visual·interaction.drive 같은 순수 함수 검사를 더한다.
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

/** 배선 표 한 줄(예제의 parts, 'board.wiring'으로 파이썬에도 간다) */
export interface WiringEntry {
  /** 부품 id(폴더 이름) */
  readonly part: string;
  /** 이 배선에서 부품을 부르는 이름(영문 소문자·숫자·하이픈, 배선 안에서 하나) */
  readonly id: string;
  /** role → GPIO 번호. 적지 않은 role은 부품의 defaultPins */
  readonly pins?: Readonly<Record<string, number>>;
  /** 화면에 보일 이름(선택) */
  readonly label?: string;
}

/** 검사를 마친 배선 한 줄 */
export interface PartInstance {
  readonly part: string;
  readonly id: string;
  readonly pins: Readonly<Record<string, number>>;
  readonly label: string;
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
  readonly interaction?: PartInteraction;
  /** 파이썬 쪽 부품 흉내 모듈 이름(apc_part_<이름>) — 같은 폴더에 그 .py가 있어야 한다 */
  readonly python?: string;
  /** 보드 상태 → 모습(순수 함수 — 단위 테스트한다) */
  visual(context: PartVisualContext): PartVisual;
  /** target 안에 그림을 한 번 그리고, 모습이 바뀔 때마다 부를 함수를 돌려준다(DOM) */
  render(target: SVGGElement, context: PartRenderContext): (visual: PartVisual) => void;
}
