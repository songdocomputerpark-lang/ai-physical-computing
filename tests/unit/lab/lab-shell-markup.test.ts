// 실습실 틀(LabShell.astro)의 화면 뼈대 약속(판 1.3.0 검수 R1-096·R1-099·R1-108). 진짜 화면 위치는 tests/e2e/labs-ui.spec.ts가 본다 —
// 여기서는 소스 글에서 순서·표시·규칙이 빠지지 않았는지만 지킨다(브라우저 없이).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync(path.resolve(import.meta.dirname, '../../../src/components/lab/LabShell.astro'), 'utf8');
const markup = source.slice(source.indexOf('<div\n  class="lab"'), source.indexOf('<script>'));
const style = source.slice(source.indexOf('<style>'));

function indexOfOrFail(text: string, needle: string): number {
  const index = text.indexOf(needle);
  expect(index, `"${needle}"이(가) 없어요`).toBeGreaterThanOrEqual(0);
  return index;
}

describe('조작 줄 묶음(.lab__bar)', () => {
  it('조작 줄 → 상태 줄 → 안내 줄이 한 묶음 안에 이 차례로 있고, 코치 줄은 묶음 밖 바로 아래에 있다', () => {
    const bar = indexOfOrFail(markup, 'class="lab__bar" data-lab-bar');
    const toolbar = indexOfOrFail(markup, 'data-lab-toolbar');
    const status = indexOfOrFail(markup, 'data-lab-status');
    const message = indexOfOrFail(markup, 'data-lab-message');
    const coach = indexOfOrFail(markup, 'data-lab-coach');
    const intro = indexOfOrFail(markup, 'class="lab__intro" data-lab-intro');
    expect(bar).toBeLessThan(toolbar);
    expect(toolbar).toBeLessThan(status);
    expect(status).toBeLessThan(message);
    expect(message).toBeLessThan(coach);
    expect(coach).toBeLessThan(intro);
    // 코치 줄 앞에서 묶음이 닫힌다(코치 줄은 붙지 않는다)
    expect(markup.slice(message, coach)).toContain('</div>');
  });

  it('Tab 차례(DOM 차례)는 [실행] → [정지] → [초기화] → 예제 선택 → [예제 불러오기] → [공유 링크] → [.py 내려받기]다', () => {
    const order = ['data-lab-run', 'data-lab-stop', 'data-lab-reset', 'data-lab-example-select', 'data-lab-example-load', 'data-lab-share', 'data-lab-download'].map((name) =>
      indexOfOrFail(markup, name),
    );
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('[실행] 접근 이름은 "실행" 그대로다', () => {
    expect(markup).toMatch(/<button[^>]*data-lab-run[^>]*>실행<\/button>/u);
  });

  it('틀은 세로 flex + 폭 컨테이너(lab)이고, 붙는 규칙은 틀 폭·화면 높이·임베드 아님을 본다', () => {
    expect(style).toMatch(/\.lab \{[^}]*display: flex;[^}]*flex-direction: column;[^}]*container-name: lab;[^}]*container-type: inline-size;/u);
    expect(style).toContain('@container lab (min-width: 72rem)');
    expect(style).toContain('position: sticky;');
    expect(style).toContain('(max-height: 39.99rem)');
    expect(style).toContain('[data-embed]');
  });

  it('칸 배치(두 열)는 @media가 아니라 틀 폭 컨테이너 질의다(html 글자 크기를 키우면 한 열 — R1-108)', () => {
    expect(style).toContain('@container lab (min-width: 60rem)');
    expect(style).not.toContain('@media (min-width: 64rem)');
    expect(source).toContain('container-name: lab-io;');
  });
});

describe('코치 줄과 안내 글', () => {
  it('코치 줄은 해요체 문장이다("예제를 골라요 → [실행]을 눌러요 → 결과를 봐요" — R1-117)', () => {
    expect(markup).toContain('<li>예제를 골라요</li>');
    expect(markup).toContain('<li>[실행]을 눌러요</li>');
    expect(markup).toContain('<li>결과를 봐요</li>');
  });

  it('예제 선택 상자의 이름은 학생 말로 다듬어 그린다(R1-100)', () => {
    expect(markup).toContain('studentExampleTitle(example.title)');
    expect(markup).toContain('studentExampleTitle(group.label)');
  });

  it('고른 예제 이름 전체를 보이는 줄이 선택 상자 바로 뒤에 있고, 선택 상자가 이미 읽어 주므로 보조기기에는 숨긴다(R3-005)', () => {
    expect(markup).toContain('<span class="lab__example-name" data-lab-example-name aria-hidden="true"></span>');
  });
});
