// 까만 영상 감지(src/lab/vision/black-frame.ts, 판 1.1.0 — PROGRESS 미해결 121) 단위 테스트.
//
// 판정 값(밝기 평균 ≤ 20, 표준편차 ≤ 4, 2초 동안 4장 이상 모두 까맘, 4초 동안 장 없음)의 근거 — 브라우저 실측(2026-09-28, Edge 153,
// Chromium 가짜 카메라에 만든 Y4M 영상을 넣어 진짜 캡처 경로로, 사이트의 black-frame.ts·camera-stream.ts로 0.25초마다 64×48 표본):
//   입력                                   | 밝기 평균   | 표준편차(64×48) | 잡티(가운데 32×24 그대로) | 판정
//   검정 Y=0 / 제한 범위 검정 Y=16           | 0.00       | 0.00            | 0.00                      | black(flat)
//   어둠 + 잡티 Y=18±2(렌즈 가림 흉내)       | 0.99~1.00  | 0.09~0.11       | 2.04~2.17                 | black
//   어둠 + 큰 잡티 Y=20±6(이득 큰 센서 흉내)  | 4.05~4.08  | 0.51~0.55       | 5.41~5.86                 | black
//   흐린 교실(바탕 35·물체 55·20)            | 22.71      | 11.88           | 0.00                      | ok
//   테스트용 합성 영상(synthetic.y4m)        | 82.97~83.76| 40.82~42.01     | 77.54                     | ok
//   Chromium 기본 가짜 무늬                  | 82.64~93.00| 14.46~32.01     | 26.78~46.57               | ok
// → 브라우저는 제한 범위 검정(16)을 0으로 펴고, 64×48로 줄이면 잡티가 평균돼 거의 사라진다. 그래서 까만지는 줄인 장의 평균·표준편차로,
//   "디지털 검정인지(flat)"는 줄이지 않은 가운데 조각의 잡티로 가른다. 진짜 카메라 렌즈를 가린 영상은 이 컴퓨터에서 재지 않았다(운영자
//   카메라를 켜지 않음) — 어떤 경우든 안내 글이 가리개·어두운 방을 함께 적는다.
import { describe, expect, it } from 'vitest';
import { BLACK_FRAME_LIMITS, BlackFrameWatch, isBlackFrame, measureLuma, type LumaStats } from '../../../src/lab/vision/black-frame.ts';

/** width×height RGBA 장을 만든다(값을 돌려주는 함수로 픽셀마다 밝기를 정한다 — 회색) */
function frame(width: number, height: number, luma: (x: number, y: number) => number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = luma(x, y);
      const index = (y * width + x) * 4;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
  }
  return data;
}

/** 늘 같은 값을 내는 의사 난수(테스트가 흔들리지 않게) */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/** 정규 분포 잡티(Box-Muller) */
function noisy(base: number, sd: number, seed = 7): (x: number, y: number) => number {
  const random = seeded(seed);
  return () => {
    const u = Math.max(random(), 1e-9);
    const v = random();
    return Math.round(base + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v));
  };
}

const W = BLACK_FRAME_LIMITS.sampleWidth;
const H = BLACK_FRAME_LIMITS.sampleHeight;
const STEP = BLACK_FRAME_LIMITS.sampleIntervalMs;

const black = (): LumaStats => measureLuma(frame(W, H, () => 0));
const bright = (): LumaStats => measureLuma(frame(W, H, (x) => (x < W / 2 ? 60 : 180)));

describe('한 장의 밝기 재기(measureLuma)', () => {
  it('까만 장은 평균 0·표준편차 0, 한 색 회색은 표준편차 0', () => {
    expect(black()).toMatchObject({ mean: 0, std: 0, count: W * H });
    const gray = measureLuma(frame(W, H, () => 16));
    expect(gray.mean).toBeCloseTo(16, 6);
    expect(gray.std).toBeCloseTo(0, 6);
  });

  it('0과 255가 반씩이면 평균 127.5·표준편차 127.5(Rec.601 밝기)', () => {
    const stats = measureLuma(frame(W, H, (x) => (x % 2 === 0 ? 0 : 255)));
    expect(stats.mean).toBeCloseTo(127.5, 3);
    expect(stats.std).toBeCloseTo(127.5, 3);
  });

  it('색 가중치: 빨강 255만이면 밝기 76.2(0.299 × 255)', () => {
    const data = new Uint8ClampedArray([255, 0, 0, 255]);
    expect(measureLuma(data).mean).toBeCloseTo(76.245, 3);
    // RGB(3바이트)도 잰다.
    expect(measureLuma(new Uint8Array([0, 255, 0]), 3).mean).toBeCloseTo(149.685, 3);
    expect(measureLuma(new Uint8Array(0))).toEqual({ mean: 0, std: 0, count: 0 });
  });
});

describe('까만 장인지(isBlackFrame)', () => {
  it('디지털 검정·제한 범위 검정(16)·센서 잡티가 조금 있는 어둠은 까만 장', () => {
    expect(isBlackFrame(black())).toBe(true);
    expect(isBlackFrame(measureLuma(frame(W, H, () => 16)))).toBe(true);
    const capped = measureLuma(frame(W, H, noisy(8, 2)));
    expect(capped.std).toBeGreaterThan(1);
    expect(isBlackFrame(capped)).toBe(true);
  });

  it('무엇이든 보이는 장면(흐린 교실·샘플 입력의 그라데이션·잡티가 큰 어둠)은 까맣지 않다', () => {
    // 샘플 입력 바탕(#2b2f36 → #8a929e 대각선 그라데이션)의 밝기 분포
    const gradient = measureLuma(frame(W, H, (x, y) => 46 + ((x / W + y / H) / 2) * (145 - 46)));
    expect(gradient.std).toBeGreaterThan(15);
    expect(isBlackFrame(gradient)).toBe(false);
    // 불 꺼진 교실(평균 25, 물체의 명암 표준편차 10)
    expect(isBlackFrame(measureLuma(frame(W, H, noisy(25, 10))))).toBe(false);
    // 평균은 낮아도 잡티가 크면(이득을 크게 올린 센서) 까맣다고 단정하지 않는다
    expect(isBlackFrame(measureLuma(frame(W, H, noisy(8, 6))))).toBe(false);
    expect(isBlackFrame(bright())).toBe(false);
  });

  it('경계: 평균 20·표준편차 4까지는 까만 장, 넘으면 아니다', () => {
    expect(isBlackFrame({ mean: 20, std: 4, count: 1 })).toBe(true);
    expect(isBlackFrame({ mean: 20.01, std: 0, count: 1 })).toBe(false);
    expect(isBlackFrame({ mean: 0, std: 4.01, count: 1 })).toBe(false);
    expect(isBlackFrame({ mean: 0, std: 0, count: 0 })).toBe(false);
  });
});

describe('2초 동안 지켜보기(BlackFrameWatch)', () => {
  it('첫 장부터 2초 동안 모두 까마면 black — 그 전에는 watching', () => {
    const watch = new BlackFrameWatch(0);
    let now = 300; // 카메라가 켜지고 첫 장이 오기까지 조금 걸린다
    const verdicts: string[] = [];
    for (let index = 0; index < 10; index += 1) {
      verdicts.push(watch.add(black(), now));
      now += STEP;
    }
    // 첫 장 300ms → 2,300ms(9번째 장)에 창이 찬다.
    expect(verdicts.slice(0, 8).every((verdict) => verdict === 'watching')).toBe(true);
    expect(verdicts[8]).toBe('black');
    expect(watch.summary()).toMatchObject({ verdict: 'black', samples: 10, meanLuma: 0, maxStd: 0, flat: true });
  });

  it('처음 몇 장만 어둡고(노출 맞추는 중) 밝아지면 ok — 안내가 뜨지 않는다', () => {
    const watch = new BlackFrameWatch(0);
    watch.add(black(), 100);
    watch.add(black(), 350);
    expect(watch.add(bright(), 600)).toBe('ok');
    expect(watch.tick(5_000)).toBe('ok');
  });

  it('장이 4초 동안 한 장도 오지 않으면 no-frames, 그 뒤 까만 장만 오면 2초 뒤 black', () => {
    const watch = new BlackFrameWatch(0);
    expect(watch.tick(3_999)).toBe('watching');
    expect(watch.tick(4_000)).toBe('no-frames');
    let now = 4_250;
    let verdict = watch.verdict;
    for (let index = 0; index < 12; index += 1) {
      verdict = watch.add(black(), now);
      now += STEP;
    }
    expect(verdict).toBe('black');
  });

  it('black 뒤에 밝은 장이 오면 ok로 돌아간다(가리개를 열면 안내가 저절로 사라진다)', () => {
    const watch = new BlackFrameWatch(0);
    for (let now = 0; now <= 2_500; now += STEP) {
      watch.add(black(), now);
    }
    expect(watch.verdict).toBe('black');
    expect(watch.add(bright(), 2_750)).toBe('ok');
  });

  it('장이 드문드문 오면(느린 컴퓨터·가려진 탭) 4장이 모일 때까지 판정을 미룬다', () => {
    const watch = new BlackFrameWatch(0);
    expect(watch.add(black(), 0)).toBe('watching');
    expect(watch.add(black(), 1_500)).toBe('watching');
    expect(watch.add(black(), 3_000)).toBe('watching');
    expect(watch.add(black(), 4_500)).toBe('black');
  });

  it('디지털 검정인지(flat)는 줄이지 않은 가운데 조각의 잡티로 가른다 — 줄인 장은 잡티가 평균돼 사라지므로', () => {
    // 실측처럼: 64×48로 줄인 장은 표준편차 0.1인데, 가운데 조각은 잡티 2.1
    const shrunk: LumaStats = { mean: 1, std: 0.1, count: W * H };
    const grainy: LumaStats = { mean: 1.2, std: 2.1, count: 768 };
    const clean: LumaStats = { mean: 0, std: 0, count: 768 };
    const noisyWatch = new BlackFrameWatch(0);
    const cleanWatch = new BlackFrameWatch(0);
    for (let index = 0; index < 10; index += 1) {
      noisyWatch.add(shrunk, index * STEP, grainy);
      cleanWatch.add(shrunk, index * STEP, clean);
    }
    expect(noisyWatch.summary()).toMatchObject({ verdict: 'black', flat: false });
    expect(cleanWatch.summary()).toMatchObject({ verdict: 'black', flat: true });
    // 가운데 조각을 못 쟀으면(빈 조각) 줄인 장의 표준편차로 대신한다.
    const fallback = new BlackFrameWatch(0);
    for (let index = 0; index < 10; index += 1) {
      fallback.add(shrunk, index * STEP, { mean: 0, std: 0, count: 0 });
    }
    expect(fallback.summary().flat).toBe(true);
  });

  it('잡티가 있는 어둠(렌즈 가리개 흉내)은 black이지만 디지털 검정(flat)은 아니다', () => {
    const watch = new BlackFrameWatch(0);
    for (let index = 0; index < 10; index += 1) {
      watch.add(measureLuma(frame(W, H, noisy(8, 2, index + 1))), index * STEP);
    }
    const summary = watch.summary();
    expect(summary.verdict).toBe('black');
    expect(summary.flat).toBe(false);
    expect(summary.meanLuma).toBeGreaterThan(5);
  });
});
