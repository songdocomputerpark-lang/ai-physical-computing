/**
 * 부품: 디지털 센서(신호 1핀) — 범용 바깥 입력 부품(판 1.5.0, DECISIONS C157, .cache/v150/PLAN.md §3).
 * 신호가 0/1 둘 중 하나인 모듈(버튼·기울기·움직임·불꽃·충돌·가림·수위 …)을 부품 하나로 흉내 낸다. 화면 이름은 배선의 label(없으면 "디지털 센서").
 *
 * 쓰는 법(사이드카 parts): `{ part: sensor-digital, pin: 23, label: 움직임 센서 }`, 눌렀을 때 0이 되는 모듈은 `options: { active_low: true }`.
 * 설정: active_low(참거짓, 기본 false) — 감지 중에 신호가 0이고 아닐 때 1. 그 밖의 설정 이름은 배선 목록에 주의(bad-option)로 알린다.
 *
 * 핀을 누르는 값: 감지 중이면 1(active_low면 0), 아니면 그 반대 — 센서 모듈의 출력이 핀을 세게 누른다(풀업·풀다운이 아님, 터치 센서와 같음).
 * 조작(README 7.9-4): 보드 그림 아래 "<이름> 조작" 칸의 [누르고 있는 동안 감지] 단추(마우스·손가락·Space·Enter를 누르고 있는 동안, 초점을 잃으면 뗌, 화면 낭독기의
 * "누르기"는 0.4초)와 [켜 두기] 체크(움직임·기울기·불꽃처럼 계속 1인 센서). 그림의 모듈을 마우스·손가락으로 누르고 있어도 된다(같은 조작 — 키보드는 조작 칸).
 * interaction을 쓰지 않는 까닭: interaction.drive는 설정(active_low)을 알 수 없고, 켜 두기 상태를 aria-pressed에 담지 못한다. 그래서 4채널 터치처럼
 * 조작 칸(controls)이 핀을 누르고, 그림은 role="img"와 상태 글(summary)을 가진다.
 * 모습 값: data-visual-pressed(감지 중), latched(켜 둠), level(신호 0|1), summary.
 * 그림: 사이트가 그린 모듈(브랜드 중립) — 이름 글자 + 상태 점 + "감지됨/없음" 글자 + 신호 값 글자(색만으로 알리지 않는다). 긴 이름은 …로 줄이고
 * 전체 이름은 <desc data-part-desc>와 aria-label에 있다.
 */
import { createHoldButton, createNote, createRow, type HoldButton } from '../../part-controls.ts';
import type { PartControlApi, PartDefinition, PartInstance } from '../../part-types.ts';
import { createPartDescriber, fitText } from '../../part-text.ts';
import {
  SENSOR_DIGITAL_IDLE,
  digitalSensorLevelText,
  digitalSensorSettings,
  digitalSensorStateText,
  digitalSensorVisual,
  isDetecting,
  sensorLevel,
  type DigitalSensorInput,
} from './sensor-digital-model.ts';

const WIDTH = 108;
const HEIGHT = 68;
const DEFAULT_NAME = '디지털 센서';

interface Session {
  input: DigitalSensorInput;
  api: PartControlApi | null;
  /** 조작 칸의 모습을 입력에 맞게 고치는 함수 */
  refresh: (() => void) | null;
}

/** 배선 id마다 지금 조작 상태. visual이 순수 함수라 이 파일 안의 표에 둔다(조작 칸이 만들고 지운다 — 4채널 터치와 같은 방식) */
const sessions = new Map<string, Session>();

function sessionOf(id: string): Session {
  let session = sessions.get(id);
  if (!session) {
    session = { input: SENSOR_DIGITAL_IDLE, api: null, refresh: null };
    sessions.set(id, session);
  }
  return session;
}

/** 감지 중 여부에 따라 신호 핀을 누른다(조작 칸이 붙어 있을 때만 파이썬에 닿는다) */
function pushDrive(instance: PartInstance, session: Session): void {
  const { settings } = digitalSensorSettings(instance.options);
  session.api?.setDrive('sig', sensorLevel(isDetecting(session.input), settings.activeLow));
}

function setInput(instance: PartInstance, next: DigitalSensorInput): void {
  const session = sessionOf(instance.id);
  session.input = next;
  session.refresh?.();
  pushDrive(instance, session);
}

const definition: PartDefinition = {
  id: 'sensor-digital',
  title: DEFAULT_NAME,
  description: '신호가 0 또는 1인 디지털 센서 모듈이에요. 감지하면 신호 핀이 1(설정에 따라 0)이 돼요. 조작 칸에서 누르고 있거나 켜 둘 수 있어요.',
  pins: [{ role: 'sig', label: '신호', direction: 'in' }],
  size: { width: WIDTH, height: HEIGHT },
  checkOptions(options) {
    return digitalSensorSettings(options).problems;
  },
  visual({ instance }) {
    return digitalSensorVisual(sessions.get(instance.id)?.input ?? SENSOR_DIGITAL_IDLE, digitalSensorSettings(instance.options).settings);
  },
  render(target, { svg, instance }) {
    const name = instance.label;
    const gpio = instance.pins.sig;
    const body = svg('rect', { x: 0, y: 0, width: WIDTH, height: HEIGHT, rx: 5, fill: '#1e3a5f', stroke: '#0f2238', 'stroke-width': 1.2 });
    const pinMark = svg('rect', { x: 5, y: -3, width: 8, height: 6, rx: 1, fill: '#e8c46a', stroke: '#8a6d1f', 'stroke-width': 0.8 });
    const pinLabel = svg('text', { x: 17, y: 12, class: 'board-part__label board-part__label--small' }, [`IO${gpio ?? ''}`]);
    const title = svg('text', { x: WIDTH / 2, y: 27, 'text-anchor': 'middle', class: 'board-part__title' }, [fitText(name, WIDTH - 10, 9)]);
    const ring = svg('circle', { cx: 22, cy: 45, r: 12, fill: 'none', stroke: '#fbbf24', 'stroke-width': 2.5, opacity: 0 });
    const lamp = svg('circle', { cx: 22, cy: 45, r: 9, fill: '#334155', stroke: '#94a3b8', 'stroke-width': 1.5 });
    const lampCore = svg('circle', { cx: 22, cy: 45, r: 3.5, fill: '#94a3b8' });
    const state = svg('text', { x: 40, y: 49, class: 'board-part__state' }, [digitalSensorStateText(false)]);
    const level = svg('text', { x: WIDTH / 2, y: 63, 'text-anchor': 'middle', class: 'board-part__label board-part__label--small' }, [
      digitalSensorLevelText(sensorLevel(false, digitalSensorSettings(instance.options).settings.activeLow)),
    ]);
    // 마우스·손가락으로 모듈을 누르고 있기(키보드는 조작 칸의 단추) — 그림 전체가 누르는 자리
    const hit = svg('rect', { x: 0, y: 0, width: WIDTH, height: HEIGHT, rx: 5, fill: 'transparent', 'data-sensor-digital-hit': '', 'aria-hidden': 'true' });
    hit.style.cursor = 'pointer';
    hit.style.touchAction = 'none';
    hit.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      try {
        hit.setPointerCapture(event.pointerId);
      } catch {
        // 붙잡지 못해도 pointerup·pointercancel로 뗀다.
      }
      setInput(instance, { ...sessionOf(instance.id).input, held: true });
    });
    const release = () => {
      const current = sessionOf(instance.id).input;
      if (current.held) {
        setInput(instance, { ...current, held: false });
      }
    };
    hit.addEventListener('pointerup', release);
    hit.addEventListener('pointercancel', release);
    hit.addEventListener('lostpointercapture', release);
    target.append(body, pinMark, pinLabel, title, ring, lamp, lampCore, state, level, hit);

    const describe = createPartDescriber(target, svg);
    return (visual) => {
      const detecting = visual.pressed === true;
      lamp.setAttribute('fill', detecting ? '#fbbf24' : '#334155');
      lamp.setAttribute('stroke', detecting ? '#d97706' : '#94a3b8');
      lampCore.setAttribute('fill', detecting ? '#78350f' : '#94a3b8');
      ring.setAttribute('opacity', detecting ? '1' : '0');
      state.textContent = digitalSensorStateText(detecting);
      const signal = visual.level === 1 ? 1 : 0;
      level.textContent = digitalSensorLevelText(signal);
      const activeLow = digitalSensorSettings(instance.options).settings.activeLow;
      describe(`${name}: ${typeof visual.summary === 'string' ? visual.summary : ''}. ${activeLow ? '감지하면 신호가 0이 되는 모듈이에요.' : '감지하면 신호가 1이 되는 모듈이에요.'}`);
    };
  },
  controls(host, api) {
    const instance = api.instance;
    const id = instance.id;
    const { settings } = digitalSensorSettings(instance.options);
    const activeLevel = settings.activeLow ? 0 : 1;
    const session = sessionOf(id);
    session.api = api;

    const note = createNote(
      `${instance.label}이(가) 무언가를 감지하면 신호 핀이 ${activeLevel}이 돼요. 단추를 누르고 있는 동안 감지하고, [켜 두기]를 고르면 누르지 않아도 계속 감지한 상태로 둬요. Space나 Enter를 누르고 있어도 돼요.`,
    );
    const row = createRow();
    const hold: HoldButton = createHoldButton({
      text: `누르고 있는 동안 감지 (신호 ${activeLevel})`,
      onChange: (pressed) => setInput(instance, { ...sessionOf(id).input, held: pressed }),
    });
    hold.element.dataset.sensorDigitalHold = '';
    const latchLabel = document.createElement('label');
    latchLabel.style.display = 'inline-flex';
    latchLabel.style.alignItems = 'center';
    latchLabel.style.gap = 'var(--space-1)';
    const latch = document.createElement('input');
    latch.type = 'checkbox';
    latch.dataset.sensorDigitalLatch = '';
    latch.style.width = '1.25rem';
    latch.style.height = '1.25rem';
    latch.style.accentColor = 'var(--color-accent)';
    const latchText = document.createElement('span');
    latchText.textContent = '켜 두기 (누르지 않아도 계속 감지)';
    latchLabel.append(latch, latchText);
    latch.addEventListener('change', () => setInput(instance, { ...sessionOf(id).input, latched: latch.checked }));
    row.append(hold.element, latchLabel);
    const status = createNote('');
    status.dataset.sensorDigitalStatus = '';
    host.append(note, row, status);

    const refresh = () => {
      const current = sessionOf(id).input;
      const visual = digitalSensorVisual(current, settings);
      hold.setPressed(current.held);
      if (latch.checked !== current.latched) {
        latch.checked = current.latched;
      }
      status.textContent = `지금: ${visual.summary}`;
      host.dataset.sensorDigitalLevel = String(visual.level);
    };
    session.refresh = refresh;
    refresh();
    // 처음 신호(감지 없음 = 0, active_low면 1)를 건다 — 배선을 그리는 중이라 한 박자 뒤에(보드 화면이 부품 목록을 다 만든 뒤)
    queueMicrotask(() => {
      if (sessions.get(id) === session && session.api === api) {
        pushDrive(instance, session);
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
