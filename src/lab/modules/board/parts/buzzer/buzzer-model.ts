/**
 * 수동 버저 부품의 순수 논리(DOM·Web Audio 없음 — tests/unit/lab/board-part-buzzer.test.ts).
 *
 * 소리 규칙(PLAN §6.2 "수동 버저 | 디지털 켜기(고정음), PWM.freq·duty·duty_u16·deinit → 사각파 소리(OscillatorNode), duty 0이면 무음",
 * CODE_MAPPING §3.8.3 버저)
 * - PWM(0 < duty < 1): 그 주파수(Hz)의 펄스파. 소리 크기는 duty가 50 %일 때 가장 크고 0·100 %에 가까울수록 작다 — 펄스파의 기본음 세기가
 *   sin(π × duty)에 비례하기 때문(푸리에 급수). 교과서 158쪽은 duty(512)를 "음 크기"라고 설명하지만 실제로는 파형의 비율이다(CODE_MAPPING f068 — 교사용 정정 후보).
 * - 핀이 계속 1(HIGH 출력, 또는 PWM duty 100 %): 사이트가 정한 고정음 1000Hz. 실물 수동 버저는 켜기만 하면 딸깍 소리만 날 수 있다(확인 전 — PLAN 부록 B-2 12번).
 *   교과서 f067·f069가 on()·off()로 소리를 내는 실습이라 가상 보드는 들리는 소리로 보여 준다.
 * - 0(LOW)·PWM duty 0·출력 아님·[정지]: 무음.
 * - 20Hz 아래·20kHz 위는 사람 귀에 소리로 잘 들리지 않는다(audible false — 그림에 "들리지 않는 높이" 글).
 */
import type { PinSignal } from '../../ext/pwm/pwm-signal.ts';

/** 핀이 계속 1일 때 내는 사이트 고정음(Hz) */
export const BUZZER_DIGITAL_TONE_HZ = 1000;
export const BUZZER_AUDIBLE_MIN_HZ = 20;
export const BUZZER_AUDIBLE_MAX_HZ = 20_000;

export type BuzzerSource = 'pwm' | 'digital' | 'none';

export interface BuzzerTone {
  readonly sounding: boolean;
  /** 소리 높이(Hz) — 무음이면 0 */
  readonly toneHz: number;
  /** 켜진 시간 비율(0~1) — 고정음은 1, 무음은 0 */
  readonly duty: number;
  readonly source: BuzzerSource;
  /** 사람 귀에 들리는 높이인지(20Hz~20kHz) */
  readonly audible: boolean;
  /** 소리 크기 비율(0~1): PWM은 sin(π × duty), 고정음은 1 */
  readonly loudness: number;
}

export const BUZZER_SILENT: BuzzerTone = Object.freeze({ sounding: false, toneHz: 0, duty: 0, source: 'none', audible: false, loudness: 0 });

/** 펄스파 기본음의 세기 비율(50 %에서 1) */
export function loudnessForDuty(duty: number): number {
  if (!(duty > 0) || duty >= 1) {
    return duty >= 1 ? 1 : 0;
  }
  return Math.sin(Math.PI * duty);
}

/** 핀 신호 → 버저 소리 */
export function buzzerTone(signal: PinSignal): BuzzerTone {
  if (signal.kind === 'high' || (signal.kind === 'pwm' && signal.duty >= 1)) {
    return { sounding: true, toneHz: BUZZER_DIGITAL_TONE_HZ, duty: 1, source: 'digital', audible: true, loudness: 1 };
  }
  if (signal.kind !== 'pwm' || !(signal.duty > 0) || signal.freq === null) {
    return BUZZER_SILENT;
  }
  const toneHz = signal.freq;
  return {
    sounding: true,
    toneHz,
    duty: signal.duty,
    source: 'pwm',
    audible: toneHz >= BUZZER_AUDIBLE_MIN_HZ && toneHz <= BUZZER_AUDIBLE_MAX_HZ,
    loudness: loudnessForDuty(signal.duty),
  };
}

/** 그림·화면 낭독기 글: "262Hz 소리(duty 50%)" / "1000Hz 고정음" / "조용함" */
export function buzzerSummary(tone: BuzzerTone): string {
  if (!tone.sounding) {
    return '조용함';
  }
  if (tone.source === 'digital') {
    return `${tone.toneHz}Hz 고정음(핀이 계속 1)`;
  }
  const duty = Math.round(tone.duty * 100);
  return `${tone.toneHz}Hz 소리(duty ${duty}%)${tone.audible ? '' : ' — 사람 귀에 들리지 않는 높이'}`;
}

/**
 * 펄스파(켜진 비율 duty) 한 주기의 푸리에 계수: 코사인 항 a_n = 2 ÷ (nπ) × sin(nπ × duty), 사인 항 0.
 * Web Audio createPeriodicWave(real, imag)에 넣는다(정규화는 Web Audio가 한다). harmonics는 배음 수.
 */
export function pulseWaveCoefficients(duty: number, harmonics = 48): { real: Float32Array; imag: Float32Array } {
  const real = new Float32Array(harmonics + 1);
  const imag = new Float32Array(harmonics + 1);
  const d = Math.min(1, Math.max(0, duty));
  for (let n = 1; n <= harmonics; n += 1) {
    real[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * d);
  }
  return { real, imag };
}
