// 낱말 띄어쓰기 통일(판 1.3.0 검수 R2-038) — 같은 화면에서 '영상 처리/영상처리', '피지컬 컴퓨팅/피지컬컴퓨팅'이 섞이지 않게 한다.
// 쓰는 모양: 영상 처리, 피지컬 컴퓨팅(띄어 쓴다). 예외는 아래 둘뿐이다.
// - 교육청 교육과정 원문의 영역 이름 '피지컬컴퓨팅'(성취기준 표 — 표 위에 원문 표기대로 적었다고 밝힌다)
// - 용어사전 '피지컬 컴퓨팅'의 검색 별칭(aliases) — 붙여 쓴 입력으로도 찾아지게
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getPage } from '../../src/config/nav.ts';

const TEXT_EXTENSIONS = new Set(['.ts', '.mjs', '.astro', '.css', '.md', '.yaml', '.yml', '.json', '.py', '.txt', '.svg']);

function walk(dir: string, accept: (file: string) => boolean, found: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, accept, found);
    } else if (TEXT_EXTENSIONS.has(path.extname(entry.name)) && accept(full)) {
      found.push(full);
    }
  }
  return found;
}

/** 화면·글에 나가는 파일: 사이트 코드, 차시·도움말 원고, 예제 설명(.meta.yaml) */
function shippedFiles(): string[] {
  return [
    ...walk('src', () => true),
    ...walk('content', () => true),
    ...walk('examples', (file) => file.endsWith('.meta.yaml')),
  ];
}

/** 붙여 쓴 검색어를 띄어 쓴 본문 말로 바꾸는 규칙 — 붙여 쓴 낱말이 있어야 하는 유일한 코드 */
const SEARCH_REWRITE_FILE = 'src/components/search/search-rank.ts';

function hits(needle: string): string[] {
  return shippedFiles()
    .filter((file) => fs.readFileSync(file, 'utf8').includes(needle))
    .map((file) => file.split(path.sep).join('/'))
    .filter((file) => file !== SEARCH_REWRITE_FILE);
}

describe('낱말 띄어쓰기 통일(R2-038)', () => {
  it('"영상처리"를 붙여 쓴 곳이 없다 — "영상 처리"로 쓴다', () => {
    expect(hits('영상처리')).toEqual([]);
  });

  it('"피지컬컴퓨팅"을 붙여 쓴 곳은 교육과정 원문 영역 이름과 검색 별칭뿐이다', () => {
    expect(hits('피지컬컴퓨팅').sort()).toEqual(
      [
        'content/glossary/physical-computing.md',
        'src/config/standards.ts',
        'src/pages/start/teacher/index.astro',
        'src/pages/teacher/standards/index.astro', // 영역 이름이 원문 표기라는 안내 문장의 보기
      ].sort(),
    );
  });
});

// 키트 글의 개발자 낱말(판 1.7.0 구역 Z4, 미해결 266) — 키트 장치 도감·실습실 안내에서 학생이 읽는 글에 사이트 만드는 사람의 말("흉내"·machine.time_pulse_us)을 쓰지 않는다.
// 가상 보드에 없는 것은 "…가 가상 보드에 아직 없어서"로 쓴다. 데이터(YAML)는 주석을 빼고 값만 본다 — 코드 주석의 "흉내 모듈"은 개발 문서의 이름이라 그대로다.
describe('키트 글의 개발자 낱말(Z4, 미해결 266)', () => {
  const KIT_DEVELOPER_WORDS = /흉내|time_pulse_us/u;

  function stringsOf(value: unknown, found: string[] = []): string[] {
    if (typeof value === 'string') {
      found.push(value);
    } else if (Array.isArray(value)) {
      value.forEach((item) => stringsOf(item, found));
    } else if (value !== null && typeof value === 'object') {
      Object.values(value).forEach((item) => stringsOf(item, found));
    }
    return found;
  }

  it('키트 장치 목록·분류 표·예제 사이드카의 글에 "흉내"·time_pulse_us가 없다', async () => {
    const { parse } = await import('yaml');
    const files = [
      'content/kit/devices.yaml',
      'scripts/kit/kit-classification.yaml',
      ...walk('examples/esp32/kit', (file) => file.endsWith('.meta.yaml')),
    ].map((file) => file.split(path.sep).join('/'));
    const offenders = files.filter((file) => stringsOf(parse(fs.readFileSync(file, 'utf8'))).some((text) => KIT_DEVELOPER_WORDS.test(text)));
    expect(offenders).toEqual([]);
  });

  it('생성기의 기본 까닭 글(DEFAULT_REAL_ONLY)과 가상 보드 단계 설명(KIT_VIRTUAL_INFO)에도 없다 — 장치를 더할 때 옛 말이 다시 생기지 않게', async () => {
    const generator = fs.readFileSync('scripts/kit/generate-kit.mjs', 'utf8');
    const defaultReason = /const DEFAULT_REAL_ONLY = '([^']*)'/u.exec(generator)?.[1] ?? '';
    expect(defaultReason).not.toBe('');
    expect(KIT_DEVELOPER_WORDS.test(defaultReason)).toBe(false);
    const { KIT_VIRTUAL_INFO } = await import('../../src/components/kit/kit-view.ts');
    for (const info of Object.values(KIT_VIRTUAL_INFO)) {
      expect(KIT_DEVELOPER_WORDS.test(info.label), info.label).toBe(false);
      expect(KIT_DEVELOPER_WORDS.test(info.explain), info.explain).toBe(false);
    }
  });

  it('ESP32 실습실 첫 줄은 홈과 같은 말이다: 교과서 실습은 보드 없이 가상 보드로 끝까지, 키트의 일부 센서 예제는 실제 보드가 필요해요(미해결 264 #4)', () => {
    const lab = fs.readFileSync('src/pages/labs/esp32/index.astro', 'utf8');
    expect(lab).toContain('교과서 실습은 보드 없이 가상 보드로 끝까지, 키트의 일부 센서 예제는 실제 보드가 필요해요');
    // 옛 첫 줄("보드가 없어도 가상 보드로 해요.")은 바로 아래 "이 예제는 실제 보드가 필요해요" 상자와 맞부딪쳤다
    expect(lab).not.toContain('보드가 없어도 가상 보드로 해요.');
  });
});

// 메뉴 이름(판 1.6.0, DECISIONS C173) — 같은 45편의 두 쪽을 처음 온 사람이 구별하게 한다: 글만 있는 쪽은 "교과서 원문", 코드를 직접 실행하며 따라 하는 쪽은 "따라 하기".
// 옛 이름 "배우기"("풀이·실습")는 쪽 이름으로 더 쓰지 않는다. 동사로서의 "배우기"(예: "처음부터 배우기" 단추)는 그대로다.
/** 주석이 아닌 줄만 훑는다(글에 나가는 낱말만 본다) */
function visibleHits(pattern: RegExp): string[] {
  return shippedFiles()
    .filter((file) =>
      fs
        .readFileSync(file, 'utf8')
        .split(/\r?\n/u)
        .some((line) => !/^\s*(?:\/\/|\*|\/\*|<!--|#)/u.test(line) && pattern.test(line)),
    )
    .map((file) => file.split(path.sep).join('/'));
}

describe('메뉴 이름(C173)', () => {
  it('머리글 메뉴의 두 이름은 "교과서 원문"·"따라 하기"이고 id·주소는 그대로다', () => {
    expect(getPage('book')).toMatchObject({ label: '교과서 원문', title: '교과서 원문', path: '/book/' });
    expect(getPage('learn')).toMatchObject({ label: '따라 하기', title: '따라 하기', path: '/learn/' });
  });

  it('옛 쪽 이름 "배우기 페이지·쪽·차례·목록·메뉴"를 쓴 글이 없다 — "따라 하기"로 쓴다', () => {
    expect(visibleHits(/배우기 (?:페이지|쪽|차례|목록|메뉴)/u)).toEqual([]);
  });
});

// 쉬운 말·지금 상태에 맞는 글(판 1.6.0 R6 — 학부모·처음 온 사람 걷기 보고의 quick wins). 한 번 고친 글이 되돌아오지 않게 낱말로 막는다.
// 파일 읽기는 한 번만 한다(위 hits·visibleHits는 부를 때마다 src·content 전체를 다시 읽어, 이 블록의 낱말 일곱 개를 모두 부르면 부하가 큰 PC에서 1분이 넘었다).
describe('쉬운 말·낡은 문장(R6)', () => {
  const loaded: { file: string; lines: string[] }[] = shippedFiles().map((file) => ({
    file: file.split(path.sep).join('/'),
    lines: fs.readFileSync(file, 'utf8').split(/\r?\n/u),
  }));
  const isComment = (line: string) => /^\s*(?:\/\/|\*|\/\*|<!--|#)/u.test(line);
  /** 주석이 아닌 줄에 이 낱말이 든 파일(내용은 같은 글 한 줄 안에서만 맞춘다) */
  const seen = (pattern: RegExp): string[] =>
    loaded.filter(({ lines }) => lines.some((line) => !isComment(line) && pattern.test(line))).map(({ file }) => file);

  it('그림 생략 상자는 "권리 때문에"가 아니라 "저작권 때문에 이 사이트에는 싣지 못했어요. 책 N쪽에서 보세요"로 쓴다(B-14·B-61)', () => {
    expect(seen(/권리 때문에[ ,]/u)).toEqual([]);
  });

  it('차시 카드 딱지 풀이·1~4단원 절 설명에 "교과서 원고가 없어"가 없다 — 교과서 쪽이 있는 지금은 "사이트가 쉽게 다시 쓴 글"이다(B-18·B-60·B-64)', () => {
    expect(seen(/교과서 원고가 없어/u)).toEqual([]);
    // 교사용 접기 "이 차시의 원고와 자료"의 원천 문장(teacher-info.ts)도 같다 — "교과서 원고가 아직 없어서 … 원고를 받으면 바꿔요"는 지금 상태와 다르다
    expect(seen(/교과서 원고가 아직 없어서/u)).toEqual([]);
  });

  it('선생님 FAQ·자료실에 "원고가 자료에 없어요"·"앞으로 올라올 자료: 교과서 1단원 03" 같은 낡은 안내가 없다(B-49)', () => {
    expect(seen(/원고가 자료에 없어요/u)).toEqual([]);
    expect(seen(/교과서 1단원 03, 04와 4단원 원고/u)).toEqual([]);
  });

  it('휴대폰 안내 띠는 "읽기는 휴대폰도 돼요 · 실습은 컴퓨터(크롬·엣지)에서 해요"이다 — "읽기가 가장 잘 돼요"는 쓰지 않는다(A-16)', () => {
    expect(seen(/읽기가 가장 잘 돼요/u)).toEqual([]);
  });

  it('미리 받기 크기는 실습실마다 다르다 — "이 단추로 미리 받는 파일은 약 26MB예요"처럼 하나로 적지 않는다(B-54)', () => {
    expect(seen(/미리 받는 파일은 약 26MB/u)).toEqual([]);
    expect(seen(/파일\(약 26MB\)을 받아요/u)).toEqual([]);
  });

  it('상태 줄의 한 줄 글에 개발자 낱말(Pyodide·jsDelivr 주소)을 쓰지 않는다 — 자세히 칸의 단계 이름(stages.ts STAGE_LABELS)만 예외다(B-8·B-31·B-74)', () => {
    const worker = loaded.find(({ file }) => file === 'src/lab/runtime/worker.ts');
    expect((worker?.lines ?? []).filter((line) => !isComment(line)).join('\n')).not.toContain('파이썬 엔진(Pyodide)을 받는 중');
  });
});

// 같은 기능은 이름 하나(판 1.6.0 R2, DECISIONS C173 — 걷기 walk-teacher-new A1: 교과서 쪽 "수업 화면으로"·차시 쪽 "발표 모드"라 선생님이 설명을 못 찾았다).
// 프로젝터용 한 단계씩 넘기는 화면은 어디서나 "수업 화면"이고, 같은 절의 두 쪽은 "교과서 원문"·"따라 하기"다(옛 "풀이·실습"·쪽 이름 "교과서 n쪽" 단추 없음).
// 주석 줄(코드 설명·옛 이름 기록)은 보지 않는다. src/lab/README.md는 Phase 5 구역 기록(개발 문서)이라 뺀다.
describe('수업 화면·두 쪽 이름(R2)', () => {
  const isCommentLine = (line: string) => /^\s*(?:\/\/|\*|\/\*|<!--|#|\{\/\*)/u.test(line);
  const DEV_DOCS = new Set(['src/lab/README.md']);
  const shown: { file: string; lines: string[] }[] = shippedFiles()
    .map((file) => file.split(path.sep).join('/'))
    .filter((file) => !DEV_DOCS.has(file))
    .map((file) => ({ file, lines: fs.readFileSync(file, 'utf8').split(/\r?\n/u).filter((line) => !isCommentLine(line)) }));
  const shownHits = (pattern: RegExp): string[] => shown.filter(({ lines }) => lines.some((line) => pattern.test(line))).map(({ file }) => file);

  it('"발표 모드"라는 이름을 화면 글에 쓰지 않는다 — "수업 화면"으로 쓴다(단추·막대·FAQ·교사용 시작하기·자료실)', () => {
    expect(shownHits(/발표 ?모드/u)).toEqual([]);
  });

  it('[수업 화면] 단추는 한 부품(PresentButton.astro)이고, 옛 단추 글 "수업 화면으로"는 실습실의 "← 수업 화면으로" 링크(SlideReturn.astro)에만 남는다', () => {
    expect(shownHits(/data-present-open/u).sort()).toEqual(['src/components/lesson/PresentButton.astro', 'src/components/lesson/present.ts'].sort());
    expect(shownHits(/수업 화면으로\s*<\/(?:button|a)>/u)).toEqual(['src/components/lab/SlideReturn.astro']);
    const button = shown.find(({ file }) => file === 'src/components/lesson/PresentButton.astro')?.lines.join('\n') ?? '';
    expect(button).toMatch(/data-present-open[^>]*>수업 화면<\/button>/u);
  });

  it('옛 전환 줄 이름 "풀이·실습"을 화면 글에 쓰지 않는다 — "따라 하기"로 쓴다', () => {
    expect(shownHits(/풀이·실습/u)).toEqual([]);
  });
});

// 홈·출처·문의 글(판 1.7.0 구역 Z5 — 미해결 262·263 #6·264 #4·268). 한 번 고친 글이 되돌아오지 않게 낱말로 막는다. 주석 줄은 보지 않는다.
describe('홈·출처·문의 글(Z5)', () => {
  const isCommentLine = (line: string) => /^\s*(?:\/\/|\*|\/\*|<!--|#|\{\/\*)/u.test(line);
  const loadedZ5 = shippedFiles()
    .map((file) => file.split(path.sep).join('/'))
    .filter((file) => file !== 'src/lab/README.md')
    .map((file) => ({ file, lines: fs.readFileSync(file, 'utf8').split(/\r?\n/u).filter((line) => !isCommentLine(line)) }));
  const z5Hits = (pattern: RegExp): string[] => loadedZ5.filter(({ lines }) => lines.some((line) => pattern.test(line))).map(({ file }) => file);

  it('"모든 보드 실습"이라고 하지 않는다 — 키트의 일부 센서 예제는 실제 보드가 필요하므로 "교과서 실습은 보드 없이 … 키트의 일부 센서 예제는 실제 보드가 필요해요"로 쓴다(264 #4)', () => {
    expect(z5Hits(/모든 보드 실습/u)).toEqual([]);
  });

  it('홈의 키트 단추 이름은 "보드 켜기"가 아니라 메뉴 이름과 같은 "보드 준비"이다(262)', () => {
    expect(z5Hits(/보드 켜기/u)).toEqual([]);
  });

  it('홈 알약에 사이트 안쪽 말 "웹 차시 N편"을 쓰지 않는다 — 메뉴 이름 "따라 하기 N편"으로 쓴다(268 ②)', () => {
    expect(z5Hits(/절 · 웹 차시/u)).toEqual([]);
  });

  it('홈 맨 아래 안내가 "권장해요"로 끝나지 않는다 — 휴대폰으로 되는 범위(읽기)를 말한다(263 #6)', () => {
    expect(z5Hits(/브라우저를 권장해요/u)).toEqual([]);
  });
});
