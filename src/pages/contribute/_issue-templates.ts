/**
 * GitHub 이슈 양식 목록(PLAN §8.1 P1-10, §8.6 P6-06). 기여·문의 페이지와 브라우저 테스트(tests/e2e/pages.spec.ts)가 함께 쓴다.
 * 파일 이름은 .github/ISSUE_TEMPLATE/ 안의 양식 파일 이름과 같아야 한다(테스트가 파일이 있는지, 양식의 name이 같은지 확인한다).
 * 파일 이름이 _로 시작해서 Astro가 페이지(주소)로 만들지 않는다.
 *
 * 차례: 이 목록의 차례가 기여·문의 페이지의 차례이고, 파일 이름 앞 숫자(1-…·2-…)가 GitHub "양식 고르기" 화면의 차례다
 * (GitHub 문서: 양식은 파일 이름의 글자·숫자 순서로 보인다 — 2026-09-26 확인). 둘을 같은 차례로 둔다.
 * 2026-09-26(P6-06): 양식을 네 가지로 나눴다 — 실습실·사이트 오류(옛 bug.yml), 차시 내용 오류(새로),
 * 새 예제·자료 제안(옛 material-request.yml), 개인정보·저작권 제보(옛 content-report.yml에서 내용 오류를 뺀 것).
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
    file: '1-lab-error.yml',
    name: '실습실·사이트 오류 알리기',
    when: '실습실이 열리지 않거나, [실행]·보드 연결·버튼이 생각대로 움직이지 않을 때',
  },
  {
    file: '2-lesson-error.yml',
    name: '차시 내용 오류 알리기',
    when: '차시의 설명·그림·예제 코드·퀴즈가 틀렸거나 이해하기 어려울 때',
  },
  {
    file: '3-example-proposal.yml',
    name: '새 예제·자료 제안하기',
    when: '이런 실습 예제나 수업 자료가 있으면 좋겠을 때, 직접 만든 예제를 보내고 싶을 때',
  },
  {
    file: '4-privacy-copyright.yml',
    name: '개인정보·저작권 제보',
    when: '개인정보가 보이거나 저작권 문제가 있어 보이는 자료를 발견했을 때(내용은 옮겨 적지 말고 위치만)',
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
