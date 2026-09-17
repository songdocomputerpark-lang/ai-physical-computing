// 같은 사이트 외부 자산 주소(src/lab/vendor-paths.ts)가 설치된 패키지 판과 맞는지 검사(병렬 제작 준비 2026-09-17).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BLOCKLY_VERSION, blocklyMediaPath } from '../../src/lab/vendor-paths.ts';
import { BASE_PATH } from '../../src/lib/url.ts';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

describe('같은 사이트 자산 주소', () => {
  it('Blockly 판이 package.json·설치된 패키지와 같다', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as { dependencies: Record<string, string> };
    const installed = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', 'blockly', 'package.json'), 'utf8')) as { version: string };
    expect(packageJson.dependencies.blockly).toBe(BLOCKLY_VERSION);
    expect(installed.version).toBe(BLOCKLY_VERSION);
  });

  it('Blockly media 주소는 사이트 하위 경로 안의 vendor 폴더이고 /로 끝난다', () => {
    expect(blocklyMediaPath()).toBe(`${BASE_PATH}vendor/blockly/${BLOCKLY_VERSION}/media/`);
    // vendor-assets.mjs가 복사하는 원본 폴더에 Blockly가 부르는 대표 파일이 있다(판이 바뀌어 이름이 달라지면 알 수 있게)
    const media = path.join(ROOT, 'node_modules', 'blockly', 'media');
    for (const file of ['sprites.svg', 'click.mp3', 'delete.mp3']) {
      expect(fs.existsSync(path.join(media, file)), file).toBe(true);
    }
  });
});
