// 회로 그림(scripts/circuits/) — 목록(circuits.yaml)과 .circuit 파일이 서로 맞고, 부품·핀이 회로 구성 도구의 표와 맞는지 본다.
// 도구 사이트에는 접속하지 않는다(내보내기는 npm run circuits:export — 운영자 PC). 여기서는 글과 계산만 본다.
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { circuitText, readFigureList } from '../../../scripts/circuits/build-circuits.mjs';
import { buildCircuit, circuitBounds, connectPart, undrawablePins } from '../../../scripts/circuits/lib/build-circuit.mjs';
import { BOARD, BOARD_PINS, COLUMNS, COMPANIONS, PARTS, boardHeight, columnPrefix, partSize } from '../../../scripts/circuits/lib/catalog.mjs';
import { convertPng, findContentBox } from '../../../scripts/circuits/import-circuits.mjs';

const rootDir = fileURLToPath(new URL('../../../', import.meta.url));
const circuitsDir = path.join(rootDir, 'scripts', 'circuits');

interface Figure {
  id: string;
  lesson: string;
  textbook_page: number;
  title: string;
  parts: { part: string; pins: Record<string, number> }[];
  caption: string;
  alt: string;
  notes?: string[];
  image?: { file: string; width: number; height: number; bytes: number; sha256: string; png_sha256: string };
}

const list = readFigureList() as { figures: Figure[]; undrawable: { lesson: string; part: string; pins: Record<string, number>; reason: string }[]; caption_note: string; tool: { board: string } };
const figures = list.figures;

/** 보드 핀 id → GPIO 번호(G·V는 null). */
function gpioOfBoardPin(pin: string): number | null {
  const found = BOARD_PINS.find(([, column, row]) => `${columnPrefix(column)}-${row}` === pin);
  return found ? (found[0] as number) : null;
}

describe('회로 그림 목록(circuits.yaml)', () => {
  it('보드는 ESP32 실드 V3(board-003)이고 캡션 고정 문장이 정해진 그대로다', () => {
    expect(list.tool.board).toBe('board-003');
    expect(BOARD.toolId).toBe('board-003');
    expect(list.caption_note).toBe('브릭셀 회로 구성 도구로 그린 배선(ESP32 실드 V3). 교과서 사진의 보드와 모양이 달라도 같은 번호 핀에 꽂아요.');
  });

  it('id가 겹치지 않고 "<차시>-<번호>" 꼴이며, 한 그림마다 쪽·부품·캡션·대체 글이 있다', () => {
    const ids = figures.map((figure) => figure.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const figure of figures) {
      expect(figure.id, figure.id).toMatch(/^\d-\d-\d-\d+$/);
      expect(figure.id.startsWith(`${figure.lesson}-`), `${figure.id}의 차시`).toBe(true);
      expect(Number.isInteger(figure.textbook_page), `${figure.id} 교과서 쪽`).toBe(true);
      expect(figure.parts.length, `${figure.id} 부품`).toBeGreaterThan(0);
      expect(figure.title.length, `${figure.id} 제목`).toBeGreaterThan(0);
      for (const text of [figure.caption, figure.alt]) {
        expect(text.endsWith('요.'), `${figure.id}: "~요."로 끝나야 해요 — ${text}`).toBe(true);
      }
      expect(figure.alt, `${figure.id}: 대체 글에 위치 낱말(왼쪽·오른쪽)을 쓰지 않아요`).not.toMatch(/왼쪽|오른쪽/);
      expect(figure.alt.startsWith('ESP32 실드 V3 보드'), `${figure.id} 대체 글 머리`).toBe(true);
    }
  });

  it('부품 이름과 핀 이름이 모두 도구 표(catalog)에 있다', () => {
    for (const figure of figures) {
      for (const spec of figure.parts) {
        const def = (PARTS as Record<string, { roles: Record<string, string> }>)[spec.part];
        expect(def, `${figure.id}: 모르는 부품 ${spec.part}`).toBeTruthy();
        for (const role of Object.keys(spec.pins)) {
          expect(Object.keys(def.roles), `${figure.id} ${spec.part}의 핀 이름 ${role}`).toContain(role);
        }
        expect(Object.keys(spec.pins).sort(), `${figure.id} ${spec.part}는 핀을 빠짐없이 적어요`).toEqual(Object.keys(def.roles).sort());
      }
    }
  });

  it('그리는 모든 핀이 실드 V3에 있고, 없는 핀(GPIO 2)은 undrawable에만 있다', () => {
    for (const figure of figures) {
      expect(undrawablePins(figure), figure.id).toEqual([]);
    }
    expect(list.undrawable.length).toBeGreaterThan(0);
    for (const item of list.undrawable) {
      const gpios = Object.values(item.pins);
      for (const gpio of gpios) {
        expect(BOARD_PINS.some(([g]) => g === gpio), `undrawable ${item.part} ${gpio}번은 실드에 없어야 해요`).toBe(false);
      }
      expect(item.reason).toBe('그릴 수 없음(V3에 2번 열 없음)');
    }
  });

  it('출판본 코드의 핀을 따른다(결정 C137) — 확인된 차시들', () => {
    const find = (id: string) => figures.find((figure) => figure.id === id)!;
    const pinsOf = (id: string, part: string) => find(id).parts.filter((spec) => spec.part === part).map((spec) => spec.pins);
    // 3-1-2: UART(2, tx=16, rx=17) → 변환기 TX는 보드 RX(17번)로, 변환기 RX는 보드 TX(16번)로
    expect(pinsOf('3-1-2-1', 'uart-converter')).toEqual([{ converter_tx: 17, converter_rx: 16 }]);
    expect(pinsOf('3-1-2-1', 'laser')).toEqual([{ pin: 18 }]);
    // 2-2-2: UART(2, tx=Pin(17), rx=Pin(16)) → 모듈 TX는 보드 RX(16번)로, 모듈 RX는 보드 TX(17번)에서
    expect(pinsOf('2-2-2-1', 'mp3')).toEqual([{ module_tx: 16, module_rx: 17 }]);
    expect(pinsOf('2-2-2-2', 'touch-analog-4ch')).toEqual([{ pin: 32 }]);
    expect(pinsOf('2-1-3-3', 'rgb-led')).toEqual([{ r: 12, g: 5, b: 4 }]);
    expect(pinsOf('2-1-4-1', 'rgb-led')).toEqual([{ r: 27, g: 32, b: 33 }]);
    expect(pinsOf('2-2-1-1', 'buzzer')).toEqual([{ pin: 15 }]);
    expect(pinsOf('2-2-3-1', 'fan-motor')).toEqual([{ ina: 25, inb: 26 }]);
    expect(pinsOf('2-2-4-2', 'servo')).toEqual([{ pin: 25 }, { pin: 26 }]);
    expect(pinsOf('3-1-3-1', 'rgb-led')).toEqual([{ r: 25, g: 26, b: 27 }]);
    expect(pinsOf('4-2-2-2', 'laser')).toEqual([{ pin: 18 }]);
  });

  it('4-2-2는 두 장으로 나뉘고, 한 장에 부품이 셋을 넘지 않는다', () => {
    expect(figures.filter((figure) => figure.lesson === '4-2-2').map((figure) => figure.id)).toEqual(['4-2-2-1', '4-2-2-2']);
    for (const figure of figures) {
      expect(figure.parts.length, figure.id).toBeLessThanOrEqual(3);
    }
  });
});

describe('.circuit 파일', () => {
  it('목록의 모든 그림에 .circuit이 있고, 목록에서 다시 만든 것과 글자까지 같다(손으로 고쳤으면 목록도 고쳐요)', () => {
    for (const figure of figures) {
      const file = path.join(circuitsDir, `${figure.id}.circuit`);
      expect(fs.existsSync(file), `${figure.id}.circuit이 없어요(npm run circuits:build)`).toBe(true);
      expect(fs.readFileSync(file, 'utf8'), `${figure.id}.circuit이 목록과 달라요(npm run circuits:build)`).toBe(circuitText(figure));
    }
  });

  it('목록에 없는 .circuit 파일이 없다', () => {
    const files = fs.readdirSync(circuitsDir).filter((name) => name.endsWith('.circuit')).map((name) => name.replace(/\.circuit$/, ''));
    expect(files.sort()).toEqual(figures.map((figure) => figure.id).sort());
  });

  it('도구가 읽는 모양이다: 부품 id·선 끝이 모두 있고 줄 끝은 LF', () => {
    const known = new Set<string>([BOARD.toolId, ...Object.values(PARTS).map((def) => (def as { toolId: string }).toolId), ...Object.values(COMPANIONS).map((def) => def.toolId)]);
    const columnIds = new Set<string>(COLUMNS as readonly string[]);
    for (const figure of figures) {
      const text = fs.readFileSync(path.join(circuitsDir, `${figure.id}.circuit`), 'utf8');
      expect(text.includes('\r'), `${figure.id} 줄 끝`).toBe(false);
      const circuit = JSON.parse(text);
      expect(circuit.version).toBe('1.0');
      const ids = circuit.components.map((component: { id: string }) => component.id);
      expect(new Set(ids).size, `${figure.id} 부품 id`).toBe(ids.length);
      for (const component of circuit.components) {
        expect(known.has(component.partId), `${figure.id}: 모르는 부품 ${component.partId}`).toBe(true);
        expect(component.rotation).toBe(0);
        expect(Number.isFinite(component.x) && Number.isFinite(component.y)).toBe(true);
      }
      for (const wire of circuit.wires) {
        expect(ids, `${figure.id} 선의 시작 부품`).toContain(wire.fromCompId);
        expect(ids, `${figure.id} 선의 끝 부품`).toContain(wire.toCompId);
        const boardEnd = wire.fromCompId.startsWith('board-003') ? wire.fromPin : null;
        if (boardEnd) {
          const match = /^ESP-([LCR])-([LCR]\d)-(G|V|S|S2|S3)$/.exec(boardEnd);
          expect(match, `${figure.id}: 보드 핀 이름 ${boardEnd}`).toBeTruthy();
          expect(columnIds.has(match![2]), `${figure.id}: 없는 열 ${boardEnd}`).toBe(true);
          if (match![3] !== 'G' && match![3] !== 'V') {
            expect(gpioOfBoardPin(boardEnd), `${figure.id}: 실드에 없는 핀 ${boardEnd}`).not.toBeNull();
          }
        }
        expect(['black', 'red', '#FACC15']).toContain(wire.color);
      }
    }
  });

  it('선이 이어진 보드 핀의 GPIO 번호가 목록에 적은 핀 번호와 정확히 같다(그림이 코드와 맞는지)', () => {
    for (const figure of figures) {
      const circuit = JSON.parse(fs.readFileSync(path.join(circuitsDir, `${figure.id}.circuit`), 'utf8'));
      // 같은 부품 이름이 둘이면(서보 둘) 차례대로 풀어 본다 — 부품 칸은 위에서 아래, 연결한 열이 왼쪽인 것부터.
      const usedByPart = new Map<string, number>();
      for (const spec of figure.parts) {
        const def = (PARTS as Record<string, { toolId: string; roles: Record<string, string> }>)[spec.part];
        const candidates = circuit.components.filter((component: { partId: string }) => component.partId === def.toolId);
        const gpiosWanted = Object.entries(spec.pins).map(([role, gpio]) => ({ row: def.roles[role], gpio }));
        const match = candidates.find((component: { id: string }) => {
          if (usedByPart.has(component.id)) {
            return false;
          }
          return gpiosWanted.every(({ row, gpio }) => {
            const wire = circuit.wires.find((w: { toCompId: string; toPin: string }) => w.toCompId === component.id && w.toPin === `${def.toolId}-${row}`);
            return wire && gpioOfBoardPin(wire.fromPin) === gpio;
          });
        });
        expect(match, `${figure.id}: ${spec.part} ${JSON.stringify(spec.pins)}에 맞는 선이 없어요`).toBeTruthy();
        usedByPart.set(match.id, 1);
      }
      // 부품 수와 선의 신호 수도 같아야 한다(없는 부품·남는 선이 없게)
      const speakers = figure.parts.filter((spec) => (PARTS as Record<string, { companion?: string }>)[spec.part].companion).length;
      expect(circuit.components.length, `${figure.id} 부품 수`).toBe(1 + figure.parts.length + speakers);
    }
  });

  it('같은 보드 신호 핀(GPIO 번호가 든 한 점)에 선이 둘 이상 가지 않는다', () => {
    for (const figure of figures) {
      const circuit = JSON.parse(fs.readFileSync(path.join(circuitsDir, `${figure.id}.circuit`), 'utf8'));
      const signalPins = circuit.wires.filter((w: { fromCompId: string; color: string }) => w.fromCompId.startsWith('board-003') && w.color === '#FACC15').map((w: { fromPin: string }) => w.fromPin);
      expect(new Set(signalPins).size, `${figure.id}: 한 핀에 선이 겹쳐요`).toBe(signalPins.length);
    }
  });

  it('부품 그림이 서로 겹치지 않고(스피커 포함), 보드와도 겹치지 않는다', () => {
    const sizeOf = (partId: string) => {
      if (partId === BOARD.toolId) {
        return { width: BOARD.width, height: boardHeight() };
      }
      const def = Object.values(PARTS).find((item) => (item as { toolId: string }).toolId === partId) ?? Object.values(COMPANIONS).find((item) => item.toolId === partId);
      return partSize(def as Parameters<typeof partSize>[0]);
    };
    for (const figure of figures) {
      const circuit = JSON.parse(fs.readFileSync(path.join(circuitsDir, `${figure.id}.circuit`), 'utf8'));
      const boxes = circuit.components.map((component: { id: string; partId: string; x: number; y: number }) => {
        const size = sizeOf(component.partId);
        return { id: component.id, left: component.x - size.width / 2, right: component.x + size.width / 2, top: component.y - size.height / 2, bottom: component.y + size.height / 2 };
      });
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          const a = boxes[i];
          const b = boxes[j];
          const overlap = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
          expect(overlap, `${figure.id}: ${a.id}와 ${b.id}가 겹쳐요`).toBe(false);
        }
      }
      const bounds = circuitBounds(circuit);
      expect(bounds.left, `${figure.id} 왼쪽 여백`).toBeGreaterThanOrEqual(0);
      expect(bounds.top, `${figure.id} 위쪽 여백`).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('부품 잇기 규칙(connectPart)', () => {
  const connect = (part: string, pins: Record<string, number>) => connectPart((PARTS as unknown as Record<string, Parameters<typeof connectPart>[0]>)[part], pins) as { signals: { column: string; row: string; gpio: number }[]; powerColumn: string; plug: boolean; missing?: number[] };

  it('신호가 여럿이고 한 열의 S·S2·S3가 정확히 그 번호면 그 열에 그대로 꽂는다(RGB 27·32·33 → C7, I2C 21·22 → 5V I2C 열, 팬 25·26 → C5)', () => {
    expect(connect('rgb-led', { r: 27, g: 32, b: 33 })).toMatchObject({ plug: true, powerColumn: 'C7' });
    expect(connect('rgb-led', { r: 25, g: 26, b: 27 })).toMatchObject({ plug: true, powerColumn: 'C5' });
    expect(connect('lcd-i2c', { sda: 21, scl: 22 })).toMatchObject({ plug: true, powerColumn: 'C1' });
    expect(connect('oled-i2c', { sda: 21, scl: 22 })).toMatchObject({ plug: true, powerColumn: 'C0' });
    expect(connect('fan-motor', { ina: 25, inb: 26 })).toMatchObject({ plug: true, powerColumn: 'C5' });
    expect(connect('mp3', { module_tx: 16, module_rx: 17 })).toMatchObject({ plug: true, powerColumn: 'L6' });
  });

  it('RGB 12·5·4는 한 열에 없어서 핀마다 따로 이어진다', () => {
    const result = connect('rgb-led', { r: 12, g: 5, b: 4 });
    expect(result.plug).toBe(false);
    expect(result.signals.map((signal) => signal.gpio)).toEqual([12, 5, 4]);
  });

  it('3핀 부품은 S 행에만 꽂는다(서보 26번은 C6, 25번은 C5)', () => {
    expect(connect('servo', { pin: 25 }).signals[0]).toMatchObject({ column: 'C5', row: 'S' });
    expect(connect('servo', { pin: 26 }).signals[0]).toMatchObject({ column: 'C6', row: 'S' });
  });

  it('UART 변환기는 엇갈려 잇는다(변환기 TX가 17번 줄, RX가 16번 줄)', () => {
    const result = connect('uart-converter', { converter_tx: 17, converter_rx: 16 });
    expect(result.signals.map((signal) => signal.gpio)).toEqual([17, 16]);
    expect(result.plug).toBe(false);
  });

  it('GPIO 2는 실드 V3에 없어 못 그린다', () => {
    expect(connect('buzzer', { pin: 2 }).missing).toEqual([2]);
    expect(() => buildCircuit({ parts: [{ part: 'buzzer', pins: { pin: 2 } }] })).toThrow(/실드 V3에 없는 핀 2번/);
  });
});

describe('들이기(import-circuits) — 투명 여백 자르기', () => {
  it('투명하지 않은 부분의 바깥 상자만 찾는다', () => {
    const width = 6;
    const height = 5;
    const data = new Uint8Array(width * height * 4);
    data[(2 * width + 3) * 4 + 3] = 255; // (3, 2)
    data[(3 * width + 1) * 4 + 3] = 100; // (1, 3)
    expect(findContentBox(data, width, height)).toEqual({ left: 1, top: 2, width: 3, height: 2 });
    expect(findContentBox(new Uint8Array(width * height * 4), width, height)).toBeNull();
  });

  it('PNG를 자르고 사방에 여백 16px을 두른 투명 WebP로 바꾼다(흰 바탕 없음)', async () => {
    const sharp = (await import('sharp')).default;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'circuits-test-'));
    try {
      const png = path.join(dir, 'x.png');
      const box = await sharp({ create: { width: 500, height: 300, channels: 4, background: { r: 200, g: 30, b: 30, alpha: 1 } } }).png().toBuffer();
      await sharp({ create: { width: 1400, height: 1000, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite([{ input: box, left: 300, top: 200 }])
        .png()
        .toFile(png);
      const result = await convertPng(sharp, png, { margin: 16, quality: 90 });
      expect(result.width).toBe(532);
      expect(result.height).toBe(332);
      const { data, info } = await sharp(result.buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      expect(info.channels).toBe(4);
      expect(data[3]).toBe(0); // 왼쪽 위 모서리는 투명
      const center = ((166 * info.width) + 266) * 4;
      expect(data[center + 3]).toBe(255); // 가운데는 칠해짐
      expect(crypto.createHash('sha256').update(result.buffer).digest('hex')).toHaveLength(64);

      // 배경이 칠해진 PNG는 막는다
      const filled = path.join(dir, 'filled.png');
      await sharp({ create: { width: 800, height: 600, channels: 4, background: { r: 248, g: 250, b: 252, alpha: 1 } } }).png().toFile(filled);
      await expect(convertPng(sharp, filled, { margin: 16, quality: 90 })).rejects.toThrow(/배경이 투명하지 않아요/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('circuits.yaml의 image 기록이 있으면 파일과 sha256이 같다', () => {
    const doc = YAML.parse(fs.readFileSync(path.join(circuitsDir, 'circuits.yaml'), 'utf8')) as { figures: Figure[] };
    for (const figure of doc.figures) {
      if (!figure.image) {
        continue;
      }
      const file = path.resolve(rootDir, figure.image.file);
      expect(fs.existsSync(file), `${figure.id} WebP`).toBe(true);
      const buffer = fs.readFileSync(file);
      expect(crypto.createHash('sha256').update(buffer).digest('hex'), `${figure.id} sha256`).toBe(figure.image.sha256);
      expect(buffer.length).toBe(figure.image.bytes);
    }
  });
});
