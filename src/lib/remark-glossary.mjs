// 용어 표시 문법(PLAN §8.1 P1-07, SPEC §7.1) — 마크다운의 :용어[픽셀] 을 "용어 표시 자리"로 바꾸는 remark 플러그인.
//
// 쓰는 법(마크다운)
//   :용어[픽셀]              본문의 "픽셀"을 용어사전 항목과 잇는다. 항목의 title·aliases·english 가운데 같은 말을 찾는다.
//                           띄어쓰기와 영문 대소문자는 가리지 않는다(:용어[정규화좌표] = :용어[정규화 좌표]).
//   :용어[화소]{항목=pixel}   보이는 말과 항목 이름이 다를 때 항목 id(content/glossary/pixel.md → pixel)를 적는다.
//   :용어[화소]{#pixel}       위와 같은 뜻의 짧은 모양(id 속성).
//   :term[pixel]            지시문 이름 term은 용어와 같은 뜻이다.
//   조사는 대괄호 밖에 붙인다: ":용어[픽셀]은", ":용어[센서]를"
//
// 화면에 보이는 모습(SPEC §7.1 "용어 첫 등장 시 굵게 + 툴팁 + 용어사전 링크")
// - 글 한 편(GlossaryScope 하나) 안에서 같은 항목이 처음 나온 곳만 굵은 링크 + 풀이 툴팁이 되고, 다음부터는 보통 글자다.
// - 제목(#)·링크·상자 제목(:::도전[…]) 안과 용어 표시 안의 용어 표시는 글자만 남기고 빌드 로그에 알린다.
//   제목 속 링크, 링크 속 링크, 누르면 접히는 상자 제목 속 링크를 만들지 않으려고.
// - 용어사전에 없는 말은 글자만 보이고 빌드 로그에 경고가 남는다. 빌드는 멈추지 않는다.
//   근거: PD-35(빌드는 frontmatter 형식 오류에서만 멈춘다), 상자 문법의 모르는 이름과 같은 방식,
//   새 낱말 항목보다 차시가 먼저 올라가도 배포가 막히지 않게. 엄격한 검사는 차시 검사(P5-02 check:lessons)가 맡을 수 있다.
//
// 두 단계로 나눈 이유
//   1단계(이 파일, 마크다운 → HTML): :용어[…] 를 <glossary-term> 표시 자리로만 바꾼다. 용어사전 내용은 읽지 않는다.
//   2단계(페이지를 만들 때, src/components/glossary/GlossaryScope.astro): 표시 자리를 용어사전과 맞춰 링크·툴팁으로 바꾼다.
//   Astro는 content/의 마크다운을 HTML로 바꾼 결과를 캐시(node_modules/.astro/data-store.json)에 두고
//   파일 내용이 같으면 다시 바꾸지 않는다(astro/dist/content/loaders/glob.js의 digest 비교, 2026-09-16 확인).
//   배포 워크플로의 withastro/action v6도 이 캐시를 다음 실행에 되살린다(action.yml의 "Restore Astro cache", 같은 날 확인).
//   그래서 1단계에서 풀이 글을 HTML에 넣으면, 용어사전만 고쳤을 때 차시 페이지의 툴팁이 옛 글로 남는다.
//   2단계는 빌드할 때마다 새로 돌기 때문에 용어사전을 고치면 모든 페이지에 곧바로 반영된다.
//
// 페이지에서 쓰는 법: 마크다운 본문을 GlossaryScope로 감싼다.
//   <GlossaryScope><Content /></GlossaryScope>
//   감싸지 않으면 표시 자리가 보통 글자처럼 보인다(굵게·툴팁·링크 없음, 글은 그대로 읽힌다).
//
// 다른 플러그인과의 약속(src/lib/remark-boxes.mjs 머리말과 같다)
// - astro.config.mjs에서 remarkDirective → remarkGlossary(이 파일) → remarkBoxes 순서로 돈다.
// - 처리한 지시문은 node.data.hName을 채우거나 글자 노드로 풀어 둔다.
//   remark-boxes는 hName이 없는 지시문을 "문법으로 쓴 것이 아닌 글자"(예: 10:30)로 보고 원래 글자로 되돌린다.
// - 대괄호가 없는 ":용어"는 건드리지 않는다(remark-boxes가 원래 글자로 되돌린다).
// - 코드 블록과 인라인 코드 안의 :용어[…]는 remark-directive가 지시문으로 읽지 않아 그대로 남는다.
//
// Node.js가 직접 읽으므로(astro.config.mjs) JavaScript(JSDoc 타입 표기)로 쓴다.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** 용어 표시 지시문 이름 */
export const GLOSSARY_DIRECTIVE_NAMES = Object.freeze(['용어', 'term']);

/** 항목 id를 적는 속성 이름(앞에서부터 찾는다). {#pixel}은 id 속성이 된다. */
export const GLOSSARY_ENTRY_ATTRIBUTES = Object.freeze(['항목', 'id']);

/** 1단계가 만드는 표시 자리 태그. 사용자 정의 요소 이름 규칙(소문자·하이픈)을 따라서, 2단계를 거치지 않으면 보통 글자처럼 보인다. */
export const GLOSSARY_MARKER_TAG = 'glossary-term';

/**
 * 표시 자리의 속성 이름. 값은 모두 encodeURIComponent로 적는다(따옴표·& 같은 글자를 HTML 문자 참조 없이 그대로 되읽으려고).
 *   text   대괄호 안 글자(꾸밈을 뺀 글자만)
 *   entry  {항목=…}·{#…}으로 적은 항목 id
 *   source 마크다운 파일 위치 "저장소 기준 경로:줄"(경고 문장용, 2단계가 지운다)
 */
export const GLOSSARY_MARKER_ATTRIBUTES = Object.freeze({
  text: 'data-glossary-text',
  entry: 'data-glossary-entry',
  source: 'data-glossary-source',
});

/** 표시 자리를 만들지 않고 글자만 남기는 곳(경고 문장에 들어가는 이름) */
const PLAIN_PLACES = Object.freeze({
  heading: '제목',
  link: '링크',
  label: '상자 제목',
  term: '다른 용어 표시',
});

/**
 * 용어 표시 지시문인지 알려 준다.
 * @param {{ type?: string, name?: string }} node mdast 노드
 * @returns {boolean}
 */
export function isGlossaryDirective(node) {
  return (
    node.type === 'textDirective' &&
    typeof node.name === 'string' &&
    GLOSSARY_DIRECTIVE_NAMES.includes(node.name.normalize('NFC'))
  );
}

/**
 * remark 플러그인
 * @returns {(tree: any, file?: { path?: string | URL }) => void}
 */
export default function remarkGlossary() {
  return (tree, file) => {
    visitChildren(tree, undefined, file);
  };
}

/**
 * 자식 노드를 차례로 보며 용어 표시를 처리한다.
 * @param {any} parent
 * @param {string | undefined} plainPlace 글자만 남겨야 하는 곳의 이름(없으면 undefined)
 * @param {{ path?: string | URL } | undefined} file
 */
function visitChildren(parent, plainPlace, file) {
  if (!Array.isArray(parent?.children)) {
    return;
  }
  for (let index = 0; index < parent.children.length; index += 1) {
    const node = parent.children[index];
    if (isGlossaryDirective(node) && node.children.length > 0) {
      // 대괄호 안의 용어 표시는 먼저 글자로 푼다.
      visitChildren(node, plainPlace ?? PLAIN_PLACES.term, file);
      if (plainPlace) {
        warnPlainPlace(node, plainPlace, file);
        parent.children.splice(index, 1, ...node.children);
        index += node.children.length - 1;
      } else {
        markTerm(node, file);
      }
      continue;
    }
    visitChildren(node, plainPlace ?? plainPlaceOf(node), file);
  }
}

/**
 * 이 노드 안이 글자만 남겨야 하는 곳인지 알려 준다.
 * @param {any} node
 * @returns {string | undefined}
 */
function plainPlaceOf(node) {
  if (node.type === 'heading') {
    return PLAIN_PLACES.heading;
  }
  if (node.type === 'link' || node.type === 'linkReference') {
    return PLAIN_PLACES.link;
  }
  // :::도전[제목] 의 대괄호 부분(remark-directive가 data.directiveLabel을 붙인 문단)
  if (node.type === 'paragraph' && node.data?.directiveLabel === true) {
    return PLAIN_PLACES.label;
  }
  return undefined;
}

/**
 * 지시문 노드를 <glossary-term> 표시 자리로 바꾼다(mdast의 data.hName·hProperties를 채우면 HTML로 바뀔 때 반영된다).
 * @param {any} node
 * @param {{ path?: string | URL } | undefined} file
 */
function markTerm(node, file) {
  // 대괄호 안의 링크는 풀어 둔다(2단계가 표시 자리를 링크로 감싸므로 링크 속 링크가 되지 않게).
  node.children = unwrapLinks(node.children);
  /** @type {Record<string, string>} */
  const properties = { dataGlossaryText: encodeURIComponent(glossaryLabelText(node.children)) };
  const entry = entryAttribute(node.attributes);
  if (entry) {
    properties.dataGlossaryEntry = encodeURIComponent(entry);
  }
  const source = sourceOf(node, file);
  if (source) {
    properties.dataGlossarySource = encodeURIComponent(source);
  }
  node.data = { ...node.data, hName: GLOSSARY_MARKER_TAG, hProperties: properties };
}

/**
 * 링크 노드를 그 안의 글자로 푼다.
 * @param {any[]} nodes
 * @returns {any[]}
 */
function unwrapLinks(nodes) {
  return nodes.flatMap((node) => {
    if (node.type === 'link' || node.type === 'linkReference') {
      return unwrapLinks(node.children ?? []);
    }
    if (Array.isArray(node.children)) {
      node.children = unwrapLinks(node.children);
    }
    return [node];
  });
}

/**
 * 대괄호 안 노드에서 꾸밈을 뺀 글자만 모은다(연속한 공백은 하나로).
 * @param {any[]} nodes
 * @returns {string}
 */
export function glossaryLabelText(nodes) {
  return collectText(nodes).replace(/\s+/gu, ' ').trim();
}

/**
 * @param {any[]} nodes
 * @returns {string}
 */
function collectText(nodes) {
  return nodes
    .map((node) => {
      if (node.type === 'text' || node.type === 'inlineCode') {
        return typeof node.value === 'string' ? node.value : '';
      }
      if (node.type === 'break') {
        return ' ';
      }
      if (node.type === 'image' || node.type === 'imageReference') {
        return typeof node.alt === 'string' ? node.alt : '';
      }
      return Array.isArray(node.children) ? collectText(node.children) : '';
    })
    .join('');
}

/**
 * {항목=pixel} 또는 {#pixel}에 적은 항목 id
 * @param {Record<string, string | null | undefined> | null | undefined} attributes
 * @returns {string | undefined}
 */
function entryAttribute(attributes) {
  if (!attributes) {
    return undefined;
  }
  const byName = new Map(Object.entries(attributes).map(([key, value]) => [key.normalize('NFC'), value]));
  for (const name of GLOSSARY_ENTRY_ATTRIBUTES) {
    const value = byName.get(name);
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
  }
  return undefined;
}

/**
 * 경고 문장에 쓸 위치 "경로:줄"(파일을 모르면 빈 글자)
 * @param {any} node
 * @param {{ path?: string | URL } | undefined} file
 * @returns {string}
 */
function sourceOf(node, file) {
  const filePath = displayPath(file?.path);
  if (!filePath) {
    return '';
  }
  const line = node.position?.start?.line;
  return line ? `${filePath}:${line}` : filePath;
}

/**
 * 파일 경로를 저장소 기준 경로(/ 구분)로 줄인다. 저장소 밖 파일이면 파일 이름만 돌려준다.
 * 사용자 폴더 같은 절대 경로가 HTML·로그에 남지 않게 하려는 것이다.
 * @param {string | URL | undefined} filePath
 * @returns {string}
 */
export function displayPath(filePath) {
  if (filePath === undefined || filePath === '') {
    return '';
  }
  const absolute =
    filePath instanceof URL || filePath.startsWith('file:') ? fileURLToPath(filePath) : filePath;
  const relative = path.relative(process.cwd(), absolute);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    return path.basename(absolute);
  }
  return relative.split(path.sep).join('/');
}

/**
 * 글자만 남긴 용어 표시를 빌드 로그에 알린다.
 * @param {any} node
 * @param {string} place
 * @param {{ path?: string | URL } | undefined} file
 */
function warnPlainPlace(node, place, file) {
  const source = sourceOf(node, file);
  const where = source ? ` (${source})` : '';
  console.warn(
    `[용어 표시] ${place} 안에 쓴 ":용어[${glossaryLabelText(node.children)}]"${where} — 굵게·풀이·링크 없이 글자만 보여 줘요. 풀이를 달려면 ${place} 밖의 본문 문장에 써요.`,
  );
}
