// 흉내 모듈 폴더 규약의 순수 논리 단위 테스트(src/lab/README.md 4절): manifest 검사(src/lab/modules/manifests.ts)와 hello 모듈의 순수 함수.
// import.meta.glob은 Vite가 처리하므로 여기서는 검사 함수에 가짜 묶음을 넘겨 본다. 실제 폴더 구조는 마지막 묶음이 파일 시스템으로 확인한다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { greeting } from '../../../src/lab/modules/hello/index.ts';
import helloManifest from '../../../src/lab/modules/hello/manifest.ts';
import {
  MODULE_MANIFESTS,
  folderNameOf,
  groupRequestKinds,
  groupWantedByCode,
  groupWantedByQuery,
  groupWindowEvents,
  moduleAppliesTo,
  moduleLoadPlan,
  modulesForLab,
  shimTableOf,
  validateLoadRule,
  validateManifests,
} from '../../../src/lab/modules/manifests.ts';
import { MESSAGE_KIND_PATTERN, MODULE_ID_PATTERN, type LabModuleManifest } from '../../../src/lab/modules/types.ts';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const MODULES_DIR = path.join(ROOT, 'src', 'lab', 'modules');

function manifest(overrides: Partial<LabModuleManifest> & { id: string }): LabModuleManifest {
  return { title: `${overrides.id} 모듈`, labs: ['vision'], ...overrides };
}

describe('manifest 검사(validateManifests)', () => {
  it('바른 manifest 묶음은 문제가 없다', () => {
    const errors = validateManifests({
      './hello/manifest.ts': { default: helloManifest },
      './mp/manifest.ts': {
        default: manifest({ id: 'mp', shims: { mediapipe: 'apc_mediapipe' }, requestKinds: ['mp.hands.process'], eventKinds: ['mp.ready'], channels: ['mp.replay'], placement: 'wide', packages: ['opencv-python'] }),
      },
    });
    expect(errors).toEqual([]);
  });

  it('id·폴더 이름·labs·placement·이름 모양을 검사한다', () => {
    const errors = validateManifests({
      './Bad_Name/manifest.ts': { default: manifest({ id: 'Bad_Name' }) },
      './other/manifest.ts': { default: manifest({ id: 'mismatch' }) },
      './x/manifest.ts': { default: manifest({ id: 'x', labs: [], placement: 'left' as never, requestKinds: ['wrong.kind', 'x.Ok'], channels: ['x.a'], title: '' }) },
      './y/manifest.ts': { default: undefined as never },
    });
    const text = errors.join('\n');
    expect(text).toMatch(/id는 영문 소문자로 시작/u);
    expect(text).toMatch(/폴더 이름 "other"/u);
    expect(text).toMatch(/labs는 실습실 id 목록/u);
    expect(text).toMatch(/placement는 'panel' 또는 'wide'/u);
    expect(text).toMatch(/"wrong.kind"은\(는\) "x\.<이름>" 모양/u);
    expect(text).toMatch(/"x.Ok"은\(는\)/u);
    expect(text).toMatch(/title\(사람이 읽는 이름\)/u);
    expect(text).toMatch(/src\/lab\/modules\/y\/manifest.ts: default export/u);
  });

  it('요청·이벤트·채널·흉내 모듈 이름이 다른 모듈이나 붙박이(cv2)와 겹치면 오류', () => {
    const errors = validateManifests({
      './a/manifest.ts': { default: manifest({ id: 'a', requestKinds: ['a.read'], shims: { mediapipe: 'apc_mp' } }) },
      './b/manifest.ts': { default: manifest({ id: 'b', requestKinds: ['b.read'], eventKinds: ['b.read'], shims: { mediapipe: 'apc_other', cv2: 'apc_cv2_two', pyautogui: 'apc_mp' } }) },
    });
    const text = errors.join('\n');
    expect(text).toMatch(/패키지 "mediapipe"의 흉내 모듈이 a과\(와\) 겹쳐요/u);
    expect(text).toMatch(/패키지 "cv2"의 흉내 모듈이 붙박이과\(와\) 겹쳐요/u);
    expect(text).toMatch(/흉내 모듈 이름 "apc_mp"이\(가\) a과\(와\) 겹쳐요/u);
    // 같은 모듈 안에서 request와 event가 같은 이름을 쓰는 것은 허용(주인이 같다)
    expect(text).not.toMatch(/"b.read"이\(가\)/u);
    const builtin = validateManifests({ './c/manifest.ts': { default: manifest({ id: 'c', channels: ['c.keys'], requestKinds: ['c.open'] }) } }, { builtinChannels: ['c.keys'] });
    expect(builtin.join('\n')).toMatch(/"c.keys"이\(가\) 붙박이/u);
    expect(validateManifests({ './d/manifest.ts': { default: manifest({ id: 'd', shims: { 'bad name': 'apc_d', ok: 'notapc' } }) } }).join('\n')).toMatch(/파이썬 모듈 이름이 아니에요[\s\S]*apc_로 시작/u);
  });

  it('실습실 고르기·흉내 모듈 표·폴더 이름', () => {
    const all = [manifest({ id: 'a', labs: '*' }), manifest({ id: 'b', labs: ['dev'] }), manifest({ id: 'c', labs: ['vision', 'esp32'], shims: { mediapipe: 'apc_mp' } })];
    expect(modulesForLab('dev', all).map((item) => item.id)).toEqual(['a', 'b']);
    expect(modulesForLab('esp32', all).map((item) => item.id)).toEqual(['a', 'c']);
    expect(moduleAppliesTo(all[2]!, 'iot')).toBe(false);
    expect(shimTableOf(all)).toEqual({ mediapipe: 'apc_mp' });
    expect(folderNameOf('./hello/manifest.ts')).toBe('hello');
    expect(folderNameOf('../modules/hello/apc_hello.py')).toBe('hello');
    expect(MODULE_ID_PATTERN.test('hand-tracking')).toBe(true);
    expect(MESSAGE_KIND_PATTERN.test('hand-tracking.hands.process')).toBe(true);
    expect(MESSAGE_KIND_PATTERN.test('camera.read')).toBe(true);
  });
});

describe('hello 모듈', () => {
  it('manifest가 규약에 맞고 인사말을 만든다', () => {
    expect(helloManifest).toMatchObject({ id: 'hello', labs: ['dev'], requestKinds: ['hello.greet'], eventKinds: ['hello.wave'], channels: ['hello.name', 'hello.clicks'] });
    expect(greeting('세계')).toBe('안녕, 세계!');
    expect(greeting('  ')).toBe('안녕, 친구!');
    expect(greeting(3)).toBe('안녕, 친구!');
  });
});

describe('저장소의 모듈 폴더', () => {
  it('폴더마다 manifest.ts·index.ts가 있고 파이썬 파일 이름이 저장소 전체에서 하나다', () => {
    const builtin = fs.readdirSync(path.join(ROOT, 'src', 'lab', 'python')).filter((file) => file.endsWith('.py'));
    const seen = new Map(builtin.map((file) => [file, 'src/lab/python']));
    const folders = fs.readdirSync(MODULES_DIR, { withFileTypes: true }).filter((entry) => entry.isDirectory());
    expect(folders.map((entry) => entry.name)).toContain('hello');
    for (const folder of folders) {
      const dir = path.join(MODULES_DIR, folder.name);
      expect(MODULE_ID_PATTERN.test(folder.name), `폴더 이름 ${folder.name}`).toBe(true);
      expect(fs.existsSync(path.join(dir, 'manifest.ts')), `${folder.name}/manifest.ts`).toBe(true);
      expect(fs.existsSync(path.join(dir, 'index.ts')), `${folder.name}/index.ts`).toBe(true);
      for (const file of fs.readdirSync(dir)) {
        if (!file.endsWith('.py')) {
          continue;
        }
        expect(/^[a-z][a-z0-9_]*\.py$/u.test(file), `${folder.name}/${file}`).toBe(true);
        expect(seen.has(file), `${file}이(가) ${seen.get(file)}과(와) 겹쳐요`).toBe(false);
        seen.set(file, `src/lab/modules/${folder.name}`);
      }
    }
  });
});

describe('쓸 때 받기(load 규칙 — Phase 6 P6-02, 미해결 157)', () => {
  const load = (group: string, code: RegExp, extra: Record<string, unknown> = {}) => ({ group, code, ...extra });

  it('load 규칙 모양을 검사한다', () => {
    expect(validateLoadRule(load('comm', /\bserial\b/u, { query: ['bridge'], windowEvents: ['apc:x-show'], order: 10 }) as never, 'x')).toEqual([]);
    const text = [
      ...validateLoadRule(load('Comm', /a/gu) as never, 'x'),
      ...validateLoadRule(load('comm', 'serial' as never, { query: ['bad name'], windowEvents: ['show'], order: Number.NaN }) as never, 'y'),
      ...validateLoadRule(null as never, 'z'),
    ].join('\n');
    expect(text).toMatch(/x: load\.group은 영문 소문자로 시작/u);
    expect(text).toMatch(/x: load\.code에는 g·y 깃발을 쓰지 않아요/u);
    expect(text).toMatch(/y: load\.code는 정규식이에요/u);
    expect(text).toMatch(/y: load\.query는 주소 물음표 뒤 이름 목록/u);
    expect(text).toMatch(/y: load\.windowEvents는 창 이벤트 이름 목록/u);
    expect(text).toMatch(/y: load\.order는 숫자예요/u);
    expect(text).toMatch(/z: load는 \{ group, code/u);
    // manifest 검사에도 들어 있다
    expect(validateManifests({ './a/manifest.ts': { default: manifest({ id: 'a', load: load('comm', /a/yu) as never }) } }).join('\n')).toMatch(/load\.code에는 g·y/u);
  });

  it('받는 계획: 규칙 없는 모듈은 열 때, 있는 모듈은 무리로(무리 안은 order → 폴더 이름 차례)', () => {
    const all = [
      manifest({ id: 'a' }),
      manifest({ id: 'list', requestKinds: ['list.go'], load: load('comm', /\bbridge\b/u, { query: ['bridge'], order: 10 }) as never }),
      manifest({ id: 'port', requestKinds: ['port.open'], load: load('comm', /\bserial\b/u, { windowEvents: ['apc:port-show'] }) as never }),
      manifest({ id: 'blue', load: load('comm', /\bbluetooth\b/u, { windowEvents: ['apc:port-show', 'apc:blue-show'] }) as never }),
      manifest({ id: 'solo', load: load('extra', /\bsolo\b/u) as never }),
      manifest({ id: 'far', labs: ['esp32'], load: load('comm', /\bfar\b/u) as never }),
    ];
    const plan = moduleLoadPlan('vision', all);
    expect(plan.all.map((item) => item.id)).toEqual(['a', 'list', 'port', 'blue', 'solo']);
    expect(plan.eager.map((item) => item.id)).toEqual(['a']);
    expect(plan.groups.map((group) => [group.name, group.members.map((item) => item.id)])).toEqual([
      ['comm', ['blue', 'port', 'list']],
      ['extra', ['solo']],
    ]);
    const comm = plan.groups[0]!;
    expect(groupWantedByCode(comm, 'import serial\n')).toBe('port');
    expect(groupWantedByCode(comm, '# 시리얼(serial)을 쓰는 코드')).toBe('port');
    expect(groupWantedByCode(comm, 'import cv2\n')).toBeNull();
    expect(groupWantedByCode(comm, '')).toBeNull();
    expect(groupWantedByQuery(comm, '?example=x.py&bridge=zaneabridge3')).toBe('list');
    expect(groupWantedByQuery(comm, '?example=x.py')).toBeNull();
    expect(groupWantedByQuery(comm, '')).toBeNull();
    expect(groupWindowEvents(comm)).toEqual(['apc:port-show', 'apc:blue-show']);
    expect([...groupRequestKinds(comm)]).toEqual([
      ['port.open', 'port'],
      ['list.go', 'list'],
    ]);
  });
});

describe('저장소의 통신 모듈은 쓸 때 무리로 받는다(미해결 157)', () => {
  const COMM = ['ble-pc', 'data-port', 'mqtt', 'serial-pc', 'vision-bridge', 'web-bluetooth'];
  const indexSource = (id: string) => fs.readFileSync(path.join(MODULES_DIR, id, 'index.ts'), 'utf8');

  it('load 규칙은 통신 모듈 여섯에만 있다(나머지는 지금처럼 열 때 받는다)', () => {
    expect(MODULE_MANIFESTS.filter((item) => item.load !== undefined).map((item) => item.id)).toEqual(COMM);
    for (const item of MODULE_MANIFESTS.filter((entry) => entry.load !== undefined)) {
      expect(item.load?.group, item.id).toBe('comm');
    }
  });

  it('실습실마다 무리 구성과 mount 차례: 통로를 등록하는 모듈이 통로 목록을 그리는 [보내기] 패널(vision-bridge)보다 먼저', () => {
    const groupOf = (labId: string) => moduleLoadPlan(labId).groups.map((group) => [group.name, group.members.map((item) => item.id)]);
    expect(groupOf('vision')).toEqual([['comm', ['ble-pc', 'data-port', 'serial-pc', 'web-bluetooth', 'vision-bridge']]]);
    expect(groupOf('esp32')).toEqual([['comm', ['data-port', 'mqtt', 'web-bluetooth', 'vision-bridge']]]);
    expect(groupOf('dev')).toEqual([['comm', ['data-port', 'web-bluetooth']]]);
    // index.ts가 브릿지 통로를 등록하는 모듈(registerXxxChannel)은 vision-bridge와 같은 무리에서 더 작은 order
    const bridgeOrder = MODULE_MANIFESTS.find((item) => item.id === 'vision-bridge')?.load?.order ?? 0;
    for (const id of COMM.filter((item) => item !== 'vision-bridge')) {
      if (/\bregister\w*Channel\(/u.test(indexSource(id))) {
        const item = MODULE_MANIFESTS.find((entry) => entry.id === id);
        expect(item?.load?.group, id).toBe('comm');
        expect(item?.load?.order ?? 0, `${id}의 order`).toBeLessThan(bridgeOrder);
      }
    }
  });

  it('모듈이 패널을 여는 코드 모양(index.ts의 *_PATTERN)이 맞는 예제는 모두 그 실습실의 무리도 부른다', () => {
    // index.ts의 정규식 글자를 그대로 읽어 온다(패널 조건과 받는 조건이 어긋나면 "패널이 안 열리는" 문제가 생기므로)
    const panelPatterns = new Map<string, RegExp[]>();
    for (const id of COMM) {
      const found = [...indexSource(id).matchAll(/^(?:export\s+)?const\s+\w*PATTERN\s*=\s*\/((?:\\.|[^/\n])+)\/([a-z]*);/gmu)].map((match) => new RegExp(match[1] ?? '', match[2] ?? ''));
      panelPatterns.set(id, found);
    }
    expect(panelPatterns.get('vision-bridge')).toHaveLength(2);
    expect(panelPatterns.get('data-port')).toHaveLength(1);
    expect(panelPatterns.get('web-bluetooth')).toHaveLength(1);
    expect(panelPatterns.get('mqtt')).toHaveLength(1);
    // 예제 전체 + 모양마다 짧은 줄
    const exampleFiles = fs.readdirSync(path.join(ROOT, 'examples'), { recursive: true, encoding: 'utf8' }).filter((file) => file.endsWith('.py'));
    const corpus = [
      ...exampleFiles.map((file) => fs.readFileSync(path.join(ROOT, 'examples', file), 'utf8')),
      'import serial\n',
      'from serial import Serial\n',
      'ser = serial.Serial("COM3", 9600)\n',
      'from serial.tools import list_ports\n',
      'import bridge\n',
      'from bridge import send\n',
      'from machine import UART\nu = UART(2)\n',
      'import machine\nu = machine.UART(2)\n',
      'import ESP32BLE\n',
      'from ESP32BLE_LIB import *\n',
      'import ubluetooth\n',
      'import bluetooth_lib\n',
      'import network\n',
      'from umqtt.simple import MQTTClient\n',
    ];
    let checked = 0;
    for (const labId of ['vision', 'esp32', 'dev']) {
      const plan = moduleLoadPlan(labId);
      const comm = plan.groups.find((group) => group.name === 'comm');
      for (const code of corpus) {
        for (const member of comm?.members ?? []) {
          for (const pattern of panelPatterns.get(member.id) ?? []) {
            if (pattern.test(code)) {
              checked += 1;
              expect(comm && groupWantedByCode(comm, code), `${labId}: ${member.id}의 패널 조건 ${pattern}이 맞는 코드\n${code.slice(0, 200)}`).not.toBeNull();
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(40);
  });

  it('통신 모듈의 파이썬 파일(serial.py·bluetooth.py·bluetooth_lib.py·bridge.py)을 import하면 그 실습실의 무리를 부른다', () => {
    const pythonNames = new Map<string, string[]>();
    for (const id of COMM) {
      const files = fs.readdirSync(path.join(MODULES_DIR, id), { recursive: true, encoding: 'utf8' }).filter((file) => file.endsWith('.py'));
      pythonNames.set(id, files.map((file) => path.basename(file, '.py')));
    }
    expect(pythonNames.get('serial-pc')).toEqual(['serial']);
    expect([...(pythonNames.get('ble-pc') ?? [])].sort()).toEqual(['bluetooth', 'bluetooth_lib']);
    expect(pythonNames.get('vision-bridge')).toEqual(['bridge']);
    for (const [id, names] of pythonNames) {
      const item = MODULE_MANIFESTS.find((entry) => entry.id === id);
      const labs = item?.labs === '*' ? ['vision', 'esp32', 'dev'] : [...(item?.labs ?? [])];
      for (const labId of labs) {
        const comm = moduleLoadPlan(labId).groups.find((group) => group.name === 'comm');
        for (const name of names) {
          expect(comm && groupWantedByCode(comm, `import ${name}\n`), `${labId}: import ${name}`).not.toBeNull();
          expect(comm && groupWantedByCode(comm, `from ${name} import *\n`), `${labId}: from ${name} import *`).not.toBeNull();
        }
      }
    }
  });

  it('통신 무리의 파이썬 요청은 host가 자리를 맡아 둔다(코드 모양으로 못 알아본 import도 받은 뒤 처리)', () => {
    const vision = moduleLoadPlan('vision').groups.find((group) => group.name === 'comm');
    expect(vision && [...groupRequestKinds(vision).keys()].sort()).toEqual(['ble-pc.close', 'ble-pc.open', 'serial-pc.open']);
    const esp32 = moduleLoadPlan('esp32').groups.find((group) => group.name === 'comm');
    expect(esp32 && [...groupRequestKinds(esp32).keys()].sort()).toEqual(['mqtt.connect', 'mqtt.disconnect', 'mqtt.publish', 'mqtt.subscribe']);
    // 주소·창 이벤트로도 부른다
    expect(esp32 && groupWantedByQuery(esp32, '?bridge=zaneabridge3')).toBe('vision-bridge');
    expect(esp32 && groupWantedByQuery(esp32, '?prefix=zaneabridge3&example=esp32%2Ftemplates%2Fdashboard-demo.py')).toBe('mqtt');
    expect(esp32 && groupWindowEvents(esp32).sort()).toEqual(['apc:data-port-show', 'apc:web-bluetooth-show']);
  });
});
