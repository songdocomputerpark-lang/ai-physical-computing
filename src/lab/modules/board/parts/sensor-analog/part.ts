/**
 * 부품: 아날로그 센서(신호 1핀, ADC) — 범용 바깥 입력 부품(판 1.5.0, DECISIONS C157, .cache/v150/PLAN.md §3).
 * 조도·가변저항·토양 수분·소리·온도(NTC)·압력·탁도·가스 …처럼 ADC 한 핀으로 값을 읽는 센서를 부품 하나로 흉내 낸다. 화면 이름은 배선의 label(없으면 "아날로그 센서").
 *
 * 쓰는 법(사이드카 parts):
 *   `{ part: sensor-analog, pin: 32, label: 조도 센서, options: { unit: '', label_low: 어두움, label_high: 밝음 } }`
 * 설정(모두 선택, 틀리면 배선 목록에 주의 bad-option): unit(값 뒤에 보일 단위 글자, 6글자까지 — 보이는 글자일 뿐 코드가 읽는 값은 그대로),
 * min·max(슬라이더 범위, 0~4095 안, 기본 0~4095), value(처음 값, 기본 2048), label_low·label_high(슬라이더 양 끝 이름, 8글자까지).
 *
 * 값: 슬라이더 값 = 코드가 읽는 값. ADC(Pin(n)).atten(ADC.ATTN_11DB)·12비트(기본)로 read()하면 그 값이 그대로 읽힌다(파이썬 ADC 흉내 ext/adc/apc_board_adc.py가
 * 입력 확인 지점에서 부품이 건 전압을 읽는다). 전압은 sensor-analog-model.ts exactAnalogDrive — 4채널 터치와 달리 소수 밀리볼트라 한 칸도 어긋나지 않는다.
 * 조작(README 7.9-4): 보드 그림 아래 "<이름> 조작" 칸의 슬라이더(0~100 %, 화살표 키 1 %, Home·End는 양 끝, 값 글자와 aria-valuetext) + 숫자 칸(값 직접 쓰기 —
 * 끌기 없이도 정확한 값을 넣는 길, WCAG 2.5.7). 그림은 값 막대 + 값 글자 + 양 끝 이름이라 색만으로 알리지 않는다.
 * 모습 값: data-visual-value(읽히는 값 0~4095), percent(범위 안 위치 0~100), summary. 긴 이름은 …로 줄이고 전체 이름은 <desc data-part-desc>와 aria-label에 있다.
 */
import { createLabeledInput, createNote, createRow } from '../../part-controls.ts';
import { createPartDescriber, fitText } from '../../part-text.ts';
import type { PartControlApi, PartDefinition, PartInstance } from '../../part-types.ts';
import {
  SLIDER_STEPS,
  analogSensorSettings,
  analogSensorVisual,
  clampRaw,
  exactAnalogDrive,
  positionOf,
  sideText,
  valueAt,
  valueText,
} from './sensor-analog-model.ts';

const WIDTH = 126;
const HEIGHT = 68;
const BAR_X = 10;
const BAR_WIDTH = WIDTH - 20;
const DEFAULT_NAME = '아날로그 센서';

interface Session {
  value: number;
  api: PartControlApi | null;
  refresh: (() => void) | null;
}

/** 배선 id마다 지금 슬라이더 값. visual이 순수 함수라 이 파일 안의 표에 둔다(조작 칸이 만들고 지운다 — 4채널 터치와 같은 방식) */
const sessions = new Map<string, Session>();

function valueOf(instance: PartInstance): number {
  return sessions.get(instance.id)?.value ?? analogSensorSettings(instance.options).settings.initial;
}

function pushDrive(session: Session): void {
  session.api?.setDrive('sig', exactAnalogDrive(session.value));
}

function setValue(instance: PartInstance, value: number): void {
  const { settings } = analogSensorSettings(instance.options);
  let session = sessions.get(instance.id);
  if (!session) {
    session = { value: settings.initial, api: null, refresh: null };
    sessions.set(instance.id, session);
  }
  session.value = clampRaw(value, settings.min, settings.max);
  session.refresh?.();
  pushDrive(session);
}

const definition: PartDefinition = {
  id: 'sensor-analog',
  title: DEFAULT_NAME,
  description: '신호 핀 하나로 값(0~4095)을 읽는 아날로그 센서예요. 조작 칸의 슬라이더로 센서가 내는 값을 정해요.',
  pins: [{ role: 'sig', label: '신호(아날로그)', direction: 'in' }],
  size: { width: WIDTH, height: HEIGHT },
  checkOptions(options) {
    return analogSensorSettings(options).problems;
  },
  visual({ instance }) {
    const { settings } = analogSensorSettings(instance.options);
    return analogSensorVisual(valueOf(instance), settings);
  },
  render(target, { svg, instance }) {
    const name = instance.label;
    const gpio = instance.pins.sig;
    const { settings } = analogSensorSettings(instance.options);
    const body = svg('rect', { x: 0, y: 0, width: WIDTH, height: HEIGHT, rx: 5, fill: '#1e3a5f', stroke: '#0f2238', 'stroke-width': 1.2 });
    const pinMark = svg('rect', { x: 5, y: -3, width: 8, height: 6, rx: 1, fill: '#e8c46a', stroke: '#8a6d1f', 'stroke-width': 0.8 });
    const pinLabel = svg('text', { x: 17, y: 12, class: 'board-part__label board-part__label--small' }, [`IO${gpio ?? ''}`]);
    const title = svg('text', { x: WIDTH / 2, y: 26, 'text-anchor': 'middle', class: 'board-part__title' }, [fitText(name, WIDTH - 10, 9)]);
    const track = svg('rect', { x: BAR_X, y: 33, width: BAR_WIDTH, height: 8, rx: 4, fill: '#0f2238', stroke: '#9fb3c8', 'stroke-width': 1 });
    const fill = svg('rect', { x: BAR_X, y: 33, width: 0, height: 8, rx: 4, fill: '#fbbf24' });
    const marker = svg('rect', { x: BAR_X - 1.5, y: 30, width: 3, height: 14, rx: 1.5, fill: '#ffffff', stroke: '#0f2238', 'stroke-width': 0.8 });
    const lowText = settings.labelLow === '' ? String(settings.min) : fitText(settings.labelLow, BAR_WIDTH / 2 - 4, 8);
    const highText = settings.labelHigh === '' ? String(settings.max) : fitText(settings.labelHigh, BAR_WIDTH / 2 - 4, 8);
    const low = svg('text', { x: BAR_X, y: 53, class: 'board-part__label board-part__label--small' }, [lowText]);
    const high = svg('text', { x: BAR_X + BAR_WIDTH, y: 53, 'text-anchor': 'end', class: 'board-part__label board-part__label--small' }, [highText]);
    const state = svg('text', { x: WIDTH / 2, y: 64, 'text-anchor': 'middle', class: 'board-part__state' }, ['값 0']);
    target.append(body, pinMark, pinLabel, title, track, fill, marker, low, high, state);

    const describe = createPartDescriber(target, svg);
    return (visual) => {
      const value = typeof visual.value === 'number' ? visual.value : 0;
      const percent = typeof visual.percent === 'number' ? visual.percent : 0;
      const width = (BAR_WIDTH * percent) / SLIDER_STEPS;
      fill.setAttribute('width', String(width));
      marker.setAttribute('x', String(BAR_X + width - 1.5));
      state.textContent = fitText(`값 ${valueText(value, settings)}`, WIDTH - 10, 9.5);
      describe(`${name}: ${typeof visual.summary === 'string' ? visual.summary : ''}. 값은 ${settings.min}부터 ${settings.max}까지 바꿀 수 있고, 코드에서 ADC로 읽어요.`);
    };
  },
  controls(host, api) {
    const instance = api.instance;
    const id = instance.id;
    const { settings } = analogSensorSettings(instance.options);
    let session = sessions.get(id);
    if (!session) {
      session = { value: settings.initial, api: null, refresh: null };
      sessions.set(id, session);
    }
    const mine = session;
    mine.api = api;

    host.append(
      createNote(
        `${instance.label}이(가) 내는 값을 정해요. 코드의 ADC 읽기(read)가 이 값을 그대로 읽어요(atten을 ADC.ATTN_11DB로, 해상도는 12비트일 때). 슬라이더는 화살표 키로 한 칸씩, Home·End로 양 끝으로 옮겨요.`,
      ),
    );
    // 슬라이더 이름은 늘 "센서 값", 바뀌는 값은 옆 글자와 aria-valuetext로(값이 이름에 섞이지 않게). 양 끝 이름은 눈으로 보는 표시라 낭독기에는 valuetext로 알린다
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = String(SLIDER_STEPS);
    slider.step = '1';
    slider.dataset.sensorAnalogSlider = '';
    slider.style.flex = '1 1 8rem';
    slider.style.minWidth = '0';
    slider.style.accentColor = 'var(--color-accent)';
    const lowName = document.createElement('span');
    lowName.setAttribute('aria-hidden', 'true');
    lowName.textContent = settings.labelLow === '' ? String(settings.min) : settings.labelLow;
    const highName = document.createElement('span');
    highName.setAttribute('aria-hidden', 'true');
    highName.textContent = settings.labelHigh === '' ? String(settings.max) : settings.labelHigh;
    const sliderRow = createRow();
    sliderRow.style.flexWrap = 'nowrap';
    sliderRow.append(lowName, slider, highName);
    const labeled = createLabeledInput({ idPrefix: 'sensor-analog', title: '센서 값', input: slider, control: sliderRow });
    labeled.value.dataset.sensorAnalogValueText = '';
    const sliderLabel = labeled.wrap;

    const numberLabel = document.createElement('label');
    numberLabel.style.display = 'inline-flex';
    numberLabel.style.alignItems = 'center';
    numberLabel.style.gap = 'var(--space-2)';
    const numberCaption = document.createElement('span');
    numberCaption.textContent = `값 직접 쓰기(${settings.min}~${settings.max})`;
    const number = document.createElement('input');
    number.type = 'number';
    number.inputMode = 'numeric';
    number.min = String(settings.min);
    number.max = String(settings.max);
    number.step = '1';
    number.dataset.sensorAnalogNumber = '';
    number.style.width = '6.5rem';
    number.style.minHeight = 'var(--target-min)';
    numberLabel.append(numberCaption, number);
    const status = createNote('');
    status.dataset.sensorAnalogStatus = '';
    host.append(sliderLabel, numberLabel, status);

    slider.addEventListener('input', () => setValue(instance, valueAt(Number(slider.value), settings)));
    number.addEventListener('input', () => {
      // 쓰는 도중(예: 2000~3000 범위에서 "3"까지만 쓴 때)에는 범위 밖이어도 지우지 않고, 범위 안의 정수가 되면 그때 반영한다
      const typed = Number(number.value);
      if (number.value.trim() !== '' && Number.isInteger(typed) && typed >= settings.min && typed <= settings.max) {
        setValue(instance, typed);
      }
    });
    number.addEventListener('change', () => {
      const typed = Number(number.value);
      setValue(instance, number.value.trim() === '' || !Number.isFinite(typed) ? mine.value : typed);
      number.value = String(mine.value);
    });

    const refresh = () => {
      const visual = analogSensorVisual(mine.value, settings);
      const position = positionOf(mine.value, settings);
      if (slider.value !== String(position)) {
        slider.value = String(position);
      }
      if (document.activeElement !== number && number.value !== String(mine.value)) {
        number.value = String(mine.value);
      }
      const side = sideText(position, settings);
      labeled.value.textContent = `${valueText(mine.value, settings)}${side === '' ? '' : ` — ${side}`}`;
      slider.setAttribute('aria-valuetext', `값 ${valueText(mine.value, settings)}, 범위의 ${position}%${side === '' ? '' : `, ${side}`}`);
      status.textContent = `코드가 읽는 값: ${visual.value}`;
      host.dataset.sensorAnalogValue = String(visual.value);
    };
    mine.refresh = refresh;
    refresh();
    // 처음 전압을 건다 — 배선을 그리는 중이라 한 박자 뒤에(보드 화면이 부품 목록을 다 만든 뒤)
    queueMicrotask(() => {
      if (sessions.get(id) === mine && mine.api === api) {
        pushDrive(mine);
      }
    });
    return {
      destroy() {
        if (sessions.get(id) === mine) {
          sessions.delete(id);
        }
        mine.api = null;
        mine.refresh = null;
      },
    };
  },
};

export default definition;
