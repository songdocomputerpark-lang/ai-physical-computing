// 부품 사전 데이터 규칙(src/components/parts/parts-schema.ts) — 작은 가짜 데이터로 검사 규칙과 순수 함수를 본다.
// 진짜 데이터(content/parts/parts.yaml)와 사진 파일을 대조하는 검사는 parts-data.test.ts.
import { describe, expect, it } from 'vitest';
import {
  PART_CATEGORIES,
  PartsFormatError,
  groupPartsByCategory,
  parsePartsYaml,
  partCardHref,
  partForKitName,
  partPhotoAlt,
  partPhotoSrc,
  pickPartsForSiteParts,
  siteIdsOf,
} from '../../../src/components/parts/parts-schema.ts';

const LINE_A = '  - {id: d-007-ultrasonic-sensor, name: "초음파 센서", name_en: "Ultrasonic Sensor", category: digital-sensor, connection: "디지털 입출력"}';
const LINE_B =
  '  - {id: dis-001-i2c-1602-lcd, name: "문자 LCD", name_en: "I2C 1602 LCD", category: display, connection: "I2C", site_part: lcd-i2c, kit_name: "LCD(2x16)", note: "키트에 따라 모양이 다를 수 있어요."}';
const LINE_C =
  '  - {id: board-010-esp32, file: board-010-esp32.webp, name: "ESP32 개발 보드", name_en: "ESP32 Board", category: board, connection: "USB", site_part: [builtin-led, boot-button]}';

const yaml = (...lines: string[]): string => `parts:\n${lines.join('\n')}\n`;

function problemsOf(source: string): readonly string[] {
  try {
    parsePartsYaml(source, 'test.yaml');
  } catch (error) {
    if (error instanceof PartsFormatError) return error.problems;
    throw error;
  }
  return [];
}

describe('parsePartsYaml — 읽기', () => {
  it('칸을 읽고 file을 비우면 <id>.webp로 채우며 site_part는 하나든 목록이든 목록으로 읽는다', () => {
    const parts = parsePartsYaml(yaml(LINE_A, LINE_B, LINE_C));
    expect(parts).toHaveLength(3);
    expect(parts[0]).toEqual({
      id: 'd-007-ultrasonic-sensor',
      file: 'd-007-ultrasonic-sensor.webp',
      name: '초음파 센서',
      nameEn: 'Ultrasonic Sensor',
      category: 'digital-sensor',
      connection: '디지털 입출력',
      siteParts: [],
    });
    expect(parts[1]?.siteParts).toEqual(['lcd-i2c']);
    expect(parts[1]?.kitName).toBe('LCD(2x16)');
    expect(parts[1]?.note).toBe('키트에 따라 모양이 다를 수 있어요.');
    expect(parts[2]?.siteParts).toEqual(['builtin-led', 'boot-button']);
  });

  it('분류는 아홉 가지이고 id가 겹치지 않는다', () => {
    expect(PART_CATEGORIES.map((category) => category.id)).toEqual(['analog-sensor', 'digital-sensor', 'display', 'motor', 'i2c', 'comm', 'output', 'board', 'etc']);
    for (const category of PART_CATEGORIES) {
      expect(category.label.trim()).not.toBe('');
      expect(category.description.trim()).not.toBe('');
    }
  });
});

describe('parsePartsYaml — 틀린 데이터는 한국어 문제 목록과 함께 멈춘다', () => {
  it('parts 목록이 없으면 멈춘다', () => {
    expect(problemsOf('foo: 1\n')).toEqual(['맨 위에 parts: 목록이 있어야 해요.']);
  });

  it('id가 겹치면 알린다', () => {
    expect(problemsOf(yaml(LINE_A, LINE_A)).join('\n')).toContain('id가 다른 항목과 겹쳐요');
  });

  it('같은 사진 파일을 두 항목이 쓰면 알린다', () => {
    const second = LINE_A.replace('id: d-007-ultrasonic-sensor', 'id: d-007-copy').replace('category: digital-sensor', 'category: digital-sensor, file: d-007-ultrasonic-sensor.webp');
    expect(problemsOf(yaml(LINE_A, second)).join('\n')).toContain('같은 사진은 한 번만 실어요');
  });

  it('알 수 없는 칸(오타)과 알 수 없는 분류를 알린다', () => {
    expect(problemsOf(yaml(LINE_A.replace('connection:', 'conection:'))).join('\n')).toContain('알 수 없는 칸 "conection"');
    expect(problemsOf(yaml(LINE_A.replace('digital-sensor', 'sensor'))).join('\n')).toContain('category "sensor"을(를) 몰라요');
  });

  it('필수 칸이 비면 알린다', () => {
    const problems = problemsOf(yaml('  - {id: x-1, category: display}')).join('\n');
    expect(problems).toContain('"name" 칸이 비었어요');
    expect(problems).toContain('"name_en" 칸이 비었어요');
    expect(problems).toContain('"connection" 칸이 비었어요');
  });

  it('id·사진 파일 이름은 영문 소문자·숫자·하이픈(.webp)만 쓴다', () => {
    expect(problemsOf(yaml(LINE_A.replace('d-007-ultrasonic-sensor', 'D_007_Ultra'))).join('\n')).toContain('id는 영문 소문자·숫자·하이픈만 써요');
    expect(problemsOf(yaml(LINE_A.replace('category: digital-sensor', 'category: digital-sensor, file: a/b.png'))).join('\n')).toContain('.webp만 써요');
  });

  it('site_part는 부품 id 모양이어야 하고 kit_name은 겹치지 않는다', () => {
    expect(problemsOf(yaml(LINE_B.replace('site_part: lcd-i2c', 'site_part: LCD I2C'))).join('\n')).toContain('site_part는 가상 보드 부품 id');
    const twin = LINE_B.replace('dis-001-i2c-1602-lcd', 'dis-099-x');
    expect(problemsOf(yaml(LINE_B, twin)).join('\n')).toContain('kit_name이 다른 항목과 겹쳐요');
  });

  it('문제를 모아서 한 번에 알린다', () => {
    const problems = problemsOf(yaml(LINE_A, LINE_A, LINE_A.replace('digital-sensor', 'nope').replace('d-007-ultrasonic-sensor', 'x-2')));
    expect(problems.length).toBeGreaterThanOrEqual(2);
  });
});

describe('순수 도우미', () => {
  const parts = parsePartsYaml(yaml(LINE_A, LINE_B, LINE_C));

  it('groupPartsByCategory: 분류 차례대로 묶고 빈 분류도 남긴다', () => {
    const groups = groupPartsByCategory(parts);
    expect(groups.map((group) => group.category.id)).toEqual(PART_CATEGORIES.map((category) => category.id));
    expect(groups.find((group) => group.category.id === 'display')?.parts.map((part) => part.id)).toEqual(['dis-001-i2c-1602-lcd']);
    expect(groups.find((group) => group.category.id === 'motor')?.parts).toEqual([]);
  });

  it('pickPartsForSiteParts: 부품 id마다 가장 먼저 나온 사진 한 장, 같은 사진은 한 번만, 사진 없는 id는 건너뜀', () => {
    expect(pickPartsForSiteParts(parts, ['lcd-i2c', 'ble', 'boot-button', 'builtin-led']).map((part) => part.id)).toEqual(['dis-001-i2c-1602-lcd', 'board-010-esp32']);
    expect(pickPartsForSiteParts(parts, [])).toEqual([]);
  });

  it('pickPartsForSiteParts: 같은 부품 id를 가리키는 사진이 여럿이면 교과서 키트 부품(kit_name)을 먼저, 키트 부품이 없으면 먼저 나온 것을 고른다', () => {
    const oled096 = '  - {id: dis-011-oled-096, name: "OLED 0.96", name_en: "OLED 0.96", category: display, connection: "I2C", site_part: oled-i2c}';
    const oled13 = '  - {id: dis-012-oled-13, name: "OLED 1.3", name_en: "OLED 1.3", category: display, connection: "I2C", site_part: oled-i2c, kit_name: "OLED(SH1106)"}';
    const laserA = '  - {id: dis-008-laser-a, name: "레이저 A", name_en: "Laser A", category: display, connection: "디지털 출력", site_part: laser}';
    const laserB = '  - {id: dis-009-laser-b, name: "레이저 B", name_en: "Laser B", category: display, connection: "디지털 출력", site_part: laser}';
    const kitFirst = '  - {id: dis-020-kit-first, name: "키트 앞", name_en: "Kit first", category: display, connection: "I2C", site_part: kit-twice, kit_name: "앞"}';
    const kitSecond = '  - {id: dis-021-kit-second, name: "키트 뒤", name_en: "Kit second", category: display, connection: "I2C", site_part: kit-twice, kit_name: "뒤"}';
    const many = parsePartsYaml(yaml(oled096, oled13, laserA, laserB, kitFirst, kitSecond));
    // 사진 파일 목록에서는 키트 사진이 뒤에 있어도 키트 사진이 뽑힌다
    expect(pickPartsForSiteParts(many, ['oled-i2c']).map((part) => part.id)).toEqual(['dis-012-oled-13']);
    // 키트 사진이 하나도 없으면 먼저 나온 사진
    expect(pickPartsForSiteParts(many, ['laser']).map((part) => part.id)).toEqual(['dis-008-laser-a']);
    // 키트 사진이 둘이면 그중 먼저 나온 사진
    expect(pickPartsForSiteParts(many, ['kit-twice']).map((part) => part.id)).toEqual(['dis-020-kit-first']);
    // 목록의 차례가 바뀌어도 같은 사진이 뽑히고, 받은 id 차례를 지킨다
    const reversed = parsePartsYaml(yaml(oled13, oled096));
    expect(pickPartsForSiteParts(reversed, ['oled-i2c']).map((part) => part.id)).toEqual(['dis-012-oled-13']);
    expect(pickPartsForSiteParts(many, ['oled-i2c', 'kit-twice']).map((part) => part.id)).toEqual(['dis-012-oled-13', 'dis-020-kit-first']);
  });

  it('siteIdsOf: 문자열과 { part } · { type }(밑줄은 하이픈)을 읽는다', () => {
    expect(siteIdsOf(['lcd-i2c', { part: 'touch-digital', pin: 17 } as { part: string }, { type: 'touch_analog_4ch' }, {}])).toEqual(['lcd-i2c', 'touch-digital', 'touch-analog-4ch']);
  });

  it('partForKitName · 사진 주소 · 대체 글 · 카드 링크', () => {
    expect(partForKitName(parts, 'LCD(2x16)')?.id).toBe('dis-001-i2c-1602-lcd');
    expect(partForKitName(parts, '없는 이름')).toBeUndefined();
    const lcd = parts[1]!;
    expect(partPhotoSrc(lcd)).toBe('/ai-physical-computing/images/parts/third-party/kit-vendor/dis-001-i2c-1602-lcd.webp');
    expect(partPhotoAlt(lcd)).toBe('문자 LCD 사진');
    expect(partCardHref(lcd)).toBe('/ai-physical-computing/start/parts/#part-dis-001-i2c-1602-lcd');
  });
});
