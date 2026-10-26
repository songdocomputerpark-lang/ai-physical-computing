import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseRegistry } from '../../scripts/lib/sources-registry.mjs';
import {
  REDISTRIBUTION_NOTICES,
  SOURCE_OFFER,
  SOURCE_OFFER_EN,
  buildCreditsView,
  categoryLabel,
  formatKoreanDate,
  isExcluded,
  isNoticeFilePath,
  noticeFilesOf,
  stripDeveloperRefs,
} from '../../src/lib/credits.ts';

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
    expect(view.licenseGroups.flatMap((group) => group.entries.map((entry) => entry.name))).toContain('Astro 7.4.1');
  });

  it('출처 페이지에 글자 그대로 보이는 칸(이름·저작자·라이선스·쓰는 곳·권리 표기)에는 마크다운 굵게(**)를 쓰지 않는다', () => {
    // 출처 페이지(/credits/)는 이 칸들을 마크다운으로 바꾸지 않고 글자 그대로 보여 준다 — "**설명 파일…**"이 별표째 보였다(2026-09-30 최종 점검 TD-06).
    // 글 속 경로 글롭(content/lessons/**/*.images.yaml처럼 / 뒤의 **)과 paths·exclude_paths 칸은 그대로 둔다.
    const { entries } = parseRegistry(fs.readFileSync(new URL('../../sources.yaml', import.meta.url), 'utf8'));
    const shown = entries.flatMap((entry) =>
      (['name', 'author', 'license', 'used_in', 'rights'] as const)
        .map((field) => [field, (entry as unknown as Record<string, unknown>)[field]] as const)
        .filter(([, value]) => typeof value === 'string' && value.replace(/\/\*\*/gu, '/').includes('**'))
        .map(([field]) => `${entry.name} — ${field}`),
    );
    expect(shown).toEqual([]);
  });

  it('분류 이름과 날짜를 한국어로 보여 준다', () => {
    expect(categoryLabel('third_party')).toBe('제3자 권리 표기 자료');
    expect(categoryLabel('stack')).toBe('실행 구성요소');
    expect(formatKoreanDate('2026-09-05')).toBe('2026년 9월 5일');
  });
});

describe('고지 전문 파일(2026-09-26 P6-04)', () => {
  const registryText = fs.readFileSync(new URL('../../sources.yaml', import.meta.url), 'utf8');

  it('public/ 아래의 고지 파일 하나만 고지 파일로 본다(경로 패턴·public 밖·일반 그림은 아님)', () => {
    expect(isNoticeFilePath('public/licenses/mqtt.txt')).toBe(true);
    expect(isNoticeFilePath('public/firmware/v1.29.0/NOTICE.txt')).toBe(true);
    expect(isNoticeFilePath('public/fonts/pretendard/LICENSE.txt')).toBe(true);
    expect(isNoticeFilePath('public/firmware/v1.29.0/**')).toBe(false);
    expect(isNoticeFilePath('public/images/lessons/1-1-1/a.webp')).toBe(false);
    expect(isNoticeFilePath('src/lab/modules/mediapipe/face-connections.ts')).toBe(false);
  });

  it('항목의 고지 파일은 대표 notice가 먼저이고, paths에 적힌 고지 파일이 뒤에 한 번씩 붙는다', () => {
    const { entries } = parseRegistry(registryText);
    const firmware = entries.find((entry) => entry.name.startsWith('MicroPython ESP32_GENERIC'));
    expect(firmware).toBeDefined();
    expect(noticeFilesOf(firmware!)).toEqual(['public/licenses/micropython-esp32-firmware.txt', 'public/firmware/v1.29.0/NOTICE.txt']);
    const opencv = entries.find((entry) => entry.name.startsWith('OpenCV 4.11.0'));
    expect(noticeFilesOf(opencv!)).toEqual(['public/licenses/opencv.txt', 'public/licenses/opencv-python.txt', 'public/licenses/opencv-3rd-party.txt']);
  });

  it('출처 페이지의 고지 파일 모음은 public/licenses/의 파일을 하나도 빠뜨리지 않고, 모든 파일이 실제로 있다', () => {
    const view = buildCreditsView(registryText);
    const listed = new Set(view.noticeFiles.map((file) => file.path));
    const onDisk = fs.readdirSync(new URL('../../public/licenses/', import.meta.url)).map((name) => `public/licenses/${name}`);
    expect(onDisk.filter((file) => !listed.has(file))).toEqual([]);
    for (const file of view.noticeFiles) {
      expect(fs.existsSync(new URL(`../../${file.path}`, import.meta.url)), file.path).toBe(true);
      expect(file.href.endsWith(file.path.slice('public/'.length)), file.path).toBe(true);
      expect(file.entries.length).toBeGreaterThan(0);
    }
  });

  it('한국어 머리말이 있는 고지 파일은 UTF-8 BOM으로 시작한다(charset 없이 보내는 서버·file://에서도 한국어가 깨지지 않게 — 2026-09-26 개발 서버에서 EUC-KR로 읽힌 것)', () => {
    const view = buildCreditsView(registryText);
    const missing = view.noticeFiles
      .map((file) => ({ path: file.path, bytes: fs.readFileSync(new URL(`../../${file.path}`, import.meta.url)) }))
      .filter(({ bytes }) => bytes.some((byte) => byte >= 0x80))
      .filter(({ bytes }) => !(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf))
      .map(({ path }) => path);
    expect(missing).toEqual([]);
  });

  it('다시 나누는 파일의 알림(FFmpeg LGPL·Pagefind GPL·IJG·FreeType·Eigen·펌웨어)은 등록부에 걸린 실제 고지 파일을 가리킨다', () => {
    const view = buildCreditsView(registryText);
    const listed = new Set(view.noticeFiles.map((file) => file.path));
    expect(REDISTRIBUTION_NOTICES.map((notice) => notice.id)).toEqual(['ffmpeg-lgpl', 'pagefind-gpl', 'ijg', 'freetype', 'eigen-mpl', 'firmware']);
    for (const notice of REDISTRIBUTION_NOTICES) {
      expect(listed.has(notice.noticePath), notice.noticePath).toBe(true);
    }
    const wheels = fs.readFileSync(new URL('../../public/licenses/pyodide-wheels-3rd-party.txt', import.meta.url), 'utf8');
    for (const statement of REDISTRIBUTION_NOTICES.flatMap((notice) => (notice.statement ? [notice.statement] : []))) {
      // 출처 페이지의 문장과 고지 파일의 문장이 같아야 한다(두 곳이 어긋나지 않게 — 파일은 줄 맞춤으로 빈칸이 둘일 수 있다)
      expect(wheels.replace(/ {2,}/gu, ' ')).toContain(statement);
    }
  });

  it('대응 소스 서면 제안(LGPL-2.1 6조 c·GPL-3.0 6조 b)이 고지 파일 두 개와 출처 페이지 알림에 같은 글자로 있다(2026-09-26 Phase 6 안전 검토 지적 3·4)', () => {
    for (const file of ['pyodide-wheels-3rd-party.txt', 'pagefind-wasm-3rd-party.txt']) {
      const text = fs.readFileSync(new URL(`../../public/licenses/${file}`, import.meta.url), 'utf8');
      expect(text, file).toContain(SOURCE_OFFER);
      expect(text, file).toContain(SOURCE_OFFER_EN);
    }
    const byId = new Map(REDISTRIBUTION_NOTICES.map((notice) => [notice.id, notice]));
    expect(byId.get('ffmpeg-lgpl')?.text).toContain(SOURCE_OFFER);
    expect(byId.get('pagefind-gpl')?.text).toContain(SOURCE_OFFER);
    // 제안에는 기간(3년)·값(무료)·요청 창구가 들어 있어야 한다
    expect(SOURCE_OFFER).toMatch(/적어도 3년/u);
    expect(SOURCE_OFFER).toMatch(/무료/u);
    expect(SOURCE_OFFER).toContain('/issues');
  });
});

// 판 1.7.0(미해결 268 ①, 걷기 B-56): 출처 쪽의 눈에 보이는 줄에는 결정 번호·할 일 번호·저장소 폴더 경로를 두지 않는다 — 접힌 "자세히(개발자용)"에 원문이 있다.
describe('개발자용 참조 빼기(stripDeveloperRefs)', () => {
  it('괄호 안의 결정 번호·할 일 번호·폴더 경로 조각만 버리고 나머지는 그대로 둔다', () => {
    expect(stripDeveloperRefs('원 권리자 보유 — 운영자가 받은 사용 허락(2026-10-15 확인, DECISIONS O17), 사이트 CC BY-NC-SA 4.0·MIT 적용 제외')).toBe(
      '원 권리자 보유 — 운영자가 받은 사용 허락(2026-10-15 확인), 사이트 CC BY-NC-SA 4.0·MIT 적용 제외',
    );
    expect(stripDeveloperRefs('운영자가 사용 허락을 받았어요(운영자 확인 2026-10-15, 운영자 할 일 24번 해결 — DECISIONS O17·C136). 표기 문구는 그대로예요.')).toBe(
      '운영자가 사용 허락을 받았어요(운영자 확인 2026-10-15). 표기 문구는 그대로예요.',
    );
    expect(stripDeveloperRefs('학습 자료(content/ — 차시 본문·용어사전 등)와 그림 파일(public/images/)')).toBe('학습 자료(차시 본문·용어사전 등)와 그림 파일');
  });

  it('남은 조각이 없는 괄호는 앞 공백까지 지운다', () => {
    expect(stripDeveloperRefs('운영자 사용 허락(O5), 사이트 적용 제외')).toBe('운영자 사용 허락, 사이트 적용 제외');
    expect(stripDeveloperRefs('싣지 않았어요 (DECISIONS C11).')).toBe('싣지 않았어요.');
    expect(stripDeveloperRefs('펌웨어 굽기 목록(public/firmware/manifest.json)')).toBe('펌웨어 굽기 목록');
    expect(stripDeveloperRefs('제외 문구예요(PD-26, PLAN §8.1).')).toBe('제외 문구예요.');
    expect(stripDeveloperRefs('플래셔 스텁은 싣지 않아요(PD-38).')).toBe('플래셔 스텁은 싣지 않아요.');
    expect(stripDeveloperRefs('같은 뼈대예요(DECISIONS C12 — 파일 맨 앞 주석과 public/licenses/esp32ble.txt).')).toBe('같은 뼈대예요.');
  });

  it('개발자용 조각이 없는 괄호는 글자 하나 바꾸지 않는다(날짜·줄표·파일 이름·패키지 설명)', () => {
    for (const same of [
      'TechToTinker 글(025)에 표기가 없음(2026-09-15 확인, 2026-10-01 이 주소로 다시 확인 — 사이트 바닥의 저작권 줄만 있음).',
      'Pillow 12.2.0(Pyodide 패키지 pillow)',
      'micropython_ir(ir_rx.py·ir_tx.py)',
      'python_lcd(i2c_lcd.py 사이트 배포본)',
      '운영자 자체 자료(박상진·김석전, 운영자 확인 2026-09-15)',
      '글 없음',
    ]) {
      expect(stripDeveloperRefs(same), same).toBe(same);
    }
  });

  it('실제 sources.yaml: 라이선스·권리 문구·이름·사이트 라이선스 적용 범위를 걸러 낸 글에 결정 번호·할 일 번호·폴더 경로가 남지 않는다', () => {
    const { entries } = parseRegistry(fs.readFileSync(new URL('../../sources.yaml', import.meta.url), 'utf8'));
    const developerLeft = /DECISIONS|운영자 할 일|\b(?:public|src|content|examples|scripts|docs|tests)\/|\([CO]\d+\)/u;
    const left: string[] = [];
    for (const entry of entries) {
      for (const [field, value] of [
        ['name', entry.name],
        ['license', entry.license],
        ['rights', entry.rights ?? ''],
      ] as const) {
        const shown = stripDeveloperRefs(value);
        if (developerLeft.test(shown)) {
          left.push(`${entry.name} — ${field}: ${shown.slice(0, 80)}`);
        }
      }
    }
    expect(left).toEqual([]);
  });
});
