/**
 * 가상 보드 화면(DOM) — 보드 그림·배선도·부품·핀 표를 그리고 입력 부품의 마우스·터치·키보드 조작을 공통으로 처리한다(PLAN §8.3 P3-01·P3-02).
 * HTML 틀은 src/components/lab/BoardIo.astro(ESP32 실습실 io 슬롯), 상태 모양은 state.ts, 자리 계산은 layout.ts, 보드·선 그리기는
 * board-drawing.ts, 부품은 parts/<부품>/part.ts.
 *
 * 테스트가 읽는 값
 *   [data-board-stage]의 data-board-phase(stopped·run·idle·end)·data-board-zoom-level(fit|large)·data-board-external(바깥 부품 있음)
 *   부품 [data-board-part="<배선 id>"]: data-part(부품 id), data-visual-<이름>(부품 visual 값), 입력 부품은 aria-pressed
 *   핀 머리·선·브레드보드: board-drawing.ts 머리말
 *   배선 목록 [data-board-problems] > li[data-level][data-code]
 *   핀 표 행 [data-board-pin="<GPIO>"]: data-mode·data-level(0|1)·data-driven(true|false)
 *
 * 접근성: 입력 부품은 role="button"·tabindex=0·aria-pressed이고 Space·Enter를 누르고 있는 동안 눌린다(초점을 잃으면 뗀다).
 * 누르는 자리(부품 그림 전체의 투명 사각형 — WCAG 2.5.8 24px 이상)와 두 겹 초점 테두리(짙은 기판·밝은 브레드보드 어디서나 보이게)는 여기서 붙인다.
 * 출력 부품은 role="img"와 상태가 든 이름(예: "내장 LED(GPIO2): 켜짐")을 갖는다. 핀 값은 표에 글자(1 (HIGH))로도 있다 — 색만으로 알리지 않는다.
 * 부품 조작 칸(병렬 제작 준비 2026-09-17): 부품 정의에 controls가 있으면 [data-board-controls] 안에 그 부품 전용 칸(section[data-board-part-controls="<배선 id>"],
 * 제목 "<부품 이름> 조작")을 만들어 controls(host, api)를 부른다(HTML 단추·막대 — 키보드·화면 낭독기가 기본으로 된다). 조작 칸이 없으면 영역을 숨긴다.
 * [그림 크게 보기]는 그림을 넓게 펴고 가로로 밀어 보게 한다(휴대폰에서 핀 번호가 작을 때). 고른 값은 이 컴퓨터에 기억한다(기록 지우기 대상).
 */
import { readItem, writeItem } from '../../../lib/storage.ts';
import { createBoardDrawing } from './board-drawing.ts';
import { planBoardDrawing, type BoardDrawingPlan } from './layout.ts';
import type { PartControlApi, PartControlHandle, PartDefinition, PartInstance, PartUpdateExtra, PartVisual, WiringIssue } from './part-types.ts';
import { partsByGpio } from './parts.ts';
import { levelText, modeText, phaseText, type BoardSnapshot, type PartDeviceState } from './state.ts';
import { svgElement } from './svg.ts';

export interface BoardViewElements {
  /** 그림이 들어갈 자리 */
  readonly stage: HTMLElement;
  readonly pinRows: HTMLElement | null;
  readonly pinsEmpty: HTMLElement | null;
  readonly phaseText: HTMLElement | null;
  readonly problems: HTMLElement | null;
  /** [그림 크게 보기] 단추(aria-pressed·글자가 [원래 크기로]로 바뀐다) */
  readonly zoomButton?: HTMLButtonElement | null;
  /** 그림 칸을 감싸는 틀 — 그림이 칸보다 넓으면 data-board-overflow="yes"(오른쪽 그늘) */
  readonly stageWrap?: HTMLElement | null;
  /** "옆으로 밀어 보세요" 한 줄 */
  readonly scrollHint?: HTMLElement | null;
  /** 바깥 부품이 없을 때 보이는 한 줄 안내 */
  readonly wiringEmpty?: HTMLElement | null;
  /** 부품 조작 칸 영역([data-board-controls] — 안의 [data-board-controls-list]에 부품마다 칸을 넣는다) */
  readonly controls?: HTMLElement | null;
}

export interface BoardViewOptions {
  readonly definitions: ReadonlyMap<string, PartDefinition>;
  /** 입력 부품의 눌림이 바뀔 때(눌린 배선 id 모음) */
  onActiveChange(activeIds: ReadonlySet<string>): void;
  readonly reducedMotion?: () => boolean;
  /** 그림 크기 선택을 기억할 저장 이름(없으면 기억하지 않음) */
  readonly zoomStorageName?: string;
  /** 부품 조작 칸에 넘길 도구를 만든다(index.ts — 누르는 값·파이썬 부품에 보내기). 없으면 조작 칸을 그리지 않는다 */
  controlApi?(instance: PartInstance, definition: PartDefinition): PartControlApi;
}

export interface BoardView {
  setWiring(instances: readonly PartInstance[], issues: readonly WiringIssue[]): void;
  /**
   * 실행 중에 파이썬이 알린 안내('board.notice' — 코드가 배선과 어긋나게 핀을 씀)를 배선 문제 칸에 함께 보인다.
   * 배선을 다시 그리거나 실행을 새로 시작하면 빈 목록으로 지운다(2026-09-18 검토 반영).
   */
  setRunIssues(issues: readonly WiringIssue[]): void;
  /** 스냅샷과 부품 장치 상태(배선 id → 마지막 'board.device')로 부품 모습·핀 표를 고친다 */
  update(snapshot: BoardSnapshot, devices?: ReadonlyMap<string, PartDeviceState>): void;
  readonly activeIds: ReadonlySet<string>;
  /** 마지막으로 그린 배선 계획(테스트·디버깅) */
  readonly plan: BoardDrawingPlan | null;
  destroy(): void;
}

export type BoardZoom = 'fit' | 'large';

/** 배선 목록의 수준 글(색만으로 알리지 않게 앞에 붙인다) */
export const ISSUE_LEVEL_TEXT: Readonly<Record<WiringIssue['level'], string>> = Object.freeze({ error: '오류', warning: '주의', info: '참고' });
/** 문제 칸에 보이는 차례(심한 것부터) */
const ISSUE_LEVEL_ORDER: Readonly<Record<WiringIssue['level'], number>> = Object.freeze({ error: 0, warning: 1, info: 2 });

function reducedMotionDefault(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function visualChanged(before: PartVisual | undefined, after: PartVisual): boolean {
  if (!before) {
    return true;
  }
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    if (before[key] !== after[key]) {
      return true;
    }
  }
  return false;
}

/** 출력 부품의 화면 낭독기 이름: "진동 모터(GPIO19): 진동 중 — 설명" */
export function visualSummary(definition: PartDefinition, instance: PartInstance, visual: PartVisual): string {
  const pins = Object.values(instance.pins)
    .map((gpio) => `GPIO${gpio}`)
    .join('·');
  let state = '';
  if (typeof visual.summary === 'string' && visual.summary.trim() !== '') {
    // (P3-03) 부품이 스스로 만든 상태 글 — 서보 각도·버저 Hz·팬 방향·패드 값처럼 lit·on·pressed로 말할 수 없는 것
    state = visual.summary.trim();
  } else if (typeof visual.lit === 'boolean') {
    state = visual.lit ? (typeof visual.brightness === 'number' && visual.brightness < 100 ? `켜짐(밝기 ${visual.brightness}%)` : '켜짐') : '꺼짐';
  } else if (typeof visual.on === 'boolean') {
    state = visual.on ? (typeof visual.strength === 'number' && visual.strength < 100 ? `진동 중(세기 ${visual.strength}%)` : '진동 중') : '멈춤';
  } else if (typeof visual.pressed === 'boolean') {
    state = visual.pressed ? '누름' : '뗌';
  }
  return `${instance.label}(${pins})${state ? `: ${state}` : ''} — ${definition.description}`;
}

interface MountedPart {
  readonly instance: PartInstance;
  readonly definition: PartDefinition;
  readonly element: SVGGElement;
  readonly apply: (visual: PartVisual, extra: PartUpdateExtra) => void;
  visual: PartVisual | undefined;
  cleanup: (() => void)[];
  /** 부품 조작 칸(있으면) */
  controls: { readonly host: HTMLElement; readonly handle: PartControlHandle | null } | null;
}

function readZoom(name: string | undefined): BoardZoom {
  if (!name) {
    return 'fit';
  }
  try {
    return readItem(name) === 'large' ? 'large' : 'fit';
  } catch {
    return 'fit';
  }
}

export function createBoardView(elements: BoardViewElements, options: BoardViewOptions): BoardView {
  const { stage } = elements;
  const reducedMotion = options.reducedMotion ?? reducedMotionDefault;
  const active = new Set<string>();
  let mounted: MountedPart[] = [];
  let instances: readonly PartInstance[] = [];
  let snapshot: BoardSnapshot | null = null;
  let devices: ReadonlyMap<string, PartDeviceState> = new Map();
  let lastPinsKey = '';
  let plan: BoardDrawingPlan | null = null;
  /** 배선에서 나온 문제(setWiring)와 실행 중 파이썬이 알린 문제(setRunIssues) */
  let wiringIssues: readonly WiringIssue[] = [];
  let runIssues: readonly WiringIssue[] = [];

  const drawing = createBoardDrawing();
  stage.replaceChildren(drawing.svg);
  const cleanups: (() => void)[] = [];

  /*
   * 그림이 칸보다 넓은지 알린다(2026-09-18 검토 반영). 휴대폰 기본 화면은 글자를 읽을 수 있게 그림을 32rem 아래로 줄이지 않고,
   * [그림 크게 보기]는 48rem으로 편다 — 둘 다 좁은 화면에서는 칸 밖으로 넘치므로 "옆으로 밀어 보세요"와 오른쪽 그늘을 보인다.
   */
  const updateOverflow = () => {
    const overflow = stage.scrollWidth - stage.clientWidth > 4;
    if (elements.stageWrap) {
      elements.stageWrap.dataset.boardOverflow = overflow ? 'yes' : 'no';
    }
    if (elements.scrollHint) {
      elements.scrollHint.hidden = !overflow;
    }
  };

  // [그림 크게 보기] ↔ [원래 크기로]
  const zoomButton = elements.zoomButton ?? null;
  const setZoom = (zoom: BoardZoom, remember: boolean) => {
    stage.dataset.boardZoomLevel = zoom;
    if (zoomButton) {
      zoomButton.setAttribute('aria-pressed', String(zoom === 'large'));
      zoomButton.textContent = zoom === 'large' ? '원래 크기로' : '그림 크게 보기';
    }
    if (remember && options.zoomStorageName) {
      try {
        writeItem(options.zoomStorageName, zoom);
      } catch {
        // 저장 공간을 못 쓰면 이번 방문에만 적용한다.
      }
    }
    updateOverflow();
  };
  setZoom(readZoom(options.zoomStorageName), false);
  if (zoomButton) {
    const onZoom = () => setZoom(stage.dataset.boardZoomLevel === 'large' ? 'fit' : 'large', true);
    zoomButton.addEventListener('click', onZoom);
    cleanups.push(() => zoomButton.removeEventListener('click', onZoom));
  }
  if (typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver(() => updateOverflow());
    observer.observe(stage);
    cleanups.push(() => observer.disconnect());
  }

  /** 배선 문제 칸: 배선에서 나온 것 + 실행 중 파이썬이 알린 것(심한 것부터) */
  const renderProblems = () => {
    if (!elements.problems) {
      return;
    }
    const all = [...wiringIssues, ...runIssues].sort((a, b) => ISSUE_LEVEL_ORDER[a.level] - ISSUE_LEVEL_ORDER[b.level]);
    elements.problems.replaceChildren(
      ...all.map((issue) => {
        const item = document.createElement('li');
        item.dataset.level = issue.level;
        item.dataset.code = issue.code;
        const badge = document.createElement('strong');
        badge.className = 'board-io__issue-level';
        badge.textContent = `${ISSUE_LEVEL_TEXT[issue.level]}: `;
        item.append(badge, issue.text);
        return item;
      }),
    );
    elements.problems.hidden = all.length === 0;
  };

  const notify = () => options.onActiveChange(new Set(active));

  const mountPart = (instance: PartInstance, position: { x: number; y: number }): MountedPart | null => {
    const definition = options.definitions.get(instance.part);
    if (!definition) {
      return null;
    }
    const element = svgElement('g', {
      class: `board-part board-part--${definition.id}${definition.onboard ? ' board-part--onboard' : ''}`,
      transform: `translate(${position.x} ${position.y})`,
      'data-board-part': instance.id,
      'data-part': definition.id,
    });
    const interaction = definition.interaction;
    if (interaction) {
      const { width, height } = definition.size;
      // 누르는 자리(그림 전체)와 초점 테두리 두 겹: 짙은 바깥 선 + 노란 안쪽 선(대비: 짙은 기판 위 노랑 8.1:1, 밝은 브레드보드 위 짙은 선 12:1 — 계산값)
      element.append(
        svgElement('rect', { x: -3, y: -3, width: width + 6, height: height + 6, rx: 7, class: 'board-part__focus-outer' }),
        svgElement('rect', { x: -3, y: -3, width: width + 6, height: height + 6, rx: 7, class: 'board-part__focus' }),
      );
    }
    const content = svgElement('g', { class: 'board-part__content' });
    element.append(content);
    const apply = definition.render(content, { instance, definition, svg: svgElement });
    if (interaction) {
      element.append(svgElement('rect', { x: 0, y: 0, width: definition.size.width, height: definition.size.height, rx: 5, fill: 'transparent', class: 'board-part__hit' }));
    }
    const part: MountedPart = { instance, definition, element, apply, visual: undefined, cleanup: [], controls: null };
    if (interaction) {
      element.setAttribute('role', 'button');
      element.setAttribute('tabindex', '0');
      element.setAttribute('aria-pressed', 'false');
      element.classList.add('board-part--interactive');
      const id = instance.id;
      const listen = <K extends keyof SVGElementEventMap>(type: K, handler: (event: SVGElementEventMap[K]) => void) => {
        element.addEventListener(type, handler);
        part.cleanup.push(() => element.removeEventListener(type, handler));
      };
      const press = () => {
        if (!active.has(id)) {
          active.add(id);
          notify();
        }
      };
      const release = () => {
        if (active.delete(id)) {
          notify();
        }
      };
      const toggle = () => {
        if (active.has(id)) {
          active.delete(id);
        } else {
          active.add(id);
        }
        notify();
      };
      listen('pointerdown', (event) => {
        if (event.button !== 0) {
          return;
        }
        event.preventDefault();
        element.focus({ preventScroll: true });
        if (interaction.kind === 'toggle') {
          toggle();
          return;
        }
        try {
          element.setPointerCapture(event.pointerId);
        } catch {
          // 포인터 붙잡기를 못 해도 pointerup·pointercancel로 뗀다.
        }
        press();
      });
      if (interaction.kind === 'momentary') {
        listen('pointerup', release);
        listen('pointercancel', release);
        listen('lostpointercapture', release);
        listen('blur', release);
      }
      listen('keydown', (event) => {
        if (event.key !== ' ' && event.key !== 'Enter') {
          return;
        }
        event.preventDefault();
        if (event.repeat) {
          return;
        }
        if (interaction.kind === 'toggle') {
          toggle();
        } else {
          press();
        }
      });
      if (interaction.kind === 'momentary') {
        listen('keyup', (event) => {
          if (event.key === ' ' || event.key === 'Enter') {
            event.preventDefault();
            release();
          }
        });
      }
    } else {
      element.setAttribute('role', 'img');
    }
    drawing.partsLayer.append(element);
    return part;
  };

  const controlsList = elements.controls?.querySelector<HTMLElement>('[data-board-controls-list]') ?? elements.controls ?? null;

  /** 부품 조작 칸을 만든다(정의에 controls가 있고 index.ts가 도구를 줄 때만) */
  const mountControls = (part: MountedPart) => {
    const { definition, instance } = part;
    if (!definition.controls || !options.controlApi || !controlsList) {
      return;
    }
    const host = document.createElement('section');
    host.className = 'board-part-controls';
    host.dataset.boardPartControls = instance.id;
    host.dataset.part = definition.id;
    const headingId = `board-part-controls-${instance.id}`;
    host.setAttribute('aria-labelledby', headingId);
    const heading = document.createElement('h4');
    heading.className = 'board-part-controls__heading';
    heading.id = headingId;
    heading.textContent = `${instance.label} 조작`;
    host.append(heading);
    controlsList.append(host);
    let handle: PartControlHandle | null = null;
    try {
      handle = definition.controls(host, options.controlApi(instance, definition)) ?? null;
    } catch (error) {
      const note = document.createElement('p');
      note.className = 'board-io__note';
      note.textContent = `이 부품의 조작 칸을 만들지 못했어요: ${error instanceof Error ? error.message : String(error)}`;
      host.append(note);
    }
    part.controls = { host, handle };
  };

  const destroyControls = (part: MountedPart) => {
    if (!part.controls) {
      return;
    }
    try {
      part.controls.handle?.destroy?.();
    } catch {
      // 조작 칸 정리에 실패해도 칸은 지운다.
    }
    part.controls.host.remove();
    part.controls = null;
  };

  const renderPins = (current: BoardSnapshot) => {
    const connected = partsByGpio(instances, options.definitions);
    drawing.updatePins(current, connected);
    const { pinRows, pinsEmpty } = elements;
    if (!pinRows) {
      return;
    }
    const pins = [...current.pins.values()].sort((a, b) => a.id - b.id);
    const key = JSON.stringify([current.phase, pins, [...connected.entries()]]);
    if (key === lastPinsKey) {
      return;
    }
    lastPinsKey = key;
    const rows = pins.map((pin) => {
      const row = document.createElement('tr');
      row.dataset.boardPin = String(pin.id);
      row.dataset.mode = pin.mode ?? '';
      row.dataset.level = String(pin.level);
      row.dataset.driven = String(pin.driven);
      const name = document.createElement('th');
      name.scope = 'row';
      name.textContent = `GPIO${pin.id}`;
      const mode = document.createElement('td');
      mode.textContent = modeText(pin) + (pin.irq ? ' · 인터럽트' : '');
      const level = document.createElement('td');
      const dot = document.createElement('span');
      dot.className = `board-pins__dot board-pins__dot--${pin.level === 1 ? 'high' : 'low'}`;
      dot.setAttribute('aria-hidden', 'true');
      level.append(dot, levelText(pin.level));
      const parts = document.createElement('td');
      parts.textContent = (connected.get(pin.id) ?? []).join(', ') || '—';
      row.append(name, mode, level, parts);
      return row;
    });
    pinRows.replaceChildren(...rows);
    if (pinsEmpty) {
      pinsEmpty.hidden = rows.length > 0;
    }
  };

  const view: BoardView = {
    get activeIds() {
      return active;
    },
    get plan() {
      return plan;
    },
    setWiring(nextInstances, issues) {
      for (const part of mounted) {
        for (const cleanup of part.cleanup.splice(0)) {
          cleanup();
        }
        destroyControls(part);
        part.element.remove();
      }
      mounted = [];
      instances = nextInstances;
      for (const id of [...active]) {
        if (!nextInstances.some((instance) => instance.id === id)) {
          active.delete(id);
        }
      }
      plan = planBoardDrawing(nextInstances, options.definitions);
      drawing.applyPlan(plan);
      const byId = new Map(nextInstances.map((instance) => [instance.id, instance]));
      for (const placed of plan.parts) {
        const instance = byId.get(placed.id);
        if (!instance) {
          continue;
        }
        const part = mountPart(instance, { x: placed.x, y: placed.y });
        if (part) {
          mounted.push(part);
          mountControls(part);
        }
      }
      if (elements.controls) {
        elements.controls.hidden = !mounted.some((part) => part.controls !== null);
      }
      stage.dataset.boardExternal = String(plan.breadboard !== null);
      if (elements.wiringEmpty) {
        elements.wiringEmpty.hidden = plan.breadboard !== null;
      }
      wiringIssues = issues;
      renderProblems();
      lastPinsKey = '';
      if (snapshot) {
        view.update(snapshot, devices);
      }
    },
    setRunIssues(issues) {
      runIssues = issues;
      renderProblems();
    },
    update(next, nextDevices) {
      snapshot = next;
      if (nextDevices) {
        devices = nextDevices;
      }
      stage.dataset.boardPhase = next.phase;
      if (elements.phaseText) {
        const text = phaseText(next);
        if (elements.phaseText.textContent !== text) {
          elements.phaseText.textContent = text;
        }
      }
      for (const part of mounted) {
        const isActive = active.has(part.instance.id);
        if (part.definition.interaction) {
          part.element.setAttribute('aria-pressed', String(isActive));
        }
        const device = devices.get(part.instance.id);
        const motion = reducedMotion();
        const visual = part.definition.visual({ snapshot: next, instance: part.instance, active: isActive, reducedMotion: motion, ...(device ? { device } : {}) });
        if (!visualChanged(part.visual, visual)) {
          continue;
        }
        part.visual = visual;
        const extra: PartUpdateExtra = { snapshot: next, reducedMotion: motion, ...(device ? { device } : {}) };
        part.apply(visual, extra);
        try {
          part.controls?.handle?.update?.(visual, extra);
        } catch {
          // 조작 칸 갱신 실패가 보드 그림을 멈추지 않게 한다.
        }
        for (const [name, value] of Object.entries(visual)) {
          part.element.setAttribute(`data-visual-${name.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)}`, String(value));
        }
        const pins = Object.values(part.instance.pins)
          .map((gpio) => `GPIO${gpio}`)
          .join('·');
        if (part.definition.interaction) {
          const how = part.definition.interaction.kind === 'toggle' ? '누를 때마다 켜짐과 꺼짐이 바뀌어요' : '누르고 있는 동안 눌려요';
          part.element.setAttribute('aria-label', `${part.definition.interaction.label}(${pins}) — ${how}`);
        } else {
          part.element.setAttribute('aria-label', visualSummary(part.definition, part.instance, visual));
        }
      }
      renderPins(next);
    },
    destroy() {
      for (const part of mounted) {
        for (const cleanup of part.cleanup.splice(0)) {
          cleanup();
        }
        destroyControls(part);
      }
      for (const cleanup of cleanups.splice(0)) {
        cleanup();
      }
      mounted = [];
      drawing.svg.remove();
    },
  };
  return view;
}
