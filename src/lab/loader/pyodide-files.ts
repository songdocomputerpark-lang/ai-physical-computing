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
 */
import { PYODIDE_CDN_INDEX_URL, PYODIDE_SITE_INDEX_PATH, PYODIDE_VERSION } from '../runtime/config.ts';

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

/** Pyodide 코어(파이썬 엔진) 파일의 원본 크기 합(약 13.5MB) */
export const PYODIDE_CORE_BYTES = PYODIDE_FALLBACK_FILES.filter((file) => file.kind === 'core').reduce((sum, file) => sum + file.size, 0);

/** 예비본 전체 크기(약 27.2MB — GitHub Pages 사이트 한도 1GB의 3% 안, PLAN §5.1) */
export const PYODIDE_FALLBACK_TOTAL_BYTES = PYODIDE_FALLBACK_FILES.reduce((sum, file) => sum + file.size, 0);

export function findPyodideFile(name: string): PyodideFile | null {
  return PYODIDE_FALLBACK_FILES.find((file) => file.name === name) ?? null;
}

/** 패키지 이름(numpy, opencv-python)의 휠 파일 */
export function pyodidePackageFile(packageName: string): PyodideFile | null {
  return PYODIDE_FALLBACK_FILES.find((file) => file.kind === 'package' && file.package === packageName) ?? null;
}

/** 패키지 이름의 휠 크기(바이트). 표에 없으면 null. */
export function packageWheelSize(packageName: string): number | null {
  return pyodidePackageFile(packageName)?.size ?? null;
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

/** 예비본 전체의 CDN 주소 목록(미리 받기·캐시에 넣어 두기용) */
export function pyodidePrefetchUrls(): string[] {
  return PYODIDE_FALLBACK_FILES.map((file) => pyodideCdnUrl(file.name));
}

/** 표에 있는 패키지가 함께 받는 패키지(pyodide-lock.json의 depends — opencv-python은 numpy에 기댄다) */
export const PACKAGE_DEPENDENCIES: Readonly<Record<string, readonly string[]>> = Object.freeze({ 'opencv-python': ['numpy'] });

/**
 * 실습실이 쓰는 패키지만큼의 예비본 파일: 파이썬 엔진(코어 5개) + 그 패키지와 기대는 패키지의 휠(P3-01, PD-04).
 * packages가 null이면 예비본 전체(예전 동작 — 실습실이 LabShell pyodidePackages를 적지 않은 경우). ESP32 실습실은 []라 코어만.
 */
export function pyodideFilesFor(packages: readonly string[] | null): PyodideFile[] {
  if (packages === null) {
    return [...PYODIDE_FALLBACK_FILES];
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
  return PYODIDE_FALLBACK_FILES.filter((file) => file.kind === 'core' || (file.package !== undefined && wanted.has(file.package)));
}

/** pyodideFilesFor의 CDN 주소 목록 */
export function pyodidePrefetchUrlsFor(packages: readonly string[] | null): string[] {
  return pyodideFilesFor(packages).map((file) => pyodideCdnUrl(file.name));
}

/** pyodideFilesFor의 원본 크기 합 */
export function pyodidePrefetchBytesFor(packages: readonly string[] | null): number {
  return pyodideFilesFor(packages).reduce((sum, file) => sum + file.size, 0);
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
