// 브라우저 테스트용 합성 카메라 영상 만들기(PLAN §8.2 P2-03, PD-14·PD-30).
//
// Chromium(Edge 포함)은 --use-fake-device-for-media-stream 과 --use-file-for-fake-video-capture=파일.y4m 으로
// 진짜 카메라 대신 파일의 영상을 웹캠처럼 준다. 그 파일을 사진이 아닌 "코드로 그린 도형"으로 만든다:
// 회색 바탕에 천천히 움직이는 흰 네모·검은 원·흰 사선. 회색 변환·에지 검출 결과가 뚜렷하게 나오고 개인정보가 없다.
//
// 파일은 압축이 없는 Y4M(YUV 4:2:0)이라 640×480 16장이 7MB쯤 되므로 저장소에 넣지 않고(PD-30, 5MB 상한)
// 테스트가 시작할 때 .cache/test-camera/ 에 만든다(tests/e2e/global-setup.ts). 커밋하는 것은 이 스크립트뿐이다.
//
// 직접 만들기: node scripts/gen-test-video.mjs [출력 경로]
// 형식 근거: Y4M 헤더 "YUV4MPEG2 W H F분자:분모 I C색공간" 뒤에 프레임마다 "FRAME" 줄과 Y·U·V 평면 순서(mjpegtools yuv4mpeg 규격).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** 기본 출력 경로(저장소 뿌리 기준, .gitignore의 .cache/ 아래) */
export const DEFAULT_OUTPUT = path.join('.cache', 'test-camera', 'synthetic.y4m');

export const DEFAULT_OPTIONS = Object.freeze({ width: 640, height: 480, fps: 15, frames: 16 });

/**
 * 한 장의 밝기(Y) 값을 정한다(0~255, 흑백). x·y는 픽셀 좌표, t는 0~1 사이의 시각(장 번호 / 장 수).
 * - 바탕: 밝기 80의 회색
 * - 흰 네모(밝기 235): 왼쪽에서 오른쪽으로 천천히 움직인다
 * - 검은 원(밝기 16): 위아래로 움직인다
 * - 흰 사선(밝기 235, 두께 6픽셀): 고정 — 어느 장에서든 에지가 있다
 * @param {number} x
 * @param {number} y
 * @param {number} t
 * @param {number} width
 * @param {number} height
 * @returns {number}
 */
export function lumaAt(x, y, t, width, height) {
  const rectX = Math.round(width * (0.15 + 0.35 * t));
  const rectY = Math.round(height * 0.2);
  const rectW = Math.round(width * 0.2);
  const rectH = Math.round(height * 0.25);
  if (x >= rectX && x < rectX + rectW && y >= rectY && y < rectY + rectH) {
    return 235;
  }
  const circleX = width * 0.72;
  const circleY = height * (0.35 + 0.3 * Math.sin(t * Math.PI * 2));
  const radius = Math.min(width, height) * 0.12;
  const dx = x - circleX;
  const dy = y - circleY;
  if (dx * dx + dy * dy <= radius * radius) {
    return 16;
  }
  // 왼쪽 아래에서 오른쪽 위로 가는 사선: y = height - x * (height / width)
  const lineY = height - (x * height) / width;
  if (Math.abs(y - lineY) <= 3) {
    return 235;
  }
  return 80;
}

/**
 * Y4M 파일 내용을 만든다(색은 없고 밝기만 — U·V 평면은 128).
 * @param {{ width?: number; height?: number; fps?: number; frames?: number }} [options]
 * @returns {Uint8Array}
 */
export function buildY4m(options = {}) {
  const { width, height, fps, frames } = { ...DEFAULT_OPTIONS, ...options };
  if (width % 2 !== 0 || height % 2 !== 0) {
    throw new Error('Y4M 4:2:0은 가로·세로가 짝수여야 해요.');
  }
  const header = Buffer.from(`YUV4MPEG2 W${width} H${height} F${fps}:1 Ip A1:1 C420jpeg\n`, 'ascii');
  const frameMarker = Buffer.from('FRAME\n', 'ascii');
  const ySize = width * height;
  const chromaSize = (width / 2) * (height / 2);
  const frameSize = frameMarker.length + ySize + chromaSize * 2;
  const out = new Uint8Array(header.length + frameSize * frames);
  out.set(header, 0);
  let offset = header.length;
  for (let index = 0; index < frames; index += 1) {
    const t = frames > 1 ? index / frames : 0;
    out.set(frameMarker, offset);
    offset += frameMarker.length;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        out[offset + y * width + x] = lumaAt(x, y, t, width, height);
      }
    }
    offset += ySize;
    out.fill(128, offset, offset + chromaSize * 2);
    offset += chromaSize * 2;
  }
  return out;
}

/**
 * 파일이 없거나 설정이 바뀌었으면 만든다. 만든 경로를 돌려준다.
 * @param {string} outputPath
 * @param {{ width?: number; height?: number; fps?: number; frames?: number }} [options]
 */
export function ensureTestVideo(outputPath = DEFAULT_OUTPUT, options = {}) {
  const data = buildY4m(options);
  if (fs.existsSync(outputPath) && fs.statSync(outputPath).size === data.length) {
    return outputPath;
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, data);
  return outputPath;
}

const isMain = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const target = process.argv[2] ?? DEFAULT_OUTPUT;
  const written = ensureTestVideo(target);
  const { size } = fs.statSync(written);
  console.log(`합성 카메라 영상: ${written} (${size.toLocaleString('ko-KR')}바이트, ${DEFAULT_OPTIONS.width}×${DEFAULT_OPTIONS.height} ${DEFAULT_OPTIONS.frames}장 ${DEFAULT_OPTIONS.fps}fps)`);
}
