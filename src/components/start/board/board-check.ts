/**
 * 보드 준비 페이지의 "보드 연결 확인" 한 번(PLAN §8.3 P3-10, SPEC §5 보드 준비 "연결 테스트") — DOM을 쓰지 않는다(Node 테스트가 모의 시리얼로 검사).
 *
 * 순서: (화면이 클릭 안에서 고른 포트) → 열기(115200bps) → MicroPython 판별 → (있으면) 내장 LED(GPIO2) 세 번 깜빡이기 → 연결 끊기.
 * - 연결·판별·실행은 구역 E의 BoardConnection(src/lab/serial/board-connection.ts)을 그대로 쓴다: ESP32 실습실 [실제 보드] 탭과
 *   같은 판별(Ctrl-C·Enter·Ctrl-B 배너)·같은 raw REPL 실행이라, 여기서 된 보드는 실습실에서도 같게 보인다.
 * - 확인이 끝나면 늘 포트를 닫는다. 같은 페이지의 [펌웨어 굽기 시작]과 ESP32 실습실이 곧바로 그 포트를 열 수 있게(한 포트는 한 곳만 연다).
 *   확인하는 도중에 굽기를 누르면 "포트를 놓아 주세요" 알림(src/lab/firmware/port-release.ts)을 듣고 멈춘 뒤 닫는다 → 결과 kind 'released'.
 * - LED 시험 코드는 보드에 저장하지 않는다(raw REPL로 보내 실행만 함 — 실행 전 소프트 리셋은 BoardConnection.run의 기본).
 *   보드에 저장된 main.py는 판별의 Ctrl-C로 멈춘다(실습실 [보드 연결]과 같음).
 * 포트 선택 창(requestPort)은 이 파일이 부르지 않는다 — 클릭 처리 안에서 곧바로 불러야 해서 화면 쪽(connect-check.ts)이 부르고 포트를 넘긴다.
 */
import type { MicroPythonBanner, ProbeVerdict } from '../../../lab/serial/banner.ts';
import { BoardConnection, type BoardConnectionSnapshot } from '../../../lab/serial/board-connection.ts';
import { errorMessage, errorName } from '../../../lab/serial/errors.ts';
import type { ExecOutcome, ReplTiming } from '../../../lab/serial/raw-repl.ts';
import type { SerialLike, SerialPortLike } from '../../../lab/serial/serial-channel.ts';
import { describePortInfo, type PortDescription } from '../../../lab/serial/usb-chips.ts';
import { onSerialPortReleaseRequest } from '../../../lab/firmware/port-release.ts';

/** 내장 LED 시험 코드(교과서 키트 보드의 초록색 LED는 IO2 — 원고 123쪽 "D2 LED 녹색불", 2-1-1 예제 f046과 같은 핀) */
export const BLINK_TEST_CODE = `from machine import Pin
import time
led = Pin(2, Pin.OUT)
for i in range(3):
    led.on()
    time.sleep_ms(300)
    led.off()
    time.sleep_ms(300)
print('LED blink test done')
`;

/** 시험 코드가 끝에 찍는 글(이 글이 보이면 코드가 끝까지 돈 것) */
export const BLINK_TEST_DONE_TEXT = 'LED blink test done';

export type BoardCheckStep = 'opening' | 'checking' | 'blinking' | 'closing';

export interface BlinkReport {
  /** ok = 끝까지 돎, error = 오류로 끝남, interrupted·reset = 멈추거나 보드가 다시 시작함, failed = 보내지 못함 */
  readonly outcome: ExecOutcome | 'failed';
  /** 오류 마지막 줄(예: "ImportError: no module named 'machine'"), 없으면 null */
  readonly errorLine: string | null;
  readonly stdout: string;
}

type PortOnly = { readonly port: PortDescription | null };

export type BoardCheckResult =
  /** MicroPython 확인 + LED 시험(결과는 blink) */
  | (PortOnly & {
      readonly kind: 'ready';
      readonly banner: MicroPythonBanner | null;
      readonly firmware: BoardConnectionSnapshot['firmware'];
      readonly esp32: boolean | null;
      readonly blink: BlinkReport;
    })
  /** 대답이 없거나 MicroPython이 아님(판별 결과 verdict) */
  | (PortOnly & { readonly kind: 'no-micropython'; readonly verdict: ProbeVerdict | null })
  /** 보드 프로그램이 Ctrl-C에도 멈추지 않음 */
  | (PortOnly & { readonly kind: 'busy' })
  /** USB 선이 빠짐 */
  | (PortOnly & { readonly kind: 'lost' })
  /** 다른 프로그램·탭이 포트를 쓰는 중 */
  | (PortOnly & { readonly kind: 'port-in-use'; readonly detail: string })
  /** 그 밖에 포트를 열지 못함 */
  | (PortOnly & { readonly kind: 'open-failed'; readonly detail: string })
  /** raw REPL 약속과 다른 글 */
  | (PortOnly & { readonly kind: 'protocol'; readonly detail: string })
  /** 확인하는 도중 같은 페이지의 다른 곳(펌웨어 굽기)에 포트를 넘겨주고 멈춤 */
  | (PortOnly & { readonly kind: 'released' });

export type BoardCheckResultKind = BoardCheckResult['kind'];

export interface BoardCheckOptions {
  /** navigator.serial 대신(테스트). 적지 않으면 navigator.serial */
  readonly serial?: SerialLike | null;
  readonly timing?: Partial<ReplTiming>;
  /** 단계가 바뀔 때(같은 단계는 한 번만) */
  readonly onStep?: (step: BoardCheckStep, port: PortDescription | null) => void;
  /** "포트를 놓아 주세요" 알림을 들을 곳(기본: 창). null이면 듣지 않는다 */
  readonly releaseTarget?: EventTarget | null;
  readonly blinkCode?: string;
}

function portInfoOf(port: SerialPortLike): PortDescription {
  try {
    return describePortInfo(port.getInfo());
  } catch {
    return describePortInfo(null);
  }
}

export class BoardCheck {
  readonly #connection: BoardConnection;
  readonly #onStep: BoardCheckOptions['onStep'];
  readonly #releaseTarget: EventTarget | null | undefined;
  readonly #blinkCode: string;
  #inflight: Promise<BoardCheckResult> | null = null;
  #released = false;
  #lastStep: BoardCheckStep | null = null;

  constructor(options: BoardCheckOptions = {}) {
    this.#connection = new BoardConnection({
      ...(options.serial === undefined ? {} : { serial: options.serial }),
      ...(options.timing ? { timing: options.timing } : {}),
    });
    this.#onStep = options.onStep;
    this.#releaseTarget = options.releaseTarget;
    this.#blinkCode = options.blinkCode ?? BLINK_TEST_CODE;
  }

  /** 이 브라우저에 Web Serial이 있는지 */
  get supported(): boolean {
    return this.#connection.supported;
  }

  /** 확인하는 중인지 */
  get running(): boolean {
    return this.#inflight !== null;
  }

  /** 지금 포트가 열려 있는지(확인하는 동안만 참) */
  get isOpen(): boolean {
    return this.#connection.isOpen;
  }

  /** 고른 포트로 확인을 한 번 한다. 끝나면(어떤 결과든) 포트는 닫혀 있다 */
  check(port: SerialPortLike): Promise<BoardCheckResult> {
    if (this.#inflight) {
      return Promise.reject(new Error('보드를 확인하는 중이에요. 끝난 뒤 다시 눌러요.'));
    }
    this.#released = false;
    this.#lastStep = null;
    const run = this.#run(port).finally(() => {
      this.#inflight = null;
    });
    this.#inflight = run;
    return run;
  }

  /** 같은 페이지의 다른 곳이 포트를 쓰려 할 때: 하던 확인을 멈추고 포트를 닫는다(확인이 끝날 때까지 기다린다) */
  async release(): Promise<void> {
    const inflight = this.#inflight;
    if (!inflight) {
      return;
    }
    this.#released = true;
    this.#connection.stop();
    await this.#connection.disconnect();
    await inflight.catch(() => undefined);
  }

  /** 페이지를 떠날 때 */
  dispose(): void {
    this.#connection.dispose();
  }

  #step(step: BoardCheckStep, port: PortDescription | null): void {
    if (this.#lastStep === step) {
      return;
    }
    this.#lastStep = step;
    try {
      this.#onStep?.(step, port);
    } catch (error) {
      console.error('보드 확인 단계를 그리다 오류가 났어요.', error);
    }
  }

  async #run(port: SerialPortLike): Promise<BoardCheckResult> {
    const connection = this.#connection;
    const fallbackPort = portInfoOf(port);
    const stopListening =
      this.#releaseTarget === null
        ? () => undefined
        : onSerialPortReleaseRequest(() => this.release(), this.#releaseTarget ?? undefined);
    const unsubscribe = connection.subscribe((snapshot) => {
      if (snapshot.state === 'opening') {
        this.#step('opening', snapshot.port ?? fallbackPort);
      } else if (snapshot.state === 'checking') {
        this.#step('checking', snapshot.port ?? fallbackPort);
      }
    });
    try {
      this.#step('opening', fallbackPort);
      const opened = await connection.openPort(port);
      if (this.#released) {
        return { kind: 'released', port: opened.port ?? fallbackPort };
      }
      return await this.#afterOpen(opened, fallbackPort);
    } finally {
      unsubscribe();
      if (connection.isOpen) {
        this.#step('closing', fallbackPort);
      }
      try {
        await connection.disconnect();
      } catch {
        // 이미 끊겼거나 닫힌 포트
      }
      stopListening();
    }
  }

  async #afterOpen(snapshot: BoardConnectionSnapshot, fallbackPort: PortDescription): Promise<BoardCheckResult> {
    const port = snapshot.port ?? fallbackPort;
    const problem = snapshot.problem;
    switch (snapshot.state) {
      case 'ready': {
        this.#step('blinking', port);
        const blink = await this.#blink();
        if (this.#released) {
          return { kind: 'released', port };
        }
        if (this.#connection.state === 'lost') {
          return { kind: 'lost', port };
        }
        return { kind: 'ready', port, banner: snapshot.banner, firmware: snapshot.firmware, esp32: snapshot.esp32, blink };
      }
      case 'no-micropython':
        return { kind: 'no-micropython', port, verdict: snapshot.verdict };
      case 'busy':
        return { kind: 'busy', port };
      case 'lost':
        return { kind: 'lost', port };
      case 'error':
        if (problem?.code === 'port-in-use') {
          return { kind: 'port-in-use', port, detail: problem.detail };
        }
        if (problem?.code === 'protocol') {
          return { kind: 'protocol', port, detail: problem.detail };
        }
        if (problem?.code === 'lost') {
          return { kind: 'lost', port };
        }
        return { kind: 'open-failed', port, detail: problem?.detail ?? '' };
      default:
        return { kind: 'protocol', port, detail: `보드 연결 상태가 ${snapshot.state}에서 멈췄어요.` };
    }
  }

  async #blink(): Promise<BlinkReport> {
    try {
      const result = await this.#connection.run(this.#blinkCode);
      return { outcome: result.outcome, errorLine: result.error ? result.error.message : null, stdout: result.stdout };
    } catch (error) {
      return { outcome: 'failed', errorLine: `${errorName(error) || 'Error'}: ${errorMessage(error)}`, stdout: '' };
    }
  }
}
