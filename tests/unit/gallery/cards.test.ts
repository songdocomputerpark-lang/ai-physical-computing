// 예제 갤러리 카드 만들기(빌드 목록 생성 함수) — src/lab/gallery/cards.ts
import { describe, expect, it } from 'vitest';
import type { ExampleSidecar } from '../../../src/lab/controls/example-sidecar.ts';
import type { LabExample } from '../../../src/lab/controls/examples.ts';
import { buildGallery, cardAnchor, labExampleHref, type GalleryExampleInput, type GalleryLessonInfo } from '../../../src/lab/gallery/cards.ts';
import type { GalleryLabId } from '../../../src/lab/gallery/filters.ts';
import { VARIANT_GROUPS } from '../../../src/lab/gallery/variants.ts';

function sidecar(overrides: Partial<ExampleSidecar> = {}): ExampleSidecar {
  return {
    title: null,
    description: null,
    lesson: null,
    page: null,
    sourceId: null,
    tags: [],
    packages: null,
    unit: null,
    difficulty: null,
    virtualOk: null,
    comm: [],
    ...overrides,
  };
}

function input(
  lab: GalleryLabId,
  example: Partial<LabExample> & { id: string; file: string },
  side: Partial<ExampleSidecar> | null = null,
): GalleryExampleInput {
  return {
    lab,
    example: {
      title: example.id,
      code: `# ${example.id}\nprint('안녕')\n`,
      group: '시험 묶음',
      ...example,
    },
    sidecar: side === null ? null : sidecar(side),
  };
}

function lesson(overrides: Partial<GalleryLessonInfo> = {}): GalleryLessonInfo {
  return {
    slug: '2-1-1',
    href: '/ai-physical-computing/learn/u2/2-1-1/',
    label: '2-1-1 터치 센서',
    ...overrides,
  };
}

describe('카드 한 장 만들기', () => {
  it('실습실 예제 목록의 값을 그대로 쓰고, 실습실로 여는 주소를 붙인다', () => {
    const { cards } = buildGallery([
      input('vision', { id: 'u1-1-2-1-webcam-flip', file: 'vision/u1/1-2-1-webcam-flip.py', title: '웹캠 좌우 반전', description: '거울처럼 뒤집어요.', group: '1단원 교과서 실습', code: 'import cv2\n' }, { sourceId: 'f028', page: 28, tags: ['카메라'] }),
    ]);
    expect(cards).toHaveLength(1);
    const [card] = cards;
    expect(card.id).toBe('vision-u1-1-2-1-webcam-flip');
    expect(card.anchor).toBe(cardAnchor('vision', 'u1-1-2-1-webcam-flip'));
    expect(card.title).toBe('웹캠 좌우 반전');
    expect(card.description).toBe('거울처럼 뒤집어요.');
    expect(card.group).toBe('1단원 교과서 실습');
    expect(card.labLabel).toBe('영상처리 실습실');
    expect(card.sourceId).toBe('f028');
    expect(card.page).toBe(28);
    expect(card.lines).toBe(1);
    expect(card.labHref).toBe(labExampleHref('vision', 'vision/u1/1-2-1-webcam-flip.py'));
    expect(card.labHref).toContain('/labs/vision/?example=');
  });

  it('찾기 글자에 제목·설명·태그·파일 이름·자료 코드 id가 모두 든다', () => {
    const { cards } = buildGallery([
      input('esp32', { id: 'u2-lcd', file: 'esp32/u2/2-1-2-lcd-count.py', title: 'LCD 숫자 세기', description: '누를 때마다 올라가요.' }, { sourceId: 'f050', tags: ['LCD'] }),
    ]);
    const { keywords } = cards[0];
    expect(keywords).toContain('lcd 숫자 세기');
    expect(keywords).toContain('누를 때마다');
    expect(keywords).toContain('esp32/u2/2-1-2-lcd-count.py');
    expect(keywords).toContain('f050');
  });
});

describe('태그를 정하는 차례 — 차시 md → 사이드카 → 사이트 규칙', () => {
  const file = 'esp32/u2/2-1-1-touch-led.py';

  it('차시 md가 있으면 차시가 먼저다', () => {
    const { cards } = buildGallery(
      [input('esp32', { id: 'u2-touch', file }, { unit: 3, difficulty: 3, virtualOk: false, comm: ['uart'] })],
      { byFile: { [file]: lesson({ unit: 2, difficulty: 1, virtualOk: true, comm: ['ble'] }) } },
    );
    expect(cards[0].facets).toMatchObject({ unit: 2, difficulty: 1, virtualOk: true, comm: ['ble'] });
  });

  it('차시에 없는 칸만 사이드카에서 가져온다(칸마다 따로)', () => {
    const { cards } = buildGallery(
      [input('esp32', { id: 'u2-touch', file }, { difficulty: 2, virtualOk: true, comm: ['ble'] })],
      { byFile: { [file]: lesson({ unit: 2 }) } },
    );
    expect(cards[0].facets).toMatchObject({ unit: 2, difficulty: 2, virtualOk: true, comm: ['ble'] });
  });

  it('둘 다 없으면 폴더 이름에서 단원을, 코드에서 통신 방식을 읽는다', () => {
    const { cards } = buildGallery([
      input('esp32', { id: 'u3-uart', file: 'esp32/u3/3-1-2-uart-laser.py', code: 'from machine import Pin, UART\n' }),
    ]);
    expect(cards[0].facets.unit).toBe(3);
    expect(cards[0].facets.comm).toEqual(['uart']);
  });

  it('사이드카에 통신 방식을 적으면 코드에서 읽은 값 대신 그것을 쓴다', () => {
    const { cards } = buildGallery([
      input('esp32', { id: 'u3-uart', file: 'esp32/u3/a.py', code: 'from machine import UART\n' }, { comm: ['tab'] }),
    ]);
    expect(cards[0].facets.comm).toEqual(['tab']);
  });

  it('부품 태그는 배선(LabExample.parts)에서 나온다 — 따로 적지 않는다', () => {
    const { cards } = buildGallery([
      input('esp32', { id: 'u2-lcd', file: 'esp32/u2/a.py', parts: [{ part: 'touch-digital', pin: 17 }, { part: 'lcd-i2c' }] }),
    ]);
    expect(cards[0].facets.parts).toEqual(['touch-digital', 'lcd-i2c']);
  });

  it('차시와 사이드카의 자유 낱말은 합친다(겹치는 낱말은 한 번만)', () => {
    const { cards } = buildGallery(
      [input('esp32', { id: 'u2-touch', file }, { tags: ['터치 센서', 'LED'] })],
      { byFile: { [file]: lesson({ tags: ['LED', '디지털 출력'] }) } },
    );
    expect(cards[0].facets.tags).toEqual(['LED', '디지털 출력', '터치 센서']);
  });

  it('차시가 실은 예제가 아니어도 사이드카의 lesson 값으로 차시 태그를 찾는다', () => {
    const { cards } = buildGallery(
      [input('esp32', { id: 'u2-touch', file }, { lesson: '2-1-1' })],
      { bySlug: { '2-1-1': lesson({ unit: 2, virtualOk: true }) } },
    );
    expect(cards[0].facets).toMatchObject({ unit: 2, virtualOk: true });
  });
});

describe('사본과 변형(PLAN §2.5)', () => {
  it('코드가 똑같은 파일은 카드 한 장으로 합치고 합친 파일을 적는다', () => {
    const { cards, notes } = buildGallery([
      input('vision', { id: 'a', file: 'vision/u1/a.py', code: 'import cv2\n' }),
      input('vision', { id: 'b', file: 'vision/u1/b.py', code: 'import cv2\n' }),
    ]);
    expect(cards).toHaveLength(1);
    expect(cards[0].file).toBe('vision/u1/a.py');
    expect(cards[0].sameCode).toEqual(['vision/u1/b.py']);
    expect(notes.join(' ')).toContain('vision/u1/b.py');
  });

  it('자료에 있던 변형(코드 id)은 "비교해 보기"로 서로 잇는다', () => {
    const { cards } = buildGallery([
      input('esp32', { id: 'hw-uart2-rgb-text', file: 'esp32/hw/uart2-rgb-text.py', title: '글자로 받기', code: '# 1\n' }, { sourceId: 'f001' }),
      input('esp32', { id: 'hw-uart2-rgb-bytes', file: 'esp32/hw/uart2-rgb-bytes.py', title: '바이트로 받기', code: '# 2\n' }, { sourceId: 'f007' }),
    ]);
    expect(cards[0].compare?.others).toEqual([{ anchor: cardAnchor('esp32', 'hw-uart2-rgb-bytes'), title: '바이트로 받기' }]);
    expect(cards[1].compare?.others).toEqual([{ anchor: cardAnchor('esp32', 'hw-uart2-rgb-text'), title: '글자로 받기' }]);
    expect(cards[0].compare?.id).toBe(cards[1].compare?.id);
  });

  it('묶음에 한 장만 남으면 비교 링크를 만들지 않는다', () => {
    const { cards } = buildGallery([
      input('esp32', { id: 'only', file: 'esp32/hw/uart2-rgb-text.py' }, { sourceId: 'f001' }),
    ]);
    expect(cards[0].compare).toBeNull();
  });

  it('원본과 사이트판(…-site.py)은 표 없이 저절로 묶인다', () => {
    const { cards } = buildGallery([
      input('esp32', { id: 'u2-laser-rgb', file: 'esp32/u2/2-1-4-laser-rgb.py', title: '원본', code: '# 원본\n' }),
      input('esp32', { id: 'u2-laser-rgb-site', file: 'esp32/u2/2-1-4-laser-rgb-site.py', title: '사이트판', code: '# 사이트판\n' }),
    ]);
    expect(cards[0].compare?.label).toBe('원본과 사이트판');
    expect(cards[0].compare?.others[0].title).toBe('사이트판');
    expect(cards[1].compare?.others[0].title).toBe('원본');
  });

  /**
   * 변형 표는 docs/INVENTORY.md §7.2("거의 같은 파일")를 옮긴 것이다. 그 표에서 한 줄이 빠지면 학생은 "왜 비슷한 예제가
   * 둘인지" 알 길이 없어지므로, 표의 내용을 여기에 한 번 더 적어 두고 어긋나면 실패하게 한다.
   * 빠진 한 줄은 f003↔f012(서보 클래스) — 둘 다 보드 라이브러리 파일이라 애초에 카드가 되지 않는다(variants.ts 머리말).
   */
  it('변형 표가 자료 목록(INVENTORY §7.2)과 같다', () => {
    const expected = [
      ['f001', 'f007'],
      ['f014', 'f061', 'f143'],
      ['f047', 'f144'],
      ['f058', 'f059', 'f066', 'f072'],
      ['f086', 'f157'],
      ['f089', 'f158'],
      ['f090', 'f091'],
      ['f104', 'f114'],
      ['f110', 'f111', 'f115'],
    ];
    const actual = VARIANT_GROUPS.map((group) => [...group.sourceIds].sort()).sort((a, b) => a[0].localeCompare(b[0]));
    expect(actual).toEqual(expected);
    // 묶음 id와 설명 글은 카드에 그대로 보이므로 비어 있으면 안 된다.
    for (const group of VARIANT_GROUPS) {
      expect(group.id).toMatch(/^[a-z0-9-]+$/u);
      expect(group.label.trim()).not.toBe('');
      expect(group.note.trim()).not.toBe('');
      expect(group.sourceIds.length).toBeGreaterThan(1);
    }
    expect(new Set(VARIANT_GROUPS.map((group) => group.id)).size).toBe(VARIANT_GROUPS.length);
    // 한 코드 id가 두 묶음에 들면 카드가 어느 묶음에 들지 알 수 없다.
    const all = VARIANT_GROUPS.flatMap((group) => group.sourceIds);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('묶음과 거르기 칸', () => {
  const inputs = [
    input('vision', { id: 'v1', file: 'vision/u1/a.py', group: '1단원 교과서 실습', code: 'import cv2\n' }),
    input('vision', { id: 'v2', file: 'vision/u1/b.py', group: '1단원 교과서 실습', code: 'import cv2\n# 2\n' }),
    input('esp32', { id: 'e1', file: 'esp32/u2/a.py', group: '2단원 교과서 실습', parts: [{ part: 'lcd-i2c' }], code: 'from machine import Pin\n' }),
    input('esp32', { id: 'e2', file: 'esp32/u3/b.py', group: '3단원 교과서 실습', code: 'import ubluetooth\n' }),
  ];

  it('실습실 차례(영상처리 → ESP32)와 묶음 이름대로 나뉜다', () => {
    const { sections } = buildGallery(inputs);
    expect(sections.map((section) => section.label)).toEqual(['1단원 교과서 실습', '2단원 교과서 실습', '3단원 교과서 실습']);
    expect(sections[0].cards).toHaveLength(2);
    expect(sections[0].lab).toBe('vision');
  });

  it('거르기 칸은 실제로 있는 값만 개수와 함께 만든다', () => {
    const { facetGroups } = buildGallery(inputs, {}, { partLabels: { 'lcd-i2c': '문자 LCD' }, commLabels: { ble: '블루투스(BLE)' } });
    const byKey = Object.fromEntries(facetGroups.map((group) => [group.key, group]));
    expect(byKey.lab.options.map((option) => [option.value, option.count])).toEqual([
      ['vision', 2],
      ['esp32', 2],
    ]);
    expect(byKey.unit.options.map((option) => option.label)).toEqual(['1단원', '2단원', '3단원']);
    expect(byKey.comm.options).toEqual([{ value: 'ble', label: '블루투스(BLE)', count: 1 }]);
    expect(byKey.parts.options).toEqual([{ value: 'lcd-i2c', label: '문자 LCD', count: 1 }]);
    // 난이도를 적은 예제가 하나도 없으면 그 칸 자체를 만들지 않는다.
    expect(byKey.difficulty).toBeUndefined();
  });

  it('하드웨어 없이 되는 예제 수를 따로 센다 — 적지 않은 예제는 사이트 규칙(두 실습실 모두 가상으로 됨)으로 참, 적은 거짓은 그대로', () => {
    const { virtualOkCount, cards } = buildGallery([
      input('esp32', { id: 'a', file: 'esp32/u2/a.py' }, { virtualOk: true }),
      input('esp32', { id: 'b', file: 'esp32/u2/b.py', code: '# b\n' }, { virtualOk: false }),
      input('esp32', { id: 'c', file: 'esp32/u2/c.py', code: '# c\n' }),
      input('vision', { id: 'd', file: 'vision/u1/d.py', code: '# d\n' }),
    ]);
    expect(virtualOkCount).toBe(3);
    expect(Object.fromEntries(cards.map((card) => [card.file, card.facets.virtualOk]))).toEqual({
      'esp32/u2/a.py': true,
      'esp32/u2/b.py': false,
      'esp32/u2/c.py': true,
      'vision/u1/d.py': true,
    });
  });

  it('난이도를 일부만 적었으면 칸 이름에 적은 수를 밝힌다', () => {
    const { facetGroups } = buildGallery([
      input('esp32', { id: 'a', file: 'esp32/u2/a.py' }, { difficulty: 1 }),
      input('esp32', { id: 'b', file: 'esp32/u2/b.py', code: '# b\n' }),
    ]);
    const difficulty = facetGroups.find((group) => group.key === 'difficulty');
    expect(difficulty?.legend).toBe('난이도(적어 둔 예제 1개만)');
  });

  it('파일 경로가 없는 예제는 넣지 않는다(실습실 자리 코드 등)', () => {
    const { cards } = buildGallery([{ lab: 'vision', example: { id: 'scratchish', title: '이름만', code: '' } }]);
    expect(cards).toHaveLength(0);
  });
});
