/**
 * 가상 보드의 소리(버저·MP3 모듈) — 페이지에 AudioContext 하나와 [소리 켜기/끄기] 상태 하나(병렬 제작 준비 2026-09-17, PLAN §6.2 학생 입력
 * "소리 켜기·끄기", CODE_MAPPING §3.8.3 버저).
 *
 * 왜 한 곳에: 버저(P3-03 구역 A)와 MP3 모듈(P3-05 구역 C)이 저마다 AudioContext와 켜기 단추를 만들면 한 예제에 소리가 둘 섞이고 단추도 둘이 된다.
 * 부품은 render의 update에서 getBoardAudio().context()·destination()을 받아 OscillatorNode·AudioBufferSourceNode를 이어 쓰고,
 * 보드 화면(index.ts)이 [실행] 때 resume()을, [소리 켜기/끄기] 단추가 setEnabled()를 부른다.
 *
 * 자동 재생 정책: 브라우저는 사용자가 페이지를 누르기 전에 만든 AudioContext를 멈춘(suspended) 채로 둔다. 학생이 [실행]을 누른 뒤
 * resume()하면 소리가 난다(MDN Web Audio API Best practices — autoplay, CODE_MAPPING §3.8.3 확인). 끄면 context를 suspend해 모든 소리가 바로 멈춘다.
 * 선택은 이 컴퓨터에 기억한다(module:board:sound — [이 컴퓨터에서 내 기록 지우기]가 함께 지운다). 기본은 켜짐.
 * 브라우저 테스트는 소리를 들을 수 없으므로 부품이 data-visual-*(예: tone-hz, playing)로 소리 상태를 함께 보인다.
 */
import { readItem, writeItem } from '../../../lib/storage.ts';

/** [소리 켜기/끄기] 선택을 기억하는 저장 이름(ctx.storageName('sound')와 같은 열쇠) */
export const SOUND_STORAGE_NAME = 'module:board:sound';

export interface BoardAudio {
  /** 소리를 내도 되는지(학생 선택) */
  readonly enabled: boolean;
  /** 소리 켜기·끄기. remember면 이 컴퓨터에 기억한다 */
  setEnabled(enabled: boolean, remember?: boolean): void;
  /** 소리를 낼 AudioContext(처음 부를 때 만든다). 꺼져 있거나 브라우저가 Web Audio를 못 쓰면 null */
  context(): AudioContext | null;
  /** 부품 소리를 이을 곳(주 음량 노드 → 스피커). 꺼져 있거나 못 쓰면 null */
  destination(): AudioNode | null;
  /** 사용자가 누른 직후([실행])에 불러 멈춘 AudioContext를 깨운다 */
  resume(): void;
  /** 켜기·끄기가 바뀔 때 알림. 해제 함수를 돌려준다 */
  onChange(listener: (enabled: boolean) => void): () => void;
}

export interface BoardAudioHost {
  /** AudioContext 만들기(테스트는 가짜를 넘긴다). 못 만들면 null */
  createContext(): AudioContext | null;
  readStored(): string | null;
  writeStored(value: string): void;
}

function defaultHost(): BoardAudioHost {
  return {
    createContext() {
      try {
        const AudioContextClass = globalThis.AudioContext;
        return typeof AudioContextClass === 'function' ? new AudioContextClass() : null;
      } catch {
        return null;
      }
    },
    readStored: () => readItem(SOUND_STORAGE_NAME),
    writeStored: (value) => {
      writeItem(SOUND_STORAGE_NAME, value);
    },
  };
}

export function createBoardAudio(host: BoardAudioHost = defaultHost()): BoardAudio {
  let enabled = host.readStored() !== 'off';
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let unavailable = false;
  const listeners = new Set<(enabled: boolean) => void>();

  const ensure = (): AudioContext | null => {
    if (!enabled || unavailable) {
      return null;
    }
    if (!context) {
      context = host.createContext();
      if (!context) {
        unavailable = true;
        return null;
      }
      try {
        master = context.createGain();
        master.gain.value = 1;
        master.connect(context.destination);
      } catch {
        master = null;
      }
    }
    return context;
  };

  return {
    get enabled() {
      return enabled;
    },
    setEnabled(next, remember = true) {
      if (next === enabled) {
        return;
      }
      enabled = next;
      if (remember) {
        host.writeStored(next ? 'on' : 'off');
      }
      if (context) {
        void (next ? context.resume() : context.suspend()).catch(() => undefined);
      }
      for (const listener of listeners) {
        listener(enabled);
      }
    },
    context: ensure,
    destination() {
      const current = ensure();
      return current ? (master ?? current.destination) : null;
    },
    resume() {
      if (enabled && context && context.state === 'suspended') {
        void context.resume().catch(() => undefined);
      }
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

let shared: BoardAudio | null = null;

/** 페이지에 하나뿐인 가상 보드 소리 */
export function getBoardAudio(): BoardAudio {
  shared ??= createBoardAudio();
  return shared;
}
