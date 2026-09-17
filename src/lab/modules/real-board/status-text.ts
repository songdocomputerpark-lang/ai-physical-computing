/**
 * 실제 보드 패널에 보일 한국어 글과 단추(P3-07, P3-08). 연결 상태(BoardConnectionSnapshot)만 보고 정하는 순수 함수라 DOM 없이 검사한다
 * (tests/unit/serial/real-board-status-text.test.ts). 글은 고1이 처음 읽어도 알게: 무엇이 됐는지 → 다음에 누를 것 순서로 쓴다.
 * 링크 자리(guide.links)의 주소는 보드 준비 페이지(/start/board/)의 #위치다 — #firmware(펌웨어 굽기, P3-09 구역 F), #port-not-found(포트가 안 보임).
 * P3-08이 더한 것: [보드에 저장](writing 상태의 진행률·저장 결과 상자), [보드 되찾기](recovering 단계 글), [boot.py 끄기]·[main.py 끄기](autorun).
 */
import type { AutorunInfo, BoardConnectionSnapshot, BoardSaveReport } from '../../serial/board-connection.ts';
import { SITE_FIRMWARE_VERSION } from '../../serial/banner.ts';
import type { ExecStage } from '../../serial/raw-repl.ts';
import type { SerialSupport } from '../../serial/support.ts';

export type RealBoardTone = 'neutral' | 'progress' | 'success' | 'warning' | 'danger';

export type RealBoardAction = 'connect' | 'reconnect' | 'check' | 'restart' | 'choose' | 'disconnect' | 'save' | 'recover' | 'disable-autorun';

export interface RealBoardLink {
  /** 사이트 안 경로(withBase 전) */
  readonly path: string;
  readonly label: string;
  /** 누르기 전에 연결을 끊는다(펌웨어 굽기는 포트를 따로 연다) */
  readonly releasePort?: boolean;
}

export interface RealBoardSavedBox {
  readonly tone: 'success' | 'danger';
  readonly title: string;
  readonly items: readonly string[];
  readonly tips: readonly string[];
}

export interface RealBoardView {
  readonly tone: RealBoardTone;
  readonly title: string;
  readonly detail: string;
  /** 보이는 단추(순서대로) */
  readonly actions: readonly RealBoardAction[];
  /** 첫째(강조) 단추 */
  readonly primary: RealBoardAction | null;
  /** 상태에 따라 바뀌는 단추 글자(예: disable-autorun → "boot.py 끄기") — 없으면 ACTION_LABELS */
  readonly actionLabels: Readonly<Partial<Record<RealBoardAction, string>>>;
  /** 연결된 보드 정보(없으면 null) */
  readonly info: { readonly firmware: string; readonly machine: string; readonly chip: string } | null;
  /** 안내 상자(펌웨어·보드 멈춤·포트) */
  readonly guide: { readonly title: string; readonly steps: readonly string[]; readonly links: readonly RealBoardLink[] } | null;
  /** 덧붙이는 짧은 안내(옛 펌웨어·ESP32 아님·Firefox·휴대폰·boot.py 반복) */
  readonly notes: readonly string[];
  /** "포트 선택 창에서 무엇을 고르나요?" 안내: hidden(안 보임) · shown(접힌 채 보임) · open(펼쳐 보임 — 선택 창을 닫았거나 포트를 못 열었을 때) */
  readonly portHelp: 'hidden' | 'shown' | 'open';
  /** 파일 쓰기 진행률(writing — 바이트) */
  readonly progress: { readonly value: number; readonly max: number; readonly text: string } | null;
  /** 마지막 [보드에 저장] 결과(ready에서만) */
  readonly saved: RealBoardSavedBox | null;
}

export const BOARD_PAGE_PATH = 'start/board/';
export const FIRMWARE_LINK: RealBoardLink = Object.freeze({ path: `${BOARD_PAGE_PATH}#firmware`, label: '펌웨어 굽기 안내(보드 준비 페이지)', releasePort: true });
export const PORT_HELP_LINK: RealBoardLink = Object.freeze({ path: `${BOARD_PAGE_PATH}#port-not-found`, label: '포트 선택 창에 보드가 안 보여요' });

export const ACTION_LABELS: Readonly<Record<RealBoardAction, string>> = Object.freeze({
  connect: '보드 연결',
  reconnect: '다시 연결',
  check: '다시 확인',
  restart: '보드 다시 시작',
  choose: '다른 포트 고르기',
  disconnect: '연결 끊기',
  save: '보드에 저장',
  recover: '보드 되찾기',
  'disable-autorun': '자동 실행 파일 끄기',
});

const STAGE_TEXT: Readonly<Record<ExecStage, string>> = Object.freeze({
  prepare: '코드가 쓰는 라이브러리 파일이 보드에 있는지 확인하는 중이에요.',
  'soft-reset': '보드를 새로 시작(소프트 리셋)하는 중이에요.',
  upload: '코드를 보드로 보내는 중이에요.',
  running: '[정지]를 누르면 멈춰요(보드에 Ctrl-C를 보내요).',
  stopping: '멈추는 중이에요…',
});

const numberText = (value: number) => value.toLocaleString('ko-KR');

function supportNotes(support: SerialSupport): string[] {
  const notes: string[] = [];
  if (support.firefox) {
    notes.push('Firefox는 처음 연결할 때 사이트 권한 부가 기능을 설치할지 물을 수 있어요. 허락해야 연결돼요.');
  } else if (support.level === 'unknown') {
    notes.push('휴대폰·태블릿은 기기와 보드에 따라 포트 선택 창에 보드가 안 보일 수 있어요. 컴퓨터용 Chrome·Edge를 권해요.');
  } else if (support.level === 'supported' && !support.recommended) {
    notes.push(`이 사이트는 컴퓨터용 Chrome·Edge에서 보드 연결을 시험해요. ${support.browserName}에서 안 되면 Chrome·Edge로 열어요.`);
  }
  return notes;
}

/** 켜질 때 도는 파일에 대한 안내(ready) */
export function autorunNotes(autorun: AutorunInfo | null | undefined): string[] {
  if (!autorun) {
    return [];
  }
  if (autorun.disabledAs) {
    return [`보드 파일 이름을 바꿨어요: ${autorun.file} → ${autorun.disabledAs}. 이제 보드가 켜질 때 저절로 돌지 않아요(코드는 그 파일에 그대로 있어요).`];
  }
  if (autorun.stuck) {
    return [
      `보드를 되찾으면서 ${autorun.file} 파일을 멈췄어요. 이 파일에 멈춤 신호를 받지 않는 반복이 있으면 보드가 켜질 때마다 다시 막혀요. [${autorun.file} 끄기]를 누르면 이름을 바꿔 저절로 돌지 않게 해요(코드는 지워지지 않아요).`,
    ];
  }
  if (autorun.file === 'boot.py') {
    return [
      '보드의 boot.py가 끝나지 않는 반복이라, [실행]할 때마다 멈춤 신호(Ctrl-C)로 boot.py를 멈추고 코드를 보내요. 전원만 넣으면 돌게 일부러 저장한 코드라면 그대로 둬도 돼요. 이제 쓰지 않으면 [boot.py 끄기]를 눌러요.',
    ];
  }
  return [];
}

function autorunActions(autorun: AutorunInfo | null | undefined): { actions: RealBoardAction[]; labels: Partial<Record<RealBoardAction, string>>; primary: RealBoardAction | null } {
  if (!autorun || autorun.disabledAs || (!autorun.stuck && autorun.file !== 'boot.py')) {
    return { actions: [], labels: {}, primary: null };
  }
  return { actions: ['disable-autorun'], labels: { 'disable-autorun': `${autorun.file} 끄기` }, primary: autorun.stuck ? 'disable-autorun' : null };
}

/** 마지막 [보드에 저장] 결과 상자 */
export function describeSave(report: BoardSaveReport | null | undefined): RealBoardSavedBox | null {
  if (!report) {
    return null;
  }
  if (report.ok) {
    const items = report.result.files.map((file) => {
      const size = `${numberText(file.size)}바이트`;
      if (file.status === 'same') {
        return `${file.path} — 보드에 이미 같은 파일이 있어서 그대로 뒀어요`;
      }
      if (file.kind === 'main') {
        return file.replaced ? `${file.path} — 보드에 있던 파일을 이 코드로 바꿨어요(${size})` : `${file.path} — 새로 저장했어요(${size})`;
      }
      return file.replaced ? `${file.path} — 코드가 쓰는 라이브러리를 사이트판으로 바꿨어요(${size})` : `${file.path} — 코드가 쓰는 라이브러리를 함께 올렸어요(${size})`;
    });
    const tips = ['USB를 뽑았다 다시 꽂거나 보드의 EN(RST) 버튼을 누르면 main.py가 저절로 실행돼요. 컴퓨터 없이 전원만 넣어도 돼요.'];
    if (report.result.mainUsesInput) {
      tips.push('이 코드는 input()으로 글자를 기다려요. 컴퓨터 없이 전원만 넣으면 글자를 보낼 곳이 없어 그 줄에서 계속 기다려요.');
    }
    return { tone: 'success', title: '보드에 저장했어요', items, tips };
  }
  const error = report.error;
  const tips: string[] = [];
  switch (error.code) {
    case 'no-space':
      tips.push('보드 저장 공간이 모자라요. Thonny 같은 도구로 보드에서 필요 없는 파일을 지우거나, 펌웨어를 다시 구워(보드 파일이 모두 지워져요) 공간을 비워요.');
      break;
    case 'memory':
      tips.push('보드의 메모리가 모자라요. [보드 다시 시작]을 누른 뒤 다시 [보드에 저장]을 눌러요.');
      break;
    default:
      if (error.name === 'ReplStopped') {
        tips.push('저장을 멈춰서 파일이 끝까지 저장되지 않았을 수 있어요. 다시 [보드에 저장]을 눌러요.');
      } else {
        tips.push('다시 [보드에 저장]을 눌러요. 계속 안 되면 USB 케이블을 바꿔 끼우거나 [보드 다시 시작]을 눌러 봐요.');
      }
  }
  return { tone: 'danger', title: '보드에 저장하지 못했어요', items: [error.message], tips };
}

/** 저장 결과를 콘솔 안내 한 줄로([안내]는 콘솔이 붙인다) */
export function saveNoticeText(report: BoardSaveReport): string {
  if (!report.ok) {
    return `보드에 저장하지 못했어요: ${report.error.message}`;
  }
  const parts = report.result.files.map((file) => {
    if (file.status === 'same') {
      return `${file.path}(이미 같아서 그대로)`;
    }
    if (file.kind === 'main') {
      return `${file.path}(${numberText(file.size)}바이트${file.replaced ? ' — 바꿔 씀' : ''})`;
    }
    return `${file.path}(라이브러리 함께 올림)`;
  });
  return `보드에 저장했어요: ${parts.join(', ')}. USB를 다시 꽂거나 보드의 EN(RST) 버튼을 누르면 main.py가 저절로 실행돼요.`;
}

export function describeRealBoard(snapshot: BoardConnectionSnapshot, support: SerialSupport): RealBoardView {
  const base = {
    info: null,
    guide: null,
    notes: [] as string[],
    portHelp: 'hidden' as RealBoardView['portHelp'],
    actionLabels: {} as Partial<Record<RealBoardAction, string>>,
    progress: null,
    saved: null,
  };
  const connectingNotes = supportNotes(support);
  switch (snapshot.state) {
    case 'unsupported':
      return {
        ...base,
        tone: 'warning',
        title: '이 브라우저에서는 실제 보드를 연결할 수 없어요',
        detail: `${support.summary} ${support.advice}`.trim(),
        actions: [],
        primary: null,
        notes: ['[가상 보드] 탭에서는 보드 없이 같은 코드를 실행할 수 있어요.'],
      };
    case 'idle': {
      const cancelled = snapshot.problem?.code === 'not-selected';
      return {
        ...base,
        tone: 'neutral',
        title: cancelled ? '포트를 고르지 않았어요' : '실제 보드가 연결되지 않았어요',
        detail: cancelled
          ? '보드를 USB 케이블로 꽂은 채 [보드 연결]을 다시 눌러요. 선택 창 목록에 보드가 없으면 아래 안내를 봐요.'
          : '보드를 USB 케이블로 컴퓨터에 꽂고 [보드 연결]을 눌러요. 연결하면 [실행]이 코드를 이 보드로 보내요.',
        actions: ['connect'],
        primary: 'connect',
        notes: connectingNotes,
        portHelp: cancelled ? 'open' : 'shown',
      };
    }
    case 'choosing':
      return {
        ...base,
        tone: 'progress',
        title: '포트 선택 창에서 보드를 골라요',
        detail: '창에서 보드를 고르고 [연결]을 눌러요. 보드가 목록에 없으면 창을 닫고 아래 안내를 봐요.',
        actions: [],
        primary: null,
        notes: connectingNotes,
        portHelp: 'shown',
      };
    case 'opening':
      return { ...base, tone: 'progress', title: '포트를 여는 중이에요…', detail: `${snapshot.port?.text ?? '고른 포트'}와 연결하고 있어요.`, actions: [], primary: null };
    case 'checking':
      return {
        ...base,
        tone: 'progress',
        title: '보드에 MicroPython이 있는지 확인하는 중이에요…',
        detail: '보드에서 돌던 프로그램을 멈추고(Ctrl-C) 보드가 보내는 이름표(MicroPython 버전)를 받고 있어요.',
        actions: [],
        primary: null,
      };
    case 'ready':
    case 'running':
    case 'writing': {
      const banner = snapshot.banner;
      const notes: string[] = [];
      if (snapshot.firmware === 'older' && banner) {
        notes.push(`보드의 MicroPython(${banner.version})이 사이트 기준판(${SITE_FIRMWARE_VERSION})보다 옛날 판이에요. 대부분 되지만 결과가 다르면 펌웨어를 새로 구워요.`);
      } else if (snapshot.firmware === 'newer' && banner) {
        notes.push(`보드의 MicroPython(${banner.version})이 사이트 기준판(${SITE_FIRMWARE_VERSION})보다 새 판이에요. 대부분 그대로 돼요.`);
      }
      if (snapshot.esp32 === false) {
        notes.push('ESP32가 아닌 보드예요. 교과서 예제의 핀 번호가 맞지 않을 수 있어요.');
      }
      const info = {
        firmware: banner ? `MicroPython ${banner.version} (${banner.buildDate})` : 'MicroPython(버전을 읽지 못했어요)',
        machine: banner?.machine ?? '알 수 없음',
        chip: snapshot.port?.text ?? '알 수 없음',
      };
      if (snapshot.state === 'running') {
        return {
          ...base,
          tone: 'progress',
          title: '실제 보드에서 코드가 돌고 있어요',
          detail: STAGE_TEXT[snapshot.runStage ?? 'running'],
          actions: ['disconnect'],
          primary: null,
          info,
          notes,
        };
      }
      if (snapshot.state === 'writing') {
        const task = snapshot.task;
        if (task?.kind === 'disable-autorun') {
          return {
            ...base,
            tone: 'progress',
            title: `${task.file} 파일 이름을 바꾸는 중이에요…`,
            detail: '보드가 켜질 때 저절로 돌지 않게 이름을 바꿔요. 코드는 지워지지 않아요.',
            actions: [],
            primary: null,
            info,
            notes,
          };
        }
        const progress = task?.kind === 'save' ? task.progress : null;
        return {
          ...base,
          tone: 'progress',
          title: '보드에 저장하는 중이에요…',
          detail: progress
            ? progress.phase === 'check'
              ? `${progress.path}: 보드에 있는 파일과 같은지 확인하고 있어요.`
              : `${progress.path}: 보드로 보내고 있어요(${numberText(progress.written)}/${numberText(progress.size)}바이트).`
            : '보드를 새로 시작(소프트 리셋)하고 저장할 준비를 하고 있어요.',
          actions: [],
          primary: null,
          info,
          notes,
          progress: progress
            ? { value: progress.doneBytes, max: Math.max(1, progress.totalBytes), text: `파일 ${progress.fileCount}개 중 ${progress.fileNumber}번째` }
            : { value: 0, max: 1, text: '준비 중' },
        };
      }
      const autorun = autorunActions(snapshot.autorun);
      return {
        ...base,
        tone: 'success',
        title: '실제 보드가 연결됐어요',
        detail: '[실행]을 누르면 코드가 이 보드에서 돌아요(실행할 때마다 보드를 새로 시작해요). [실행]한 코드는 전원을 끄면 사라져요 — 전원만 넣어도 돌게 하려면 [보드에 저장]을 눌러요.',
        // 멈춤 신호를 삼키는 파일이면 [끄기]를 맨 앞(강조)에, 일부러 둔 boot.py 반복일 수 있으면 [연결 끊기] 앞에 조용히
        actions: autorun.primary ? [...autorun.actions, 'save', 'check', 'choose', 'disconnect'] : ['save', 'check', 'choose', ...autorun.actions, 'disconnect'],
        primary: autorun.primary,
        actionLabels: autorun.labels,
        info,
        notes: [...autorunNotes(snapshot.autorun), ...notes],
        saved: describeSave(snapshot.lastSave),
      };
    }
    case 'recovering': {
      const stage = snapshot.recoveryStage ?? 'interrupt';
      return {
        ...base,
        tone: stage === 'press-button' ? 'warning' : 'progress',
        title: stage === 'press-button' ? '보드의 EN(RST) 버튼을 한 번 눌러 주세요' : '보드를 되찾는 중이에요…',
        detail:
          stage === 'interrupt'
            ? '보드 프로그램에 멈춤 신호(Ctrl-C)를 짧은 간격으로 여러 번 보내고 있어요.'
            : stage === 'reset'
              ? '보드를 다시 켜면서, 프로그램이 반복에 들어가기 전에 멈추도록 멈춤 신호를 계속 보내고 있어요.'
              : '보드를 저절로 다시 켤 수 없었어요. 보드의 EN(RST) 버튼을 누르면, 다시 켜지는 동안 멈춤 신호를 계속 보내 프로그램을 멈춰요.',
        actions: [],
        primary: null,
      };
    }
    case 'no-micropython': {
      const verdict = snapshot.verdict;
      const links = [FIRMWARE_LINK];
      switch (verdict?.kind) {
        case 'no-firmware':
          return {
            ...base,
            tone: 'warning',
            title: '보드에 MicroPython 펌웨어가 없어요',
            detail: '보드가 켜질 때마다 "펌웨어를 찾지 못했다"는 부팅 글(invalid header)을 보내요.',
            actions: ['check', 'disconnect'],
            primary: 'check',
            guide: { title: '이렇게 해요', steps: ['[펌웨어 굽기 안내]를 따라 보드에 MicroPython을 구워요.', '다 구우면 이 실습실로 돌아와 [보드 연결]을 다시 눌러요.'], links },
          };
        case 'download-mode':
          return {
            ...base,
            tone: 'warning',
            title: '보드가 펌웨어 받기 모드(다운로드 모드)예요',
            detail: 'BOOT 버튼을 누른 채 켰거나, 펌웨어 굽기가 끝나지 않았어요. 이 모드에서는 코드를 실행할 수 없어요.',
            actions: ['restart', 'check', 'disconnect'],
            primary: 'restart',
            guide: {
              title: '이렇게 해요',
              steps: ['[보드 다시 시작]을 누르거나 보드의 EN(RST) 버튼을 한 번 눌러요(BOOT 버튼은 누르지 않아요).', '그래도 같으면 펌웨어를 다시 구워요.'],
              links,
            },
          };
        case 'other-python':
          return {
            ...base,
            tone: 'warning',
            title: `보드에 MicroPython이 아닌 다른 파이썬(${verdict.name})이 들어 있어요`,
            detail: '이 사이트의 예제는 MicroPython으로 돌아요.',
            actions: ['check', 'disconnect'],
            primary: null,
            guide: { title: '이렇게 해요', steps: ['[펌웨어 굽기 안내]를 따라 MicroPython을 구워요(보드에 있던 프로그램과 파일은 지워져요).'], links },
          };
        case 'other-output':
          return {
            ...base,
            tone: 'warning',
            title: verdict.garbled ? '보드가 알아볼 수 없는 글자를 보내요' : '보드에서 MicroPython이 아닌 프로그램이 돌고 있어요',
            detail: verdict.garbled
              ? '보드 프로그램이 다른 통신 속도를 쓰거나, MicroPython이 아닌 펌웨어(예: 아두이노 스케치)가 들어 있어요.'
              : '보드가 글을 보내지만 MicroPython의 대답이 아니에요. 아두이노 스케치 같은 다른 펌웨어가 들어 있을 수 있어요.',
            actions: ['check', 'choose', 'disconnect'],
            primary: null,
            portHelp: 'shown',
            guide: { title: '이렇게 해요', steps: ['[펌웨어 굽기 안내]를 따라 MicroPython을 구워요(보드에 있던 프로그램은 지워져요).', '다른 장치의 포트를 골랐다면 [다른 포트 고르기]를 눌러요.'], links },
          };
        default:
          return {
            ...base,
            tone: 'warning',
            title: '보드가 대답하지 않아요',
            detail: '포트는 열렸는데 MicroPython의 대답(>>> 프롬프트)이 오지 않아요.',
            actions: ['check', 'recover', 'restart', 'choose', 'disconnect'],
            primary: 'check',
            portHelp: 'shown',
            guide: {
              title: '이런 까닭일 수 있어요',
              steps: [
                '보드에 MicroPython 펌웨어가 없어요 → [펌웨어 굽기 안내]를 따라 펌웨어를 구워요.',
                '블루투스 포트처럼 보드가 아닌 포트를 골랐어요 → [다른 포트 고르기]를 눌러요.',
                '보드가 펌웨어 받기 모드예요 → [보드 다시 시작]이나 보드의 EN(RST) 버튼을 누른 뒤 [다시 확인]을 눌러요.',
                '보드에 저장된 프로그램이 멈춤 신호를 받지 않고 조용히 돌고 있어요 → [보드 되찾기]를 눌러요.',
              ],
              links,
            },
          };
      }
    }
    case 'busy': {
      if (snapshot.problem?.code === 'recover-failed') {
        return {
          ...base,
          tone: 'danger',
          title: '보드를 되찾지 못했어요',
          detail: '멈춤 신호를 여러 번 보내고 보드를 다시 켜 봤지만, 보드 프로그램이 멈추지 않았어요.',
          actions: ['recover', 'restart', 'disconnect'],
          primary: 'recover',
          guide: {
            title: '이렇게 해 봐요',
            steps: [
              '보드의 EN(RST) 버튼을 누른 채로 [보드 되찾기]를 누르고, 1초쯤 뒤에 버튼에서 손을 떼요(다시 켜지는 순간에 멈춤 신호가 닿게).',
              'USB를 뽑았다가 다시 꽂고 [다시 연결] → [보드 되찾기]를 눌러요.',
              '그래도 안 되면 펌웨어를 다시 구워요(보드 안 파일이 모두 지워져요).',
            ],
            links: [FIRMWARE_LINK],
          },
        };
      }
      const bootStuck = snapshot.autorun?.file === 'boot.py' && snapshot.autorun.stuck && !snapshot.autorun.disabledAs;
      return {
        ...base,
        tone: 'warning',
        title: '보드 프로그램이 멈추지 않아요',
        detail: bootStuck
          ? '보드의 boot.py가 멈춤 신호(Ctrl-C)를 받지 않아요(예: try·except로 KeyboardInterrupt까지 잡는 반복문). 보드가 켜질 때마다 boot.py가 돌아서 코드를 보낼 수 없어요.'
          : '보드에서 도는 프로그램이 멈춤 신호(Ctrl-C)를 받지 않아요(예: try·except로 KeyboardInterrupt까지 잡는 반복문).',
        actions: ['recover', 'restart', 'check', 'disconnect'],
        primary: 'recover',
        guide: {
          title: '이렇게 해요',
          steps: [
            '[보드 되찾기]를 눌러요. 멈춤 신호를 짧은 간격으로 여러 번 보내고, 그래도 안 되면 보드를 다시 켜면서 계속 보내요.',
            '되찾은 뒤 [boot.py 끄기]나 [main.py 끄기]가 보이면 눌러, 보드가 켜질 때 그 파일이 저절로 돌지 않게 해요.',
            '그래도 안 되면 펌웨어를 다시 구워요(보드 안 파일이 지워져요).',
          ],
          links: [FIRMWARE_LINK],
        },
      };
    }
    case 'lost':
      return {
        ...base,
        tone: 'danger',
        title: '보드 연결이 끊겼어요',
        detail: snapshot.replugged
          ? '보드가 다시 꽂혔어요. [다시 연결]을 눌러요.'
          : 'USB 케이블이 빠졌거나 보드 전원이 꺼졌어요. 케이블을 다시 꽂고 [다시 연결]을 눌러요.',
        actions: ['reconnect', 'connect'],
        primary: 'reconnect',
        notes: snapshot.problem?.code === 'not-selected' ? ['포트를 고르지 않았어요.'] : [],
        portHelp: snapshot.problem?.code === 'not-selected' ? 'open' : 'shown',
      };
    case 'error': {
      const code = snapshot.problem?.code;
      if (code === 'port-in-use') {
        return {
          ...base,
          tone: 'danger',
          title: '포트를 열지 못했어요',
          detail: '다른 프로그램(Thonny, 아두이노 IDE, 시리얼 모니터)이나 이 사이트를 연 다른 탭이 보드를 쓰고 있을 수 있어요. 그 프로그램이나 탭을 닫고 [보드 연결]을 다시 눌러요.',
          actions: ['connect'],
          primary: 'connect',
          portHelp: 'shown',
        };
      }
      if (code === 'security') {
        return {
          ...base,
          tone: 'danger',
          title: '포트 선택 창을 열 수 없어요',
          detail: '브라우저가 이 화면에서 보드 연결을 막았어요. 차시 안의 작은 실습실이라면 실습실 페이지를 따로 열어 연결해요.',
          actions: ['connect'],
          primary: 'connect',
        };
      }
      if (code === 'protocol') {
        return {
          ...base,
          tone: 'danger',
          title: '보드와 주고받는 약속이 어긋났어요',
          detail: '[다시 확인]을 눌러요. 그래도 안 되면 [연결 끊기] 뒤 다시 연결해요.',
          actions: ['check', 'recover', 'restart', 'disconnect'],
          primary: 'check',
        };
      }
      return {
        ...base,
        tone: 'danger',
        title: '포트를 열지 못했어요',
        detail: 'USB 케이블을 다시 꽂고 [보드 연결]을 다시 눌러요.',
        actions: ['connect'],
        primary: 'connect',
        portHelp: 'open',
      };
    }
  }
}
