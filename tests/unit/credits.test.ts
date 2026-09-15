import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildCreditsView, categoryLabel, formatKoreanDate, isExcluded } from '../../src/lib/credits.ts';

const OPERATOR_LICENSE = '운영자 자체 자료(박상진·김석전, 운영자 확인 2026-09-15)';

const SAMPLE_REGISTRY = `sources:
  - name: 교과서 원고
    category: operator
    author: 박상진·김석전
    license: ${OPERATOR_LICENSE}
    used_in: 차시 본문
    paths: [content/**]
    fetched: 2026-09-15
  - name: 스톡 그림
    category: third_party
    author: 원 제작자
    license: 원 권리자 보유 — 사이트 라이선스 적용 제외
    used_in: 차시 그림
    rights: "© 원 제작자. All rights reserved."
    paths: [public/images/lessons/u1/third-party/stock.png]
    fetched: 2026-09-15
  - name: Zeta 라이브러리
    category: library
    author: 누군가
    license: MIT
    url: https://example.com/zeta
    used_in: 예제
    npm: [zeta]
    fetched: 2026-09-15
  - name: 시험 파일
    category: self
    author: 박상진·김석전
    license: MIT
    used_in: 시험
    paths: [public/_probe/**]
  - name: Astro
    category: stack
    author: Astro 기여자
    license: MIT
    url: https://github.com/withastro/astro
    used_in: 사이트 틀
    npm: [astro]
    fetched: 2026-09-15
`;

describe('출처 페이지 데이터(src/lib/credits.ts)', () => {
  it('라이선스별로 묶고, 사이트 라이선스가 적용되는 묶음을 앞에 둔다', () => {
    const view = buildCreditsView(SAMPLE_REGISTRY);
    expect(view.entryCount).toBe(5);
    expect(view.licenseGroups.map((group) => group.license)).toEqual([
      OPERATOR_LICENSE,
      'MIT',
      '원 권리자 보유 — 사이트 라이선스 적용 제외',
    ]);
    const mit = view.licenseGroups[1];
    expect(mit.entries.map((entry) => entry.name)).toEqual(['시험 파일', 'Astro', 'Zeta 라이브러리']);
    expect(mit.licenseUrl).toBe('https://spdx.org/licenses/MIT.html');
    expect(view.licenseGroups[2].licenseUrl).toBeUndefined();
  });

  it('제3자 권리 표기 자료를 따로 모으고, 운영자·자체 제작이 아닌 자료는 사이트 라이선스에서 제외로 표시한다', () => {
    const view = buildCreditsView(SAMPLE_REGISTRY);
    expect(view.thirdParty.map((entry) => entry.name)).toEqual(['스톡 그림']);
    expect(view.thirdParty[0].rights).toBe('© 원 제작자. All rights reserved.');

    const flags = Object.fromEntries(
      view.licenseGroups.flatMap((group) => group.entries).map((entry) => [entry.name, isExcluded(entry)]),
    );
    expect(flags).toEqual({
      '교과서 원고': false,
      '시험 파일': false,
      Astro: true,
      'Zeta 라이브러리': true,
      '스톡 그림': true,
    });
  });

  it('등록부에 오류가 있으면 예외를 던져 빌드를 멈춘다', () => {
    expect(() => buildCreditsView('sources:\n  - name: 이름만\n')).toThrow(/sources\.yaml 형식 오류/u);
  });

  it('저장소의 실제 sources.yaml로 페이지 데이터를 만들 수 있다', () => {
    const text = fs.readFileSync(new URL('../../sources.yaml', import.meta.url), 'utf8');
    const view = buildCreditsView(text);
    expect(view.entryCount).toBeGreaterThanOrEqual(6);
    expect(view.licenseGroups.flatMap((group) => group.entries.map((entry) => entry.name))).toContain('Astro 7.3.2');
  });

  it('분류 이름과 날짜를 한국어로 보여 준다', () => {
    expect(categoryLabel('third_party')).toBe('제3자 권리 표기 자료');
    expect(categoryLabel('stack')).toBe('실행 구성요소');
    expect(formatKoreanDate('2026-09-05')).toBe('2026년 9월 5일');
  });
});
