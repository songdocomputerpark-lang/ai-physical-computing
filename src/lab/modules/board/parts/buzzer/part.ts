/**
 * 부품: 수동 버저(신호 1핀) — 바깥 출력 부품, 소리를 낸다(PLAN §6.2 "수동 버저 | 2-2-1, 4-2-2 (f067~f069, f008, f110~f115)", §8.3 P3-03,
 * 원고 118쪽 "부저 3핀 GND·VCC·SIG", 원고 156~159쪽, CODE_MAPPING §3.8.3, README 7.5·7.9-3).
 *
 * 소리 규칙은 buzzer-model.ts(PWM이면 그 주파수·duty의 펄스파, 핀이 계속 1이면 사이트 고정음 1000Hz, 0·duty 0·[정지]면 무음),
 * 소리 내기는 buzzer-voice.ts(Web Audio — 사용자가 [실행]을 누른 뒤에만, [소리 켜짐/꺼짐] 단추를 따름). 정의에 sound: true라 이 부품이
 * 배선에 있으면 보드 그림 위에 [소리 켜짐] 단추가 보인다(board-audio.ts).
 * 핀 번호는 예제마다 다르다(GPIO15 원고 2-2-1, GPIO2 4-2-2 — INVENTORY §4.1). 기본 핀은 두지 않는다. GPIO15·2는 스트래핑 핀이라 배선 목록에 "주의"가 보인다(원고 그대로).
 * 모습 값: data-visual-sounding(true|false), tone-hz(Hz, 무음 0), duty(0~100), source(pwm|digital|none), audible, summary.
 * 소리 상태(들을 수 없는 브라우저 테스트용): 부품 그림 안 <g data-buzzer-audio="playing|silent|muted|blocked|unavailable">.
 * 그림: 사이트가 그린 둥근 버저(브랜드 중립). 소리가 나면 소리 물결이 보이고 "262Hz" 글이 함께 바뀐다(색·모양만으로 알리지 않음). 물결은 움직이지 않는다.
 * 배선이 바뀌어 그림이 지워지면(예제 바꾸기) 1.5초 안에 소리를 멈춘다(render에는 정리 함수가 없어 그림이 페이지에 붙어 있는지 살핀다).
 */
import { getBoardAudio } from '../../board-audio.ts';
import { pinSignal } from '../../ext/pwm/pwm-signal.ts';
import type { PartDefinition } from '../../part-types.ts';
import { buzzerSummary, buzzerTone, loudnessForDuty, type BuzzerSource, type BuzzerTone } from './buzzer-model.ts';
import { createBuzzerVoice } from './buzzer-voice.ts';

const WIDTH = 96;
const HEIGHT = 70;
const WATCH_MS = 1500;

function toneFromVisual(visual: Readonly<Record<string, string | number | boolean>>): BuzzerTone {
  const sounding = visual.sounding === true;
  const source = (visual.source === 'pwm' || visual.source === 'digital' ? visual.source : 'none') as BuzzerSource;
  const duty = typeof visual.duty === 'number' ? visual.duty / 100 : 0;
  return {
    sounding,
    toneHz: typeof visual.toneHz === 'number' ? visual.toneHz : 0,
    duty: source === 'digital' ? 1 : duty,
    source,
    audible: visual.audible === true,
    loudness: source === 'digital' ? 1 : loudnessForDuty(duty),
  };
}

const definition: PartDefinition = {
  id: 'buzzer',
  title: '버저',
  description: '신호 핀에 PWM을 주면 그 주파수의 소리를 내는 수동 버저예요. 핀을 1로만 켜면 가상 보드는 1000Hz 고정음을 내요.',
  pins: [{ role: 'sig', label: '신호', direction: 'out' }],
  size: { width: WIDTH, height: HEIGHT },
  sound: true,
  visual({ snapshot, instance }) {
    const tone = buzzerTone(pinSignal(snapshot, instance.pins.sig));
    return {
      sounding: tone.sounding,
      toneHz: tone.toneHz,
      duty: Math.round(tone.duty * 100),
      source: tone.source,
      audible: tone.audible,
      summary: buzzerSummary(tone),
    };
  },
  render(target, { svg, instance }) {
    const board = svg('rect', { x: 0, y: 0, width: WIDTH, height: HEIGHT, rx: 5, fill: '#1e3a5f', stroke: '#0f2238', 'stroke-width': 1.2 });
    const pinMark = svg('rect', { x: 5, y: -3, width: 8, height: 6, rx: 1, fill: '#e8c46a', stroke: '#8a6d1f', 'stroke-width': 0.8 });
    const pinLabel = svg('text', { x: 17, y: 12, class: 'board-part__label board-part__label--small' }, [`IO${instance.pins.sig ?? ''}`]);
    const title = svg('text', { x: WIDTH - 5, y: 12, 'text-anchor': 'end', class: 'board-part__title' }, ['버저']);
    const body = svg('g', {}, [
      svg('circle', { cx: 30, cy: 36, r: 15, fill: '#111827', stroke: '#64748b', 'stroke-width': 1.5 }),
      svg('circle', { cx: 30, cy: 36, r: 9, fill: 'none', stroke: '#374151', 'stroke-width': 1.2 }),
      svg('circle', { cx: 30, cy: 36, r: 2.5, fill: '#6b7280' }),
      svg('text', { x: 17, y: 25, 'text-anchor': 'middle', class: 'board-part__label board-part__label--small' }, ['+']),
    ]);
    const waves = svg('g', { fill: 'none', stroke: '#fbbf24', 'stroke-width': 2, 'stroke-linecap': 'round', opacity: 0 }, [
      svg('path', { d: 'M 52 28 Q 57 36 52 44' }),
      svg('path', { d: 'M 60 24 Q 67 36 60 48' }),
      svg('path', { d: 'M 68 20 Q 77 36 68 52' }),
    ]);
    const state = svg('text', { x: WIDTH / 2, y: 64, 'text-anchor': 'middle', class: 'board-part__state' }, ['조용함']);
    const audioMark = svg('g', { 'data-buzzer-audio': 'silent' });
    target.append(board, pinMark, pinLabel, title, body, waves, state, audioMark);

    const audio = getBoardAudio();
    let current: Readonly<Record<string, string | number | boolean>> = {};
    let watch: ReturnType<typeof setInterval> | null = null;
    const renderText = () => {
      const tone = toneFromVisual(current);
      if (!tone.sounding) {
        state.textContent = '조용함';
      } else {
        const text = tone.source === 'digital' ? `${tone.toneHz}Hz 고정음` : `${tone.toneHz}Hz`;
        state.textContent = !tone.audible ? `${tone.toneHz}Hz(안 들림)` : audio.enabled ? text : `${text}(소리 꺼짐)`;
      }
    };
    const voice = createBuzzerVoice({
      audio,
      onState(next) {
        audioMark.setAttribute('data-buzzer-audio', next);
        renderText();
      },
    });
    const stopWatching = () => {
      if (watch !== null) {
        clearInterval(watch);
        watch = null;
      }
    };
    const startWatching = () => {
      if (watch !== null) {
        return;
      }
      watch = setInterval(() => {
        if (!target.isConnected) {
          stopWatching();
          voice.dispose();
        }
      }, WATCH_MS);
    };
    return (visual) => {
      current = visual;
      const tone = toneFromVisual(visual);
      waves.setAttribute('opacity', tone.sounding ? String(0.45 + 0.55 * tone.loudness) : '0');
      renderText();
      if (!target.isConnected) {
        stopWatching();
        voice.dispose();
        return;
      }
      startWatching();
      voice.set(tone);
    };
  },
};

export default definition;
