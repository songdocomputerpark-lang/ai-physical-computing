/**
 * 보드 준비 페이지 [보드 연결](연결 확인) 화면 논리 — ConnectCheck.astro가 그린 [data-connect-check]를 움직인다(PLAN §8.3 P3-10).
 *
 * 흐름([보드 연결] 한 번): 포트 선택 창(클릭 안에서 곧바로 requestPort — 거르지 않음) → 확인 모듈(board-check.ts, 구역 E의 연결 코드)을 그때 받음 →
 * 열기 → MicroPython 판별 → 있으면 내장 LED 세 번 → 닫기 → 결과 글(connect-view.ts)과 다음에 갈 곳(링크).
 * - 선택 창을 닫으면(목록에 보드가 없었을 수 있음) "연결이 안 될 때" 안내(details#port-not-found)를 펼쳐 둔다 — PLAN 흐름 "[연결] → [포트 선택 창에 보드가 안 보여요]".
 * - 같은 페이지에서 펌웨어를 굽는 중이면 포트를 열지 않고 알린다. 확인하는 도중 굽기를 누르면 굽기 쪽 알림을 듣고 포트를 넘겨준다(board-check.ts).
 * - 포트 정보(USB 칩·VID·PID)는 고른 뒤 참고로만 보인다(PLAN P3-10 "VID·PID는 보조 정보로만").
 * 테스트가 읽는 표시: 뿌리 data-phase(idle·choosing·opening·checking·blinking·closing·result)·data-result(결과 종류)·data-verdict·
 * data-tone·data-chip·data-version·data-support(supported·unsupported·unknown)·data-mounted, 단추 [data-connect-start].
 */
import { detectSerialSupport, navigatorSerial } from '../../../lab/serial/support.ts';
import type { PortDescription } from '../../../lab/serial/usb-chips.ts';
import type { ReplTiming } from '../../../lab/serial/raw-repl.ts';
import type { BoardCheck, BoardCheckStep } from './board-check.ts';
import {
  describeConnectIdle,
  describeConnectOutcome,
  describeConnectStep,
  type ConnectLinkTarget,
  type ConnectOutcome,
  type ConnectSupport,
  type ConnectView,
} from './connect-view.ts';

type BoardCheckModule = typeof import('./board-check.ts');

export interface ConnectCheckDeps {
  /** navigator.serial 대신(테스트) */
  readonly serial?: Serial | null;
  readonly support?: ConnectSupport;
  readonly loadBoardCheck?: () => Promise<BoardCheckModule>;
  readonly timing?: Partial<ReplTiming>;
}

export interface ConnectCheckController {
  readonly root: HTMLElement;
  destroy(): void;
}

type Phase = 'idle' | 'choosing' | BoardCheckStep | 'result';

const MAX_LOG_LINES = 80;

function query<T extends Element>(root: ParentNode, selector: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) {
    throw new Error(`보드 연결 확인 화면에 ${selector}이(가) 없어요(ConnectCheck.astro와 맞지 않음).`);
  }
  return found;
}

function errorName(error: unknown): string {
  return error && typeof error === 'object' && typeof (error as { name?: unknown }).name === 'string' ? (error as { name: string }).name : '';
}

function errorText(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

/** 포트 선택 창이 실패했을 때의 결과 */
export function outcomeForChooseError(error: unknown): ConnectOutcome {
  const name = errorName(error);
  if (name === 'NotFoundError') {
    return { kind: 'not-selected' };
  }
  if (name === 'SecurityError') {
    return { kind: 'security', detail: errorText(error) };
  }
  return { kind: 'choose-failed', detail: errorText(error) };
}

export function mountConnectCheck(root: HTMLElement, deps: ConnectCheckDeps = {}): ConnectCheckController {
  const button = query<HTMLButtonElement>(root, '[data-connect-start]');
  const statusBox = query<HTMLElement>(root, '[data-connect-status]');
  const title = query<HTMLElement>(root, '[data-connect-title]');
  const detail = query<HTMLElement>(root, '[data-connect-detail]');
  const steps = query<HTMLOListElement>(root, '[data-connect-steps]');
  const links = query<HTMLElement>(root, '[data-connect-links]');
  const info = query<HTMLElement>(root, '[data-connect-info]');
  const notes = query<HTMLUListElement>(root, '[data-connect-notes]');
  const ledHelp = query<HTMLDetailsElement>(root, '[data-connect-led-help]');
  const ledHelpList = query<HTMLUListElement>(root, '[data-connect-led-help-list]');
  const logBox = query<HTMLElement>(root, '[data-connect-log]');

  const hrefs: Readonly<Record<ConnectLinkTarget, string>> = {
    'port-help': root.dataset.portHelpHref ?? '#port-not-found',
    firmware: root.dataset.firmwareHref ?? '#firmware',
    'first-example': root.dataset.firstExampleHref ?? '#first-example',
    'check-page': root.dataset.checkPageHref ?? '#',
  };

  const support: ConnectSupport = deps.support ?? detectSerialSupport();
  const loadBoardCheck = deps.loadBoardCheck ?? (() => import('./board-check.ts'));
  let session: BoardCheck | null = null;
  let checking = false;
  const logLines: string[] = [];

  const appendLog = (line: string) => {
    const time = new Date().toLocaleTimeString('ko-KR', { hour12: false });
    logLines.push(`[${time}] ${line}`);
    if (logLines.length > MAX_LOG_LINES) {
      logLines.splice(0, logLines.length - MAX_LOG_LINES);
    }
    logBox.textContent = logLines.join('\n');
  };

  const openPortHelp = () => {
    const target = hrefs['port-help'].startsWith('#') ? document.getElementById(hrefs['port-help'].slice(1)) : null;
    if (target instanceof HTMLDetailsElement) {
      target.open = true;
    }
  };

  const render = (view: ConnectView, phase: Phase) => {
    root.dataset.phase = phase;
    root.dataset.tone = view.tone;
    title.textContent = view.title;
    detail.textContent = view.detail;
    detail.hidden = view.detail === '';

    steps.replaceChildren(
      ...view.steps.map((text) => {
        const item = document.createElement('li');
        item.textContent = text;
        return item;
      }),
    );
    steps.hidden = view.steps.length === 0;

    links.replaceChildren(
      ...view.links.map(({ target, label }) => {
        const anchor = document.createElement('a');
        anchor.className = 'connect-check__link';
        anchor.href = hrefs[target];
        anchor.textContent = label;
        anchor.dataset.connectLink = target;
        return anchor;
      }),
    );
    links.hidden = view.links.length === 0;

    info.replaceChildren(
      ...view.info.map(({ label, value }) => {
        const row = document.createElement('div');
        row.className = 'connect-check__info-row';
        const term = document.createElement('dt');
        term.textContent = label;
        const description = document.createElement('dd');
        description.textContent = value;
        row.append(term, description);
        return row;
      }),
    );
    info.hidden = view.info.length === 0;

    notes.replaceChildren(
      ...view.notes.map((text) => {
        const item = document.createElement('li');
        item.textContent = text;
        return item;
      }),
    );
    notes.hidden = view.notes.length === 0;

    ledHelpList.replaceChildren(
      ...view.ledHelp.map((text) => {
        const item = document.createElement('li');
        item.textContent = text;
        return item;
      }),
    );
    ledHelp.hidden = view.ledHelp.length === 0;
    if (ledHelp.hidden) {
      ledHelp.open = false;
    }

    button.disabled = view.buttonDisabled || checking;
    root.setAttribute('aria-busy', checking ? 'true' : 'false');
    if (view.openPortHelp) {
      openPortHelp();
    }
  };

  const showStep = (step: 'choosing' | BoardCheckStep, port: PortDescription | null) => {
    delete root.dataset.result;
    delete root.dataset.verdict;
    if (port) {
      root.dataset.chip = port.chip ?? '';
    }
    render(describeConnectStep(step, port, support), step);
    appendLog(
      {
        choosing: '포트 선택 창을 열었어요.',
        opening: `포트를 여는 중: ${port?.text ?? '(정보 없음)'}`,
        checking: 'MicroPython을 확인하는 중(Ctrl-C·Enter·Ctrl-B)',
        blinking: '내장 LED 시험 코드(GPIO2 세 번)를 보내는 중',
        closing: '연결을 닫는 중',
      }[step],
    );
  };

  const showOutcome = (outcome: ConnectOutcome, focus: boolean) => {
    root.dataset.result = outcome.kind;
    if (outcome.kind === 'no-micropython') {
      root.dataset.verdict = outcome.verdict?.kind ?? 'silent';
    } else if (outcome.kind === 'ready') {
      root.dataset.verdict = 'micropython';
      root.dataset.version = outcome.banner?.version ?? '';
      root.dataset.blink = outcome.blink.outcome;
    } else {
      delete root.dataset.verdict;
    }
    if ('port' in outcome && outcome.port) {
      root.dataset.chip = outcome.port.chip ?? '';
    }
    const view = describeConnectOutcome(outcome, support);
    render(view, 'result');
    appendLog(`결과: ${outcome.kind}${'verdict' in outcome && outcome.verdict ? ` (${outcome.verdict.kind})` : ''}${
      outcome.kind === 'ready' ? ` · ${outcome.banner?.line ?? 'MicroPython'} · LED 시험 ${outcome.blink.outcome}${outcome.blink.errorLine ? ` — ${outcome.blink.errorLine}` : ''}` : ''
    }${'detail' in outcome && outcome.detail ? ` — ${outcome.detail}` : ''}`);
    if (focus) {
      statusBox.focus();
    }
  };

  const currentSerial = (): Serial | null => (deps.serial !== undefined ? deps.serial : navigatorSerial());

  const onClick = () => {
    if (checking) {
      return;
    }
    if (document.querySelector('[data-firmware-flasher][data-state="running"]')) {
      showOutcome({ kind: 'flasher-busy' }, true);
      return;
    }
    const serial = currentSerial();
    if (!serial) {
      showOutcome({ kind: 'unsupported' }, true);
      return;
    }
    checking = true;
    // requestPort는 클릭 처리 안에서 다른 기다림보다 먼저 부른다(사용자 조작이 끝났다고 막히지 않게). 확인 모듈은 함께 받기 시작한다.
    let portPromise: Promise<SerialPort>;
    try {
      portPromise = serial.requestPort();
    } catch (error) {
      portPromise = Promise.reject(error);
    }
    portPromise.catch(() => undefined);
    const modulePromise = loadBoardCheck();
    modulePromise.catch(() => undefined);
    showStep('choosing', null);

    void (async () => {
      let outcome: ConnectOutcome;
      let port: SerialPort | null = null;
      try {
        port = await portPromise;
      } catch (error) {
        outcome = outcomeForChooseError(error);
        checking = false;
        showOutcome(outcome, true);
        return;
      }
      try {
        const module = await modulePromise;
        session ??= new module.BoardCheck({
          serial,
          ...(deps.timing ? { timing: deps.timing } : {}),
          onStep: (step, stepPort) => showStep(step, stepPort),
        });
        outcome = await session.check(port);
      } catch (error) {
        outcome = { kind: 'failed', detail: errorText(error) };
      }
      checking = false;
      showOutcome(outcome, true);
    })();
  };

  button.addEventListener('click', onClick);
  const onPageHide = () => session?.dispose();
  addEventListener('pagehide', onPageHide);

  root.dataset.support = support.level;
  render(describeConnectIdle(support), 'idle');
  if (support.level === 'unsupported') {
    root.dataset.result = 'unsupported';
  }
  root.dataset.mounted = 'true';

  return {
    root,
    destroy() {
      button.removeEventListener('click', onClick);
      removeEventListener('pagehide', onPageHide);
      session?.dispose();
      delete root.dataset.mounted;
    },
  };
}

/** 페이지의 모든 연결 확인 화면을 움직인다(이미 움직인 것은 건너뛴다) */
export function mountAllConnectChecks(scope: ParentNode = document, deps: ConnectCheckDeps = {}): ConnectCheckController[] {
  return Array.from(scope.querySelectorAll<HTMLElement>('[data-connect-check]:not([data-mounted])')).map((root) => mountConnectCheck(root, deps));
}
