// 키트 장치 도감 쪽(판 1.5.0 구역 K3b)의 순수 함수와 진짜 데이터 대조 — src/components/kit/kit-schema.ts·kit-view.ts·kit-sidebar.ts.
// 장치 101개마다 쪽에 필요한 것(부품 사진·회로 그림·코드 파일·배선 줄)이 모두 있는지, 주소·이전/다음·장 묶음·연결 방식 말이 맞는지 본다.
// 자료 자체의 짜임(예제 사이드카·라이브러리·분류 수)은 K1의 kit-devices-data.test.ts가 맡는다. 화면은 tests/e2e/kit.spec.ts.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { KIT_CIRCUIT_DIR, KIT_FILE, KitFormatError, parseKitYaml, type KitData } from '../../../src/components/kit/kit-schema.ts';
import { kitNavScrollTop, kitSidebarOutline } from '../../../src/components/kit/kit-sidebar.ts';
import {
  CIRCUIT_COLOR_LEGEND,
  KIT_CHAPTER_DESCRIPTIONS,
  KIT_VIRTUAL_INFO,
  LCD_NEEDED,
  KIT_VIRTUAL_ORDER,
  chapterAnchor,
  chapterGroups,
  circuitAlt,
  circuitCaption,
  circuitHref,
  connectionLabel,
  connectionShort,
  deviceConnectionLabel,
  deviceIndexByPart,
  deviceNeedsLcd,
  deviceNeighbors,
  deviceTitle,
  devicesForPart,
  fileNameOf,
  kitCodeLines,
  kitDeviceHref,
  kitDevicePath,
  kitIndexHref,
  knownConnectionTexts,
  partNumberOf,
  pinNameHint,
  pinsLabel,
  splitWiring,
  stepLabHref,
  usesLcd,
} from '../../../src/components/kit/kit-view.ts';
import { isIconName } from '../../../src/components/common/icons.ts';
import { PARTS_FILE, parsePartsYaml } from '../../../src/components/parts/parts-schema.ts';
import { readWebpInfo } from '../../../src/components/parts/webp-info.ts';
import { getPage } from '../../../src/config/nav.ts';

const root = process.cwd();
const data: KitData = parseKitYaml(fs.readFileSync(path.join(root, KIT_FILE), 'utf8'));
const parts = parsePartsYaml(fs.readFileSync(path.join(root, PARTS_FILE), 'utf8'));
const partIds = new Set(parts.map((part) => part.id));

describe('parseKitYaml — 진짜 데이터', () => {
  it('장치 101개·장 이름표 1~8장·1장 시작하기 코드가 읽힌다', () => {
    expect(data.devices).toHaveLength(101);
    expect(data.chapters.map((chapter) => chapter.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(data.intro.length).toBeGreaterThan(0);
    expect(data.source.url).toMatch(/^https:\/\/brixel\.gorillacell\.kr\//u);
  });
});

describe('parseKitYaml — 잘못된 데이터는 한국어 문제 목록으로 멈춘다', () => {
  const base = fs.readFileSync(path.join(root, KIT_FILE), 'utf8');

  it('YAML 문법이 틀리면 한국어로 알린다', () => {
    expect(() => parseKitYaml('devices: [\n  - id: x', KIT_FILE)).toThrow(/YAML로 읽지 못했어요/u);
  });

  it('최상위 칸이 빠지면 알린다', () => {
    expect(() => parseKitYaml('devices: []\n')).toThrow(KitFormatError);
  });

  it('id가 번호·장과 맞지 않거나 겹치거나 모양이 틀리면 모두 모아 알린다', () => {
    const broken = base
      .replace('id: d-2-01\n    number: "2.01"', 'id: d-2-01\n    number: "2.99"')
      .replace('id: d-2-02', 'id: d-2-01')
      .replace('id: d-3-01', 'id: x-3-01');
    let problems: readonly string[] = [];
    try {
      parseKitYaml(broken);
    } catch (error) {
      expect(error).toBeInstanceOf(KitFormatError);
      problems = (error as KitFormatError).problems;
    }
    expect(problems.some((line) => line.includes('d-2-01') && line.includes('맞지 않아요'))).toBe(true);
    expect(problems.some((line) => line.includes('id가 겹쳐요'))).toBe(true);
    expect(problems.some((line) => line.includes('x-3-01'))).toBe(true);
  });

  it('가상 보드에서 끝까지 되지 않는 장치에 까닭이 없으면 알린다', () => {
    const broken = base.replace(/(\n {4}virtual: real-only)\n {4}virtual_reason: .*(\n {2}- id: d-3-12)/u, '$1$2');
    expect(broken).not.toBe(base);
    expect(() => parseKitYaml(broken)).toThrow(/virtual_reason/u);
  });
});

describe('장치 101개마다 쪽에 필요한 것이 있다', () => {
  it('부품 사진(대표·같은 코드로 도는 다른 모양)이 부품 사전에 있다', () => {
    for (const device of data.devices) {
      expect(partIds.has(device.part), `${device.id}의 부품 사진 ${device.part}`).toBe(true);
      for (const variant of device.partVariants) {
        expect(partIds.has(variant.part), `${device.id}의 다른 모양 ${variant.part}`).toBe(true);
        expect(variant.label.length, `${device.id} 다른 모양 이름`).toBeGreaterThan(0);
      }
    }
  });

  it('회로 그림이 올바른 WebP로 읽힌다(쪽이 가로·세로를 파일에서 읽는다)', () => {
    for (const device of data.devices) {
      const bytes = fs.readFileSync(path.join(root, KIT_CIRCUIT_DIR, device.circuit));
      const info = readWebpInfo(new Uint8Array(bytes));
      expect(info, `${device.id}의 회로 그림 ${device.circuit}`).not.toBeNull();
      expect(info!.width, device.circuit).toBeGreaterThan(0);
      expect(info!.height, device.circuit).toBeGreaterThan(0);
    }
  });

  it('코드 파일이 모두 있고 줄로 읽히며, 단계는 1단계·2단계다', () => {
    for (const device of data.devices) {
      expect(device.steps.map((step) => step.n), device.id).toEqual([1, 2]);
      for (const step of device.steps) {
        const file = path.join(root, 'examples', ...step.file.split('/'));
        expect(fs.existsSync(file), `${device.id} ${step.n}단계 ${step.file}`).toBe(true);
        const lines = kitCodeLines(fs.readFileSync(file, 'utf8'));
        expect(lines.length, step.file).toBeGreaterThan(3);
        expect(lines.join('\n').includes('\r'), step.file).toBe(false);
      }
    }
  });

  it('배선 줄은 모두 "장치 핀 → 보드 핀" 두 칸으로 나뉜다', () => {
    for (const device of data.devices) {
      expect(device.wiring.length, device.id).toBeGreaterThan(0);
      for (const line of device.wiring) {
        const row = splitWiring(line);
        expect(row.device, `${device.id}: ${line}`).not.toBe('');
        expect(row.board, `${device.id}: ${line}`).not.toBe('');
      }
    }
  });

  it('연결 방식 글은 모두 학생 말 표에 있다(새 글이 생기면 kit-view.ts CONNECTION_LABELS에 더해요)', () => {
    const known = new Set(knownConnectionTexts());
    for (const device of data.devices) {
      expect(known.has(device.interface.trim()), `${device.id}의 연결 방식 "${device.interface}"`).toBe(true);
      expect(connectionLabel(device.interface), device.id).not.toBe(device.interface);
    }
  });

  it('쪽 제목·회로 그림 설명이 장치 번호·이름과 모든 배선 줄을 담는다', () => {
    for (const device of data.devices) {
      expect(deviceTitle(device)).toBe(`${device.number} ${device.name}`);
      const alt = circuitAlt(device);
      expect(alt.startsWith(`${device.number} ${device.name} 회로 그림. 연결: `), device.id).toBe(true);
      for (const line of device.wiring) {
        expect(alt, device.id).toContain(splitWiring(line).board);
      }
      expect(circuitCaption(device)).toContain(device.number);
    }
  });
});

describe('주소', () => {
  it('장치 쪽은 /labs/esp32/kit/<id>/ 이고 도감 첫 쪽은 사이트 지도의 주소와 같다', () => {
    expect(kitDevicePath('d-3-11')).toBe('labs/esp32/kit/d-3-11/');
    expect(kitDeviceHref('d-3-11')).toBe('/ai-physical-computing/labs/esp32/kit/d-3-11/');
    expect(kitIndexHref()).toBe(getPage('labs-esp32-kit').href);
    expect(kitIndexHref(3)).toBe(`${getPage('labs-esp32-kit').href}#ch-3`);
    expect(chapterAnchor(8)).toBe('ch-8');
  });

  it('회로 그림 주소에는 base가 붙고, [실습실에서 열기]는 차시와 같은 ?example= 규칙이다', () => {
    const device = data.devices.find((candidate) => candidate.id === 'd-3-11')!;
    expect(circuitHref(device)).toBe('/ai-physical-computing/images/kit/circuits/third-party/kit-vendor/d-3-11.webp');
    expect(stepLabHref('esp32/kit/ch3/3-11-ultrasonic-1.py')).toBe(
      `${getPage('labs-esp32').href}?example=${encodeURIComponent('esp32/kit/ch3/3-11-ultrasonic-1.py')}`,
    );
  });

  it('장치 쪽 주소는 장치마다 다르다', () => {
    expect(new Set(data.devices.map((device) => kitDeviceHref(device.id))).size).toBe(data.devices.length);
  });
});

describe('장 묶음·이전/다음', () => {
  it('2~8장이 차례대로 묶이고 장마다 소개 한 줄이 있다(1장은 소개가 따로 있다)', () => {
    const groups = chapterGroups(data);
    expect(groups.map((group) => group.chapter.n)).toEqual([2, 3, 4, 5, 6, 7, 8]);
    expect(groups.reduce((sum, group) => sum + group.devices.length, 0)).toBe(101);
    for (const group of groups) {
      expect(group.description.length, `${group.chapter.n}장 소개`).toBeGreaterThan(10);
      expect(group.devices.every((device) => device.chapter === group.chapter.n)).toBe(true);
    }
    expect(KIT_CHAPTER_DESCRIPTIONS[1]).toBeTruthy();
  });

  it('이전·다음 장치는 장을 넘어 이어지고 처음·끝은 한쪽만 있다', () => {
    const { devices } = data;
    expect(deviceNeighbors(devices, devices[0]!.id)).toEqual({ next: devices[1] });
    expect(deviceNeighbors(devices, devices[devices.length - 1]!.id)).toEqual({ previous: devices[devices.length - 2] });
    expect(deviceNeighbors(devices, 'd-3-01').previous?.id).toBe('d-2-14');
    expect(deviceNeighbors(devices, 'd-3-01').next?.id).toBe('d-3-02');
    expect(deviceNeighbors(devices, 'd-9-99')).toEqual({});
  });
});

describe('부품 사전 연결', () => {
  it('부품 사진 id로 그 사진을 쓰는 장치를 찾는다(대표 사진·다른 모양 모두, 하나가 여러 장치에 이어질 수 있다)', () => {
    expect(devicesForPart(data.devices, 'd-009-ultrasonic-sensor-v2').map((device) => device.id)).toEqual(['d-3-11']);
    // LED 노랑·파랑·초록 사진은 2.01 LED 쪽으로
    expect(devicesForPart(data.devices, 'dis-005-led-yellow').map((device) => device.id)).toEqual(['d-2-01']);
    // JDY-33 한 사진은 8.05와 8.06이 함께 쓴다
    expect(devicesForPart(data.devices, 'c-001-bluetooth-4-0-jdy33').map((device) => device.id)).toEqual(['d-8-05', 'd-8-06']);
    expect(devicesForPart(data.devices, 'no-such-part')).toEqual([]);
  });

  it('색인은 장치마다 한 번씩만 들어 있고 대표 사진 id로 모든 장치가 찾힌다', () => {
    const index = deviceIndexByPart(data.devices);
    for (const device of data.devices) {
      expect(index.get(device.part), device.id).toContain(device);
    }
    for (const list of index.values()) {
      expect(new Set(list).size).toBe(list.length);
    }
  });

  it('부품 번호는 사진 id의 앞 두 토막이다', () => {
    expect(partNumberOf('d-009-ultrasonic-sensor-v2')).toBe('d-009');
    expect(partNumberOf('dis-004-led-red')).toBe('dis-004');
  });
});

describe('글 만들기', () => {
  it('연결 방식은 학생 말로, 카드에서는 괄호 풀이 없이', () => {
    expect(connectionLabel('Digital / PWM')).toBe('디지털 / PWM(밝기·세기 조절)');
    expect(connectionShort('Digital / PWM')).toBe('디지털 / PWM');
    expect(connectionShort('I2C (주소 0x63, 100kHz)')).toBe('I2C 통신');
    // 모르는 글은 그대로
    expect(connectionLabel('Bluetooth LE')).toBe('Bluetooth LE');
  });

  it('장치 쪽 연결 방식: 브릭셀 글이 그냥 "Digital"이고 부품 사전 글이 "디지털"로 시작하면 부품 사전 글을 쓴다(초음파 센서 TRIG·ECHO)', () => {
    expect(deviceConnectionLabel('Digital', '디지털 입출력(TRIG 보내기·ECHO 받기)')).toBe('디지털 입출력(TRIG 보내기·ECHO 받기)');
    // 부품 사전 글이 없거나 디지털이 아니면, PWM·I2C 같은 다른 글은 학생 말 표(connectionLabel) 그대로
    expect(deviceConnectionLabel('Digital')).toBe('디지털(켜짐·꺼짐)');
    expect(deviceConnectionLabel('Digital', '아날로그 입력(ADC)')).toBe('디지털(켜짐·꺼짐)');
    expect(deviceConnectionLabel('Digital / PWM', '디지털 출력')).toBe('디지털 / PWM(밝기·세기 조절)');
    expect(deviceConnectionLabel('Serial I2C', 'I2C')).toBe('I2C 통신(선 두 개로 통신)');
  });

  it('진짜 데이터: 3.11 초음파 센서의 연결 방식이 부품 사전과 같은 말이다', () => {
    const sonar = data.devices.find((device) => device.id === 'd-3-11')!;
    const part = parts.find((candidate) => candidate.id === sonar.part)!;
    expect(deviceConnectionLabel(sonar.interface, part.connection)).toBe(part.connection);
    expect(part.connection).toContain('TRIG');
  });

  it('핀 수 글은 "N pins"를 "핀 N개"로 바꾼다', () => {
    expect(pinsLabel('3 pins (G, V, S)')).toBe('핀 3개 (G, V, S)');
    expect(pinsLabel('3 pins (G, V, S) + 프로브 2 pins')).toBe('핀 3개 (G, V, S) + 프로브 핀 2개');
    expect(pinsLabel('1 pin')).toBe('핀 1개');
  });

  it('배선 줄은 화살표로 나누고, 화살표가 없으면 보드 칸에만 둔다', () => {
    expect(splitWiring('LCD SDA → GPIO 21')).toEqual({ device: 'LCD SDA', board: 'GPIO 21' });
    expect(splitWiring('GPIO 4')).toEqual({ device: '', board: 'GPIO 4' });
    expect(circuitAlt({ number: '2.01', name: 'LED', wiring: ['G → GND', 'S → GPIO 4'] })).toBe('2.01 LED 회로 그림. 연결: G는 GND, S는 GPIO 4.');
  });

  it('핀 이름 풀이는 G·V·S, GND·VCC가 있을 때만 하고 틀릴 수 있는 풀이는 하지 않는다', () => {
    expect(pinNameHint('3 pins (G, V, S)')).toBe('G는 접지(GND), V는 전원, S는 신호선이에요.');
    expect(pinNameHint('4 pins (GND, VCC, ECHO, TRIG)')).toBe('GND는 접지, VCC는 전원이에요.');
    expect(pinNameHint('4 pins (G, V, SDA, SCL)')).toBe('G는 접지(GND), V는 전원이에요.');
    expect(pinNameHint('4 pins (TX, RX)')).toBeUndefined();
    expect(pinNameHint('핀 정보 없음')).toBeUndefined();
  });

  it('가상 보드 표시는 세 가지이고 모두 글자·풀이·진짜 아이콘 이름이 있다', () => {
    expect(KIT_VIRTUAL_ORDER).toEqual(['full', 'partial', 'real-only']);
    for (const value of KIT_VIRTUAL_ORDER) {
      const info = KIT_VIRTUAL_INFO[value];
      expect(info.value).toBe(value);
      expect(info.label.length).toBeGreaterThan(2);
      expect(info.explain.length).toBeGreaterThan(10);
      expect(isIconName(info.icon), `${value} 아이콘`).toBe(true);
    }
    expect(new Set(KIT_VIRTUAL_ORDER.map((value) => KIT_VIRTUAL_INFO[value].icon)).size).toBe(3);
  });
});

describe('왼쪽 장치 목록(kitSidebarOutline)', () => {
  const device = data.devices.find((candidate) => candidate.id === 'd-3-11')!;
  const outline = kitSidebarOutline(data, device);

  it('도감 첫 쪽 → 지금 장의 장치 전부 → 다른 장 순서이고, 지금 장치를 가리킨다', () => {
    expect(outline.groups.map((group) => group.key)).toEqual(['kit-index', 'kit-ch-3', 'kit-others']);
    expect(outline.currentId).toBe('d-3-11');
    const chapter = outline.groups[1]!;
    expect(chapter.title).toBe('3장 디지털 센서');
    expect(chapter.items).toHaveLength(21);
    expect(chapter.items.map((item) => item.id)).toContain('d-3-11');
    expect(chapter.items[0]).toMatchObject({ id: 'd-3-01', label: '3.01', href: kitDeviceHref('d-3-01') });
    const others = outline.groups[2]!;
    expect(others.items.map((item) => item.label)).toEqual(['1장', '2장', '4장', '5장', '6장', '7장', '8장']);
    expect(others.items[0]!.href).toBe(kitIndexHref(1));
  });

  it('진도 표시는 없고 목록 이름·단원 색이 정해져 있다', () => {
    expect(outline.showProgress).toBe(false);
    expect(outline.navLabel).toBe('키트 장치 목록');
    expect(outline.titleHref).toBe(kitIndexHref());
    expect(outline.unit).toBe(2);
    expect(outline.groups.flatMap((group) => group.items).every((item) => item.progressId === undefined)).toBe(true);
  });

  it('1장 시작하기 코드가 없으면 다른 장 목록에서 1장을 뺀다', () => {
    const without = kitSidebarOutline({ ...data, intro: [] }, device);
    expect(without.groups[2]!.items.map((item) => item.label)).not.toContain('1장');
  });
});

describe('장치 목록의 처음 스크롤 위치(kitNavScrollTop — 판 1.7.0, 미해결 264 #20)', () => {
  const viewport = 600;

  it('지금 장치가 처음 한 화면 안이면 맨 위부터 — 위가 잘리지 않는다', () => {
    expect(kitNavScrollTop({ groupTop: 90, currentTop: 200, currentBottom: 240, viewport })).toBe(0);
  });

  it('처음 한 화면 밖이어도 장 제목부터 지금 장치까지 한 화면에 들어오면 장 제목이 맨 위에 온다', () => {
    expect(kitNavScrollTop({ groupTop: 150, currentTop: 640, currentBottom: 680, viewport })).toBe(150);
  });

  it('장이 길어 그것도 안 되면 지금 장치가 위에서 40% 자리에 온다(위아래가 모두 이어져 보인다)', () => {
    expect(kitNavScrollTop({ groupTop: 150, currentTop: 1000, currentBottom: 1040, viewport })).toBe(760);
  });

  it('칸 높이를 모르면(접혀 있음) 0이고 음수는 나오지 않는다', () => {
    expect(kitNavScrollTop({ groupTop: 0, currentTop: 10, currentBottom: 40, viewport: 0 })).toBe(0);
    expect(kitNavScrollTop({ groupTop: -5, currentTop: 10, currentBottom: 900, viewport: 100 })).toBeGreaterThanOrEqual(0);
  });
});

describe('판 1.6.0 C176 — 키트 장치 쪽의 말과 이름(걷기 보고 walk-kit-user)', () => {
  it('"실제 보드에서" 딱지는 끝나는 문장("실제 보드에서 해 보세요")이다', () => {
    expect(KIT_VIRTUAL_INFO['real-only'].label).toBe('실제 보드에서 해 보세요');
    expect(KIT_VIRTUAL_INFO.full.label).toBe('가상 보드로 바로');
    expect(KIT_VIRTUAL_INFO.partial.label).toBe('일부만 가상');
  });

  it('코드가 I2cLcd를 쓰는지는 코드 글에서 판단한다(낱말 경계 — 이름이 비슷한 변수는 아니다)', () => {
    expect(usesLcd('from i2c_lcd import I2cLcd\nlcd = I2cLcd(i2c, 0x20, 2, 16)')).toBe(true);
    expect(usesLcd('lcd = I2cLcd(i2c, 0x27, 2, 16)')).toBe(true);
    expect(usesLcd('print("LCD 없이 글자만")')).toBe(false);
    expect(usesLcd('class MyI2cLcdFake: pass')).toBe(false);
  });

  it('"LCD도 필요해요"는 코드가 LCD를 쓰고 장치 자신이 LCD가 아닐 때만 — 장치 101개 가운데 64개', () => {
    expect(deviceNeedsLcd({ name: '초음파 센서 V2' }, [true, true])).toBe(true);
    expect(deviceNeedsLcd({ name: '초음파 센서 V2' }, [false, false])).toBe(false);
    expect(deviceNeedsLcd({ name: '문자 LCD 16×2(I2C)' }, [true, true])).toBe(false);
    expect(deviceNeedsLcd({ name: 'I2C 장치', brixelName: 'I2C LCD 디스플레이' }, [true])).toBe(false);
    const needing = data.devices.filter((device) => {
      const flags = device.steps.map((step) => usesLcd(fs.readFileSync(path.join(root, 'examples', step.file), 'utf8')));
      return deviceNeedsLcd(device, flags);
    });
    expect(needing).toHaveLength(63); // 64개가 LCD를 쓰고, 그 가운데 LCD 장치(2.05) 하나는 빠진다
    // LCD가 필요하다고 알리는 장치는 배선표에 LCD 줄이 있다 — "배선표의 LCD 줄이 꽂는 방법"이 맞아야 한다
    for (const device of needing) {
      expect(
        device.wiring.some((line) => line.includes('LCD')),
        `${device.id} 배선표의 LCD 줄`,
      ).toBe(true);
    }
    expect(LCD_NEEDED.title).toContain('LCD');
    expect(LCD_NEEDED.text).toContain('I2cLcd');
  });

  it('회로 그림 선 색 범례는 검정·빨강·노랑·초록을 글자로 말한다', () => {
    for (const word of ['검정', 'GND', '빨강', 'VCC', '노랑', '초록', '신호']) {
      expect(CIRCUIT_COLOR_LEGEND).toContain(word);
    }
  });

  it('코드 위에는 개발자 경로 대신 파일 이름만 보인다', () => {
    expect(fileNameOf('esp32/kit/ch3/3-11-ultrasonic-1.py')).toBe('3-11-ultrasonic-1.py');
    expect(fileNameOf('a.py')).toBe('a.py');
  });

  it('같은 부품을 부르는 이름은 하나: 장치 이름 = 부품 사전 이름(부품 사진 하나를 둘 이상의 장치가 쓸 때만 다르다), 원래 이름은 브릭셀 이름으로 남는다', () => {
    const byId = new Map(parts.map((part) => [part.id, part]));
    const counts = new Map<string, number>();
    for (const device of data.devices) {
      counts.set(device.part, (counts.get(device.part) ?? 0) + 1);
    }
    const shared: string[] = [];
    for (const device of data.devices) {
      const part = byId.get(device.part)!;
      if ((counts.get(device.part) ?? 0) > 1) {
        shared.push(device.id);
        continue;
      }
      expect(device.name, `${device.id}: 장치 이름이 부품 사전(${part.id}) 이름과 같아야 해요`).toBe(part.name);
      if (device.brixelName !== undefined) {
        expect(device.brixelName, `${device.id}: 브릭셀 이름은 이름과 달라야 해요`).not.toBe(device.name);
      }
    }
    expect(shared).toEqual(['d-8-05', 'd-8-06']);
    // 쪽 제목·부품 사전 카드가 같은 글자를 쓰도록 deviceTitle은 번호 + 이름이다
    const ultrasonic = data.devices.find((device) => device.id === 'd-3-11')!;
    expect(deviceTitle(ultrasonic)).toBe('3.11 초음파 센서 V2');
    expect(ultrasonic.brixelName).toBe('초음파 센서 (HC-SR04)');
  });

  it('예제 제목(실습실 목록·갤러리)도 같은 이름으로 시작한다: "<번호> <이름> — <단계 제목>"', () => {
    for (const device of data.devices) {
      for (const step of device.steps) {
        const sidecar = fs.readFileSync(path.join(root, 'examples', step.file.replace(/[.]py$/u, '.meta.yaml')), 'utf8');
        const title = /^title:\s*"?(.+?)"?\s*$/mu.exec(sidecar)?.[1] ?? '';
        expect(title.startsWith(`${device.number} ${device.name} — `), `${device.id} ${step.n}단계 제목 "${title}"`).toBe(true);
      }
    }
  });
});
