/**
 * 포트 이름표(P4-05 "어느 것이 보드고 어느 것이 변환기인지 사람이 알아보게").
 *
 * 왜 어려운가: 교과서 3-1-2 실습에서는 USB 포트가 **두 개**다 — ① 보드의 REPL 포트(코드를 보내는 곳, P3-07이 쓴다)
 * ② USB-UART 변환기 포트(데이터가 오가는 곳, 이 파일이 쓰는 곳). 그런데 키트의 보드와 변환기는 **같은 CH340 칩**을
 * 쓰는 일이 많아 VID·PID(1a86:7523)가 같다. 그래서 칩 이름만으로는 가를 수 없다(usb-chips.ts는 보조 정보다).
 *
 * 사이트가 가르는 방법(모두 실제로 확인할 수 있는 것만)
 *  ① 이 페이지가 이미 연 포트를 다시 열면 브라우저가 `InvalidStateError`를 낸다(WICG Web Serial open 알고리즘) →
 *     "그 포트는 [실제 보드]가 쓰고 있어요"라고 알린다. data-port.ts가 이 오류를 잡는다.
 *  ② 포트를 열고 받은 글에 MicroPython REPL 자국(배너·">>> "·"raw REPL")이 보이면 보드 REPL 포트를 고른 것이다 → 안내.
 *  ③ 그래도 남는 구분은 사람이 붙이는 **이름표**다(예: "왼쪽 USB", "변환기"). 이 컴퓨터의 브라우저에만 저장한다.
 *
 * 이름표 저장의 한계(화면에도 적는다): 브라우저는 포트마다 고유 번호를 주지 않는다(명세가 일부러 그렇게 한다 — 사이트가
 * 기기를 추적하지 못하게). 그래서 저장 열쇠는 USB VID·PID뿐이고, 같은 칩이 두 개면 이름표가 서로 바뀔 수 있다.
 *
 * 개인정보(PLAN §10): 이름표에 학생 이름·학번을 적지 않도록 화면에 적고, 제어 글자를 지우고 길이를 20자로 자른다.
 * 저장 이름은 흉내 모듈 규칙(`module:data-port:labels`)을 따른다.
 */
import { describePortInfo, type PortDescription } from '../usb-chips.ts';

/** 이름표 최대 길이(글자 수) */
export const DATA_PORT_LABEL_MAX = 20;

/** 이름표를 저장하는 이름(흉내 모듈 ctx.storageName('labels')과 같은 값) */
export const DATA_PORT_LABEL_STORAGE = 'module:data-port:labels';

export interface DataPortIdentity {
  /** 이름표 저장 열쇠("usb:1a86:7523" 또는 "bluetooth"·"unknown") */
  readonly key: string;
  /** "CH340(WCH) · USB 1a86:7523" */
  readonly text: string;
  readonly description: PortDescription;
}

/** SerialPort.getInfo() 값 → 이름표 열쇠와 설명 */
export function identifyPort(info: Partial<SerialPortInfo> | null | undefined): DataPortIdentity {
  const description = describePortInfo(info);
  const key = description.kind === 'usb' && description.usbId !== null ? `usb:${description.usbId}` : description.kind === 'bluetooth' ? 'bluetooth' : 'unknown';
  return Object.freeze({ key, text: description.text, description });
}

/** 이름표를 저장할 수 있는 모양으로 다듬는다(제어 글자 제거·앞뒤 공백 제거·20자) */
export function sanitizeLabel(value: string): string {
  let text = '';
  for (const char of String(value ?? '')) {
    const code = char.codePointAt(0) ?? 0;
    // 제어 글자(줄바꿈·탭 포함)는 빈칸으로 바꾼다 — 한 줄짜리 이름표라서
    text += code < 0x20 || code === 0x7f ? ' ' : char;
  }
  text = text.replace(/\s+/gu, ' ').trim();
  return [...text].slice(0, DATA_PORT_LABEL_MAX).join('');
}

/** 이름표를 적지 않았을 때 보일 기본 이름 */
export function defaultLabel(identity: DataPortIdentity | null): string {
  if (identity === null) {
    return '데이터 포트';
  }
  const chip = identity.description.chip;
  return chip === null ? '데이터 포트' : `데이터 포트(${chip})`;
}

/** 화면 이름표 한 줄 — 사람이 붙인 이름이 있으면 그것, 없으면 기본 이름 */
export function portLabelText(label: string, identity: DataPortIdentity | null): string {
  const trimmed = sanitizeLabel(label);
  return trimmed === '' ? defaultLabel(identity) : trimmed;
}

/**
 * 받은 글이 MicroPython REPL처럼 보이나(= 변환기가 아니라 보드 REPL 포트를 골랐나).
 * 자국은 실물 보드가 반드시 보내는 것만 본다(banner.ts·mock 8.1절의 근거와 같은 글).
 */
export function looksLikeBoardRepl(text: string): boolean {
  return /MicroPython v\d|raw REPL; CTRL-B to exit|Type "help\(\)" for more information|(^|\n)>>> /u.test(text);
}

export interface LabelStoreOptions {
  /** 읽고 쓰는 곳(기본은 localStorage). 단위 테스트가 가짜 저장 공간을 넣는다 */
  readonly read?: () => string | null;
  readonly write?: (value: string) => void;
}

/**
 * 포트 이름표 저장(열쇠 = USB VID·PID). 저장 공간을 못 쓰는 브라우저(사생활 보호 모드)에서도 오류로 멈추지 않는다.
 * 값 모양: {"usb:1a86:7523": "변환기"}
 */
export class PortLabelStore {
  readonly #read: () => string | null;
  readonly #write: (value: string) => void;

  constructor(options: LabelStoreOptions = {}) {
    this.#read = options.read ?? (() => null);
    this.#write = options.write ?? (() => undefined);
  }

  /** 저장된 이름표 전체(못 읽으면 빈 객체) */
  all(): Record<string, string> {
    try {
      const text = this.#read();
      if (typeof text !== 'string' || text === '') {
        return {};
      }
      const parsed: unknown = JSON.parse(text);
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {};
      }
      const out: Record<string, string> = {};
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof value === 'string') {
          const label = sanitizeLabel(value);
          if (label !== '') {
            out[key] = label;
          }
        }
      }
      return out;
    } catch {
      return {};
    }
  }

  /** 이 포트의 이름표(없으면 빈 글) */
  get(key: string): string {
    return this.all()[key] ?? '';
  }

  /** 이름표를 저장한다(빈 글이면 지운다). 저장하지 못해도 오류를 내지 않는다 */
  set(key: string, label: string): void {
    const labels = this.all();
    const clean = sanitizeLabel(label);
    if (clean === '') {
      delete labels[key];
    } else {
      labels[key] = clean;
    }
    try {
      this.#write(JSON.stringify(labels));
    } catch {
      // 저장 공간이 막혔거나 가득 참 — 이름표는 이번 수업 동안 화면에만 남는다
    }
  }
}
