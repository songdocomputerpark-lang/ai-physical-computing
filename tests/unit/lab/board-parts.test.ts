// 가상 보드 부품 레지스트리(src/lab/modules/board/parts.ts)와 부품 폴더(parts/<부품>/part.ts)의 순수 함수 단위 테스트 — P3-01.
// 새 부품을 더하면 이 파일에 그 부품의 visual·interaction.drive 검사를 더한다(src/lab/README.md 7절).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { exampleWiring, snapshotAfterRun } from '../../../src/lab/modules/board/index.ts';
import type { PartDefinition } from '../../../src/lab/modules/board/part-types.ts';
import bootButton from '../../../src/lab/modules/board/parts/boot-button/part.ts';
import builtinLed from '../../../src/lab/modules/board/parts/builtin-led/part.ts';
import {
  PART_DEFINITIONS,
  inputDrives,
  onboardWiring,
  partFolderOf,
  partsByGpio,
  resolveWiring,
  validatePartDefinitions,
  wiringValue,
} from '../../../src/lab/modules/board/parts.ts';
import { EMPTY_SNAPSHOT, applyStateEvent, parseStateEvent, type BoardSnapshot } from '../../../src/lab/modules/board/state.ts';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const PARTS_DIR = path.join(ROOT, 'src', 'lab', 'modules', 'board', 'parts');

function part(overrides: Partial<PartDefinition> & { id: string }): PartDefinition {
  return {
    title: `${overrides.id} 부품`,
    description: '시험 부품이에요.',
    pins: [{ role: 'sig', label: '신호', direction: 'out' }],
    size: { width: 10, height: 10 },
    visual: () => ({}),
    render: () => () => undefined,
    ...overrides,
  };
}

function snapshotWith(pins: Record<string, unknown>[], phase = 'run'): BoardSnapshot {
  return applyStateEvent(EMPTY_SNAPSHOT, parseStateEvent({ reason: 'reset', phase, seq: 1, t_us: 0, pins, timers: 0 })!);
}

describe('부품 정의 검사(validatePartDefinitions)', () => {
  it('실제 부품 폴더는 모두 규칙에 맞고, python에 적은 .py가 그 폴더에 있다', () => {
    const folders = fs.readdirSync(PARTS_DIR, { withFileTypes: true }).filter((entry) => entry.isDirectory());
    const pythonFiles = Object.fromEntries(folders.map((folder) => [folder.name, fs.readdirSync(path.join(PARTS_DIR, folder.name)).filter((name) => name.endsWith('.py'))]));
    const modules = Object.fromEntries([...PART_DEFINITIONS.values()].map((definition) => [`./parts/${definition.id}/part.ts`, { default: definition }]));
    expect(validatePartDefinitions(modules, pythonFiles)).toEqual([]);
    // 폴더마다 part.ts가 있고 레지스트리에 들어 있다(등록 파일 없이 자동 발견)
    expect([...PART_DEFINITIONS.keys()].sort()).toEqual(folders.map((folder) => folder.name).sort());
    expect(partFolderOf('./parts/builtin-led/part.ts')).toBe('builtin-led');
  });

  it('틀린 정의를 한국어로 알린다', () => {
    const errors = validatePartDefinitions(
      {
        './parts/a/part.ts': { default: part({ id: 'b' }) },
        './parts/Bad/part.ts': { default: part({ id: 'Bad' }) },
        './parts/c/part.ts': { default: part({ id: 'c', pins: [], size: { width: 0, height: 1 } }) },
        './parts/d/part.ts': { default: part({ id: 'd', onboard: true, pins: [{ role: 'sig', label: '신호', direction: 'in' }, { role: 'sig', label: '', direction: 'out' }] }) },
        './parts/e/part.ts': { default: part({ id: 'e', interaction: { kind: 'hold' as never, label: 'x', drive: () => 0 }, defaultPins: { other: 24 } }) },
        './parts/f/part.ts': { default: part({ id: 'f', python: 'apc_part_missing' }) },
        './parts/g/part.ts': { default: undefined as never },
      },
      { f: [] },
    );
    const text = errors.join('\n');
    expect(text).toMatch(/id "b"이\(가\) 폴더 이름 "a"/u);
    expect(text).toMatch(/Bad\/part.ts: id는 영문 소문자/u);
    expect(text).toMatch(/pins에 핀을 하나 이상/u);
    expect(text).toMatch(/size\(그림 크기/u);
    expect(text).toMatch(/핀 역할 "sig"이\(가\) 겹쳐요/u);
    expect(text).toMatch(/onboard\)은 핀 "sig"의 defaultPins/u);
    expect(text).toMatch(/interaction은/u);
    expect(text).toMatch(/interaction이 있는 부품은 direction 'in' 핀/u);
    expect(text).toMatch(/"other"이\(가\) pins에 없어요/u);
    expect(text).toMatch(/apc_part_missing.py가 그 부품 폴더에 없어요/u);
    expect(text).toMatch(/g\/part.ts: default export/u);
  });
});

describe('배선(resolveWiring)', () => {
  it('보드에 붙은 부품(내장 LED GPIO2·BOOT 버튼 GPIO0)은 적지 않아도 들어가고 핀이 고정된다', () => {
    const resolved = resolveWiring([]);
    expect(resolved.problems).toEqual([]);
    expect(resolved.instances.map((instance) => [instance.part, instance.pins])).toEqual(
      expect.arrayContaining([
        ['builtin-led', { led: 2 }],
        ['boot-button', { sig: 0 }],
      ]),
    );
    expect(onboardWiring().map((entry) => entry.part).sort()).toEqual(['boot-button', 'builtin-led']);
    const moved = resolveWiring([{ part: 'builtin-led', id: 'led', pins: { led: 5 } }]);
    expect(moved.instances.find((instance) => instance.part === 'builtin-led')?.pins).toEqual({ led: 2 });
    expect(moved.problems.join('\n')).toContain('GPIO2로 정해져 있어요');
  });

  it('없는 부품·겹치는 이름·없는 핀·입력 전용 핀의 출력 부품·한 핀의 입력 부품 둘을 알린다', () => {
    const definitions = new Map<string, PartDefinition>([
      ['led-x', part({ id: 'led-x' })],
      ['btn', part({ id: 'btn', pins: [{ role: 'sig', label: '신호', direction: 'in' }], interaction: { kind: 'momentary', label: '버튼', drive: (active) => (active ? 1 : 0) } })],
    ]);
    const resolved = resolveWiring(
      [
        { part: 'nope', id: 'n' },
        { part: 'led-x', id: 'a', pins: { sig: 25 } },
        { part: 'led-x', id: 'a', pins: { sig: 26 } },
        { part: 'led-x', id: 'b', pins: { sig: 24 } },
        { part: 'led-x', id: 'c', pins: { sig: 34 } },
        { part: 'btn', id: 'd', pins: { sig: 17 } },
        { part: 'btn', id: 'e', pins: { sig: 17 } },
      ],
      definitions,
    );
    const text = resolved.problems.join('\n');
    expect(text).toContain('"nope"을(를) 가상 보드가 아직 몰라요');
    expect(text).toContain('"a"이(가) 규칙에 맞지 않거나 겹쳐요');
    expect(text).toContain('24은(는) ESP32에 없는 GPIO');
    expect(text).toContain('34~39번은 입력 전용');
    expect(text).toContain('GPIO17에 입력 부품 두 개(d, e)');
    expect(resolved.instances.map((instance) => instance.id)).toEqual(['a', 'c', 'd', 'e']);
    expect(wiringValue(resolved.instances).parts[0]).toEqual({ part: 'led-x', id: 'a', pins: { sig: 25 } });
    expect(partsByGpio(resolved.instances, definitions).get(17)).toEqual(['btn 부품', 'btn 부품']);
  });

  it('입력 부품이 핀을 누르는 값: 센 값(0·1)이 약한 값(풀업)을 이긴다', () => {
    const { instances } = resolveWiring([]);
    expect([...inputDrives(instances, new Set()).entries()]).toEqual([[0, 'pullup']]);
    expect([...inputDrives(instances, new Set(['boot-button'])).entries()]).toEqual([[0, 0]]);
  });

  it('예제의 배선 표(LabExample.parts)를 읽는다', () => {
    expect(exampleWiring(null)).toEqual([]);
    expect(exampleWiring({ parts: [{ part: 'builtin-led', id: 'led' }] })).toEqual([{ part: 'builtin-led', id: 'led' }]);
  });
});

describe('부품: 내장 LED(builtin-led)', () => {
  const instance = { part: 'builtin-led', id: 'builtin-led', pins: { led: 2 }, label: '내장 LED' };
  it('GPIO2가 출력으로 1이면 켜지고, 입력 모드·0·[정지]면 꺼진다', () => {
    const on = snapshotWith([{ id: 2, mode: 'out', out: 1, level: 1, driven: true, irq: false }]);
    expect(builtinLed.visual({ snapshot: on, instance, active: false, reducedMotion: false })).toEqual({ lit: true });
    expect(builtinLed.visual({ snapshot: snapshotWith([{ id: 2, mode: 'out', out: 0, level: 0, driven: true }]), instance, active: false, reducedMotion: false })).toEqual({ lit: false });
    expect(builtinLed.visual({ snapshot: snapshotWith([{ id: 2, mode: 'in', out: 1, level: 0, driven: false }]), instance, active: false, reducedMotion: false })).toEqual({ lit: false });
    expect(builtinLed.visual({ snapshot: snapshotAfterRun(on, { outcome: 'stopped' }), instance, active: false, reducedMotion: false })).toEqual({ lit: false });
    expect(builtinLed.visual({ snapshot: snapshotAfterRun(on, { outcome: 'killed' }), instance, active: false, reducedMotion: false })).toEqual({ lit: false });
    expect(builtinLed.visual({ snapshot: snapshotAfterRun({ ...on, phase: 'end' }, { outcome: 'ok' }), instance, active: false, reducedMotion: false })).toEqual({ lit: true });
    expect(builtinLed.visual({ snapshot: EMPTY_SNAPSHOT, instance, active: false, reducedMotion: false })).toEqual({ lit: false });
  });
});

describe('부품: BOOT 버튼(boot-button)', () => {
  it('누르면 GPIO0을 0으로, 떼면 풀업(평소 1) — 누르고 있는 동안만(momentary)', () => {
    expect(bootButton.interaction?.kind).toBe('momentary');
    expect(bootButton.interaction?.drive(true, 'sig')).toBe(0);
    expect(bootButton.interaction?.drive(false, 'sig')).toBe('pullup');
    const instance = { part: 'boot-button', id: 'boot-button', pins: { sig: 0 }, label: 'BOOT 버튼' };
    expect(bootButton.visual({ snapshot: EMPTY_SNAPSHOT, instance, active: true, reducedMotion: false })).toEqual({ pressed: true });
    expect(bootButton.visual({ snapshot: EMPTY_SNAPSHOT, instance, active: false, reducedMotion: false })).toEqual({ pressed: false });
  });
});
