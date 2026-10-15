// 코드 울타리 {start=12} → <pre style="--book-line-start:11">(src/lib/shiki-line-start.mjs, 판 1.4.0)
import { markdownConfigDefaults, unified } from '@astrojs/markdown-remark';
import { describe, expect, it } from 'vitest';
import { parseLineStart, shikiLineStart } from '../../../src/lib/shiki-line-start.mjs';

describe('start 읽기', () => {
  it('{start=12}·start=12·여러 칸 사이에서 읽고, 없거나 0이면 null', () => {
    expect(parseLineStart('{start=12}')).toBe(12);
    expect(parseLineStart('start=3')).toBe(3);
    expect(parseLineStart('title="a" {start=15}')).toBe(15);
    expect(parseLineStart('{start=0}')).toBeNull();
    expect(parseLineStart('{restart=5}')).toBeNull();
    expect(parseLineStart('')).toBeNull();
    expect(parseLineStart(undefined)).toBeNull();
  });
});

describe('Shiki 변환', () => {
  async function render(markdown: string): Promise<string> {
    const renderer = await unified().createRenderer({
      ...markdownConfigDefaults,
      shikiConfig: { ...markdownConfigDefaults.shikiConfig, theme: 'github-light-high-contrast', transformers: [shikiLineStart()] },
    });
    return (await renderer.render(markdown)).code;
  }

  it('{start=15}면 <pre>에 시작값 - 1을 CSS 변수로, 없으면 아무것도 붙이지 않는다', async () => {
    const withStart = await render('```python {start=15}\nwhile True:\n    pass\n```');
    expect(withStart).toContain('--book-line-start:14');
    expect(withStart).toContain('data-line-start="15"');
    expect(withStart).toContain('while');
    const plain = await render('```python\nwhile True:\n    pass\n```');
    expect(plain).not.toContain('--book-line-start');
  });
});
