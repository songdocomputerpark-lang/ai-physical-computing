// 회로 그림 목록 읽기·그림 HTML·교과서 쪽의 ::회로 지시자(판 1.4.0 C5)
// 목록(scripts/circuits/circuits.yaml)의 칸 규칙과 그림 파일·.circuit 대조는 circuits.test.ts가 본다. 여기서는 목록을 사이트가 읽는 방법과 화면 HTML을 본다.
import { markdownConfigDefaults, unified } from '@astrojs/markdown-remark';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import remarkDirective from 'remark-directive';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatBookCheck, reportFailed, runBookCheck } from '../../../scripts/lib/check-book.mjs';
import { bookSchema } from '../../../src/config/content-schemas.ts';
import { checkBookRules } from '../../../src/components/book/book-rules.ts';
import { placeCircuitSlots, planBookBody } from '../../../src/components/book/book-html.ts';
import { circuitFigureHtml } from '../../../src/components/circuits/circuit-html.ts';
import {
  CIRCUITS_FILE,
  CircuitsFormatError,
  circuitImageUrl,
  circuitsForLesson,
  findCircuit,
  parseCircuitsYaml,
} from '../../../src/components/circuits/circuits-schema.ts';
import { bookOnlyIssues } from '../../../src/components/lesson/lesson-rules.ts';
import remarkBoxes from '../../../src/lib/remark-boxes.mjs';
import remarkGlossary from '../../../src/lib/remark-glossary.mjs';

const rootDir = path.resolve(import.meta.dirname, '..', '..', '..');
const list = parseCircuitsYaml(fs.readFileSync(path.join(rootDir, CIRCUITS_FILE), 'utf8'));
const NOTE = '브릭셀 회로 구성 도구로 그린 배선(ESP32 실드 V3). 교과서 사진의 보드와 모양이 달라도 같은 번호 핀에 꽂아요.';

async function render(markdown: string): Promise<string> {
  const renderer = await unified({ remarkPlugins: [remarkDirective, remarkGlossary, remarkBoxes] as never }).createRenderer({ ...markdownConfigDefaults, syntaxHighlight: false });
  return (await renderer.render(markdown)).code;
}

/** 한 그림만 든 목록 글(그림 파일 모양은 규칙에 맞게) */
function yamlWith(figure: string, extra = ''): string {
  return `version: 1\ncaption_note: ${NOTE}\nfigures:\n${figure}\n${extra}`;
}

const GOOD_FIGURE = `  - id: 2-1-2-1
    lesson: 2-1-2
    textbook_page: 125
    title: LCD 연결
    parts:
      - { part: lcd-i2c, pins: { sda: 21, scl: 22 } }
    caption: LCD를 21번(SDA)·22번(SCL) 핀에 연결해요.
    alt: ESP32 실드 V3 보드 아래에 LCD가 있어요.
    image:
      file: public/images/circuits/third-party/kit-vendor/2-1-2-1.webp
      width: 1379
      height: 1208`;

describe('회로 그림 목록 읽기(parseCircuitsYaml)', () => {
  it('저장소의 목록을 읽는다: 23장, 캡션 고정 문장, 그림마다 파일 주소·크기', () => {
    expect(list.figures).toHaveLength(23);
    expect(list.captionNote).toBe(NOTE);
    for (const figure of list.figures) {
      expect(circuitImageUrl(figure), figure.id).toBe(`/images/circuits/third-party/kit-vendor/${figure.id}.webp`);
      expect(figure.width, figure.id).toBeGreaterThan(300);
      expect(figure.height, figure.id).toBeGreaterThan(300);
      expect(fs.existsSync(path.join(rootDir, figure.file)), `${figure.id} 그림 파일`).toBe(true);
    }
  });

  it('번호로 찾고 차시로 모은다(목록의 차례 그대로)', () => {
    expect(findCircuit(list, '2-1-2-1')?.title).toBe('LCD 연결');
    expect(findCircuit(list, '9-9-9-9')).toBeUndefined();
    expect(circuitsForLesson(list, '2-1-2').map((figure) => figure.id)).toEqual(['2-1-2-1', '2-1-2-2']);
    expect(circuitsForLesson(list, '4-2-2').map((figure) => figure.id)).toEqual(['4-2-2-1', '4-2-2-2']);
    expect(circuitsForLesson(list, '2-1-1')).toEqual([]);
  });

  it('그리지 못한 연결(버저 2번 핀)은 그 차시의 마지막 그림에만 안내로 붙는다', () => {
    expect(findCircuit(list, '4-2-2-1')?.undrawnNote).toBeUndefined();
    const note = findCircuit(list, '4-2-2-2')?.undrawnNote ?? '';
    expect(note).toContain('버저(2번 핀)');
    expect(note).toContain('교과서 277쪽');
    expect(list.figures.filter((figure) => figure.undrawnNote).map((figure) => figure.id)).toEqual(['4-2-2-2']);
  });

  it('올바른 한 장짜리 목록을 읽는다', () => {
    const one = parseCircuitsYaml(yamlWith(GOOD_FIGURE));
    expect(one.figures).toHaveLength(1);
    expect(one.figures[0]).toMatchObject({ id: '2-1-2-1', lesson: '2-1-2', textbookPage: 125, width: 1379, height: 1208, parts: ['lcd-i2c'] });
  });

  it('틀린 곳은 모아서 한국어 오류 하나로 던진다', () => {
    const bad = yamlWith(
      GOOD_FIGURE.replace('id: 2-1-2-1', 'id: 2-1-2').replace('lesson: 2-1-2', 'lesson: 2-1-3').replace('width: 1379', 'width: 0').replace('textbook_page: 125', 'textbook_page: abc'),
    );
    let caught: unknown;
    try {
      parseCircuitsYaml(bad);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(CircuitsFormatError);
    const problems = (caught as CircuitsFormatError).problems.join('\n');
    expect(problems).toContain('"<차시 번호>-<번호>" 모양');
    expect(problems).toContain('textbook_page');
    expect(problems).toContain('image.width·height');
    expect(() => parseCircuitsYaml(yamlWith(GOOD_FIGURE.replace(/\n {4}image:[\s\S]*$/u, '')))).toThrow(/image 칸이 없어요/u);
    expect(() => parseCircuitsYaml(`${yamlWith(GOOD_FIGURE)}\n${GOOD_FIGURE}`)).toThrow(/겹쳐요/u);
    expect(() => parseCircuitsYaml('figures: []\n')).toThrow(/caption_note/u);
    expect(() => parseCircuitsYaml('hello: 1\n')).toThrow(/figures: 목록/u);
  });
});

describe('회로 그림 HTML(circuitFigureHtml)', () => {
  const figure = findCircuit(list, '2-1-2-1')!;

  it('그림(대체 글·크기·늦게 받기)·이름표·한 줄 설명·고정 문장·[그림 크게 보기]가 한 덩어리다', () => {
    const html = circuitFigureHtml(figure, list.captionNote);
    expect(html).toContain('<figure class="book-circuit" data-circuit="2-1-2-1" data-pagefind-ignore>');
    expect(html).toContain('src="/images/circuits/third-party/kit-vendor/2-1-2-1.webp"');
    expect(html).toContain(`alt="${figure.alt}"`);
    expect(html).toContain(`width="${figure.width}" height="${figure.height}" loading="lazy" decoding="async"`);
    expect(html).toContain('<span class="book-circuit__tag">회로 그림</span> LCD를 21번(SDA)·22번(SCL) 핀에 연결해요.');
    expect(html).toContain(`<span class="book-circuit__note">${NOTE}</span>`);
    expect(html).toContain('<a class="figure-zoom" href="/images/circuits/third-party/kit-vendor/2-1-2-1.webp" data-pagefind-ignore>그림 크게 보기<span class="visually-hidden">: ESP32 실드 V3 보드 아래에 LCD가 있어요.');
    expect(html.match(/<figure/gu)).toHaveLength(1);
    expect(html.match(/figure-zoom/gu)).toHaveLength(1);
  });

  it('src를 받아 base를 붙인 주소로 그릴 수 있고, 글자는 HTML 글자 참조로 안전하게 넣는다', () => {
    const html = circuitFigureHtml({ ...figure, alt: 'A & "B" <c>', caption: '1 < 2 & 3' }, '고정', '/ai-physical-computing/x.webp');
    expect(html).toContain('src="/ai-physical-computing/x.webp"');
    expect(html).toContain('alt="A &amp; &quot;B&quot; &lt;c&gt;"');
    expect(html).toContain('1 &lt; 2 &amp; 3');
    expect(html).not.toContain('<c>');
  });

  it('그리지 못한 연결이 있는 그림은 안내 문장이 한 줄 더 붙는다', () => {
    const last = findCircuit(list, '4-2-2-2')!;
    const html = circuitFigureHtml(last, list.captionNote);
    expect(html.match(/book-circuit__note/gu)).toHaveLength(2);
    expect(html).toContain('이 그림에 없는 연결: 버저(2번 핀)');
  });
});

describe('::회로[번호] 지시자(remark → 자리 표시 → 그림)', () => {
  it('::회로[2-1-2-1]은 검색 색인에서 빠지는 자리 표시 div가 된다(영어 이름 circuit도 같다)', async () => {
    const out = (await render('::회로[2-1-2-1]\n\n::circuit[4-2-2-2]')).replace(/\n/gu, '');
    expect(out).toBe(
      '<div class="book-circuit-slot" data-book-circuit="2-1-2-1" data-pagefind-ignore=""></div><div class="book-circuit-slot" data-book-circuit="4-2-2-2" data-pagefind-ignore=""></div>',
    );
  });

  it('번호 모양이 틀린 ::회로는 글자 그대로 두고 경고한다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const out = await render('::회로[abc]\n\n::회로[2-1-2]\n\n::회로');
    expect(out).toContain('<p>::회로[abc]</p>');
    expect(out).toContain('<p>::회로[2-1-2]</p>');
    expect(out).not.toContain('book-circuit-slot');
    expect(warn).toHaveBeenCalledTimes(3);
    expect(String(warn.mock.calls[0]?.[0])).toContain('회로 그림 번호');
    warn.mockRestore();
  });

  it('planBookBody가 자리를 그림으로 바꾸고, base를 붙이며, [그림 크게 보기]를 두 번 붙이지 않는다', async () => {
    const slots = await render('## 3 회로 구성하기\n\n:::연결레시피[센서 연결 레시피]\n- GND\n:::\n\n::회로[2-1-2-1]\n\n본문이다.');
    const { plan } = planBookBody(slots, { circuits: { captionNote: list.captionNote, find: (id) => findCircuit(list, id) } });
    const html = plan.sections[0]!.parts.map((part) => (part.type === 'html' ? part.html : '')).join('');
    expect(html).not.toContain('book-circuit-slot');
    expect(html).toContain('<figure class="book-circuit" data-circuit="2-1-2-1"');
    expect(html).toContain('src="/ai-physical-computing/images/circuits/third-party/kit-vendor/2-1-2-1.webp"');
    expect(html).toContain('href="/ai-physical-computing/images/circuits/third-party/kit-vendor/2-1-2-1.webp"');
    expect(html.match(/figure-zoom/gu)).toHaveLength(1);
    expect(html.match(/loading="lazy"/gu)).toHaveLength(1);
    expect(plan.warnings).toEqual([]);
    // 상자 안에 적어도 그대로 바뀐다
    const inBox = placeCircuitSlots('<div class="box"><div class="book-circuit-slot" data-book-circuit="2-1-2-2"></div></div>', { captionNote: NOTE, find: (id) => findCircuit(list, id) }, []);
    expect(inBox).toContain('data-circuit="2-1-2-2"');
  });

  it('모르는 번호나 목록이 없는 경우는 자리를 지우고 경고한다', () => {
    const warnings: string[] = [];
    const slot = '<div class="book-circuit-slot" data-book-circuit="9-9-9-9"></div>';
    expect(placeCircuitSlots(`<p>앞</p>${slot}<p>뒤</p>`, { captionNote: NOTE, find: () => undefined }, warnings)).toBe('<p>앞</p><p>뒤</p>');
    expect(warnings[0]).toContain('::회로[9-9-9-9]는 회로 그림 목록');
    expect(placeCircuitSlots(slot, undefined, warnings)).toBe('');
    expect(warnings[1]).toContain('목록을 받지 못해');
  });
});

describe('규칙: book-circuit·book-only', () => {
  const data = bookSchema.parse({ id: '2-1-2', title: 'LCD 제어하기', unit: 2, part: '01 디스플레이 장치 제어', order: 2, pages: '124~125' });
  const body = (extra: string) => ['::쪽[124]', '', '## 학습 목표', '', '- 목표를 이해할 수 있다.', '', extra, '', '::쪽[125]'].join('\n');

  it('번호 모양이 맞고 한 번씩만 쓴 ::회로는 문제가 없다', async () => {
    const issues = checkBookRules({ id: '2-1-2', data, html: await render(body('::회로[2-1-2-1]\n\n::회로[2-1-2-2]')) });
    expect(issues.filter((issue) => issue.code === 'book-circuit')).toEqual([]);
  });

  it('같은 그림을 한 쪽에 두 번 넣으면 참고로 알린다', async () => {
    const issues = checkBookRules({ id: '2-1-2', data, html: await render(body('::회로[2-1-2-1]\n\n::회로[2-1-2-1]')) });
    expect(issues.filter((issue) => issue.code === 'book-circuit')).toEqual([expect.objectContaining({ level: 'warning' })]);
  });

  it('웹 차시에서 ::회로를 쓰면 오류(교과서 쪽 전용)', async () => {
    const issues = bookOnlyIssues(await render('## 학습 목표\n\n본문\n\n::회로[2-1-2-1]'));
    expect(issues).toHaveLength(1);
    expect(issues[0]?.level).toBe('error');
    expect(issues[0]?.code).toBe('book-only');
    expect(issues[0]?.message).toContain('::회로[번호]');
  });
});

describe('check:book — 목록에 없는 번호는 오류', () => {
  let root = '';

  function write(relative: string, content: string): void {
    const target = path.join(root, ...relative.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }

  const FRONT = '---\nid: 2-1-2\ntitle: LCD 제어하기\nunit: 2\npart: "01 디스플레이 장치 제어"\norder: 2\npages: "124~125"\nlesson: 2-1-2\nmedia: [board]\n---\n';
  const bodyWith = (circuit: string) => ['::쪽[124]', '', '## 학습 목표', '', '- 이해할 수 있다.', '', circuit, '', '::쪽[125]', '', '본문이다.', ''].join('\n');

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'apc-circuit-book-'));
    write('content/lessons/u2/2-1-2.md', '---\ntitle: LCD 제어하기\nunit: 2\norder: 2\nlabel: 2-1-2\n---\n\n본문\n');
    write(CIRCUITS_FILE, yamlWith(GOOD_FIGURE));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  async function run() {
    const report = await runBookCheck({ rootDir: root });
    return { report, text: formatBookCheck(report), failed: reportFailed(report) };
  }

  it('목록에 있는 번호는 통과한다', async () => {
    write('content/book/2-1-2.md', `${FRONT}\n${bodyWith('::회로[2-1-2-1]')}`);
    const { failed, report } = await run();
    expect(report.books[0]?.issues).toEqual([]);
    expect(failed).toBe(false);
  });

  it('목록에 없는 번호는 오류로 실패하고 있는 번호를 알려 준다', async () => {
    write('content/book/2-1-2.md', `${FRONT}\n${bodyWith('::회로[2-1-2-9]')}`);
    const { failed, text } = await run();
    expect(failed).toBe(true);
    expect(text).toContain('[book-circuit-id]');
    expect(text).toContain('::회로[2-1-2-9]는 회로 그림 목록');
    expect(text).toContain('있는 번호: 2-1-2-1');
  });

  it('그림의 출판본 쪽이 이 파일의 쪽 범위 밖이면 오류, 짝 차시가 다르면 참고', async () => {
    write(CIRCUITS_FILE, yamlWith(GOOD_FIGURE.replace('textbook_page: 125', 'textbook_page: 200')));
    write('content/book/2-1-2.md', `${FRONT}\n${bodyWith('::회로[2-1-2-1]')}`);
    const range = await run();
    expect(range.failed).toBe(true);
    expect(range.text).toContain('출판본 200쪽 배선인데 이 파일의 쪽 범위(124~125) 밖');

    write(CIRCUITS_FILE, yamlWith(GOOD_FIGURE.replace(/2-1-2/gu, '2-1-3')));
    write('content/book/2-1-2.md', `${FRONT}\n${bodyWith('::회로[2-1-3-1]')}`);
    const lesson = await run();
    expect(lesson.failed).toBe(false);
    expect(lesson.text).toContain('2-1-3 차시의 그림인데 2-1-2 쪽에 넣었어요');
  });

  it('::회로를 썼는데 목록 파일이 없거나 틀리면 오류로 알린다(안 쓴 쪽은 영향 없음)', async () => {
    fs.rmSync(path.join(root, CIRCUITS_FILE));
    write('content/book/2-1-2.md', `${FRONT}\n${bodyWith('::회로[2-1-2-1]')}`);
    const missing = await run();
    expect(missing.failed).toBe(true);
    expect(missing.text).toContain('그림 목록을 읽지 못했어요');
    write('content/book/2-1-2.md', `${FRONT}\n${bodyWith('본문이다.')}`);
    expect((await run()).failed).toBe(false);
  });
});

describe('저장소의 교과서 쪽이 넣은 회로 그림', () => {
  const bookDir = path.join(rootDir, 'content', 'book');
  const placed = new Map<string, string[]>();
  for (const name of fs.readdirSync(bookDir).filter((file) => file.endsWith('.md'))) {
    const text = fs.readFileSync(path.join(bookDir, name), 'utf8');
    for (const match of text.matchAll(/^::(?:회로|circuit)\[([^\]]*)\]\s*$/gmu)) {
      const owners = placed.get(match[1] ?? '') ?? [];
      owners.push(name.replace(/\.md$/u, ''));
      placed.set(match[1] ?? '', owners);
    }
  }

  it('넣은 번호는 모두 목록에 있고, 한 그림은 한 쪽에 한 번만 들어간다', () => {
    for (const [id, owners] of placed) {
      expect(findCircuit(list, id), `::회로[${id}]`).toBeTruthy();
      expect(owners, `::회로[${id}]를 넣은 쪽`).toHaveLength(1);
    }
  });

  it('2단원·4단원의 그림은 빠짐없이, 그 차시 쪽에 들어가 있다(3단원 그림은 3단원 쪽을 쓰는 구역이 넣는다)', () => {
    for (const figure of list.figures) {
      if (figure.lesson.startsWith('3-')) {
        continue;
      }
      expect(placed.get(figure.id), `${figure.id}를 어느 쪽에도 넣지 않았어요`).toEqual([figure.lesson]);
    }
  });
});
