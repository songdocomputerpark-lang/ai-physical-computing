// Vite의 ?raw 불러오기(파일 내용을 글자로 가져오기) 타입 선언. src/lab/python/modules.ts가 .py 파일을 이렇게 묶는다(import.meta.glob).
// Astro의 기본 타입(astro/client)에는 ?raw 선언이 없어 여기서 .py 파일만 선언한다.
declare module '*.py?raw' {
  const source: string;
  export default source;
}
