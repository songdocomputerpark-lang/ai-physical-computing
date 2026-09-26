/**
 * 출처와 라이선스 페이지의 데이터(PLAN §8.1 P1-04 ④, §9.2 "출처 페이지").
 * sources.yaml을 읽어 라이선스별로 묶고, 제3자 권리 표기 자료를 따로 뽑는다.
 * 등록부 검사 규칙은 빌드 전 검사(scripts/check-sources.mjs)와 같은 모듈을 쓴다.
 */
import { siteConfig } from '../config/site.ts';
import { withBase } from './url.ts';
import {
  CATEGORIES,
  CATEGORY_LABELS,
  REGISTRY_FILE,
  isExcludedFromSiteLicense,
  parseRegistry,
  type SourceEntry,
} from '../../scripts/lib/sources-registry.mjs';

export type { SourceEntry };

/** 고지 전문 파일 하나와 그 파일을 고지로 쓰는 항목들(출처 페이지 "고지 전문 파일 모음") */
export interface NoticeFileView {
  /** 저장소 뿌리 기준 경로(public/…) */
  path: string;
  /** 사이트 주소(base 포함) */
  href: string;
  /** 이 파일을 고지로 쓰는 등록부 항목 이름 */
  entries: string[];
}

/**
 * 다시 나누는 파일에 꼭 함께 알려야 하는 것(2026-09-26 P6-04). 라이선스가 "문서에 이 문장을 적으라"거나
 * "소스를 받을 곳을 알리라"고 요구하는 것을 출처 페이지 위쪽에 모아 보인다. 전문은 noticePath 파일에 있다.
 */
export interface RedistributionNotice {
  id: string;
  title: string;
  /** 한국어 설명 */
  text: string;
  /** 라이선스가 요구하는 문장 원문(영어 — 화면에서 lang="en") */
  statement?: string;
  /** 고지 전문 파일(public/ 아래) */
  noticePath: string;
}

export const REDISTRIBUTION_NOTICES: readonly RedistributionNotice[] = Object.freeze([
  {
    id: 'ffmpeg-lgpl',
    title: 'FFmpeg(GNU LGPL 2.1 이상) — 영상처리 실습의 OpenCV 휠 안',
    text:
      '파이썬 영상 처리 라이브러리 OpenCV 휠(opencv-python 4.11.0.86)의 cv2.so에는 FFmpeg 4.4.1이 정적으로 들어 있고, FFmpeg는 GNU LGPL 2.1 이상이에요. ' +
      '사이트는 휠과 FFmpeg를 고치지 않고 Pyodide 공식 파일을 그대로 같은 사이트 예비본으로 다시 나눠요. 받은 사람은 LGPL에 따라 FFmpeg를 고쳐 다시 연결할 수 있고, ' +
      '사이트는 그러려는 수정과 디버깅용 역공학을 막지 않아요. 대응 소스(FFmpeg 4.4.1, OpenCV 소스, 휠을 만든 레시피)를 받는 곳과 LGPL 전문은 고지 파일 1절에 있어요.',
    noticePath: 'public/licenses/pyodide-wheels-3rd-party.txt',
  },
  {
    id: 'pagefind-gpl',
    title: '사이트 검색 엔진(GPL-3.0 크레이트 포함)',
    text:
      '사이트 검색의 WebAssembly 파일(pagefind/wasm.unknown.pagefind)에는 GPL-3.0-only인 pagefind_microjson 0.1.4가 함께 들어 있어, 이 파일은 GPL-3.0 조건으로 받는 프로그램이에요. ' +
      '사이트는 Pagefind가 만든 파일을 고치지 않고 나눠요. GPL-3.0 전문과 대응 소스(Pagefind v1.5.2 소스와 크레이트)를 받는 곳은 고지 파일에 있어요.',
    noticePath: 'public/licenses/pagefind-wasm-3rd-party.txt',
  },
  {
    id: 'ijg',
    title: 'IJG libjpeg(OpenCV·Pillow 휠 안의 JPEG 코덱)',
    text: 'IJG 라이선스는 실행 파일을 나눌 때 문서에 아래 문장을 적으라고 해요.',
    statement: 'This software is based in part on the work of the Independent JPEG Group.',
    noticePath: 'public/licenses/pyodide-wheels-3rd-party.txt',
  },
  {
    id: 'freetype',
    title: 'FreeType(Pillow 휠 안의 글꼴 엔진)',
    text: 'FreeType License(FTL)가 문서에 넣으라고 한 크레디트예요(FreeType 2.13.3).',
    statement: 'Portions of this software are copyright © 2024 The FreeType Project (www.freetype.org). All rights reserved.',
    noticePath: 'public/licenses/pyodide-wheels-3rd-party.txt',
  },
  {
    id: 'eigen-mpl',
    title: 'Eigen(MPL-2.0) — 손, 얼굴, 자세 인식 엔진 안',
    text: 'MediaPipe WebAssembly에 들어 있는 Eigen의 소스는 https://gitlab.com/libeigen/eigen 에서 받을 수 있어요(MPL-2.0 3.2조).',
    noticePath: 'public/licenses/mediapipe-wasm-3rd-party.txt',
  },
  {
    id: 'firmware',
    title: 'ESP32 펌웨어(MicroPython v1.29.0) 안의 구성요소',
    text: '보드에 굽는 공식 펌웨어에는 ESP-IDF·Newlib·FreeRTOS·lwIP·Mbed TLS·NimBLE 등이 함께 들어 있어요. 구성요소마다의 저작권 표기와 라이선스 원문은 고지 파일에 있어요.',
    noticePath: 'public/licenses/micropython-esp32-firmware.txt',
  },
]);

/**
 * 사이트 주소로 열 수 있는 고지 전문 파일인지(public/ 아래 파일 하나 — 경로 패턴이 아닌 것):
 * public/licenses/ 아래 파일이거나 이름이 NOTICE·LICENSE·COPYING으로 시작하는 파일.
 */
export function isNoticeFilePath(filePath: string): boolean {
  if (!filePath.startsWith('public/') || /[*?]/u.test(filePath)) {
    return false;
  }
  return filePath.startsWith('public/licenses/') || /(?:^|\/)(?:NOTICE|LICEN[CS]E|COPYING)[^/]*$/iu.test(filePath);
}

/** public/ 아래 파일의 사이트 주소(base 포함). public/ 밖이면 undefined */
export function publicFileHref(filePath: string): string | undefined {
  return filePath.startsWith('public/') ? withBase(filePath.slice('public/'.length)) : undefined;
}

/** 항목의 고지 전문 파일(대표 notice가 먼저, 그다음 paths에 적힌 고지 파일 — 겹치면 한 번만) */
export function noticeFilesOf(entry: SourceEntry): string[] {
  const files: string[] = [];
  for (const candidate of [entry.notice, ...entry.paths]) {
    if (candidate && isNoticeFilePath(candidate) && !files.includes(candidate)) {
      files.push(candidate);
    }
  }
  return files;
}

export interface LicenseGroup {
  /** sources.yaml의 license 값 */
  license: string;
  /** 라이선스 전문 주소(확인된 것만) */
  licenseUrl: string | undefined;
  /** 이 라이선스의 항목(분류 → 이름 순) */
  entries: SourceEntry[];
  /** 사이트 라이선스가 적용되는 항목(운영자·자체 제작)이 들어 있는지 */
  siteLicensed: boolean;
}

export interface CreditsView {
  thirdParty: SourceEntry[];
  licenseGroups: LicenseGroup[];
  entryCount: number;
  /** 고지 전문 파일 모음(경로 순) — 오프라인판 zip에도 같은 파일이 들어간다 */
  noticeFiles: NoticeFileView[];
}

/**
 * 라이선스 이름 → 전문 주소. 주소가 열리는지 확인한 것만 적는다(2026-09-15, MPL-2.0·PSF-2.0은 2026-09-16, MIT-CMU·LGPL-2.1-or-later는 2026-09-16 P2-14).
 * 여러 라이선스를 AND로 묶은 항목(2026-09-26 P6-04의 "…에 함께 든 라이브러리")은 주소 하나로 가리킬 수 없어 적지 않는다 — 고지 파일을 본다.
 */
const LICENSE_URLS: Readonly<Partial<Record<string, string>>> = {
  MIT: siteConfig.license.software.url,
  'CC BY-NC-SA 4.0': siteConfig.license.content.url,
  'Apache-2.0': 'https://spdx.org/licenses/Apache-2.0.html',
  'OFL-1.1': 'https://spdx.org/licenses/OFL-1.1.html',
  ISC: 'https://spdx.org/licenses/ISC.html',
  'MPL-2.0': 'https://spdx.org/licenses/MPL-2.0.html',
  'PSF-2.0': 'https://spdx.org/licenses/PSF-2.0.html',
  'MIT-CMU': 'https://spdx.org/licenses/MIT-CMU.html',
  'LGPL-2.1-or-later': 'https://spdx.org/licenses/LGPL-2.1-or-later.html',
};

/** 분류의 화면 이름 */
export function categoryLabel(category: string): string {
  return (CATEGORY_LABELS as Readonly<Record<string, string>>)[category] ?? category;
}

/** 사이트 라이선스에서 빠지는 분류인지(PD-26) */
export function isExcluded(entry: SourceEntry): boolean {
  return isExcludedFromSiteLicense(entry.category);
}

function categoryRank(category: string): number {
  const index = CATEGORIES.indexOf(category);
  return index < 0 ? CATEGORIES.length : index;
}

function compareEntries(a: SourceEntry, b: SourceEntry): number {
  return categoryRank(a.category) - categoryRank(b.category) || a.name.localeCompare(b.name, 'ko');
}

/** "2026-09-15" → "2026년 9월 15일" */
export function formatKoreanDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return `${year}년 ${month}월 ${day}일`;
}

/**
 * sources.yaml 내용으로 출처 페이지 데이터를 만든다. 등록부에 오류가 있으면 빌드를 멈추도록 예외를 던진다.
 */
export function buildCreditsView(registryText: string): CreditsView {
  const { entries, errors } = parseRegistry(registryText);
  if (errors.length > 0) {
    throw new Error(
      `${REGISTRY_FILE} 형식 오류로 출처 페이지를 만들 수 없어요.\n${errors.map((error) => `- ${error}`).join('\n')}`,
    );
  }

  const entriesByLicense = new Map<string, SourceEntry[]>();
  for (const entry of entries) {
    entriesByLicense.set(entry.license, [...(entriesByLicense.get(entry.license) ?? []), entry]);
  }

  const licenseGroups: LicenseGroup[] = [...entriesByLicense.entries()]
    .map(([license, groupEntries]) => ({
      license,
      licenseUrl: LICENSE_URLS[license],
      entries: [...groupEntries].sort(compareEntries),
      siteLicensed: groupEntries.some((entry) => !isExcluded(entry)),
    }))
    .sort(
      (a, b) =>
        Number(b.siteLicensed) - Number(a.siteLicensed) ||
        categoryRank(a.entries[0].category) - categoryRank(b.entries[0].category) ||
        a.license.localeCompare(b.license, 'ko'),
    );

  const thirdParty = entries
    .filter((entry) => entry.category === 'third_party')
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));

  const noticeEntries = new Map<string, string[]>();
  for (const entry of entries) {
    for (const file of noticeFilesOf(entry)) {
      noticeEntries.set(file, [...(noticeEntries.get(file) ?? []), entry.name]);
    }
  }
  const noticeFiles: NoticeFileView[] = [...noticeEntries.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'en'))
    .map(([file, names]) => ({ path: file, href: publicFileHref(file) ?? '', entries: names }));

  return { thirdParty, licenseGroups, entryCount: entries.length, noticeFiles };
}
