// Vite의 ?raw 불러오기 타입 선언(SVG 파일 내용을 글자로 가져오기). src/lab/runtime/raw-modules.d.ts가 .py만 선언하므로 이 모듈이 쓰는 .svg를 여기서 선언한다.
declare module '*.svg?raw' {
  const source: string;
  export default source;
}
