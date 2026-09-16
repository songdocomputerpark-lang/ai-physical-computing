// Vite의 ?raw 불러오기 타입 선언(.yaml). 오류 사전 데이터(content/help/errors/errors.yaml)를 .astro 프런트매터가 글자로 가져와
// src/lab/errors/catalog-build.ts로 읽는다. .py 파일의 선언은 src/lab/runtime/raw-modules.d.ts에 있다.
declare module '*.yaml?raw' {
  const source: string;
  export default source;
}
