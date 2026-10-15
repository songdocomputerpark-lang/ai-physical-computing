// 코드 블록 줄 번호 시작값(판 1.4.0 — 교과서 쪽). 마크다운 코드 울타리 뒤 {start=12}를 읽어 <pre>에 시작 번호를 알린다.
//
// 쓰는 법(마크다운): 교과서는 한 프로그램의 코드를 단계마다 나눠 싣고 줄 번호가 이어진다(6번부터, 15번부터 …). 이어지는 번호를 그대로 보이려면
//   ```python {start=15}
//   while True:
//       …
//   ```
//   줄 번호는 화면이 CSS 카운터로 붙인다(src/styles/book.css — 복사해도 따라가지 않는다). 이 변환이 <pre style="--book-line-start:14">로 시작값 - 1을 알리고,
//   book.css가 counter-reset: book-line var(--book-line-start, 0)으로 읽는다. {start=…}가 없으면 1부터다.
// 어디서 도나: astro.config.mjs의 markdown.shikiConfig.transformers (Shiki가 코드 블록을 HTML로 만들 때). 코드 글자·색에는 손대지 않는다.
//   meta 글자는 @astrojs/markdown-remark가 Shiki에 { __raw: '{start=15}' }로 넘긴다(@astrojs/internal-helpers/shiki, 2026-10-16 확인).

/** 울타리 meta 글자에서 start 번호를 읽는다. 없거나 모양이 틀리면 null */
export function parseLineStart(meta) {
  if (typeof meta !== 'string') {
    return null;
  }
  const match = /(?:^|[\s{,])start=(\d{1,4})(?=[\s},]|$)/u.exec(meta);
  const start = match ? Number(match[1]) : 0;
  return start >= 1 ? start : null;
}

/** Shiki 변환기 */
export function shikiLineStart() {
  return {
    name: 'apc-line-start',
    pre(node) {
      const start = parseLineStart(this.options?.meta?.__raw);
      if (start === null) {
        return;
      }
      const style = typeof node.properties.style === 'string' ? node.properties.style.replace(/;?\s*$/u, ';') : '';
      node.properties.style = `${style}--book-line-start:${start - 1}`;
      node.properties.dataLineStart = String(start);
    },
  };
}
