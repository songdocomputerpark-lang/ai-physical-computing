// 부품 buzzer(수동 버저) 단위 테스트 — README 7.5 "부품 하나 = 테스트 파일 하나", PLAN §6.2 "수동 버저"·§8.3 P3-03, CODE_MAPPING §3.8.3.
// 소리 규칙(buzzer-model.ts)과 Web Audio 잇기(buzzer-voice.ts — 가짜 AudioContext로 노드 연결·음량·[소리 꺼짐]을 본다).
import { describe, expect, it } from 'vitest';
import { createBoardAudio } from '../../../src/lab/modules/board/board-audio.ts';
import { pinSignal } from '../../../src/lab/modules/board/ext/pwm/pwm-signal.ts';
import { snapshotAfterRun } from '../../../src/lab/modules/board/index.ts';
import { PART_DEFINITIONS, resolveWiring } from '../../../src/lab/modules/board/parts.ts';
import {
  BUZZER_DIGITAL_TONE_HZ,
  BUZZER_SILENT,
  buzzerSummary,
  buzzerTone,
  loudnessForDuty,
  pulseWaveCoefficients,
} from '../../../src/lab/modules/board/parts/buzzer/buzzer-model.ts';
import { BUZZER_BASE_GAIN, createBuzzerVoice } from '../../../src/lab/modules/board/parts/buzzer/buzzer-voice.ts';
import buzzer from '../../../src/lab/modules/board/parts/buzzer/part.ts';
import { instanceOf, snapshotWith } from './helpers/board-snapshot.ts';

const instance = instanceOf('buzzer', { sig: 15 }, { usesDefaultPins: false });

function toneOf(pins: Record<string, unknown>[]) {
  return buzzerTone(pinSignal(snapshotWith(pins), 15));
}

/** 가짜 Web Audio: 만든 노드와 마지막으로 정한 값을 기록한다 */
function fakeAudioContext() {
  const log: string[] = [];
  const param = (name: string) => ({
    value: 0,
    setTargetAtTime(value: number) {
      this.value = value;
      log.push(`${name}=${Math.round(value * 1000) / 1000}`);
    },
    cancelScheduledValues() {},
  });
  const oscillators: { type: string; frequency: ReturnType<typeof param>; started: boolean; stopped: boolean; wave: unknown }[] = [];
  const context = {
    state: 'running',
    currentTime: 1,
    sampleRate: 48_000,
    destination: { name: 'speakers' },
    addEventListener() {},
    resume: async () => undefined,
    suspend: async () => undefined,
    createGain() {
      return { gain: param('gain'), connect() {}, disconnect() {} };
    },
    createOscillator() {
      const node = {
        type: 'sine',
        frequency: param('hz'),
        started: false,
        stopped: false,
        wave: null as unknown,
        context,
        onended: null as unknown,
        connect() {},
        disconnect() {},
        start() {
          node.started = true;
        },
        stop() {
          node.stopped = true;
        },
        setPeriodicWave(wave: unknown) {
          node.wave = wave;
          node.type = 'custom';
        },
      };
      oscillators.push(node);
      return node;
    },
    createPeriodicWave(real: Float32Array) {
      return { real };
    },
  };
  return { context, oscillators, log };
}

describe('부품: 버저(buzzer)', () => {
  it('바깥 출력 부품·소리 부품: 신호 1핀, 기본 핀 없음(15·2 — 예제마다), sound: true라 [소리 켜짐] 단추가 보인다', () => {
    expect(buzzer.pins).toEqual([{ role: 'sig', label: '신호', direction: 'out' }]);
    expect(buzzer.defaultPins).toBeUndefined();
    expect(buzzer.sound).toBe(true);
  });

  it('소리 규칙: PWM이면 그 주파수·duty(크기는 sin(π·duty)), 핀이 계속 1이면 1000Hz 고정음, 0·duty 0·입력·[정지]면 무음', () => {
    expect(toneOf([{ id: 15, mode: 'pwm', out: 0, level: 1, driven: true, duty: 0.5, freq: 262 }])).toEqual({
      sounding: true,
      toneHz: 262,
      duty: 0.5,
      source: 'pwm',
      audible: true,
      loudness: 1,
    });
    expect(toneOf([{ id: 15, mode: 'out', out: 1, level: 1, driven: true }])).toEqual({
      sounding: true,
      toneHz: BUZZER_DIGITAL_TONE_HZ,
      duty: 1,
      source: 'digital',
      audible: true,
      loudness: 1,
    });
    expect(toneOf([{ id: 15, mode: 'pwm', out: 0, level: 1, driven: true, duty: 1, freq: 440 }]).source).toBe('digital');
    expect(toneOf([{ id: 15, mode: 'pwm', out: 0, level: 0, driven: true, duty: 0, freq: 440 }])).toBe(BUZZER_SILENT);
    expect(toneOf([{ id: 15, mode: 'out', out: 0, level: 0, driven: true }])).toBe(BUZZER_SILENT);
    expect(toneOf([{ id: 15, mode: 'in', out: 1, level: 0, driven: false }])).toBe(BUZZER_SILENT);
    expect(toneOf([{ id: 15, mode: 'pwm', out: 0, level: 1, driven: true, duty: 0.5, freq: 30_000 }])).toMatchObject({ sounding: true, audible: false });
    expect(loudnessForDuty(0.25)).toBeCloseTo(Math.SQRT1_2, 6);
    expect(loudnessForDuty(0)).toBe(0);
    const on = snapshotWith([{ id: 15, mode: 'pwm', out: 0, level: 1, driven: true, duty: 0.5, freq: 262 }]);
    expect(buzzerTone(pinSignal(snapshotAfterRun(on, { outcome: 'stopped' }), 15)).sounding).toBe(false);
  });

  it('모습 값과 글: tone-hz·duty(%)·source·summary', () => {
    const snapshot = snapshotWith([{ id: 15, mode: 'pwm', out: 0, level: 1, driven: true, duty: 0.5, freq: 523 }]);
    expect(buzzer.visual({ snapshot, instance, active: false, reducedMotion: true })).toEqual({
      sounding: true,
      toneHz: 523,
      duty: 50,
      source: 'pwm',
      audible: true,
      summary: '523Hz 소리(duty 50%)',
    });
    expect(buzzerSummary(BUZZER_SILENT)).toBe('조용함');
    expect(buzzerSummary(buzzerTone({ kind: 'high', duty: 1, freq: null, pulseMs: null }))).toBe('1000Hz 고정음(핀이 계속 1)');
  });

  it('펄스파 계수: 50 %면 짝수 배음이 없고(사각파), 기본음 계수는 2/π × sin(π·duty)', () => {
    const square = pulseWaveCoefficients(0.5, 8);
    expect(square.real[1]).toBeCloseTo(2 / Math.PI, 6);
    expect(Math.abs(square.real[2] ?? 1)).toBeLessThan(1e-6);
    expect(Math.abs(square.real[4] ?? 1)).toBeLessThan(1e-6);
    const narrow = pulseWaveCoefficients(0.1, 8);
    expect(narrow.real[1]).toBeCloseTo((2 / Math.PI) * Math.sin(Math.PI * 0.1), 6);
    expect([...narrow.imag].every((value) => value === 0)).toBe(true);
  });

  it('Web Audio: 소리가 나면 발진기 하나를 주 음량에 잇고, 주파수·duty가 바뀌면 같은 발진기를 고치며, [소리 꺼짐]·무음이면 멈춘다', () => {
    const fake = fakeAudioContext();
    let stored: string | null = null;
    const audio = createBoardAudio({
      createContext: () => fake.context as unknown as AudioContext,
      readStored: () => stored,
      writeStored: (value) => {
        stored = value;
      },
    });
    const states: string[] = [];
    const voice = createBuzzerVoice({ audio, onState: (state) => states.push(state) });
    expect(voice.state).toBe('silent');
    voice.set(buzzerTone({ kind: 'pwm', duty: 0.5, freq: 262, pulseMs: 1 }));
    expect(voice.state).toBe('playing');
    expect(fake.oscillators).toHaveLength(1);
    expect(fake.oscillators[0]).toMatchObject({ type: 'square', started: true });
    expect(fake.log).toContain('hz=262');
    expect(fake.log).toContain(`gain=${BUZZER_BASE_GAIN}`);
    // duty 25 %: 같은 발진기에 펄스파, 크기 sin(π/4)
    voice.set(buzzerTone({ kind: 'pwm', duty: 0.25, freq: 294, pulseMs: 1 }));
    expect(fake.oscillators).toHaveLength(1);
    expect(fake.oscillators[0]?.type).toBe('custom');
    expect(fake.log).toContain('hz=294');
    expect(fake.log.at(-1)).toBe(`gain=${Math.round(BUZZER_BASE_GAIN * Math.SQRT1_2 * 1000) / 1000}`);
    // [소리 꺼짐] → 멈춤(muted), 다시 켜면 새 발진기로 이어 낸다
    audio.setEnabled(false);
    expect(voice.state).toBe('muted');
    expect(fake.oscillators[0]?.stopped).toBe(true);
    audio.setEnabled(true);
    expect(voice.state).toBe('playing');
    expect(fake.oscillators).toHaveLength(2);
    // 무음 → 멈춤, 정리하면 조용함
    voice.set(BUZZER_SILENT);
    expect(voice.state).toBe('silent');
    expect(fake.oscillators[1]?.stopped).toBe(true);
    voice.dispose();
    expect(states).toEqual(['playing', 'muted', 'playing', 'silent']);
  });

  it('Web Audio를 쓸 수 없는 브라우저면 unavailable(오류 없이)', () => {
    const audio = createBoardAudio({ createContext: () => null, readStored: () => null, writeStored: () => undefined });
    const voice = createBuzzerVoice({ audio });
    voice.set(buzzerTone({ kind: 'high', duty: 1, freq: null, pulseMs: null }));
    expect(voice.state).toBe('unavailable');
  });

  it('예제 배선: 원고 2-2-1의 GPIO15는 스트래핑 핀이라 "주의"가 보인다(원고 그대로), 4-2-2의 GPIO2도', () => {
    for (const gpio of [15, 2]) {
      const wiring = resolveWiring([{ part: 'buzzer', pin: gpio }], PART_DEFINITIONS);
      expect(wiring.issues.filter((issue) => issue.code === 'strapping').map((issue) => issue.gpio)).toEqual([gpio]);
      expect(wiring.issues.filter((issue) => issue.level === 'error')).toEqual([]);
    }
  });
});
