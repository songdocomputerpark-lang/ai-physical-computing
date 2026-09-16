// 가상 데스크톱(pyautogui 흉내, P2-11)의 순수 논리 검사 — 좌표 변환·키 이름·창·메모장·그림판·대화상자.
// 파이썬 쪽(걸음 수·PAUSE·FAILSAFE 타이밍)은 tests/unit/pyautogui/pyodide-pyautogui.test.ts가 실제 Pyodide로 검사한다.
import { describe, expect, it } from 'vitest';
import { buttonName, usesDesktop } from '../../../src/lab/modules/desktop/index.ts';
import {
  BROWSER_HOTKEYS,
  DEFAULT_SCREEN_HEIGHT,
  DEFAULT_SCREEN_WIDTH,
  DesktopModel,
  PAINT_COLORS,
  TASKBAR_HEIGHT,
  canonicalKey,
  clamp,
  keyFromBrowser,
  rectContains,
  scaleOf,
  textForKey,
} from '../../../src/lab/modules/desktop/model.ts';
import { displayRect, displayScale, logicalPoint } from '../../../src/lab/modules/desktop/render.ts';

function fresh(width = DEFAULT_SCREEN_WIDTH, height = DEFAULT_SCREEN_HEIGHT): DesktopModel {
  return new DesktopModel(width, height, { now: () => 1_700_000_000_000 });
}

describe('좌표', () => {
  it('표시 픽셀과 논리 픽셀을 오간다', () => {
    expect(displayScale(960, 1920)).toBe(0.5);
    expect(displayScale(0, 0)).toBe(1); // 아직 크기를 모를 때도 계산이 깨지지 않는다
    expect(logicalPoint(100, 50, 0.5)).toEqual({ x: 200, y: 100 });
    expect(logicalPoint(100, 50, 0)).toEqual({ x: 100, y: 50 });
    expect(displayRect({ x: 200, y: 100, width: 40, height: 20 }, 0.5)).toEqual({ x: 100, y: 50, width: 20, height: 10 });
  });

  it('화면 밖 좌표는 화면 안으로 자르고 소수는 반올림한다(진짜 운영체제와 같음)', () => {
    const model = fresh();
    expect(model.clampPoint(-40, 10_000)).toEqual({ x: 0, y: 1079 });
    expect(model.clampPoint(500.6, 499.4)).toEqual({ x: 501, y: 499 });
    expect(model.clampPoint(Number.NaN, 10)).toEqual({ x: 0, y: 10 });
    expect(clamp(5, 0, 3)).toBe(3);
    expect(rectContains({ x: 0, y: 0, width: 10, height: 10 }, 10, 5)).toBe(false);
  });

  it('해상도를 바꾸면 창·아이콘이 같은 비율로 커진다', () => {
    expect(scaleOf(3840)).toBe(2);
    const model = fresh(3840, 2160);
    const icon = model.icons[0]!;
    expect(icon.cell).toMatchObject({ x: 80, y: 80, width: 240, height: 260 });
    expect(model.cursor).toEqual({ x: 1920, y: 1080 });
  });
});

describe('키 이름', () => {
  it('pyautogui 별칭을 하나로 모은다', () => {
    expect(canonicalKey('Return')).toBe('enter');
    expect(canonicalKey('ctrlleft')).toBe('ctrl');
    expect(canonicalKey('ESC')).toBe('escape');
    expect(canonicalKey('A')).toBe('A');
    expect(textForKey('enter')).toBe('\n');
    expect(textForKey('space')).toBe(' ');
    expect(textForKey('f5')).toBeNull();
  });

  it('학생이 직접 친 키: Tab·화살표·F키는 브라우저에 넘기고 정해진 조합키만 가져온다', () => {
    expect(keyFromBrowser({ key: 'Tab' })).toBeNull();
    expect(keyFromBrowser({ key: 'ArrowLeft' })).toBeNull();
    expect(keyFromBrowser({ key: 'F5' })).toBeNull();
    expect(keyFromBrowser({ key: 'r', ctrlKey: true })).toBeNull(); // 새로고침은 브라우저 것
    expect(keyFromBrowser({ key: 'a' })).toEqual({ key: 'a', text: 'a', modifiers: [] });
    expect(keyFromBrowser({ key: 'A', shiftKey: true })).toEqual({ key: 'A', text: 'A', modifiers: [] });
    expect(keyFromBrowser({ key: 'Enter' })).toEqual({ key: 'enter', text: '\n', modifiers: [] });
    expect(keyFromBrowser({ key: ' ' })).toEqual({ key: 'space', text: ' ', modifiers: [] });
    expect(keyFromBrowser({ key: 's', ctrlKey: true })).toEqual({ key: 's', text: null, modifiers: ['ctrl'] });
    expect(keyFromBrowser({ key: 'Control', ctrlKey: true })).toEqual({ key: 'ctrl', text: null, modifiers: [] });
    expect(BROWSER_HOTKEYS).toContain('ctrl+s');
  });
});

describe('처음 상태', () => {
  it('그림판이 열려 있고 커서는 가운데, 아이콘은 네 개다(P2-12에서 웹 브라우저·미니게임이 늘었다)', () => {
    const model = fresh();
    expect(model.cursor).toEqual({ x: 960, y: 540 });
    expect(model.windows.map((window) => window.kind)).toEqual(['paint']);
    expect(model.icons.map((icon) => icon.id)).toEqual(['paint', 'notepad', 'browser', 'game']);
    expect(model.snapshot()).toMatchObject({ width: 1920, height: 1080, notepadText: '', strokeCount: 0 });
  });
});

describe('마우스', () => {
  it('아이콘을 한 번 누르면 고르고 두 번 누르면 창이 열린다(doubleClick)', () => {
    const model = fresh();
    const icon = model.icons.find((item) => item.id === 'notepad')!;
    const x = icon.cell.x + 10;
    const y = icon.cell.y + 10;
    model.click(x, y, 'left', 1);
    expect(model.selectedIcon).toBe('notepad');
    expect(model.windowOfKind('notepad')).toBeNull();
    model.click(x, y, 'left', 2);
    expect(model.windowOfKind('notepad')).not.toBeNull();
    expect(model.focusedWindow?.kind).toBe('notepad');
  });

  it('그림판 위에서 버튼을 누른 채 끌면 선이 하나 그려진다(dragTo)', () => {
    const model = fresh();
    const paint = model.windowOfKind('paint')!;
    const area = model.canvasRect(paint);
    const start = { x: Math.round(area.x + 40), y: Math.round(area.y + 40) };
    model.mouseDown(start.x, start.y, 'left');
    expect(model.dragKind).toBe('stroke');
    model.moveCursor(start.x + 50, start.y + 10);
    model.moveCursor(start.x + 100, start.y + 20);
    model.mouseUp(start.x + 100, start.y + 20, 'left');
    expect(model.strokes).toHaveLength(1);
    expect(model.strokes[0]!.points).toHaveLength(3);
    expect(model.strokes[0]!.color).toBe(PAINT_COLORS[0]!.color);
    expect(model.dragKind).toBe('none');
    expect(model.pressed).toBeNull();
  });

  it('바탕 화면에서 끌면 선택 상자만 생긴다(그림판이 없으면 선이 안 그려지는 까닭)', () => {
    const model = fresh();
    model.closeWindow(model.windowOfKind('paint')!.id);
    model.mouseDown(1700, 900, 'left');
    expect(model.dragKind).toBe('select');
    model.moveCursor(1800, 960);
    expect(model.selection).toMatchObject({ x: 1700, y: 900, width: 100, height: 60 });
    model.mouseUp(1800, 960, 'left');
    expect(model.strokes).toHaveLength(0);
    expect(model.selection).toBeNull();
  });

  it('창 제목 줄을 끌면 창이 옮겨지고 ×를 누르면 닫힌다', () => {
    const model = fresh();
    const paint = model.windowOfKind('paint')!;
    const before = { ...paint.rect };
    model.mouseDown(before.x + 100, before.y + 10, 'left');
    expect(model.dragKind).toBe('window');
    model.moveCursor(before.x + 160, before.y + 40);
    model.mouseUp(before.x + 160, before.y + 40, 'left');
    expect(paint.rect.x).toBe(before.x + 60);
    expect(paint.rect.y).toBe(before.y + 30);
    const closeX = paint.rect.x + paint.rect.width - 20;
    model.click(closeX, paint.rect.y + 10, 'left', 1);
    expect(model.windows).toHaveLength(0);
  });

  it('팔레트를 누르면 색이 바뀌고, 오른쪽 클릭은 메뉴를 연다', () => {
    const model = fresh();
    const paint = model.windowOfKind('paint')!;
    const red = model.paletteCells(paint).find((cell) => cell.id === 'red')!;
    model.click(red.rect.x + 4, red.rect.y + 4, 'left', 1);
    expect(model.paintColorId).toBe('red');
    model.click(1750, 950, 'right', 1);
    expect(model.menu?.items.map((item) => item.id)).toEqual(['new-notepad', 'new-paint', 'new-browser', 'new-game', 'clear', 'wallpaper']);
    const item = model.menuItemRects().find((entry) => entry.id === 'new-notepad')!;
    model.click(item.rect.x + 10, item.rect.y + 10, 'left', 1);
    expect(model.menu).toBeNull();
    expect(model.windowOfKind('notepad')).not.toBeNull();
  });

  it('작업 표시줄 단추로 창을 앞으로 가져온다', () => {
    const model = fresh();
    model.openWindow('notepad');
    expect(model.focusedWindow?.kind).toBe('notepad');
    const entry = model.taskbarEntries().find((item) => item.id === model.windowOfKind('paint')!.id)!;
    expect(entry.rect.y).toBeGreaterThan(model.height - TASKBAR_HEIGHT * scaleOf(model.width) - 1);
    model.click(entry.rect.x + 10, entry.rect.y + 10, 'left', 1);
    expect(model.focusedWindow?.kind).toBe('paint');
  });
});

describe('키보드·메모장', () => {
  it('글자를 치면 메모장이 없을 때 자동으로 열리고 글이 들어간다(typewrite)', () => {
    const model = fresh();
    model.key('down', 'h', 'h');
    expect(model.windowOfKind('notepad')).not.toBeNull();
    expect(model.autoOpenedNotepad).toBe(true);
    for (const char of 'i!') {
      model.key('down', char, char);
    }
    model.key('down', 'enter');
    model.key('down', 'space');
    expect(model.notepadText).toBe('hi!\n ');
    model.key('down', 'backspace');
    expect(model.notepadText).toBe('hi!\n');
    expect(model.focusedWindow?.title).toContain('메모장');
  });

  it('Ctrl+S는 저장 대화상자를 열고 확인하면 가상 파일이 생긴다', () => {
    const model = fresh();
    model.typeText('안녕');
    model.hotkey(['ctrl', 's']);
    expect(model.dialog).toMatchObject({ kind: 'save', fileName: '제목 없음.txt' });
    // 대화상자가 열려 있는 동안에는 바깥을 눌러도 창이 바뀌지 않는다(모달)
    expect(model.hitTest(10, 10).kind).toBe('dialog');
    model.key('down', 'enter');
    expect(model.dialog).toBeNull();
    expect(model.files.map((file) => ({ name: file.name, text: file.text }))).toEqual([{ name: '제목 없음.txt', text: '안녕' }]);
    expect(model.focusedWindow?.title).toBe('제목 없음.txt — 메모장');
  });

  it('조합키: Ctrl+Z는 마지막 선을 지우고, Win+R 실행 창은 이름으로 프로그램을 연다', () => {
    const model = fresh();
    const paint = model.windowOfKind('paint')!;
    const area = model.canvasRect(paint);
    model.mouseDown(area.x + 10, area.y + 10, 'left');
    model.mouseUp(area.x + 30, area.y + 30, 'left');
    expect(model.strokes).toHaveLength(1);
    model.hotkey(['ctrl', 'z']);
    expect(model.strokes).toHaveLength(0);
    model.hotkey(['win', 'r']);
    expect(model.dialog).toMatchObject({ kind: 'run' });
    for (const char of 'notepad') {
      model.key('down', char, char);
    }
    model.key('down', 'enter');
    expect(model.windowOfKind('notepad')).not.toBeNull();
  });

  it('조합키를 키 하나씩 보내도 한 번만 처리되고, 조합키를 떼는 것이 안내 글을 덮지 않는다', () => {
    const model = fresh();
    model.typeText('가');
    model.key('down', 'ctrl');
    model.key('down', 's');
    model.key('up', 's');
    model.key('up', 'ctrl');
    expect(model.dialog).toMatchObject({ kind: 'save' });
    expect(model.modifiers.size).toBe(0);
    // pyautogui.hotkey('ctrl', 's')의 마지막 이벤트는 up ctrl이다. 그것이 마지막 동작을 덮으면
    // 학생은 "ctrl 키를 뗐어요"만 보고 저장 대화상자가 왜 떴는지 모른다(브라우저 테스트 f020에서 발견).
    expect(model.lastAction).toContain('저장 대화상자');
  });

  it('메모장 창을 닫으면 저장하지 않은 글은 사라진다(가상 파일은 남는다)', () => {
    const model = fresh();
    model.typeText('사라질 글');
    model.hotkey(['ctrl', 's']);
    model.key('down', 'enter');
    model.typeText('더 쓴 글');
    model.closeWindow(model.windowOfKind('notepad')!.id);
    expect(model.notepadText).toBe('');
    expect(model.files).toHaveLength(1);
    expect(model.files[0]!.text).toBe('사라질 글');
  });
});

describe('화면 쪽 도우미(index.ts)', () => {
  it('코드에 pyautogui가 보이면 가상 모니터를 연다', () => {
    expect(usesDesktop('import pyautogui\n')).toBe(true);
    expect(usesDesktop('import time\nimport  pyautogui')).toBe(true);
    expect(usesDesktop('from pyautogui import click')).toBe(true);
    expect(usesDesktop('# import pyautogui 는 주석')).toBe(false);
    expect(usesDesktop('import cv2\n')).toBe(false);
  });

  it('브라우저 마우스 단추 번호를 이름으로 바꾼다', () => {
    expect(buttonName(0)).toBe('left');
    expect(buttonName(1)).toBe('middle');
    expect(buttonName(2)).toBe('right');
  });
});
