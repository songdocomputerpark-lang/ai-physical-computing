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
        // virtual(판 1.6.0 C176)은 실제 보드 전용·일부만 되는 예제에만 있다(그 밖에는 칸이 없다)
        expect(Object.keys(example).sort()).toEqual(example.virtual === undefined ? ['code', 'codeUrl', 'file', 'group', 'id', 'title'] : ['code', 'codeUrl', 'file', 'group', 'id', 'title', 'virtual']);
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

describe('가상 보드에서 되는 정도(virtual) — 실제 보드 전용 예제는 [실행]이 회색(판 1.6.0 C176)', () => {
  const REAL_ONLY: LabExample = { ...FULL, id: 'kit-ch3-3-11-ultrasonic-1', file: 'esp32/kit/ch3/3-11-ultrasonic-1.py', virtual: 'real-only' };
  const urlOf = (file: string) => `/ai-physical-computing/${kitCodePath(file)}?v=1.6.0`;

  it('목록 자리와 HTML에 심는 모양에 virtual이 남고(받기 전에도 [실행]이 알맞게 보이게), JSON과 합친 예제에도 있다', () => {
    const entry = toLazyEntry(REAL_ONLY, URL);
    expect(entry.virtual).toBe('real-only');
    expect(embeddedExampleJson(entry)).toEqual({ id: REAL_ONLY.id, code: '', file: REAL_ONLY.file, codeUrl: URL, virtual: 'real-only' });
    expect(lazyPayloadOf(REAL_ONLY).virtual).toBe('real-only');
    expect(mergeLazyExample(entry, JSON.parse(JSON.stringify(lazyPayloadOf(REAL_ONLY)))).virtual).toBe('real-only');
    // JSON에 virtual이 없어도 목록 자리의 값을 지킨다
    const { virtual: _dropped, ...withoutVirtual } = lazyPayloadOf(REAL_ONLY);
    expect(mergeLazyExample(entry, JSON.parse(JSON.stringify(withoutVirtual))).virtual).toBe('real-only');
    // 모르는 글은 버린다
    expect(mergeLazyExample(toLazyEntry(FULL, URL), { ...lazyPayloadOf(FULL), virtual: 'whatever' }).virtual).toBeUndefined();
  });

  it('키트 장치 쪽 링크(device)는 JSON에만 있고(목록 자리에는 없다) 받아 합치면 보통 예제에 붙는다 — 모양이 틀린 값은 버린다', () => {
    const withDevice: LabExample = { ...FULL, device: { href: '/ai-physical-computing/labs/esp32/kit/d-4-01/', label: '4.01 회전(가변저항) 센서' } };
    const entry = toLazyEntry(withDevice, URL);
    expect(entry).not.toHaveProperty('device');
    expect(embeddedExampleJson(entry)).not.toHaveProperty('device');
    expect(lazyPayloadOf(withDevice).device).toEqual(withDevice.device);
    expect(mergeLazyExample(entry, JSON.parse(JSON.stringify(lazyPayloadOf(withDevice)))).device).toEqual(withDevice.device);
    expect(mergeLazyExample(entry, { ...lazyPayloadOf(withDevice), device: { href: 3 } }).device).toBeUndefined();
    expect(mergeLazyExample(toLazyEntry(FULL, URL), lazyPayloadOf(FULL)).device).toBeUndefined();
  });

  it('다음 단계(nextStep, "다음 단계: 2단계 · … →")는 JSON에만 있고 받아 합치면 붙는다 — 모양이 틀린 값은 버린다', () => {
    const first: LabExample = { ...FULL, nextStep: { id: 'kit-ch3-3-11-ultrasonic-2', href: '/ai-physical-computing/labs/esp32/?example=esp32%2Fkit%2Fch3%2F3-11-ultrasonic-2.py', label: '2단계 · 침입자 감지기' } };
    const entry = toLazyEntry(first, URL);
    expect(entry).not.toHaveProperty('nextStep');
    expect(embeddedExampleJson(entry)).not.toHaveProperty('nextStep');
    expect(lazyPayloadOf(first).nextStep).toEqual(first.nextStep);
    expect(mergeLazyExample(entry, JSON.parse(JSON.stringify(lazyPayloadOf(first)))).nextStep).toEqual(first.nextStep);
    expect(mergeLazyExample(entry, { ...lazyPayloadOf(first), nextStep: { id: 'x' } }).nextStep).toBeUndefined();
    expect(mergeLazyExample(toLazyEntry(FULL, URL), lazyPayloadOf(FULL)).nextStep).toBeUndefined();
  });

  it('끝까지 되는 예제에는 virtual 칸이 없다', () => {
    expect(toLazyEntry(FULL, URL)).not.toHaveProperty('virtual');
    expect(embeddedExampleJson(toLazyEntry(FULL, URL))).not.toHaveProperty('virtual');
    expect(lazyPayloadOf(FULL)).not.toHaveProperty('virtual');
  });

  it('저장소 사이드카의 virtual(real-only·partial)이 키트 예제에만 붙고, 교과서·사이트 예제에는 하나도 없다', () => {
    const files = readExampleGlob('.py', ['esp32']);
    const sidecars = readExampleSidecars(readExampleGlob('.meta.yaml', ['esp32']));
    const all = esp32ExamplesFromFiles(files, sidecars);
    const marked = all.filter((example) => example.virtual !== undefined);
    expect(marked.length).toBeGreaterThan(70);
    expect(marked.every((example) => isLazyEsp32File(example.file)), '키트 밖 예제에 virtual').toBe(true);
    expect(new Set(marked.map((example) => example.virtual))).toEqual(new Set(['real-only', 'partial']));
    // 장치 쪽 3.11(초음파)의 두 단계는 실제 보드 전용
    expect(all.find((example) => example.id === 'kit-ch3-3-11-ultrasonic-1')?.virtual).toBe('real-only');
    // 끝까지 되는 키트 예제(4.01 가변저항)는 칸이 없다
    expect(all.find((example) => example.id === 'kit-ch4-4-01-potentiometer-1')?.virtual).toBeUndefined();
    // 장치 쪽 링크(device)는 build에서 options.deviceByFile로 붙는다 — 여기서는 주지 않아 칸이 없다
    expect(all.some((example) => example.device !== undefined)).toBe(false);
    const withLinks = esp32ExamplesFromFiles(files, sidecars, {}, { deviceByFile: { 'esp32/kit/ch3/3-11-ultrasonic-1.py': { href: '/x/', label: '3.11 초음파 센서 V2' } } });
    expect(withLinks.find((example) => example.id === 'kit-ch3-3-11-ultrasonic-1')?.device).toEqual({ href: '/x/', label: '3.11 초음파 센서 V2' });
    expect(withLinks.filter((example) => example.device !== undefined)).toHaveLength(1);
    // 다음 단계(nextStep)도 options.nextStepByFile로 붙는다(1단계에만)
    const next = { id: 'kit-ch3-3-11-ultrasonic-2', href: '/x/?example=2', label: '2단계 · 침입자 감지기' };
    const withNext = esp32ExamplesFromFiles(files, sidecars, {}, { nextStepByFile: { 'esp32/kit/ch3/3-11-ultrasonic-1.py': next } });
    expect(withNext.find((example) => example.id === 'kit-ch3-3-11-ultrasonic-1')?.nextStep).toEqual(next);
    expect(withNext.filter((example) => example.nextStep !== undefined)).toHaveLength(1);
    // 나눈 뒤 목록 자리에도 그대로
    const { examples } = splitLazyEsp32Examples(all, urlOf);
    expect(examples.find((example) => example.id === 'kit-ch3-3-11-ultrasonic-1')?.virtual).toBe('real-only');
  });
});
