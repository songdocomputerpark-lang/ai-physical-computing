/**
 * GitHub 이슈 양식 목록(PLAN §8.1 P1-10). 기여·문의 페이지와 브라우저 테스트(tests/e2e/pages.spec.ts)가 함께 쓴다.
 * 파일 이름은 .github/ISSUE_TEMPLATE/ 안의 양식 파일 이름과 같아야 한다(테스트가 파일이 있는지 확인한다).
 * 파일 이름이 _로 시작해서 Astro가 페이지(주소)로 만들지 않는다.
 *
 * 링크 모양은 GitHub 공식 문서 "Creating an issue"의 URL 쿼리(template=파일 이름)를 따른다(2026-09-16 확인).
 * 양식은 저장소 기본 브랜치(main)에 올라간 뒤에 GitHub 화면에 보인다.
 */
import { siteConfig } from '../../config/site.ts';

export interface IssueTemplateLink {
  /** .github/ISSUE_TEMPLATE/ 안의 파일 이름 */
  readonly file: string;
  /** 화면에 보이는 양식 이름(양식 파일의 name과 같게) */
  readonly name: string;
  /** 이럴 때 쓰세요(한 줄) */
  readonly when: string;
}

export const ISSUE_TEMPLATE_DIR = '.github/ISSUE_TEMPLATE';

export const ISSUE_TEMPLATES: readonly IssueTemplateLink[] = Object.freeze([
  {
    file: 'bug.yml',
    name: '사이트 문제 알리기',
    when: '페이지가 열리지 않거나, 버튼·실습실이 제대로 동작하지 않을 때',
  },
  {
    file: 'material-request.yml',
    name: '자료 요청하기',
    when: '이런 예제·설명·수업 자료가 있으면 좋겠을 때',
  },
  {
    file: 'content-report.yml',
    name: '내용 오류·개인정보·저작권 제보',
    when: '글·그림·코드가 틀렸거나, 개인정보나 저작권 문제가 보일 때',
  },
]);

/** 양식을 고르는 GitHub 화면 */
export const issueChooserUrl = `${siteConfig.issuesUrl}/new/choose`;

/** 양식 하나로 바로 가는 GitHub 주소 */
export function issueTemplateUrl(template: IssueTemplateLink): string {
  return `${siteConfig.issuesUrl}/new?template=${encodeURIComponent(template.file)}`;
}

/** 저장소 기본 브랜치(main)의 파일 주소. 예: repositoryFileUrl('LICENSE') */
export function repositoryFileUrl(path: string): string {
  return `${siteConfig.repositoryUrl}/blob/main/${path}`;
}
