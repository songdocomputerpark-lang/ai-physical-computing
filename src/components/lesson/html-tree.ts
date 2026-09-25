/**
 * 차시 본문 HTML(마크다운 → rehype-stringify가 만든 잘 닫힌 HTML)을 가벼운 나무로 읽는 도우미.
 * 차시 검사 규칙(lesson-rules.ts)이 "이 칸 안에 왜그럴까 상자가 있나", "목록 항목이 몇 개인가" 같은 것을 물을 때 쓴다.
 *
 * - 브라우저 DOM 없이(빌드·Node 검사·Vitest) 돌아야 해서 정규식으로 태그를 읽는 작은 파서다. 완전한 HTML 파서가 아니다:
 *   빈 요소(img·br 등)와 스스로 닫는 태그(<… />)를 알고, 닫는 태그가 어긋나면 가장 가까운 같은 이름까지 닫는다.
 * - 주석(<!-- -->)과 <script>·<style>·<pre> 안의 글자는 요소로 읽지 않는다(코드 블록 속 "<img"가 그림으로 세어지지 않게).
 */

export interface HtmlElement {
  readonly type: 'element';
  readonly tag: string;
  readonly attrs: Readonly<Record<string, string>>;
  readonly children: HtmlNode[];
}

export interface HtmlText {
  readonly type: 'text';
  readonly text: string;
}

export type HtmlNode = HtmlElement | HtmlText;

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
/** 안의 글자를 태그로 읽지 않는 요소 */
const RAW_TEXT_TAGS = new Set(['script', 'style', 'pre', 'textarea']);
const ATTRIBUTE_PATTERN = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gu;
const NAMED_REFERENCES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** 흔한 문자 참조(&amp; &#39; &#x27; …)를 글자로 되돌린다 */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/giu, (whole, body: string) => {
    if (body.startsWith('#')) {
      const code = body[1] === 'x' || body[1] === 'X' ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10);
      return Number.isInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return NAMED_REFERENCES[body.toLowerCase()] ?? whole;
  });
}

function parseAttributes(text: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of text.matchAll(ATTRIBUTE_PATTERN)) {
    const name = match[1]?.toLowerCase();
    if (name) {
      attrs[name] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
    }
  }
  return attrs;
}

interface MutableElement {
  type: 'element';
  tag: string;
  attrs: Record<string, string>;
  children: HtmlNode[];
}

/** HTML 조각을 나무로 읽는다. 뿌리는 이름 없는 요소(#root)다. */
export function parseHtml(html: string): HtmlElement {
  const root: MutableElement = { type: 'element', tag: '#root', attrs: {}, children: [] };
  const stack: MutableElement[] = [root];
  const tagPattern = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w:-]*)((?:\s+[^\s"'<>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/gu;
  let cursor = 0;
  let rawUntil: string | undefined;

  const current = (): MutableElement => stack[stack.length - 1] ?? root;
  const pushText = (text: string) => {
    if (text !== '') {
      current().children.push({ type: 'text', text: decodeEntities(text) });
    }
  };

  for (const match of html.matchAll(tagPattern)) {
    const index = match.index ?? 0;
    const [whole, closing, rawName, attrText, selfClosing] = match;
    const name = (rawName ?? '').toLowerCase();
    if (rawUntil !== undefined) {
      // <pre>·<script> 안: 같은 이름의 닫는 태그가 나올 때까지 글자로 둔다.
      if (closing === '/' && name === rawUntil) {
        pushText(html.slice(cursor, index));
        stack.pop();
        rawUntil = undefined;
        cursor = index + whole.length;
      }
      continue;
    }
    pushText(html.slice(cursor, index));
    cursor = index + whole.length;
    if (whole.startsWith('<!--')) {
      continue;
    }
    if (closing === '/') {
      const at = stack.map((element) => element.tag).lastIndexOf(name);
      if (at > 0) {
        stack.length = at;
      }
      continue;
    }
    const element: MutableElement = { type: 'element', tag: name, attrs: parseAttributes(attrText ?? ''), children: [] };
    current().children.push(element);
    if (VOID_TAGS.has(name) || selfClosing === '/') {
      continue;
    }
    stack.push(element);
    if (RAW_TEXT_TAGS.has(name)) {
      rawUntil = name;
    }
  }
  pushText(html.slice(cursor));
  return root;
}

/** 요소의 class 목록 */
export function classList(element: HtmlElement): string[] {
  return (element.attrs.class ?? '').split(/\s+/u).filter(Boolean);
}

export function hasClass(element: HtmlElement, name: string): boolean {
  return classList(element).includes(name);
}

/** 바로 아래 자식 요소 */
export function childElements(element: HtmlElement): HtmlElement[] {
  return element.children.filter((child): child is HtmlElement => child.type === 'element');
}

/** 모든 자손 요소(문서 순서) 가운데 조건에 맞는 것 */
export function findAll(element: HtmlElement, predicate: (candidate: HtmlElement) => boolean): HtmlElement[] {
  const found: HtmlElement[] = [];
  const walk = (node: HtmlElement) => {
    for (const child of childElements(node)) {
      if (predicate(child)) {
        found.push(child);
      }
      walk(child);
    }
  };
  walk(element);
  return found;
}

/** 요소 안의 글자(공백은 한 칸으로) */
export function textContent(node: HtmlNode): string {
  const collect = (current: HtmlNode): string =>
    current.type === 'text' ? current.text : current.children.map((child) => collect(child)).join('');
  return collect(node).replace(/\s+/gu, ' ').trim();
}

/** 자식에 글자(공백 아닌 것)나 요소가 하나라도 있는지 */
export function hasContent(nodes: readonly HtmlNode[]): boolean {
  return nodes.some((node) => node.type === 'element' || node.text.trim() !== '');
}
