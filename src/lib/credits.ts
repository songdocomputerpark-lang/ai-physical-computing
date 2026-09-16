/**
 * 출처와 라이선스 페이지의 데이터(PLAN §8.1 P1-04 ④, §9.2 "출처 페이지").
 * sources.yaml을 읽어 라이선스별로 묶고, 제3자 권리 표기 자료를 따로 뽑는다.
 * 등록부 검사 규칙은 빌드 전 검사(scripts/check-sources.mjs)와 같은 모듈을 쓴다.
 */
import { siteConfig } from '../config/site.ts';
import {
  CATEGORIES,
  CATEGORY_LABELS,
  REGISTRY_FILE,
  isExcludedFromSiteLicense,
  parseRegistry,
  type SourceEntry,
} from '../../scripts/lib/sources-registry.mjs';

export type { SourceEntry };

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
}

/** 라이선스 이름 → 전문 주소. 주소가 열리는지 확인한 것만 적는다(2026-09-15, MPL-2.0·PSF-2.0은 2026-09-16). */
const LICENSE_URLS: Readonly<Partial<Record<string, string>>> = {
  MIT: siteConfig.license.software.url,
  'CC BY-NC-SA 4.0': siteConfig.license.content.url,
  'Apache-2.0': 'https://spdx.org/licenses/Apache-2.0.html',
  'OFL-1.1': 'https://spdx.org/licenses/OFL-1.1.html',
  ISC: 'https://spdx.org/licenses/ISC.html',
  'MPL-2.0': 'https://spdx.org/licenses/MPL-2.0.html',
  'PSF-2.0': 'https://spdx.org/licenses/PSF-2.0.html',
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

  return { thirdParty, licenseGroups, entryCount: entries.length };
}
