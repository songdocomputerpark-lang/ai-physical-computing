// 콘텐츠 컬렉션(PLAN §2.6, §8.1 P1-06)
//
// - lessons  : content/lessons 폴더 아래의 모든 .md(하위 폴더 포함). content/lessons/u1/1-2-1.md의 id는 "u1/1-2-1"
// - glossary : content/glossary 폴더 바로 안의 .md. content/glossary/pixel.md의 id는 "pixel"
// 폴더는 src/ 밖, 저장소 뿌리의 content/에 둔다(PLAN §2.6). 파일이 하나도 없어도 빌드된다(빈 컬렉션).
// frontmatter 규칙은 src/config/content-schemas.ts에 있다.
//
// 페이지에서 쓰는 법
//   import { getCollection, render } from 'astro:content';
//   const lessons = await getCollection('lessons', ({ data }) => !data.draft);
//   const { Content, headings } = await render(lesson);
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { CONTENT_DIRS, glossarySchema, lessonSchema } from './config/content-schemas.ts';

const lessons = defineCollection({
  loader: glob({ pattern: '**/*.md', base: CONTENT_DIRS.lessons }),
  schema: lessonSchema,
});

const glossary = defineCollection({
  loader: glob({ pattern: '*.md', base: CONTENT_DIRS.glossary }),
  schema: glossarySchema,
});

export const collections = { lessons, glossary };
