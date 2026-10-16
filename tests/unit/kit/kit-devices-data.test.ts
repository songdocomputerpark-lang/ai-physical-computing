// 키트 장치 도감 자료(판 1.5.0 구역 K1)의 짜임 검사 — content/kit/devices.yaml ↔ examples/esp32/kit/** ↔ 회로 그림 ↔ 부품 사진 ↔ 보드 라이브러리.
// 자료는 scripts/kit/generate-kit.mjs가 만들고 그 뒤로는 사람이 고친다(MAINTENANCE 16절). 새 장치를 더하다 빠뜨린 것을 여기서 먼저 잡는다.
// 코드(.py)가 브릭셀 쪽 글 그대로인지는 원본(.cache)이 없는 컴퓨터에서도 돌도록 줄 끝·끝 줄바꿈·문법만 본다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { describe, expect, it } from 'vitest';
import { readExampleSidecars } from '../../../src/lab/controls/example-sidecar.ts';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const EXAMPLES = path.join(ROOT, 'examples');
const LIB_DIR = path.join(EXAMPLES, 'esp32', 'lib', 'third-party');

interface KitStep {
  n: number;
  kind: string;
  title: string;
  file: string;
  virtual: string;
  points: string[];
}
interface KitLibrary {
  name: string;
  file: string;
  site: boolean;
  url?: string;
}
interface KitDevice {
  id: string;
  number: string;
  chapter: number;
  name: string;
  part: string;
  libraries: KitLibrary[];
  wiring: string[];
  circuit: string;
  steps: KitStep[];
  support: string;
  virtual: string;
  virtual_reason?: string;
}
interface KitIntro {
  number: string;
  file: string;
  virtual: string;
}
interface KitData {
  source: { url: string };
  chapters: { n: number; name: string }[];
  intro: KitIntro[];
  devices: KitDevice[];
}

const data = YAML.parse(fs.readFileSync(path.join(ROOT, 'content', 'kit', 'devices.yaml'), 'utf8')) as KitData;
const partIds = new Set([...fs.readFileSync(path.join(ROOT, 'content', 'parts', 'parts.yaml'), 'utf8').matchAll(/\{id:\s*([a-z0-9-]+)/gu)].map((match) => match[1]));

function walk(dir: string, suffix: string, found: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, suffix, found);
    } else if (entry.name.endsWith(suffix)) {
      found.push(full);
    }
  }
  return found.sort();
}
const kitFiles = walk(path.join(EXAMPLES, 'esp32', 'kit'), '.py').map((file) => path.relative(EXAMPLES, file).split(path.sep).join('/'));
const sidecarRaw: Record<string, string> = {};
for (const file of walk(path.join(EXAMPLES, 'esp32', 'kit'), '.meta.yaml')) {
  sidecarRaw['/' + path.relative(ROOT, file).split(path.sep).join('/')] = fs.readFileSync(file, 'utf8');
}
const sidecars = readExampleSidecars(sidecarRaw);
const rawSidecar = (file: string) => YAML.parse(sidecarRaw[`/examples/${file.replace(/\.py$/u, '.meta.yaml')}`] ?? '') as Record<string, any>;

describe('키트 장치 도감 자료(content/kit/devices.yaml)', () => {
  it('장치 101개(2장 14·3장 21·4장 30·5장 12·6장 10·7장 5·8장 9)이고 id·번호는 겹치지 않는다', () => {
    expect(data.devices).toHaveLength(101);
    const perChapter: Record<number, number> = {};
    for (const device of data.devices) {
      perChapter[device.chapter] = (perChapter[device.chapter] ?? 0) + 1;
    }
    expect(perChapter).toEqual({ 2: 14, 3: 21, 4: 30, 5: 12, 6: 10, 7: 5, 8: 9 });
    expect(new Set(data.devices.map((device) => device.id)).size).toBe(101);
    expect(new Set(data.devices.map((device) => device.number)).size).toBe(101);
    for (const device of data.devices) {
      expect(typeof device.number, device.id).toBe('string');
      const [chapter, seq] = device.number.split('.');
      expect(device.id, device.number).toBe(`d-${chapter}-${seq}`);
      expect(Number(chapter), device.id).toBe(device.chapter);
    }
  });

  it('장 이름표는 1~8장이고 1장 시작하기 코드는 10개다(브릭셀 쪽 12개 가운데 웹 전용 1.7.7 brx_ble.py·boot.py 블록은 싣지 않음 — 판 1.5.0 K3a)', () => {
    expect(data.chapters.map((chapter) => chapter.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(data.intro).toHaveLength(10);
    expect(data.intro.map((item) => item.file)).not.toContain('esp32/kit/ch1/1-7-7-brx-ble.py');
    expect(data.intro.map((item) => item.file)).not.toContain('esp32/kit/ch1/1-7-7-boot-block.py');
  });

  it('장치마다 사진 id(부품 사전)·회로 그림 파일·배선 줄·두 단계가 있고 단계 파일이 실제로 있다', () => {
    const circuitDir = path.join(ROOT, 'public', 'images', 'kit', 'circuits', 'third-party', 'kit-vendor');
    for (const device of data.devices) {
      expect(partIds.has(device.part), `${device.id}의 부품 사진 ${device.part}이(가) content/parts/parts.yaml에 있어야 해요`).toBe(true);
      expect(fs.existsSync(path.join(circuitDir, device.circuit)), `${device.id}의 회로 그림 ${device.circuit}`).toBe(true);
      expect(device.wiring.length, `${device.id} 배선 줄`).toBeGreaterThan(0);
      expect(device.steps.map((step) => step.n), device.id).toEqual([1, 2]);
      for (const step of device.steps) {
        expect(kitFiles, `${device.id} 단계 ${step.n}: examples/${step.file}`).toContain(step.file);
        expect(step.file).toMatch(new RegExp(`^esp32/kit/ch${device.chapter}/${device.chapter}-\\d\\d-[a-z0-9-]+-${step.n}\\.py$`, 'u'));
      }
    }
    // 회로 그림은 100장(8.06은 8.05와 같은 그림)이고 목록 밖 파일은 없다
    const used = new Set(data.devices.map((device) => device.circuit));
    expect(used.size).toBe(100);
    expect(fs.readdirSync(circuitDir).sort()).toEqual([...used].sort());
    expect(data.devices.find((device) => device.id === 'd-8-06')?.circuit).toBe('d-8-05.webp');
  });

  it('분류(A·B1·B2·C)와 가상 보드 정도(full·partial·real-only)는 정해진 값이고, 끝까지 안 되는 장치는 까닭이 있다', () => {
    const counts: Record<string, number> = { A: 0, B1: 0, B2: 0, C: 0 };
    for (const device of data.devices) {
      expect(['A', 'B1', 'B2', 'C'], device.id).toContain(device.support);
      expect(['full', 'partial', 'real-only'], device.id).toContain(device.virtual);
      counts[device.support] = (counts[device.support] ?? 0) + 1;
      if (device.virtual !== 'full') {
        expect(device.virtual_reason, `${device.id}는 가상 보드에서 끝까지 되지 않으니 까닭(virtual_reason)이 있어야 해요`).toBeTruthy();
      }
      if (device.support === 'B2' || device.support === 'C') {
        expect(device.virtual, device.id).toBe('real-only');
      }
    }
    expect(counts).toEqual({ A: 14, B1: 48, B2: 29, C: 10 });
  });

  it('라이브러리: site:true는 보드 라이브러리 파일이 실제로 있고, 싣지 않는 것(site:false)은 브릭셀 내려받기 주소를 가진다', () => {
    const present = new Set(fs.readdirSync(LIB_DIR).filter((name) => name.endsWith('.py')));
    for (const device of data.devices) {
      for (const library of device.libraries) {
        if (library.site) {
          expect(present.has(library.file), `${device.id}: examples/esp32/lib/third-party/${library.file}`).toBe(true);
        } else {
          expect(library.url, `${device.id}의 ${library.name}`).toMatch(/^https:\/\/brixel\.gorillacell\.kr\/07_thonny\/03_esp32\/downloads\/libs\//u);
        }
      }
    }
    // 사용 조건이 사이트에 싣기에 맞지 않는 두 파일은 절대 싣지 않는다(GPL·독일 자유 소프트웨어 라이선스)
    expect(present.has('apds9960.py')).toBe(false);
    expect(present.has('pyfingerprint.py')).toBe(false);
  });

  it('1장 시작하기 코드 10개의 파일이 있다', () => {
    for (const item of data.intro) {
      expect(kitFiles, item.number).toContain(item.file);
      expect(item.file).toMatch(/^esp32\/kit\/ch1\//u);
    }
  });
});

describe('키트 장치 도감 예제 파일(examples/esp32/kit/**)', () => {
  it('코드 212개(장치 202 + 1장 10)이고 모두 사이드카가 짝으로 있다', () => {
    expect(kitFiles).toHaveLength(212);
    for (const file of kitFiles) {
      expect(Object.keys(sidecarRaw), file).toContain(`/examples/${file.replace(/\.py$/u, '.meta.yaml')}`);
    }
  });

  it('코드는 줄 끝 LF·끝 줄바꿈 하나·UTF-8이고 탭 들여쓰기가 없다(브릭셀 쪽 글 그대로)', () => {
    for (const file of kitFiles) {
      const bytes = fs.readFileSync(path.join(EXAMPLES, file));
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      expect(text.includes('\r'), `${file}에 CR`).toBe(false);
      expect(text.endsWith('\n') && !text.endsWith('\n\n'), `${file}의 끝 줄바꿈`).toBe(true);
      expect(/^\t/mu.test(text), `${file}의 탭 들여쓰기`).toBe(false);
    }
  });

  it('사이드카는 제목·설명·난이도(1~3)·낱말·kit·source·virtual·실습 방법(practice)을 갖추고 배선 문제가 없다', () => {
    for (const file of kitFiles) {
      const raw = rawSidecar(file);
      const sidecar = sidecars[`/examples/${file}`];
      expect(sidecar, file).toBeDefined();
      expect(sidecar?.title, file).toBeTruthy();
      expect(sidecar?.description, file).toBeTruthy();
      expect([1, 2, 3], file).toContain(sidecar?.difficulty);
      expect(sidecar?.tags, file).toContain('키트 도감');
      expect(raw.source, file).toBe('brixel');
      expect(['full', 'partial', 'real-only'], file).toContain(raw.virtual);
      expect(Array.isArray(raw.practice) && raw.practice.length >= 2, `${file} practice`).toBe(true);
      expect(sidecar?.partErrors ?? [], file).toEqual([]);
      expect(raw.kit && (raw.kit.device || raw.kit.intro), `${file} kit 칸`).toBeTruthy();
    }
  });

  it('사이드카 kit.device·kit.step이 devices.yaml의 단계 파일과 맞는다', () => {
    const byFile = new Map<string, { device: string; step: number; virtual: string }>();
    for (const device of data.devices) {
      for (const step of device.steps) {
        byFile.set(step.file, { device: device.id, step: step.n, virtual: step.virtual });
      }
    }
    for (const item of data.intro) {
      byFile.set(item.file, { device: '', step: 0, virtual: item.virtual });
    }
    expect(byFile.size).toBe(212);
    for (const file of kitFiles) {
      const expected = byFile.get(file);
      expect(expected, `${file}이(가) devices.yaml에 없어요`).toBeDefined();
      const raw = rawSidecar(file);
      if (expected && expected.device !== '') {
        expect(raw.kit?.device, file).toBe(expected.device);
        expect(raw.kit?.step, file).toBe(expected.step);
      }
      expect(raw.virtual, file).toBe(expected?.virtual);
    }
  });

  it('virtual이 full이면 virtual_ok: true, real-only면 virtual_ok: false와 까닭(virtual_reason)이 있다(갤러리의 "하드웨어 없이 되나" 칸)', () => {
    for (const file of kitFiles) {
      const raw = rawSidecar(file);
      if (raw.virtual === 'full') {
        expect(raw.virtual_ok, file).toBe(true);
      }
      if (raw.virtual === 'real-only') {
        expect(raw.virtual_ok, file).toBe(false);
        expect(raw.virtual_reason, file).toBeTruthy();
      }
    }
  });
});
