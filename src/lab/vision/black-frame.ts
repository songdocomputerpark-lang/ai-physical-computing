/**
 * 까만 영상 감지의 순수 논리(판 1.1.0, PROGRESS 미해결 121) — 영상 처리 실습실(vision-lab.ts)과 점검 페이지의 카메라 확인이 함께 쓴다.
 * 화면·카메라 없이 숫자만 계산하므로 Node 단위 테스트(tests/unit/camera/black-frame.test.ts)가 그대로 읽는다.
 *
 * 무엇을 잡나: 카메라는 켜졌는데(스트림이 열리고 장면이 들어오는데) 장면이 **거의 한 색으로 까만** 경우.
 * 교실 컴퓨터의 가상 카메라(화면 공유 프로그램이 만든 카메라 — 프로그램이 쉬는 동안 까만 장면만 보냄)가 진짜 웹캠을 가릴 때 이렇게 된다
 * (2026-09-17 운영자 컴퓨터). 렌즈 가리개·손으로 가린 렌즈·아주 어두운 방도 비슷하게 보이므로, 안내 글은 원인을 하나로 단정하지 않는다.
 *
 * 판정(값의 근거는 tests/unit/camera/black-frame.test.ts 머리말과 .cache/v110-notes/zone-a-camera.md의 실측 표)
 * 1. 한 장의 밝기(Rec.601 luma = 0.299R + 0.587G + 0.114B, 0~255)의 **평균 ≤ 20이고 표준편차 ≤ 4**면 "까만 장"이다.
 *    - 평균 20: 브라우저가 제한 범위(16~235) 영상을 전체 범위로 잘못 풀면 검정이 16으로 보인다 → 16까지는 검정으로 봐야 한다(+반올림 여유).
 *    - 표준편차 4: 까만 장(디지털 검정)은 0, 무엇이든 보이는 장면은 수십이다(가짜 카메라 합성 영상·샘플 입력 실측). 어두운 교실처럼
 *      흐리지만 물체가 보이는 장면은 표준편차가 커서 잡히지 않는다.
 * 2. 첫 장이 온 뒤 **2초 동안(windowMs) 들어온 장이 모두 까맣고 4장 이상**이면 판정 'black'. 사이에 한 장이라도 까맣지 않으면 'ok'
 *    (웹캠이 켜지며 노출을 맞추는 동안 처음 몇 장이 어두운 것은 넘어간다).
 * 3. 연 뒤 4초가 지나도 장이 한 장도 오지 않으면 'no-frames'.
 * 4. 'black'·'no-frames' 뒤에 밝은 장이 오면 'ok'로 돌아간다(가리개를 열면 안내가 저절로 사라진다).
 * 잡티(센서 노이즈)가 거의 없으면(flat — 줄이지 않은 가운데 조각의 표준편차 < 1) 센서가 아니라 프로그램이 만든 "디지털 검정"일 가능성이 크다 —
 * 안내 글의 차례를 정할 때만 쓴다. 64×48로 줄인 장은 줄이는 동안 잡티가 평균돼 사라지므로(실측: Y=18±2 잡티 → 표준편차 0.1) 잡티는
 * 줄이지 않은 가운데 32×24 조각(noise)으로 잰다.
 */

/** 한 장의 밝기 통계 */
export interface LumaStats {
  /** 밝기 평균(0~255) */
  readonly mean: number;
  /** 밝기 표준편차(0~) */
  readonly std: number;
  /** 잰 픽셀 수 */
  readonly count: number;
}

/** 판정에 쓰는 값 한 곳 */
export const BLACK_FRAME_LIMITS = Object.freeze({
  /** 까만 장의 밝기 평균 상한 */
  meanMax: 20,
  /** 까만 장의 밝기 표준편차 상한 */
  stdMax: 4,
  /** 이보다 작으면 "디지털 검정"(센서 잡티 없음) */
  flatStdMax: 1,
  /** 첫 장부터 이만큼 모두 까매야 'black'(밀리초) */
  windowMs: 2000,
  /** 연 뒤 이만큼 장이 없으면 'no-frames'(밀리초) */
  noFrameMs: 4000,
  /** 'black'으로 보려면 적어도 이만큼의 장을 봐야 한다 */
  minSamples: 4,
  /** 화면이 장을 재는 간격(밀리초) — 판정 창 2초에 8장 */
  sampleIntervalMs: 250,
  /** 화면이 재는 작은 그림 크기(64×48 = 3,072픽셀 — 판정에 충분하고 계산이 가볍다) */
  sampleWidth: 64,
  sampleHeight: 48,
  /** 잡티를 재는 가운데 조각 크기(줄이지 않고 그대로 — 32×24 = 768픽셀) */
  noiseWidth: 32,
  noiseHeight: 24,
});

export type BlackFrameLimits = typeof BLACK_FRAME_LIMITS;

/**
 * 픽셀 바이트(RGBA면 channels 4, RGB면 3)의 밝기 평균·표준편차를 잰다. 빈 배열이면 평균 0·표준편차 0·count 0.
 * 두 번 훑지 않고 합과 제곱합으로 구한다(3,072픽셀 × 8장/2초라 가볍다).
 */
export function measureLuma(data: ArrayLike<number>, channels = 4): LumaStats {
  const step = channels >= 3 ? Math.floor(channels) : 4;
  let sum = 0;
  let squares = 0;
  let count = 0;
  for (let index = 0; index + 2 < data.length; index += step) {
    const luma = 0.299 * (data[index] ?? 0) + 0.587 * (data[index + 1] ?? 0) + 0.114 * (data[index + 2] ?? 0);
    sum += luma;
    squares += luma * luma;
    count += 1;
  }
  if (count === 0) {
    return Object.freeze({ mean: 0, std: 0, count: 0 });
  }
  const mean = sum / count;
  const variance = Math.max(0, squares / count - mean * mean);
  return Object.freeze({ mean, std: Math.sqrt(variance), count });
}

/** 한 장이 "까만 장"인지 */
export function isBlackFrame(stats: Pick<LumaStats, 'mean' | 'std' | 'count'>, limits: BlackFrameLimits = BLACK_FRAME_LIMITS): boolean {
  return stats.count > 0 && stats.mean <= limits.meanMax && stats.std <= limits.stdMax;
}

/** 판정: 보는 중 · 괜찮음 · 까만 영상 · 장이 오지 않음 */
export type BlackVerdict = 'watching' | 'ok' | 'black' | 'no-frames';

/** 지켜본 결과 요약(점검 페이지 결과 글·안내 글 차례에 쓴다) */
export interface BlackWatchSummary {
  readonly verdict: BlackVerdict;
  /** 잰 장 수 */
  readonly samples: number;
  /** 잰 장들의 밝기 평균의 평균(장이 없으면 null) */
  readonly meanLuma: number | null;
  /** 잰 장들 가운데 가장 큰 표준편차(장이 없으면 null) */
  readonly maxStd: number | null;
  /** 까만 장이 모두 "디지털 검정"(잡티 없음)인지 */
  readonly flat: boolean;
}

/**
 * 카메라를 연 뒤 장을 하나씩 넣어 까만 영상인지 지켜본다(시각은 호출하는 쪽이 준다 — 테스트가 시계를 바꿔 넣는다).
 *   const watch = new BlackFrameWatch(performance.now());
 *   watch.add(measureLuma(pixels), performance.now());   // 장이 올 때마다
 *   watch.tick(performance.now());                        // 장이 없을 때도 시간만 흘려 본다
 */
export class BlackFrameWatch {
  readonly #limits: BlackFrameLimits;
  readonly #startedAt: number;
  #firstFrameAt: number | null = null;
  /** 마지막으로 까맣지 않은 장 뒤에 이어진 까만 장의 시작 시각과 수 */
  #darkSince: number | null = null;
  #darkRun = 0;
  #samples = 0;
  #meanSum = 0;
  #maxStd = 0;
  #flat = true;
  #sawBright = false;
  #verdict: BlackVerdict = 'watching';

  constructor(startedAt: number, limits: BlackFrameLimits = BLACK_FRAME_LIMITS) {
    this.#startedAt = startedAt;
    this.#limits = limits;
  }

  get verdict(): BlackVerdict {
    return this.#verdict;
  }

  /**
   * 장 하나를 넣고 판정을 돌려준다.
   * @param stats 64×48로 줄인 장의 밝기(까만지 판정)
   * @param noise 줄이지 않은 가운데 조각의 밝기(잡티 — 없으면 stats로 대신한다)
   */
  add(stats: LumaStats, now: number, noise?: LumaStats): BlackVerdict {
    if (stats.count <= 0) {
      return this.tick(now);
    }
    this.#samples += 1;
    this.#meanSum += stats.mean;
    this.#maxStd = Math.max(this.#maxStd, stats.std);
    if (this.#firstFrameAt === null) {
      this.#firstFrameAt = now;
    }
    if (isBlackFrame(stats, this.#limits)) {
      const grain = noise && noise.count > 0 ? noise.std : stats.std;
      if (grain >= this.#limits.flatStdMax) {
        this.#flat = false;
      }
      if (this.#darkSince === null) {
        this.#darkSince = now;
        this.#darkRun = 0;
      }
      this.#darkRun += 1;
    } else {
      this.#sawBright = true;
      this.#darkSince = null;
      this.#darkRun = 0;
      this.#verdict = 'ok';
      return this.#verdict;
    }
    return this.tick(now);
  }

  /** 새 장 없이 시간만 흘려 판정을 다시 본다. */
  tick(now: number): BlackVerdict {
    if (this.#firstFrameAt === null) {
      this.#verdict = now - this.#startedAt >= this.#limits.noFrameMs ? 'no-frames' : 'watching';
      return this.#verdict;
    }
    if (this.#darkSince === null) {
      // 가장 최근 장이 까맣지 않았다.
      this.#verdict = this.#sawBright ? 'ok' : 'watching';
      return this.#verdict;
    }
    // 처음부터 까맣던 영상은 첫 장부터, 밝다가 까매진 영상(가리개를 닫음 등)도 이어진 까만 장이 창을 채우면 'black'.
    const enough = now - this.#darkSince >= this.#limits.windowMs && this.#darkRun >= this.#limits.minSamples;
    if (enough) {
      this.#verdict = 'black';
    } else if (this.#verdict !== 'black') {
      this.#verdict = this.#sawBright ? 'ok' : 'watching';
    }
    return this.#verdict;
  }

  summary(): BlackWatchSummary {
    return Object.freeze({
      verdict: this.#verdict,
      samples: this.#samples,
      meanLuma: this.#samples > 0 ? this.#meanSum / this.#samples : null,
      maxStd: this.#samples > 0 ? this.#maxStd : null,
      flat: this.#samples > 0 && this.#flat && this.#verdict === 'black',
    });
  }
}
