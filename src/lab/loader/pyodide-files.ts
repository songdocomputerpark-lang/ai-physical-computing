/**
 * 같은 사이트 Pyodide 예비본 파일 표(PLAN §5.1·§5.2 PD-02·PD-13, §8.2 P2-05).
 *
 * 첫 cv2 실습에 필요한 파일만 적는다: Pyodide 코어 5개 + numpy·opencv-python 휠(opencv-python은 numpy에만 의존, pyodide-lock.json).
 * 크기·SHA-256은 2026-09-16에 npm 패키지 pyodide@314.0.7의 파일(코어)과 jsDelivr가 준 휠(.cache/pyodide-packages/)을 재서 적었고,
 * 휠의 sha256은 pyodide-lock.json의 값과 같다(tests/unit/loading/pyodide-files.test.ts가 매번 대조한다). PLAN §5.1의 크기와도 같다.
 *
 * 쓰는 곳
 * - scripts/fetch-pyodide-fallback.mjs: 빌드 때 이 파일들을 public/vendor/pyodide/<판>/에 둔다(있으면 해시만 확인, 없으면 npm 패키지·
 *   시험 캐시에서 복사, 그것도 없으면 jsDelivr에서 받는다).
 * - 서비스 워커(src/sw/sw.js, 빌드 때 JSON으로 새겨짐): CDN 주소 ↔ 같은 사이트 주소를 한 파일로 보고, 진행률 전체 크기를 안다.
 * - 로딩 모듈(src/lab/modules/loading/): 단계별 전체 크기(파이썬 엔진 13.5MB, numpy 3.0MB, OpenCV 10.7MB).
 *
 * size는 **압축을 푼 원본 크기**다. jsDelivr는 .wasm·.whl·.zip까지 모두 압축해 보내므로(2026-09-16 실측) 실제 전송량은 이보다 훨씬 작다:
 * 코어 5개 6,237,877바이트(약 6.0MiB, PLAN §5.1의 "전송 약 6.2MB" 확인), numpy 2,929,885, OpenCV 10,668,240 → 첫 cv2 실습 전송 약 19.8MB.
 * 브라우저가 받은 바이트를 세면 원본 크기와 같아지므로(압축을 푼 뒤) 진행률은 이 표의 값으로 잰다.
 *
 * Pyodide 판을 올릴 때: config.ts의 PYODIDE_VERSION을 바꾸고 이 표의 이름·크기·해시를 새 파일로 갱신한다(단위 테스트가 어긋남을 잡는다).
 * Node.js(scripts/)도 읽으므로 타입 표기만 지우면 그대로 도는 문법만 쓴다.
 *
 * 오프라인 배포판(PLAN §5.6, P6-07): 인터넷 없이 모든 실습이 돌게 예비본 7개에 **오프라인판에서만 더 넣는 휠**(PYODIDE_OFFLINE_EXTRA_FILES)을
 * 더한 표(PYODIDE_OFFLINE_FILES)를 쓴다. scripts/build-offline.mjs가 이 표대로 파일을 채우고(크기·SHA-256 대조),
 * 서비스 워커(scripts/build-sw.mjs --offline)도 이 표로 크기·해시를 안다. 아래 찾기 도우미는 이 번들이 오프라인판(config.ts의
 * OFFLINE_BUILD)이면 그 표를, 아니면 예비본 표를 본다 — 온라인 사이트의 결과는 전과 같다.
 */
import { OFFLINE_BUILD, PYODIDE_CDN_INDEX_URL, PYODIDE_SITE_INDEX_PATH, PYODIDE_VERSION } from '../runtime/config.ts';

export type PyodideFileKind = 'core' | 'package';

export interface PyodideFile {
  /** 파일 이름(CDN 폴더와 예비본 폴더에서 같다) */
  readonly name: string;
  readonly kind: PyodideFileKind;
  /** kind가 package일 때 pyodide-lock.json의 패키지 이름 */
  readonly package?: string;
  /** 원본 크기(바이트, 압축 전) */
  readonly size: number;
  readonly sha256: string;
}

export const PYODIDE_FALLBACK_FILES: readonly PyodideFile[] = Object.freeze([
  { name: 'pyodide.mjs', kind: 'core', size: 17_931, sha256: '6f1d60f7bf529beb300f0f47983c921d3982363640ba20af0e38efdddbc66109' },
  { name: 'pyodide.asm.mjs', kind: 'core', size: 1_250_344, sha256: 'f7cdc8ece80678ceb712f8e65ebe6d3a83203a180c399865f49612a051693635' },
  { name: 'pyodide.asm.wasm', kind: 'core', size: 9_598_218, sha256: 'cc36e3cab04fdfc9a63ff13eb52eae2b911bf46c025cc7b281f394bd3de1d5e6' },
  { name: 'python_stdlib.zip', kind: 'core', size: 2_545_637, sha256: 'fa1957e5777068fc4f7437f96d860ae2fbe9c19732ba06c84e004ec16dd7dd7a' },
  { name: 'pyodide-lock.json', kind: 'core', size: 119_077, sha256: '5dc2fc119108bc148c7457dc86e7675b5c87e1cafd420b9c34c1eaef7b36c010' },
  {
    name: 'numpy-2.4.6-cp314-cp314-pyemscripten_2026_0_wasm32.whl',
    kind: 'package',
    package: 'numpy',
    size: 2_960_568,
    sha256: 'a292c1f5d7d8a2208cd5e94fc467604c131cabcd2fc14fed6eefde121e7fabdf',
  },
  {
    name: 'opencv_python-4.11.0.86-cp314-cp314-pyemscripten_2026_0_wasm32.whl',
    kind: 'package',
    package: 'opencv-python',
    size: 10_675_764,
    sha256: '469a8ba6758ec4e0bce12436da977a1db3a953e320927c3f55ca6233a5d20acf',
  },
]);

/**
 * 오프라인 배포판에만 더 넣는 휠(PLAN §5.6, P6-07). 온라인 사이트는 이 휠을 쓸 때 jsDelivr에서 받는다(예비본에 넣지 않는다 —
 * 첫 실습에 필요 없고 GitHub Pages 배포물을 키우지 않으려고).
 *
 * 고르는 법: 예제(examples/)·사이트 흉내 모듈(src/lab/**\/*.py)·차시 코드 블록이 import하는 이름을 pyodide-lock.json의 imports로
 * 패키지에 잇고 depends를 따라간 것 가운데 예비본에 없는 것(2026-09-26: cv2 → opencv-python·numpy, PIL → pillow — 나머지는 표준 라이브러리이거나
 * 사이트 흉내 모듈). scripts/lib/offline-packages.mjs가 그 계산을 하고, tests/unit/offline/packages.test.ts와 npm run build:offline이
 * 이 표로 모두 덮이는지 매번 본다 — 새 예제가 다른 패키지(예: matplotlib)를 쓰면 거기서 멈추고 여기에 한 줄을 더하라고 알린다.
 * 크기는 jsDelivr가 준 휠(.cache/pyodide-packages/)을 재서, SHA-256은 pyodide-lock.json의 값을 적었다(2026-09-26 — 둘이 같음을 확인).
 */
export const PYODIDE_OFFLINE_EXTRA_FILES: readonly PyodideFile[] = Object.freeze([
  {
    name: 'pillow-12.2.0-cp314-cp314-pyemscripten_2026_0_wasm32.whl',
    kind: 'package',
    package: 'pillow',
    size: 1_037_806,
    sha256: 'e29838b7a756e4ee0f27a9cfa9a387ee0dfa2e9dd44be2dd595130b9f9d93ac3',
  },
]);

/** 오프라인 배포판에 넣는 Pyodide 파일 전부: 예비본 7개 + 오프라인판에서만 더 넣는 휠 */
export const PYODIDE_OFFLINE_FILES: readonly PyodideFile[] = Object.freeze([...PYODIDE_FALLBACK_FILES, ...PYODIDE_OFFLINE_EXTRA_FILES]);

/** Pyodide 코어(파이썬 엔진) 파일의 원본 크기 합(약 13.5MB) */
export const PYODIDE_CORE_BYTES = PYODIDE_FALLBACK_FILES.filter((file) => file.kind === 'core').reduce((sum, file) => sum + file.size, 0);

/** 예비본 전체 크기(약 27.2MB — GitHub Pages 사이트 한도 1GB의 3% 안, PLAN §5.1) */
export const PYODIDE_FALLBACK_TOTAL_BYTES = PYODIDE_FALLBACK_FILES.reduce((sum, file) => sum + file.size, 0);

/** 오프라인 배포판의 Pyodide 파일 전체 크기(약 28.2MB) */
export const PYODIDE_OFFLINE_TOTAL_BYTES = PYODIDE_OFFLINE_FILES.reduce((sum, file) => sum + file.size, 0);

/**
 * 이 번들이 아는 Pyodide 파일 표: 온라인 사이트는 예비본 7개, 오프라인 배포판은 PYODIDE_OFFLINE_FILES.
 * @param offline 기본은 이 번들이 오프라인판인지(config.ts의 OFFLINE_BUILD). 빌드 스크립트·단위 테스트는 직접 넘긴다.
 */
export function pyodideFileTable(offline: boolean = OFFLINE_BUILD): readonly PyodideFile[] {
  return offline ? PYODIDE_OFFLINE_FILES : PYODIDE_FALLBACK_FILES;
}

export function findPyodideFile(name: string, offline: boolean = OFFLINE_BUILD): PyodideFile | null {
  return pyodideFileTable(offline).find((file) => file.name === name) ?? null;
}

/** 패키지 이름(numpy, opencv-python — 오프라인판은 pillow도)의 휠 파일 */
export function pyodidePackageFile(packageName: string, offline: boolean = OFFLINE_BUILD): PyodideFile | null {
  return pyodideFileTable(offline).find((file) => file.kind === 'package' && file.package === packageName) ?? null;
}

/** 패키지 이름의 휠 크기(바이트). 표에 없으면 null. */
export function packageWheelSize(packageName: string, offline: boolean = OFFLINE_BUILD): number | null {
  return pyodidePackageFile(packageName, offline)?.size ?? null;
}

/** jsDelivr 주소 */
export function pyodideCdnUrl(name: string): string {
  return `${PYODIDE_CDN_INDEX_URL}${name}`;
}

/** 같은 사이트 예비본 주소(origin은 브라우저에서 location.origin) */
export function pyodideSiteIndexUrl(origin: string): string {
  return new URL(PYODIDE_SITE_INDEX_PATH, origin).href;
}

export function pyodideSiteUrl(name: string, origin: string): string {
  return `${pyodideSiteIndexUrl(origin)}${name}`;
}

/**
 * 주소가 Pyodide 파일(CDN 또는 같은 사이트 예비본)인지, 어느 쪽인지, 파일 이름은 무엇인지.
 * 검색어(?)가 붙은 주소는 살핌(probe)·시험용이므로 Pyodide 파일로 보지 않는다(서비스 워커도 캐시하지 않고 그대로 보낸다).
 */
export function parsePyodideUrl(url: string, origin: string): { from: 'cdn' | 'site'; name: string } | null {
  if (url.includes('?') || url.includes('#')) {
    return null;
  }
  if (url.startsWith(PYODIDE_CDN_INDEX_URL)) {
    const name = url.slice(PYODIDE_CDN_INDEX_URL.length);
    return name === '' || name.includes('/') ? null : { from: 'cdn', name };
  }
  const siteIndex = pyodideSiteIndexUrl(origin);
  if (url.startsWith(siteIndex)) {
    const name = url.slice(siteIndex.length);
    return name === '' || name.includes('/') ? null : { from: 'site', name };
  }
  return null;
}

/** CDN 주소 ↔ 같은 사이트 주소(같은 파일의 다른 위치). Pyodide 주소가 아니면 null. */
export function twinPyodideUrl(url: string, origin: string): string | null {
  const parsed = parsePyodideUrl(url, origin);
  if (!parsed) {
    return null;
  }
  return parsed.from === 'cdn' ? pyodideSiteUrl(parsed.name, origin) : pyodideCdnUrl(parsed.name);
}

/** 브라우저에서는 이 페이지의 출처(location.origin), Node에서는 없음 */
function currentOrigin(): string | undefined {
  const locationLike = (globalThis as { location?: { origin?: string } }).location;
  return typeof locationLike?.origin === 'string' && locationLike.origin !== 'null' ? locationLike.origin : undefined;
}

/**
 * 미리 받기·캐시 채우기에 쓸 주소: 온라인 사이트는 jsDelivr 주소(서비스 워커가 막히면 같은 사이트로 바꾼다),
 * 오프라인 배포판은 같은 사이트 주소(인터넷을 두드리지 않는다 — PLAN §5.6). 출처를 모르면(Node) 사이트 뿌리 기준 경로.
 */
export function pyodidePreferredUrl(name: string, offline: boolean = OFFLINE_BUILD, origin: string | undefined = currentOrigin()): string {
  if (!offline) {
    return pyodideCdnUrl(name);
  }
  return origin ? pyodideSiteUrl(name, origin) : `${PYODIDE_SITE_INDEX_PATH}${name}`;
}

/** 이 번들이 아는 파일 표 전체의 미리 받기 주소 목록(온라인: 예비본 7개의 CDN 주소) */
export function pyodidePrefetchUrls(offline: boolean = OFFLINE_BUILD): string[] {
  return pyodideFileTable(offline).map((file) => pyodidePreferredUrl(file.name, offline));
}

/** 표에 있는 패키지가 함께 받는 패키지(pyodide-lock.json의 depends — opencv-python은 numpy에 기대고, pillow는 기대는 것이 없다) */
export const PACKAGE_DEPENDENCIES: Readonly<Record<string, readonly string[]>> = Object.freeze({ 'opencv-python': ['numpy'] });

/**
 * 실습실이 쓰는 패키지만큼의 예비본 파일: 파이썬 엔진(코어 5개) + 그 패키지와 기대는 패키지의 휠(P3-01, PD-04).
 * packages가 null이면 표 전체(예전 동작 — 실습실이 LabShell pyodidePackages를 적지 않은 경우). ESP32 실습실은 []라 코어만.
 * 오프라인 배포판에서는 오프라인 표(pillow 포함)에서 고른다.
 */
export function pyodideFilesFor(packages: readonly string[] | null, offline: boolean = OFFLINE_BUILD): PyodideFile[] {
  const table = pyodideFileTable(offline);
  if (packages === null) {
    return [...table];
  }
  const wanted = new Set<string>();
  const add = (name: string) => {
    if (wanted.has(name)) {
      return;
    }
    wanted.add(name);
    for (const dependency of PACKAGE_DEPENDENCIES[name] ?? []) {
      add(dependency);
    }
  };
  for (const name of packages) {
    add(name);
  }
  return table.filter((file) => file.kind === 'core' || (file.package !== undefined && wanted.has(file.package)));
}

/** pyodideFilesFor의 미리 받기 주소 목록(온라인: CDN 주소, 오프라인 배포판: 같은 사이트 주소 — pyodidePreferredUrl) */
export function pyodidePrefetchUrlsFor(packages: readonly string[] | null, offline: boolean = OFFLINE_BUILD): string[] {
  return pyodideFilesFor(packages, offline).map((file) => pyodidePreferredUrl(file.name, offline));
}

/** pyodideFilesFor의 원본 크기 합 */
export function pyodidePrefetchBytesFor(packages: readonly string[] | null, offline: boolean = OFFLINE_BUILD): number {
  return pyodideFilesFor(packages, offline).reduce((sum, file) => sum + file.size, 0);
}

/** 바이트를 사람이 읽는 글자로: 118KB, 2.9MB, 13.5MB */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '?';
  }
  if (bytes < 1024) {
    return `${Math.round(bytes)}B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)}KB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${mb >= 100 ? Math.round(mb) : mb.toFixed(1)}MB`;
}

export { PYODIDE_VERSION };
