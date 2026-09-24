/**
 * 한 문서에 실습실 틀(LabShell)이 둘 있을 때 생기는 **같은 id**를 푸는 도구(4단원 통합 화면 전용).
 *
 * 왜: 영상처리·ESP32 두 실습실에 함께 붙는 흉내 모듈(준비 패널 loading, [보내기] 패널 vision-bridge, 블루투스 칸 web-bluetooth,
 * 데이터 포트 data-port)의 panel.astro가 고정 id를 쓴다(예: `lab-bridge-channel`, `lab-loading-title`). 실습실이 하나인
 * 페이지에서는 문제가 없지만 이 화면에서는 같은 id가 두 번 나와, 두 번째 칸의 `<label for>`·`aria-labelledby`가 첫 번째 칸을
 * 가리킨다(화면 낭독기가 엉뚱한 이름을 읽고, 이름표를 눌러도 다른 칸으로 초점이 간다 — 2026-09-24 이 화면에서 12개 확인).
 * 공유 파일(패널)은 이 구역이 고칠 수 없어 **이 화면에서만** 두 번째 실습실 안의 겹친 id에 꼬리표를 붙이고, 그 안의 참조도 함께 바꾼다.
 * 근본 수정(패널이 실습실마다 다른 id를 쓰게)은 통합 단계에 요청했다(`.cache/phase4-requests/unit4.md`).
 *
 * 스크립트는 이 id들을 찾지 않는다(모듈은 data-* 표시로 요소를 찾는다 — 2026-09-24 저장소 전체 검색으로 확인). 그래서 이름만 바꿔도 동작은 같다.
 */

/** id를 가리키는 속성(공백으로 여러 id를 적을 수 있다) */
export const ID_REFERENCE_ATTRIBUTES: readonly string[] = Object.freeze([
  'for',
  'aria-labelledby',
  'aria-describedby',
  'aria-controls',
  'aria-owns',
  'aria-details',
  'aria-errormessage',
  'aria-activedescendant',
  'aria-flowto',
  'list',
  'form',
  'headers',
]);

/**
 * scope 안의 요소 가운데 scope 밖에도 같은 id가 있는 것에 `--<suffix>`를 붙이고, scope 안의 참조를 함께 고친다.
 * 이미 풀려 있으면 아무것도 하지 않는다(여러 번 불러도 된다). 바꾼 [옛 id, 새 id] 목록을 돌려준다.
 */
export function dedupeIdsWithin(scope: HTMLElement, suffix: string, doc: Document = scope.ownerDocument): [string, string][] {
  const outside = new Set<string>();
  for (const element of doc.querySelectorAll<HTMLElement>('[id]')) {
    if (!scope.contains(element) && element.id !== '') {
      outside.add(element.id);
    }
  }
  const taken = new Set<string>();
  for (const element of doc.querySelectorAll<HTMLElement>('[id]')) {
    taken.add(element.id);
  }
  const renamed = new Map<string, string>();
  const inside = [...scope.querySelectorAll<HTMLElement>('[id]')];
  if (scope.id !== '') {
    inside.unshift(scope);
  }
  for (const element of inside) {
    const id = element.id;
    if (!outside.has(id) || renamed.has(id)) {
      continue;
    }
    let next = `${id}--${suffix}`;
    let counter = 2;
    while (taken.has(next)) {
      next = `${id}--${suffix}-${counter}`;
      counter += 1;
    }
    taken.add(next);
    renamed.set(id, next);
    element.id = next;
  }
  if (renamed.size === 0) {
    return [];
  }
  const selector = ID_REFERENCE_ATTRIBUTES.map((name) => `[${name}]`).join(',');
  const referrers = [...scope.querySelectorAll<HTMLElement>(selector)];
  if (scope.matches(selector)) {
    referrers.unshift(scope);
  }
  for (const element of referrers) {
    for (const name of ID_REFERENCE_ATTRIBUTES) {
      const value = element.getAttribute(name);
      if (value === null || value.trim() === '') {
        continue;
      }
      const tokens = value.split(/\s+/u).filter((token) => token !== '');
      let changed = false;
      const next = tokens.map((token) => {
        const replacement = renamed.get(token);
        if (replacement) {
          changed = true;
          return replacement;
        }
        return token;
      });
      if (changed) {
        element.setAttribute(name, next.join(' '));
      }
    }
  }
  return [...renamed.entries()];
}

/** 문서 안에서 두 번 이상 나오는 id 목록(시험·점검용) */
export function duplicateIds(doc: Document): string[] {
  const seen = new Map<string, number>();
  for (const element of doc.querySelectorAll<HTMLElement>('[id]')) {
    seen.set(element.id, (seen.get(element.id) ?? 0) + 1);
  }
  return [...seen.entries()].filter(([, count]) => count > 1).map(([id]) => id);
}
