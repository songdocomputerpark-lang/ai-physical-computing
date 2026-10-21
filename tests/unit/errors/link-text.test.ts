// 오류 사전 글 속 사이트 링크 `[글자](/주소/)`(판 1.6.0 C176 — src/lab/errors/link-text.ts)와, 보드 오류 카드가 실제로 링크를 가졌는지 본다.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCatalogFromYaml } from '../../../src/lab/errors/catalog-build.ts';
import { brokenLinkProblems, hasLinkText, plainLinkText, splitLinkText } from '../../../src/lab/errors/link-text.ts';

describe('splitLinkText', () => {
  it('링크가 없으면 글 전체가 한 조각', () => {
    expect(splitLinkText('보드를 꽂고 [보드 연결]을 눌러요.')).toEqual([{ text: '보드를 꽂고 [보드 연결]을 눌러요.' }]);
  });

  it('[글자](/주소/)는 링크 조각이 되고 앞뒤 글은 그대로 남는다(버튼 이름 [보드 연결]은 링크가 아니다)', () => {
    expect(splitLinkText('선택 창에 보드가 없으면 [보드 준비 페이지](/start/board/#port-not-found)의 안내를 따라 해요. [다시 확인]도 눌러요.')).toEqual([
      { text: '선택 창에 보드가 없으면 ' },
      { text: '보드 준비 페이지', href: '/start/board/#port-not-found' },
      { text: '의 안내를 따라 해요. [다시 확인]도 눌러요.' },
    ]);
  });

  it('링크가 여럿이어도, 글머리에 와도, 글 끝에 와도 조각이 빠지거나 겹치지 않는다', () => {
    const pieces = splitLinkText('[하나](/a/)와 [둘](/b/#c)');
    expect(pieces).toEqual([{ text: '하나', href: '/a/' }, { text: '와 ' }, { text: '둘', href: '/b/#c' }]);
    expect(pieces.map((piece) => piece.text).join('')).toBe('하나와 둘');
  });

  it('plainLinkText는 링크를 보이는 글만 남기고, hasLinkText는 링크 모양이 있는지만 본다', () => {
    expect(plainLinkText('[보드 준비하기](/start/board/)를 해요')).toBe('보드 준비하기를 해요');
    expect(hasLinkText('[보드 준비하기](/start/board/)')).toBe(true);
    expect(hasLinkText('[보드 연결]을 눌러요')).toBe(false);
  });
});

describe('brokenLinkProblems — 사이트 안 주소만 링크로 쓴다', () => {
  it('맞는 링크와 버튼 이름 대괄호는 문제가 없다', () => {
    expect(brokenLinkProblems('[보드 준비하기](/start/board/)에서 [보드 연결]을 눌러요.')).toEqual([]);
  });

  it('사이트 밖 주소·//로 시작하는 주소·/로 시작하지 않는 주소는 문제로 알린다', () => {
    expect(brokenLinkProblems('[밖](https://example.com/)')).toHaveLength(1);
    expect(brokenLinkProblems('[밖](//example.com/)')).toHaveLength(1);
    expect(brokenLinkProblems('[상대](start/board/)')).toHaveLength(1);
  });
});

describe('오류 사전 데이터 — 보드 오류 카드의 안내가 링크다(걷기 보고 walk-student-board 2)', () => {
  const catalog = loadCatalogFromYaml(fs.readFileSync(path.join(process.cwd(), 'content/help/errors/errors.yaml'), 'utf8'));
  const entry = (id: string) => catalog.entries.find((item) => item.id === id)!;

  it('"실제 보드가 연결되지 않았어요" 풀이는 보드 준비 페이지 링크를 가진다', () => {
    const links = entry('board-real-not-connected').fix.flatMap((line) => splitLinkText(line)).filter((piece) => piece.href !== undefined);
    expect(links.map((piece) => piece.href)).toEqual(expect.arrayContaining(['/start/board/#port-not-found', '/start/board/']));
  });

  it('"MicroPython을 찾지 못했어요" 풀이는 펌웨어 굽기 자리 링크를 가진다', () => {
    const hrefs = entry('board-real-no-micropython')
      .fix.flatMap((line) => splitLinkText(line))
      .map((piece) => piece.href);
    expect(hrefs).toContain('/start/board/#firmware');
  });

  it('데이터 전체에서 링크는 모두 사이트 안 주소다(깨진 모양 0)', () => {
    for (const item of catalog.entries) {
      for (const line of [item.title, item.meaning, ...item.why, ...item.fix, ...item.mistakes]) {
        expect(brokenLinkProblems(line), `${item.id}: ${line}`).toEqual([]);
      }
    }
  });
});
