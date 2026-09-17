/**
 * 보드 라이브러리 파일 묶음(병렬 제작 준비 2026-09-17) — examples/esp32/lib/**\/*.py를 빌드 때 글자로 읽는다(import.meta.glob + ?raw).
 * 규칙·함수는 board-libraries.ts. Vite(사이트 빌드·Vitest)에서만 import한다(Playwright·Node 스크립트는 board-libraries.ts를 직접 쓴다).
 * 라이브러리가 없으면 빈 목록이다 — 부품 구역(P3-03~P3-05)이 파일을 더하면 코드 수정 없이 가상 보드 /board/lib/와 [보드에 저장]에 들어간다.
 */
import { boardLibrariesFromFiles, type BoardLibrary } from './board-libraries.ts';

const files = import.meta.glob<string>('/examples/esp32/lib/**/*.py', { query: '?raw', eager: true, import: 'default' });

/** 가상 보드 워커 안에서 라이브러리를 두는 폴더(apc_board.py의 BOARD_LIB_DIR와 같다 — sys.path 끝) */
export const BOARD_LIBRARY_DIR = '/board/lib';

/** 사이트가 주는 보드 라이브러리 전체(파일 이름 순) */
export const BOARD_LIBRARIES: readonly BoardLibrary[] = Object.freeze(boardLibrariesFromFiles(files));
