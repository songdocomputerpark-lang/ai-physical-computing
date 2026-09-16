// 좌우 반전 알아채기(src/lab/modules/mediapipe/mirror.ts)를 검사한다.
// 자료의 손 예제 대부분은 cv2.flip(frame, 1) 뒤에 process()를 부르므로, 재생 입력은 넘어온 이미지가 거울상인지 보고
// 좌표·좌우 이름을 함께 뒤집어야 뼈대가 손 위에 그려진다(진짜 카메라+모델은 넘긴 배열로 추론해 저절로 맞는다).
import { describe, expect, it } from 'vitest';
import {
  ORIENTATION_MARK_INSET,
  ORIENTATION_MARK_SIZE,
  ORIENTATION_SAMPLE,
  detectMirroredFrame,
  isMarkPixel,
  mirrorHandedness,
  mirrorHands,
} from '../../../src/lab/modules/mediapipe/mirror.ts';
import { generateHandSequence } from '../../../src/lab/modules/mediapipe/synthetic-hands.ts';

/** replay-source.ts의 drawOrientationMark와 같은 세모를 RGBA 버퍼에 직접 그린다(Node에는 캔버스가 없다). */
function paintFrame(width: number, height: number, options: { mark?: boolean; mirrored?: boolean; bgr?: boolean; hand?: boolean } = {}): {
  width: number;
  height: number;
  data: Uint8ClampedArray;
} {
  const data = new Uint8ClampedArray(width * height * 4);
  // 어두운 바탕(재생 화면과 같은 느낌)
  for (let index = 0; index < width * height; index += 1) {
    data[index * 4] = 0x20;
    data[index * 4 + 1] = 0x24;
    data[index * 4 + 2] = 0x2b;
    data[index * 4 + 3] = 255;
  }
  const put = (x: number, y: number, r: number, g: number, b: number) => {
    const px = options.mirrored ? width - 1 - x : x;
    const index = (y * width + px) * 4;
    // BGR로 읽는 예제(f026)는 R과 B가 바뀐 채로 넘어온다 — 마젠타는 R==B라 그대로다.
    data[index] = options.bgr ? b : r;
    data[index + 1] = g;
    data[index + 2] = options.bgr ? r : b;
  };
  const short = Math.min(width, height);
  const inset = Math.round(short * ORIENTATION_MARK_INSET);
  const size = Math.max(6, Math.round(short * ORIENTATION_MARK_SIZE));
  if (options.mark !== false) {
    for (let y = inset; y <= inset + size && y < height; y += 1) {
      for (let x = inset; x <= inset + size - (y - inset) && x < width; x += 1) {
        put(x, y, 255, 0, 255);
      }
    }
  }
  if (options.hand) {
    // 손이 구석을 가리는 경우(밝은 회색 덩어리) — 분홍이 아니므로 판단이 흔들리면 안 된다.
    for (let y = 0; y < Math.round(height * 0.2); y += 1) {
      for (let x = Math.round(width * 0.85); x < width; x += 1) {
        put(x, y, 230, 233, 238);
      }
    }
  }
  return { width, height, data };
}

describe('방향 표시로 좌우 반전 알아내기', () => {
  it('표시가 왼쪽 위에 있으면 뒤집히지 않은 것이다', () => {
    expect(detectMirroredFrame(paintFrame(640, 480))).toBe(false);
  });

  it('표시가 오른쪽 위로 가면 뒤집힌 것이다(cv2.flip(frame, 1))', () => {
    expect(detectMirroredFrame(paintFrame(640, 480, { mirrored: true }))).toBe(true);
  });

  it('색을 BGR로 읽어도(f026처럼 변환 없이 넘겨도) 같게 판단한다 — 마젠타는 R과 B가 같다', () => {
    expect(detectMirroredFrame(paintFrame(640, 480, { bgr: true }))).toBe(false);
    expect(detectMirroredFrame(paintFrame(640, 480, { bgr: true, mirrored: true }))).toBe(true);
  });

  it('밝은 손이 구석을 덮어도 흔들리지 않는다(분홍만 센다)', () => {
    expect(detectMirroredFrame(paintFrame(640, 480, { hand: true }))).toBe(false);
    expect(detectMirroredFrame(paintFrame(640, 480, { hand: true, mirrored: true }))).toBe(true);
  });

  it('표시가 없으면 모름(null)이라 이전 판단을 그대로 쓰게 한다', () => {
    expect(detectMirroredFrame(paintFrame(640, 480, { mark: false }))).toBeNull();
  });

  it('크기가 이상한 이미지는 모름(null)', () => {
    expect(detectMirroredFrame({ width: 0, height: 0, data: new Uint8ClampedArray(0) })).toBeNull();
    expect(detectMirroredFrame({ width: 10, height: 10, data: new Uint8ClampedArray(8) })).toBeNull();
  });

  it('여러 크기에서 표시가 찾는 구석 안에 들어간다(640×480·320×240·1280×720)', () => {
    for (const [width, height] of [
      [640, 480],
      [320, 240],
      [1280, 720],
      [160, 120],
    ] as const) {
      const short = Math.min(width, height);
      const markEnd = Math.round(short * ORIENTATION_MARK_INSET) + Math.max(6, Math.round(short * ORIENTATION_MARK_SIZE));
      expect(Math.round(width * ORIENTATION_SAMPLE), `${width}×${height} 가로`).toBeGreaterThan(Math.round(short * ORIENTATION_MARK_INSET));
      expect(detectMirroredFrame(paintFrame(width, height)), `${width}×${height}`).toBe(false);
      expect(detectMirroredFrame(paintFrame(width, height, { mirrored: true })), `${width}×${height} 뒤집힘`).toBe(true);
      expect(markEnd).toBeGreaterThan(0);
    }
  });

  it('분홍 점 판별은 뼈대 색(회색·하늘색·노랑)을 세지 않는다', () => {
    expect(isMarkPixel(255, 0, 255)).toBe(true);
    expect(isMarkPixel(230, 233, 238)).toBe(false); // 관절 흰색
    expect(isMarkPixel(143, 211, 255)).toBe(false); // 손끝 하늘색
    expect(isMarkPixel(255, 209, 102)).toBe(false); // 손목 노랑
    expect(isMarkPixel(32, 36, 43)).toBe(false); // 바탕
  });
});

describe('좌표·좌우 이름 뒤집기', () => {
  it('x만 1 - x로 바뀌고 y·z는 그대로다', () => {
    const hands = generateHandSequence('two-hands').frames[0]!.hands;
    const flipped = mirrorHands(hands);
    expect(flipped).toHaveLength(hands.length);
    for (const [index, hand] of hands.entries()) {
      for (const [point, [x, y, z]] of hand.landmarks.entries()) {
        const [fx, fy, fz] = flipped[index]!.landmarks[point]!;
        expect(fx).toBeCloseTo(1 - x, 4);
        expect(fy).toBe(y);
        expect(fz).toBe(z);
      }
    }
  });

  it('좌우 이름과 분류 번호가 바뀐다(뒤집힌 영상을 넣으면 진짜 모델도 반대로 부른다)', () => {
    expect(mirrorHandedness({ index: 1, score: 0.9, label: 'Right' })).toEqual({ index: 0, score: 0.9, label: 'Left' });
    expect(mirrorHandedness({ index: 0, score: 0.8, label: 'Left' })).toEqual({ index: 1, score: 0.8, label: 'Right' });
  });

  it('두 번 뒤집으면 처음으로 돌아온다', () => {
    const hands = generateHandSequence('draw').frames[20]!.hands;
    const twice = mirrorHands(mirrorHands(hands));
    expect(twice[0]!.landmarks[8]![0]).toBeCloseTo(hands[0]!.landmarks[8]![0], 4);
    expect(twice[0]!.handedness).toEqual(hands[0]!.handedness);
  });

  it('원본 배열을 고치지 않는다', () => {
    const hands = generateHandSequence('pinch').frames[0]!.hands;
    const before = hands[0]!.landmarks[4]![0];
    mirrorHands(hands);
    expect(hands[0]!.landmarks[4]![0]).toBe(before);
  });
});
