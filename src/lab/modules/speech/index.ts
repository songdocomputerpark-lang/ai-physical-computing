/**
 * 음성 인식 흉내 모듈의 화면 쪽(P2-13, src/lab/README.md 4.3). 파이썬 쪽은 같은 폴더의 speech_recognition.py.
 *
 * 하는 일
 * - 파이썬 `r.listen(source)` → 요청 'speech.listen' → 여기서 **한 마디**를 받아 글자로 답한다.
 * - 받는 방법 세 가지(§10 개인정보, PD-08): ① 글자 입력(기본) ② 내 기기 안 인식 ③ 서버 인식.
 *   ③은 교사가 사이트 설정(/settings/)에서 켠 브라우저에서만 **고르기 상자에 만들어진다**(꺼져 있으면 DOM에 없음).
 * - 제한 모드(JSPI 없음)에서는 실행 중에 기다릴 수 없으므로, 입력칸 글자를 실행 전에 setValue('speech.text')로 넣어 둔다.
 *
 * 브라우저 밖으로 나가는 것: 글자 입력·내 기기 안 인식은 **없다**(tests/e2e/lab-speech.spec.ts가 요청 0건으로 확인).
 * 서버 인식만 브라우저가 스스로 음성을 회사 서버로 보낸다(페이지가 보내는 것이 아니라 브라우저 기능이다 — MDN).
 */
import { withBase } from '../../../lib/url.ts';
import { RECORDS_CLEARED_EVENT } from '../../controls/records.ts';
import type { RuntimeRequest } from '../../runtime/client.ts';
import type { LabModule, LabModuleContext, LabModuleHandle } from '../types.ts';
import manifest from './manifest.ts';
import { DEFAULT_SPEECH_MODE, isServerSpeechAllowed, isSpeechMode, readSpeechMode, saveSpeechMode, type SpeechMode } from './settings.ts';
import {
  availableModes,
  checkOnDevice,
  describeOnDevice,
  installOnDevice,
  MODE_LABELS,
  MODE_NOTES,
  onDeviceLabel,
  speechErrorInfo,
  speechRecognitionCtor,
  SPEECH_LANG,
  transcriptOf,
  type OnDeviceStatus,
  type SpeechRecognitionLike,
} from './web-speech.ts';

/** 화면이 파이썬에 답하는 값 */
interface ListenReply {
  ok: boolean;
  text?: string;
  mode: SpeechMode;
  failure?: 'unknown' | 'request' | 'timeout';
  message?: string;
}

const WAITING_TEXT = '파이썬이 한 마디를 기다리고 있어요. 문장을 적고 [보내기]를 누르세요.';
const LISTENING_TEXT = '듣는 중이에요. 마이크에 대고 말해 보세요.';
const IDLE_TEXT = '[실행]을 누르고 코드가 r.listen(...)에 닿으면 여기서 한 마디를 받아요.';
const SERVER_NOTICE = '서버 인식을 골랐어요. 마이크 소리가 브라우저 회사 서버로 전송됩니다(교사가 사이트 설정에서 켠 상태).';

function textOf(element: HTMLElement | null, value: string): void {
  if (element) {
    element.textContent = value;
  }
}

function mount(context: LabModuleContext): LabModuleHandle {
  const panel = context.panel;
  const win = typeof window === 'undefined' ? null : window;
  const ctor = speechRecognitionCtor(win);

  // 패널 안쪽 상자(panel.astro의 .speech). 상태 표시는 바깥 <section>(테스트·규약이 읽는 곳)과 이 상자(모양)에 함께 적는다.
  const box = panel?.querySelector<HTMLElement>('[data-speech-panel]') ?? null;
  const modeField = panel?.querySelector<HTMLElement>('[data-speech-mode-field]') ?? null;
  const note = panel?.querySelector<HTMLElement>('[data-speech-note]') ?? null;
  const status = panel?.querySelector<HTMLElement>('[data-speech-status]') ?? null;
  const form = panel?.querySelector<HTMLFormElement>('[data-speech-form]') ?? null;
  const input = panel?.querySelector<HTMLInputElement>('[data-speech-input]') ?? null;
  const micButton = panel?.querySelector<HTMLButtonElement>('[data-speech-mic]') ?? null;
  const skipButton = panel?.querySelector<HTMLButtonElement>('[data-speech-skip]') ?? null;
  const onDeviceText = panel?.querySelector<HTMLElement>('[data-speech-ondevice]') ?? null;
  const onDeviceCheck = panel?.querySelector<HTMLButtonElement>('[data-speech-ondevice-check]') ?? null;
  const lastText = panel?.querySelector<HTMLElement>('[data-speech-last]') ?? null;

  let serverAllowed = isServerSpeechAllowed();
  let onDevice: OnDeviceStatus = ctor ? 'unchecked' : 'unsupported';
  let onDeviceAsked = false;
  let modes: SpeechMode[] = availableModes({ hasRecognition: ctor !== null, onDevice, serverAllowed });
  let mode: SpeechMode = DEFAULT_SPEECH_MODE;
  let select: HTMLSelectElement | null = null;
  let pending: RuntimeRequest | null = null;
  /** 이번 listen()의 phrase_time_limit(초). 음성 인식을 그 시간에 끊는다. */
  let pendingPhraseLimit: number | null = null;
  let recognition: SpeechRecognitionLike | null = null;
  let stopTimer: number | null = null;
  let noticedServer = false;

  /** 저장해 둔 방식을 지금 고를 수 있는 것 중에서 고른다(설정을 끄면 서버 인식은 자동으로 글자 입력으로). */
  function restoreMode(): SpeechMode {
    return readSpeechMode(modes);
  }

  function renderModes(): void {
    if (!modeField) {
      return;
    }
    modeField.replaceChildren();
    select = modeField.ownerDocument.createElement('select');
    select.id = 'lab-module-speech-mode';
    select.className = 'lab__select speech__select';
    select.setAttribute('data-speech-mode-select', '');
    for (const value of modes) {
      const option = modeField.ownerDocument.createElement('option');
      option.value = value;
      option.textContent = MODE_LABELS[value];
      select.append(option);
    }
    select.value = mode;
    select.addEventListener('change', () => {
      setMode(isSpeechMode(select?.value) ? (select!.value as SpeechMode) : DEFAULT_SPEECH_MODE);
    });
    modeField.append(select);
  }

  function renderOnDevice(): void {
    textOf(onDeviceText, `내 기기 안 인식: ${onDeviceLabel(onDevice)} — ${describeOnDevice(onDevice)}`);
    if (onDeviceCheck) {
      // 아직 물어보지 않았고 물어볼 수 있을 때만 버튼을 보인다.
      onDeviceCheck.hidden = !(ctor !== null && onDevice === 'unchecked');
    }
    if (panel) {
      panel.dataset.speechOndevice = onDevice;
      panel.dataset.speechServerAllowed = serverAllowed ? 'yes' : 'no';
    }
  }

  function renderMode(): void {
    for (const element of [panel, box]) {
      if (element) {
        element.dataset.speechModeValue = mode;
      }
    }
    if (select && select.value !== mode) {
      select.value = mode;
    }
    textOf(note, MODE_NOTES[mode]);
    // 글자 칸은 늘 보인다: 음성 방식에서도 말이 잘 안 될 때 글자로 보낼 수 있게(SPEC §2 "하드웨어 없어도 100%").
    if (micButton) {
      micButton.hidden = mode === 'text';
    }
    context.setValue('speech.mode', mode);
  }

  function setMode(next: SpeechMode): void {
    mode = modes.includes(next) ? next : DEFAULT_SPEECH_MODE;
    saveSpeechMode(mode);
    stopRecognition();
    renderMode();
    if (pending) {
      // 기다리는 중에 방식을 바꾸면 그 방식으로 이어서 받는다.
      void beginListening();
    }
  }

  function setState(value: 'idle' | 'listening'): void {
    for (const element of [panel, box]) {
      if (element) {
        element.dataset.speechState = value;
      }
    }
  }

  function clearStopTimer(): void {
    if (stopTimer !== null) {
      clearTimeout(stopTimer);
      stopTimer = null;
    }
  }

  function stopRecognition(): void {
    clearStopTimer();
    const current = recognition;
    recognition = null;
    if (current) {
      current.onresult = null;
      current.onerror = null;
      current.onend = null;
      try {
        current.abort();
      } catch {
        // 이미 끝난 인식
      }
    }
    if (micButton) {
      micButton.textContent = '말하기 시작';
      micButton.dataset.speechListening = 'no';
    }
  }

  /** 파이썬에 한 번만 답한다(두 번째부터는 무시). */
  function answer(reply: ListenReply): void {
    const request = pending;
    pending = null;
    stopRecognition();
    setState('idle');
    if (!request) {
      return;
    }
    request.reply(reply);
    if (reply.ok) {
      textOf(lastText, `받은 문장: ${reply.text ?? ''}`);
      textOf(status, `보냈어요: ${reply.text ?? ''}`);
    } else {
      textOf(lastText, reply.message ?? '');
      textOf(status, reply.message ?? '알아듣지 못했어요.');
    }
  }

  function startRecognition(): void {
    if (!ctor || mode === 'text') {
      return;
    }
    stopRecognition();
    let instance: SpeechRecognitionLike;
    try {
      instance = new ctor();
    } catch {
      answer({ ok: false, mode, failure: 'request', message: '이 브라우저에서 음성 인식을 시작하지 못했어요.' });
      return;
    }
    instance.lang = SPEECH_LANG;
    instance.continuous = false;
    instance.interimResults = false;
    instance.maxAlternatives = 1;
    if (mode === 'ondevice') {
      instance.processLocally = true;
    }
    let got = false;
    instance.onresult = (event) => {
      got = true;
      const text = transcriptOf(event);
      if (text === '') {
        answer({ ok: false, mode, failure: 'unknown', message: '말소리를 글자로 바꾸지 못했어요.' });
        return;
      }
      answer({ ok: true, text, mode });
    };
    instance.onerror = (event) => {
      got = true;
      const info = speechErrorInfo(typeof event?.error === 'string' ? event.error : undefined);
      answer({ ok: false, mode, failure: info.failure, message: info.message });
    };
    instance.onend = () => {
      if (!got && pending) {
        answer({ ok: false, mode, failure: 'unknown', message: '말소리가 들리지 않았어요.' });
      }
    };
    recognition = instance;
    try {
      instance.start();
    } catch {
      answer({ ok: false, mode, failure: 'request', message: '음성 인식을 시작하지 못했어요(이미 듣는 중일 수 있어요).' });
      return;
    }
    if (micButton) {
      micButton.textContent = '그만 말하기';
      micButton.dataset.speechListening = 'yes';
    }
    textOf(status, LISTENING_TEXT);
    const limit = pendingPhraseLimit;
    if (typeof limit === 'number' && limit > 0 && typeof window !== 'undefined') {
      stopTimer = window.setTimeout(() => {
        stopTimer = null;
        try {
          recognition?.stop();
        } catch {
          // 이미 멈춘 인식
        }
      }, limit * 1000);
    }
  }

  async function beginListening(): Promise<void> {
    setState('listening');
    if (mode === 'text') {
      textOf(status, WAITING_TEXT);
      input?.focus();
      return;
    }
    if (mode === 'server' && !noticedServer) {
      noticedServer = true;
      context.notice(SERVER_NOTICE);
    }
    if (mode === 'ondevice' && (onDevice === 'downloadable' || onDevice === 'downloading')) {
      textOf(status, '한국어 음성 팩을 준비하는 중이에요. 조금 기다려 주세요.');
      const ok = await installOnDevice(ctor);
      onDevice = ok ? 'available' : await checkOnDevice(ctor);
      renderOnDevice();
      if (!ok) {
        answer({ ok: false, mode, failure: 'request', message: '한국어 음성 팩을 준비하지 못했어요. 글자 입력으로 바꿔 주세요.' });
        return;
      }
    }
    if (!pending) {
      return;
    }
    startRecognition();
  }

  function onListenRequest(request: RuntimeRequest): void {
    const payload = (request.payload ?? {}) as { phraseTimeLimit?: unknown };
    pendingPhraseLimit = typeof payload.phraseTimeLimit === 'number' && Number.isFinite(payload.phraseTimeLimit) ? payload.phraseTimeLimit : null;
    pending = request;
    void beginListening();
  }

  function sendText(text: string): void {
    const value = text.trim();
    if (pending) {
      if (value === '') {
        answer({ ok: false, mode: 'text', failure: 'unknown', message: '빈 문장이라 알아듣지 못한 것으로 보냈어요.' });
        return;
      }
      answer({ ok: true, text: value, mode: 'text' });
      if (input) {
        input.value = '';
      }
      context.setValue('speech.text', '');
      return;
    }
    // 아직 파이썬이 기다리지 않을 때: 적어 둔 문장을 기억해 둔다(제한 모드와 다음 listen에서 쓴다).
    context.setValue('speech.text', value);
    textOf(status, value === '' ? IDLE_TEXT : `적어 두었어요: ${value} — [실행] 뒤 첫 r.listen()에서 써요.`);
  }

  const onSubmit = (event: Event) => {
    event.preventDefault();
    sendText(input?.value ?? '');
  };
  form?.addEventListener('submit', onSubmit);

  const onInput = () => {
    if (!pending) {
      context.setValue('speech.text', input?.value.trim() ?? '');
    }
  };
  input?.addEventListener('input', onInput);

  const onSkip = () => {
    if (pending) {
      answer({ ok: false, mode, failure: 'unknown', message: '말을 받지 못한 것으로 보냈어요(UnknownValueError).' });
    }
  };
  skipButton?.addEventListener('click', onSkip);

  const onMic = () => {
    if (recognition) {
      try {
        recognition.stop();
      } catch {
        stopRecognition();
      }
      return;
    }
    if (!pending) {
      textOf(status, '[실행]을 눌러 코드가 r.listen(...)에 닿으면 말하기가 시작돼요.');
      return;
    }
    void beginListening();
  };
  micButton?.addEventListener('click', onMic);

  const onRecordsCleared = () => {
    // 기록을 지우면 "서버 음성 인식 허용"도 함께 지워져 기본값(꺼짐)으로 돌아간다.
    serverAllowed = isServerSpeechAllowed();
    modes = availableModes({ hasRecognition: ctor !== null, onDevice, serverAllowed });
    mode = DEFAULT_SPEECH_MODE;
    renderModes();
    renderMode();
    renderOnDevice();
  };
  document.addEventListener(RECORDS_CLEARED_EVENT, onRecordsCleared);

  context.onRequest('speech.listen', onListenRequest);

  context.onLab('run', () => {
    // 정지 2단계(워커 재시작)로 값이 사라질 수 있어 실행마다 다시 넣는다. 제한 모드는 이 값으로 listen()이 돈다.
    context.setValue('speech.mode', mode);
    context.setValue('speech.text', input?.value.trim() ?? '');
    noticedServer = false;
    textOf(lastText, '');
  });

  context.onLab('done', () => {
    // 실행이 끝났거나 [정지]로 멈췄으면 기다리던 것을 정리한다(파이썬은 이미 KeyboardInterrupt를 받았다).
    pending = null;
    stopRecognition();
    setState('idle');
    textOf(status, IDLE_TEXT);
  });

  mode = restoreMode();
  renderModes();
  renderMode();
  renderOnDevice();
  setState('idle');
  textOf(status, IDLE_TEXT);
  context.setValue('speech.text', input?.value.trim() ?? '');
  context.showPanel();

  /*
   * 기기 안 인식이 되는지는 **학생이 이 패널을 건드릴 때** 물어본다(음성은 보내지 않고 가능 여부만).
   * 페이지를 열자마자 물어보지 않는 까닭: 기기 안 음성 인식 서비스가 없는 Chromium 계열(예: Playwright가 쓰는 Chromium,
   * 일부 리눅스 빌드)에서 그 API를 부르면 브라우저가 "No binder found for interface media.mojom.OnDeviceSpeechRecognition"로
   * **탭을 통째로 죽인다**(2026-09-16 CI에서 확인 — 실습실 검사 80건이 Page crashed로 실패). 음성을 쓰지 않는 학생은
   * 그 API를 아예 부르지 않게 하고, 물어보는 시점도 학생이 고르는 순간으로 미룬다(PROGRESS 미해결 38번).
   */
  function askOnDevice(): void {
    if (onDeviceAsked || !ctor) {
      return;
    }
    onDeviceAsked = true;
    void checkOnDevice(ctor).then((result) => {
      onDevice = result;
      modes = availableModes({ hasRecognition: ctor !== null, onDevice, serverAllowed });
      const previous = mode;
      mode = modes.includes(previous) ? previous : restoreMode();
      renderModes();
      renderMode();
      renderOnDevice();
    });
  }

  onDeviceCheck?.addEventListener('click', askOnDevice);

  const settingsLink = panel?.querySelector<HTMLAnchorElement>('[data-speech-settings-link]') ?? null;
  if (settingsLink) {
    settingsLink.href = withBase('settings/');
  }

  return {
    dispose() {
      form?.removeEventListener('submit', onSubmit);
      input?.removeEventListener('input', onInput);
      skipButton?.removeEventListener('click', onSkip);
      micButton?.removeEventListener('click', onMic);
      document.removeEventListener(RECORDS_CLEARED_EVENT, onRecordsCleared);
      onDeviceCheck?.removeEventListener('click', askOnDevice);
      stopRecognition();
      pending = null;
    },
  };
}

const module: LabModule = { manifest, mount };
export default module;
