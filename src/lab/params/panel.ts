/**
 * 조절 패널의 화면 논리(PLAN §8.2 P2-04, SPEC §6.1 "값을 바꿔가며 보기") — 코드 속 규약 주석(parse.ts)으로 슬라이더·선택 상자·토글을
 * 만들고, 값을 바꾸면 ① 코드의 그 자리 글자를 바꿔 쓰고(코드와 패널이 늘 같은 값이라 공유 링크·[.py 내려받기]·다음 실행에 그대로 담긴다)
 * ② 실행 중이면 runtime.pushEvent('lab.params', { name, value, type })로 보내, 파이썬 도우미(src/lab/python/apc_runtime.py의
 * sync_params)가 다음 입력 확인 지점(cap.read()·cv2.waitKey()·time.sleep()·get/poll)에서 학생 코드의 전역 변수에 넣는다
 * → 다음 프레임부터 반영된다. 값은 "바뀔 때 한 번"만 보내므로 학생 코드가 반복문 안에서 같은 변수를 스스로 바꾸는 것을 방해하지 않는다.
 *
 * 코드가 바뀔 때마다(편집·예제 불러오기·초기화·공유 링크·패널 자신의 바꿔 쓰기) 다시 읽어 패널을 맞춘다. 이름·종류·범위·설명이 같은 요소는
 * 값만 고쳐(드래그 중인 슬라이더의 초점을 잃지 않게) 나머지만 새로 만든다. 규약이 틀린 줄은 경고 목록에 한국어로 보이고 실행은 그대로 된다.
 * 실행 중이 아닐 때는 파이썬에 보내지 않는다(코드에 적힌 값이 다음 실행의 시작값이고, 도우미도 실행 전에 쌓인 값은 버린다).
 * 제한 모드(JSPI 없음)에서도 코드에 적히므로 다음 [실행]에 반영되고, 실행 중에는 get·poll 지점에서 들어간다 — 안내 글로 알린다.
 * 알려진 빈틈: 실행을 누른 직후 패키지를 받는 동안 바꾼 값은 코드에는 적히지만 그 실행에는 안 들어갈 수 있다(도우미가 실행 준비 때 쌓인 값을
 * 버리므로). 그때는 다시 움직이면 된다.
 *
 * HTML·CSS는 src/components/lab/ParamPanel.astro(LabShell의 panel 슬롯 기본 내용). LabShell.astro의 스크립트가 mountLabShell 뒤에
 * mountParamPanel(root, lab)을 부른다. 테스트가 읽는 값: 뿌리 [data-lab-params]의 data-count(조절 값 수)·data-warnings(경고 수),
 * 요소 [data-lab-param="이름"]의 data-kind·data-value와 그 안의 input(type=range|checkbox)·select, 경고 목록 [data-lab-params-warnings].
 */
import type { LabController } from '../controls/lab-shell.ts';
import {
  PARAMS_CHANNEL,
  formatParamValue,
  paramSpecKey,
  paramUpdate,
  parseParams,
  sliderValueText,
  snapSliderValue,
  type ParamSpec,
  type ParamWarning,
  type SliderParam,
} from './parse.ts';

/** 패널 위 안내 글 */
export const PARAM_NOTE_NORMAL = '값을 바꾸면 코드의 숫자도 함께 바뀌어요. 실행 중이면 다음 프레임부터 반영돼요.';
export const PARAM_NOTE_LIMITED = '이 브라우저(제한 모드)에서는 바꾼 값이 코드에 적혀서 다음 [실행] 때 반영돼요.';

export interface ParamPanelElements {
  readonly root: HTMLElement;
  readonly list: HTMLElement;
  readonly empty: HTMLElement | null;
  readonly warnings: HTMLElement | null;
  readonly note: HTMLElement | null;
}

export interface ParamPanel {
  readonly root: HTMLElement;
  /** 지금 코드에서 읽은 조절 값(순서대로) */
  readonly params: readonly ParamSpec[];
  readonly warnings: readonly ParamWarning[];
  /** 학생이 조작한 것처럼 값을 넣는다(코드가 바뀌고, 실행 중이면 파이썬에도 간다). 이름이 없거나 규약에 맞지 않으면 false. */
  setValue(name: string, value: number | string | boolean): boolean;
  /** 코드를 다시 읽어 패널을 맞춘다(보통은 'code' 이벤트가 알아서 부른다). */
  refresh(): void;
  dispose(): void;
}

interface Entry {
  spec: ParamSpec;
  readonly key: string;
  readonly element: HTMLElement;
  readonly input: HTMLInputElement | HTMLSelectElement;
  readonly output: HTMLElement | null;
}

function q<T extends Element>(root: ParentNode, selector: string): T | null {
  return root.querySelector<T>(selector);
}

export function readParamPanelElements(labRoot: HTMLElement): ParamPanelElements | null {
  const root = q<HTMLElement>(labRoot, '[data-lab-params]');
  const list = root ? q<HTMLElement>(root, '[data-lab-params-list]') : null;
  if (!root || !list) {
    return null;
  }
  return {
    root,
    list,
    empty: q(root, '[data-lab-params-empty]'),
    warnings: q(root, '[data-lab-params-warnings]'),
    note: q(root, '[data-lab-params-note]'),
  };
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}

class ParamPanelController implements ParamPanel {
  readonly root: HTMLElement;
  readonly #lab: LabController;
  readonly #elements: ParamPanelElements;
  readonly #cleanups: (() => void)[] = [];
  readonly #idPrefix: string;
  #entries = new Map<string, Entry>();
  #params: readonly ParamSpec[] = [];
  #warnings: readonly ParamWarning[] = [];
  #running = false;
  #disposed = false;

  constructor(lab: LabController, elements: ParamPanelElements) {
    this.#lab = lab;
    this.#elements = elements;
    this.root = elements.root;
    this.#idPrefix = `lab-${lab.labId}-param`;
    this.#running = lab.runtime.state === 'running';
    this.#cleanups.push(
      lab.on('code', () => this.refresh()),
      lab.on('state', ({ state }) => {
        this.#running = state === 'running';
      }),
      lab.runtime.on('ready', (info) => this.#setNote(info.limited)),
    );
    this.#setNote(lab.runtime.info?.limited ?? false);
    this.refresh();
  }

  get params(): readonly ParamSpec[] {
    return this.#params;
  }

  get warnings(): readonly ParamWarning[] {
    return this.#warnings;
  }

  setValue(name: string, value: number | string | boolean): boolean {
    const entry = this.#entries.get(name);
    return entry ? this.#apply(entry, value) : false;
  }

  refresh(): void {
    if (this.#disposed) {
      return;
    }
    const { params, warnings } = parseParams(this.#lab.getCode());
    this.#params = params;
    this.#warnings = warnings;
    const next = new Map<string, Entry>();
    for (const spec of params) {
      const key = paramSpecKey(spec);
      const existing = this.#entries.get(spec.name);
      let entry: Entry;
      if (existing && existing.key === key) {
        entry = existing;
        entry.spec = spec;
        this.#syncEntry(entry);
      } else {
        existing?.element.remove();
        entry = this.#build(spec, key);
      }
      next.set(spec.name, entry);
    }
    for (const [name, entry] of this.#entries) {
      if (!next.has(name)) {
        entry.element.remove();
      }
    }
    this.#entries = next;

    // 화면 순서를 코드 순서에 맞춘다. 제자리에 있는 요소는 건드리지 않아 드래그 중인 슬라이더가 초점을 잃지 않는다.
    const list = this.#elements.list;
    [...next.values()].forEach((entry, index) => {
      const current = list.children[index] ?? null;
      if (current !== entry.element) {
        list.insertBefore(entry.element, current);
      }
    });

    this.root.dataset.count = String(params.length);
    this.root.dataset.warnings = String(warnings.length);
    if (this.#elements.empty) {
      this.#elements.empty.hidden = params.length > 0;
    }
    this.#renderWarnings(warnings);
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    for (const cleanup of this.#cleanups.splice(0)) {
      cleanup();
    }
    for (const entry of this.#entries.values()) {
      entry.element.remove();
    }
    this.#entries.clear();
  }

  #setNote(limited: boolean): void {
    const note = this.#elements.note;
    if (note) {
      note.textContent = limited ? PARAM_NOTE_LIMITED : PARAM_NOTE_NORMAL;
      note.dataset.limited = limited ? 'yes' : 'no';
    }
  }

  #renderWarnings(warnings: readonly ParamWarning[]): void {
    const box = this.#elements.warnings;
    if (!box) {
      return;
    }
    box.replaceChildren(
      ...warnings.map((warning) => {
        const item = document.createElement('li');
        item.textContent = `${warning.line}번 줄: ${warning.message}`;
        return item;
      }),
    );
    box.hidden = warnings.length === 0;
  }

  /** 값을 코드에 적고(다르면), 실행 중이면 파이썬에 보낸다. */
  #apply(entry: Entry, value: number | string | boolean): boolean {
    const spec = entry.spec;
    const text = formatParamValue(spec, value);
    if (text === null) {
      this.#syncEntry(entry); // 조작 요소를 코드 값으로 되돌린다.
      return false;
    }
    const code = this.#lab.getCode();
    if (code.slice(spec.valueFrom, spec.valueTo) !== spec.valueText) {
      // 코드가 다른 경로로 바뀌어 위치가 어긋났다(있을 수 없지만 방어). 다시 읽고 한 번 더 시도한다.
      this.refresh();
      const fresh = this.#entries.get(spec.name);
      if (!fresh || fresh === entry || this.#lab.getCode().slice(fresh.spec.valueFrom, fresh.spec.valueTo) !== fresh.spec.valueText) {
        return false;
      }
      return this.#apply(fresh, value);
    }
    if (text !== spec.valueText) {
      // 바꿔 쓰면 'code' 이벤트 → refresh()가 같은 요소의 spec(새 위치·값)을 갱신한다.
      this.#lab.replaceCode(spec.valueFrom, spec.valueTo, text, 'param');
    }
    const current = this.#entries.get(spec.name)?.spec ?? spec;
    if (this.#running) {
      const sent = current.kind === 'slider' ? snapSliderValue(current, Number(value)) : value;
      this.#lab.runtime.pushEvent(PARAMS_CHANNEL, paramUpdate(current, sent));
    }
    return true;
  }

  #build(spec: ParamSpec, key: string): Entry {
    const element = el('div', `param param--${spec.kind}`);
    element.dataset.labParam = spec.name;
    element.dataset.kind = spec.kind;
    const id = `${this.#idPrefix}-${spec.name}`;
    let input: HTMLInputElement | HTMLSelectElement;
    let output: HTMLElement | null = null;

    switch (spec.kind) {
      case 'slider': {
        const head = el('label', 'param__head');
        head.htmlFor = id;
        head.append(el('code', 'param__name', spec.name));
        if (spec.label) {
          head.append(' ', el('span', 'param__label', spec.label));
        }
        const range = el('input', 'param__range');
        range.type = 'range';
        range.id = id;
        range.min = String(spec.min);
        range.max = String(spec.max);
        range.step = String(spec.step);
        const value = el('output', 'param__value');
        value.htmlFor.add(id);
        const row = el('div', 'param__row');
        row.append(range, value);
        const minmax = el('span', 'param__minmax', `${spec.min} ~ ${spec.max}`);
        element.append(head, row, minmax);
        input = range;
        output = value;
        range.addEventListener('input', () => {
          const entry = this.#entries.get(spec.name);
          if (entry) {
            this.#apply(entry, range.valueAsNumber);
          }
        });
        break;
      }
      case 'select': {
        const head = el('label', 'param__head');
        head.htmlFor = id;
        head.append(el('code', 'param__name', spec.name));
        if (spec.label) {
          head.append(' ', el('span', 'param__label', spec.label));
        }
        const select = el('select', 'param__select lab__select');
        select.id = id;
        for (const option of spec.options) {
          const item = document.createElement('option');
          item.value = option;
          item.textContent = option;
          select.append(item);
        }
        element.append(head, select);
        input = select;
        select.addEventListener('change', () => {
          const entry = this.#entries.get(spec.name);
          if (entry) {
            this.#apply(entry, select.value);
          }
        });
        break;
      }
      case 'toggle': {
        const label = el('label', 'param__toggle');
        label.htmlFor = id;
        const checkbox = el('input', 'param__checkbox');
        checkbox.type = 'checkbox';
        checkbox.id = id;
        checkbox.setAttribute('role', 'switch');
        const state = el('span', 'param__state');
        label.append(checkbox, el('code', 'param__name', spec.name));
        if (spec.label) {
          label.append(' ', el('span', 'param__label', spec.label));
        }
        label.append(' ', state);
        element.append(label);
        input = checkbox;
        output = state;
        checkbox.addEventListener('change', () => {
          const entry = this.#entries.get(spec.name);
          if (entry) {
            this.#apply(entry, checkbox.checked);
          }
        });
        break;
      }
    }
    const entry: Entry = { spec, key, element, input, output };
    this.#syncEntry(entry);
    return entry;
  }

  /** 조작 요소를 코드의 값에 맞춘다(같으면 건드리지 않는다). */
  #syncEntry(entry: Entry): void {
    const { spec, input, output, element } = entry;
    switch (spec.kind) {
      case 'slider': {
        const range = input as HTMLInputElement;
        const text = spec.valueType === 'int' ? String(Math.round(spec.value)) : spec.value.toFixed(spec.decimals);
        if (range.value !== String(spec.value) && range.valueAsNumber !== spec.value) {
          range.value = String(spec.value);
        }
        range.setAttribute('aria-valuetext', sliderValueText(spec as SliderParam, spec.value));
        if (output) {
          output.textContent = text;
        }
        element.dataset.value = text;
        break;
      }
      case 'select': {
        const select = input as HTMLSelectElement;
        if (select.value !== spec.value) {
          select.value = spec.value;
        }
        element.dataset.value = spec.value;
        break;
      }
      case 'toggle': {
        const checkbox = input as HTMLInputElement;
        if (checkbox.checked !== spec.value) {
          checkbox.checked = spec.value;
        }
        checkbox.setAttribute('aria-checked', spec.value ? 'true' : 'false');
        if (output) {
          output.textContent = spec.value ? 'True' : 'False';
        }
        element.dataset.value = spec.value ? 'True' : 'False';
        break;
      }
    }
  }
}

const mounted = new WeakMap<HTMLElement, ParamPanel>();

/** 실습실 뿌리([data-lab]) 안의 조절 패널([data-lab-params])에 논리를 붙인다. 패널이 없으면 null. 이미 붙였으면 그것을 돌려준다. */
export function mountParamPanel(labRoot: HTMLElement, lab: LabController): ParamPanel | null {
  const existing = mounted.get(labRoot);
  if (existing) {
    return existing;
  }
  const elements = readParamPanelElements(labRoot);
  if (!elements) {
    return null;
  }
  const panel = new ParamPanelController(lab, elements);
  mounted.set(labRoot, panel);
  return panel;
}

/** 붙여 둔 조절 패널(테스트·페이지 스크립트용) */
export function getParamPanel(labRoot: HTMLElement): ParamPanel | null {
  return mounted.get(labRoot) ?? null;
}
