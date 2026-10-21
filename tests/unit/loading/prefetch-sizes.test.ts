// 미리 받기 크기(src/lab/loader/prefetch-sizes.ts, 판 1.6.0 R6): 실습실마다 받는 양이 다르다는 것을 한 함수에서 계산하고,
// 교사용 시작하기·선생님 FAQ의 숫자가 그 함수와 같은지 지킨다(걷기 보고 B-54 — "약 26MB"라고만 적어 ESP32 실습실에서 다른 숫자를 본 선생님이 있었다).
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { approxMegabytes, prefetchSizeRows, prefetchSizeSummary } from '../../../src/lab/loader/prefetch-sizes.ts';
import { PYODIDE_CORE_BYTES, pyodidePrefetchBytesFor } from '../../../src/lab/loader/pyodide-files.ts';

describe('실습실별 미리 받기 크기', () => {
  it('영상 처리 실습실은 파이썬 엔진 + numpy + OpenCV(약 26MB), ESP32 실습실은 파이썬 엔진만(약 13MB)이다', () => {
    const rows = prefetchSizeRows();
    const vision = rows.find((row) => row.id === 'vision');
    const esp32 = rows.find((row) => row.id === 'esp32');
    expect(vision?.text).toBe('약 26MB');
    expect(esp32?.text).toBe('약 13MB');
    expect(esp32?.bytes).toBe(PYODIDE_CORE_BYTES);
    expect(vision?.bytes).toBe(pyodidePrefetchBytesFor(['opencv-python'], false));
    expect((vision?.bytes ?? 0) > (esp32?.bytes ?? 0)).toBe(true);
  });

  it('통신·4단원 통합 실습실은 두 실습실이 엔진을 나눠 써서 영상 처리 실습실과 같은 양이다', () => {
    const rows = prefetchSizeRows();
    expect(rows.find((row) => row.id === 'comm')?.bytes).toBe(rows.find((row) => row.id === 'vision')?.bytes);
  });

  it('한 줄 요약은 영상 처리·ESP32 두 실습실을 적는다', () => {
    expect(prefetchSizeSummary()).toBe('영상 처리 실습실 약 26MB · ESP32 실습실 약 13MB');
  });

  it('approxMegabytes: 정수 MB로 반올림한다', () => {
    expect(approxMegabytes(13_531_207)).toBe('약 13MB');
    expect(approxMegabytes(27_167_539)).toBe('약 26MB');
  });
});

describe('안내 글의 숫자는 계산한 값과 같다', () => {
  const faq = fs.readFileSync('content/help/faq-teacher.md', 'utf8');

  it('선생님 FAQ의 "교실 컴퓨터에 무엇을 설치해야 하나요?"는 실습실마다 받는 양을 계산한 값 그대로 적는다', () => {
    for (const row of prefetchSizeRows().filter((item) => item.id !== 'comm')) {
      expect(faq, row.label).toContain(`${row.label.replace(' 실습실', '')} 실습실 ${row.text}`);
    }
  });

  it('교사용 시작하기는 같은 함수로 실습실마다 한 줄씩 그린다(숫자를 글에 직접 적지 않는다)', () => {
    const page = fs.readFileSync('src/pages/start/teacher/index.astro', 'utf8');
    expect(page).toContain("from '../../../lab/loader/prefetch-sizes.ts'");
    expect(page).toContain('prefetchSizeRows()');
    expect(page).toContain('data-prefetch-sizes');
    expect(page).not.toMatch(/미리 받는 파일은 약 26MB/u);
  });
});
