// 브라우저 테스트 전에 한 번 도는 준비(playwright.config.ts의 globalSetup, PD-14·PD-30).
// 가짜 카메라가 보낼 합성 영상(코드로 그린 도형, scripts/gen-test-video.mjs)을 .cache/test-camera/synthetic.y4m 에 만든다.
// 파일은 저장소에 넣지 않는다(압축 없는 영상이라 5MB를 넘는다). 브라우저는 --use-file-for-fake-video-capture 로 이 파일을 읽는다.
import path from 'node:path';
import { ensureTestVideo } from '../../scripts/gen-test-video.mjs';

/** 합성 영상 경로(저장소 뿌리 기준 절대 경로 — 브라우저 실행 인자에 그대로 들어간다) */
export const TEST_VIDEO_PATH = path.resolve(process.cwd(), '.cache', 'test-camera', 'synthetic.y4m');

export default function globalSetup(): void {
  ensureTestVideo(TEST_VIDEO_PATH);
}
