// .astro 줄바꿈 띄어쓰기 검사 — Astro 7이 줄바꿈이 든 공백을 태그·{식} 옆에서 지워 "적고[보내기]를"·"토픽은접두어12글자/…"처럼 낱말이 붙는 것을 막는다.
//
// 왜: Astro 7의 기본 compressHTML은 "jsx"라 JSX와 같은 공백 규칙을 쓴다 — 글과 태그(또는 {식}) 사이의 공백에 줄바꿈이 들어 있으면 그 공백을 통째로 지운다.
// 그래서 글 끝에서 줄을 바꾸고 다음 줄을 <strong>·<a>·<code>로 시작하면 화면에서 두 낱말이 붙는다. CLAUDE.md ".astro 띄어쓰기 주의"에 적힌 함정인데,
// 2026-09-16에 22곳을 고친 뒤에도 두 곳(도움말 쪽 "적고[보내기]", 대시보드 "토픽은<code>")이 다시 생겼다(2026-09-30 최종 점검 PM-09·pages-misc-V01 →
// 재발 막기 요청 R2, PROGRESS 미해결 15). 원문에서는 눈에 띄지 않으므로 이 검사가 npm test에서 찾는다.
//
// 고치는 법(검사가 실패하면): 띄어야 하는 자리는 앞 줄 끝에 {' '}를 붙인다. 조사처럼 붙여 써야 하는 자리는 두 줄을 한 줄에 이어 쓴다.
// 이 검사가 보는 것(.astro의 틀 부분만 — 맨 위 --- 설정 칸, <script>·<style>·<pre> 안, <!-- --> 주석은 뺀다):
//   ① 글로 끝난 줄 ⏎ 인라인 태그로 시작하는 줄   예) "…토픽은" ⏎ "<code>…"   → "토픽은<code>"
//   ② 글로 끝난 줄 ⏎ {식}으로 시작하는 줄        예) "…모두" ⏎ "{count}개"    → "모두3개"   ({' '}·{/* */}로 시작하는 줄은 괜찮다)
//   ③ 인라인 태그로 끝난 줄 ⏎ 조사가 아닌 낱말로 시작하는 줄   예) "…</a>" ⏎ "페이지를" → "…</a>페이지를"  (조사 "를·에서·이에요" 등은 붙는 게 맞다)
// 글이 여는 괄호·따옴표로 끝나면(예: "(" ⏎ "<code>") 붙는 게 맞으므로 보지 않는다. 태그끼리(</span> ⏎ <span>)와 태그 ⏎ {식}은 CSS로 칸이 나뉘는
// 자리(배지·표 칸)가 대부분이라 보지 않는다(2026-09-30 기준 63곳 — 모두 화면에서 떨어져 보이는 칸).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

/** 줄 안에서 글과 나란히 흘러가는 태그 — 블록 태그(p·li·dd·div 등)는 붙어도 줄이 바뀌어 보이므로 뺀다 */
const INLINE_TAG = '(?:a|abbr|b|bdi|cite|code|data|del|dfn|em|i|ins|kbd|mark|q|s|samp|small|span|strong|sub|sup|time|u|var)';
const STARTS_WITH_INLINE_TAG = new RegExp(`^<${INLINE_TAG}(?=[\\s>/])`, 'u');
const ENDS_WITH_INLINE_CLOSE = new RegExp(`</${INLINE_TAG}>$`, 'u');
/** 글로 끝남: 한글·영문·숫자·문장 부호(여는 괄호·여는 따옴표는 아님) */
const ENDS_WITH_TEXT_CHAR = /[가-힣A-Za-z0-9.,:!?…)\]"'”’」』%]$/u;
/**
 * 앞 낱말에 붙여 쓰는 조사(③에서 붙는 게 맞는 자리): 조사 + 뒤따르는 조사(는·도·만·요·라는…)까지, 그 뒤에 한글이 더 오면 다른 낱말로 본다.
 * 예) 를 · 에서 · 에서도 · 이라는 · 으로는 · 이에요 · 인 · 은(는)
 */
const PARTICLE =
  /^(?:에서|에게|께서|한테|으로|로|까지|부터|처럼|보다|만큼|대로|마다|이라|라|이랑|랑|하고|이나|나|이면|면|이고|고|이며|며|이에요|예요|이다|입니다|이죠|죠|이야|야|이든|든|이|가|을|를|은|는|에|께|와|과|의|도|만|요|인|쯤|씩|뿐)(?:는|도|만|요|나|란|라는|라도)?(?![가-힣])/u;
// 줄 앞 {식} 가운데 괜찮은 것: 공백을 넣는 {' '}·{" "}, 주석 {/* … */}
const SAFE_EXPRESSION_START = /^\{\s*(?:'\s'|"\s"|`\s`|\/\*)/u;

/**
 * 의도해서 붙여 쓴 자리 — "파일 경로 — 앞 줄 끝 12글자 ⏎ 뒤 줄 앞 12글자"(줄 번호가 밀려도 맞게). 보통은 한 줄에 이어 쓰면 되므로 비워 둔다.
 * 꼭 필요할 때만 까닭과 함께 더한다.
 */
const ALLOWED: readonly string[] = [];

type JoinKind = '글 ⏎ 태그' | '글 ⏎ {식}' | '태그 ⏎ 낱말';

interface Join {
  readonly file: string;
  readonly line: number;
  readonly kind: JoinKind;
  readonly before: string;
  readonly after: string;
}

/** 줄이 글로 끝나는지: 끝 글자가 글이고, 끝이 태그 안(<…)·{식} 안이 아니며, {식} 속 코드 줄(? '…'·: '…'·=>)이 아니다 */
function endsInText(line: string): boolean {
  if (!ENDS_WITH_TEXT_CHAR.test(line)) {
    return false;
  }
  if (line.lastIndexOf('<') > line.lastIndexOf('>') || line.lastIndexOf('{') > line.lastIndexOf('}')) {
    return false;
  }
  return !/^[)}\]]|^[?:]\s|=>|^(?:const|let|return|import|export)\b/u.test(line);
}

/** .astro 원문에서 공백이 사라져 낱말이 붙어 버릴 자리를 찾는다(file은 보고에 쓸 경로) */
export function findLineBreakJoins(file: string, text: string): Join[] {
  const lines = text.split(/\r?\n/u);
  const template: { index: number; text: string }[] = [];
  let inFrontmatter = false;
  let skipUntil: RegExp | null = null;
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index] ?? '';
    const trimmed = raw.trim();
    if (index === 0 && trimmed === '---') {
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter) {
      if (trimmed === '---') {
        inFrontmatter = false;
      }
      continue;
    }
    if (skipUntil) {
      if (skipUntil.test(raw)) {
        skipUntil = null;
      }
      continue;
    }
    const opener = /<(script|style|pre)\b/u.exec(raw);
    if (opener && !new RegExp(`</${opener[1]}>`, 'u').test(raw)) {
      skipUntil = new RegExp(`</${opener[1]}>`, 'u');
      continue;
    }
    if (trimmed.startsWith('<!--')) {
      if (!trimmed.includes('-->')) {
        skipUntil = /-->/u;
      }
      continue;
    }
    if (trimmed !== '') {
      template.push({ index, text: trimmed });
    }
  }
  const found: Join[] = [];
  for (let position = 0; position + 1 < template.length; position += 1) {
    const current = template[position]!;
    const next = template[position + 1]!;
    // 바로 이웃한 줄만 본다(빈 줄만 사이에 있을 때 — 사이에 script·주석이 끼면 이웃이 아니다)
    if (lines.slice(current.index + 1, next.index).some((line) => line.trim() !== '')) {
      continue;
    }
    const before = current.text;
    const after = next.text;
    let kind: JoinKind | null = null;
    if (endsInText(before) && STARTS_WITH_INLINE_TAG.test(after)) {
      kind = '글 ⏎ 태그';
    } else if (endsInText(before) && after.startsWith('{') && !SAFE_EXPRESSION_START.test(after)) {
      kind = '글 ⏎ {식}';
    } else if (ENDS_WITH_INLINE_CLOSE.test(before) && /^[가-힣A-Za-z0-9]/u.test(after) && !PARTICLE.test(after)) {
      kind = '태그 ⏎ 낱말';
    }
    if (kind) {
      found.push({ file, line: current.index + 1, kind, before: before.slice(-30), after: after.slice(0, 30) });
    }
  }
  return found;
}

function astroFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...astroFiles(full));
    } else if (entry.name.endsWith('.astro')) {
      out.push(full);
    }
  }
  return out;
}

function allowedKey(join: Join): string {
  return `${join.file} — ${join.before.slice(-12)} ⏎ ${join.after.slice(0, 12)}`;
}

describe('.astro 줄바꿈 띄어쓰기(Astro 7 JSX 공백 규칙)', () => {
  it("이 검사의 전제: Astro 7(compressHTML \"jsx\")은 줄바꿈이 든 공백을 태그·{식} 옆에서 지우고, {' '}는 공백을 남긴다", async () => {
    // 설정에서 compressHTML을 바꾸면 규칙이 달라진다 — 그때는 이 검사를 다시 본다
    expect(fs.readFileSync(path.join(ROOT, 'astro.config.mjs'), 'utf8')).not.toContain('compressHTML');
    // Astro 7이 .astro를 바꾸는 컴파일러(astro의 의존성 — package-lock.json이 판을 고정)로 직접 확인한다
    const { transform } = await import('@astrojs/compiler-rs');
    const render = (source: string): string => /\$\$render`([\s\S]*?)`/u.exec(transform(source, { filename: 'probe.astro', compact: 'jsx' }).code)?.[1] ?? '';
    expect(render('<p>\n  문장을 적고\n  <strong>[보내기]</strong>를 누르면\n</p>')).toContain('적고<strong>[보내기]</strong>를');
    expect(render("<p>\n  문장을 적고{' '}\n  <strong>[보내기]</strong>를\n</p>")).toContain('적고${" "}<strong>');
    expect(render('<p>\n  모두\n  {count}개\n</p>')).toContain('모두${count}개');
    expect(render('<p>\n  앞 <a href="/x">링크</a>\n  페이지를 봐요.\n</p>')).toContain('</a>페이지를');
    // 글끼리는 줄바꿈이 공백 하나가 된다(그래서 보지 않는다)
    expect(render('<p>\n  첫 줄\n  둘째 줄\n</p>')).toContain('첫 줄 둘째 줄');
  });

  it("찾는 모양: 글 ⏎ 태그·글 ⏎ {식}·태그 ⏎ 낱말은 찾고, {' '}·한 줄·조사·여는 괄호·설정 칸·script·주석은 넘어간다", () => {
    const sample = [
      '---', // 1
      "const title = '제목이에요'", // 2
      '<code>설정 칸</code>', // 3 — 설정 칸 안이라 보지 않는다
      '---', // 4
      '<p>', // 5
      '  토픽은', // 6 ① 글 ⏎ 태그
      '  <code>접두어/tx</code>가 되고', // 7 ① 태그로 시작해도 글로 끝나면 같다
      '  <em>기울임</em>을 써요. 모두', // 8 ② 글 ⏎ {식}
      '  {count}개예요. 다음은 <a href="/x">링크</a>', // 9 ③ 태그 ⏎ 낱말
      '  페이지를 봐요.', // 10 — 다음 줄은 주석이라 이웃이 아니다
      '  <!-- 주석 끝에 글', // 11
      '  <strong>여기는 주석 안</strong> -->', // 12
      '  <strong>굵게</strong>', // 13 — 다음 줄은 조사 "를"
      '  를 누르면 <a href="/y">점검</a>', // 14 — 다음 줄은 조사 "에서도"
      '  에서도 확인해요. 이름은 <code>x</code>', // 15 — 다음 줄은 조사 "이라는"
      "  이라는 모양이에요. 적고{' '}", // 16 — {' '}로 끝남
      '  <strong>[보내기]</strong>', // 17
      '  를 눌러요. 괄호 안(', // 18 — 여는 괄호로 끝남
      '  <code>x</code>)도 괜찮아요. 모두', // 19 — 다음 줄이 {' '}로 시작
      "  {' '}{count}개", // 20
      '</p>', // 21
      '<script>', // 22
      '  const a = "글"', // 23
      '  <strong>', // 24
      '</script>', // 25
    ].join('\n');
    const joins = findLineBreakJoins('sample.astro', sample);
    expect(joins.map((join) => `${join.line}:${join.kind}`)).toEqual(['6:글 ⏎ 태그', '7:글 ⏎ 태그', '8:글 ⏎ {식}', '9:태그 ⏎ 낱말']);
  });

  it('src/의 .astro 파일에 낱말이 붙어 버리는 줄바꿈이 없다', () => {
    const files = astroFiles(path.join(ROOT, 'src'));
    expect(files.length).toBeGreaterThan(50);
    const joins = files
      .flatMap((full) => findLineBreakJoins(path.relative(ROOT, full).split(path.sep).join('/'), fs.readFileSync(full, 'utf8')))
      .filter((join) => !ALLOWED.includes(allowedKey(join)));
    const report = joins.map((join) => `${join.file}:${join.line} [${join.kind}] …${join.before} ⏎ ${join.after}…`).join('\n');
    expect(joins, `화면에서 낱말이 붙어요 — 띄어야 하면 앞 줄 끝에 {' '}를, 붙여야 하면(조사) 두 줄을 한 줄에 이어 쓰세요:\n${report}`).toEqual([]);
  });
});
