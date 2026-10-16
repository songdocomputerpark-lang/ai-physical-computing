/**
 * 범용 부품 4종(판 1.5.0)의 조작 칸(controls)이 함께 쓰는 HTML 도우미. 4채널 터치 부품(parts/touch-analog-4ch)의 패드 단추와 같은 조작 규칙이다:
 * - 마우스·손가락: 누르고 있는 동안 눌림(포인터를 붙잡고, 놓거나 취소되면 뗌)
 * - 키보드: 초점을 옮겨 Space·Enter를 누르고 있는 동안 눌림(키를 떼거나 초점을 잃으면 뗌)
 * - 화면 낭독기의 "누르기"(키·포인터 없이 온 click): 0.4초 눌렀다 뗌
 * 눌림은 색만이 아니라 굵은 안쪽 테두리와 aria-pressed로도 알린다(WCAG 1.4.1).
 */

/** 화면 낭독기의 "누르기"로 온 click이 누르고 있는 시간(ms) */
export const TAP_MS = 400;

/** 누르고 있는 동안만 켜지는 단추(홀드 단추) */
export interface HoldButton {
  readonly element: HTMLButtonElement;
  /** 모델이 정한 눌림을 모습에 반영(aria-pressed·굵은 테두리). onChange는 부르지 않는다 */
  setPressed(pressed: boolean): void;
  setText(text: string): void;
}

/** 눌린 단추의 모습(굵은 안쪽 테두리 + 강조 배경) */
export function applyPressedLook(button: HTMLElement, pressed: boolean): void {
  button.setAttribute('aria-pressed', String(pressed));
  button.style.background = pressed ? 'var(--color-accent-soft)' : '';
  button.style.borderColor = pressed ? 'var(--color-accent)' : '';
  button.style.boxShadow = pressed ? 'inset 0 0 0 3px var(--color-accent)' : '';
}

export function createHoldButton(config: { readonly text: string; readonly onChange: (pressed: boolean) => void; readonly tapMs?: number }): HoldButton {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'lab-button lab-button--small';
  button.textContent = config.text;
  applyPressedLook(button, false);
  let down = false;
  const set = (pressed: boolean) => {
    if (down === pressed) {
      return;
    }
    down = pressed;
    applyPressedLook(button, pressed);
    config.onChange(pressed);
  };
  button.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    button.focus({ preventScroll: true });
    try {
      button.setPointerCapture(event.pointerId);
    } catch {
      // 붙잡지 못해도 pointerup·pointercancel로 뗀다.
    }
    set(true);
  });
  const release = () => set(false);
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', release);
  button.addEventListener('blur', release);
  button.addEventListener('keydown', (event) => {
    if (event.key !== ' ' && event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    if (!event.repeat) {
      set(true);
    }
  });
  button.addEventListener('keyup', (event) => {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      set(false);
    }
  });
  // 화면 낭독기의 "누르기"처럼 키·포인터 없이 온 click(detail 0): 잠깐 눌렀다 뗀다
  button.addEventListener('click', (event) => {
    if (event.detail !== 0) {
      return;
    }
    set(true);
    window.setTimeout(() => set(false), config.tapMs ?? TAP_MS);
  });
  return {
    element: button,
    setPressed(pressed) {
      down = pressed;
      applyPressedLook(button, pressed);
    },
    setText(text) {
      if (button.textContent !== text) {
        button.textContent = text;
      }
    },
  };
}

/** 조작 칸의 설명 문단(바깥 여백 없음) */
export function createNote(text: string): HTMLParagraphElement {
  const note = document.createElement('p');
  note.style.margin = '0';
  note.textContent = text;
  return note;
}

/** 단추·막대를 한 줄로 늘어놓는 틀(좁으면 줄바꿈) */
export function createRow(label?: string): HTMLDivElement {
  const row = document.createElement('div');
  row.style.display = 'flex';
  row.style.flexWrap = 'wrap';
  row.style.alignItems = 'center';
  row.style.gap = 'var(--space-2)';
  if (label !== undefined) {
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', label);
  }
  return row;
}

let controlIdCounter = 0;

/** 조작 칸의 입력 칸에 달 문서 안에서 하나뿐인 id(label의 for와 이을 때) — 한 문서에 보드 화면이 둘이어도 겹치지 않는다 */
export function uniqueControlId(prefix: string): string {
  controlIdCounter += 1;
  return `board-part-control-${prefix}-${controlIdCounter}`;
}

/**
 * "제목 … 지금 값" 한 줄과 그 아래 입력 칸을 한 묶음으로 만든다. 입력 칸의 이름(label)은 늘 같은 제목이고 바뀌는 값은 옆 글자(span)에만 둔다 —
 * 값이 이름에 섞이면 화면 낭독기가 움직일 때마다 이름이 바뀌어 읽는다(값은 input의 aria-valuetext로 알린다). `<output>`은 쓰지 않는다(저절로 읽는 알림 영역).
 */
export function createLabeledInput(config: {
  readonly idPrefix: string;
  readonly title: string;
  readonly input: HTMLInputElement;
  /** 입력 칸을 다른 요소(양 끝 이름과 한 줄 등)에 담아 제목 아래에 둘 때 그 요소. 없으면 입력 칸 자체 */
  readonly control?: HTMLElement;
}): {
  readonly wrap: HTMLDivElement;
  readonly value: HTMLSpanElement;
} {
  const id = uniqueControlId(config.idPrefix);
  config.input.id = id;
  const wrap = document.createElement('div');
  wrap.style.display = 'grid';
  wrap.style.gap = 'var(--space-1)';
  const head = document.createElement('div');
  head.style.display = 'flex';
  head.style.flexWrap = 'wrap';
  head.style.justifyContent = 'space-between';
  head.style.gap = 'var(--space-1) var(--space-2)';
  const label = document.createElement('label');
  label.htmlFor = id;
  label.style.fontWeight = 'var(--weight-semibold)';
  label.textContent = config.title;
  const value = document.createElement('span');
  head.append(label, value);
  wrap.append(head, config.control ?? config.input);
  return { wrap, value };
}
