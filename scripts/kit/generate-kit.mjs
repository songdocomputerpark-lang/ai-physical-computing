#!/usr/bin/env node
/**
 * 키트 장치 도감 자료 만들기 (판 1.5.0, 구역 K1).
 *
 *   node scripts/kit/generate-kit.mjs [--kit .cache/v150/kit.json] [--classification scripts/kit/kit-classification.yaml]
 *                                     [--force] [--dry-run]
 *
 * 입력
 *   - kit.json   scripts/kit/extract-brixel.py가 브릭셀(고릴라셀) Thonny ESP32 쪽 HTML에서 뽑은 장치 101개·코드 202개·1장 코드 12개
 *                (1장 코드 가운데 분류 표에 skip을 적은 것은 싣지 않는다 — 1.7.7 brx_ble.py·boot.py 블록, 판 1.5.0 K3a. 그래서 1장은 10개)
 *   - kit-classification.yaml   사람이 정한 분류·가상 보드 배선·까닭(그 파일 머리말에 칸 설명)
 * 출력 (모두 저장소 뿌리 기준)
 *   - examples/esp32/kit/ch<장>/<번호>-<이름>-<단계>.py      브릭셀 쪽 코드를 한 글자도 고치지 않고(줄 끝 LF, 끝 줄바꿈 하나만) 옮김
 *   - 같은 이름의 .meta.yaml 사이드카                         제목·설명·난이도·낱말·kit·source·virtual·parts·practice
 *   - content/kit/devices.yaml                                 장치 목록 한 파일(쪽·갤러리가 읽음)
 * 다시 돌릴 때: 코드(.py)는 늘 kit.json에서 다시 쓰지만, 이미 있는 사이드카와 devices.yaml은 **건너뛴다**(사람이 고친 글을 지키려고).
 * 처음부터 다시 만들고 싶으면 --force. --dry-run은 파일을 쓰지 않고 요약만 보여 줘요.
 *
 * 라이브러리 파일(examples/esp32/lib/third-party/)은 이 스크립트가 만들지 않아요 — scripts/kit/install-libraries.mjs가 놓아요.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// ── 인자 ──
const args = process.argv.slice(2);
function argValue(name, fallback) {
  const at = args.indexOf(name);
  return at >= 0 && args[at + 1] ? args[at + 1] : fallback;
}
const FORCE = args.includes('--force');
const DRY = args.includes('--dry-run');
const KIT_PATH = path.resolve(ROOT, argValue('--kit', '.cache/v150/kit.json'));
const CLASS_PATH = path.resolve(ROOT, argValue('--classification', 'scripts/kit/kit-classification.yaml'));
const EXAMPLES_DIR = path.join(ROOT, 'examples');
const KIT_DIR = 'esp32/kit';
const DEVICES_PATH = path.join(ROOT, 'content', 'kit', 'devices.yaml');

const SOURCE_URL = 'https://brixel.gorillacell.kr/07_thonny/03_esp32/';
const LIB_URL_BASE = `${SOURCE_URL}downloads/libs/`;
const FETCHED = '2026-10-16';

// ── 라이브러리 표 ──
// 사이트가 보드 라이브러리로 싣는 파일(examples/esp32/lib/third-party/<파일>) — 라이선스가 분명한 것만(DECISIONS C158)
const SITE_LIBS = new Set([
  'i2c_lcd',
  'gorillacell_dcmotors',
  'tm1637',
  'ht16k33',
  'hcsr04',
  'sht30',
  'rotary_irq',
  'mlx90614',
  'ds3231',
  'ir_rx',
  'ir_tx',
  'gorillacell_servo',
  'gorillacell_stepper',
  'gorillacell_wifi',
  'gorillacell_mp3_player',
]);
// 브릭셀 쪽에서 내려받게 링크만 하는 파일: 이름 → 브릭셀 내려받기 파일 이름
const LINK_LIBS = {
  ssd1306: 'Library 6.03 ssd1306.py',
  sh1106: 'Library 6.04 sh1106.py',
  max7219: 'Library 6.05 max7219.py',
  hx711: 'Library 6.10 hx711.py',
  tcs34725: 'Library 6.13 tcs34725.py',
  mpu6050: 'Library 6.14 mpu6050.py',
  max30105: 'Library 6.15 max30105.py',
  bmp280: 'Library 6.16 bmp280.py',
  vl53l0x: 'Library 6.17 vl53l0x.py',
  apds9960: 'Library 6.18 apds9960.py',
  pyfingerprint: 'Library 6.19 pyfingerprint.py',
  pca9685: 'Library 6.23 pca9685.py',
  // 사용 조건(MIT)은 분명하지만 파일 머리말에 저작자 이메일 주소가 있어 저장소 개인정보 검사가 막는다 → 싣지 않고 링크(DECISIONS C158)
  micropygps: 'Library 6.27 micropygps.py',
};
// 펌웨어에 들어 있는 모듈·표준 모듈 — 라이브러리 목록에 넣지 않는다
const BUILTIN_MODULES = new Set([
  'machine', 'time', 'utime', 'math', 'random', 'os', 'gc', 'sys', 'network', 'neopixel', 'dht', 'onewire', 'ds18x20', 'esp32',
  'micropython', 'ubluetooth', 'bluetooth', 'framebuf', 'struct', 'array', 'io', 'json',
]);
// 가상 보드가 부품으로 대신해 주는 드라이버 이름(사이트가 파일로 싣지는 않음)
const VIRTUAL_DRIVER_NOTES = {
  ssd1306: '가상 보드에서는 OLED 부품이 대신해요',
  sh1106: '가상 보드에서는 OLED 부품이 대신해요',
};

// ── 고정 글 ──
const LCD_PART = Object.freeze({ part: 'lcd-i2c', id: 'lcd', pins: { sda: 21, scl: 22 }, label: '문자 LCD(16×2)' });
const DEFAULT_REAL_ONLY = '이 예제에 필요한 부분이 가상 보드에 아직 없어서';

// ── 도우미 ──
const pad2 = (n) => String(n).padStart(2, '0');
const lines = (text) => text.split('\n');
const usesLcd = (code) => /\bI2cLcd\s*\(/u.test(code);
const usesBoot = (code) => /Pin\(\s*0\s*,/u.test(code);
const isForever = (code) => /^\s*while\s+(True|1)\s*:/mu.test(code);

function readYaml(file) {
  return YAML.parse(fs.readFileSync(file, 'utf8'));
}

function normalizeCode(raw) {
  // 브릭셀 쪽 코드 그대로: 줄 끝 LF, 끝 줄바꿈 하나. (HTML에서 뽑을 때 이미 LF이고 앞뒤 빈 줄만 없앴다)
  return raw.replace(/\r\n?/gu, '\n').replace(/\n*$/u, '') + '\n';
}

function yamlText(value) {
  // 글이 길어도 접지 않고(lineWidth 0), 위험한 글은 라이브러리가 따옴표로 감싼다(글 속 " #"·": " 함정)
  return YAML.stringify(value, { lineWidth: 0, defaultKeyType: 'PLAIN', defaultStringType: 'PLAIN', singleQuote: false });
}

/** 번호 글자("3.11"·"1.7.1")는 늘 따옴표로 — 1.6처럼 숫자로 읽히는 것과 섞이지 않게 */
function numberText(value) {
  const node = new YAML.Scalar(String(value));
  node.type = 'QUOTE_DOUBLE';
  return node;
}

function writeFileIfChanged(file, text) {
  if (DRY) {
    return 'dry';
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === text) {
    return 'same';
  }
  fs.writeFileSync(file, text, { encoding: 'utf8' });
  return 'written';
}

function circuitSlug(device) {
  const file = device.circuit.file ?? '';
  const matched = /^circuit_\d+_\d+_(.+)\.webp$/u.exec(file);
  if (!matched) {
    throw new Error(`${device.id}: 회로 그림 이름에서 slug를 만들 수 없어요(${file}). kit-classification.yaml에 slug를 적어요.`);
  }
  return matched[1].replace(/_/gu, '-');
}

/** 코드 줄 수·구조로 난이도를 매긴다(기준은 src/lab/gallery/facets.ts의 EXAMPLE_DIFFICULTY_GUIDE). 1단계 1~2, 2단계 2~3 */
function difficultyOf(step, code) {
  const count = lines(code).length;
  const heavy = /\b(struct|UART\(|readfrom|writeto|bytes\(|bytearray|class\s)/u.test(code) || count >= 60;
  if (step === 1) {
    return count >= 45 || (heavy && count >= 35) ? 2 : 1;
  }
  return count >= 62 || (heavy && count >= 50) ? 3 : 2;
}

function lcdWords(code) {
  return usesLcd(code) ? ['문자 LCD'] : [];
}

function unique(list) {
  return [...new Set(list.filter((item) => typeof item === 'string' && item !== ''))];
}

// ── 연습 방법(가상 보드에서 무엇을 누르고 무엇을 보는지) ──
function inputHint(parts) {
  // 조작은 모두 보드 그림 아래 "<이름> 조작" 칸이에요(src/lab/README.md 7.5 범용 부품 4종). touch-digital만 그림을 직접 눌러요.
  const touch = parts.find((entry) => entry.part === 'touch-digital');
  if (touch) {
    return `보드 그림의 ‹${touch.label}›을(를) 누르고 있는 동안 값이 1이 돼요. 눌러 보세요.`;
  }
  const sensor = parts.find((entry) => entry.part === 'sensor-digital');
  if (sensor) {
    return `보드 그림 아래 ‹${sensor.label}› 조작 칸의 [누르고 있는 동안 감지] 단추를 눌러 값이 바뀌게 해 보세요(‹켜 두기›를 체크하면 계속 감지돼요).`;
  }
  const analog = parts.find((entry) => entry.part === 'sensor-analog');
  if (analog) {
    return `보드 그림 아래 ‹${analog.label}› 조작 칸의 슬라이더를 움직이거나 숫자 칸에 값(0~4095)을 적어 센서 값을 바꿔 보세요.`;
  }
  const joystick = parts.find((entry) => entry.part === 'joystick');
  if (joystick) {
    return `보드 그림 아래 ‹${joystick.label}› 조작 칸의 X·Y 슬라이더를 움직여(또는 [가운데로]) 값을 바꿔 보세요.`;
  }
  const touch4 = parts.find((entry) => entry.part === 'touch-analog-4ch');
  if (touch4) {
    return `보드 그림 아래 ‹${touch4.label}› 조작 칸의 [패드 1]~[패드 4]를 눌러 보세요.`;
  }
  return null;
}

function outputHint(parts) {
  const outputs = parts.filter((entry) => ['output-digital', 'rgb-led', 'laser', 'buzzer', 'vibration-motor', 'fan-motor', 'servo', 'neopixel', 'mp3'].includes(entry.part));
  if (outputs.length === 0) {
    return null;
  }
  const names = outputs.slice(0, 3).map((entry) => `"${entry.label}"`);
  return `보드 그림의 ${names.join('·')}이(가) 코드대로 켜지고 꺼지고 움직이는지 봐요.`;
}

function practiceOf({ virtual, parts, code, reason, custom, isIntro }) {
  if (Array.isArray(custom) && custom.length > 0) {
    return custom;
  }
  const hasLcd = parts.some((entry) => entry.part === 'lcd-i2c');
  if (virtual === 'real-only') {
    return [
      `${reason ?? DEFAULT_REAL_ONLY} 여기서는 끝까지 돌지 않아요. 실제 키트가 있다면 실제 보드에서 해 보세요.`,
      isIntro ? '실제 보드에서는 [실제 보드] 탭에서 보드를 연결하고 [실행]을 눌러요.' : '실제 보드에서는 [실제 보드] 탭에서 보드를 연결하고 [실행]을 눌러요. 배선은 이 장치 쪽의 배선표와 회로 그림을 보세요.',
      isForever(code) ? '실제 보드에서 코드가 끝나지 않으면 [정지]를 눌러요.' : '다 돌았으면 콘솔 결과를 확인해요.',
    ];
  }
  const result = ['[실행]을 눌러요.'];
  const input = inputHint(parts);
  const output = outputHint(parts);
  const watch = [];
  if (input) {
    watch.push(input);
  }
  if (usesBoot(code)) {
    watch.push('보드 그림의 BOOT 버튼을 눌러 보세요.');
  }
  if (output && !input) {
    watch.push(output);
  } else if (output) {
    watch.push(output);
  }
  watch.push(hasLcd ? '콘솔 글자와 문자 LCD 글자가 어떻게 바뀌는지 봐요.' : '콘솔에 나오는 글자를 봐요.');
  result.push(watch.join(' '));
  if (virtual === 'partial') {
    result.push(`${reason ?? '가상 보드의 그림이 실제 부품과 조금 달라서'} 일부만 보여요.`);
  } else if (isForever(code)) {
    result.push('다 봤으면 [정지]를 눌러요.');
  }
  return result;
}

// ── 라이브러리 목록 ──
function importedNames(code) {
  const names = [];
  for (const matched of code.matchAll(/^\s*(?:from\s+([A-Za-z_][A-Za-z0-9_]*)\s+import\b|import\s+([A-Za-z_][A-Za-z0-9_,\s]*))/gmu)) {
    if (matched[1]) {
      names.push(matched[1]);
    } else if (matched[2]) {
      for (const part of matched[2].split(',')) {
        const name = part.trim().split(/\s+/u)[0];
        if (name) {
          names.push(name);
        }
      }
    }
  }
  return names;
}

function librariesOf(device, cls) {
  if (Array.isArray(cls.libs)) {
    return cls.libs;
  }
  const names = [];
  // 카드의 Library 칸("hcsr04.py", "ds3231.py", "필요 없음 …")
  for (const matched of device.library.matchAll(/([A-Za-z0-9_]+)\.py/gu)) {
    names.push(matched[1]);
  }
  for (const step of device.steps) {
    names.push(...importedNames(step.code));
  }
  const result = [];
  for (const name of unique(names)) {
    if (BUILTIN_MODULES.has(name)) {
      continue;
    }
    if (SITE_LIBS.has(name)) {
      result.push({ name, file: `${name}.py`, site: true });
    } else if (name in LINK_LIBS) {
      const entry = { name, file: `${name}.py`, site: false, url: `${LIB_URL_BASE}${encodeURIComponent(LINK_LIBS[name])}` };
      if (VIRTUAL_DRIVER_NOTES[name]) {
        entry.note = VIRTUAL_DRIVER_NOTES[name];
      }
      result.push(entry);
    }
  }
  // 문자 LCD 라이브러리가 코드에서만 나오고 카드에는 없을 때도 위 import로 이미 들어온다
  return result;
}

// ── 사이드카 한 개 ──
function buildSidecar({ title, description, difficulty, tags, kit, virtual, reason, parts, practice, sourceUrl, note }) {
  return {
    title,
    description,
    difficulty,
    tags,
    kit,
    source: 'brixel',
    source_url: sourceUrl,
    virtual,
    ...(reason && virtual !== 'full' ? { virtual_reason: reason } : {}),
    ...(virtual === 'full' ? { virtual_ok: true } : virtual === 'real-only' ? { virtual_ok: false } : {}),
    ...(parts.length > 0 ? { parts } : {}),
    practice,
    packages: [],
    ...(note ? { note } : {}),
  };
}

const SIDECAR_HEADER = [
  "# 예제 설명(사이드카). 코드는 고릴라셀(브릭셀) '마이크로파이썬 시작하기'(Thonny + ESP32 개발 키트) 쪽의 예제를 한 글자도 고치지 않고 옮긴 것이고,",
  '# 제목·설명·배선(parts)·실습 방법(practice)은 이 사이트가 적었어요. 핀은 브릭셀 ESP32 실드 V3 규칙 그대로예요(교과서 예제와 핀이 다를 수 있어요).',
  '# 만든 방법: scripts/kit/generate-kit.mjs — 다시 돌려도 이 파일은 건너뛰어요(--force를 줄 때만 덮어써요). 사람이 고친 글은 이 파일에 직접 적어요.',
  '# virtual: full 가상 보드에서 끝까지 / partial 돌지만 일부 모습이 달라요 / real-only 실제 보드에서만(까닭은 virtual_reason).',
].join('\n');

function sidecarText(sidecar) {
  return `${SIDECAR_HEADER}\n${yamlText(sidecar)}`;
}

// ── 본 작업 ──
const kit = JSON.parse(fs.readFileSync(KIT_PATH, 'utf8'));
const classification = readYaml(CLASS_PATH);
const introClassification = classification.intro ?? {};

const stats = { py: 0, sidecars: 0, sidecarsSkipped: 0, virtual: { full: 0, partial: 0, 'real-only': 0 }, support: {}, problems: [], skipped: [] };
const outputs = []; // 쓴 파일 기록

function emitExample({ file, code, sidecar }) {
  const full = path.join(EXAMPLES_DIR, ...file.split('/'));
  const pyResult = writeFileIfChanged(full, normalizeCode(code));
  stats.py += 1;
  const sidecarPath = full.replace(/\.py$/u, '.meta.yaml');
  if (!FORCE && fs.existsSync(sidecarPath)) {
    stats.sidecarsSkipped += 1;
  } else {
    writeFileIfChanged(sidecarPath, sidecarText(sidecar));
    stats.sidecars += 1;
  }
  outputs.push({ file, pyResult });
}

const chapterNames = Object.fromEntries(kit.chapters.map((chapter) => [chapter.n, chapter.name]));
const devicesOut = [];

for (const device of kit.devices) {
  const cls = classification[device.id];
  if (!cls) {
    stats.problems.push(`${device.id}: kit-classification.yaml에 분류가 없어요.`);
    continue;
  }
  const support = cls.support;
  if (!['A', 'B1', 'B2', 'C'].includes(support)) {
    stats.problems.push(`${device.id}: support는 A·B1·B2·C 중 하나예요(지금 ${String(support)}).`);
    continue;
  }
  stats.support[support] = (stats.support[support] ?? 0) + 1;
  const slug = cls.slug ?? circuitSlug(device);
  const baseVirtual = cls.virtual ?? (support === 'A' || support === 'B1' ? 'full' : 'real-only');
  const baseParts = cls.parts ?? [];
  const deviceTags = unique([chapterNames[device.chapter], ...(cls.tags ?? []), '키트 도감']);
  const steps = [];
  for (const [index, step] of device.steps.entries()) {
    const stepNo = step.n || index + 1;
    const file = `${KIT_DIR}/ch${device.chapter}/${device.chapter}-${pad2(device.seq)}-${slug}-${stepNo}.py`;
    const virtual = cls.virtual_steps?.[index] ?? baseVirtual;
    stats.virtual[virtual] += 1;
    const parts = [...baseParts];
    if (usesLcd(step.code)) {
      parts.push({ ...LCD_PART });
    }
    const title = `${device.number} ${device.name.replace(/\s*\|\s*/gu, '·')} — ${stepNo}단계: ${step.title}`;
    const points = step.points.filter((point) => point !== '');
    const description = [points[0], points[1]].filter(Boolean).join(' ');
    const sidecar = buildSidecar({
      title,
      description,
      difficulty: difficultyOf(stepNo, step.code),
      tags: unique([...deviceTags, ...lcdWords(step.code)]),
      kit: { device: device.id, step: stepNo },
      virtual,
      reason: cls.reason,
      parts,
      practice: practiceOf({ virtual, parts, code: step.code, reason: cls.reason, custom: cls.practice?.[index] ? cls.practice[index] : null }),
      sourceUrl: `${SOURCE_URL}#${device.id}`,
      note: cls.note,
    });
    emitExample({ file, code: step.code, sidecar });
    steps.push({ n: stepNo, kind: step.kind, title: step.title, file, virtual, points });
  }
  const stepVirtuals = steps.map((step) => step.virtual);
  const deviceVirtual = stepVirtuals.every((value) => value === 'full') ? 'full' : stepVirtuals.every((value) => value === 'real-only') ? 'real-only' : 'partial';
  devicesOut.push({
    id: device.id,
    number: numberText(device.number),
    chapter: device.chapter,
    name: device.name.replace(/\s*\|\s*/gu, '·'),
    name_en: device.name_en,
    description: device.description,
    interface: device.interface,
    pins: device.pins,
    gpio: device.gpio,
    part: (device.photo.file ?? '').replace(/\.[a-z0-9]+$/iu, '').toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, ''),
    ...(device.photo.variants.length > 0
      ? { part_variants: device.photo.variants.map((variant) => ({ part: (variant.file ?? '').replace(/\.[a-z0-9]+$/iu, '').toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, ''), label: variant.label })) }
      : {}),
    libraries: librariesOf(device, cls),
    wiring: device.wiring,
    circuit: device.id === 'd-8-06' ? 'd-8-05.webp' : `${device.id}.webp`,
    steps,
    support,
    virtual: deviceVirtual,
    ...(deviceVirtual !== 'full' && cls.reason ? { virtual_reason: cls.reason } : {}),
    ...(cls.note ? { note: cls.note } : {}),
  });
}

// 1장 소절 코드(kit.json 12개 — 분류 표의 skip은 빼서 10개)
const introOut = [];
const seenIntro = new Map();
for (const item of kit.intro) {
  const key = `${item.number}#${item.index}`;
  const cls = introClassification[key];
  seenIntro.set(key, true);
  if (!cls) {
    stats.problems.push(`1장 ${key}: kit-classification.yaml의 intro에 분류가 없어요.`);
    continue;
  }
  if (typeof cls.skip === 'string' && cls.skip.trim() !== '') {
    // 싣지 않기로 한 코드(까닭은 분류 표의 skip) — 예제 파일·사이드카·devices.yaml 줄을 만들지 않는다
    stats.skipped.push(`${key}: ${cls.skip}`);
    continue;
  }
  const file = `${KIT_DIR}/ch1/${item.number.replace(/\./gu, '-')}-${cls.slug}.py`;
  const virtual = cls.virtual ?? 'full';
  stats.virtual[virtual] += 1;
  const parts = [...(cls.parts ?? [])];
  if (usesLcd(item.code)) {
    parts.push({ ...LCD_PART });
  }
  const title = `${item.number} ${item.title.replace(/\s*\(웹 BLE\)$/u, '')} — ${cls.title}`;
  const sidecar = buildSidecar({
    title,
    description: cls.description,
    difficulty: cls.difficulty,
    tags: unique(['시작하기', ...(cls.tags ?? []), '키트 도감']),
    kit: { intro: numberText(item.number), ...(item.of > 1 ? { part: item.index } : {}) },
    virtual,
    reason: cls.reason,
    parts,
    practice: practiceOf({ virtual, parts, code: item.code, reason: cls.reason, custom: cls.practice, isIntro: true }),
    sourceUrl: `${SOURCE_URL}#${item.id}`,
    note: cls.note,
  });
  emitExample({ file, code: item.code, sidecar });
  introOut.push({
    number: numberText(item.number),
    title: item.title,
    sub: cls.title,
    file,
    virtual,
    ...(cls.reason && virtual !== 'full' ? { virtual_reason: cls.reason } : {}),
    ...(cls.note ? { note: cls.note } : {}),
  });
}
for (const key of Object.keys(introClassification)) {
  if (!seenIntro.has(key)) {
    stats.problems.push(`kit-classification.yaml의 intro "${key}"에 짝이 되는 1장 코드가 없어요.`);
  }
}
for (const id of Object.keys(classification)) {
  if (id !== 'intro' && !kit.devices.some((device) => device.id === id)) {
    stats.problems.push(`kit-classification.yaml의 ${id}에 짝이 되는 장치가 없어요.`);
  }
}

// ── devices.yaml ──
const DEVICES_HEADER = `# 키트 장치 도감 데이터 — 브릭셀(고릴라셀) '마이크로파이썬 시작하기'(Thonny + ESP32 개발 키트) 쪽의 장치 101개와 1장 시작하기 코드 10개 (판 1.5.0)
# 읽는 곳: 키트 장치 도감 쪽 /labs/esp32/kit/ 와 장치 쪽 /labs/esp32/kit/<id>/ (K3), ESP32 실습실 예제 목록·예제 갤러리는 이 파일이 아니라 예제 사이드카(kit 칸)를 읽어요.
# 허락·표기: 운영자가 고릴라셀(브릭셀) 예제와 그림을 그대로 싣도록 허락했어요(DECISIONS O19). 표기 "고릴라셀(브릭셀) 제공, 허락받아 사용".
#
# 이 파일은 scripts/kit/generate-kit.mjs가 처음 만들었고, 그 뒤로는 사람이 고쳐요(다시 돌려도 --force가 없으면 덮어쓰지 않아요).
#
# 새 장치를 더하는 법 (코드는 고치지 않아요)
#  1. 코드: examples/esp32/kit/ch<장>/<장>-<번호 두 자리>-<영문 이름>-<단계>.py 를 단계마다 하나씩(보통 1단계·2단계). 줄 끝은 LF.
#  2. 사이드카: 같은 이름의 .meta.yaml — title·description·difficulty(1~3)·tags·kit: { device: <id>, step: <단계> }·source·virtual·parts·practice
#     (본보기: examples/esp32/kit/ch3/3-11-ultrasonic-1.meta.yaml). parts 칸은 가상 보드 배선이에요(핀은 코드가 쓰는 핀 그대로).
#  3. 이 파일의 devices 목록에 한 줄(아래 칸). 장 이름은 chapters, 사진은 content/parts/parts.yaml의 part id, 회로 그림은
#     public/images/kit/circuits/third-party/kit-vendor/<id>.webp 에 둬요(다시 인코딩·메타데이터 없음·눈 확인 기록 scripts/image-allowlist.yaml).
#  4. 라이브러리가 필요하면 libraries에 적어요. 사이트가 싣는 파일(site: true)은 examples/esp32/lib/third-party/<이름>.py + sources.yaml 항목이 있어야 하고,
#     싣지 않는 파일은 site: false + url(브릭셀 내려받기 주소)만 적어요. 사용 조건이 분명하지 않은 파일은 싣지 않아요(DECISIONS C158).
#
# 칸
#   id          d-<장>-<번호 두 자리> (브릭셀 카드 닻과 같음)
#   number      카드 번호 글자("3.11")        chapter  장(2~8)
#   name / name_en   한국어 이름 / 영어 이름   description  카드 설명
#   interface / pins / gpio   카드의 기본 정보(브릭셀 글 그대로)
#   part        content/parts/parts.yaml 의 부품 사진 id (부품 사전 /start/parts/ 로 이어져요)    part_variants   같은 코드로 도는 다른 색·크기 사진
#   libraries   [{ name, file, site, url?, note? }]
#   wiring      배선 줄(브릭셀 글 그대로 — 안에 적힌 다른 장치 번호는 브릭셀 쪽의 옛 번호예요)
#   circuit     회로 그림 파일 이름(public/images/kit/circuits/third-party/kit-vendor/ 안, 8.06은 8.05와 같은 그림)
#   steps       [{ n, kind, title, file, virtual, points }]  file 은 examples/ 뒤 경로(예제 id 는 경로를 하이픈으로 이은 것: esp32/kit/ch3/3-11-ultrasonic-1.py → kit-ch3-3-11-ultrasonic-1)
#   support     A 지금 있는 가상 부품으로 / B1 범용 부품 4종으로 / B2 흉내 모듈이 더 있어야 함 / C 어려움   virtual  full / partial / real-only (단계마다 다를 수 있어 steps에도 있음)
#   virtual_reason   partial·real-only 인 까닭   note   참고 글
`;

const devicesYaml = {
  source: { name: '고릴라셀(브릭셀) 마이크로파이썬 시작하기 — Thonny + ESP32 개발 키트', url: SOURCE_URL, fetched: FETCHED },
  chapters: [
    { n: 1, name: chapterNames[1] ?? '마이크로파이썬 시작하기' },
    ...kit.chapters.filter((chapter) => chapter.n >= 2 && chapter.n <= 8).map((chapter) => ({ n: chapter.n, name: chapter.name })),
  ],
  intro: introOut,
  devices: devicesOut,
};

if (!FORCE && fs.existsSync(DEVICES_PATH)) {
  console.log(`건너뜀(이미 있음): ${path.relative(ROOT, DEVICES_PATH)} — 다시 만들려면 --force`);
} else {
  writeFileIfChanged(DEVICES_PATH, `${DEVICES_HEADER}${yamlText(devicesYaml)}`);
}

// ── 요약 ──
console.log(`장치 ${devicesOut.length}개, 1장 코드 ${introOut.length}개, 코드 파일 ${stats.py}개 (사이드카 새로 ${stats.sidecars}개, 건너뜀 ${stats.sidecarsSkipped}개)`);
console.log(`분류: ${Object.entries(stats.support).map(([key, value]) => `${key} ${value}`).join(' · ')} (장치 기준)`);
console.log(`가상 보드(코드 기준): full ${stats.virtual.full} · partial ${stats.virtual.partial} · real-only ${stats.virtual['real-only']}`);
for (const skipped of stats.skipped) {
  console.log(`싣지 않음(분류 표 skip): ${skipped}`);
}
if (DRY) {
  console.log('--dry-run: 파일을 쓰지 않았어요.');
}
if (stats.problems.length > 0) {
  console.error('\n확인 필요:');
  for (const problem of stats.problems) {
    console.error(`- ${problem}`);
  }
  process.exitCode = 1;
}
