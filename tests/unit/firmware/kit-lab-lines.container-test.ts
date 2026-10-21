// 판 1.6.0 C176(구역 R4)이 .astro 쪽에 더한 것을 Astro Container API로 실제로 그려 본다 — 소스 글 검사(tests/unit/lab/lab-shell-kit-lines.test.ts)로는 못 보는 렌더 결과.
//  · LabShell: starterExampleId → 선택 상자 맨 위 "처음이라면 이것 하나" 묶음(같은 예제가 두 번 나오지 않는다), 실제 보드 전용 안내 줄·"다음 단계" 줄 자리
//  · KitStep: 실제 보드 전용 단계에 "보드 준비하기" 링크를 두지 않는다(링크는 장치 쪽 머리 한 곳 — 한 쪽에 세 번이던 것)
//  · RealBoardPanel: "처음이면 → 보드 준비하기" 첫 줄과 노란 [보드에 저장] 경고 자리
// 컨테이너 설정이 firmware 폴더를 훑어서 이 폴더에 둔다. 실행: npx vitest run --config tests/unit/firmware/vitest.container.config.mjs
import fs from 'node:fs';
import path from 'node:path';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { describe, expect, it } from 'vitest';
import KitStep from '../../../src/components/kit/KitStep.astro';
import { KIT_FILE, parseKitYaml } from '../../../src/components/kit/kit-schema.ts';
import LabShell from '../../../src/components/lab/LabShell.astro';
import RealBoardPanel from '../../../src/components/lab/real-board/RealBoardPanel.astro';

describe('키트 쪽·실습실 틀 (Container API)', () => {
  it('KitStep: 실제 보드 전용 단계에는 "보드 준비하기" 링크가 없다(장치 쪽 머리 한 곳에만)', async () => {
    const data = parseKitYaml(fs.readFileSync(path.join(process.cwd(), KIT_FILE), 'utf8'));
    const device = data.devices.find((candidate) => candidate.id === 'd-3-11')!;
    const container = await AstroContainer.create();
    for (const step of device.steps) {
      const html = await container.renderToString(KitStep, { props: { device, step, code: { html: '<pre class="kit-code"></pre>', lineCount: 1, usesLcd: false } } });
      expect(html).toContain('이 코드는 실제 키트로 해 봐요.');
      expect(html).not.toContain('start/board');
    }
  }, 120_000);

  it('RealBoardPanel: 첫 줄 "처음이면 → 보드 준비하기"와 [보드에 저장] 경고가 있다(경고는 연결된 뒤에만 보이게 CSS로 가린다)', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(RealBoardPanel, {});
    expect(html).toContain('data-real-board-first');
    expect(html).toContain('real-board__warn');
  }, 120_000);

  it('LabShell: starterExampleId가 있으면 선택 상자 맨 위 "처음이라면 이것 하나" 묶음이고, 없으면 묶음이 생기지 않는다', async () => {
    const container = await AstroContainer.create();
    const examples = [
      { id: '01-first-blink', title: '첫 실습: 내장 LED 깜빡이기', code: 'print(1)', group: '첫 실습·사이트 예제' },
      { id: '02-second', title: '둘째', code: 'print(2)', group: '첫 실습·사이트 예제' },
      { id: 'u2-a', title: '2-1-1 동작 테스트', code: 'print(3)', group: '2단원 교과서 실습(피지컬 컴퓨팅)' },
    ];
    const html = await container.renderToString(LabShell, { props: { labId: 'esp32', examples, starterExampleId: '01-first-blink' } });
    const select = html.slice(html.indexOf('<select'), html.indexOf('</select>'));
    expect(select).toContain('label="처음이라면 이것 하나"');
    expect((select.match(/value="01-first-blink"/gu) ?? []).length).toBe(1);
    expect(select.indexOf('처음이라면 이것 하나')).toBeLessThan(select.indexOf('첫 실습·사이트 예제'));
    expect(html).toContain('data-lab-next');
    expect(html).toContain('data-lab-run-note');
    const plain = await container.renderToString(LabShell, { props: { labId: 'esp32', examples } });
    expect(plain).not.toContain('처음이라면 이것 하나');
    // 목록에 없는 id는 아무 일도 없다
    const missing = await container.renderToString(LabShell, { props: { labId: 'esp32', examples, starterExampleId: 'nope' } });
    expect(missing).not.toContain('처음이라면 이것 하나');
  }, 180_000);
});
