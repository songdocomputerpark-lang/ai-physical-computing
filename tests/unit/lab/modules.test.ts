// 흉내 모듈 폴더 규약의 순수 논리 단위 테스트(src/lab/README.md 4절): manifest 검사(src/lab/modules/manifests.ts)와 hello 모듈의 순수 함수.
// import.meta.glob은 Vite가 처리하므로 여기서는 검사 함수에 가짜 묶음을 넘겨 본다. 실제 폴더 구조는 마지막 묶음이 파일 시스템으로 확인한다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { greeting } from '../../../src/lab/modules/hello/index.ts';
import helloManifest from '../../../src/lab/modules/hello/manifest.ts';
import { folderNameOf, moduleAppliesTo, modulesForLab, shimTableOf, validateManifests } from '../../../src/lab/modules/manifests.ts';
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
