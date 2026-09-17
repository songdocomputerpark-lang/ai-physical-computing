/**
 * 부품: MP3 모듈(DFPlayer Mini 계열) — UART로 명령을 받는 바깥 출력 부품(PLAN §6.2 "MP3 모듈 | 2-2-2 (f070~f072)", 원고 160~165쪽, src/lab/README.md 7.5).
 * 파이썬 쪽은 같은 폴더의 apc_part_mp3.py(프레임 해석·명령·응답 — 규약 근거는 그 파일 머리말), 소리는 melodies.ts·mp3-voice.ts(PD-16 합성 음원).
 *
 * 핀(역할 이름은 모듈 쪽): rx = 모듈이 받는 핀 ← 보드 TX(기본 GPIO17), tx = 모듈이 보내는 핀 → 보드 RX(기본 GPIO16) — 원고 162쪽 "TX(16번 핀)·RX(17번 핀)".
 * 모습은 핀 전압이 아니라 모듈 흉내가 보낸 상태('board.device' state — 재생·곡·볼륨·반복·알아듣지 못한 까닭)로 그린다.
 * [정지]하면 소리를 끄고 멈춘 모습, 코드가 스스로 끝나면 틀던 곡은 끝까지 울린다(실물 모듈은 보드 프로그램이 끝나도 곡을 계속 튼다).
 * 모습 값: data-visual-playing(true|false), status(stopped|playing|paused|sleep), track(곡 번호, 없으면 0), volume(0~30), loop(none|one|all),
 * play(처음부터 튼 횟수), commands(알아들은 명령 수), issue(까닭 코드, 없으면 빈 글자). 소리를 예약한 음 수는 그림 묶음의 data-mp3-notes.
 * 그림: 사이트가 그린 모듈(마이크로 SD 칸)과 스피커(브랜드 중립). 색만으로 알리지 않게 "1번 곡 재생 중"·"볼륨 20/30" 글을 둔다.
 * 소리: sound: true라 배선에 있으면 [소리 켜짐/꺼짐] 단추가 보이고, 첫 [실행] 뒤에만 소리가 난다(자동 재생 정책 — board-audio.ts).
 */
import type { PartDefinition, PartVisual } from '../../part-types.ts';
import { isLive, type BoardSnapshot, type PartDeviceState } from '../../state.ts';
import { trackLengthMs, trackOf } from './melodies.ts';
import { createMp3Voice, type Mp3Voice } from './mp3-voice.ts';

export type Mp3Status = 'stopped' | 'playing' | 'paused' | 'sleep';

export interface Mp3View {
  readonly status: Mp3Status;
  readonly track: number;
  readonly volume: number;
  readonly loop: 'none' | 'one' | 'all';
  readonly playId: number;
  readonly positionMs: number;
  readonly commands: number;
  readonly issue: string;
  readonly issueText: string;
}

const STATUSES: readonly Mp3Status[] = ['stopped', 'playing', 'paused', 'sleep'];
const WIDTH = 126;
const HEIGHT = 76;

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** 모듈 흉내 상태를 읽는다(없거나 모양이 틀리면 전원 직후 모습: 멈춤·볼륨 30) */
export function parseMp3State(device: PartDeviceState | undefined): Mp3View {
  const raw = (device?.state ?? {}) as Record<string, unknown>;
  const status = STATUSES.includes(raw.status as Mp3Status) ? (raw.status as Mp3Status) : 'stopped';
  const loop = raw.loop === 'one' || raw.loop === 'all' ? raw.loop : 'none';
  return {
    status,
    track: numberOr(raw.track, 0),
    volume: numberOr(raw.volume, 30),
    loop,
    playId: numberOr(raw.playId, 0),
    positionMs: numberOr(raw.positionMs, 0),
    commands: numberOr(raw.commands, 0),
    issue: typeof raw.issue === 'string' ? raw.issue : '',
    issueText: typeof raw.issueText === 'string' ? raw.issueText : '',
  };
}

export function mp3Visual(snapshot: BoardSnapshot, device: PartDeviceState | undefined): PartVisual {
  const live = isLive(snapshot);
  const view = parseMp3State(live ? device : undefined);
  const status = live ? view.status : 'stopped';
  return {
    playing: status === 'playing',
    status,
    track: view.track,
    volume: view.volume,
    loop: view.loop,
    play: view.playId,
    commands: view.commands,
    issue: live ? view.issue : '',
  };
}

/** 그림 안(폭 82) 넷째 줄에 들어가는 짧은 까닭 — 긴 설명은 화면 낭독기 설명(aria-description)과 콘솔 안내에 있다 */
export const ISSUE_SHORT: Readonly<Record<string, string>> = Object.freeze({
  checksum: '체크섬 달라 무시',
  frame: '틀린 명령 버림',
  baud: '속도가 달라요',
  'no-file': '없는 곡 번호',
  sleeping: '잠자기 중',
  unsupported: '모르는 명령',
  volume: '볼륨은 0~30',
});

/** 그림 안 셋째 줄 짧은 글(반복 표시 없이): "1번 곡 재생 중"·"명령을 기다려요" 등 — 모듈 폭(82)을 넘지 않게 */
export function mp3ShortText(visual: PartVisual): string {
  const track = typeof visual.track === 'number' ? visual.track : 0;
  switch (visual.status) {
    case 'playing':
      return `${track}번 곡 재생 중`;
    case 'paused':
      return `${track}번 곡 일시 정지`;
    case 'sleep':
      return '잠자기';
    default:
      return typeof visual.commands === 'number' && visual.commands > 0 ? '멈춤' : '명령을 기다려요';
  }
}

/** 모습 글: "1번 곡 재생 중 · 한 곡 반복", "명령을 기다려요" 등(화면 낭독기 설명) */
export function mp3StatusText(visual: PartVisual): string {
  const track = typeof visual.track === 'number' ? visual.track : 0;
  const loop = visual.loop === 'one' ? ' · 한 곡 반복' : visual.loop === 'all' ? ' · 전체 반복' : '';
  switch (visual.status) {
    case 'playing':
      return `${track}번 곡 재생 중${loop}`;
    case 'paused':
      return `${track}번 곡 일시 정지`;
    case 'sleep':
      return '잠자기';
    default:
      return typeof visual.commands === 'number' && visual.commands > 0 ? '멈춤' : '명령을 기다려요';
  }
}

const definition: PartDefinition = {
  id: 'mp3',
  title: 'MP3 모듈',
  description: 'UART로 받은 명령 바이트(7E FF 06 명령 00 값 값 EF)에 따라 마이크로 SD 카드의 곡을 트는 MP3 모듈(DFPlayer Mini)이에요.',
  pins: [
    { role: 'rx', label: 'RX 받기', direction: 'out' },
    { role: 'tx', label: 'TX 보내기', direction: 'in' },
  ],
  defaultPins: { rx: 17, tx: 16 },
  size: { width: WIDTH, height: HEIGHT },
  sound: true,
  visual({ snapshot, device }) {
    return mp3Visual(snapshot, device);
  },
  render(target, { svg, instance }) {
    const board = svg('rect', { x: 0, y: 0, width: 82, height: HEIGHT, rx: 5, fill: '#1e3a5f', stroke: '#0f2238', 'stroke-width': 1.2 });
    const marks = [9, 27].map((x) => svg('rect', { x: x - 4, y: -3, width: 8, height: 6, rx: 1, fill: '#e8c46a', stroke: '#8a6d1f', 'stroke-width': 0.8 }));
    // 줄 배치(모듈 폭 82): 핀 글(12) · 이름 + SD 카드(25) · 상태(42) · 볼륨·반복(56) · 까닭(70). 글이 SD 카드·스피커와 겹치지 않게 카드는 이름 오른쪽에 둔다
    const pinText = svg('text', { x: 5, y: 12, class: 'board-part__label board-part__label--small' }, [`RX IO${instance.pins.rx ?? ''} TX IO${instance.pins.tx ?? ''}`]);
    const title = svg('text', { x: 5, y: 26, class: 'board-part__title' }, ['MP3 모듈']);
    const card = svg('rect', { x: 58, y: 16, width: 18, height: 13, rx: 1.5, fill: '#cbd5e1', stroke: '#64748b', 'stroke-width': 1 });
    const cardLabel = svg('text', { x: 67, y: 25.5, 'text-anchor': 'middle', fill: '#1f2937', 'font-size': 7, 'font-weight': 700 }, ['SD']);
    const state = svg('text', { x: 5, y: 42, class: 'board-part__state' }, ['명령을 기다려요']);
    const volumeText = svg('text', { x: 5, y: 56, class: 'board-part__label board-part__label--small' }, ['볼륨 30/30']);
    const issueText = svg('text', { x: 5, y: 70, fill: '#fde68a', 'font-size': 8 }, ['']);
    // 스피커: 모듈 오른쪽에 선으로 이은 동그란 스피커와 소리 물결(재생 중일 때만)
    const cable = svg('path', { d: 'M 82 38 L 93 38', stroke: '#1f2937', 'stroke-width': 2, fill: 'none' });
    const speaker = svg('circle', { cx: 104, cy: 38, r: 11, fill: '#374151', stroke: '#111827', 'stroke-width': 1.2 });
    const cone = svg('circle', { cx: 104, cy: 38, r: 4.5, fill: '#9ca3af' });
    const waves = svg('g', { opacity: 0, fill: 'none', stroke: '#b45309', 'stroke-width': 1.6, 'stroke-linecap': 'round' }, [
      svg('path', { d: 'M 113 31 Q 118 38 113 45' }),
      svg('path', { d: 'M 117 27 Q 124 38 117 49' }),
    ]);
    target.append(board, ...marks, pinText, title, card, cardLabel, state, volumeText, issueText, cable, speaker, cone, waves);

    let voice: Mp3Voice | null = null;
    let lastPlay = 0;
    let lastStatus = 'stopped';
    let lastVolume = -1;
    let finishTimer: ReturnType<typeof setTimeout> | null = null;
    const clearFinish = () => {
      if (finishTimer !== null) {
        clearTimeout(finishTimer);
        finishTimer = null;
      }
    };
    return (visual, extra) => {
      const view = parseMp3State(extra.device);
      const status = typeof visual.status === 'string' ? visual.status : 'stopped';
      const play = typeof visual.play === 'number' ? visual.play : 0;
      const volume = typeof visual.volume === 'number' ? visual.volume : 30;
      const track = typeof visual.track === 'number' ? visual.track : 0;
      state.textContent = mp3ShortText(visual);
      volumeText.textContent = `볼륨 ${volume}/30${visual.loop === 'one' || visual.loop === 'all' ? ' 반복' : ''}`;
      const issue = typeof visual.issue === 'string' ? visual.issue : '';
      issueText.textContent = issue ? (ISSUE_SHORT[issue] ?? '') : '';
      waves.setAttribute('opacity', status === 'playing' ? '1' : '0');
      target.parentElement?.setAttribute('aria-description', [mp3StatusText(visual), `볼륨 ${volume}/30`, view.issueText].filter(Boolean).join('. '));

      clearFinish();
      if (status === 'playing') {
        if (play !== lastPlay || lastStatus !== 'playing') {
          voice ??= createMp3Voice();
          const notes = voice.play(track, view.positionMs, volume);
          target.setAttribute('data-mp3-notes', String(notes));
        } else if (volume !== lastVolume) {
          voice?.setVolume(volume);
        }
        // 코드가 끝난 뒤(end)에는 파이썬이 곡 끝을 알릴 수 없으니 화면이 곡 길이만큼 기다렸다가 글만 바꾼다
        const melody = trackOf(track);
        if (extra.snapshot.phase === 'end' && melody && view.loop === 'none') {
          const remaining = Math.max(0, trackLengthMs(melody) - view.positionMs);
          finishTimer = setTimeout(() => {
            state.textContent = `${track}번 곡 끝`;
            waves.setAttribute('opacity', '0');
          }, remaining);
        }
      } else {
        voice?.stop();
        target.setAttribute('data-mp3-notes', '0');
      }
      lastPlay = play;
      lastStatus = status;
      lastVolume = volume;
    };
  },
};

export default definition;
