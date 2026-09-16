/**
 * 가상 데스크톱 안의 스페이스 키 미니게임(순수 논리, DOM 없음) — PLAN §8.2 P2-12, SPEC §6.1, CODE_MAPPING §3.4(f121).
 *
 * 왜 필요한가: 원본 f121(입을 벌리면 `pg.press("space")`)처럼 **키 하나로 노는 프로그램**이 있어야 "인공지능이 알아낸 것으로
 * 컴퓨터를 조작한다"가 눈에 보인다. 진짜 PC에서는 아무 게임이나 띄워 놓고 하지만, 브라우저에서는 다른 프로그램을 띄울 수 없다.
 *
 * 설계 근거(왜 이렇게 만들었는가 — SPEC §6.1·§8의 "원작 게임 복제 금지"):
 *  - 기존 게임(공룡 달리기 등)의 캐릭터·장애물·배경·화면 구성·소리를 **하나도 쓰지 않는다**. 여기 있는 것은 원·네모·막대·색뿐이다.
 *  - 규칙을 한 줄로 적을 수 있게 만들었다(고1이 처음 봐도 읽자마자 알 수 있게). 지는 장면·충돌·폭발이 없어 무서운 연출이 없고,
 *    점수는 "잘한 만큼 올라가는 수"로만 나타난다.
 *  - 세 가지 모두 **스페이스 키 하나**로만 논다: ① 누르는 힘(balloon) ② 누르는 순간(timing) ③ 누를지 말지 고르기(color).
 *    f121처럼 "입을 벌리는 동안 계속 누르기"는 ①에, "한 번만 딱 누르기"는 ②·③에 알맞다.
 *  - 움직임 줄이기(prefers-reduced-motion)를 켠 학생을 위해 모든 속도를 늦추고 깜박임을 쓰지 않는다(REDUCED 배수).
 *
 * 시계는 밖에서 넣는다(now, ms) — 브라우저는 requestAnimationFrame, 테스트는 숫자를 직접 넣어 같은 결과를 확인한다.
 */

export type GameKind = 'balloon' | 'timing' | 'color';

export interface GameInfo {
  readonly id: GameKind;
  readonly label: string;
  /** 한 줄 규칙(창 안에 그대로 그린다) */
  readonly rule: string;
}

export const GAMES: readonly GameInfo[] = Object.freeze([
  { id: 'balloon', label: '풍선 띄우기', rule: '스페이스를 계속 눌러 동그라미를 파란 띠 안에 머물게 해요. 띠 안에 있으면 점수가 올라가요.' },
  { id: 'timing', label: '막대 멈추기', rule: '막대가 좌우로 오가요. 스페이스를 눌러 한가운데에 가깝게 멈출수록 점수가 커요.' },
  { id: 'color', label: '색 맞추기', rule: '네모 색이 위의 목표 색과 같아지는 순간에만 스페이스를 눌러요. 다르면 점수가 하나 줄어요.' },
]);

export const DEFAULT_GAME: GameKind = 'balloon';

export function gameInfo(kind: GameKind): GameInfo {
  return GAMES.find((game) => game.id === kind) ?? GAMES[0]!;
}

/** 색 맞추기 게임의 색(도형 색일 뿐 상표·원작과 관계없다) */
export const GAME_COLORS: readonly { readonly id: string; readonly label: string; readonly color: string }[] = Object.freeze([
  { id: 'red', label: '빨강', color: '#d24b4b' },
  { id: 'blue', label: '파랑', color: '#1f5bd6' },
  { id: 'green', label: '초록', color: '#3b9360' },
  { id: 'yellow', label: '노랑', color: '#e0b400' },
  { id: 'purple', label: '보라', color: '#6b4fa8' },
]);

/** 움직임 줄이기일 때 곱하는 속도 배수(느리게) */
const REDUCED = 0.5;

/** 풍선: 중력(초당 속도 변화)·한 번 누를 때 올라가는 힘·띠 위치(0 = 맨 위, 1 = 맨 아래) */
const BALLOON = Object.freeze({ gravity: 0.62, push: -0.34, maxSpeed: 0.9, top: 0.28, bottom: 0.52, pointMs: 200 });
/** 막대: 초당 움직이는 거리(0~1)·멈춘 뒤 다시 출발할 때까지 */
const TIMING = Object.freeze({ speed: 0.62, restMs: 700, maxPoints: 10 });
/** 색: 색이 바뀌는 간격 */
const COLOR = Object.freeze({ swapMs: 900 });

export interface GameState {
  kind: GameKind;
  score: number;
  /** 게임마다 가장 높았던 점수(창을 닫아도 남는다) */
  best: Record<GameKind, number>;
  /** 스페이스를 누른 횟수(f121처럼 연타하는 코드가 정말 닿았는지 보여 준다) */
  presses: number;
  /** 화면·읽어 주는 글에 쓰는 한 줄 */
  message: string;
  startedAt: number;
  lastStep: number;
  seed: number;
  // 풍선 띄우기
  y: number;
  vy: number;
  inBand: boolean;
  bandMs: number;
  // 막대 멈추기
  marker: number;
  direction: 1 | -1;
  restUntil: number;
  lastGain: number;
  // 색 맞추기
  colorIndex: number;
  targetIndex: number;
  nextSwapAt: number;
}

function emptyBest(): Record<GameKind, number> {
  return { balloon: 0, timing: 0, color: 0 };
}

/** 작고 예측 가능한 난수(테스트가 같은 결과를 얻게) */
function nextRandom(state: GameState): number {
  state.seed = (state.seed * 1_664_525 + 1_013_904_223) % 4_294_967_296;
  return state.seed / 4_294_967_296;
}

export function createGame(kind: GameKind = DEFAULT_GAME, now = 0, best: Record<GameKind, number> = emptyBest()): GameState {
  const state: GameState = {
    kind,
    score: 0,
    best: { ...best },
    presses: 0,
    message: '',
    startedAt: now,
    lastStep: now,
    seed: 20_260_916,
    y: 0.8,
    vy: 0,
    inBand: false,
    bandMs: 0,
    marker: 0,
    direction: 1,
    restUntil: 0,
    lastGain: 0,
    colorIndex: 0,
    targetIndex: 1,
    nextSwapAt: now + COLOR.swapMs,
  };
  state.message = startMessage(kind);
  return state;
}

function startMessage(kind: GameKind): string {
  return `${gameInfo(kind).label}: 스페이스 키를 눌러 시작해요.`;
}

/** 같은 창에서 다른 게임으로 바꾼다(가장 높은 점수는 남긴다). */
export function switchGame(state: GameState, kind: GameKind, now: number): GameState {
  const next = createGame(kind, now, state.best);
  next.seed = state.seed;
  return next;
}

/** 지금 게임만 처음부터 다시(가장 높은 점수는 남긴다). */
export function restartGame(state: GameState, now: number): GameState {
  return switchGame(state, state.kind, now);
}

function rememberBest(state: GameState): void {
  if (state.score > (state.best[state.kind] ?? 0)) {
    state.best[state.kind] = state.score;
  }
}

/** 시계가 크게 어긋났다고 보는 간격(ms). 탭을 다른 곳에 두었다 돌아온 경우가 대부분이다. */
const RESYNC_MS = 1000;

/**
 * 시간이 흐른 만큼 게임을 움직인다. 바뀐 것이 있으면 true(화면이 다시 그린다).
 * 한 번에 0.1초보다 많이 건너뛰지 않는다(탭을 다른 곳에 두었다 돌아와도 갑자기 튀지 않게).
 * 지난 시각과 1초 넘게 벌어졌거나 거꾸로 갔으면 시계를 다시 맞추고 그 한 판은 건너뛴다
 * (탭이 숨어 있던 동안, 또는 부르는 쪽이 다른 시계를 쓰기 시작한 경우 — 갑자기 순간이동하지 않게).
 */
export function stepGame(state: GameState, now: number, options: { reducedMotion?: boolean } = {}): boolean {
  const drift = now - state.lastStep;
  if (!Number.isFinite(drift) || drift < 0 || drift > RESYNC_MS) {
    state.lastStep = now;
    state.restUntil = 0;
    state.nextSwapAt = now + COLOR.swapMs;
    return false;
  }
  const elapsed = Math.max(0, Math.min(100, drift));
  if (elapsed <= 0) {
    return false;
  }
  state.lastStep = now;
  const dt = elapsed / 1000;
  const speed = options.reducedMotion ? REDUCED : 1;
  if (state.kind === 'balloon') {
    state.vy = Math.max(-BALLOON.maxSpeed, Math.min(BALLOON.maxSpeed, state.vy + BALLOON.gravity * speed * dt));
    state.y += state.vy * speed * dt;
    if (state.y < 0.04) {
      state.y = 0.04;
      state.vy = 0;
    }
    if (state.y > 0.96) {
      state.y = 0.96;
      state.vy = 0;
    }
    const inBand = state.y >= BALLOON.top && state.y <= BALLOON.bottom;
    if (inBand) {
      state.bandMs += elapsed;
      while (state.bandMs >= BALLOON.pointMs) {
        state.bandMs -= BALLOON.pointMs;
        state.score += 1;
      }
      if (!state.inBand) {
        state.message = '띠 안에 들어왔어요! 계속 눌러 머물러요.';
      }
    } else if (state.inBand) {
      state.message = state.y < BALLOON.top ? '너무 높이 올라갔어요. 잠깐 쉬어요.' : '띠 아래로 떨어졌어요. 스페이스를 눌러요.';
      state.bandMs = 0;
    }
    state.inBand = inBand;
    rememberBest(state);
    return true;
  }
  if (state.kind === 'timing') {
    if (now < state.restUntil) {
      return false;
    }
    state.marker += state.direction * TIMING.speed * speed * dt;
    if (state.marker >= 1) {
      state.marker = 1;
      state.direction = -1;
    } else if (state.marker <= 0) {
      state.marker = 0;
      state.direction = 1;
    }
    return true;
  }
  if (now >= state.nextSwapAt) {
    const swap = options.reducedMotion ? COLOR.swapMs / REDUCED : COLOR.swapMs;
    state.nextSwapAt = now + swap;
    let next = Math.floor(nextRandom(state) * GAME_COLORS.length);
    if (next === state.colorIndex) {
      next = (next + 1) % GAME_COLORS.length;
    }
    state.colorIndex = next;
    return true;
  }
  return false;
}

/**
 * 스페이스 키(파이썬 press('space')·학생의 스페이스 바)를 게임에 넣는다. 화면 안내 글을 돌려준다.
 * 움직임 줄이기는 여기서 다루지 않는다 — 누르는 힘·점수는 같고, 움직이는 속도만 stepGame이 낮춘다.
 */
export function pressGame(state: GameState, now: number): string {
  state.presses += 1;
  if (state.kind === 'balloon') {
    // 올라가는 힘은 그대로 두고(누른 만큼 올라간다), 움직임 줄이기는 stepGame이 속도를 낮춰 천천히 움직이게 한다.
    state.vy = BALLOON.push;
    if (state.message === startMessage('balloon')) {
      state.message = '올라가요! 파란 띠 안에 머물면 점수가 올라가요.';
    }
    return state.message;
  }
  if (state.kind === 'timing') {
    if (now < state.restUntil) {
      state.message = '잠깐만요. 막대가 다시 출발하면 눌러요.';
      return state.message;
    }
    const distance = Math.abs(state.marker - 0.5);
    const gain = Math.max(0, Math.round(TIMING.maxPoints - distance * 2 * TIMING.maxPoints));
    state.lastGain = gain;
    state.score += gain;
    state.restUntil = now + TIMING.restMs;
    state.marker = 0;
    state.direction = 1;
    state.message = gain >= TIMING.maxPoints ? `한가운데예요! +${gain}점` : gain === 0 ? '가장자리에서 멈췄어요. +0점' : `+${gain}점`;
    rememberBest(state);
    return state.message;
  }
  if (state.colorIndex === state.targetIndex) {
    state.score += 1;
    let next = Math.floor(nextRandom(state) * GAME_COLORS.length);
    if (next === state.targetIndex) {
      next = (next + 1) % GAME_COLORS.length;
    }
    state.targetIndex = next;
    state.message = `맞았어요! 다음 목표는 ${GAME_COLORS[next]!.label}이에요.`;
  } else {
    state.score = Math.max(0, state.score - 1);
    state.message = `아직이에요. 목표는 ${GAME_COLORS[state.targetIndex]!.label}인데 지금은 ${GAME_COLORS[state.colorIndex]!.label}이에요.`;
  }
  rememberBest(state);
  return state.message;
}

/** 창·패널에 쓰는 점수 줄 */
export function gameScoreText(state: GameState): string {
  return `${gameInfo(state.kind).label} · 점수 ${state.score}점 · 최고 ${state.best[state.kind] ?? 0}점 · 스페이스 ${state.presses}번`;
}

/** 풍선 띠 위치(그리기·테스트가 함께 쓴다) */
export const BALLOON_BAND = Object.freeze({ top: BALLOON.top, bottom: BALLOON.bottom });
export const TIMING_RULES = TIMING;
