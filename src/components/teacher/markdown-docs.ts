/**
 * 교사용 자료실의 글 문서(마크다운)를 빌드 때 읽는 곳 — **빌드 전용**(.astro 프런트매터에서만 import).
 *
 * 선생님이 코드를 몰라도 고칠 수 있게 긴 안내는 마크다운 파일 하나로 둔다(SPEC 원칙 6):
 *   content/teacher/real-pc.md   "진짜 PC에서 돌리기" 설치 안내(/teacher/real-pc/)
 *   content/help/faq-teacher.md  선생님이 자주 묻는 질문(/teacher/faq/)
 * 콘텐츠 컬렉션(src/content.config.ts, 공유 파일)을 늘리지 않고 Astro의 마크다운 모듈 불러오기(import.meta.glob)로 읽는다.
 * 차시와 같은 마크다운 처리기(astro.config.mjs — :::상자·:용어[…] 문법)가 돈다. 사이트 뿌리 주소(/start/board/)는 쓰는 쪽이 base를 붙인다
 * (lesson-html.ts의 rewriteRootRelativeUrls — TeacherMarkdown.astro).
 */

/** Astro가 .md 파일을 모듈로 불러올 때의 모양(astro/dist/vite-plugin-markdown) 가운데 쓰는 부분 */
interface MarkdownModule {
  readonly frontmatter: Record<string, unknown>;
  compiledContent(): Promise<string>;
  getHeadings(): { depth: number; slug: string; text: string }[];
}

export interface MarkdownDoc {
  /** 저장소 뿌리 기준 파일 경로 */
  readonly file: string;
  readonly title: string;
  readonly description: string;
  /** 확인한 날(frontmatter checked, 선택) */
  readonly checked?: string;
  readonly html: string;
  /** ## 제목(목차에 쓴다) */
  readonly sections: readonly { slug: string; text: string }[];
  /** ### 제목(자주 묻는 질문 목록에 쓴다) — 바로 위 ## 제목의 slug와 함께 */
  readonly questions: readonly { slug: string; text: string; section?: string }[];
}

const modules = import.meta.glob<MarkdownModule>(['/content/teacher/*.md', '/content/help/*.md'], { eager: true });

function stringField(file: string, frontmatter: Record<string, unknown>, name: string, optional = false): string | undefined {
  const value = frontmatter[name];
  if (value === undefined || value === null) {
    if (optional) {
      return undefined;
    }
    throw new Error(`[교사용 자료실] ${file}: 맨 위 설정 칸에 ${name}을(를) 적어요.`);
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`[교사용 자료실] ${file}: ${name}은(는) 글자로 적어요.`);
  }
  return value.trim();
}

/** 마크다운 문서 하나를 읽는다. file은 저장소 뿌리 기준 경로(예: 'content/teacher/real-pc.md') */
export async function loadMarkdownDoc(file: string): Promise<MarkdownDoc> {
  const module = modules[`/${file}`];
  if (!module) {
    throw new Error(`[교사용 자료실] 글 문서 ${file}을(를) 찾지 못했어요.`);
  }
  const headings = module.getHeadings();
  const questions: { slug: string; text: string; section?: string }[] = [];
  let section: string | undefined;
  for (const heading of headings) {
    if (heading.depth === 2) {
      section = heading.slug;
    } else if (heading.depth === 3) {
      questions.push({ slug: heading.slug, text: heading.text, section });
    }
  }
  return {
    file,
    title: stringField(file, module.frontmatter, 'title') ?? '',
    description: stringField(file, module.frontmatter, 'description') ?? '',
    checked: stringField(file, module.frontmatter, 'checked', true),
    html: await module.compiledContent(),
    sections: headings.filter((heading) => heading.depth === 2).map(({ slug, text }) => ({ slug, text })),
    questions,
  };
}
