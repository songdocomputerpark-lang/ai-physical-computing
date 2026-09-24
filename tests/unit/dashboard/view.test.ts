// @vitest-environment jsdom
// 위젯 판 화면(P4-07) — 구역 D 2차. 진짜 DOM(jsdom)에서 키보드 조작·값 받기·설정 저장을 확인한다.
// 끌어 놓기와 그림(캔버스)은 진짜 브라우저 몫이라 tests/e2e/dashboard.spec.ts에서 본다.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeStorage } from '../bridge/helpers/fake.ts';
import { DashboardView } from '../../../src/lab/dashboard/grid-view.ts';
import { defaultBoard } from '../../../src/lab/dashboard/defaults.ts';
import { readBoard } from '../../../src/lab/dashboard/store.ts';
import type { SourceMessage, WidgetSpec } from '../../../src/lab/dashboard/types.ts';

function setup(storage = new FakeStorage()) {
  document.body.innerHTML = '<div data-dash-grid></div><p data-dash-announce></p>';
  const grid = document.querySelector<HTMLElement>('[data-dash-grid]') as HTMLElement;
  const announce = document.querySelector<HTMLElement>('[data-dash-announce]');
  const toggles: Array<{ spec: WidgetSpec; on: boolean }> = [];
  const view = new DashboardView({
    grid,
    announce,
    helpId: 'dash-keyboard-help',
    storage,
    onToggle: (spec, on) => toggles.push({ spec, on }),
  });
  return { view, grid, announce, storage, toggles };
}

function widgetEl(grid: HTMLElement, id: string): HTMLElement {
  const element = grid.querySelector<HTMLElement>(`[data-dash-widget="${id}"]`);
  expect(element, `${id} 위젯이 그려져야 해요`).not.toBeNull();
  return element as HTMLElement;
}

function press(element: HTMLElement, key: string, shiftKey = false): void {
  element.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }));
}

function message(topic: string, text: string): SourceMessage {
  return { topic, text, at: Date.now() };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('처음 판', () => {
  it('위젯 네 가지를 읽는 순서대로 그린다', () => {
    const { grid } = setup();
    const ids = [...grid.querySelectorAll<HTMLElement>('[data-dash-widget]')].map((element) => element.dataset.dashWidget);
    expect(ids).toEqual(['chart-1', 'gauge-1', 'switch-1', 'log-1']);
    expect(grid.dataset.dashCount).toBe('4');
    const chart = widgetEl(grid, 'chart-1');
    expect(chart.dataset.dashKind).toBe('chart');
    expect(chart.style.gridColumn).toBe('1 / span 6');
    expect(chart.style.gridRow).toBe('1 / span 4');
  });

  it('위젯마다 손잡이·설정·지우기 단추가 있다(키보드로 갈 수 있게)', () => {
    const { grid } = setup();
    const chart = widgetEl(grid, 'chart-1');
    expect(chart.querySelector('[data-dash-grab]')?.tagName).toBe('BUTTON');
    expect(chart.querySelector('[data-dash-resize]')?.tagName).toBe('BUTTON');
    expect(chart.querySelector('[data-dash-grab]')?.getAttribute('aria-describedby')).toBe('dash-keyboard-help');
  });
});

describe('키보드로 옮기기·크기 바꾸기', () => {
  it('방향키로 옮기면 자리와 저장이 함께 바뀐다', () => {
    const { grid, storage, announce } = setup();
    const grab = widgetEl(grid, 'switch-1').querySelector<HTMLElement>('[data-dash-grab]') as HTMLElement;
    press(grab, 'ArrowDown');
    expect(widgetEl(grid, 'switch-1').dataset.dashY).toBe('1');
    expect(announce?.textContent).toContain('옮겼어요');
    const saved = readBoard(storage).widgets.find((widget) => widget.id === 'switch-1');
    expect(saved?.y).toBe(1);
  });

  it('Shift+방향키는 크기를 바꾼다', () => {
    const { grid, announce } = setup();
    const grab = widgetEl(grid, 'gauge-1').querySelector<HTMLElement>('[data-dash-grab]') as HTMLElement;
    press(grab, 'ArrowLeft', true);
    expect(widgetEl(grid, 'gauge-1').dataset.dashW).toBe('2');
    expect(announce?.textContent).toContain('크기를');
  });

  it('판의 끝에서는 알려 주고 움직이지 않는다', () => {
    const { grid, announce } = setup();
    const grab = widgetEl(grid, 'chart-1').querySelector<HTMLElement>('[data-dash-grab]') as HTMLElement;
    press(grab, 'ArrowLeft');
    expect(widgetEl(grid, 'chart-1').dataset.dashX).toBe('0');
    expect(announce?.textContent).toContain('판의 끝');
  });

  it('모서리 단추에서도 같은 키가 듣는다', () => {
    const { grid } = setup();
    const resize = widgetEl(grid, 'log-1').querySelector<HTMLElement>('[data-dash-resize]') as HTMLElement;
    press(resize, 'ArrowDown', true);
    expect(widgetEl(grid, 'log-1').dataset.dashH).toBe('4');
  });

  // 2026-09-25 Phase 4 검토 반영: [크기 바꾸기] 단추에서 방향키를 누르면 크기가 아니라 자리가 바뀌었다.
  it('[크기 바꾸기] 단추에서는 Shift 없이 방향키도 크기를 바꾼다(자리는 그대로)', () => {
    const { grid, announce } = setup();
    const before = widgetEl(grid, 'switch-1');
    const x = before.dataset.dashX;
    const w = Number(before.dataset.dashW);
    const resize = before.querySelector<HTMLElement>('[data-dash-resize]') as HTMLElement;
    press(resize, 'ArrowLeft');
    const after = widgetEl(grid, 'switch-1');
    expect(after.dataset.dashX).toBe(x);
    expect(Number(after.dataset.dashW)).toBe(w - 1);
    expect(announce?.textContent).toContain('크기를');
  });

  it('위젯을 지우면 초점이 다음 위젯 손잡이로 간다(body로 떨어지지 않는다)', () => {
    const { grid } = setup();
    const remove = widgetEl(grid, 'gauge-1').querySelector<HTMLButtonElement>('[data-dash-remove]');
    expect(remove, '[지우기] 단추가 있어야 해요').not.toBeNull();
    (remove as HTMLButtonElement).focus();
    (remove as HTMLButtonElement).click();
    expect(grid.querySelector('[data-dash-widget="gauge-1"]')).toBeNull();
    const focused = document.activeElement as HTMLElement | null;
    expect(focused?.matches('[data-dash-grab]')).toBe(true);
    expect(focused?.closest<HTMLElement>('[data-dash-widget]')?.dataset.dashWidget).toBe('switch-1');
  });

  it('저장을 막은 브라우저에서는 한 번만 알려 준다', () => {
    const blocked = (): never => {
      throw new Error('저장이 막혔어요');
    };
    document.body.innerHTML = '<div data-dash-grid></div><p data-dash-announce></p>';
    const grid = document.querySelector<HTMLElement>('[data-dash-grid]') as HTMLElement;
    const announce = document.querySelector<HTMLElement>('[data-dash-announce]');
    const view = new DashboardView({ grid, announce, helpId: 'h', storage: blocked });
    const grab = widgetEl(grid, 'gauge-1').querySelector<HTMLElement>('[data-dash-grab]') as HTMLElement;
    press(grab, 'ArrowDown');
    expect(announce?.textContent).toContain('기억하지 못해요');
    view.dispose();
  });
});

describe('값 받기', () => {
  it('숫자는 게이지·그래프에, 모든 메시지는 로그에 들어간다', () => {
    const { view, grid } = setup();
    expect(view.receive(message('esp32-01/tx', '42'))).toBe(3); // 그래프·게이지·로그
    expect(widgetEl(grid, 'gauge-1').querySelector('[data-dash-value]')?.textContent).toBe('42');
    expect(widgetEl(grid, 'chart-1').dataset.dashPoints).toBe('1');
    expect(widgetEl(grid, 'log-1').querySelectorAll('li')).toHaveLength(1);
  });

  it('머리말이 붙은 값도 읽는다(DATA,120,80)', () => {
    const { view, grid } = setup();
    view.receive(message('esp32-01/tx', 'DATA,120,80'));
    expect(widgetEl(grid, 'gauge-1').querySelector('[data-dash-value]')?.textContent).toBe('120');
  });

  it('다른 토픽의 값은 그래프가 가져가지 않는다', () => {
    const { view, grid } = setup();
    view.receive(message('esp32-02/tx', '7'));
    expect(widgetEl(grid, 'chart-1').dataset.dashPoints).toBeUndefined();
    // 로그 위젯은 접두어 아래 모든 토픽을 보여 준다.
    expect(widgetEl(grid, 'log-1').querySelectorAll('li')).toHaveLength(1);
  });

  it('숫자가 아니면 그리지 않고 까닭을 보여 준다', () => {
    const { view, grid } = setup();
    view.receive(message('esp32-01/tx', 'hello'));
    expect(widgetEl(grid, 'chart-1').querySelector('[data-dash-last]')?.textContent).toContain('숫자가 아니라');
  });
});

describe('스위치', () => {
  it('누르면 켜기 말을 보내라고 알리고 모습이 바뀐다', () => {
    const { grid, toggles } = setup();
    const button = widgetEl(grid, 'switch-1').querySelector<HTMLButtonElement>('[data-dash-switch]') as HTMLButtonElement;
    button.click();
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(toggles).toEqual([{ spec: expect.objectContaining({ id: 'switch-1', onText: 'on' }), on: true }]);
    button.click();
    expect(toggles[1]?.on).toBe(false);
  });

  // 2026-09-25 Phase 4 검토 반영: 연결 전에 누르면 스위치가 켜진 모양이 되고, 안내는 화면 밖 1단계 칸에만 떴다.
  it('보내지 못하면(onToggle이 false) 모양을 그대로 두고 까닭을 스위치 위젯 안에 보인다', () => {
    document.body.innerHTML = '<div data-dash-grid></div><p data-dash-announce></p>';
    const grid = document.querySelector<HTMLElement>('[data-dash-grid]') as HTMLElement;
    const view = new DashboardView({
      grid,
      announce: document.querySelector<HTMLElement>('[data-dash-announce]'),
      helpId: 'h',
      storage: new FakeStorage(),
      onToggle: () => false,
      switchProblem: () => '먼저 위쪽 [연결]을 눌러요.',
    });
    const button = widgetEl(grid, 'switch-1').querySelector<HTMLButtonElement>('[data-dash-switch]') as HTMLButtonElement;
    button.click();
    expect(button.getAttribute('aria-pressed')).toBe('false');
    const problem = widgetEl(grid, 'switch-1').querySelector<HTMLElement>('[data-dash-switch-problem]');
    expect(problem?.hidden).toBe(false);
    expect(problem?.textContent).toContain('[연결]');
    view.dispose();
  });

  it('같은 토픽에 다른 탭이 보낸 말이 오면 모습을 맞춘다(두 탭이 같은 상태를 보게)', () => {
    const { view, grid } = setup();
    const button = widgetEl(grid, 'switch-1').querySelector<HTMLButtonElement>('[data-dash-switch]') as HTMLButtonElement;
    view.receive(message('esp32-01/rx', 'on'));
    expect(button.getAttribute('aria-pressed')).toBe('true');
    view.receive(message('esp32-01/rx', 'off'));
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('설정·위젯 더하기', () => {
  it('제목·토픽을 고치면 화면과 저장이 함께 바뀐다', () => {
    const { grid, storage } = setup();
    const gauge = widgetEl(grid, 'gauge-1');
    const title = gauge.querySelector<HTMLInputElement>('[data-dash-field="title"]') as HTMLInputElement;
    title.value = '온도';
    title.dispatchEvent(new Event('change', { bubbles: true }));
    expect(gauge.querySelector('.dash-widget__title')?.textContent).toBe('온도');
    expect(readBoard(storage).widgets.find((widget) => widget.id === 'gauge-1')?.title).toBe('온도');
  });

  it('[설정]은 처음에 접혀 있고 누르면 펼쳐진다', () => {
    const { grid } = setup();
    const gauge = widgetEl(grid, 'gauge-1');
    const panel = gauge.querySelector<HTMLElement>('[data-dash-settings-panel]') as HTMLElement;
    const button = gauge.querySelector<HTMLButtonElement>('[data-dash-settings]') as HTMLButtonElement;
    expect(panel.hidden).toBe(true);
    button.click();
    expect(panel.hidden).toBe(false);
    expect(button.getAttribute('aria-expanded')).toBe('true');
  });

  it('위젯을 더하고 지우고 처음 배치로 되돌린다', () => {
    const { view, grid, storage } = setup();
    expect(view.addWidget('gauge')).toBe(true);
    expect(grid.querySelectorAll('[data-dash-widget]')).toHaveLength(5);
    expect(readBoard(storage).widgets).toHaveLength(5);
    view.removeWidget('gauge-2');
    expect(grid.querySelectorAll('[data-dash-widget]')).toHaveLength(4);
    view.removeWidget('log-1');
    view.resetLayout();
    expect(view.board.widgets).toEqual(defaultBoard().widgets);
  });

  it('[기록 지우기] 뒤에는 저장된 값을 다시 읽는다', () => {
    const { view, grid, storage } = setup();
    view.addWidget('switch');
    storage.clear();
    view.reload();
    expect(grid.querySelectorAll('[data-dash-widget]')).toHaveLength(4);
  });
});

describe('값 기억 비우기', () => {
  it('접두어를 바꾸면 그래프·로그가 비워진다', () => {
    const { view, grid } = setup();
    view.receive(message('esp32-01/tx', '1'));
    view.clearValues();
    expect(widgetEl(grid, 'chart-1').dataset.dashPoints).toBe('0');
    expect(widgetEl(grid, 'log-1').querySelectorAll('li')).toHaveLength(0);
  });
});

describe('버리기', () => {
  it('dispose하면 위젯이 사라지고 듣던 것이 풀린다', () => {
    const { view, grid } = setup();
    const spy = vi.fn();
    view.dispose();
    expect(grid.querySelectorAll('[data-dash-widget]')).toHaveLength(0);
    expect(spy).not.toHaveBeenCalled();
  });
});
