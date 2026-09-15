// 용어사전 단위 테스트가 함께 쓰는 도우미(파일 이름이 .test.ts가 아니라서 테스트로 돌지 않는다).
import { markdownConfigDefaults, unified } from '@astrojs/markdown-remark';
import remarkDirective from 'remark-directive';
import remarkBoxes from '../../../src/lib/remark-boxes.mjs';
import remarkGlossary from '../../../src/lib/remark-glossary.mjs';

/**
 * astro.config.mjs와 같은 순서(remarkDirective → remarkGlossary → remarkBoxes)로 마크다운을 HTML로 바꾼다.
 * 용어 표시의 1단계(표시 자리 <glossary-term>)까지만 거친 HTML이 나온다.
 */
export async function renderMarkdown(markdown: string, fileURL?: URL): Promise<string> {
  const processor = unified({
    remarkPlugins: [remarkDirective, remarkGlossary, remarkBoxes] as never,
  });
  const renderer = await processor.createRenderer({ ...markdownConfigDefaults, syntaxHighlight: false });
  const { code } = await renderer.render(markdown, fileURL ? { fileURL } : undefined);
  return code;
}
