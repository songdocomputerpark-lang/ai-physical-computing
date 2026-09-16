// 스페이스 키 미니게임(P2-12, games.ts)의 순수 논리 검사 — 점수 규칙, 시계, 움직임 줄이기, 그리고 f121처럼
// press('space')가 연타로 들어올 때의 동작. 게임은 시계를 밖에서 받으므로 숫자를 직접 넣어 같은 결과를 확인한다.
import { describe, expect, it } from 'vitest';
import {
  BALLOON_BAND,
  DEFAULT_GAME,
  GAMES,
  GAME_COLORS,
  createGame,
  gameInfo,
  gameScoreText,
  pressGame,
  restartGame,
  stepGame,
  switchGame,
} from '../../../src/lab/modules/desktop/games.ts';
import { DesktopModel } from '../../../src/lab/modules/desktop/model.ts';

describe('게임 목록', () => {
  it('스페이스 키 하나로 노는 자체 제작 게임 3종이고 규칙이 한 줄로 적혀 있다', () => {
    expect(GAMES.map((game) => game.id)).toEqual(['balloon', 'timing', 'color']);
    for (const game of GAMES) {
      expect(game.label.length).toBeGreaterThan(1);
      expect(game.rule).toContain('스페이스');
      expect(game.rule.length).toBeLessThan(80);
    }
    expect(gameInfo(DEFAULT_GAME).id).toBe('balloon');
    expect(GAME_COLORS.length).toBeGreaterThanOrEqual(4);
  });
});

describe('풍선 띄우기', () => {
  it('가만히 두면 떨어지고, 스페이스를 누르면 올라간다', () => {
    const game = createGame('balloon', 0);
    game.y = 0.5;
    game.vy = 0;
    stepGame(game, 100);
    expect(game.y).toBeGreaterThan(0.5); // 아래로(y가 커진다)
    pressGame(game, 100);
    expect(game.vy).toBeLessThan(0);
    const fell = game.y;
    stepGame(game, 200);
    expect(game.y).toBeLessThan(fell); // 위로 올라갔다
  });

  it('띠 안에 머무는 동안 점수가 오르고 띠 밖에서는 오르지 않는다', () => {
    const game = createGame('balloon', 0);
    game.y = (BALLOON_BAND.top + BALLOON_BAND.bottom) / 2;
    game.vy = 0;
    let now = 0;
    for (let index = 0; index < 10; index += 1) {
      now += 50;
      pressGame(game, now); // 계속 눌러 띠 안에 붙잡아 둔다
      game.y = (BALLOON_BAND.top + BALLOON_BAND.bottom) / 2;
      stepGame(game, now);
    }
    expect(game.score).toBeGreaterThan(0);
    expect(game.inBand).toBe(true);
    const scored = game.score;

    game.y = 0.9; // 띠 아래로 떨어뜨린다
    for (let index = 0; index < 10; index += 1) {
      now += 50;
      game.y = 0.9;
      game.vy = 0;
      stepGame(game, now);
    }
    expect(game.score).toBe(scored);
    expect(game.inBand).toBe(false);
    expect(game.message).toContain('띠');
  });

  it('화면 위아래를 넘어가지 않는다', () => {
    const game = createGame('balloon', 0);
    for (let now = 50; now <= 5000; now += 50) {
      stepGame(game, now);
    }
    expect(game.y).toBeLessThanOrEqual(0.96);
    for (let now = 5050; now <= 9000; now += 50) {
      pressGame(game, now);
      stepGame(game, now);
    }
    expect(game.y).toBeGreaterThanOrEqual(0.04);
  });

  it('움직임 줄이기면 같은 시간에 덜 움직인다', () => {
    const normal = createGame('balloon', 0);
    const slow = createGame('balloon', 0);
    for (let now = 50; now <= 500; now += 50) {
      stepGame(normal, now);
      stepGame(slow, now, { reducedMotion: true });
    }
    expect(slow.y).toBeLessThan(normal.y);
  });
});

describe('막대 멈추기', () => {
  it('막대가 좌우로 오가고, 한가운데에 가까울수록 점수가 크다', () => {
    const game = createGame('timing', 0);
    let now = 0;
    for (let index = 0; index < 20; index += 1) {
      now += 50;
      stepGame(game, now);
    }
    expect(game.marker).toBeGreaterThan(0);
    expect(game.marker).toBeLessThanOrEqual(1);

    game.marker = 0.5;
    pressGame(game, now);
    expect(game.score).toBe(10);
    expect(game.message).toContain('한가운데');

    // 쉬는 동안(0.7초)에는 움직이지도, 점수가 오르지도 않는다
    expect(stepGame(game, now + 100)).toBe(false);
    expect(pressGame(game, now + 200)).toContain('잠깐만요');
    expect(game.score).toBe(10);

    game.restUntil = 0;
    game.marker = 0.95;
    pressGame(game, now + 2000);
    expect(game.score).toBeGreaterThan(10);
    expect(game.score).toBeLessThan(21);
  });
});

describe('색 맞추기', () => {
  it('목표 색과 같을 때 누르면 오르고 다를 때 누르면 내린다(0 아래로는 안 간다)', () => {
    const game = createGame('color', 0);
    game.colorIndex = 1;
    game.targetIndex = 1;
    pressGame(game, 10);
    expect(game.score).toBe(1);
    expect(game.message).toContain('맞았어요');
    expect(game.targetIndex).not.toBe(1); // 다음 목표는 다른 색

    game.colorIndex = (game.targetIndex + 1) % GAME_COLORS.length;
    pressGame(game, 20);
    expect(game.score).toBe(0);
    pressGame(game, 30);
    expect(game.score).toBe(0); // 0 아래로 내려가지 않는다
  });

  it('시간이 지나면 색이 바뀌고, 같은 씨앗이면 같은 차례가 나온다(테스트가 흔들리지 않게)', () => {
    const one = createGame('color', 0);
    const two = createGame('color', 0);
    const colorsOf = (game: ReturnType<typeof createGame>) => {
      const seen: number[] = [];
      for (let now = 1000; now <= 12_000; now += 1000) {
        if (stepGame(game, now)) {
          seen.push(game.colorIndex);
        }
      }
      return seen;
    };
    const first = colorsOf(one);
    expect(first.length).toBeGreaterThan(3);
    expect(colorsOf(two)).toEqual(first);
    expect(new Set(first).size).toBeGreaterThan(1);
  });
});

describe('게임 바꾸기·점수 글', () => {
  it('게임을 바꿔도 가장 높은 점수는 남고 지금 점수는 0부터 다시 센다', () => {
    let game = createGame('timing', 0);
    game.marker = 0.5;
    pressGame(game, 10);
    expect(game.best.timing).toBe(10);
    game = switchGame(game, 'color', 20);
    expect(game.kind).toBe('color');
    expect(game.score).toBe(0);
    expect(game.best.timing).toBe(10);
    game = switchGame(game, 'timing', 30);
    expect(game.score).toBe(0);
    expect(game.best.timing).toBe(10);
    game = restartGame(game, 40);
    expect(game.presses).toBe(0);
    expect(gameScoreText(game)).toContain('최고 10점');
  });
});

describe('가상 데스크톱과 이어 붙이기', () => {
  const fresh = () => new DesktopModel(1920, 1080, { now: () => 1_700_000_000_000 });

  it("코드가 보낸 press('space')는 미니게임 창을 열고 게임으로 들어간다(f121)", () => {
    const model = fresh();
    expect(model.windowOfKind('game')).toBeNull();
    model.key('down', 'space', ' ', { fromScript: true });
    expect(model.windowOfKind('game')).not.toBeNull();
    expect(model.game.presses).toBe(1);
    expect(model.notepadText).toBe(''); // 메모장으로 새지 않는다
    for (let index = 0; index < 5; index += 1) {
      model.key('down', 'space', ' ', { fromScript: true });
    }
    expect(model.game.presses).toBe(6);
    expect(model.lastAction).toContain('미니게임');
  });

  it('학생이 손으로 누른 스페이스는 게임 창을 열지 않고 안내만 한다', () => {
    const model = fresh();
    model.key('down', 'space', ' ');
    expect(model.windowOfKind('game')).toBeNull();
    expect(model.lastAction).toContain('미니게임');
    expect(model.game.presses).toBe(0);
  });

  it('메모장·가상 브라우저에 초점이 있으면 스페이스는 공백 글자다(typewrite가 망가지지 않게)', () => {
    const model = fresh();
    model.typeText('ab');
    model.key('down', 'space', ' ', { fromScript: true });
    expect(model.notepadText).toBe('ab ');
    expect(model.windowOfKind('game')).toBeNull();

    model.openBrowser('https://example.com/');
    model.key('down', 'space', ' ', { fromScript: true });
    expect(model.browser.query).toBe(' ');
    expect(model.windowOfKind('game')).toBeNull();
  });

  it("typewrite('a b')가 보내는 공백은 언제나 글자다(게임으로 가지 않는다)", () => {
    const model = fresh();
    model.key('down', 'a', 'a');
    model.key('down', ' ', ' '); // typewrite는 글자 그대로(press(' '))를 보낸다
    model.key('down', 'b', 'b');
    expect(model.notepadText).toBe('a b');
    expect(model.windowOfKind('game')).toBeNull();
  });

  it('미니게임 창의 단추로 게임을 바꾸고 다시 시작한다', () => {
    const model = fresh();
    model.openGame('timing');
    const window = model.windowOfKind('game')!;
    const tabs = model.gameTabRects(window);
    expect(tabs).toHaveLength(GAMES.length + 1);
    model.click(tabs[2]!.rect.x + 10, tabs[2]!.rect.y + 10);
    expect(model.game.kind).toBe('color');
    expect(model.focusedWindow?.title).toContain('색 맞추기');
    model.game.score = 5;
    model.click(tabs[GAMES.length]!.rect.x + 10, tabs[GAMES.length]!.rect.y + 10);
    expect(model.game.score).toBe(0);
    expect(model.lastAction).toContain('다시');
  });

  it('미니게임 창이 없으면 시계가 돌지 않는다(가만히 있을 때 CPU를 쓰지 않게)', () => {
    const model = fresh();
    const base = 1_700_000_000_000; // fresh()의 시계와 같은 값
    expect(model.stepGame({ now: base + 50 })).toBe(false);
    model.openGame('balloon');
    expect(model.stepGame({ now: base + 50 })).toBe(true);
  });

  it('시계가 크게 어긋나면(탭을 숨겼다 돌아옴) 한 판을 건너뛰고 다시 맞춘다 — 순간이동하지 않는다', () => {
    const model = fresh();
    const base = 1_700_000_000_000;
    model.openGame('balloon');
    const start = model.game.y;
    expect(model.stepGame({ now: base + 60_000 })).toBe(false); // 1분 뒤에 돌아왔다
    expect(model.game.y).toBe(start);
    expect(model.stepGame({ now: base + 60_050 })).toBe(true); // 그다음 판부터 이어서 움직인다
    expect(model.game.y).toBeGreaterThan(start);
  });
});
