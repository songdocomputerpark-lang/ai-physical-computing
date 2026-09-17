/**
 * 부품: 4채널 아날로그 터치 센서(신호 1핀) — 바깥 입력 부품, 패드 4개가 핀 하나에 서로 다른 전압을 낸다(PLAN §6.1 "4채널 터치 값", §6.2
 * "4채널 아날로그 터치 | 2-1-3, 2-1-5, 2-2-2 (f058, f059, f066, f072) | ADC(Pin(32))… read() 0~4095 | 패드 4개 + 현재 값 막대 | 패드 1~4 누르기, 값 슬라이더",
 * §8.3 P3-03, 원고 136~139쪽, README 7.5·7.10 "조작 칸").
 *
 * 값: touch4-model.ts — 패드 1~4를 누르고 있는 동안 원고 139쪽 측정값(688·1535·2381·3263)이 ATTN_11DB·WIDTH_12BIT로 읽히는 전압, 누르지 않으면
 * "직접 값 정하기" 막대의 값(처음 0). 전압은 PartControlApi.setDrive('sig', analogDrive(mV))로 핀에 건다(파이썬 ADC가 입력 확인 지점에서 읽음).
 * 기본 핀 GPIO32(원고의 모든 4채널 예제 — ADC1 채널 4).
 * 조작(키보드·화면 낭독기·마우스·손가락 — README 7.9-4): 보드 그림 아래 "부품 조작" 칸의 [패드 1]~[패드 4] 단추(누르고 있는 동안 — 마우스·손가락, Space·Enter를
 * 누르고 있는 동안, 초점을 잃으면 뗌, 화면 낭독기의 "누르기"는 0.4초 누름)와 값 막대(input type=range, 화살표 키로 한 칸). 그림 속 패드를 마우스·손가락으로
 * 누르고 있어도 된다(같은 조작 — 키보드 사용자는 조작 칸을 쓴다).
 * 모습 값: data-visual-pad(0~4), value(읽힐 값 0~4095), pressed(패드를 누르고 있는지 — 화면 낭독기 이름 "누름·뗌"), summary.
 * 순수 함수 visual이 조작 상태를 읽을 수 있게, 배선 id마다 지금 입력(패드·막대 값)을 이 파일 안의 표에 둔다(조작 칸이 만들고 지운다).
 * 그림: 사이트가 그린 패드 4개 모듈(브랜드 중립). 누른 패드는 노랗게 바뀌고 "패드 2 · 값 약 1535" 글이 함께 바뀐다(색만으로 알리지 않음).
 */
import type { PartControlApi, PartDefinition } from '../../part-types.ts';
import { analogDrive } from '../../state.ts';
import { RAW12_MAX, TOUCH4_IDLE, TOUCH4_PADS, touch4Millivolts, touch4Raw, touch4Visual, type Touch4Input } from './touch4-model.ts';

const WIDTH = 126;
const HEIGHT = 68;
const PAD_SIZE = 22;
const PAD_Y = 20;
/** 화면 낭독기의 "누르기"(키 누름 없이 온 click)로 패드를 누르고 있는 시간 */
const TAP_MS = 400;

interface Touch4Session {
  input: Touch4Input;
  api: PartControlApi | null;
  /** 조작 칸의 모습을 입력에 맞게 고치는 함수 */
  refresh: (() => void) | null;
}

const sessions = new Map<string, Touch4Session>();

function sessionOf(id: string): Touch4Session {
  let session = sessions.get(id);
  if (!session) {
    session = { input: TOUCH4_IDLE, api: null, refresh: null };
    sessions.set(id, session);
  }
  return session;
}

/** 입력을 바꾸고 핀에 전압을 건다(조작 칸이 붙어 있을 때만 파이썬에 닿는다) */
function setInput(id: string, next: Touch4Input): void {
  const session = sessionOf(id);
  session.input = next;
  session.refresh?.();
  session.api?.setDrive('sig', analogDrive(touch4Millivolts(next)));
}

function padX(index: number): number {
  return 8 + index * 29;
}

const definition: PartDefinition = {
  id: 'touch-analog-4ch',
  title: '4채널 터치 센서',
  description: '패드 1~4를 누르면 신호 핀에 서로 다른 전압이 나와 ADC로 값(약 688·1535·2381·3263)을 읽는 아날로그 터치 센서예요. 누르지 않으면 0이에요.',
  pins: [{ role: 'sig', label: '신호(아날로그)', direction: 'in' }],
  defaultPins: { sig: 32 },
  size: { width: WIDTH, height: HEIGHT },
  visual({ instance }) {
    return touch4Visual(sessions.get(instance.id)?.input ?? TOUCH4_IDLE);
  },
  render(target, { svg, instance }) {
    const board = svg('rect', { x: 0, y: 0, width: WIDTH, height: HEIGHT, rx: 5, fill: '#1e3a5f', stroke: '#0f2238', 'stroke-width': 1.2 });
    const pinMark = svg('rect', { x: 5, y: -3, width: 8, height: 6, rx: 1, fill: '#e8c46a', stroke: '#8a6d1f', 'stroke-width': 0.8 });
    const pinLabel = svg('text', { x: 17, y: 12, class: 'board-part__label board-part__label--small' }, [`IO${instance.pins.sig ?? ''}`]);
    const title = svg('text', { x: WIDTH - 5, y: 12, 'text-anchor': 'end', class: 'board-part__title' }, ['4채널 터치']);
    target.append(board, pinMark, pinLabel, title);
    const pads = TOUCH4_PADS.map((pad, index) => {
      const x = padX(index);
      const rect = svg('rect', { x, y: PAD_Y, width: PAD_SIZE, height: PAD_SIZE, rx: 4, fill: '#dbe4ee', stroke: '#9fb3c8', 'stroke-width': 1.5 });
      const number = svg('text', { x: x + PAD_SIZE / 2, y: PAD_Y + 15, 'text-anchor': 'middle', 'font-size': 10, 'font-weight': 700, fill: '#1e3a5f' }, [String(pad.number)]);
      const group = svg('g', { 'data-touch4-svg-pad': String(pad.number), 'aria-hidden': 'true' }, [rect, number]);
      group.style.cursor = 'pointer';
      group.style.touchAction = 'none';
      // 그림 속 패드: 마우스·손가락으로 누르고 있는 동안(키보드는 조작 칸의 단추)
      group.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        try {
          group.setPointerCapture(event.pointerId);
        } catch {
          // 붙잡지 못해도 pointerup·pointercancel로 뗀다.
        }
        const session = sessionOf(instance.id);
        setInput(instance.id, { ...session.input, pad: pad.number });
      });
      const release = () => {
        const session = sessionOf(instance.id);
        if (session.input.pad === pad.number) {
          setInput(instance.id, { ...session.input, pad: 0 });
        }
      };
      group.addEventListener('pointerup', release);
      group.addEventListener('pointercancel', release);
      group.addEventListener('lostpointercapture', release);
      target.append(group);
      return { rect, number };
    });
    const state = svg('text', { x: WIDTH / 2, y: HEIGHT - 7, 'text-anchor': 'middle', class: 'board-part__state' }, ['누르지 않음 · 값 0']);
    target.append(state);
    return (visual) => {
      const active = typeof visual.pad === 'number' ? visual.pad : 0;
      pads.forEach(({ rect }, index) => {
        const pressed = active === index + 1;
        rect.setAttribute('fill', pressed ? '#fde68a' : '#dbe4ee');
        rect.setAttribute('stroke', pressed ? '#d97706' : '#9fb3c8');
        rect.setAttribute('stroke-width', pressed ? '2.5' : '1.5');
      });
      const value = typeof visual.value === 'number' ? visual.value : 0;
      state.textContent = active > 0 ? `패드 ${active} · 값 약 ${value}` : `누르지 않음 · 값 ${value}`;
    };
  },
  controls(host, api) {
    const id = api.instance.id;
    const session = sessionOf(id);
    session.api = api;
    const note = document.createElement('p');
    note.style.margin = '0';
    note.textContent = '패드 단추를 누르고 있는 동안 그 패드의 값이 신호 핀으로 나가요(교과서 139쪽 측정값). Tab으로 옮겨 Space나 Enter를 누르고 있어도 돼요.';
    const row = document.createElement('div');
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', '터치 패드');
    row.style.display = 'flex';
    row.style.flexWrap = 'wrap';
    row.style.gap = 'var(--space-2)';
    const buttons = TOUCH4_PADS.map((pad) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'lab-button lab-button--small';
      button.dataset.touch4Pad = String(pad.number);
      button.setAttribute('aria-pressed', 'false');
      const press = () => {
        const current = sessionOf(id).input;
        if (current.pad !== pad.number) {
          setInput(id, { ...current, pad: pad.number });
        }
      };
      const release = () => {
        const current = sessionOf(id).input;
        if (current.pad === pad.number) {
          setInput(id, { ...current, pad: 0 });
        }
      };
      button.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) {
          return;
        }
        event.preventDefault();
        button.focus({ preventScroll: true });
        try {
          button.setPointerCapture(event.pointerId);
        } catch {
          // 붙잡지 못해도 pointerup·pointercancel로 뗀다.
        }
        press();
      });
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('lostpointercapture', release);
      button.addEventListener('blur', release);
      button.addEventListener('keydown', (event) => {
        if (event.key !== ' ' && event.key !== 'Enter') {
          return;
        }
        event.preventDefault();
        if (!event.repeat) {
          press();
        }
      });
      button.addEventListener('keyup', (event) => {
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault();
          release();
        }
      });
      // 화면 낭독기의 "누르기"처럼 키·포인터 없이 온 click(detail 0): 잠깐 눌렀다 뗀다
      button.addEventListener('click', (event) => {
        if (event.detail !== 0) {
          return;
        }
        press();
        window.setTimeout(release, TAP_MS);
      });
      row.append(button);
      return { button, pad };
    });
    const label = document.createElement('label');
    label.style.display = 'grid';
    label.style.gap = 'var(--space-1)';
    const caption = document.createElement('span');
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = String(RAW12_MAX);
    slider.step = '1';
    slider.value = String(session.input.rest);
    slider.dataset.touch4Rest = '';
    slider.style.width = '100%';
    slider.style.accentColor = 'var(--color-accent)';
    label.append(caption, slider);
    slider.addEventListener('input', () => {
      const current = sessionOf(id).input;
      setInput(id, { ...current, rest: Number(slider.value) });
    });
    host.append(note, row, label);

    const refresh = () => {
      const current = sessionOf(id).input;
      for (const { button, pad } of buttons) {
        const pressed = current.pad === pad.number;
        button.setAttribute('aria-pressed', String(pressed));
        button.textContent = `패드 ${pad.number} · 약 ${pad.raw}`;
        // 눌림은 색만이 아니라 굵은 안쪽 테두리로도 보인다(WCAG 1.4.1)
        button.style.background = pressed ? 'var(--color-accent-soft)' : '';
        button.style.borderColor = pressed ? 'var(--color-accent)' : '';
        button.style.boxShadow = pressed ? 'inset 0 0 0 3px var(--color-accent)' : '';
      }
      const rest = Math.round(current.rest);
      if (slider.value !== String(rest)) {
        slider.value = String(rest);
      }
      caption.textContent = `패드를 누르지 않을 때의 값(직접 정하기): ${rest}`;
      slider.setAttribute('aria-valuetext', `${rest}(0부터 ${RAW12_MAX}까지)`);
      host.dataset.touch4Value = String(touch4Raw(current));
    };
    session.refresh = refresh;
    refresh();
    // 처음 전압(누르지 않음 = 0V 또는 막대 값)을 건다 — 배선을 그리는 중이라 한 박자 뒤에(보드 화면이 부품 목록을 다 만든 뒤)
    queueMicrotask(() => {
      if (sessions.get(id) === session && session.api === api) {
        setInput(id, session.input);
      }
    });
    return {
      destroy() {
        if (sessions.get(id) === session) {
          sessions.delete(id);
        }
        session.api = null;
        session.refresh = null;
      },
    };
  },
};

export default definition;
