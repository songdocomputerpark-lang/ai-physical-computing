#!/usr/bin/env node
/**
 * 키트 장치 도감이 쓰는 보드 라이브러리 놓기 (판 1.5.0, 구역 K1, DECISIONS C158).
 *
 *   node scripts/kit/install-libraries.mjs [--from .cache/v150-staging/libs] [--download] [--check]
 *
 * 브릭셀(고릴라셀) Thonny ESP32 쪽 9장 "라이브러리" 표의 파일 가운데 **사용 조건이 파일 안에 분명한 것**(MIT·Apache-2.0·고릴라셀 자체)만
 * examples/esp32/lib/third-party/ 에 놓는다. 파일 내용은 원래 그대로이고 줄 끝만 LF로(CRLF → LF), 끝 줄바꿈 하나만 보탠다.
 * 조건이 없거나 맞지 않는 파일(ssd1306·sh1106·max7219·tcs34725·mpu6050·max30105·bmp280·vl53l0x·pca9685, GPL apds9960,
 * micropygps(MIT이지만 머리말의 저작자 이메일 주소를 저장소 개인정보 검사가 막음),
 * 독일 자유 소프트웨어 라이선스 pyfingerprint)은 싣지 않고 content/kit/devices.yaml 의 libraries 에 브릭셀 내려받기 주소만 적는다.
 * 이미 있는 i2c_lcd.py(사이트판에 MIT 고지가 더해짐)와 gorillacell_dcmotors.py(교과서 169쪽 PWM판)는 건드리지 않고 --check 로 차이만 보여 준다.
 *
 * --from      받아 둔 파일 폴더(파일 이름은 라이브러리 이름.py). 없는 파일은 --download 일 때 브릭셀 주소에서 받아요.
 * --download  --from 폴더에 없는 파일을 내려받아요(느린 속도로 한 번에 하나씩).
 * --check     쓰지 않고, 이미 놓은 파일이 받은 파일과 같은지(줄 끝 LF 기준)만 확인해요.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const LIB_DIR = path.join(ROOT, 'examples', 'esp32', 'lib', 'third-party');
const BASE = 'https://brixel.gorillacell.kr/07_thonny/03_esp32/downloads/libs/';

const args = process.argv.slice(2);
const argValue = (name, fallback) => (args.indexOf(name) >= 0 && args[args.indexOf(name) + 1] ? args[args.indexOf(name) + 1] : fallback);
const FROM = path.resolve(ROOT, argValue('--from', '.cache/v150-staging/libs'));
const DOWNLOAD = args.includes('--download');
const CHECK = args.includes('--check');

/** 놓을 파일: 이름, 브릭셀 내려받기 이름, 한 줄 설명, 원 저작자·사용 조건(파일 머리말 근거) */
const LIBS = [
  { name: 'tm1637', remote: 'Library 6.02 tm1637.py', title: 'TM1637 4자리 7세그먼트', about: 'TM1637 칩으로 움직이는 4자리 7세그먼트 표시 장치 라이브러리예요(2.06).', who: 'Mike Causer — MIT(파일 머리말에 전문)' },
  { name: 'ht16k33', remote: 'Library 6.06 ht16k33.py', title: 'HT16K33 도트 매트릭스(I2C)', about: 'HT16K33 칩으로 움직이는 I2C 도트 매트릭스 라이브러리예요(2.11·2.12).', who: 'Tony Smith(smittytone) — MIT(파일 머리말에 전문)' },
  { name: 'hcsr04', remote: 'Library 6.07 hcsr04.py', title: 'HC-SR04 초음파 센서', about: 'HC-SR04 초음파 센서로 거리를 재는 라이브러리예요(3.11).', who: 'Roberto Sánchez — Apache-2.0(파일의 __license__)' },
  { name: 'sht30', remote: 'Library 6.08 sht30.py', title: 'SHT30 온습도 센서', about: 'SHT30 온습도 센서(I2C) 라이브러리예요(5.01).', who: 'Roberto Sánchez — Apache-2.0(파일의 __license__)' },
  { name: 'rotary_irq', remote: 'Library 6.09 rotary_irq.py', title: '로터리 인코더', about: '로터리 인코더를 읽는 라이브러리예요(3.14).', who: 'Mike Teachman — MIT(파일 머리말)' },
  { name: 'mlx90614', remote: 'Library 6.11 mlx90614.py', title: 'MLX90614 비접촉 온도 센서', about: 'MLX90614 비접촉 온도 센서(I2C) 라이브러리예요(5.03).', who: 'Mike Causer — MIT(파일 머리말에 전문)' },
  { name: 'ds3231', remote: 'Library 6.12 ds3231.py', title: 'DS3231 실시간 시계', about: 'DS3231 실시간 시계 모듈(I2C) 라이브러리예요(5.04).', who: 'Peter Hinch — MIT(파일 머리말)' },
  { name: 'ir_rx', remote: 'Library 6.24 ir_rx.py', title: '적외선(IR) 수신', about: '적외선 리모컨 신호를 받는 라이브러리예요(8.01).', who: 'Peter Hinch — MIT(파일 머리말에 전문)' },
  { name: 'ir_tx', remote: 'Library 6.25 ir_tx.py', title: '적외선(IR) 송신', about: '적외선 리모컨 신호를 보내는 라이브러리예요(8.02).', who: 'Peter Hinch — MIT(파일 머리말에 전문)' },
  { name: 'gorillacell_servo', remote: 'Library 6.21 gorillacell_servo.py', title: '고릴라셀 서보 모터', about: '서보 모터(MG90S)를 각도로 돌리는 고릴라셀 라이브러리예요(6.05).', who: '고릴라셀(브릭셀) 자체 — 사용 허락 DECISIONS O19' },
  { name: 'gorillacell_stepper', remote: 'Library 6.22 gorillacell_stepper.py', title: '고릴라셀 스텝 모터', about: '스텝 모터(A4988 드라이버)를 각도로 돌리는 고릴라셀 라이브러리예요(6.07).', who: '고릴라셀(브릭셀) 자체 — 사용 허락 DECISIONS O19' },
  { name: 'gorillacell_wifi', remote: 'Library 6.26 gorillacell_wifi.py', title: '고릴라셀 WiFi(ESP12E)', about: 'ESP12E WiFi 모듈에 AT 명령을 보내는 고릴라셀 라이브러리예요(8.07).', who: '고릴라셀(브릭셀) 자체 — 사용 허락 DECISIONS O19' },
  { name: 'gorillacell_mp3_player', remote: 'Library 6.28 gorillacell_mp3_player.py', title: '고릴라셀 MP3 플레이어', about: 'MP3 모듈(KT403A)에 명령 바이트를 보내는 고릴라셀 라이브러리예요(7.05).', who: '고릴라셀(브릭셀) 자체 — 사용 허락 DECISIONS O19' },
];

function normalize(raw) {
  return raw.replace(/\r\n?/gu, '\n').replace(/\n*$/u, '') + '\n';
}

async function obtain(lib) {
  const local = path.join(FROM, `${lib.name}.py`);
  if (!fs.existsSync(local)) {
    if (!DOWNLOAD) {
      throw new Error(`${local} 파일이 없어요. --download 를 주면 ${BASE} 에서 받아요.`);
    }
    fs.mkdirSync(FROM, { recursive: true });
    const response = await fetch(BASE + encodeURIComponent(lib.remote));
    if (!response.ok) {
      throw new Error(`${lib.remote}: HTTP ${response.status}`);
    }
    fs.writeFileSync(local, Buffer.from(await response.arrayBuffer()));
    await new Promise((resolve) => setTimeout(resolve, 600));
  }
  const bytes = fs.readFileSync(local);
  // UTF-8 이어야 해요(깨진 글자가 섞이면 알림)
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  return normalize(text);
}

let problems = 0;
for (const lib of LIBS) {
  let text;
  try {
    text = await obtain(lib);
  } catch (error) {
    console.error(`- ${lib.name}: ${error.message}`);
    problems += 1;
    continue;
  }
  const target = path.join(LIB_DIR, `${lib.name}.py`);
  if (CHECK) {
    const same = fs.existsSync(target) && fs.readFileSync(target, 'utf8') === text;
    console.log(`${same ? '같음' : '다름'}  ${lib.name}.py`);
    if (!same) {
      problems += 1;
    }
    continue;
  }
  fs.mkdirSync(LIB_DIR, { recursive: true });
  fs.writeFileSync(target, text, 'utf8');
  const sidecar = {
    title: `보드 라이브러리: ${lib.name}.py(${lib.title})`,
    description: `${lib.about} 브릭셀(고릴라셀) 키트 도감의 예제가 import해요. 가상 보드는 /board/lib/에 넣고, 실물 보드는 [실행]·[보드에 저장]이 함께 올려요.`,
    source: 'brixel',
    source_url: `${BASE}${encodeURIComponent(lib.remote)}`,
    tags: ['라이브러리', '키트 도감'],
    packages: [],
  };
  const header = [
    '# 예제 설명(사이드카). 라이브러리 파일은 고릴라셀(브릭셀) 키트 도감 쪽에서 받은 것을 줄 끝(CRLF → LF)과 끝 줄바꿈만 바꿔 그대로 놓았어요.',
    `# 원 저작자·사용 조건: ${lib.who}. 출처 등록은 sources.yaml(키트 업체 예제 코드 항목 또는 개별 항목)이 맡아요. 만든 방법: scripts/kit/install-libraries.mjs`,
  ].join('\n');
  fs.writeFileSync(path.join(LIB_DIR, `${lib.name}.meta.yaml`), `${header}\n${YAML.stringify(sidecar, { lineWidth: 0 })}`, 'utf8');
  console.log(`놓음  examples/esp32/lib/third-party/${lib.name}.py (${text.length}자)`);
}

// 이미 있는 두 파일은 건드리지 않고 차이만 알려요
for (const existing of ['i2c_lcd', 'gorillacell_dcmotors']) {
  const brixel = path.join(FROM, `${existing}.py`);
  const site = path.join(LIB_DIR, `${existing}.py`);
  if (fs.existsSync(brixel) && fs.existsSync(site)) {
    const a = normalize(fs.readFileSync(brixel, 'utf8'));
    const b = fs.readFileSync(site, 'utf8');
    console.log(`참고  ${existing}.py: 이미 있는 사이트판 ${a === b ? '=' : '!='} 브릭셀 파일 (건드리지 않음)`);
  }
}
if (problems > 0) {
  process.exitCode = 1;
}
