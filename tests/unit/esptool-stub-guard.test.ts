// esptool-js 플래셔 스텁(GPL-2.0-or-later)을 배포 번들에서 빼는 Vite 플러그인 검사(PLAN PD-38, scripts/lib/esptool-stub-guard.mjs).
// 마지막 검사는 설치된 Vite로 esptool-js를 실제로 묶어 스텁 내용이 결과에 없는지 본다(사이트 빌드와 같은 플러그인·같은 패키지).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ESPTOOL_STUB_EXCLUDED_MESSAGE,
  ESPTOOL_STUB_VIRTUAL_PREFIX,
  esptoolStubGuardPlugin,
  excludedStubModuleCode,
  isEsptoolStubId,
} from '../../scripts/lib/esptool-stub-guard.mjs';
import { makeTempDir, removeDir } from './helpers/fixture.ts';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

describe('esptool 플래셔 스텁 빼기 플러그인', () => {
  it('esptool-js 패키지 안의 스텁 JSON 경로만 알아본다', () => {
    expect(isEsptoolStubId('C:\\repo\\node_modules\\esptool-js\\lib\\targets\\stub_flasher\\stub_flasher_32.json')).toBe(true);
    expect(isEsptoolStubId('/repo/node_modules/esptool-js/lib/targets/stub_flasher/stub_flasher_32c61.json?import')).toBe(true);
    expect(isEsptoolStubId('/repo/node_modules/esptool-js/lib/targets/esp32.js')).toBe(false);
    expect(isEsptoolStubId('/repo/src/stub_flasher/stub_flasher_32.json')).toBe(false);
  });

  it('스텁 import를 가상 모듈로 바꾸고, 그 모듈은 한국어 오류를 던진다', async () => {
    const plugin = esptoolStubGuardPlugin();
    const context = {
      resolve: async (source: string) => ({ id: `/repo/node_modules/esptool-js/lib/${source.replace(/^\.\//u, '')}` }),
    };
    const id = await plugin.resolveId.call(context, './targets/stub_flasher/stub_flasher_32.json', '/repo/node_modules/esptool-js/lib/stubFlasher.js');
    expect(id).toBe(`${ESPTOOL_STUB_VIRTUAL_PREFIX}stub_flasher_32.js`);
    expect(await plugin.resolveId.call(context, './targets/esp32.js', '/repo/node_modules/esptool-js/lib/esploader.js')).toBeNull();
    const code = plugin.load(id ?? '');
    expect(code).toBe(excludedStubModuleCode('stub_flasher_32.json'));
    expect(() => new Function(code ?? '')()).toThrow(ESPTOOL_STUB_EXCLUDED_MESSAGE);
    expect(plugin.load('/repo/src/a.ts')).toBeNull();
  });

  it('설치된 Vite로 esptool-js를 묶으면 스텁 프로그램이 결과에 없고 오류 모듈만 남는다', async () => {
    const stubJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', 'esptool-js', 'lib', 'targets', 'stub_flasher', 'stub_flasher_32.json'), 'utf8')) as {
      text: string;
    };
    const dir = makeTempDir('apc-esptool-guard-');
    try {
      const entry = path.join(dir, 'entry.js');
      fs.writeFileSync(entry, "import { ESPLoader, getStubJsonByChipName } from 'esptool-js';\nexport { ESPLoader, getStubJsonByChipName };\n", 'utf8');
      const { build } = await import('vite');
      const result = await build({
        root: dir,
        logLevel: 'silent',
        configFile: false,
        resolve: { alias: { 'esptool-js': path.join(ROOT, 'node_modules', 'esptool-js', 'lib', 'index.js') } },
        plugins: [esptoolStubGuardPlugin()],
        build: { write: false, lib: { entry, formats: ['es'], fileName: 'probe' }, minify: false },
      });
      const outputs = (Array.isArray(result) ? result : [result]).flatMap((item) => ('output' in item ? item.output : []));
      const code = outputs.map((chunk) => ('code' in chunk ? chunk.code : String((chunk as { source?: unknown }).source ?? ''))).join('\n');
      expect(code).toContain('ESPLoader');
      expect(code).toContain('esptool-js의 플래셔 스텁(GPL-2.0-or-later)은 이 사이트에 싣지 않아요');
      // 스텁 프로그램 본문(base64)이 한 조각도 들어가지 않았다
      expect(code).not.toContain(stubJson.text.slice(0, 64));
    } finally {
      removeDir(dir);
    }
  }, 60_000);
});
