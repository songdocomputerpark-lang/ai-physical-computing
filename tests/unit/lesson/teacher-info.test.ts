// 교사용 접기 끝의 "이 차시의 원고와 자료"(src/components/lesson/teacher-info.ts, PLAN §8.5 P5-02·§2.3, PD-31, C8)
import { describe, expect, it } from 'vitest';
import { firstHandoutPage, handoutPath, HANDOUT_DOCS } from '../../../src/components/lesson/handouts.ts';
import { NO_MANUSCRIPT_TEXT, STANDARDS_LABEL, UNMAPPED_STANDARDS_LINK, buildTeacherInfo } from '../../../src/components/lesson/teacher-info.ts';
import { CURRICULUM_SOURCE } from '../../../src/config/standards.ts';

const none = () => false;

describe('이 차시의 원고와 자료(buildTeacherInfo)', () => {
  it('원고만 있는 차시: 원고 쪽을 옮겼다는 줄, 성취기준 코드·영역·사이트 요약, 원문 링크', () => {
    const info = buildTeacherInfo({
      data: { kind: 'textbook', pages: '008~012', standards: ['12인피01-01'], handouts: [] },
      source: 'manuscript',
      handoutExists: none,
    });
    expect(info.source).toBe('교과서 원고(008~012쪽)의 글, 그림, 표를 차시 틀에 맞게 옮기고 고1 눈높이로 다듬었어요.');
    expect(info.noManuscript).toBe(false);
    expect(info.standards).toEqual([{ code: '12인피01-01', area: '인공지능 영상인식', summary: '영상인식 기술의 종류와 원리, 개발 환경 구성' }]);
    expect(info.standardsPending).toBeUndefined();
    expect(info.curriculumLink.href).toBe(CURRICULUM_SOURCE.url);
    expect(STANDARDS_LABEL).toBe('성취기준(인천광역시교육청 승인 교육과정, 차시 연결은 사이트가 붙임)');
  });

  it('코드만 있는 차시: PLAN §2.3 문구 "원고 없음: 사이트가 코드 기준으로 쓴 본문"을 그대로 보인다', () => {
    const info = buildTeacherInfo({
      data: { kind: 'textbook', unit: 1, pages: '파일명 p55·p58', standards: ['12인피01-03'], handouts: [] },
      source: 'code-only',
      handoutExists: none,
    });
    expect(info.noManuscript).toBe(true);
    expect(info.source?.startsWith(NO_MANUSCRIPT_TEXT)).toBe(true);
    expect(info.source).toContain('(파일명 p55·p58)');
    // I단원은 대단원 마무리 문항을 근거로 썼고, 수업 교안 쪽(handouts)을 적지 않았으면 교안은 말하지 않는다
    expect(info.source).toContain('예제 코드와 주석(파일명 p55·p58), 대단원 마무리 문항을 바탕으로');
    expect(info.source).not.toContain('수업 교안');
    // 원고가 없으니 "원고 내용은 이 페이지에 옮겼고"를 붙이지 않는다
    expect(info.originals).not.toContain('원고 내용은 이 페이지에 옮겼고');
  });

  it('코드만 있는 IV단원 차시: 교안 쪽을 적었으면 수업 교안을 근거로 말하고, 대단원 마무리 문항은 말하지 않는다', () => {
    const info = buildTeacherInfo({
      data: { kind: 'textbook', unit: 4, pages: '파일명 p251', standards: ['12인피04-01'], handouts: [{ doc: 'bt', pages: '70~77' }] },
      source: 'code-only',
      handoutExists: none,
    });
    expect(info.source).toContain('예제 코드와 주석(파일명 p251), 수업 교안을 바탕으로');
    expect(info.source).not.toContain('대단원 마무리 문항');
  });

  it('대응표에서 일부러 비운 차시(보충 V1)는 "해당 없음(보충 차시)"과 까닭 모음 링크를 보인다', () => {
    const info = buildTeacherInfo({
      data: { kind: 'supplement', label: 'V1', pages: undefined, standards: [], handouts: [] },
      source: 'supplement',
      handoutExists: none,
    });
    expect(info.source).toContain('보충 차시');
    expect(info.standards).toEqual([]);
    expect(info.standardsPending).toBeUndefined();
    expect(info.standardsNone?.text).toContain('해당 없음(보충 차시)');
    expect(info.standardsNone?.text).toContain('이 차시는 보충 차시라서');
    expect(info.standardsNone?.link).toEqual(UNMAPPED_STANDARDS_LINK);
  });

  it('대응표에 없는 새 차시가 성취기준을 비우면 C8 문구(성취기준 코드 확인 중)로 알린다', () => {
    const info = buildTeacherInfo({
      data: { kind: 'supplement', label: 'V9', pages: undefined, standards: [], handouts: [] },
      source: 'supplement',
      handoutExists: none,
    });
    expect(info.standardsNone).toBeUndefined();
    expect(info.standardsPending).toContain('성취기준 코드 확인 중');
  });

  it('사이트가 새로 쓴 읽기 자료(IV단원 프로젝트 안내)는 읽기 자료라고 알린다', () => {
    const info = buildTeacherInfo({
      data: { kind: 'reading', label: 'IV-프로젝트', pages: undefined, standards: ['12인피04-02'], handouts: [] },
      source: 'supplement',
      handoutExists: none,
    });
    expect(info.source).toContain('사이트가 새로 쓴 읽기 자료');
    expect(info.source).not.toContain('보충 차시');
  });

  it('원본은 올리지 않는다는 안내(원본 내려받기 없음)와 예제 받는 곳 링크가 늘 있다(PD-31)', () => {
    const info = buildTeacherInfo({ data: { kind: 'textbook', pages: '1', standards: [], handouts: [] }, source: 'manuscript-code', handoutExists: none });
    expect(info.originals).toContain('원본 내려받기는 없어요');
    expect(info.originals).toContain('원고 내용은 이 페이지에 옮겼고');
    expect(info.originalsLinks.map((link) => link.href)).toEqual(['/labs/gallery/', '/teacher/', '/teacher/corrections/', '/teacher/real-pc/']);
  });

  it('가린 편집본 교안: 파일이 있으면 그 쪽으로 가는 링크, 없으면 링크 없이(준비 중)', () => {
    const data = { kind: 'textbook' as const, pages: '117~123', standards: ['12인피02-01'], handouts: [{ doc: 'bt' as const, pages: '41~47', note: 'LED 깜빡이기' }] };
    const pending = buildTeacherInfo({ data, source: 'manuscript-code', handoutExists: none });
    expect(pending.handouts).toEqual([{ doc: 'bt', title: HANDOUT_DOCS.bt.title, pages: '41~47', note: 'LED 깜빡이기', href: undefined }]);
    const ready = buildTeacherInfo({ data, source: 'manuscript-code', handoutExists: (doc) => doc === 'bt' });
    expect(ready.handouts[0]?.href).toBe(`/${HANDOUT_DOCS.bt.file}#page=41`);
  });

  it('편집본 쪽 글자에서 첫 쪽을 찾는다', () => {
    expect(firstHandoutPage('41~47')).toBe(41);
    expect(firstHandoutPage('20·26')).toBe(20);
    expect(handoutPath('ppt', '14')).toBe(`/${HANDOUT_DOCS.ppt.file}#page=14`);
  });
});
