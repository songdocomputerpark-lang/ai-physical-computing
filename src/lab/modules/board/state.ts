/**
 * 가상 ESP32 보드의 화면 쪽 상태(순수 논리 — DOM 없음, tests/unit/lab/board-state.test.ts). PLAN §8.3 P3-01, src/lab/README.md 7절.
 *
 * 파이썬(apc_board.py)과 주고받는 값의 모양을 한 곳에 적는다. 이름은 manifest.ts와, 값의 모양은 apc_board.py와 같아야 한다.
 *
 * 파이썬 → 화면: 이벤트 'board.state'(핀 상태 묶음, 늘 전체 목록)
 *   { v: 1, reason: 'reset' | 'change' | 'idle' | 'end', phase: 'run' | 'idle' | 'end', seq, t_us,
 *     pins: [{ id: 2, mode: 'in' | 'out' | 'open_drain' | 'off' | 'out_only' | 'pwm' | 'other' | null, pull: 'up' | 'down' | 'both' | null,
 *              out: 0 | 1, level: 0 | 1, driven: boolean, irq: boolean, duty?: 0~1, freq?: Hz }], timers: 켜진 Timer 수 }
 *   - duty·freq(선택, P3-02에서 자리만 정함)는 그 핀에 PWM이 켜져 있을 때만 온다: duty = 켜진 시간 비율(0~1, duty(512)면 512/1023),
 *     freq = 주파수(Hz). PWM을 흉내 내는 묶음(P3-03 apc_board_pwm.py)이 채우면 LED 밝기·진동 모터 세기가 따라 바뀐다(outputStrength).
 *   - reason 'reset'은 실행 시작(보드를 새로 켬), 'idle'은 코드가 끝났지만 Timer·인터럽트가 계속 돎, 'end'는 실행 끝.
 *   - pins에는 이번 실행에서 코드가 한 번이라도 만진 핀만 있다. level은 핀의 실제 전압(부품이 누르는 값·출력·풀업 반영), driven은 핀이 전기를 내보내는지.
 *   - 같은 16ms 안의 변화는 합쳐져 마지막 상태만 온다(PLAN §7.2 규칙 5의 "상태 메시지는 최신 값만"과 같은 뜻).
 * 화면 → 파이썬
 *   setValue 'board.inputs'  { pins: { '0': 'pullup', '17': 0 } }  입력 부품이 지금 핀을 어떻게 누르는지 전체(실행 시작 때 읽는다 — 최신 값)
 *   pushEvent 'board.input'  { pin: 0, drive: 0 | 1 | 'pullup' | 'pulldown' | null }  실행 중에 바뀐 것 하나(쌓이는 값 — 눌렀다 뗀 것도 빠짐없이,
 *                            PLAN §7.2 규칙 5의 "이벤트 메시지는 대기열")
 *   setValue 'board.wiring'  { parts: [{ part: 'builtin-led', id: 'led', pins: { led: 2 } }] }  이 예제의 배선(부품 흉내·배선 검사가 읽는다)
 * drive 값: 0·1 = 부품이 핀을 세게 누름(버튼을 눌러 GND에 닿음 등), 'pullup'·'pulldown' = 약하게 끌어당김(보드의 BOOT 버튼 풀업 저항),
 *   { mv: 0~3300 } = 부품이 거는 아날로그 전압(가변저항·아날로그 터치 — ADC가 읽음, 디지털로 읽으면 1.65V 문턱), null = 연결 없음.
 *
 * 부품 장치(병렬 제작 준비 2026-09-17 — P3-03~P3-05가 보드 핵심을 고치지 않게 둔 자리, README 7.3)
 *   파이썬 → 화면 이벤트 'board.device'  { v: 1, id: 배선 id, part: 부품 id, state: 부품마다 정한 값 }  — 문자 LCD 글자·네오픽셀 색·MP3 트랙처럼
 *     핀 전압만으로 안 보이는 상태. 최신 값만(16ms 병합). 실행 시작(board.state reason 'reset') 때 화면이 비운다.
 *   화면 → 파이썬 pushEvent 'board.device.input'  { id: 배선 id, data: 부품마다 정한 값 }  — 송신 패널처럼 부품 조작 칸이 파이썬 부품 흉내에 보내는 값(쌓이는 값).
 *   PWM(board.state 핀 항목): mode 'pwm'·duty(0~1)·freq(Hz) — 파이썬 BOARD.set_pwm이 채운다.
 *
 * 이 메시지는 워커 ↔ 화면 사이의 "핀 전압" 모양이라 PLAN §7(브릿지: UART·BLE·MQTT로 오가는 글자 한 줄)과 겹치지 않는다. 브릿지 통로는
 * Phase 4에서 'board.uart.*'·'board.ble.*'처럼 따로 이름을 더한다.
 */

export const BOARD_EVENT_STATE = 'board.state';
export const BOARD_EVENT_DEVICE = 'board.device';
export const BOARD_CHANNEL_INPUTS = 'board.inputs';
export const BOARD_CHANNEL_INPUT = 'board.input';
export const BOARD_CHANNEL_WIRING = 'board.wiring';
export const BOARD_CHANNEL_DEVICE_INPUT = 'board.device.input';

/** 보드 전원 전압(밀리볼트) — apc_board.py의 BOARD_MAX_MV와 같다 */
export const BOARD_MAX_MV = 3300;
/** 아날로그 전압을 디지털로 읽을 때 1로 보는 문턱(밀리볼트) — apc_board.py의 DIGITAL_HIGH_MV와 같다 */
export const DIGITAL_HIGH_MV = 1650;

/** ESP32(ESP32_GENERIC, MicroPython v1.29.0)에 있는 GPIO 번호 — apc_board.py의 VALID_GPIOS와 같다 */
export const VALID_GPIOS: readonly number[] = Object.freeze([
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 25, 26, 27, 32, 33, 34, 35, 36, 37, 38, 39,
]);
/** 입력 전용 핀(34~39) */
export const FIRST_INPUT_ONLY_GPIO = 34;
/**
 * 부팅 방식을 정하는 스트래핑 핀 — Espressif ESP-IDF GPIO 문서(ESP32, v6.1): "GPIO0, GPIO2, GPIO5, GPIO12 (MTDI), and GPIO15 (MTDO) are
 * strapping pins"(2026-09-17 확인). 배선 검사(parts.ts)가 바깥 부품을 이 핀에 이으면 주의를 알리고, 보드 그림(layout.ts)이 ▲ 표시를 단다.
 */
export const STRAPPING_GPIOS: readonly number[] = Object.freeze([0, 2, 5, 12, 15]);

export function isStrappingGpio(gpio: number): boolean {
  return STRAPPING_GPIOS.includes(gpio);
}

export function isValidGpio(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && VALID_GPIOS.includes(value);
}

export type PinMode = 'in' | 'out' | 'open_drain' | 'off' | 'out_only' | 'pwm' | 'other';
export type PinPull = 'up' | 'down' | 'both';
export type BoardPhase = 'stopped' | 'run' | 'idle' | 'end';
export type StateReason = 'reset' | 'change' | 'idle' | 'end';

export interface BoardPinState {
  readonly id: number;
  readonly mode: PinMode | null;
  readonly pull: PinPull | null;
  readonly out: 0 | 1;
  readonly level: 0 | 1;
  readonly driven: boolean;
  readonly irq: boolean;
  /** PWM 켜진 시간 비율(0~1). PWM이 아니면 없다 */
  readonly duty?: number;
  /** PWM 주파수(Hz). PWM이 아니면 없다 */
  readonly freq?: number;
}

export interface BoardSnapshot {
  readonly seq: number;
  readonly phase: BoardPhase;
  /** 가상 시각(마이크로초) */
  readonly tUs: number;
  readonly pins: ReadonlyMap<number, BoardPinState>;
  readonly timers: number;
}

export interface BoardStateEvent {
  readonly reason: StateReason;
  readonly phase: Exclude<BoardPhase, 'stopped'>;
  readonly seq: number;
  readonly tUs: number;
  readonly pins: readonly BoardPinState[];
  readonly timers: number;
}

export const EMPTY_SNAPSHOT: BoardSnapshot = Object.freeze({ seq: 0, phase: 'stopped', tUs: 0, pins: new Map(), timers: 0 });

const PIN_MODES: readonly PinMode[] = ['in', 'out', 'open_drain', 'off', 'out_only', 'pwm', 'other'];
const PIN_PULLS: readonly PinPull[] = ['up', 'down', 'both'];
const REASONS: readonly StateReason[] = ['reset', 'change', 'idle', 'end'];

function bit(value: unknown): 0 | 1 {
  return value === 1 || value === true ? 1 : 0;
}

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** 파이썬이 보낸 'board.state' 값을 읽는다. 모양이 틀리면 null(화면이 깨지지 않게 그 메시지만 버린다). */
export function parseStateEvent(payload: unknown): BoardStateEvent | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const raw = payload as Record<string, unknown>;
  const reason = raw.reason as StateReason;
  if (!REASONS.includes(reason) || !Array.isArray(raw.pins)) {
    return null;
  }
  const phase = raw.phase === 'idle' || raw.phase === 'end' ? raw.phase : 'run';
  const pins: BoardPinState[] = [];
  for (const item of raw.pins) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const pin = item as Record<string, unknown>;
    if (!isValidGpio(pin.id)) {
      continue;
    }
    const duty = typeof pin.duty === 'number' && Number.isFinite(pin.duty) ? Math.min(1, Math.max(0, pin.duty)) : null;
    const freq = typeof pin.freq === 'number' && Number.isFinite(pin.freq) && pin.freq > 0 ? pin.freq : null;
    pins.push({
      id: pin.id,
      mode: PIN_MODES.includes(pin.mode as PinMode) ? (pin.mode as PinMode) : null,
      pull: PIN_PULLS.includes(pin.pull as PinPull) ? (pin.pull as PinPull) : null,
      out: bit(pin.out),
      level: bit(pin.level),
      driven: pin.driven === true,
      irq: pin.irq === true,
      ...(duty === null ? {} : { duty }),
      ...(freq === null ? {} : { freq }),
    });
  }
  return {
    reason,
    phase,
    seq: finiteNumber(raw.seq),
    tUs: finiteNumber(raw.t_us),
    pins,
    timers: finiteNumber(raw.timers),
  };
}

/** 새 상태 이벤트를 반영한 스냅샷. 이벤트마다 핀 전체 목록이 오므로 바꿔 끼운다. 실행 시작(reset) 전의 늦은 이벤트는 순서 번호로 버린다. */
export function applyStateEvent(previous: BoardSnapshot, event: BoardStateEvent): BoardSnapshot {
  if (event.reason !== 'reset' && previous.phase !== 'stopped' && event.seq <= previous.seq) {
    return previous;
  }
  return {
    seq: event.seq,
    phase: event.phase,
    tUs: event.tUs,
    pins: new Map(event.pins.map((pin) => [pin.id, pin])),
    timers: event.timers,
  };
}

/**
 * 실행이 [정지]나 다시 시작으로 끝났을 때의 스냅샷: 핀 목록은 남기되 phase를 'stopped'로 둔다.
 * 부품은 phase가 stopped면 꺼진 모습으로 그린다(멈춘 뒤에도 LED가 켜져 있으면 아직 도는 것처럼 보여서). 코드가 스스로 끝나면('end') 마지막 모습을 남긴다(실물과 같음).
 */
export function stoppedSnapshot(previous: BoardSnapshot): BoardSnapshot {
  return { ...previous, phase: 'stopped', timers: 0 };
}

/** 부품이 켜진 모습으로 보일 수 있는 단계인지(실행 중·대기·스스로 끝남) */
export function isLive(snapshot: BoardSnapshot): boolean {
  return snapshot.phase === 'run' || snapshot.phase === 'idle' || snapshot.phase === 'end';
}

/** 그 핀이 전기를 내보내 1(HIGH)을 내는지 — LED 같은 출력 부품이 켜지는 조건 */
export function isDrivenHigh(snapshot: BoardSnapshot, gpio: number): boolean {
  const pin = snapshot.pins.get(gpio);
  return isLive(snapshot) && pin !== undefined && pin.driven && pin.level === 1;
}

/**
 * 출력 부품이 받는 세기(0~1): 보드가 멈췄거나 핀이 전기를 내보내지 않으면 0, PWM이면 duty(켜진 시간 비율), 아니면 1(HIGH)·0(LOW).
 * LED 밝기·진동 모터 세기처럼 "얼마나"를 보여 주는 부품이 쓴다(P3-02). PWM 값은 P3-03이 board.state의 duty로 채운다.
 */
export function outputStrength(snapshot: BoardSnapshot, gpio: number): number {
  const pin = snapshot.pins.get(gpio);
  if (!isLive(snapshot) || pin === undefined || !pin.driven) {
    return 0;
  }
  if (pin.duty !== undefined) {
    return pin.duty;
  }
  return pin.level === 1 ? 1 : 0;
}

// ── 입력(화면 → 파이썬) ──

/** 부품이 핀에 거는 아날로그 전압(밀리볼트 0~3300) — 가변저항·아날로그 터치(ADC로 읽음) */
export interface AnalogDrive {
  readonly mv: number;
}

export type PinDrive = 0 | 1 | 'pullup' | 'pulldown' | AnalogDrive | null;

export interface InputChange {
  readonly pin: number;
  readonly drive: PinDrive;
}

/** 아날로그 전압 값을 만든다(0~3300으로 자르고 정수로 반올림) */
export function analogDrive(mv: number): AnalogDrive {
  const value = Number.isFinite(mv) ? Math.round(Math.min(BOARD_MAX_MV, Math.max(0, mv))) : 0;
  return { mv: value };
}

export function isAnalogDrive(value: unknown): value is AnalogDrive {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as { mv?: unknown }).mv === 'number' &&
    Number.isFinite((value as { mv: number }).mv)
  );
}

export function isPinDrive(value: unknown): value is PinDrive {
  return value === 0 || value === 1 || value === 'pullup' || value === 'pulldown' || value === null || isAnalogDrive(value);
}

/** 두 누르는 값이 같은지(아날로그 전압은 값으로 비교) */
export function sameDrive(a: PinDrive | undefined, b: PinDrive | undefined): boolean {
  const left = a ?? null;
  const right = b ?? null;
  if (isAnalogDrive(left) || isAnalogDrive(right)) {
    return isAnalogDrive(left) && isAnalogDrive(right) && left.mv === right.mv;
  }
  return left === right;
}

/** 누르는 값을 디지털로 읽었을 때(0·1) — 아날로그 전압은 1.65V 문턱, 약한 끌어당김은 그 방향, 연결 없음은 null */
export function digitalLevelOf(drive: PinDrive): 0 | 1 | null {
  if (drive === 0 || drive === 1) {
    return drive;
  }
  if (isAnalogDrive(drive)) {
    return drive.mv >= DIGITAL_HIGH_MV ? 1 : 0;
  }
  if (drive === 'pullup') {
    return 1;
  }
  if (drive === 'pulldown') {
    return 0;
  }
  return null;
}

/** 입력 부품들이 누르는 값 표 → 'board.inputs' 값 */
export function inputsValue(drives: ReadonlyMap<number, PinDrive>): { pins: Record<string, Exclude<PinDrive, null>> } {
  const pins: Record<string, Exclude<PinDrive, null>> = {};
  for (const [gpio, drive] of [...drives.entries()].sort(([a], [b]) => a - b)) {
    if (drive !== null) {
      pins[String(gpio)] = isAnalogDrive(drive) ? { mv: drive.mv } : drive;
    }
  }
  return { pins };
}

/** 두 표를 비교해 바뀐 핀만 'board.input' 변화 목록으로(없어진 핀은 null) */
export function inputChanges(before: ReadonlyMap<number, PinDrive>, after: ReadonlyMap<number, PinDrive>): InputChange[] {
  const changes: InputChange[] = [];
  const pins = new Set([...before.keys(), ...after.keys()]);
  for (const pin of [...pins].sort((a, b) => a - b)) {
    const next = after.get(pin) ?? null;
    if (!sameDrive(before.get(pin), next)) {
      changes.push({ pin, drive: isAnalogDrive(next) ? { mv: next.mv } : next });
    }
  }
  return changes;
}

// ── 부품 장치(파이썬 부품 흉내 ↔ 화면, 병렬 제작 준비 2026-09-17) ──

/** 'board.device' 이벤트 하나 */
export interface BoardDeviceEvent {
  /** 배선 id(PartInstance.id) */
  readonly id: string;
  /** 부품 id */
  readonly part: string;
  /** 부품마다 정한 상태 값(JSON 값 — 파이썬 bytes는 Uint8Array로 온다) */
  readonly state: unknown;
}

/** 화면이 들고 있는 부품 장치 상태 하나: 받은 순서 번호(같은 배선 id에서 1부터)와 마지막 상태 */
export interface PartDeviceState {
  readonly seq: number;
  readonly state: unknown;
}

/** 파이썬이 보낸 'board.device' 값을 읽는다. id·part가 없으면 null(P3-01의 시험용 {mark} 같은 다른 모양도 null) */
export function parseDeviceEvent(payload: unknown): BoardDeviceEvent | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const raw = payload as Record<string, unknown>;
  if (typeof raw.id !== 'string' || raw.id === '' || typeof raw.part !== 'string' || raw.part === '') {
    return null;
  }
  return { id: raw.id, part: raw.part, state: raw.state ?? null };
}

/** 장치 상태 표에 이벤트 하나를 반영한 새 표(같은 id면 순서 번호를 1 올린다) */
export function applyDeviceEvent(previous: ReadonlyMap<string, PartDeviceState>, event: BoardDeviceEvent): Map<string, PartDeviceState> {
  const next = new Map(previous);
  next.set(event.id, { seq: (previous.get(event.id)?.seq ?? 0) + 1, state: event.state });
  return next;
}

// ── 사람이 읽는 글(핀 표·화면 낭독기) ──

const MODE_TEXT: Readonly<Record<PinMode, string>> = Object.freeze({
  in: '입력',
  out: '출력',
  open_drain: '출력(오픈 드레인)',
  off: '꺼짐',
  out_only: '출력(읽기 꺼짐)',
  pwm: 'PWM 출력',
  other: '기타',
});

const PULL_TEXT: Readonly<Record<PinPull, string>> = Object.freeze({ up: '풀업', down: '풀다운', both: '풀업·풀다운' });

/** 핀 모드 글: 입력·출력… 정하지 않았으면 "정하지 않음" */
export function modeText(pin: BoardPinState): string {
  const mode = pin.mode === null ? '정하지 않음' : MODE_TEXT[pin.mode];
  return pin.pull ? `${mode} · ${PULL_TEXT[pin.pull]}` : mode;
}

/** 핀 값 글: "1 (HIGH)" / "0 (LOW)" */
export function levelText(level: 0 | 1): string {
  return level === 1 ? '1 (HIGH)' : '0 (LOW)';
}

/** 한 줄 요약(화면 낭독기용): "GPIO2 출력 1 (HIGH)" */
export function describePin(pin: BoardPinState): string {
  const extra = pin.irq ? ' · 인터럽트' : '';
  return `GPIO${pin.id} ${modeText(pin)} ${levelText(pin.level)}${extra}`;
}

/** 실행 단계 글 */
export function phaseText(snapshot: BoardSnapshot): string {
  switch (snapshot.phase) {
    case 'run':
      return '보드가 코드를 실행하고 있어요.';
    case 'idle':
      return `코드는 끝났지만 Timer${snapshot.timers > 0 ? ` ${snapshot.timers}개` : ''}나 핀 인터럽트가 계속 돌고 있어요. 멈추려면 [정지]를 누르세요.`;
    case 'end':
      return '코드가 끝났어요. 핀은 마지막 상태 그대로예요.';
    default:
      return '보드가 멈춰 있어요. [실행]을 누르면 보드를 새로 켜고 코드를 돌려요.';
  }
}
