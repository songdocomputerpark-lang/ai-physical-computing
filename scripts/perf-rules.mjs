// 성능 측정 규칙 한 곳(Phase 6 P6-02 — 구역 A, 2026-09-26). 브라우저 측정(tests/e2e/perf-*.spec.ts)과 단위 테스트(tests/unit/perf/)가 함께 읽는다.
//
// 1. 느린 망 조건(THROTTLE_PROFILES) — Chrome DevTools의 미리 정한 조건 값을 그대로 옮겼다(출처:
//    https://github.com/ChromeDevTools/devtools-frontend/blob/main/front_end/core/sdk/NetworkManager.ts, 2026-09-26 원문 확인).
//    - '3g'    : DevTools "3G"(2024년 5월 전 이름 "Slow 3G") — 내려받기·올리기 500kbit/s×0.8 = 50,000바이트/초, 지연 400ms×5 = 2,000ms.
//                **P6-02 판정 조건.** PLAN §8.6 P6-02가 "느린 3G 조건"이라고만 적고 값은 정하지 않아(§8.2의 1.6Mbit/s·562.5ms는 "Fast 3G" 값)
//                이번 판정은 DevTools의 "3G"(= 옛 "Slow 3G") 값을 쓴다 — SPEC §9 "3G에서도 3초 안에"와 이름이 같은 조건이다.
//    - 'slow-4g': DevTools "Slow 4G"(2024년 5월 전 이름 "Fast 3G") — 1.6Mbit/s×0.9 내려받기, 750kbit/s×0.9 올리기, 지연 150ms×3.75 = 562.5ms.
//                PLAN §8.1·§8.2와 first-visit.spec.ts가 "Fast 3G"로 잰 조건(그때는 1024 곱셈에 0.9 없이 적었다) — 참고값·비교용.
//    CDP Network.emulateNetworkConditions는 **페이지 대상에만** 걸린다(워커·서비스 워커 요청은 느려지지 않는다 — PROGRESS 미해결 36).
//    학습 페이지는 워커를 쓰지 않으므로 이 한계에 걸리지 않는다. 지연은 요청마다 붙는다(연결을 다시 써도).
//
// 2. "읽힌다"의 판정(READ_BUDGET_MS): PLAN §8.1 구현 메모대로 **본문이 처음 그려지는 시각(FCP, first-contentful-paint)**이 3,000ms 안.
//    함께 적는 것: 본문 첫 문단이 그려진 시각(Element Timing — 측정 스크립트가 main 안 첫 긴 문단에 elementtiming을 단다), LCP, DCL, load,
//    글꼴 도착(load에 포함 — font-display: swap이라 글꼴은 FCP를 막지 않는다), 받은 바이트·요청 수.
//
// 3. 무거운 라이브러리(HEAVY_LIBRARIES): 실습실에서만 받아야 하는 것 — Pyodide·MediaPipe·Blockly·MQTT.js·CodeMirror·esptool-js.
//    주소 모양(개발 서버의 /node_modules/.vite/deps/…와 빌드의 _astro/<이름>.<해시>.js·/vendor/…)과 **본문 속 표식 글자**(압축돼도 남는
//    문자열 — 빌드 결과 dist/_astro를 grep해 고름, 2026-09-26)로 알아본다. 표식은 그 라이브러리 파일에만 있는 글자를 골랐다
//    (예: "esptool"·"pyodide" 낱말은 package.json을 묶은 url.*.js에도 있어 쓰지 않는다 — 구역 A 보고서).
//
// 4. 통신 모듈 청크(COMM_MODULE_IDS) — 쓸 때만 받는지(PROGRESS 미해결 157) 볼 때 쓰는 주소 모양.

/** @typedef {{ offline: boolean, latency: number, downloadThroughput: number, uploadThroughput: number }} CdpNetworkConditions */

/**
 * @typedef {object} ThrottleProfile
 * @property {string} id
 * @property {string} label 사람이 읽는 이름
 * @property {string} source 값의 출처(DevTools 원문의 식)
 * @property {CdpNetworkConditions} conditions CDP Network.emulateNetworkConditions에 그대로 넘기는 값(바이트/초, 밀리초)
 */

/** @type {Readonly<Record<'3g' | 'slow-4g', ThrottleProfile>>} */
export const THROTTLE_PROFILES = Object.freeze({
  '3g': Object.freeze({
    id: '3g',
    label: 'DevTools "3G"(옛 이름 Slow 3G) — 400kbit/s, 지연 2,000ms',
    source: 'Slow3GConditions: download 500*1000/8*.8, upload 500*1000/8*.8, latency 400*5',
    conditions: Object.freeze({ offline: false, latency: 400 * 5, downloadThroughput: (500 * 1000) / 8 * 0.8, uploadThroughput: (500 * 1000) / 8 * 0.8 }),
  }),
  'slow-4g': Object.freeze({
    id: 'slow-4g',
    label: 'DevTools "Slow 4G"(옛 이름 Fast 3G) — 1.44Mbit/s, 지연 562.5ms',
    source: 'Slow4GConditions: download 1.6*1000*1000/8*.9, upload 750*1000/8*.9, latency 150*3.75',
    conditions: Object.freeze({ offline: false, latency: 150 * 3.75, downloadThroughput: ((1.6 * 1000 * 1000) / 8) * 0.9, uploadThroughput: ((750 * 1000) / 8) * 0.9 }),
  }),
});

/** P6-02 판정에 쓰는 조건 */
export const JUDGED_PROFILE = '3g';

/** "읽힌다"의 한도(밀리초) — SPEC §9 "학습 페이지는 3G에서도 3초 안에 읽힘", 판정 지표는 FCP(PLAN §8.1 구현 메모) */
export const READ_BUDGET_MS = 3000;

/**
 * @typedef {object} PerfPage
 * @property {string} path base 뒤 경로(끝 /)
 * @property {string} label
 * @property {'home' | 'list' | 'lesson' | 'glossary' | 'teacher' | 'gallery' | 'help' | 'start' | 'other'} kind
 * @property {boolean} [timed] 느린 망 시간을 재는 쪽(학습 페이지 — 차시·목록·용어사전·교사용)
 * @property {boolean} [quick] 전체 브라우저 테스트(npm run test:e2e)에서도 무거운 라이브러리를 보는 대표 쪽
 */

/**
 * 측정하는 쪽. 차시는 대표(기준 차시 1-1-1)와 HTML이 가장 큰 차시(2026-09-26 dist 기준 4-1-3 174KB·4-2-1 152KB)와 원고 그림이 많은 1-1-2,
 * 읽기 자료 2-1-R을 시간 재기에 넣고, 무거운 라이브러리 검사(perf 무리)에서는 차시 45편을 모두 본다(allLessonPages).
 * @type {readonly PerfPage[]}
 */
export const PERF_PAGES = Object.freeze([
  { path: '', label: '홈', kind: 'home', timed: true, quick: true },
  { path: 'learn/', label: '배우기(차시 목록)', kind: 'list', timed: true, quick: true },
  { path: 'learn/u1/', label: 'I단원 목록', kind: 'list', timed: true },
  { path: 'learn/u1/1-1-1/', label: '차시 1-1-1(기준 차시)', kind: 'lesson', timed: true, quick: true },
  { path: 'learn/u1/1-1-2/', label: '차시 1-1-2(원고 그림 많음)', kind: 'lesson', timed: true },
  { path: 'learn/u2/2-1-r/', label: '차시 2-1-R(읽기 자료)', kind: 'lesson', timed: true },
  { path: 'learn/u4/4-1-3/', label: '차시 4-1-3(HTML이 가장 큰 차시)', kind: 'lesson', timed: true, quick: true },
  { path: 'learn/u4/4-2-1/', label: '차시 4-2-1(두 번째로 큰 차시)', kind: 'lesson', timed: true },
  { path: 'glossary/', label: '용어사전', kind: 'glossary', timed: true, quick: true },
  { path: 'teacher/', label: '교사용 자료실', kind: 'teacher', timed: true, quick: true },
  { path: 'teacher/guides/', label: '교사용 차시별 지도 요약', kind: 'teacher', timed: true },
  { path: 'teacher/standards/', label: '교사용 성취기준과 평가 방향', kind: 'teacher', timed: true },
  { path: 'labs/gallery/', label: '예제 갤러리', kind: 'gallery', quick: true },
  { path: 'labs/', label: '실습실 안내', kind: 'other' },
  { path: 'labs/iot/', label: '통신 실습실 안내', kind: 'other' },
  { path: 'help/', label: '문제 해결', kind: 'help' },
  { path: 'help/errors/', label: '오류 사전', kind: 'help', quick: true },
  { path: 'start/', label: '시작하기', kind: 'start' },
  { path: 'start/student/', label: '학생 시작하기', kind: 'start' },
  { path: 'start/teacher/', label: '교사 시작하기', kind: 'start' },
  { path: 'start/board/', label: '보드 준비(펌웨어 굽기 화면 — 누르기 전)', kind: 'start' },
  { path: 'start/check/', label: '점검 페이지', kind: 'start' },
  { path: 'search/', label: '검색', kind: 'other' },
  { path: 'credits/', label: '출처', kind: 'other' },
]);

/**
 * content/lessons/<단원>/<파일>.md 목록 → 차시 쪽(/learn/<단원>/<파일 이름>/). 초안(draft)은 빼고 넘긴다(부르는 쪽이 고른다).
 * @param {readonly string[]} relativeFiles 'u1/1-1-1.md' 모양(content/lessons 기준, / 구분)
 * @returns {PerfPage[]}
 */
export function lessonPagesFromFiles(relativeFiles) {
  return relativeFiles
    .filter((file) => /^u\d\/[a-z0-9-]+\.md$/u.test(file))
    .sort()
    .map((file) => {
      const [unit, name] = file.slice(0, -'.md'.length).split('/');
      return { path: `learn/${unit}/${name}/`, label: `차시 ${name}`, kind: 'lesson' };
    });
}

/**
 * @typedef {object} HeavyLibrary
 * @property {string} id
 * @property {string} label
 * @property {readonly RegExp[]} urls 주소 모양(개발 서버·빌드 모두)
 * @property {readonly string[]} markers 본문(스크립트)에 든 표식 글자 — 하나라도 있으면 그 라이브러리
 */

/** 실습실에서만 받아야 하는 무거운 라이브러리(P6-02 "무거운 라이브러리는 실습실에서만") @type {readonly HeavyLibrary[]} */
export const HEAVY_LIBRARIES = Object.freeze([
  {
    id: 'pyodide',
    label: 'Pyodide(파이썬 엔진·패키지)',
    urls: [/\/pyodide\/v?\d+\.\d+\.\d+\//u, /\/vendor\/pyodide\//u, /pyodide\.asm\.(?:wasm|mjs|js)(?:[?#]|$)/u, /python_stdlib\.zip(?:[?#]|$)/u, /\/_astro\/worker-[\w-]+\.js(?:[?#]|$)/u, /\/src\/lab\/runtime\/worker\.ts/u],
    markers: ['loadPyodide'],
  },
  {
    id: 'mediapipe',
    label: 'MediaPipe(손·얼굴·자세 인식)',
    urls: [/\/vendor\/mediapipe\//u, /\/models\/[^/?#]+\.(?:task|tflite)(?:[?#]|$)/u, /\/_astro\/vision_bundle\.[\w-]+\.js/u, /@mediapipe[_/]tasks-vision/u],
    markers: ['FilesetResolver', 'HandLandmarker'],
  },
  {
    id: 'blockly',
    label: 'Blockly(블록 코딩)',
    urls: [/\/_astro\/blockly_compressed\.[\w-]+\.js/u, /\/node_modules\/\.vite\/deps\/blockly/u, /\/vendor\/blockly\//u],
    markers: ['blocklyMainBackground'],
  },
  {
    id: 'mqtt',
    label: 'MQTT.js(중계 서버 통신)',
    urls: [/\/_astro\/mqtt\.esm\.[\w-]+\.js/u, /\/node_modules\/\.vite\/deps\/mqtt\.js/u],
    markers: ['mqttjs_'],
  },
  {
    id: 'codemirror',
    label: 'CodeMirror(코드 편집칸)',
    urls: [/\/node_modules\/\.vite\/deps\/@codemirror_/u],
    markers: ['cm-scroller'],
  },
  {
    id: 'esptool',
    label: 'esptool-js(펌웨어 굽기)',
    urls: [/\/node_modules\/esptool-js\//u, /\/firmware\/v[\d.]+\/[^/?#]+\.bin(?:[?#]|$)/u],
    markers: ['Detecting chip type'],
  },
]);

/**
 * 요청 하나가 어느 무거운 라이브러리인지(주소 → 본문 표식 차례). 아니면 null.
 * @param {string} url
 * @param {string | null} [body] 스크립트 본문(있을 때만 표식을 본다)
 * @returns {string | null}
 */
export function heavyLibraryOf(url, body = null) {
  for (const library of HEAVY_LIBRARIES) {
    if (library.urls.some((pattern) => pattern.test(url))) {
      return library.id;
    }
  }
  if (typeof body === 'string' && body !== '') {
    for (const library of HEAVY_LIBRARIES) {
      if (library.markers.some((marker) => body.includes(marker))) {
        return library.id;
      }
    }
  }
  return null;
}

/** 쓸 때만 받는 통신 모듈(src/lab/modules/<id>/manifest.ts의 load.group 'comm') */
export const COMM_MODULE_IDS = Object.freeze(['ble-pc', 'data-port', 'mqtt', 'serial-pc', 'vision-bridge', 'web-bluetooth']);

/**
 * 스크립트 주소가 통신 모듈의 화면 쪽(index.ts) 청크인지 — 그 모듈 id, 아니면 null.
 * 개발 서버: /src/lab/modules/<id>/index.ts, 빌드: /_astro/<id>.<해시>.js(Rollup이 index 파일 청크에 폴더 이름을 붙인다 — 2026-09-26 dist 확인).
 * 주의: 빌드에서는 MQTT 통로 라이브러리 src/lab/mqtt/index.ts도 _astro/mqtt.<해시>.js가 되어 'mqtt'로 읽힌다(주소만으로는 모듈과 가를 수 없다).
 * 그래서 "받은 통신 모듈 수"를 셀 때는 그 실습실의 모듈 목록과 겹치는 것만 센다(tests/e2e/perf-lab-modules.spec.ts — 2026-09-26 통합).
 * @param {string} url
 * @returns {string | null}
 */
export function commModuleOf(url) {
  const path = url.split(/[?#]/u)[0] ?? '';
  const dev = /\/src\/lab\/modules\/([a-z0-9-]+)\/index\.ts$/u.exec(path);
  if (dev && COMM_MODULE_IDS.includes(dev[1] ?? '')) {
    return dev[1] ?? null;
  }
  const built = /\/_astro\/([a-z0-9-]+)\.[\w-]{6,}\.js$/u.exec(path);
  if (built && COMM_MODULE_IDS.includes(built[1] ?? '') && !path.includes('/mqtt.esm.')) {
    return built[1] ?? null;
  }
  return null;
}

/**
 * 측정 행을 한 줄 한국어로(보고서·콘솔).
 * @param {{ label: string, profile: string, fcp: number | null, firstText: number | null, lcp: number | null, dcl: number | null, load: number | null, bytes: number, requests: number, fontBytes?: number }} row
 */
export function formatTimingRow(row) {
  const ms = (value) => (value === null || value === undefined ? '—' : `${Math.round(value).toLocaleString('ko-KR')}ms`);
  const kb = (value) => `${(value / 1024).toFixed(0)}KB`;
  return (
    `${row.label} [${row.profile}] FCP ${ms(row.fcp)} · 첫 문단 ${ms(row.firstText)} · LCP ${ms(row.lcp)} · DCL ${ms(row.dcl)} · load ${ms(row.load)}` +
    ` · ${kb(row.bytes)}/${row.requests}건${row.fontBytes === undefined ? '' : `(글꼴 ${kb(row.fontBytes)})`}`
  );
}
