// 가상 보드 부품 레지스트리(src/lab/modules/board/parts.ts)의 순수 함수 단위 테스트 — P3-01·P3-02.
// 부품 하나하나의 visual·interaction.drive 검사는 부품마다 따로 둔다: tests/unit/lab/board-part-<부품 id>.test.ts(README 7.5 — 여러 사람이
// 부품을 동시에 더해도 이 파일을 함께 고치지 않게). 이 파일은 레지스트리 검사와 배선 검사(resolveWiring)만 본다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { exampleWiring } from '../../../src/lab/modules/board/index.ts';
import type { PartDefinition, WiringIssue } from '../../../src/lab/modules/board/part-types.ts';
import {
  PART_DEFINITIONS,
  inputDrives,
  onboardWiring,
  partFolderOf,
  partsByGpio,
  resolveWiring,
  validatePartDefinitions,
  wiringValue,
  withControlDrive,
} from '../../../src/lab/modules/board/parts.ts';
import { wiringHasSound } from '../../../src/lab/modules/board/index.ts';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const PARTS_DIR = path.join(ROOT, 'src', 'lab', 'modules', 'board', 'parts');
const UNIT_DIR = path.join(ROOT, 'tests', 'unit', 'lab');

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

const button = (id: string, gpio?: number) =>
  part({ id, pins: [{ role: 'sig', label: '신호', direction: 'in' }], ...(gpio === undefined ? {} : { defaultPins: { sig: gpio } }), interaction: { kind: 'momentary', label: '버튼', drive: (active) => (active ? 1 : 0) } });

function codes(issues: readonly WiringIssue[]): string[] {
  return issues.map((issue) => issue.code);
}

function texts(issues: readonly WiringIssue[]): string {
  return issues.map((issue) => issue.text).join('\n');
}

describe('부품 정의 검사(validatePartDefinitions)', () => {
  it('실제 부품 폴더는 모두 규칙에 맞고, python에 적은 .py가 그 폴더에 있으며, 부품마다 단위 테스트 파일이 있다', () => {
    const folders = fs.readdirSync(PARTS_DIR, { withFileTypes: true }).filter((entry) => entry.isDirectory());
    const pythonFiles = Object.fromEntries(folders.map((folder) => [folder.name, fs.readdirSync(path.join(PARTS_DIR, folder.name)).filter((name) => name.endsWith('.py'))]));
    const modules = Object.fromEntries([...PART_DEFINITIONS.values()].map((definition) => [`./parts/${definition.id}/part.ts`, { default: definition }]));
    expect(validatePartDefinitions(modules, pythonFiles)).toEqual([]);
    // 폴더마다 part.ts가 있고 레지스트리에 들어 있다(등록 파일 없이 자동 발견)
    expect([...PART_DEFINITIONS.keys()].sort()).toEqual(folders.map((folder) => folder.name).sort());
    expect(partFolderOf('./parts/builtin-led/part.ts')).toBe('builtin-led');
    // README 7.5 규칙: 부품 하나 = 단위 테스트 파일 하나
    for (const folder of folders) {
      expect(fs.existsSync(path.join(UNIT_DIR, `board-part-${folder.name}.test.ts`)), `tests/unit/lab/board-part-${folder.name}.test.ts`).toBe(true);
    }
    expect([...PART_DEFINITIONS.keys()]).toEqual(expect.arrayContaining(['boot-button', 'builtin-led', 'touch-digital', 'vibration-motor']));
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
        './parts/h/part.ts': { default: part({ id: 'h', anchors: { sig: { x: 10, y: 0 }, nope: { x: 9, y: 0 } }, power: { gnd: { x: 1 } } as never, defaultPinsNotice: '' }) },
        './parts/i/part.ts': { default: part({ id: 'i', sound: 'yes' as never, controls: {} as never }) },
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
    expect(text).toMatch(/anchors의 "sig" x\(10\)는 18의 배수 \+ 9/u);
    expect(text).toMatch(/anchors의 "nope"이\(가\) pins에 없어요/u);
    expect(text).toMatch(/power는 \{ gnd/u);
    expect(text).toMatch(/defaultPinsNotice는 안내 한 문장/u);
    expect(text).toContain('i/part.ts: sound는 true 또는 false');
    expect(text).toContain('i/part.ts: controls는 (host, api)');
  });
});

describe('배선(resolveWiring)', () => {
  it('보드에 붙은 부품(내장 LED GPIO2·BOOT 버튼 GPIO0)은 적지 않아도 들어가고 핀이 고정되며, 스트래핑 핀이어도 주의를 내지 않는다', () => {
    const resolved = resolveWiring([]);
    expect(resolved.issues).toEqual([]);
    expect(resolved.unknown).toEqual([]);
    expect(resolved.instances.map((instance) => [instance.part, instance.pins])).toEqual(
      expect.arrayContaining([
        ['builtin-led', { led: 2 }],
        ['boot-button', { sig: 0 }],
      ]),
    );
    expect(onboardWiring().map((entry) => entry.part).sort()).toEqual(['boot-button', 'builtin-led']);
    const moved = resolveWiring([{ part: 'builtin-led', id: 'led', pins: { led: 5 } }]);
    expect(moved.instances.find((instance) => instance.part === 'builtin-led')?.pins).toEqual({ led: 2 });
    expect(moved.issues).toEqual([expect.objectContaining({ level: 'info', code: 'onboard-fixed', gpio: 2 })]);
    expect(texts(moved.issues)).toContain('GPIO2로 정해져 있어요');
  });

  it('P3-02 예제 배선: 터치 센서(pin 줄임 표기)·진동 모터(기본 핀 19 — 사이트 배정 안내), 이름을 적지 않으면 부품 id(겹치면 -2)', () => {
    const resolved = resolveWiring([
      { part: 'touch-digital', pin: 17 },
      { part: 'vibration-motor', pin: 19 },
      { part: 'touch-digital', pin: 4 },
    ]);
    const external = resolved.instances.filter((instance) => !['builtin-led', 'boot-button'].includes(instance.part));
    expect(external.map((instance) => [instance.id, instance.pins, instance.usesDefaultPins])).toEqual([
      ['touch-digital', { sig: 17 }, true],
      ['vibration-motor', { sig: 19 }, true],
      ['touch-digital-2', { sig: 4 }, false],
    ]);
    expect(resolved.issues).toEqual([expect.objectContaining({ level: 'info', code: 'site-assigned' })]);
    expect(texts(resolved.issues)).toContain('GPIO19는 원고에 핀 번호가 없어서 사이트가 정한 핀');
    // 진동 모터를 다른 핀에 옮기면 사이트 배정 안내는 나오지 않는다
    expect(codes(resolveWiring([{ part: 'vibration-motor', pins: { sig: 13 } }]).issues)).toEqual([]);
  });

  it('없는 부품·겹치는 이름·없는 핀·입력 전용 핀의 출력 부품·한 핀의 입력 부품 둘을 알린다', () => {
    const definitions = new Map<string, PartDefinition>([
      ['led-x', part({ id: 'led-x' })],
      ['btn', button('btn')],
    ]);
    const resolved = resolveWiring(
      [
        { part: 'nope', id: 'n' },
        { part: 'led-x', id: 'a', pins: { sig: 25 } },
        { part: 'led-x', id: 'a', pins: { sig: 26 } },
        { part: 'led-x', id: 'b', pins: { sig: 24 } },
        { part: 'led-x', id: 'c', pins: { sig: 34 } },
        { part: 'btn', id: 'd', pins: { sig: 18 } },
        { part: 'btn', id: 'e', pins: { sig: 18 } },
      ],
      definitions,
    );
    const text = texts(resolved.issues);
    expect(text).toContain('부품 "nope"은(는) 가상 보드에 아직 없어서 그림에 그리지 못했어요');
    expect(text).toContain('"a"이(가) 규칙에 맞지 않거나 겹쳐요');
    expect(text).toContain('24는 ESP32에 없는 GPIO');
    expect(text).toContain('34~39번은 입력 전용');
    expect(text).toContain('GPIO18에 입력 부품 두 개(d, e)');
    expect(resolved.instances.map((instance) => instance.id)).toEqual(['a', 'c', 'd', 'e']);
    // 오류가 주의보다 앞에 온다
    expect(resolved.issues.map((issue) => issue.level)).toEqual([...resolved.issues.map((issue) => issue.level)].sort((x, y) => ['error', 'warning', 'info'].indexOf(x) - ['error', 'warning', 'info'].indexOf(y)));
    expect(resolved.unknown).toEqual([{ part: 'nope', id: 'n', label: 'nope', pins: {} }]);
    expect(partsByGpio(resolved.instances, definitions).get(18)).toEqual(['btn 부품', 'btn 부품']);
  });

  it('스트래핑 핀의 바깥 부품(주의)·한 핀의 입력·출력 부품(오류)·한 핀의 출력 부품 여럿(참고)·핀 머리가 없는 핀·줄임 표기와 역할 오류', () => {
    const definitions = new Map<string, PartDefinition>([
      ['led-x', part({ id: 'led-x' })],
      ['btn', button('btn')],
      ['rgb', part({ id: 'rgb', pins: ['r', 'g', 'b'].map((role) => ({ role, label: role.toUpperCase(), direction: 'out' as const })) })],
      ['onboard-led', part({ id: 'onboard-led', onboard: true, defaultPins: { sig: 2 } })],
    ]);
    const resolved = resolveWiring(
      [
        { part: 'led-x', id: 'strap', pins: { sig: 12 } },
        { part: 'btn', id: 'touch', pin: 17 },
        { part: 'led-x', id: 'motor', pin: 17 },
        { part: 'led-x', id: 'buzzer', pin: 2 },
        { part: 'led-x', id: 'flash', pin: 7 },
        { part: 'led-x', id: 'hidden', pin: 37 },
        { part: 'rgb', id: 'rgb1', pin: 27 },
        { part: 'rgb', id: 'rgb2', pins: { r: 27, g: 32, b: 33, w: 25 } },
      ],
      definitions,
    );
    const byCode = (code: string) => resolved.issues.filter((issue) => issue.code === code);
    expect(byCode('strapping').map((issue) => [issue.level, issue.gpio])).toEqual([
      ['warning', 2],
      ['warning', 12],
    ]);
    expect(byCode('strapping')[1]?.text).toContain('GPIO12는 전원을 켤 때 부팅 방식을 정하는 스트래핑 핀이에요. 여기에 led-x 부품을 이으면 실물 보드가 켜지지 않거나');
    expect(byCode('input-output-same-pin')).toEqual([expect.objectContaining({ level: 'error', gpio: 17 })]);
    expect(byCode('shared-output')).toEqual([expect.objectContaining({ level: 'info', gpio: 2 })]);
    expect(byCode('not-on-header').map((issue) => [issue.level, issue.gpio])).toEqual([
      ['error', 7],
      ['warning', 37],
    ]);
    expect(byCode('pin-shorthand')[0]?.text).toContain('핀이 여러 개(r·g·b)');
    expect(byCode('unknown-role')[0]?.text).toContain('"w" 핀이 없어서');
    expect(resolved.instances.map((instance) => instance.id)).toEqual(['onboard-led', 'strap', 'touch', 'motor', 'buzzer', 'flash', 'hidden', 'rgb2']);
  });

  it("'board.wiring' 값: 아는 부품은 이름·핀·방향(사이드카 f052의 터치·LCD), 모르는 부품은 known false와 적힌 핀", () => {
    const resolved = resolveWiring([
      { part: 'touch-digital', pin: 17 },
      { part: 'lcd-i2c', id: 'lcd', pins: { sda: 21, scl: 22 }, label: '문자 LCD(16×2)' },
      { part: 'mystery-sensor', id: 'mystery', pins: { sig: 4 }, label: '이름 모를 센서' },
    ]);
    expect(texts(resolved.issues)).toContain('부품 "이름 모를 센서"는 가상 보드에 아직 없어서');
    expect(texts(resolved.issues)).not.toContain('문자 LCD(16×2)');
    const value = wiringValue(resolved.instances, resolved.unknown);
    expect(value.parts).toEqual(
      expect.arrayContaining([
        { part: 'touch-digital', id: 'touch-digital', label: '터치 센서', pins: { sig: 17 }, directions: { sig: 'in' }, known: true },
        { part: 'builtin-led', id: 'builtin-led', label: '내장 LED', pins: { led: 2 }, directions: { led: 'out' }, known: true },
        {
          part: 'lcd-i2c',
          id: 'lcd',
          label: '문자 LCD(16×2)',
          pins: { sda: 21, scl: 22 },
          directions: { sda: 'out', scl: 'out' },
          known: true,
        },
        { part: 'mystery-sensor', id: 'mystery', label: '이름 모를 센서', pins: { sig: 4 }, known: false },
      ]),
    );
  });

  it('입력 부품이 핀을 누르는 값: 센 값(0·1)이 약한 값(풀업)을 이긴다', () => {
    const { instances } = resolveWiring([{ part: 'touch-digital', pin: 17 }]);
    expect([...inputDrives(instances, new Set()).entries()].sort(([a], [b]) => a - b)).toEqual([
      [0, 'pullup'],
      [17, 0],
    ]);
    expect(new Map(inputDrives(instances, new Set(['boot-button', 'touch-digital'])))).toEqual(
      new Map<number, number | string>([
        [0, 0],
        [17, 1],
      ]),
    );
  });

  it('부품 조작 칸(controls)이 정한 값: interaction 대신 그 값, 아날로그 전압은 센 값, null이면 지운다(병렬 제작 준비)', () => {
    const analogPad = part({ id: 'pad', pins: [{ role: 'sig', label: '신호', direction: 'in' }], defaultPins: { sig: 32 }, controls: () => undefined });
    const definitions = new Map<string, PartDefinition>([...PART_DEFINITIONS.entries(), ['pad', analogPad]]);
    const { instances } = resolveWiring([{ part: 'touch-digital', pin: 17 }, { part: 'pad', id: 'pad' }], definitions);
    // 조작 칸이 아직 값을 정하지 않은 조작 칸 부품(interaction 없음)은 핀을 누르지 않는다
    expect(new Map(inputDrives(instances, new Set(), definitions)).has(32)).toBe(false);
    let controls = withControlDrive(new Map(), 'pad', 'sig', { mv: 1535 });
    controls = withControlDrive(controls, 'touch-digital', 'sig', 1);
    const drives = inputDrives(instances, new Set(), definitions, controls);
    expect(drives.get(32)).toEqual({ mv: 1535 });
    // 조작 칸 값이 interaction 값(떼면 0)보다 앞선다
    expect(drives.get(17)).toBe(1);
    // BOOT 버튼(풀업)과 같은 핀이면 아날로그 전압(센 값)이 이긴다
    const shared = withControlDrive(new Map(), 'pad', 'sig', { mv: 100 });
    const { instances: onZero } = resolveWiring([{ part: 'pad', id: 'pad', pin: 0 }], definitions);
    expect(inputDrives(onZero, new Set(), definitions, shared).get(0)).toEqual({ mv: 100 });
    // null이면 그 역할을 지우고, 역할이 없으면 부품 칸도 지운다
    const cleared = withControlDrive(controls, 'pad', 'sig', null);
    expect(cleared.has('pad')).toBe(false);
    expect(controls.get('pad')?.get('sig')).toEqual({ mv: 1535 });
  });

  it('소리 부품(sound: true)이 배선에 있으면 [소리 켜기/끄기] 단추가 보인다', () => {
    const buzzer = part({ id: 'beeper', sound: true });
    const definitions = new Map<string, PartDefinition>([...PART_DEFINITIONS.entries(), ['beeper', buzzer]]);
    expect(wiringHasSound(resolveWiring([], definitions).instances, definitions)).toBe(false);
    expect(wiringHasSound(resolveWiring([{ part: 'beeper', pin: 15 }], definitions).instances, definitions)).toBe(true);
  });

  it('예제의 배선 표(LabExample.parts)를 읽는다', () => {
    expect(exampleWiring(null)).toEqual([]);
    expect(exampleWiring({ parts: [{ part: 'builtin-led', id: 'led' }] })).toEqual([{ part: 'builtin-led', id: 'led' }]);
  });
});
