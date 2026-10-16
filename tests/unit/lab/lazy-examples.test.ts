// 판 1.5.0 구역 K3a — 고를 때 받는 예제(키트 장치 도감)의 순수 함수: 목록 자리·받을 JSON 나누기, 받은 JSON 합치기, 받기 실패 까닭,
// ESP32 실습실 목록 나누기(splitLazyEsp32Examples)와 저장소 실제 예제로 잰 HTML 크기 한도(DECISIONS C15·C151 — 실습실 첫 받기를 키우지 않는다).
// 화면 흐름(고르기 → 받기 → [실행], ?example= 직접 열기, 404 안내)은 tests/e2e/lab-esp32-kit.spec.ts.
import zlib from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { readExampleSidecars } from '../../../src/lab/controls/example-sidecar.ts';
import { validateExamples, type LabExample } from '../../../src/lab/controls/examples.ts';
import {
  LazyExampleError,
  embeddedExampleJson,
  fetchLazyExample,
  fillLazyTitles,
  isLazyExample,
  lazyFailureMessage,
  lazyPayloadOf,
  mergeLazyExample,
  toLazyEntry,
} from '../../../src/lab/controls/lazy-examples.ts';
import { esp32ExamplesFromFiles, isLazyEsp32File, kitCodeParam, kitCodePath, splitLazyEsp32Examples } from '../../../src/lab/esp32/examples.ts';
import { readExampleGlob } from '../gallery/helpers/repo-gallery.ts';

const FULL: LabExample = {
  id: 'kit-ch4-4-01-potentiometer-1',
  title: '4.01 가변저항 — 1단계: 가변저항 값 읽기',
  code: "from machine import ADC, Pin\nprint('안녕')\n",
  file: 'esp32/kit/ch4/4-01-potentiometer-1.py',
  description: '손잡이를 돌리면 값이 0에서 4095까지 변해요.',
  packages: [],
  group: '키트 도감 4장 아날로그 센서',
  lesson: { href: '/ai-physical-computing/learn/u2/2-1-1/', label: '2-1-1 차시' },
  parts: [{ part: 'sensor-analog', pin: 32, label: '가변저항' }],
  practice: ['[실행]을 눌러요.', '다 봤으면 [정지]를 눌러요.'],
};
const URL = '/ai-physical-computing/labs/esp32/kit-code/ch4/4-01-potentiometer-1.json?v=1.5.0';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('고를 때 받는 예제 — 목록 자리와 받을 JSON(lazy-examples.ts)', () => {
  it('목록 자리에는 id·제목·파일·묶음·받을 주소만 남고 코드는 빈 글자다(설명·배선·실습 방법·차시·패키지는 JSON 쪽)', () => {
    const entry = toLazyEntry(FULL, URL);
    expect(entry).toEqual({ id: FULL.id, title: FULL.title, code: '', file: FULL.file, group: FULL.group, codeUrl: URL });
    expect(isLazyExample(entry)).toBe(true);
    expect(isLazyExample(FULL)).toBe(false);
    expect(isLazyExample(null)).toBe(false);
    expect(validateExamples([entry])).toEqual([]);
    const payload = lazyPayloadOf(FULL);
    expect(payload).toEqual({
      id: FULL.id,
      title: FULL.title,
      code: FULL.code,
      description: FULL.description,
      packages: [],
      lesson: FULL.lesson,
      parts: FULL.parts,
      practice: FULL.practice,
    });
    // 받은 JSON(문자열로 오간 뒤)과 합치면 원래 예제와 같다 — 받을 주소는 없어진다
    const merged = mergeLazyExample(entry, JSON.parse(JSON.stringify(payload)));
    expect(merged).toEqual(FULL);
    expect(isLazyExample(merged)).toBe(false);
  });

  it('HTML에 심는 모양은 제목·묶음도 뺀 id·파일·받을 주소이고, 화면이 선택 상자 글자로 제목을 채운다(받은 뒤에는 JSON의 제목)', () => {
    const entry = toLazyEntry(FULL, URL);
    expect(embeddedExampleJson(entry)).toEqual({ id: FULL.id, code: '', file: FULL.file, codeUrl: URL });
    expect(embeddedExampleJson(FULL)).toBe(FULL);
    const read = fillLazyTitles(JSON.parse(JSON.stringify([embeddedExampleJson(entry), FULL, { id: 'kit-x', code: '', codeUrl: URL }])), (id) =>
      id === FULL.id ? ' 4.01 가변저항 — 1단계 ' : null,
    );
    expect(read.map((example) => example.title)).toEqual(['4.01 가변저항 — 1단계', FULL.title, 'kit-x']);
    expect(isLazyExample(read[0])).toBe(true);
    // 받은 JSON의 제목이 이긴다(선택 상자 글자는 학생 말로 다듬은 이름일 수 있다)
    expect(mergeLazyExample(read[0] as Parameters<typeof mergeLazyExample>[0], lazyPayloadOf(FULL)).title).toBe(FULL.title);
  });

  it('합치기: 다른 예제의 파일·코드 없는 파일·모양이 틀린 파일은 받지 않고, 틀린 선택 칸은 버린다', () => {
    const entry = toLazyEntry(FULL, URL);
    expect(() => mergeLazyExample(entry, { ...lazyPayloadOf(FULL), id: 'kit-other' })).toThrow(LazyExampleError);
    expect(() => mergeLazyExample(entry, { id: FULL.id })).toThrow('예제 코드가 없어요');
    expect(() => mergeLazyExample(entry, [1, 2])).toThrow('모양이 예제가 아니에요');
    const merged = mergeLazyExample(entry, { id: FULL.id, code: 'x = 1\n', parts: [{ pin: 3 }], practice: [1], lesson: { href: 1 }, packages: 'numpy' });
    expect(merged).toEqual({ id: FULL.id, title: FULL.title, file: FULL.file, group: FULL.group, code: 'x = 1\n' });
  });

  it('목록 검사: codeUrl은 /로 시작하는 사이트 안 주소이고, codeUrl이 있으면 code는 비운다', () => {
    const errors = validateExamples([
      { ...toLazyEntry(FULL, URL), id: 'a', code: 'print(1)\n' },
      { ...toLazyEntry(FULL, 'https://example.com/a.json'), id: 'b' },
      { ...toLazyEntry(FULL, '//example.com/a.json'), id: 'c' },
    ]);
    expect(errors).toHaveLength(3);
    expect(errors[0]).toContain('code를 빈 글자로');
    expect(errors[1]).toContain('사이트 안 주소');
    expect(errors[2]).toContain('사이트 안 주소');
  });

  it('받기: 200이면 합친 예제, 404·다른 상태·망 끊김·읽을 수 없는 JSON·제한 시간은 한국어 까닭', async () => {
    const entry = toLazyEntry(FULL, URL);
    const seen: string[] = [];
    const ok = await fetchLazyExample(entry, {
      fetch: (async (input: RequestInfo | URL) => {
        seen.push(String(input));
        return jsonResponse(lazyPayloadOf(FULL));
      }) as typeof fetch,
    });
    expect(ok).toEqual(FULL);
    expect(seen).toEqual([URL]);

    const reasonOf = async (fetchImpl: typeof fetch, timeoutMs?: number) => {
      try {
        await fetchLazyExample(entry, { fetch: fetchImpl, ...(timeoutMs !== undefined ? { timeoutMs } : {}) });
        return 'ok';
      } catch (error) {
        expect(error).toBeInstanceOf(LazyExampleError);
        return (error as Error).message;
      }
    };
    expect(await reasonOf((async () => new Response('없음', { status: 404 })) as typeof fetch)).toBe('사이트에서 예제 파일을 찾지 못했어요(404)');
    expect(await reasonOf((async () => new Response('', { status: 503 })) as typeof fetch)).toBe('사이트가 예제 파일을 주지 않았어요(503)');
    expect(await reasonOf((async () => Promise.reject(new TypeError('Failed to fetch'))) as typeof fetch)).toBe('인터넷 연결이 끊겼거나 사이트에 닿지 못했어요');
    expect(await reasonOf((async () => new Response('<html>', { status: 200 })) as typeof fetch)).toBe('받은 파일을 읽지 못했어요');
    // 끝내 대답이 없는 망: 제한 시간에 받기를 그만둔다(AbortController)
    const hanging = ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      })) as typeof fetch;
    expect(await reasonOf(hanging, 30)).toBe('0초 안에 받지 못했어요');
  });

  it('실패 안내 한 줄에는 예제 이름·까닭·[다시 받기]가 있다', () => {
    const text = lazyFailureMessage('4.01 가변저항', new LazyExampleError('사이트에서 예제 파일을 찾지 못했어요(404)'));
    expect(text).toBe('"4.01 가변저항" 예제 코드를 받지 못했어요(사이트에서 예제 파일을 찾지 못했어요(404)). 인터넷 연결을 확인하고 [다시 받기]를 눌러 주세요.');
    expect(lazyFailureMessage('a', new Error('x'))).toContain('알 수 없는 문제');
  });
});

describe('ESP32 실습실 — 키트 예제만 고를 때 받는다(src/lab/esp32/examples.ts)', () => {
  it('키트 폴더(esp32/kit/)만 고를 때 받는 예제이고, JSON 경로는 장 폴더째', () => {
    expect(isLazyEsp32File('esp32/kit/ch3/3-11-ultrasonic-1.py')).toBe(true);
    expect(isLazyEsp32File('esp32/u2/2-1-1-led.py')).toBe(false);
    expect(isLazyEsp32File('esp32/kit/ch3/readme.md')).toBe(false);
    expect(isLazyEsp32File(undefined)).toBe(false);
    expect(kitCodeParam('esp32/kit/ch3/3-11-ultrasonic-1.py')).toBe('ch3/3-11-ultrasonic-1');
    expect(kitCodePath('esp32/kit/ch1/1-7-3-pwm.py')).toBe('labs/esp32/kit-code/ch1/1-7-3-pwm.json');
    expect(() => kitCodeParam('esp32/u2/2-1-1-led.py')).toThrow();
  });

  it('저장소 예제: 키트 212개는 목록 자리 + JSON, 나머지는 지금처럼 코드째 — HTML에 더해지는 목록 자리는 gzip 15KB 안', () => {
    const files = readExampleGlob('.py', ['esp32']);
    const sidecars = readExampleSidecars(readExampleGlob('.meta.yaml', ['esp32']));
    const all = esp32ExamplesFromFiles(files, sidecars);
    const urlOf = (file: string) => `/ai-physical-computing/${kitCodePath(file)}?v=1.5.0`;
    const { examples, payloads } = splitLazyEsp32Examples(all, urlOf);

    expect(examples).toHaveLength(all.length);
    expect(examples.map((example) => example.id)).toEqual(all.map((example) => example.id)); // 목록 차례·id는 그대로
    const lazy = examples.filter((example) => isLazyExample(example));
    expect(lazy).toHaveLength(212);
    expect(payloads).toHaveLength(212);
    expect(validateExamples(examples)).toEqual([]);
    for (const example of examples) {
      if (isLazyExample(example)) {
        expect(example.code).toBe('');
        expect(Object.keys(example).sort()).toEqual(['code', 'codeUrl', 'file', 'group', 'id', 'title']);
      } else {
        expect(example.code.length, example.id).toBeGreaterThan(0);
        expect(isLazyEsp32File(example.file)).toBe(false);
      }
    }
    // JSON 경로는 겹치지 않고, 받은 JSON을 합치면 원래 예제와 같다(코드 글자 그대로)
    expect(new Set(payloads.map((item) => item.param)).size).toBe(payloads.length);
    const byId = new Map(all.map((example) => [example.id, example]));
    for (const item of payloads) {
      const entry = lazy.find((example) => example.id === item.payload.id);
      expect(entry, item.file).toBeDefined();
      if (entry && isLazyExample(entry)) {
        expect(mergeLazyExample(entry, JSON.parse(JSON.stringify(item.payload)))).toEqual(byId.get(item.payload.id));
        expect(item.payload.code).toBe(files[`/examples/${item.file}`]);
      }
    }
    // 크기 한도: 실습실 HTML에 더해지는 것 = 목록 JSON의 키트 자리(embeddedExampleJson) + 선택 상자의 <option>(LabShell이 그리는 모양 흉내).
    // 코드째 심을 때(판 1.5.0 처음 약 +80KB gzip)의 몇 분의 일이고 gzip 15KB 안(빌드 결과 실측은 .cache/v150/notes/k3a-report.md)
    const lazyJson = JSON.stringify(lazy.map(embeddedExampleJson));
    const options = lazy.map((example) => `<option value="${example.id}" data-astro-cid-x>${example.title}</option>`).join('');
    const fullJson = JSON.stringify(all.filter((example) => isLazyEsp32File(example.file)));
    const gzip = (text: string) => zlib.gzipSync(Buffer.from(text, 'utf8')).length;
    expect(gzip(lazyJson) + gzip(options)).toBeLessThan(15 * 1024);
    expect(gzip(lazyJson) * 10).toBeLessThan(gzip(fullJson));
  });
});
