// @vitest-environment jsdom
// 블록 모드 → 가상 보드 배선 알림(src/lab/blocks/board-link.ts): 뿌리 요소의 data-board-wiring-override 속성과 apc:board-wiring 이벤트.
import { describe, expect, it } from 'vitest';
import { BOARD_WIRING_EVENT, announceBoardWiring, readAnnouncedWiring, sameWiring, type BoardWiringEventDetail } from '../../../src/lab/blocks/board-link.ts';

describe('배선 알림', () => {
  it('알리면 속성에 JSON을 적고 이벤트를 한 번 보낸다. 같은 배선이면 다시 보내지 않는다', () => {
    const root = document.createElement('div');
    const received: (BoardWiringEventDetail | null)[] = [];
    root.addEventListener(BOARD_WIRING_EVENT, (event) => received.push((event as CustomEvent<BoardWiringEventDetail>).detail));
    const wiring = [{ part: 'touch-digital', pin: 17, label: '터치 센서' }];
    expect(announceBoardWiring(root, wiring)).toBe(true);
    expect(announceBoardWiring(root, [{ part: 'touch-digital', pin: 17, label: '터치 센서' }])).toBe(false);
    expect(root.getAttribute('data-board-wiring-override')).toBe(JSON.stringify(wiring));
    expect(root.getAttribute('data-board-wiring-source')).toBe('blocks');
    expect(readAnnouncedWiring(root)).toEqual(wiring);
    expect(received).toEqual([{ source: 'blocks', entries: wiring }]);
  });

  it('null이면 속성을 지우고 예제 배선으로 돌아가라고 알린다(한 번만)', () => {
    const root = document.createElement('div');
    const received: unknown[] = [];
    root.addEventListener(BOARD_WIRING_EVENT, (event) => received.push((event as CustomEvent<BoardWiringEventDetail>).detail.entries));
    expect(announceBoardWiring(root, null)).toBe(false);
    announceBoardWiring(root, []);
    expect(root.getAttribute('data-board-wiring-override')).toBe('[]');
    expect(announceBoardWiring(root, null)).toBe(true);
    expect(root.hasAttribute('data-board-wiring-override')).toBe(false);
    expect(received).toEqual([[], null]);
  });

  it('망가진 속성은 없는 것으로 읽고, sameWiring은 순서까지 본다', () => {
    const root = document.createElement('div');
    root.setAttribute('data-board-wiring-override', '{망가짐');
    expect(readAnnouncedWiring(root)).toBeNull();
    const a = { part: 'buzzer', pin: 15 };
    const b = { part: 'laser', pin: 21 };
    expect(sameWiring([a, b], [a, b])).toBe(true);
    expect(sameWiring([a, b], [b, a])).toBe(false);
    expect(sameWiring(null, null)).toBe(true);
  });
});
