import { describe, expect, it } from 'vitest';
import {
  findPageByPath,
  flattenPages,
  getLearnUnit,
  getPage,
  headerNav,
  isCurrentPage,
  isInSection,
  learnUnits,
  navTrail,
  siteMap,
} from '../../src/config/nav.ts';

/** PLAN §2.1 사이트 지도의 주소(대단원 제외) */
const PLAN_PATHS = [
  '/',
  '/start/',
  '/start/student/',
  '/start/board/',
  '/start/teacher/',
  '/start/check/',
  '/learn/',
  '/labs/',
  '/labs/vision/',
  '/labs/esp32/',
  '/labs/esp32/check/',
  '/labs/iot/',
  '/labs/gallery/',
  '/teacher/',
  '/help/',
  '/help/errors/',
  '/glossary/',
  '/settings/',
  '/credits/',
  '/search/',
  '/contribute/',
];

describe('사이트 지도(src/config/nav.ts)', () => {
  it('PLAN §2.1의 주소가 빠짐없이 한 번씩 있다', () => {
    expect(flattenPages().map((page) => page.path).sort()).toEqual([...PLAN_PATHS].sort());
    expect(siteMap[0].id).toBe('home');
  });

  it('머리글 주 메뉴는 여섯 곳이고 순서가 정해져 있다', () => {
    expect(headerNav.map((page) => page.label)).toEqual(['시작하기', '배우기', '실습실', '교사용 자료실', '문제 해결', '용어사전']);
  });

  it('시작하기 아래에 학생용·보드 준비·교사용·점검이 있다', () => {
    expect(getPage('start').children.map((page) => page.label)).toEqual(['학생용', '보드 준비', '교사용', '점검']);
    expect(getPage('labs').children.map((page) => page.label)).toEqual([
      '영상처리 실습실',
      'ESP32 실습실',
      '통신 실습실',
      '예제 갤러리',
    ]);
  });

  it('모든 링크(href)는 base가 붙고 /로 끝나며, 설명과 제목이 있다', () => {
    for (const page of [...flattenPages(), ...learnUnits]) {
      expect(page.href).toBe(`/ai-physical-computing${page.path}`);
      expect(page.href.endsWith('/')).toBe(true);
      expect(page.title.length).toBeGreaterThan(0);
      expect(page.description.length).toBeGreaterThan(0);
    }
  });

  it('대단원은 I~IV 네 개이고 번호로 찾을 수 있다', () => {
    expect(learnUnits.map((unit) => [unit.unit, unit.numeral, unit.path])).toEqual([
      [1, 'I', '/learn/u1/'],
      [2, 'II', '/learn/u2/'],
      [3, 'III', '/learn/u3/'],
      [4, 'IV', '/learn/u4/'],
    ]);
    expect(getLearnUnit(3).label).toBe('III. 인공지능과 피지컬 컴퓨팅');
    expect(() => getLearnUnit(5)).toThrow(/대단원 번호 5/u);
  });

  it('현재 위치: base가 붙은 주소로도 홈에서부터 길을 찾는다', () => {
    expect(navTrail('/ai-physical-computing/start/student/').map((page) => page.label)).toEqual(['홈', '시작하기', '학생용']);
    expect(navTrail('/ai-physical-computing/').map((page) => page.id)).toEqual(['home']);
    expect(navTrail('/ai-physical-computing/labs/esp32/check/').map((page) => page.id)).toEqual([
      'home',
      'labs',
      'labs-esp32',
      'labs-esp32-check',
    ]);
  });

  it('사이트 지도에 없는 차시 주소는 가장 가까운 대단원까지 찾는다', () => {
    expect(navTrail('/ai-physical-computing/learn/u1/1-2-1/').map((page) => page.id)).toEqual(['home', 'learn', 'learn-u1']);
    expect(navTrail('/ai-physical-computing/없는-곳/').map((page) => page.id)).toEqual(['home']);
  });

  it('지금 페이지와 섹션을 구분한다', () => {
    const start = getPage('start');
    expect(isCurrentPage(start, '/ai-physical-computing/start/')).toBe(true);
    expect(isInSection(start, '/ai-physical-computing/start/')).toBe(false);
    expect(isInSection(start, '/ai-physical-computing/start/board/')).toBe(true);
    expect(isInSection(getPage('home'), '/ai-physical-computing/start/')).toBe(false);
    expect(findPageByPath('/ai-physical-computing/learn/u2/')?.id).toBe('learn-u2');
  });

  it('없는 id를 찾으면 오류를 낸다', () => {
    expect(() => getPage('nowhere')).toThrow(/id "nowhere"/u);
  });
});
