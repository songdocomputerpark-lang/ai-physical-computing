/**
 * 가상 MP3 모듈의 소리(Web Audio) — 페이지에 하나뿐인 가상 보드 소리(board-audio.ts getBoardAudio)에 트랙 멜로디(melodies.ts)를 합성해 잇는다
 * (PLAN §6.5 PD-16 합성 음원, src/lab/README.md 7.9-3 "소리": [소리 꺼짐]이면 들리지 않고 [정지]·다시 실행 때 남지 않게).
 *
 * play(곡, 시작 지점 ms, 볼륨)은 앞 소리를 끊고 그 지점부터 음을 한꺼번에 예약한다(OscillatorNode 'triangle' + 음마다 짧게 커졌다 줄어드는 GainNode →
 * 곡 음량 GainNode → 주 음량). stop()은 예약한 음을 모두 멈추고 떼어 낸다. 소리를 못 내는 환경(Web Audio 없음·소리 꺼짐)이면 0을 돌려주고 조용히 넘어간다.
 * 브라우저 테스트는 소리를 들을 수 없으므로 부품이 예약한 음 수를 data 속성으로 보인다(part.ts).
 */
import { getBoardAudio, type BoardAudio } from '../../board-audio.ts';
import { notesFrom, trackOf, volumeGain } from './melodies.ts';

/** 음 하나가 커지는 시간·줄어드는 시간(초) — 딸깍 소리가 나지 않게 */
const ATTACK_S = 0.012;
const RELEASE_S = 0.06;

export interface Mp3Voice {
  /** 곡(1~)을 offsetMs 지점부터 볼륨(0~30)으로 튼다. 예약한 음 수(소리를 못 내면 0) */
  play(track: number, offsetMs: number, volume: number): number;
  stop(): void;
  setVolume(volume: number): void;
  /** 지금 소리를 내고 있는지(예약한 음이 남아 있는지) */
  readonly sounding: boolean;
}

export function createMp3Voice(audio: BoardAudio = getBoardAudio()): Mp3Voice {
  let trackGain: GainNode | null = null;
  let oscillators: OscillatorNode[] = [];
  let endsAt = 0;
  let context: AudioContext | null = null;

  const stop = () => {
    for (const oscillator of oscillators) {
      try {
        oscillator.stop();
      } catch {
        // 이미 멈춘 음
      }
      oscillator.disconnect();
    }
    oscillators = [];
    trackGain?.disconnect();
    trackGain = null;
    endsAt = 0;
  };

  return {
    play(track, offsetMs, volume) {
      stop();
      const melody = trackOf(track);
      const ctx = audio.context();
      const destination = audio.destination();
      if (!melody || !ctx || !destination) {
        return 0;
      }
      context = ctx;
      audio.resume();
      trackGain = ctx.createGain();
      trackGain.gain.value = volumeGain(volume);
      trackGain.connect(destination);
      const base = ctx.currentTime + 0.02;
      for (const note of notesFrom(melody, Math.max(0, offsetMs))) {
        const start = base + note.startMs / 1000;
        const end = start + note.ms / 1000;
        const oscillator = ctx.createOscillator();
        oscillator.type = 'triangle';
        oscillator.frequency.value = note.hz;
        const envelope = ctx.createGain();
        envelope.gain.setValueAtTime(0, start);
        envelope.gain.linearRampToValueAtTime(1, start + ATTACK_S);
        envelope.gain.setValueAtTime(1, Math.max(start + ATTACK_S, end - RELEASE_S));
        envelope.gain.linearRampToValueAtTime(0, end);
        oscillator.connect(envelope);
        envelope.connect(trackGain);
        oscillator.start(start);
        oscillator.stop(end + 0.01);
        oscillators.push(oscillator);
        endsAt = Math.max(endsAt, end);
      }
      return oscillators.length;
    },
    stop,
    setVolume(volume) {
      if (trackGain && context) {
        trackGain.gain.setValueAtTime(volumeGain(volume), context.currentTime);
      }
    },
    get sounding() {
      return oscillators.length > 0 && context !== null && context.currentTime < endsAt;
    },
  };
}
