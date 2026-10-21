/**
 * "이 컴퓨터에 실습 파일 미리 받기"로 받는 양을 실습실마다 알려 주는 한 곳(판 1.6.0 R6 — 걷기 보고 walk-teacher-new B-54).
 *
 * 왜: 교사용 시작하기·선생님 FAQ가 "약 26MB"라고만 적어서 ESP32 실습실을 연 선생님은 준비 칸에서 다른 숫자(12.9MB)를 보았다.
 * 두 실습실의 미리 받기 범위가 다르다 — 영상 처리 실습실은 파이썬 엔진 + numpy + OpenCV(LabShell pyodidePackages = VISION_PACKAGES),
 * ESP32 실습실은 파이썬 엔진만(pyodidePackages = [] — PD-04). 숫자는 파일 표(pyodide-files.ts)에서 계산해 글에 직접 적지 않는다.
 * 통신·4단원 통합 실습실은 두 실습실을 한 쪽에 올려 같은 파이썬 엔진을 함께 쓰므로 영상 처리 실습실과 같은 양이다(ESP32 쪽은 엔진만이라 더 받지 않는다).
 *
 * 화면(교사용 시작하기)이 이 함수를 부르고, 선생님 FAQ(content/help/faq-teacher.md)의 숫자는 단위 시험(tests/unit/loading/prefetch-sizes.test.ts)이 같은지 지킨다.
 * 브라우저 번들에 들어가지 않는다(빌드 때 페이지가 부름) — 그래도 순수 함수로 둔다.
 */
import { VISION_PACKAGES } from '../vision/examples.ts';
import { approxMegabytes, pyodidePrefetchBytesFor } from './pyodide-files.ts';

export { approxMegabytes };

/** 한 실습실의 미리 받기 양 */
export interface PrefetchSizeRow {
  readonly id: 'vision' | 'esp32' | 'comm';
  /** 사이트 지도의 쪽 id(주소를 getPage로 찾는다) */
  readonly pageId: 'labs-vision' | 'labs-esp32' | 'labs-unit4';
  /** 화면에 보이는 실습실 이름(짧게) */
  readonly label: string;
  /** 미리 받는 파일의 크기(바이트, 압축 풀기 전) */
  readonly bytes: number;
  /** "약 26MB" — 정수 MB로 반올림 */
  readonly text: string;
}

/** 실습실별 미리 받기 양(영상 처리 · ESP32 · 통신·4단원 통합). 온라인 사이트 기준(오프라인판은 안내 글이 따로 있다) */
export function prefetchSizeRows(): readonly PrefetchSizeRow[] {
  const vision = pyodidePrefetchBytesFor(VISION_PACKAGES, false);
  const esp32 = pyodidePrefetchBytesFor([], false);
  return [
    { id: 'vision', pageId: 'labs-vision', label: '영상 처리 실습실', bytes: vision, text: approxMegabytes(vision) },
    { id: 'esp32', pageId: 'labs-esp32', label: 'ESP32 실습실', bytes: esp32, text: approxMegabytes(esp32) },
    // 4단원 통합 실습실은 한 쪽에 영상 처리 칸과 ESP32 칸이 함께 있다 — 파이썬 엔진은 하나를 나눠 써서 영상 처리 실습실과 같다
    { id: 'comm', pageId: 'labs-unit4', label: '통신·4단원 통합 실습실', bytes: vision, text: approxMegabytes(vision) },
  ];
}

/** 한 줄 요약("영상 처리 실습실 약 26MB · ESP32 실습실 약 13MB") — 통합 실습실은 영상 처리와 같아 따로 적지 않는다 */
export function prefetchSizeSummary(): string {
  return prefetchSizeRows()
    .filter((row) => row.id !== 'comm')
    .map((row) => `${row.label} ${row.text}`)
    .join(' · ');
}
