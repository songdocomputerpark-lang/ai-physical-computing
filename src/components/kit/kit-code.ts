/**
 * 키트 장치 도감의 예제 코드를 빌드 때 읽는 곳 — **빌드 전용**(.astro 프런트매터에서만 import, 판 1.5.0 C155).
 * examples/esp32/kit/**\/*.py를 Vite의 ?raw로 글자로 가져와 장치 쪽 HTML에 코드로 넣는다. 코드는 브릭셀 쪽 글 그대로이고 여기서도 고치지 않는다
 * (줄 끝 LF·끝 줄바꿈 하나만 다듬어 줄로 나눈다). 도감 첫 쪽은 코드가 필요 없어 이 파일을 import하지 않는다(코드 214개를 끌어오지 않게).
 *
 * 쓰는 곳: src/pages/labs/esp32/kit/[id].astro. 코드 상자의 줄 모양은 차시 따라 하기 예제와 같다(example-code.ts codeLinesToHtml).
 */
import { codeLinesToHtml } from '../lesson/example-code.ts';
import { kitCodeLines } from './kit-view.ts';

const codes = import.meta.glob<string>('/examples/esp32/kit/**/*.py', { query: '?raw', eager: true, import: 'default' });

export interface KitCodeView {
  /** 코드 상자 HTML(줄마다 줄 번호 data-line) */
  readonly html: string;
  readonly lineCount: number;
}

/** 예제 파일(examples/ 뒤 경로) → 코드 상자 값. 파일이 없으면 한국어 오류로 빌드를 멈춘다 */
export function kitCodeView(file: string): KitCodeView {
  const code = codes[`/examples/${file}`];
  if (code === undefined) {
    throw new Error(`키트 예제 파일 examples/${file}을(를) 찾지 못했어요. content/kit/devices.yaml의 steps.file을 확인해요.`);
  }
  const lines = kitCodeLines(code);
  return { html: codeLinesToHtml(lines), lineCount: lines.length };
}
