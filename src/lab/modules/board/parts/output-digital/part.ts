/**
 * 부품: 디지털 출력 표시등(신호 1핀) — 범용 바깥 출력 부품(판 1.5.0, DECISIONS C157, .cache/v150/PLAN.md §3).
 * 신호 핀이 1(HIGH)이면 켜지는 LED·릴레이·전자석·펌프 …를 부품 하나로 흉내 낸다. 화면 이름은 배선의 label(없으면 종류에 따라 "빨강 LED"·"릴레이" 등).
 *
 * 쓰는 법(사이드카 parts): `{ part: output-digital, pin: 4, label: 빨강 LED, options: { color: red } }`, 릴레이는 `options: { kind: relay }`.
 * 설정(모두 선택, 틀리면 배선 목록에 주의 bad-option): kind = led(기본)·relay·load, color = red(기본)·yellow·green·blue·white(LED일 때).
 * 핀 번호는 정해 둔 기본이 없다(예제마다 다름). 34~39번은 입력 전용이라 출력 부품을 이으면 배선 검사가 오류를 낸다.
 *
 * 켜지는 조건: 신호 핀이 출력으로 1이면 켜짐(밝기 100), PWM이면 켜진 비율만큼(state.ts outputStrength). [정지]하면 꺼진 모습.
 * 종류별 그림: led = 둥근 불빛(켜지면 빛 번짐), relay = 접점 막대가 붙고 떨어지는 그림(딸깍 소리는 내지 않는다), load = 번개 표시 상자.
 * 모습 값: data-visual-lit(켜짐), brightness(0~100), kind, color, summary. 색만으로 알리지 않게 "켜짐/꺼짐" 글자와 색 이름·종류 이름 글자를 함께 둔다.
 * 긴 이름은 …로 줄이고 전체 이름은 <desc data-part-desc>와 aria-label에 있다. 움직이는 그림이 없어 움직임 줄이기 설정과 상관없이 같다.
 */
import { createPartDescriber, fitText } from '../../part-text.ts';
import type { PartDefinition } from '../../part-types.ts';
import { outputDigitalSettings, outputDigitalVisual, outputKindName, OUTPUT_COLOR_PALETTE, type OutputDigitalSettings } from './output-digital-model.ts';

const WIDTH = 90;
const HEIGHT = 68;
const DEFAULT_NAME = '디지털 출력 장치';

/** 이름이 따로 없으면 종류 이름("빨강 LED", "릴레이"…)을 화면 이름으로 쓴다 */
function displayName(label: string, settings: OutputDigitalSettings): string {
  return label === DEFAULT_NAME ? outputKindName(settings) : label;
}

const definition: PartDefinition = {
  id: 'output-digital',
  title: DEFAULT_NAME,
  description: '신호 핀이 1(HIGH)이면 켜지는 LED·릴레이 같은 디지털 출력 장치예요. 소리는 내지 않아요.',
  pins: [{ role: 'sig', label: '신호', direction: 'out' }],
  size: { width: WIDTH, height: HEIGHT },
  checkOptions(options) {
    return outputDigitalSettings(options).problems;
  },
  visual({ snapshot, instance }) {
    return outputDigitalVisual(snapshot, instance.pins.sig, outputDigitalSettings(instance.options).settings);
  },
  render(target, { svg, instance }) {
    const { settings } = outputDigitalSettings(instance.options);
    const name = displayName(instance.label, settings);
    const gpio = instance.pins.sig;
    const body = svg('rect', { x: 0, y: 0, width: WIDTH, height: HEIGHT, rx: 5, fill: '#1e3a5f', stroke: '#0f2238', 'stroke-width': 1.2 });
    const pinMark = svg('rect', { x: 5, y: -3, width: 8, height: 6, rx: 1, fill: '#e8c46a', stroke: '#8a6d1f', 'stroke-width': 0.8 });
    const pinLabel = svg('text', { x: 17, y: 12, class: 'board-part__label board-part__label--small' }, [`IO${gpio ?? ''}`]);
    const title = svg('text', { x: WIDTH / 2, y: 27, 'text-anchor': 'middle', class: 'board-part__title' }, [fitText(name, WIDTH - 10, 9)]);
    const state = svg('text', { x: 40, y: 49, class: 'board-part__state' }, ['꺼짐']);
    // 이름이 따로 없어 종류 이름이 이미 제목이면 아래 줄은 비워 같은 글을 두 번 보이지 않는다
    const kindText = svg('text', { x: WIDTH / 2, y: 63, 'text-anchor': 'middle', class: 'board-part__label board-part__label--small' }, [
      name === outputKindName(settings) ? '' : fitText(outputKindName(settings), WIDTH - 10, 8),
    ]);
    target.append(body, pinMark, pinLabel, title);

    let paint: (lit: boolean, strength: number) => void;
    if (settings.kind === 'relay') {
      const palette = OUTPUT_COLOR_PALETTE.blue;
      const cube = svg('rect', { x: 6, y: 34, width: 28, height: 20, rx: 3, fill: palette.off, stroke: '#cbd5e1', 'stroke-width': 1 });
      const leftPost = svg('circle', { cx: 12, cy: 46, r: 2.6, fill: '#e2e8f0' });
      const rightPost = svg('circle', { cx: 28, cy: 46, r: 2.6, fill: '#e2e8f0' });
      const arm = svg('line', { x1: 12, y1: 46, x2: 26, y2: 38, stroke: '#f8fafc', 'stroke-width': 2, 'stroke-linecap': 'round' });
      target.append(cube, leftPost, rightPost, arm);
      paint = (lit) => {
        cube.setAttribute('fill', lit ? palette.on : palette.off);
        arm.setAttribute('x2', '28');
        arm.setAttribute('y2', lit ? '46' : '38');
        rightPost.setAttribute('fill', lit ? '#fde68a' : '#e2e8f0');
      };
    } else if (settings.kind === 'load') {
      const box = svg('rect', { x: 8, y: 33, width: 26, height: 22, rx: 3, fill: '#334155', stroke: '#cbd5e1', 'stroke-width': 1 });
      const bolt = svg('path', { d: 'M 22 36 L 15 46 H 21 L 19 53 L 27 42 H 21 Z', fill: '#94a3b8' });
      target.append(box, bolt);
      paint = (lit) => {
        box.setAttribute('fill', lit ? '#b45309' : '#334155');
        bolt.setAttribute('fill', lit ? '#fde68a' : '#94a3b8');
      };
    } else {
      const palette = OUTPUT_COLOR_PALETTE[settings.color];
      const glow = svg('circle', { cx: 21, cy: 44, r: 15, fill: palette.glow, opacity: 0 });
      const lamp = svg('circle', { cx: 21, cy: 44, r: 10, fill: palette.off, stroke: '#cbd5e1', 'stroke-width': 1.5 });
      const shine = svg('circle', { cx: 18, cy: 41, r: 2.6, fill: '#ffffff', opacity: 0.55 });
      target.append(glow, lamp, shine);
      paint = (lit, strength) => {
        lamp.setAttribute('fill', lit ? palette.on : palette.off);
        lamp.setAttribute('fill-opacity', lit ? String(0.45 + 0.55 * strength) : '1');
        glow.setAttribute('opacity', lit ? String(0.2 + 0.5 * strength) : '0');
      };
    }
    target.append(state, kindText);

    const describe = createPartDescriber(target, svg);
    // 이름이 이미 종류 이름이면 괄호로 되풀이하지 않는다("빨강 LED: 켜짐", "전자석(출력 장치): 켜짐")
    const heading = name === outputKindName(settings) ? name : `${name}(${outputKindName(settings)})`;
    return (visual) => {
      const lit = visual.lit === true;
      const brightness = typeof visual.brightness === 'number' ? visual.brightness : 0;
      paint(lit, brightness / 100);
      state.textContent = lit ? (brightness < 100 ? `켜짐 ${brightness}%` : '켜짐') : '꺼짐';
      describe(`${heading}: ${typeof visual.summary === 'string' ? visual.summary : ''}. 신호 핀이 1이면 켜져요.`);
    };
  },
};

export default definition;
