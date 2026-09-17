/**
 * 가상 버저의 소리(Web Audio) — 페이지에 하나뿐인 가상 보드 소리(board-audio.ts getBoardAudio)에 OscillatorNode를 이어 낸다(PLAN §6.2 버저, README 7.9-3 소리).
 *
 * - 소리는 사용자가 [실행]을 누른 뒤에만 난다: AudioContext는 처음 소리가 필요할 때 board-audio.ts가 만들고, 보드 모듈이 [실행] 때 resume()한다
 *   (브라우저 자동 재생 정책 — MDN Web Audio API best practices, CODE_MAPPING §3.8.3). 멈춘(suspended) 채면 여기서도 resume()을 한 번 부른다.
 * - [소리 꺼짐](board-audio setEnabled(false))이면 소리를 내지 않는다(muted). 다시 켜면 지금 소리를 이어 낸다(onChange).
 * - 모양: 고정음은 사각파(square), PWM은 duty에 맞춘 펄스파(createPeriodicWave — 50 %면 사각파). 크기는 BASE_GAIN × 소리 크기 비율(buzzer-model.ts),
 *   켜고 끌 때 짧게 줄여(8ms) 딸깍 소리를 줄인다. 음원 파일은 쓰지 않는다(PD-16).
 * - 움직임 줄이기 설정과는 상관없다(소리는 움직임이 아님).
 * 상태(state): playing(소리 남) · silent(낼 소리 없음) · muted([소리 꺼짐]) · blocked(브라우저가 아직 소리를 막음) · unavailable(Web Audio 없음).
 * 부품 그림이 data-buzzer-audio 속성으로 적어 브라우저 테스트가 읽는다(소리는 들을 수 없으므로).
 */
import { getBoardAudio, type BoardAudio } from '../../board-audio.ts';
import { pulseWaveCoefficients, type BuzzerTone } from './buzzer-model.ts';

export type BuzzerAudioState = 'playing' | 'silent' | 'muted' | 'blocked' | 'unavailable';

/** 주 음량(교실에서 여러 대가 함께 울려도 시끄럽지 않게 작게) */
export const BUZZER_BASE_GAIN = 0.07;
const RAMP_SECONDS = 0.008;

export interface BuzzerVoice {
  set(tone: BuzzerTone): void;
  readonly state: BuzzerAudioState;
  dispose(): void;
}

export interface BuzzerVoiceOptions {
  readonly audio?: BoardAudio;
  onState?(state: BuzzerAudioState): void;
}

export function createBuzzerVoice(options: BuzzerVoiceOptions = {}): BuzzerVoice {
  const audio = options.audio ?? getBoardAudio();
  let tone: BuzzerTone | null = null;
  let oscillator: OscillatorNode | null = null;
  let gain: GainNode | null = null;
  let waveKey = '';
  let state: BuzzerAudioState = 'silent';
  let watchedContext: AudioContext | null = null;
  const waves = new Map<number, PeriodicWave>();

  const setState = (next: BuzzerAudioState) => {
    if (state !== next) {
      state = next;
      options.onState?.(next);
    }
  };

  const stop = () => {
    const osc = oscillator;
    const amp = gain;
    oscillator = null;
    gain = null;
    waveKey = '';
    if (!osc || !amp) {
      return;
    }
    try {
      const now = osc.context.currentTime;
      amp.gain.cancelScheduledValues(now);
      amp.gain.setTargetAtTime(0, now, RAMP_SECONDS);
      osc.onended = () => {
        try {
          osc.disconnect();
          amp.disconnect();
        } catch {
          // 이미 끊긴 노드
        }
      };
      osc.stop(now + 0.06);
    } catch {
      // 컨텍스트가 닫혔으면 할 일이 없다.
    }
  };

  const apply = () => {
    if (!tone || !tone.sounding) {
      stop();
      setState('silent');
      return;
    }
    if (!audio.enabled) {
      stop();
      setState('muted');
      return;
    }
    const context = audio.context();
    const destination = audio.destination();
    if (!context || !destination) {
      stop();
      setState('unavailable');
      return;
    }
    if (watchedContext !== context) {
      watchedContext = context;
      context.addEventListener('statechange', () => {
        if (oscillator) {
          setState(context.state === 'running' ? 'playing' : 'blocked');
        }
      });
    }
    if (context.state === 'suspended') {
      void context.resume().catch(() => undefined);
    }
    const now = context.currentTime;
    const hz = Math.min(Math.max(tone.toneHz, 1), context.sampleRate / 2 - 1);
    if (!oscillator || !gain) {
      oscillator = context.createOscillator();
      gain = context.createGain();
      gain.gain.value = 0;
      oscillator.frequency.value = hz;
      oscillator.connect(gain);
      gain.connect(destination);
      oscillator.start();
      waveKey = '';
    }
    const percent = Math.round(tone.duty * 100);
    const key = tone.source === 'digital' || percent === 50 ? 'square' : `pulse:${percent}`;
    if (key !== waveKey) {
      if (key === 'square') {
        oscillator.type = 'square';
      } else {
        let wave = waves.get(percent);
        if (!wave) {
          const { real, imag } = pulseWaveCoefficients(percent / 100);
          wave = context.createPeriodicWave(real, imag);
          waves.set(percent, wave);
        }
        oscillator.setPeriodicWave(wave);
      }
      waveKey = key;
    }
    oscillator.frequency.setTargetAtTime(hz, now, 0.002);
    gain.gain.setTargetAtTime(BUZZER_BASE_GAIN * (tone.audible ? tone.loudness : 0), now, RAMP_SECONDS);
    setState(context.state === 'running' ? 'playing' : 'blocked');
  };

  const unsubscribe = audio.onChange(() => apply());

  return {
    set(next) {
      tone = next;
      apply();
    },
    get state() {
      return state;
    },
    dispose() {
      unsubscribe();
      tone = null;
      stop();
      setState('silent');
    },
  };
}
