/**
 * 4단원 통합 화면의 설정값 한 곳(PLAN §8.4 P4-09). DOM·실습실 코드를 import하지 않아 빌드(Astro 컴포넌트)에서도 읽을 수 있다.
 */

/**
 * 4-2 예제의 보드 코드가 가정하는 가상 모니터 논리 해상도(PD-22, CODE_MAPPING §6.3·§6.4).
 * 보드 코드가 `map(mouse_x, 0, 3840, 0, 180)`처럼 3840×2160을 그대로 쓰기 때문에,
 * 기본값 1920×1080으로 두면 서보가 절반(89°)까지만 움직인다.
 * 가상 데스크톱 모듈(src/lab/modules/desktop/model.ts SCREEN_PRESETS)에 이미 있는 선택지를 고르는 방식이라 모듈을 고치지 않는다.
 */
export const UNIT4_SCREEN = Object.freeze({ width: 3840, height: 2160 });

/** 가상 데스크톱 칸의 해상도 선택 상자에 넣는 값 모양(src/lab/modules/desktop/panel.astro와 같은 규칙) */
export const UNIT4_SCREEN_VALUE = `${UNIT4_SCREEN.width}x${UNIT4_SCREEN.height}`;

/**
 * 가상 데스크톱 모듈이 고른 해상도를 기억하는 저장 이름(src/lab/modules/desktop/index.ts의 storeName('screen')).
 * 이 화면이 3840×2160으로 바꿀 때 모듈이 그 값을 기억해 버리면 영상처리 실습실의 1920×1080 예제까지 3840으로 열린다.
 * 그래서 바꾼 **직후에** 원래 기억값을 되돌려 둔다(학생이 직접 고른 값은 모듈이 그대로 기억한다).
 */
export const DESKTOP_SCREEN_STORAGE_NAME = 'module:desktop:screen';

/** 성능을 재는 간격(ms) */
export const SAMPLE_MS = 500;
/** 두 파이썬이 준비될 때까지 기다리는 최대 시간(ms) — 학교망에서 처음 받는 시간(PLAN §5.1 Fast 3G 약 3.6분)까지 본다 */
export const PYTHON_READY_MS = 300_000;
/** 보드 코드가 돌고 블루투스 광고를 시작할 때까지 기다리는 최대 시간(ms) */
export const BOARD_START_MS = 30_000;
/** [연결]을 누른 뒤 이어질 때까지 기다리는 최대 시간(ms) */
export const CONNECT_MS = 8_000;
/** 상태를 다시 보는 간격(ms) */
export const POLL_MS = 100;

/** 공유 링크·?example=을 페이지가 나눠 주려고 잠깐 맡아 두는 전역 이름(index.astro의 인라인 스크립트가 쓴다) */
export const ADDRESS_STASH_KEY = '__apcUnit4Address';
