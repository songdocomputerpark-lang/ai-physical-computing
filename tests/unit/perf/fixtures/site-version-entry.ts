// tests/unit/perf/site-version.test.ts가 Vite로 묶어 보는 작은 입구(판 1.1.0 — PROGRESS 미해결 202).
// 모든 쪽이 받는 공용 청크(src/lib/url.ts → src/config/site.ts)와 같게 siteConfig를 불러 판·base를 쓴다.
import { siteConfig } from '../../../../src/config/site.ts';

export const version = siteConfig.version;
export const base = siteConfig.base;
export const issuesUrl = siteConfig.issuesUrl;
