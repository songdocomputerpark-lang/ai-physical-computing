/**
 * 4단원 통합 화면의 설정값 한 곳(PLAN §8.4 P4-09). DOM·실습실 코드를 import하지 않아 빌드(Astro 컴포넌트)에서도 읽을 수 있다.
 */

/**
 * 4-2 예제의 보드 코드가 가정하는 가상 모니터 논리 해상도(PD-22, CODE_MAPPING §6.4).
 * 보드 코드가 `map(mouse_x, 0, 3840, 0, 180)`처럼 3840×2160을 그대로 쓰기 때문에,
 * 기본값 1920×1080으로 두면 서보가 절반(89°)까지만 움직인다.
 */
export const UNIT4_SCREEN = { width: 3840, height: 2160 } as const;

/** 가상 데스크톱 칸의 해상도 선택 상자에 넣는 값 모양(src/lab/modules/desktop/index.ts와 같은 규칙) */
export const UNIT4_SCREEN_VALUE = `${UNIT4_SCREEN.width}x${UNIT4_SCREEN.height}`;

/** 성능을 재는 간격(ms) */
export const SAMPLE_MS = 500;
/** 보드 코드가 돌기 시작할 때까지 기다리는 최대 시간(ms) — 파이썬을 처음 받는 시간까지 넉넉히 본다. */
export const BOARD_READY_MS = 20_000;
/** 블루투스가 이어질 때까지 기다리는 최대 시간(ms) */
export const CONNECT_MS = 8000;
