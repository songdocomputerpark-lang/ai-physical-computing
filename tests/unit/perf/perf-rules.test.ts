// 성능 측정 규칙(scripts/perf-rules.mjs — Phase 6 P6-02 구역 A)의 단위 테스트.
//  - 느린 망 조건 값이 Chrome DevTools 원문의 식과 같다(3G = 옛 Slow 3G, Slow 4G = 옛 Fast 3G)
//  - 무거운 라이브러리 알아보기: 개발 서버 주소·빌드 청크 이름·본문 표식. package.json을 묶은 url.*.js처럼 이름만 든 파일은 잡지 않는다
//  - 통신 모듈 청크 알아보기(개발 서버 /src/lab/modules/<id>/index.ts, 빌드 _astro/<id>.<해시>.js)
//  - 측정하는 쪽 목록이 실제 쪽(src/pages 또는 차시 md)을 가리킨다
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  COMM_MODULE_IDS,
  HEAVY_LIBRARIES,
  JUDGED_PROFILE,
  PERF_PAGES,
  READ_BUDGET_MS,
  THROTTLE_PROFILES,
  commModuleOf,
  formatTimingRow,
  heavyLibraryOf,
  lessonPagesFromFiles,
} from '../../../scripts/perf-rules.mjs';
import { MODULE_MANIFESTS } from '../../../src/lab/modules/manifests.ts';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));

describe('느린 망 조건(DevTools 원문 값)', () => {
  it('3G(옛 Slow 3G)와 Slow 4G(옛 Fast 3G)', () => {
    expect(THROTTLE_PROFILES['3g'].conditions).toEqual({ offline: false, latency: 2000, downloadThroughput: 50_000, uploadThroughput: 50_000 });
    expect(THROTTLE_PROFILES['slow-4g'].conditions).toEqual({ offline: false, latency: 562.5, downloadThroughput: 180_000, uploadThroughput: 84_375 });
    expect(JUDGED_PROFILE).toBe('3g');
    expect(READ_BUDGET_MS).toBe(3000);
    for (const profile of Object.values(THROTTLE_PROFILES)) {
      expect(profile.source).toMatch(/Conditions: download/u);
    }
  });
});

describe('무거운 라이브러리 알아보기', () => {
  it('주소로: 개발 서버·빌드·CDN', () => {
    const cases: [string, string | null][] = [
      ['https://cdn.jsdelivr.net/pyodide/v314.0.7/full/pyodide.asm.wasm', 'pyodide'],
      ['http://localhost:4329/ai-physical-computing/vendor/pyodide/314.0.7/numpy-2.4.6-cp314-cp314-pyodide_2026_0_wasm32.whl', 'pyodide'],
      ['http://localhost:4329/ai-physical-computing/_astro/worker-CiNf00zD.js', 'pyodide'],
      ['http://localhost:4901/src/lab/runtime/worker.ts?worker_file&type=module', 'pyodide'],
      ['http://localhost:4329/ai-physical-computing/vendor/mediapipe/0.10.35/wasm/vision_wasm_internal.wasm', 'mediapipe'],
      ['http://localhost:4329/ai-physical-computing/models/hand_landmarker.task', 'mediapipe'],
      ['http://localhost:4329/ai-physical-computing/_astro/vision_bundle.BuJ97If5.js', 'mediapipe'],
      ['http://localhost:4901/node_modules/.vite/deps/@mediapipe_tasks-vision.js?v=1', 'mediapipe'],
      ['http://localhost:4329/ai-physical-computing/_astro/blockly_compressed.wIarNWjc.js', 'blockly'],
      ['http://localhost:4901/node_modules/.vite/deps/blockly_core.js?v=2', 'blockly'],
      ['http://localhost:4329/ai-physical-computing/_astro/mqtt.esm.DJxwHEmv.js', 'mqtt'],
      ['http://localhost:4901/node_modules/.vite/deps/mqtt.js?v=3', 'mqtt'],
      ['http://localhost:4901/node_modules/.vite/deps/@codemirror_view.js?v=4', 'codemirror'],
      ['http://localhost:4901/node_modules/esptool-js/lib/index.js', 'esptool'],
      ['http://localhost:4329/ai-physical-computing/firmware/v1.29.0/ESP32_GENERIC-20260101-v1.29.0.bin', 'esptool'],
      // 무거운 라이브러리가 아닌 것
      ['http://localhost:4329/ai-physical-computing/_astro/url.0eqcnGz4.js', null],
      ['http://localhost:4329/ai-physical-computing/_astro/mqtt.D1UJSqgx.js', null],
      ['http://localhost:4329/ai-physical-computing/fonts/pretendard/woff2-dynamic-subset/PretendardVariable.subset.12.woff2', null],
      ['http://localhost:4329/ai-physical-computing/images/lessons/1-1-1/recognition.webp', null],
    ];
    for (const [url, expected] of cases) {
      expect(heavyLibraryOf(url), url).toBe(expected);
    }
  });

  it('본문 표식으로: 청크 이름이 바뀌어도 알아본다. 이름만 든 글(package.json을 묶은 청크)은 잡지 않는다', () => {
    const chunk = 'http://localhost:4329/ai-physical-computing/_astro/lab-shell.C8WkVNFK.js';
    expect(heavyLibraryOf(chunk, 'const s=".cm-scroller{overflow:auto}";')).toBe('codemirror');
    expect(heavyLibraryOf(chunk, 'e.clientId="mqttjs_"+Math.random()')).toBe('mqtt');
    expect(heavyLibraryOf(chunk, 'this.info("Detecting chip type... ")')).toBe('esptool');
    expect(heavyLibraryOf(chunk, 'await loadPyodide({indexURL:e})')).toBe('pyodide');
    expect(heavyLibraryOf(chunk, 'class FilesetResolver{}')).toBe('mediapipe');
    expect(heavyLibraryOf(chunk, 'g.setAttribute("class","blocklyMainBackground")')).toBe('blockly');
    // package.json이 통째로 든 청크(src/config/site.ts) — 의존성 이름만 있다
    expect(heavyLibraryOf('http://localhost:4329/ai-physical-computing/_astro/url.0eqcnGz4.js', '{"dependencies":{"esptool-js":"0.6.1","mqtt":"5.15.2","blockly":"13.3.0","@mediapipe/tasks-vision":"0.10.35"},"devDependencies":{"pyodide":"314.0.7"}}')).toBeNull();
    expect(HEAVY_LIBRARIES.map((item) => item.id)).toEqual(['pyodide', 'mediapipe', 'blockly', 'mqtt', 'codemirror', 'esptool']);
  });

  it('빌드 결과가 있으면: 표식 글자가 그 라이브러리 청크에만 있다(dist/_astro — 없으면 건너뛴다)', () => {
    const dir = path.join(ROOT, 'dist', '_astro');
    if (!fs.existsSync(dir)) {
      return;
    }
    const chunks = fs.readdirSync(dir).filter((file) => file.endsWith('.js'));
    for (const library of HEAVY_LIBRARIES) {
      for (const marker of library.markers) {
        const holders = chunks.filter((file) => fs.readFileSync(path.join(dir, file), 'utf8').includes(marker));
        // 표식이 든 청크는 모두 실습실 쪽 청크여야 한다 — 학습 페이지가 받는 공용 청크(url·BaseLayout·차시 스크립트)에 없어야 한다
        for (const holder of holders) {
          expect(holder, `${library.id} 표식 "${marker}"`).not.toMatch(/^(?:url|BaseLayout|LessonBody|LessonPresent|_unit_|_lesson_|SearchPage|QuickCheck|korean|storage|details)[.]/u);
        }
      }
    }
  });
});

describe('통신 모듈 청크 알아보기', () => {
  it('개발 서버·빌드 주소에서 모듈 id를 읽는다', () => {
    expect(commModuleOf('http://localhost:4901/src/lab/modules/vision-bridge/index.ts')).toBe('vision-bridge');
    expect(commModuleOf('http://localhost:4901/src/lab/modules/web-bluetooth/index.ts?t=123')).toBe('web-bluetooth');
    expect(commModuleOf('http://localhost:4329/ai-physical-computing/_astro/data-port.9P7F8Ii2.js')).toBe('data-port');
    expect(commModuleOf('http://localhost:4329/ai-physical-computing/_astro/ble-pc.CZHREPbY.js')).toBe('ble-pc');
    expect(commModuleOf('http://localhost:4329/ai-physical-computing/_astro/mqtt.D1UJSqgx.js')).toBe('mqtt');
    // 통신 모듈이 아닌 것
    expect(commModuleOf('http://localhost:4329/ai-physical-computing/_astro/mqtt.esm.DJxwHEmv.js')).toBeNull();
    expect(commModuleOf('http://localhost:4329/ai-physical-computing/_astro/loading.BBE3g6xi.js')).toBeNull();
    expect(commModuleOf('http://localhost:4901/src/lab/modules/board/index.ts')).toBeNull();
    expect(commModuleOf('http://localhost:4901/src/lab/modules/vision-bridge/link.ts')).toBeNull();
  });

  it('통신 모듈 목록은 manifest의 load 무리(comm)와 같다', () => {
    expect([...COMM_MODULE_IDS]).toEqual(MODULE_MANIFESTS.filter((item) => item.load?.group === 'comm').map((item) => item.id));
  });
});

describe('측정하는 쪽', () => {
  it('목록의 쪽은 모두 실제 쪽이다(src/pages 또는 차시 md)', () => {
    for (const page of PERF_PAGES) {
      const lesson = /^learn\/(u\d)\/([a-z0-9-]+)\/$/u.exec(page.path);
      if (lesson) {
        expect(fs.existsSync(path.join(ROOT, 'content', 'lessons', lesson[1] ?? '', `${lesson[2]}.md`)), page.path).toBe(true);
        continue;
      }
      if (/^learn\/u\d\/$/u.test(page.path)) {
        expect(fs.existsSync(path.join(ROOT, 'src', 'pages', 'learn', '[unit]')), page.path).toBe(true);
        continue;
      }
      const source = path.join(ROOT, 'src', 'pages', ...page.path.split('/').filter((part) => part !== ''), 'index.astro');
      expect(fs.existsSync(source), `${page.path} → ${path.relative(ROOT, source)}`).toBe(true);
    }
    // 시간을 재는 쪽에 차시·목록·용어사전·교사용이 모두 있다(PLAN §8.6 P6-02 "학습 페이지")
    const timedKinds = new Set(PERF_PAGES.filter((item) => item.timed).map((item) => item.kind));
    for (const kind of ['lesson', 'list', 'glossary', 'teacher']) {
      expect(timedKinds.has(kind as never), kind).toBe(true);
    }
    // 실습실 페이지(Pyodide를 받는 곳)는 무거운 라이브러리 검사 목록에 없다
    expect(PERF_PAGES.filter((item) => /^labs\/(?:vision|esp32|unit4|dev|iot\/dashboard)\//u.test(item.path))).toEqual([]);
  });

  it('차시 파일 목록 → 차시 주소', () => {
    expect(lessonPagesFromFiles(['u2/2-1-r.md', 'u1/1-1-1.md', 'u1/1-1-1.images.yaml', 'README.md'])).toEqual([
      { path: 'learn/u1/1-1-1/', label: '차시 1-1-1', kind: 'lesson' },
      { path: 'learn/u2/2-1-r/', label: '차시 2-1-r', kind: 'lesson' },
    ]);
  });

  it('측정 행 한 줄', () => {
    expect(formatTimingRow({ label: '차시 1-1-1', profile: '3g', fcp: 2396.4, firstText: 2596, lcp: null, dcl: 21385, load: 21389, bytes: 597663, requests: 34, fontBytes: 504843 })).toBe(
      '차시 1-1-1 [3g] FCP 2,396ms · 첫 문단 2,596ms · LCP — · DCL 21,385ms · load 21,389ms · 584KB/34건(글꼴 493KB)',
    );
  });
});
