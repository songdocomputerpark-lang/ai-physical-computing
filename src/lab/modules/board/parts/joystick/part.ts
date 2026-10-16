/**
 * 부품: 조이스틱(X·Y 아날로그 + 버튼 sw 디지털) — 범용 바깥 입력 부품(판 1.5.0, DECISIONS C157, .cache/v150/PLAN.md §3, 키트 카드 4.04 "조이스틱").
 *
 * 쓰는 법(사이드카 parts): `{ part: joystick, pins: { x: 32, y: 33 } }`, 버튼 핀이 있는 모듈이면 `pins: { x: 32, y: 33, sw: 27 }`.
 * 핀이 셋이라 `pin:` 한 개로 줄여 쓸 수 없고, 버튼 핀 sw는 적지 않아도 된다(optional — 적지 않으면 버튼 얘기가 화면에서 빠진다).
 * 핀 번호는 정해 둔 기본이 없다(예제마다 다름). 화면 이름은 label(없으면 "조이스틱"). 설정(options)은 없다 — 그래도 적으면 배선 목록에 주의(bad-option)로 알린다.
 *
 * 값: X·Y는 코드가 ADC로 읽는 값(0~4095, 가운데 2048)이고, 슬라이더 값이 ATTN_11DB·12비트 read()로 그대로 읽힌다(sensor-analog와 같은 전압 계산).
 * 방향은 이 키트 예제의 약속: 오른쪽으로 밀면 X가 커지고, 위로 밀면 Y가 커진다. 버튼 sw는 누르면 0, 떼면 1(joystick-model.ts joystickButtonDrive).
 * 조작(README 7.9-4, 접근성 C18·C19): 보드 그림 아래 "<이름> 조작" 칸 —
 *   · X 슬라이더·Y 슬라이더(화살표 키 1 %, Home·End 양 끝, 값 글자와 aria-valuetext)와 [가운데로] 단추(키보드로 모든 값에 닿는 길, 끌기의 대안 — WCAG 2.5.7)
 *   · [버튼 누르고 있기] 단추(sw가 배선에 있을 때만 — 마우스·손가락·Space·Enter를 누르고 있는 동안, 초점을 잃으면 뗌, 화면 낭독기의 "누르기"는 0.4초)
 *   · 마우스·손가락용 네모 패드: 끌면 막대가 따라가고, 놓으면 가운데로 돌아온다(실물 조이스틱처럼). 화면 낭독기·키보드에는 슬라이더가 있어 패드는 숨긴다(aria-hidden).
 * 모습 값: data-visual-x·y(읽히는 값), pressed(버튼), direction(중앙·위쪽·아래쪽·왼쪽·오른쪽), summary.
 * 그림: 사이트가 그린 모듈(브랜드 중립) — 네모 칸 안의 막대 점 + "X … Y …" 값 글자 + 밀린 방향 글자 + 버튼 글자(색만으로 알리지 않는다).
 */
import { createHoldButton, createLabeledInput, createNote, createRow, type HoldButton } from '../../part-controls.ts';
import { createPartDescriber, fitText } from '../../part-text.ts';
import type { PartControlApi, PartDefinition, PartInstance } from '../../part-types.ts';
import { SLIDER_STEPS, exactAnalogDrive, positionOf, valueAt } from '../sensor-analog/sensor-analog-model.ts';
import { JOYSTICK_CENTER, JOYSTICK_IDLE, JOYSTICK_MAX, joystickButtonDrive, joystickVisual, padToRaw, rawToPad, type JoystickInput } from './joystick-model.ts';

const WIDTH = 126;
const HEIGHT = 72;
const DEFAULT_NAME = '조이스틱';
/** SVG 그림의 칸(네모) 자리와 막대가 움직일 수 있는 거리 */
const BOX = { x: 14, y: 36, size: 34 };
const REACH = 13;

interface Session {
  input: JoystickInput;
  api: PartControlApi | null;
  refresh: (() => void) | null;
}

/** 배선 id마다 지금 조작 상태. visual이 순수 함수라 이 파일 안의 표에 둔다(조작 칸이 만들고 지운다 — 4채널 터치와 같은 방식) */
const sessions = new Map<string, Session>();

function hasButton(instance: PartInstance): boolean {
  return instance.pins.sw !== undefined;
}

function pushDrives(instance: PartInstance, session: Session): void {
  const { api, input } = session;
  if (!api) {
    return;
  }
  api.setDrive('x', exactAnalogDrive(input.x));
  api.setDrive('y', exactAnalogDrive(input.y));
  if (hasButton(instance)) {
    api.setDrive('sw', joystickButtonDrive(input.pressed));
  }
}

function sessionOf(id: string): Session {
  let session = sessions.get(id);
  if (!session) {
    session = { input: JOYSTICK_IDLE, api: null, refresh: null };
    sessions.set(id, session);
  }
  return session;
}

function setInput(instance: PartInstance, next: JoystickInput): void {
  const session = sessionOf(instance.id);
  session.input = next;
  session.refresh?.();
  pushDrives(instance, session);
}

const definition: PartDefinition = {
  id: 'joystick',
  title: DEFAULT_NAME,
  description: '막대를 밀면 X·Y 두 핀에서 값(0~4095, 가운데 약 2048)을 읽는 조이스틱이에요. 버튼 핀(sw)이 있으면 막대를 눌러 0/1을 읽어요.',
  pins: [
    { role: 'x', label: 'X(좌우, 아날로그)', direction: 'in' },
    { role: 'y', label: 'Y(위아래, 아날로그)', direction: 'in' },
    { role: 'sw', label: '버튼', direction: 'in', optional: true },
  ],
  size: { width: WIDTH, height: HEIGHT },
  checkOptions(options) {
    return Object.keys(options).map((name) => `"${name}" 설정은 이 부품에 없어요(조이스틱에는 설정이 없어요).`);
  },
  visual({ instance }) {
    return joystickVisual(sessions.get(instance.id)?.input ?? JOYSTICK_IDLE, hasButton(instance));
  },
  render(target, { svg, instance }) {
    const name = instance.label;
    const withButton = hasButton(instance);
    const body = svg('rect', { x: 0, y: 0, width: WIDTH, height: HEIGHT, rx: 5, fill: '#1e3a5f', stroke: '#0f2238', 'stroke-width': 1.2 });
    const pinMarks = ['x', 'y', ...(withButton ? ['sw'] : [])].map((_, index) =>
      svg('rect', { x: 5 + index * 18, y: -3, width: 8, height: 6, rx: 1, fill: '#e8c46a', stroke: '#8a6d1f', 'stroke-width': 0.8 }),
    );
    const pinText = `X${instance.pins.x ?? ''} Y${instance.pins.y ?? ''}${withButton ? ` B${instance.pins.sw}` : ''}`;
    const pinLabel = svg('text', { x: 62, y: 12, class: 'board-part__label board-part__label--small' }, [pinText]);
    const title = svg('text', { x: WIDTH / 2, y: 28, 'text-anchor': 'middle', class: 'board-part__title' }, [fitText(name, WIDTH - 10, 9)]);
    const box = svg('rect', { x: BOX.x, y: BOX.y, width: BOX.size, height: BOX.size, rx: 4, fill: '#0f2238', stroke: '#9fb3c8', 'stroke-width': 1.2 });
    const cross = svg('path', {
      d: `M ${BOX.x + BOX.size / 2} ${BOX.y} V ${BOX.y + BOX.size} M ${BOX.x} ${BOX.y + BOX.size / 2} H ${BOX.x + BOX.size}`,
      stroke: '#4b6a8a',
      'stroke-width': 0.8,
    });
    const centerX = BOX.x + BOX.size / 2;
    const centerY = BOX.y + BOX.size / 2;
    const ring = svg('circle', { cx: centerX, cy: centerY, r: 8, fill: 'none', stroke: '#fbbf24', 'stroke-width': 2.5, opacity: 0 });
    const knob = svg('circle', { cx: centerX, cy: centerY, r: 5.5, fill: '#dbe4ee', stroke: '#9fb3c8', 'stroke-width': 1.5 });
    const values = svg('text', { x: 58, y: 44, class: 'board-part__label board-part__label--small' }, ['X2048 Y2048']);
    const direction = svg('text', { x: 58, y: 56, class: 'board-part__state' }, ['중앙']);
    const button = svg('text', { x: 58, y: 68, class: 'board-part__label board-part__label--small' }, [withButton ? '버튼 뗌' : '']);
    target.append(body, ...pinMarks, pinLabel, title, box, cross, ring, knob, values, direction, button);

    const describe = createPartDescriber(target, svg);
    return (visual) => {
      const x = typeof visual.x === 'number' ? visual.x : JOYSTICK_CENTER;
      const y = typeof visual.y === 'number' ? visual.y : JOYSTICK_CENTER;
      const pad = rawToPad(x, y);
      const knobX = centerX + (pad.fractionX - 0.5) * 2 * REACH;
      const knobY = centerY + (pad.fractionY - 0.5) * 2 * REACH;
      const pressed = visual.pressed === true;
      knob.setAttribute('cx', String(knobX));
      knob.setAttribute('cy', String(knobY));
      knob.setAttribute('fill', pressed ? '#fde68a' : '#dbe4ee');
      knob.setAttribute('stroke', pressed ? '#d97706' : '#9fb3c8');
      ring.setAttribute('cx', String(knobX));
      ring.setAttribute('cy', String(knobY));
      ring.setAttribute('opacity', pressed ? '1' : '0');
      values.textContent = `X${x} Y${y}`;
      direction.textContent = typeof visual.direction === 'string' ? visual.direction : '중앙';
      if (withButton) {
        button.textContent = pressed ? '버튼 누름' : '버튼 뗌';
      }
      describe(`${name}: ${typeof visual.summary === 'string' ? visual.summary : ''}. 오른쪽으로 밀면 X가, 위로 밀면 Y가 커져요.`);
    };
  },
  controls(host, api) {
    const instance = api.instance;
    const id = instance.id;
    const withButton = hasButton(instance);
    const session = sessionOf(id);
    session.api = api;

    host.append(
      createNote(
        `막대를 밀어 X·Y 값(0~${JOYSTICK_MAX}, 가운데 ${JOYSTICK_CENTER})을 정해요. 오른쪽으로 밀면 X가, 위로 밀면 Y가 커져요. 슬라이더는 화살표 키로 한 칸씩, Home·End로 양 끝으로 옮겨요.${
          withButton ? ' 버튼은 단추를 누르고 있는 동안(Space나 Enter도 돼요) 눌려요.' : ''
        }`,
      ),
    );

    // 마우스·손가락용 패드 — 화면 낭독기·키보드는 아래 슬라이더를 쓴다
    const pad = document.createElement('div');
    pad.dataset.joystickPad = '';
    pad.setAttribute('aria-hidden', 'true');
    pad.style.position = 'relative';
    pad.style.width = 'min(12rem, 100%)';
    pad.style.aspectRatio = '1 / 1';
    pad.style.border = '2px solid var(--color-border)';
    pad.style.borderRadius = 'var(--radius-md)';
    pad.style.background =
      'linear-gradient(var(--color-border), var(--color-border)) center / 1px 100% no-repeat, linear-gradient(var(--color-border), var(--color-border)) center / 100% 1px no-repeat, var(--color-bg)';
    pad.style.touchAction = 'none';
    pad.style.cursor = 'grab';
    const padKnob = document.createElement('div');
    padKnob.style.position = 'absolute';
    padKnob.style.width = '1.75rem';
    padKnob.style.height = '1.75rem';
    padKnob.style.borderRadius = '50%';
    padKnob.style.transform = 'translate(-50%, -50%)';
    padKnob.style.background = 'var(--color-accent)';
    padKnob.style.border = '2px solid var(--color-bg)';
    padKnob.style.boxShadow = '0 0 0 1px var(--color-accent)';
    padKnob.style.pointerEvents = 'none';
    pad.append(padKnob);
    const padRow = createRow();
    padRow.append(pad);

    const makeSlider = (axis: 'x' | 'y', title: string) => {
      const input = document.createElement('input');
      input.type = 'range';
      input.min = '0';
      input.max = String(SLIDER_STEPS);
      input.step = '1';
      input.dataset.joystickSlider = axis;
      input.style.width = '100%';
      input.style.accentColor = 'var(--color-accent)';
      // 슬라이더 이름은 늘 같은 제목("X(좌우)"), 바뀌는 값은 옆 글자와 aria-valuetext로 — 값이 이름에 섞이지 않게
      const labeled = createLabeledInput({ idPrefix: `joystick-${axis}`, title, input });
      labeled.value.dataset.joystickValueText = axis;
      input.addEventListener('input', () => {
        const value = valueAt(Number(input.value), { min: 0, max: JOYSTICK_MAX });
        setInput(instance, { ...sessionOf(id).input, [axis]: value });
      });
      return { label: labeled.wrap, caption: labeled.value, input, title };
    };
    const sliderX = makeSlider('x', 'X(좌우)');
    const sliderY = makeSlider('y', 'Y(위아래)');

    const centerButton = document.createElement('button');
    centerButton.type = 'button';
    centerButton.className = 'lab-button lab-button--small';
    centerButton.textContent = '가운데로';
    centerButton.dataset.joystickCenter = '';
    centerButton.addEventListener('click', () => setInput(instance, { ...sessionOf(id).input, x: JOYSTICK_CENTER, y: JOYSTICK_CENTER }));

    const actions = createRow();
    actions.append(centerButton);
    let hold: HoldButton | null = null;
    if (withButton) {
      hold = createHoldButton({
        text: '버튼 누르고 있기',
        onChange: (pressed) => setInput(instance, { ...sessionOf(id).input, pressed }),
      });
      hold.element.dataset.joystickHold = '';
      actions.append(hold.element);
    }
    const status = createNote('');
    status.dataset.joystickStatus = '';
    host.append(padRow, sliderX.label, sliderY.label, actions, status);

    // 패드 끌기 — 포인터를 붙잡고 따라가다가 놓으면 가운데로 돌아온다
    let dragging = false;
    const dragTo = (event: PointerEvent) => {
      const rect = pad.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return;
      }
      const raw = padToRaw((event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
      setInput(instance, { ...sessionOf(id).input, x: raw.x, y: raw.y });
    };
    const endDrag = () => {
      if (!dragging) {
        return;
      }
      dragging = false;
      pad.style.cursor = 'grab';
      setInput(instance, { ...sessionOf(id).input, x: JOYSTICK_CENTER, y: JOYSTICK_CENTER });
    };
    pad.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      try {
        pad.setPointerCapture(event.pointerId);
      } catch {
        // 붙잡지 못해도 pointerup·pointercancel로 놓는다.
      }
      dragging = true;
      pad.style.cursor = 'grabbing';
      dragTo(event);
    });
    pad.addEventListener('pointermove', (event) => {
      if (dragging) {
        dragTo(event);
      }
    });
    pad.addEventListener('pointerup', endDrag);
    pad.addEventListener('pointercancel', endDrag);
    pad.addEventListener('lostpointercapture', endDrag);

    const refresh = () => {
      const current = sessionOf(id).input;
      const visual = joystickVisual(current, withButton);
      for (const slider of [sliderX, sliderY]) {
        const axis = slider.input.dataset.joystickSlider === 'x' ? 'x' : 'y';
        const value = current[axis];
        const position = positionOf(value, { min: 0, max: JOYSTICK_MAX });
        if (slider.input.value !== String(position)) {
          slider.input.value = String(position);
        }
        slider.caption.textContent = String(value);
        slider.input.setAttribute('aria-valuetext', `${slider.title} ${value}, 범위의 ${position}%`);
      }
      const place = rawToPad(current.x, current.y);
      padKnob.style.left = `${place.fractionX * 100}%`;
      padKnob.style.top = `${place.fractionY * 100}%`;
      hold?.setPressed(current.pressed);
      status.textContent = `지금: ${visual.summary}`;
      host.dataset.joystickX = String(visual.x);
      host.dataset.joystickY = String(visual.y);
    };
    session.refresh = refresh;
    refresh();
    // 처음 전압·버튼 값을 건다 — 배선을 그리는 중이라 한 박자 뒤에(보드 화면이 부품 목록을 다 만든 뒤)
    queueMicrotask(() => {
      if (sessions.get(id) === session && session.api === api) {
        pushDrives(instance, session);
      }
    });
    return {
      destroy() {
        if (sessions.get(id) === session) {
          sessions.delete(id);
        }
        session.api = null;
        session.refresh = null;
      },
    };
  },
};

export default definition;
