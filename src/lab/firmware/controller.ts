/**
 * 펌웨어 굽기 화면 논리 — markup.ts가 그린 [data-firmware-flasher]를 움직인다(PLAN §8.3 P3-09, SPEC §6.2 "[펌웨어 굽기] 원클릭, 진행률").
 *
 *   mountAllFirmwareFlashers();                  // 페이지의 모든 굽기 화면(컴포넌트 <script>가 부른다)
 *   const flasher = mountFirmwareFlasher(root);  // 하나만
 *
 * 흐름([펌웨어 굽기 시작] 한 번): 포트 선택 창(클릭 안에서 바로 requestPort — 사용자 조작 규칙) → 펌웨어 파일 받기를 곧바로 함께 시작 →
 * 보드를 굽기 모드로 바꿔 칩 확인 → 받은 파일의 크기·이미지 머리·SHA-256 확인 → (선택) 전체 지우기 → 쓰기(진행률·남은 시간) → MD5 대조 → 다시 시작.
 * 실패하면 오류 풀이(errors.ts)와 [다시 시도]·[느린 속도로 다시 굽기]를 보이고, 보드를 원래대로 다시 시작해 둔다.
 * [다시 시도]는 방금 고른 포트가 아직 허락된 목록에 있으면 창을 다시 띄우지 않고 그 포트로 한다(BOOT 버튼을 누른 채 누르기 쉽게).
 *
 * 페이지를 열 때: 브라우저 지원(support.ts) · 파일 있는지 HEAD 한 번(download.ts, 1.7MB를 미리 받지 않는다).
 * esptool-js는 [펌웨어 굽기 시작]·[칩만 확인하기]를 누른 뒤에야 받는다(flasher.ts를 늦게 import — 보드 준비 페이지를 읽는 학생은 받지 않는다).
 * 테스트용 이름: 뿌리 data-state(idle·running·done·error)·data-support·data-file-state·data-mounted, 단계 li[data-stage][data-stage-state].
 */
import { envFromWindow, type CapabilityEnv } from '../../lib/capabilities.ts';
import { downloadFirmware, FirmwareDownloadError, probeFirmware, type FirmwareFetch } from './download.ts';
import { explainFlashError, FlashError, type FlashErrorExplanation, type FlashStageId } from './errors.ts';
import type { ChipReport, FirmwareFlasher, FlashResult } from './flasher.ts';
import { formatMegabytes, formatWithCommas, parseFirmwareInfo, type FirmwareInfo } from './manifest.ts';
import { FLASH_STAGES, STAGE_STATE_TEXT, type FlashStageKey } from './markup.ts';
import { requestSerialPortRelease } from './port-release.ts';
import { decideFlashSupport, type FlashSupport } from './support.ts';
import { verifyFirmwareImage } from './verify.ts';

type FlasherModule = typeof import('./flasher.ts');
type StageState = keyof typeof STAGE_STATE_TEXT;

/**
 * 고른 포트의 USB 제조사(VID) 이름 — 화면에 보조 정보로만 보인다. 포트 선택 창은 거르지 않는다(requestPort에 filters 없음):
 * PLAN §8.3 P3-10 "VID·PID 판별은 포트가 보일 때의 보조 정보로만"(드라이버·칩이 달라도 보드를 고를 수 있게, 실제 보드 연결 P3-07과 같은 규칙).
 * 교과서 키트는 CH340(원고 2단원). 1a86 WCH·10c4 Silicon Labs·0403 FTDI는 Linux 커널 usb-serial 드라이버 id 표, 303a는 esptool 문서의 Espressif USB.
 */
const USB_VENDOR_NAMES: Readonly<Record<number, string>> = Object.freeze({
  0x1a86: 'WCH CH340 계열',
  0x10c4: 'Silicon Labs CP210x',
  0x0403: 'FTDI',
  0x303a: 'Espressif 칩 안의 USB',
});

export interface FirmwareFlasherDeps {
  /** navigator.serial 대신(테스트) */
  readonly serial?: Serial | null;
  readonly fetchImpl?: FirmwareFetch;
  readonly env?: CapabilityEnv;
  readonly loadFlasher?: () => Promise<FlasherModule>;
}

export interface FirmwareFlasherController {
  readonly root: HTMLElement;
  readonly firmware: FirmwareInfo;
  destroy(): void;
}

const MAX_LOG_LINES = 400;

function hex4(value: number | undefined): string {
  return value === undefined ? '????' : value.toString(16).padStart(4, '0');
}

/** 포트 정보 → 화면 글(예: "WCH CH340 계열(1a86:7523)") */
export function describePort(info: SerialPortInfo): string {
  if (info.usbVendorId === undefined) {
    return 'USB가 아닌 포트(블루투스 등일 수 있어요)';
  }
  const name = USB_VENDOR_NAMES[info.usbVendorId] ?? 'USB 시리얼 장치';
  return `${name}(${hex4(info.usbVendorId)}:${hex4(info.usbProductId)})`;
}

/** 칩 보고 → 화면 글(예: "ESP32-D0WD-V3 (revision 3) · 플래시 4MB") */
export function describeChip(chip: ChipReport): string {
  return `${chip.description} · 플래시 ${chip.flashSizeLabel ?? '크기 모름'}`;
}

/** 남은 시간 글(5초 단위로 반올림, 5초 밑이면 "곧 끝나요") */
export function remainingText(elapsedMs: number, done: number, total: number): string | null {
  if (done <= 0 || total <= 0 || elapsedMs < 2000 || done / total < 0.03) {
    return null;
  }
  const remainingMs = (elapsedMs * (total - done)) / done;
  if (remainingMs < 5000) {
    return '곧 끝나요';
  }
  return `약 ${Math.ceil(remainingMs / 5000) * 5}초 남음`;
}

/** 시작 글 결과 → 끝 상자 글 */
export function bootText(result: FlashResult, firmware: FirmwareInfo): string {
  const boot = result.boot;
  if (boot.version === firmware.version) {
    return `보드가 다시 시작해 "MicroPython v${boot.version}" 시작 글을 보냈어요.`;
  }
  if (boot.version) {
    return `보드가 다시 시작했는데 시작 글의 판이 v${boot.version}이에요. "굽기 전에 보드를 모두 지우기"를 켜고 다시 구워 보세요.`;
  }
  if (boot.bootLoop) {
    return '보드가 켜지자마자 다시 시작하기를 되풀이해요. "굽기 전에 보드를 모두 지우기"를 켜고 다시 구워 보세요.';
  }
  return '보드를 다시 시작했지만 시작 글은 아직 받지 못했어요. 보드에 저장된 main.py가 돌고 있으면 그럴 수 있어요.';
}

function query<T extends Element>(root: ParentNode, selector: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) {
    throw new Error(`펌웨어 굽기 화면에 ${selector}이(가) 없어요(markup.ts와 맞지 않음).`);
  }
  return found;
}

function downloadErrorToFlashError(error: unknown): FlashError {
  if (error instanceof FirmwareDownloadError) {
    const code =
      error.kind === 'missing'
        ? 'firmware-missing'
        : error.kind === 'blocked'
          ? 'firmware-blocked'
          : error.kind === 'too-large'
            ? 'firmware-corrupt'
            : 'firmware-network';
    return new FlashError(code, error.message, code === 'firmware-corrupt' ? { what: '크기' } : {}, { cause: error });
  }
  return new FlashError('firmware-network', error instanceof Error ? error.message : String(error), {}, { cause: error });
}

/** 굽기 화면 하나를 움직인다 */
export function mountFirmwareFlasher(root: HTMLElement, deps: FirmwareFlasherDeps = {}): FirmwareFlasherController {
  const firmware = parseFirmwareInfo(JSON.parse(query<HTMLScriptElement>(root, 'script[data-firmware-info]').textContent ?? 'null'));
  const fileUrl = root.dataset.fileUrl ?? '';
  const serial = deps.serial !== undefined ? deps.serial : ((globalThis.navigator as Navigator | undefined)?.serial ?? null);
  const loadFlasher = deps.loadFlasher ?? (() => import('./flasher.ts'));

  const supportText = query<HTMLElement>(root, '[data-firmware-support-text]');
  const fileText = query<HTMLElement>(root, '[data-firmware-file-text]');
  const unsupportedBox = query<HTMLElement>(root, '[data-firmware-unsupported]');
  const missingBox = query<HTMLElement>(root, '[data-firmware-missing]');
  const runBox = query<HTMLElement>(root, '[data-firmware-run]');
  const eraseInput = query<HTMLInputElement>(root, '[data-firmware-erase]');
  const startButton = query<HTMLButtonElement>(root, '[data-firmware-start]');
  const stopButton = query<HTMLButtonElement>(root, '[data-firmware-stop]');
  const runningNote = query<HTMLElement>(root, '[data-firmware-running-note]');
  const live = query<HTMLElement>(root, '[data-firmware-live]');
  const doneBox = query<HTMLElement>(root, '[data-firmware-done]');
  const doneTitle = query<HTMLElement>(root, '[data-done-title]');
  const doneBoot = query<HTMLElement>(root, '[data-done-boot]');
  const errorBox = query<HTMLElement>(root, '[data-firmware-error]');
  const errorTitle = query<HTMLElement>(root, '[data-error-title]');
  const errorSummary = query<HTMLElement>(root, '[data-error-summary]');
  const errorSteps = query<HTMLOListElement>(root, '[data-error-steps]');
  const errorRaw = query<HTMLElement>(root, '[data-error-raw]');
  const retryButton = query<HTMLButtonElement>(root, '[data-firmware-retry]');
  const retrySlowButton = query<HTMLButtonElement>(root, '[data-firmware-retry-slow]');
  const portHelpLink = query<HTMLElement>(root, '[data-error-port-help]');
  const manual = query<HTMLDetailsElement>(root, '[data-firmware-manual]');
  const chipButton = query<HTMLButtonElement>(root, '[data-firmware-check-chip]');
  const logBox = query<HTMLElement>(root, '[data-firmware-log]');

  const stageItems = new Map<FlashStageKey, HTMLElement>();
  for (const stage of FLASH_STAGES) {
    stageItems.set(stage.key, query<HTMLElement>(root, `[data-stage="${stage.key}"]`));
  }

  let support: FlashSupport = { state: 'no-serial', title: '', detail: '', browser: '' };
  let fileState: 'checking' | 'available' | 'missing' | 'unknown' = 'checking';
  let running = false;
  let current: FirmwareFlasher | null = null;
  let lastPort: SerialPort | null = null;
  /** 지난번 포트에서 보드가 대답했는지(굽기 모드가 아니었어도 무엇이든 받았으면 true) — [다시 시도]가 선택 창 없이 그 포트를 쓸지 정한다 */
  let lastPortAnswered = false;
  let lastMode: { slow: boolean; checkOnly: boolean } = { slow: false, checkOnly: false };
  let cachedImage: Uint8Array | null = null;
  const logLines: string[] = [];
  const disposers: (() => void)[] = [];

  const listen = (target: HTMLElement | Window, type: string, handler: (event: Event) => void) => {
    target.addEventListener(type, handler);
    disposers.push(() => target.removeEventListener(type, handler));
  };

  const announce = (text: string) => {
    live.textContent = '';
    // 같은 글을 다시 넣어도 화면 낭독기가 읽게 한 박자 뒤에 넣는다
    setTimeout(() => {
      live.textContent = text;
    }, 30);
  };

  const appendLog = (line: string) => {
    logLines.push(line);
    if (logLines.length > MAX_LOG_LINES) {
      logLines.splice(0, logLines.length - MAX_LOG_LINES);
    }
    logBox.textContent = logLines.join('\n');
  };

  const setStage = (key: FlashStageKey, state: StageState, detail?: string) => {
    const item = stageItems.get(key)!;
    item.dataset.stageState = state;
    query<HTMLElement>(item, '[data-stage-state-text]').textContent = STAGE_STATE_TEXT[state];
    if (detail !== undefined) {
      query<HTMLElement>(item, '[data-stage-detail]').textContent = detail;
    }
    if (state === 'active' || state === 'done' || state === 'failed') {
      const name = FLASH_STAGES.find((stage) => stage.key === key)!.name;
      announce(`${name}: ${STAGE_STATE_TEXT[state]}${detail ? ` — ${detail}` : ''}`);
    }
  };

  const setWriteProgress = (percent: number, text: string) => {
    const item = stageItems.get('write')!;
    query<HTMLElement>(item, '[data-stage-progress]').hidden = false;
    query<HTMLProgressElement>(item, '[data-progress-bar]').value = Math.max(0, Math.min(100, percent));
    query<HTMLElement>(item, '[data-progress-text]').textContent = text;
  };

  const setStageDetail = (key: FlashStageKey, text: string) => {
    query<HTMLElement>(stageItems.get(key)!, '[data-stage-detail]').textContent = text;
  };

  const resetStages = () => {
    for (const stage of FLASH_STAGES) {
      const item = stageItems.get(stage.key)!;
      item.dataset.stageState = 'waiting';
      query<HTMLElement>(item, '[data-stage-state-text]').textContent = STAGE_STATE_TEXT.waiting;
      query<HTMLElement>(item, '[data-stage-detail]').textContent = stage.waiting;
      const box = item.querySelector<HTMLElement>('[data-stage-progress]');
      if (box) {
        box.hidden = true;
        query<HTMLProgressElement>(box, '[data-progress-bar]').value = 0;
        query<HTMLElement>(box, '[data-progress-text]').textContent = '';
      }
    }
  };

  const updateButtons = () => {
    const ready = support.state === 'ready';
    startButton.disabled = running || !ready || fileState === 'missing';
    chipButton.disabled = running || !ready;
    eraseInput.disabled = running;
    stopButton.hidden = !running;
    runningNote.hidden = !running;
  };

  const setRootState = (state: 'idle' | 'running' | 'done' | 'error') => {
    root.dataset.state = state;
  };

  const onBeforeUnload = (event: Event) => {
    if (running) {
      // 떠나기 확인 창(Chrome 119+·Edge·Firefox는 preventDefault로 띄운다)
      event.preventDefault();
    }
  };

  // ── 페이지를 열 때: 지원 여부와 파일 ──
  support = decideFlashSupport(deps.env ?? envFromWindow(globalThis));
  root.dataset.support = support.state;
  supportText.textContent = `${support.browser} — ${support.title}`;
  if (support.state !== 'ready') {
    unsupportedBox.hidden = false;
    query<HTMLElement>(unsupportedBox, '[data-unsupported-title]').textContent = support.title;
    query<HTMLElement>(unsupportedBox, '[data-unsupported-detail]').textContent = support.detail;
    runBox.hidden = true;
  }

  const setFileState = (state: typeof fileState, text: string) => {
    fileState = state;
    root.dataset.fileState = state;
    fileText.textContent = text;
    missingBox.hidden = state !== 'missing';
    updateButtons();
  };

  void probeFirmware(fileUrl, firmware.size, deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}).then((probe) => {
    if (probe.state === 'available') {
      setFileState(
        'available',
        probe.sizeMismatch
          ? `사이트에 있어요. 다만 서버가 알려 준 크기(${formatWithCommas(probe.size ?? 0)}바이트)가 적힌 크기와 달라, 굽기 전에 다시 확인해요.`
          : `준비됐어요(${firmware.fileName}).`,
      );
    } else if (probe.state === 'missing') {
      setFileState('missing', '펌웨어 파일 준비 중이에요.');
    } else {
      setFileState('unknown', '지금은 파일을 확인하지 못했어요(인터넷 연결). [펌웨어 굽기 시작]을 누르면 다시 받아 봐요.');
    }
  });
  updateButtons();

  // ── 포트 ──
  // async 함수라도 첫 await 앞까지는 클릭 처리 안에서 바로 돈다 — 처음 고를 때 requestPort는 기다림 없이 불린다
  const choosePort = async (): Promise<SerialPort> => {
    if (!serial) {
      throw new FlashError('port-blocked', 'navigator.serial is not available.');
    }
    const previous = lastPort;
    if (!previous || !lastPortAnswered) {
      // 처음이거나, 지난번 포트에서 보드가 아무 대답도 없었으면(다른 포트를 골랐을 수 있음) 선택 창을 다시 띄운다
      return serial.requestPort();
    }
    // 방금 쓴 포트가 아직 허락된 목록에 있으면 창을 띄우지 않는다. 없으면 창을 띄운다 — requestPort는 사용자 조작 안에서만 되므로
    // 목록 확인(getPorts)이 짧게 끝나는 것을 믿는다(Chromium의 사용자 조작 유효 시간은 몇 초).
    const ports = await serial.getPorts();
    return ports.includes(previous) && previous.connected !== false ? previous : serial.requestPort();
  };

  // ── 파일 받기(포트 선택과 함께 시작) ──
  const startDownload = (): Promise<Uint8Array> => {
    if (cachedImage) {
      return Promise.resolve(cachedImage);
    }
    const started = Date.now();
    setStage('file', 'active', '펌웨어 파일을 받는 중이에요…');
    const promise = downloadFirmware(fileUrl, firmware.size, {
      ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
      onProgress: ({ loaded, total }) => {
        const item = stageItems.get('file')!;
        if (item.dataset.stageState === 'active') {
          query<HTMLElement>(item, '[data-stage-detail]').textContent =
            `펌웨어 파일을 받는 중이에요… ${formatMegabytes(loaded)} / ${formatMegabytes(total)}`;
        }
      },
    }).then(
      (bytes) => {
        appendLog(`firmware downloaded: ${bytes.length} bytes in ${Date.now() - started} ms`);
        return bytes;
      },
      (error: unknown) => {
        throw downloadErrorToFlashError(error);
      },
    );
    promise.catch(() => undefined);
    return promise;
  };

  // ── 결과 상자 ──
  const hideResults = () => {
    doneBox.hidden = true;
    errorBox.hidden = true;
  };

  const showDone = (title: string, boot: string) => {
    doneTitle.textContent = title;
    doneBoot.textContent = boot;
    doneBox.hidden = false;
    setRootState('done');
    announce(title);
    doneBox.focus();
  };

  const showError = (explained: FlashErrorExplanation) => {
    errorBox.hidden = false;
    errorBox.dataset.errorCode = explained.code;
    errorBox.dataset.tone = explained.notice ? 'notice' : 'error';
    errorTitle.textContent = explained.title;
    errorSummary.textContent = explained.summary;
    errorSteps.replaceChildren(
      ...explained.steps.map((step) => {
        const item = document.createElement('li');
        item.textContent = step;
        return item;
      }),
    );
    errorRaw.textContent = explained.raw;
    const canRetry = explained.retry !== 'none' && support.state === 'ready';
    retrySlowButton.hidden = !canRetry || explained.retry !== 'slow' || lastMode.checkOnly;
    retryButton.hidden = !canRetry;
    retryButton.textContent = lastMode.checkOnly ? '칩 다시 확인하기' : '다시 시도';
    portHelpLink.hidden = !['port-cancelled', 'port-busy', 'no-response', 'no-download-mode', 'no-sync-reply', 'device-lost'].includes(explained.code);
    setRootState('error');
    appendLog(`error [${explained.code}]\n${explained.raw}`);
    errorBox.focus();
  };

  // ── 굽기 ──
  const run = async (mode: { slow: boolean; checkOnly: boolean }) => {
    if (running || support.state !== 'ready') {
      return;
    }
    lastMode = mode;
    // requestPort는 이 클릭 안에서 가장 먼저 부른다(다른 await 뒤에 부르면 사용자 조작이 끝났다고 막힐 수 있다)
    const portPromise = choosePort();
    portPromise.catch(() => undefined);
    running = true;
    hideResults();
    resetStages();
    setRootState('running');
    updateButtons();
    addEventListener('beforeunload', onBeforeUnload);
    const eraseAll = !mode.checkOnly && eraseInput.checked;
    const download = mode.checkOnly ? null : startDownload();
    const flasherModule = loadFlasher();
    flasherModule.catch(() => undefined);
    let stage: FlashStageId = 'port';
    let flasher: FirmwareFlasher | null = null;
    setStage('port', 'active', '브라우저 창에서 보드가 꽂힌 포트(이름에 USB·CH340 같은 글자가 있는 것)를 골라 [연결]을 눌러요.');
    try {
      const port = await portPromise;
      lastPort = port;
      lastPortAnswered = false;
      setStage('port', 'done', describePort(port.getInfo()));
      stage = 'chip';
      setStage('chip', 'active', '보드를 굽기 모드로 바꾸는 중이에요…');
      // 같은 페이지의 [보드 연결](연결 확인)이 이 포트를 열어 두었으면 먼저 닫게 한다(port-release.ts — 열린 포트는 다시 열 수 없다)
      await requestSerialPortRelease('firmware');
      const { FirmwareFlasher: Flasher, FAST_BAUD_RATE } = await flasherModule;
      flasher = await Flasher.create({ port, baudRate: mode.slow ? 115200 : FAST_BAUD_RATE, log: appendLog });
      current = flasher;
      const bootHint = setTimeout(() => {
        if (stageItems.get('chip')!.dataset.stageState === 'active') {
          setStageDetail('chip', '보드를 굽기 모드로 바꾸는 중이에요… 오래 걸리면 보드의 BOOT 버튼을 누른 채로 기다려요.');
        }
      }, 4000);
      let chip: ChipReport;
      try {
        chip = await flasher.connect();
      } finally {
        clearTimeout(bootHint);
      }
      lastPortAnswered = true;
      setStage('chip', 'done', describeChip(chip));
      appendLog(`chip: ${chip.description}; features: ${chip.features.join(', ')}; flash ${chip.flashSizeLabel ?? 'unknown'}`);

      if (mode.checkOnly) {
        for (const key of ['file', 'erase', 'write', 'verify'] as const) {
          setStage(key, 'skipped');
        }
        stage = 'restart';
        setStage('restart', 'active');
        await flasher.restart({ watchMs: 0 });
        setStage('restart', 'done', '보드를 원래대로 다시 시작했어요.');
        showDone('칩 확인이 끝났어요.', `${describeChip(chip)}. 보드는 굽지 않고 원래대로 다시 시작했어요.`);
        return;
      }

      if (firmware.minFlashBytes !== null && chip.flashSizeBytes !== null && chip.flashSizeBytes < firmware.minFlashBytes) {
        throw new FlashError('flash-too-small', `Flash is ${chip.flashSizeLabel}, firmware needs ${formatMegabytes(firmware.minFlashBytes)}.`, {
          size: chip.flashSizeLabel ?? '',
          min: formatMegabytes(firmware.minFlashBytes),
        });
      }

      stage = 'file';
      if (stageItems.get('file')!.dataset.stageState !== 'active') {
        setStage('file', 'active', '펌웨어 파일을 확인하는 중이에요…');
      }
      const image = await download!;
      const verified = await verifyFirmwareImage(image, firmware);
      if (!verified.ok) {
        cachedImage = null;
        const what = verified.reason === 'size' ? '크기' : verified.reason === 'image' ? '모양(ESP32 이미지 머리)' : '지문(SHA-256)';
        throw new FlashError('firmware-corrupt', `${verified.message} (expected ${verified.expected}, actual ${verified.actual})`, { what });
      }
      cachedImage = image;
      setStage('file', 'done', `크기 ${formatWithCommas(image.length)}바이트 · SHA-256 일치`);
      if (!eraseAll) {
        setStage('erase', 'skipped', '"굽기 전에 보드를 모두 지우기"를 켜지 않아 건너뛰었어요.');
      }

      const writeStarted = { at: 0 };
      let eraseMs = 0;
      let lastAnnounced = -1;
      const result = await flasher.flash({
        image,
        offset: firmware.offset,
        eraseAll,
        expectedVersion: firmware.version,
        onPhase: (phase) => {
          if (phase === 'speed') {
            stage = 'write';
            setStage('write', 'active', '보드와 빠른 속도(460800)로 주고받도록 바꾸는 중이에요…');
          } else if (phase === 'erase') {
            stage = 'erase';
            setStage('erase', 'active', '보드를 지우는 중이에요. 보드가 대답하지 않아도 기다려요.');
          } else if (phase === 'write') {
            if (eraseAll) {
              setStage('erase', 'done', `보드를 모두 지웠어요(${Math.max(1, Math.round(eraseMs / 1000))}초).`);
            }
            stage = 'write';
            writeStarted.at = Date.now();
            setStage('write', 'active', '보드에 펌웨어를 보내는 중이에요. 케이블을 뽑지 마세요.');
            setWriteProgress(0, '0%');
          } else if (phase === 'verify') {
            setStage('write', 'done', '펌웨어를 모두 보냈어요.');
            stage = 'verify';
            setStage('verify', 'active');
          } else if (phase === 'restart') {
            setStage('verify', 'done', '보드에 쓴 내용이 파일과 같아요(MD5 일치).');
            stage = 'restart';
            setStage('restart', 'active', '보드를 다시 시작하고 MicroPython 시작 글을 기다려요…');
          }
        },
        onProgress: (progress) => {
          if (progress.phase === 'erase') {
            eraseMs = progress.done;
            setStageDetail('erase', `보드를 지우는 중이에요… ${Math.round(progress.done / 1000)}초 지남. 보드가 대답하지 않아도 끝날 때까지 기다려요(최대 2분).`);
            return;
          }
          const percent = progress.total > 0 ? Math.floor((progress.done / progress.total) * 100) : 0;
          const remaining = remainingText(Date.now() - writeStarted.at, progress.done, progress.total);
          setWriteProgress(percent, `${percent}%${remaining ? ` · ${remaining}` : ''}`);
          const step = Math.floor(percent / 25);
          if (step !== lastAnnounced) {
            lastAnnounced = step;
            announce(`펌웨어 쓰기 ${percent}%`);
          }
        },
      });
      appendLog(
        `flash done: ${result.bytesWritten} bytes (${result.compressedBytes} compressed) at ${result.baudRate} bps, write ${result.writeMs} ms, total ${result.durationMs} ms, md5 ${result.md5}`,
      );
      if (result.boot.output) {
        appendLog(`boot output:\n${result.boot.output}`);
      }
      const bootLine = bootText(result, firmware);
      setStage('restart', 'done', result.boot.version ? `MicroPython v${result.boot.version}이 시작했어요.` : '보드를 다시 시작했어요.');
      showDone(`끝났어요! 보드에 MicroPython v${firmware.version}이 들어갔어요.`, bootLine);
    } catch (error) {
      lastPortAnswered = flasher !== null && (flasher.chip !== null || flasher.receivedOutput);
      const explained = explainFlashError(error, {
        stage,
        ...(flasher ? { attempts: flasher.connectAttempts, deviceLost: flasher.deviceLost, receivedOutput: flasher.receivedOutput } : {}),
      });
      // 함께 진행 중이던 다른 단계(예: 칩 확인에서 멈췄는데 파일 받기는 끝남)는 기다림으로 돌리고, 멈춘 단계에는 풀이 제목을 적는다
      for (const item of FLASH_STAGES) {
        if (item.key !== stage && stageItems.get(item.key)!.dataset.stageState === 'active') {
          setStage(item.key, 'waiting', item.waiting);
        }
      }
      if (explained.code === 'port-cancelled') {
        setStage(stage, 'waiting', FLASH_STAGES.find((item) => item.key === stage)!.waiting);
      } else {
        setStage(stage, 'failed', explained.title);
      }
      if (flasher && !flasher.deviceLost && explained.code !== 'aborted') {
        await flasher.restartQuietly();
      }
      showError(explained);
    } finally {
      if (flasher) {
        await flasher.close();
      }
      current = null;
      running = false;
      removeEventListener('beforeunload', onBeforeUnload);
      updateButtons();
    }
  };

  listen(startButton, 'click', () => void run({ slow: false, checkOnly: false }));
  listen(chipButton, 'click', () => void run({ slow: false, checkOnly: true }));
  listen(retryButton, 'click', () => void run({ slow: lastMode.slow, checkOnly: lastMode.checkOnly }));
  listen(retrySlowButton, 'click', () => void run({ slow: true, checkOnly: false }));
  listen(stopButton, 'click', () => {
    if (!current) {
      return;
    }
    const ok = window.confirm('지금 멈추면 보드에 펌웨어가 반쯤만 들어가 다시 구워야 해요. 멈출까요?');
    if (ok) {
      current.abort();
    }
  });

  // "수동으로 굽는 방법" 링크·주소(#…-manual)로 오면 접힌 안내를 편다
  const openManualForHash = () => {
    if (location.hash === `#${manual.id}`) {
      manual.open = true;
    }
  };
  listen(query<HTMLElement>(root, '[data-firmware-manual-link]'), 'click', () => {
    manual.open = true;
  });
  listen(window, 'hashchange', openManualForHash);
  openManualForHash();

  root.dataset.mounted = 'true';
  return {
    root,
    firmware,
    destroy() {
      current?.abort();
      for (const dispose of disposers.splice(0)) {
        dispose();
      }
      removeEventListener('beforeunload', onBeforeUnload);
      delete root.dataset.mounted;
    },
  };
}

/** 페이지의 모든 굽기 화면을 움직인다(이미 움직인 것은 건너뛴다) */
export function mountAllFirmwareFlashers(scope: ParentNode = document, deps: FirmwareFlasherDeps = {}): FirmwareFlasherController[] {
  return Array.from(scope.querySelectorAll<HTMLElement>('[data-firmware-flasher]:not([data-mounted])')).map((root) => mountFirmwareFlasher(root, deps));
}
