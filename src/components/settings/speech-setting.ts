/**
 * 사이트 설정 페이지(/settings/)의 "서버 음성 인식 허용(교사용)" 동작(P2-13, PLAN §10).
 *
 * 화면(HTML)은 SpeechSetting.astro, 저장 이름과 기본값은 src/lab/modules/speech/settings.ts,
 * 브라우저 음성 인식 확인은 src/lab/modules/speech/web-speech.ts에 있다. 이 파일은 둘을 잇기만 한다.
 *
 * 규칙
 * - 기본은 **꺼짐**이고, 저장 공간을 못 쓰는 브라우저(사생활 보호 모드·학교 정책)에서도 오류 없이 "저장하지 못했어요"만 알린다.
 * - [이 컴퓨터에서 내 기록 지우기]를 누르면 이 설정도 지워져 꺼짐으로 돌아간다(apc:records-cleared를 듣고 화면도 되돌린다).
 * - 온디바이스(기기 안) 인식 확인은 **가능 여부만** 물어본다. 음성을 보내지 않는다.
 * - 음성 팩 내려받기(install)는 사람이 [준비하기]를 눌렀을 때만 한다(브라우저가 브라우저 회사에서 받는다).
 */
import { RECORDS_CLEARED_EVENT } from '../../lab/controls/records.ts';
import { isServerSpeechAllowed, setServerSpeechAllowed } from '../../lab/modules/speech/settings.ts';
import { checkOnDevice, describeOnDevice, installOnDevice, onDeviceLabel, speechRecognitionCtor, type OnDeviceStatus } from '../../lab/modules/speech/web-speech.ts';

export interface SpeechSettingHandle {
  /** 지금 화면에 보이는 값(테스트·디버그용) */
  readonly allowed: boolean;
  readonly status: OnDeviceStatus;
  dispose(): void;
}

const ON_TEXT = '켜짐 — 학생이 실습실에서 "서버 인식"을 고를 수 있어요.';
const OFF_TEXT = '꺼짐 — 글자 입력과 기기 안 인식만 쓸 수 있어요(기본값).';
const SAVED_TEXT = '이 브라우저에 저장했어요.';
const SAVE_FAILED_TEXT = '이 브라우저에는 설정을 저장할 수 없어요(사생활 보호 모드이거나 저장이 막혀 있어요). 탭을 닫으면 꺼짐으로 돌아가요.';

function setText(element: HTMLElement | null, text: string): void {
  if (element) {
    element.textContent = text;
  }
}

/** 설정 화면 하나를 잇는다. 뿌리 요소가 없으면 아무것도 하지 않는다(다른 페이지에서 불려도 안전). */
export function mountSpeechSetting(root: HTMLElement | null): SpeechSettingHandle | null {
  if (!root) {
    return null;
  }
  const toggle = root.querySelector<HTMLInputElement>('[data-server-speech]');
  const state = root.querySelector<HTMLElement>('[data-server-speech-state]');
  const saved = root.querySelector<HTMLElement>('[data-server-speech-saved]');
  const statusText = root.querySelector<HTMLElement>('[data-ondevice-status]');
  const checkButton = root.querySelector<HTMLButtonElement>('[data-ondevice-check]');
  const installButton = root.querySelector<HTMLButtonElement>('[data-ondevice-install]');
  const ctor = speechRecognitionCtor(typeof window === 'undefined' ? null : window);

  let allowed = isServerSpeechAllowed();
  let status: OnDeviceStatus = ctor ? 'unchecked' : 'unsupported';

  function renderToggle(): void {
    if (toggle) {
      toggle.checked = allowed;
    }
    setText(state, allowed ? ON_TEXT : OFF_TEXT);
    root!.dataset.speechAllowed = allowed ? 'on' : 'off';
  }

  function renderStatus(): void {
    setText(statusText, `${onDeviceLabel(status)} — ${describeOnDevice(status)}`);
    root!.dataset.ondevice = status;
    if (checkButton) {
      // 아직 물어보지 않았으면 [확인], 한 번이라도 물어봤으면 [다시 확인](실습실 패널의 단추와 같은 낱말).
      checkButton.textContent = status === 'unchecked' ? '확인' : '다시 확인';
    }
    if (installButton) {
      installButton.hidden = !(status === 'downloadable' || status === 'downloading');
    }
  }

  async function refreshStatus(): Promise<void> {
    setText(statusText, '확인하는 중이에요…');
    status = await checkOnDevice(ctor);
    renderStatus();
  }

  const onToggle = () => {
    allowed = Boolean(toggle?.checked);
    const ok = setServerSpeechAllowed(allowed);
    renderToggle();
    setText(saved, ok ? SAVED_TEXT : SAVE_FAILED_TEXT);
  };
  toggle?.addEventListener('change', onToggle);

  const onCheck = () => {
    void refreshStatus();
  };
  checkButton?.addEventListener('click', onCheck);

  const onInstall = () => {
    if (!installButton) {
      return;
    }
    installButton.disabled = true;
    setText(statusText, '한국어 음성 팩을 준비하는 중이에요. 시간이 걸릴 수 있어요…');
    void installOnDevice(ctor)
      .then(() => refreshStatus())
      .finally(() => {
        installButton.disabled = false;
      });
  };
  installButton?.addEventListener('click', onInstall);

  const onCleared = () => {
    allowed = isServerSpeechAllowed();
    renderToggle();
    setText(saved, '기록을 지워서 기본값(꺼짐)으로 돌아갔어요.');
  };
  document.addEventListener(RECORDS_CLEARED_EVENT, onCleared);

  renderToggle();
  // 처음에는 "확인 전"으로 두고 [다시 확인]을 눌렀을 때만 브라우저에 물어본다.
  // 기기 안 음성 인식 서비스가 없는 Chromium 계열에서는 그 API를 부르는 것만으로 탭이 죽기 때문이다(PROGRESS 미해결 38번).
  renderStatus();

  return {
    get allowed() {
      return allowed;
    },
    get status() {
      return status;
    },
    dispose() {
      toggle?.removeEventListener('change', onToggle);
      checkButton?.removeEventListener('click', onCheck);
      installButton?.removeEventListener('click', onInstall);
      document.removeEventListener(RECORDS_CLEARED_EVENT, onCleared);
    },
  };
}
