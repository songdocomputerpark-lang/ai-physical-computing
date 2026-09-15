import { describe, expect, it, vi } from 'vitest';
import {
  applyGlossary,
  claimScopeKey,
  collectLessonsByEntry,
  createGlossaryRegistry,
  findGlossaryMarkers,
  findRelatedProblems,
  formatGlossaryProblem,
  glossaryEntryHref,
  glossaryGroupOf,
  groupGlossaryEntries,
  hasDistinctEnglish,
  lessonHref,
  normalizeGlossaryName,
  reportGlossaryProblems,
  scopeKeyFromContent,
  toScopeKey,
  type ApplyGlossaryOptions,
  type GlossaryEntryInput,
} from '../../../src/components/glossary/glossary.ts';
import { renderMarkdown } from './helpers.ts';

const ENTRIES: GlossaryEntryInput[] = [
  {
    id: 'pixel',
    data: { title: '픽셀', english: 'Pixel', aliases: ['화소'], summary: '사진을 이루는 가장 작은 칸이에요.', related: ['frame'] },
  },
  { id: 'frame', data: { title: '프레임', english: 'Frame', summary: '영상을 이루는 사진 한 장이에요.' } },
  { id: 'normalized-coordinates', data: { title: '정규화 좌표', summary: '0과 1 사이 수로 나타낸 좌표예요.' } },
  { id: 'esp32', data: { title: 'ESP32', english: 'esp32', summary: '작은 칩 <b>&</b> "보드"예요.' } },
  { id: 'secret', data: { title: '비밀 낱말', summary: '아직 쓰는 중이에요.', draft: true } },
];

const registry = createGlossaryRegistry(ENTRIES);

async function apply(markdown: string, options: ApplyGlossaryOptions = { scope: 'test' }) {
  return applyGlossary(await renderMarkdown(markdown), registry, options);
}

function entry(id: string, title: string): GlossaryEntryInput {
  return { id, data: { title, summary: `${title} 풀이예요.` } };
}

describe('이름 맞추기와 찾아보기 표(createGlossaryRegistry)', () => {
  it('띄어쓰기·영문 대소문자·호환 글자(I²C, 전각)를 가리지 않는다', () => {
    expect(normalizeGlossaryName(' 정규화  좌표 ')).toBe('정규화좌표');
    expect(normalizeGlossaryName('I²C')).toBe('i2c');
    expect(normalizeGlossaryName('ＧＰＩＯ')).toBe('gpio');
  });

  it('표제어·다른 이름·영어 이름과 id로 찾고, 초안은 표에 넣지 않는다', () => {
    expect(registry.entries.map((item) => item.id)).toEqual(['pixel', 'frame', 'normalized-coordinates', 'esp32']);
    expect(registry.byName('화소')?.id).toBe('pixel');
    expect(registry.byName('PIXEL')?.id).toBe('pixel');
    expect(registry.byName('정규화좌표')?.id).toBe('normalized-coordinates');
    expect(registry.byId(' PIXEL ')?.id).toBe('pixel');
    expect(registry.byName('비밀 낱말')).toBeUndefined();
    expect(registry.draftIdOf({ name: '비밀낱말' })).toBe('secret');
    expect(registry.draftIdOf({ id: 'secret' })).toBe('secret');
  });

  it('서로 다른 두 항목이 같은 이름으로 읽히면 두 파일을 모두 알려 주며 멈춘다', () => {
    const duplicate = [...ENTRIES, { id: 'pixel-2', data: { title: '화 소', summary: '겹치는 이름이에요.' } }];
    expect(() => createGlossaryRegistry(duplicate)).toThrow(/pixel\.md의 "화소", pixel-2\.md의 "화 소"/u);
  });

  it('파일 이름 규칙(영문 소문자·숫자·하이픈)과 페이지가 이미 쓰는 id를 검사한다', () => {
    expect(() => createGlossaryRegistry([entry('Pixel', '픽셀')])).toThrow('영문 소문자·숫자·하이픈');
    expect(() => createGlossaryRegistry([entry('index-a', '에이')])).toThrow('이미 쓰는 이름');
    expect(() => createGlossaryRegistry([entry('main-content', '본문')])).toThrow('이미 쓰는 이름');
  });

  it('영어 이름은 표제어와 글자가 다를 때만 따로 보인다', () => {
    expect(hasDistinctEnglish({ title: '픽셀', english: 'Pixel' })).toBe(true);
    expect(hasDistinctEnglish({ title: 'ESP32', english: 'esp32' })).toBe(false);
    expect(hasDistinctEnglish({ title: '패턴' })).toBe(false);
  });
});

describe('표시 자리 → 링크 + 툴팁(applyGlossary)', () => {
  it('같은 항목은 처음 나온 곳만 굵은 링크 + 툴팁이 되고, 표시 자리 태그는 남지 않는다', async () => {
    const { html, used, problems } = await apply(
      ':용어[픽셀]은 :용어[화소]{항목=pixel}와 같고, :용어[프레임]이 모여요. 다시 :용어[픽셀]',
    );
    expect(used).toEqual(['pixel', 'frame']);
    expect(problems).toEqual([]);
    expect(html.match(/class="glossary-term__link"/gu)).toHaveLength(2);
    expect(html).not.toContain('<glossary-term');
    expect(html).toContain('다시 픽셀</p>');
    expect(glossaryEntryHref('pixel')).toBe('/ai-physical-computing/glossary/#pixel');
    expect(html).toContain(
      '<span class="glossary-term">' +
        `<a class="glossary-term__link" href="${glossaryEntryHref('pixel')}" aria-describedby="glossary-tip-test-pixel" data-glossary-entry="pixel"><b>픽셀</b></a>` +
        '<span class="glossary-term__tip" id="glossary-tip-test-pixel" role="tooltip" hidden data-pagefind-ignore>' +
        '<span class="glossary-term__tip-title">픽셀<span class="glossary-term__tip-english" lang="en"> (Pixel)</span></span> ' +
        '<span class="glossary-term__tip-text">사진을 이루는 가장 작은 칸이에요.</span></span></span>은',
    );
  });

  it('없는 말·없는 항목 id·초안 항목은 보통 글자로 두고 문제로 알려 준다', async () => {
    const { html, problems, used } = await apply(':용어[픽셀스]와 :용어[화소]{항목=pixels}, :용어[비밀 낱말]');
    expect(used).toEqual([]);
    expect(html).toContain('<p>픽셀스와 화소, 비밀 낱말</p>');
    expect(problems).toEqual([
      { kind: 'unknown-name', text: '픽셀스', source: undefined },
      { kind: 'unknown-entry', text: '화소', entry: 'pixels', source: undefined },
      { kind: 'draft', text: '비밀 낱말', entry: 'secret', source: undefined },
    ]);
  });

  it('self로 준 항목(용어사전의 그 항목 본문)은 링크하지 않는다', async () => {
    const { html, used } = await apply(':용어[픽셀]과 :용어[프레임]', { scope: 'entry-pixel', self: 'pixel' });
    expect(used).toEqual(['frame']);
    expect(html).toContain('<p>픽셀과 <span class="glossary-term">');
    expect(html).toContain('id="glossary-tip-entry-pixel-frame"');
  });

  it('풀이 글의 HTML 특수 문자를 이스케이프하고, 표제어와 같은 영어 이름은 되풀이하지 않는다', async () => {
    const { html } = await apply(':용어[ESP32]');
    expect(html).toContain('작은 칩 &lt;b&gt;&amp;&lt;/b&gt; &quot;보드&quot;예요.');
    expect(html).not.toContain('glossary-term__tip-english');
  });

  it('인라인 코드로 적은 용어도 찾고, 코드 모양을 굵은 링크 안에 남긴다', async () => {
    const { html, used } = await apply(':용어[`픽셀`]');
    expect(used).toEqual(['pixel']);
    expect(html).toContain('<b><code>픽셀</code></b></a>');
  });
});

describe('빌드 로그 경고', () => {
  it('문제마다 파일 위치와 고치는 방법을 한국어로 알려 준다', () => {
    const source = 'content/lessons/u1/1-2-1.md:12';
    expect(formatGlossaryProblem({ kind: 'unknown-name', text: '픽셀스', source })).toContain(
      `용어사전에 없는 말 ":용어[픽셀스]" (${source}) — 굵게·풀이 없이 글자만 보여 줘요.`,
    );
    expect(formatGlossaryProblem({ kind: 'unknown-entry', text: '화소', entry: 'pixels', source })).toContain(
      'content/glossary/pixels.md를 찾지 못했어요',
    );
    expect(formatGlossaryProblem({ kind: 'draft', text: '비밀', entry: 'secret' })).toContain('초안(draft: true)');
    expect(formatGlossaryProblem({ kind: 'missing-related', entry: 'pixel', related: 'nothing' })).toContain(
      'pixel.md의 related에 적은 "nothing" 항목이 없어요',
    );
  });

  it('같은 문장은 한 번만 남긴다', () => {
    const warn = vi.fn();
    const seen = new Set<string>();
    const problem = { kind: 'unknown-name', text: '없는말' } as const;
    reportGlossaryProblems([problem, problem], warn, seen);
    reportGlossaryProblems([problem], warn, seen);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('related에 자기 자신이나 없는 항목을 적으면 알려 준다', () => {
    const withBadRelated = createGlossaryRegistry([
      { id: 'pixel', data: { title: '픽셀', summary: '칸이에요.', related: ['pixel', 'frame', 'nothing'] } },
      { id: 'frame', data: { title: '프레임', summary: '한 장이에요.' } },
    ]);
    expect(findRelatedProblems(withBadRelated)).toEqual([
      { kind: 'self-related', entry: 'pixel' },
      { kind: 'missing-related', entry: 'pixel', related: 'nothing' },
    ]);
  });
});

describe('툴팁 id의 범위 이름', () => {
  it('영문 소문자·숫자·하이픈으로 맞추고, 한 페이지 안에서 겹치면 번호를 붙인다', () => {
    expect(toScopeKey('Entry Pixel!')).toBe('entry-pixel');
    expect(toScopeKey('***')).toBe('scope');
    const page = {};
    expect(claimScopeKey(page, 'example')).toBe('example');
    expect(claimScopeKey(page, 'example')).toBe('example-2');
    expect(claimScopeKey({}, 'example')).toBe('example');
  });

  it('본문 내용으로 만든 이름은 같은 내용이면 같고 다르면 다르다', () => {
    expect(scopeKeyFromContent('<p>가</p>')).toBe(scopeKeyFromContent('<p>가</p>'));
    expect(scopeKeyFromContent('<p>가</p>')).not.toBe(scopeKeyFromContent('<p>나</p>'));
    expect(scopeKeyFromContent('<p>가</p>')).toMatch(/^s[\da-z]+$/u);
  });
});

describe('가나다·ABC 색인(groupGlossaryEntries)', () => {
  it('첫 글자의 첫소리로 묶고, 된소리는 예사소리 묶음에 넣는다', () => {
    expect(glossaryGroupOf('픽셀')).toEqual({ order: 12, label: 'ㅍ', anchor: 'index-pieup' });
    expect(glossaryGroupOf('까치')).toMatchObject({ label: 'ㄱ', anchor: 'index-giyeok' });
    expect(glossaryGroupOf('ㄸ자 모양')).toMatchObject({ label: 'ㄷ' });
    expect(glossaryGroupOf('MicroPython')).toMatchObject({ label: 'M', anchor: 'index-m' });
    expect(glossaryGroupOf('Édge')).toMatchObject({ label: 'E' });
    expect(glossaryGroupOf('3D 이미지')).toMatchObject({ label: '숫자·기호', anchor: 'index-etc' });
  });

  it('한글 묶음 → 영문 묶음 → 숫자·기호 순서이고, 묶음 안은 가나다순이다', () => {
    const groups = groupGlossaryEntries(
      createGlossaryRegistry([
        entry('esp32', 'ESP32'),
        entry('pwm', 'PWM'),
        entry('pixel', '픽셀'),
        entry('frame', '프레임'),
        entry('driver', '드라이버'),
        entry('three-d', '3D 이미지'),
        entry('ble', 'BLE'),
        entry('bgr-rgb', 'BGR·RGB'),
      ]).entries,
    );
    expect(groups.map((group) => group.label)).toEqual(['ㄷ', 'ㅍ', 'B', 'E', 'P', '숫자·기호']);
    expect(groups[1]?.entries.map((item) => item.title)).toEqual(['프레임', '픽셀']);
    expect(groups[2]?.entries.map((item) => item.title)).toEqual(['BGR·RGB', 'BLE']);
  });
});

describe('나오는 차시(collectLessonsByEntry)', () => {
  it('차시 본문의 용어를 모아 단원·순서대로 차시 링크를 만들고, 없는 말은 문제로 알린다', async () => {
    const result = collectLessonsByEntry(
      [
        { id: 'u2/2-1-1', title: '피지컬 컴퓨팅', unit: 2, order: 1, html: await renderMarkdown(':용어[프레임]과 :용어[픽셀]') },
        {
          id: 'u1/1-2-1',
          title: '컴퓨터의 눈',
          label: '1-2-1',
          unit: 1,
          order: 5,
          html: await renderMarkdown(':용어[픽셀]과 :용어[화소]{항목=pixel}, :용어[없는말]'),
        },
      ],
      registry,
    );
    expect(result.byEntry.get('pixel')).toEqual([
      { id: 'u1/1-2-1', href: '/ai-physical-computing/learn/u1/1-2-1/', label: '1-2-1 컴퓨터의 눈' },
      { id: 'u2/2-1-1', href: lessonHref('u2/2-1-1'), label: '피지컬 컴퓨팅' },
    ]);
    expect(result.byEntry.get('frame')?.map((link) => link.id)).toEqual(['u2/2-1-1']);
    expect(result.problems).toEqual([{ kind: 'unknown-name', text: '없는말', source: undefined }]);
  });

  it('표시 자리의 속성 따옴표 모양이 달라도 읽는다', () => {
    expect(
      findGlossaryMarkers(
        "<glossary-term data-glossary-text='%ED%94%BD%EC%85%80' data-glossary-entry=pixel>x</glossary-term>" +
          '<glossary-term>A &amp; B</glossary-term>',
      ),
    ).toEqual([
      { text: '픽셀', entry: 'pixel', source: undefined },
      { text: 'A & B', entry: undefined, source: undefined },
    ]);
  });
});
