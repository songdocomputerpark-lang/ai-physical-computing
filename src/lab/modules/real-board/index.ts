/**
 * 실제 ESP32 보드 연결 모듈의 화면 쪽(PLAN §8.3 P3-07 실제 보드 ① 연결·raw REPL, SPEC §6.2 "[가상 보드]/[실제 보드] 탭 — 같은 코드가 두 곳에서").
 *
 * 하는 일
 * 1. 탭 자리: panel.astro가 그린 칸([data-lab-module-panel="real-board"])을 입력·출력 칸의 가상 보드([data-board-io]) 바로 위로 옮긴다.
 *    [가상 보드] 탭은 가상 보드 칸을, [실제 보드] 탭은 실제 보드 칸([data-real-board])을 보인다(WAI-ARIA Tabs, ←·→·Home·End).
 *    가상 보드 칸이 없는 페이지면 옮기지 않고 제자리에서 탭만으로 쓴다.
 * 2. 실행 대상: [실제 보드] 탭을 고르면 lab.setRunTarget(실제 보드)를 끼워 같은 [실행]·[정지]·콘솔·오류 풀이 카드가 보드로 간다.
 *    [가상 보드] 탭이면 뗀다. 실행 중에는 탭을 바꾸지 않는다(셸 규칙 — [정지] 뒤에).
 * 3. 연결: [보드 연결]·[다시 연결]·[다시 확인]·[보드 다시 시작]·[다른 포트 고르기]·[연결 끊기] → BoardConnection(src/lab/serial/board-connection.ts).
 *    글·단추는 status-text.ts describeRealBoard가 정한다. 펌웨어 굽기 안내 링크는 누르기 전에 포트를 놓아 준다(굽기 도구가 포트를 새로 연다).
 * 4. 실제 보드에서 [실행]하면 가상 보드 그림 대신 콘솔이 결과 칸이라 콘솔을 화면 안으로 옮긴다(이미 보이면 그대로).
 * 5. (P3-08) [보드에 저장]: 편집칸 코드를 main.py로, 코드가 부르는 사이트 라이브러리(board-library-files.ts)를 함께 보드에 쓴다(진행률·결과 상자·콘솔 안내).
 *    [보드 되찾기]·[boot.py 끄기]: 멈추지 않는 보드를 Ctrl-C 되풀이로 되찾고, 켜질 때 도는 파일 이름을 바꾼다(board-connection.ts recover·disableAutorun).
 *    [실행]은 같은 라이브러리 목록을 받아, 코드가 부르는 라이브러리가 보드에 없으면 먼저 올리고 input() 줄을 보드로 보낸다(board-run-target.ts).
 * 탭 선택은 저장하지 않는다 — 실습실은 늘 [가상 보드]에서 시작한다(원칙 3 "하드웨어 없어도 100%", 공용 PC의 다음 학생이 선택 창을 만나지 않게).
 */
import { withBase } from '../../../lib/url.ts';
import { revealElement } from '../../controls/reveal.ts';
import { BOARD_LIBRARIES } from '../../esp32/board-library-files.ts';
import { BoardConnection, type BoardConnectionSnapshot, type BoardSaveReport } from '../../serial/board-connection.ts';
import { REAL_BOARD_TARGET_LABEL, createRealBoardRunTarget, usesInput } from '../../serial/board-run-target.ts';
import { errorMessage } from '../../serial/errors.ts';
import { detectSerialSupport } from '../../serial/support.ts';
import type { LabModule, LabModuleContext, LabModuleHandle } from '../types.ts';
import manifest from './manifest.ts';
import { ACTION_LABELS, describeRealBoard, saveNoticeText, type RealBoardAction } from './status-text.ts';

export type BoardTargetKind = 'virtual' | 'real';

const TARGET_ORDER: readonly BoardTargetKind[] = ['virtual', 'real'];
const ACTIONS: readonly RealBoardAction[] = ['connect', 'reconnect', 'disable-autorun', 'save', 'recover', 'check', 'restart', 'choose', 'disconnect'];

export const TARGET_HINTS: Readonly<Record<BoardTargetKind, string>> = Object.freeze({
  virtual: '같은 코드를 화면 속 가상 보드나 USB로 연결한 실제 ESP32에서 실행해요.',
  real: '[실행]을 누르면 코드가 USB로 연결한 실제 ESP32에서 돌아요. 화면 속 가상 보드는 쉬어요.',
});

/** 탭 키보드: 지금 초점 탭에서 누른 키로 옮겨 갈 탭(없으면 null) — WAI-ARIA Tabs 가로 목록 */
export function nextTabForKey(key: string, focused: BoardTargetKind): BoardTargetKind | null {
  const index = TARGET_ORDER.indexOf(focused);
  switch (key) {
    case 'ArrowRight':
      return TARGET_ORDER[(index + 1) % TARGET_ORDER.length]!;
    case 'ArrowLeft':
      return TARGET_ORDER[(index - 1 + TARGET_ORDER.length) % TARGET_ORDER.length]!;
    case 'Home':
      return TARGET_ORDER[0]!;
    case 'End':
      return TARGET_ORDER[TARGET_ORDER.length - 1]!;
    default:
      return null;
  }
}

function mount(context: LabModuleContext): LabModuleHandle | void {
  const section = context.panel;
  const tablist = section?.querySelector<HTMLElement>('[data-board-target-tablist]') ?? null;
  const tabs: Record<BoardTargetKind, HTMLButtonElement | null> = {
    virtual: section?.querySelector<HTMLButtonElement>('[data-board-target-tab="virtual"]') ?? null,
    real: section?.querySelector<HTMLButtonElement>('[data-board-target-tab="real"]') ?? null,
  };
  const realPanel = section?.querySelector<HTMLElement>('[data-real-board]') ?? null;
  if (!section || !tablist || !tabs.virtual || !tabs.real || !realPanel) {
    return;
  }
  const virtualTab = tabs.virtual;
  const realTab = tabs.real;
  const root = context.root;
  const lab = context.lab;
  const cleanups: (() => void)[] = [];
  const listen = <K extends keyof HTMLElementEventMap>(element: HTMLElement, type: K, handler: (event: HTMLElementEventMap[K]) => void) => {
    element.addEventListener(type, handler);
    cleanups.push(() => element.removeEventListener(type, handler));
  };

  // 1. 탭 자리 — 가상 보드 칸 바로 위
  const boardIo = root.querySelector<HTMLElement>('[data-lab-io] [data-board-io]');
  if (boardIo?.parentElement) {
    boardIo.parentElement.insertBefore(section, boardIo);
    section.dataset.realBoardPlacement = 'io';
    if (!boardIo.id) {
      boardIo.id = 'board-target-panel-virtual';
    }
    boardIo.setAttribute('role', 'tabpanel');
    boardIo.setAttribute('aria-labelledby', virtualTab.id);
    virtualTab.setAttribute('aria-controls', boardIo.id);
  } else {
    section.dataset.realBoardPlacement = 'panel';
  }
  context.showPanel();

  // 2. 연결과 실행 대상
  const support = detectSerialSupport();
  const connection = new BoardConnection();
  const target = createRealBoardRunTarget(connection, { libraries: BOARD_LIBRARIES });
  let current: BoardTargetKind = 'virtual';

  const find = <T extends HTMLElement>(selector: string) => realPanel.querySelector<T>(selector);
  const status = find<HTMLElement>('[data-real-board-status]');
  const title = find<HTMLElement>('[data-real-board-title]');
  const detail = find<HTMLElement>('[data-real-board-detail]');
  const info = find<HTMLElement>('[data-real-board-info]');
  const firmware = find<HTMLElement>('[data-real-board-firmware]');
  const machine = find<HTMLElement>('[data-real-board-machine]');
  const chip = find<HTMLElement>('[data-real-board-chip-text]');
  const notes = find<HTMLElement>('[data-real-board-notes]');
  const guide = find<HTMLElement>('[data-real-board-guide]');
  const guideTitle = find<HTMLElement>('[data-real-board-guide-title]');
  const guideSteps = find<HTMLElement>('[data-real-board-guide-steps]');
  const guideLinks = find<HTMLElement>('[data-real-board-guide-links]');
  const portHelp = find<HTMLDetailsElement>('[data-real-board-port-help]');
  const progressBox = find<HTMLElement>('[data-real-board-progress]');
  const progressBar = find<HTMLProgressElement>('[data-real-board-progress-bar]');
  const progressText = find<HTMLElement>('[data-real-board-progress-text]');
  const savedBox = find<HTMLElement>('[data-real-board-saved]');
  const savedTitle = find<HTMLElement>('[data-real-board-saved-title]');
  const savedItems = find<HTMLElement>('[data-real-board-saved-items]');
  const savedTips = find<HTMLElement>('[data-real-board-saved-tips]');
  const hint = section.querySelector<HTMLElement>('[data-board-target-hint]');
  const buttons = new Map<RealBoardAction, HTMLButtonElement>();
  for (const action of ACTIONS) {
    const button = find<HTMLButtonElement>(`[data-real-board-action="${action}"]`);
    if (button) {
      buttons.set(action, button);
    }
  }

  let lastProblemKey = '';
  let renderedSave: BoardSaveReport | null = null;
  const render = (snapshot: BoardConnectionSnapshot) => {
    const view = describeRealBoard(snapshot, support);
    const active = document.activeElement;
    realPanel.dataset.realBoardState = snapshot.state;
    realPanel.dataset.realBoardTone = view.tone;
    realPanel.dataset.realBoardVerdict = snapshot.verdict?.kind ?? '';
    realPanel.dataset.realBoardChip = snapshot.port?.chip ?? '';
    realPanel.dataset.realBoardVersion = snapshot.banner?.version ?? '';
    realPanel.dataset.realBoardProblem = snapshot.problem?.code ?? '';
    realPanel.dataset.realBoardRecovery = snapshot.recoveryStage ?? '';
    realPanel.dataset.realBoardAutorun = snapshot.autorun && !snapshot.autorun.disabledAs ? snapshot.autorun.file : '';
    realPanel.dataset.realBoardSavedState = snapshot.lastSave ? (snapshot.lastSave.ok ? 'ok' : 'failed') : '';
    realTab.dataset.realBoardState = snapshot.state;
    if (title && title.textContent !== view.title) {
      title.textContent = view.title;
    }
    if (detail && detail.textContent !== view.detail) {
      detail.textContent = view.detail;
    }
    for (const [action, button] of buttons) {
      button.hidden = !view.actions.includes(action);
      button.className = action === view.primary ? 'button button--primary' : 'lab-button';
      button.textContent = view.actionLabels[action] ?? ACTION_LABELS[action];
    }
    // 파일 쓰기 진행률(바이트 — 읽는 글은 상태 글이 맡고, 막대는 눈으로 보는 보조)
    if (progressBox && progressBar && progressText) {
      progressBox.hidden = view.progress === null;
      if (view.progress) {
        progressBar.max = view.progress.max;
        progressBar.value = Math.min(view.progress.value, view.progress.max);
        progressText.textContent = view.progress.text;
      }
    }
    // 저장 결과 상자(role=status): 결과가 바뀔 때만 글을 새로 넣는다 — 다른 상태 변화마다 다시 넣으면 화면 읽기 프로그램이 같은 글을 되풀이해 읽는다
    if (savedBox && savedTitle && savedItems && savedTips) {
      savedBox.hidden = view.saved === null;
      const report = snapshot.lastSave ?? null;
      if (view.saved && report !== renderedSave) {
        renderedSave = report;
        savedBox.dataset.realBoardSavedState = view.saved.tone === 'success' ? 'ok' : 'failed';
        savedTitle.textContent = view.saved.title;
        const list = (host: HTMLElement, texts: readonly string[]) =>
          host.replaceChildren(
            ...texts.map((text) => {
              const item = document.createElement('li');
              item.textContent = text;
              return item;
            }),
          );
        list(savedItems, view.saved.items);
        list(savedTips, view.saved.tips);
        savedTips.hidden = view.saved.tips.length === 0;
      }
    }
    // 보이는 단추를 안내 순서대로(강조 단추가 앞에) — 순서가 바뀔 때만 옮기고, 초점이 있던 단추는 다시 초점을 준다
    const actionsBox = find<HTMLElement>('[data-real-board-actions]');
    if (actionsBox) {
      const wanted = [...view.actions].sort((a, b) => Number(b === view.primary) - Number(a === view.primary)).map((action) => buttons.get(action)).filter((button): button is HTMLButtonElement => Boolean(button));
      const shown = [...actionsBox.children].filter((child) => !(child as HTMLElement).hidden);
      if (wanted.some((button, index) => shown[index] !== button)) {
        const focused = document.activeElement;
        actionsBox.prepend(...wanted);
        if (focused instanceof HTMLButtonElement && wanted.includes(focused)) {
          focused.focus();
        }
      }
    }
    if (info) {
      info.hidden = view.info === null;
    }
    if (view.info) {
      if (firmware) {
        firmware.textContent = view.info.firmware;
      }
      if (machine) {
        machine.textContent = view.info.machine;
      }
      if (chip) {
        chip.textContent = view.info.chip;
      }
    }
    if (notes) {
      notes.replaceChildren(
        ...view.notes.map((note) => {
          const item = document.createElement('li');
          item.textContent = note;
          return item;
        }),
      );
      notes.hidden = view.notes.length === 0;
    }
    if (guide && guideTitle && guideSteps && guideLinks) {
      guide.hidden = view.guide === null;
      guideTitle.textContent = view.guide?.title ?? '';
      guideSteps.replaceChildren(
        ...(view.guide?.steps ?? []).map((step) => {
          const item = document.createElement('li');
          item.textContent = step;
          return item;
        }),
      );
      guideLinks.replaceChildren(
        ...(view.guide?.links ?? []).map((link) => {
          const anchor = document.createElement('a');
          anchor.href = withBase(link.path);
          anchor.textContent = link.label;
          if (link.releasePort) {
            anchor.dataset.realBoardReleasePort = '';
          }
          return anchor;
        }),
      );
    }
    // "무엇을 고르나요" 안내: 포트를 고르는 상태에서만 보이고, 선택 창을 닫았거나 포트를 못 열었으면 펼쳐 준다
    // (학생이 접은 뒤에는 다시 펴지 않게 — 상태나 문제가 바뀔 때만)
    if (portHelp) {
      portHelp.hidden = view.portHelp === 'hidden';
      const problemKey = `${snapshot.state}:${snapshot.problem?.code ?? ''}`;
      if (view.portHelp === 'open' && problemKey !== lastProblemKey) {
        portHelp.open = true;
      }
      lastProblemKey = problemKey;
    }
    // 누른 단추가 사라졌으면 초점을 상태 글로(키보드로 다음 단추를 찾게)
    if (active instanceof HTMLElement && realPanel.contains(active) && (active.hidden || active.closest('[hidden]')) && current === 'real') {
      status?.focus();
    }
  };
  cleanups.push(connection.subscribe(render));
  render(connection.snapshot);

  // 3. 탭
  const applyTab = (next: BoardTargetKind) => {
    current = next;
    for (const kind of TARGET_ORDER) {
      const tab = tabs[kind]!;
      const selected = kind === next;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
    realPanel.hidden = next !== 'real';
    if (boardIo) {
      boardIo.hidden = next !== 'virtual';
    }
    section.dataset.boardTarget = next;
    root.dataset.boardTarget = next;
    if (hint) {
      hint.textContent = TARGET_HINTS[next];
    }
  };

  let messageShown = false;
  const say = (text: string) => {
    lab.showMessage(text);
    messageShown = text !== '';
  };
  const select = (next: BoardTargetKind, options: { focus?: boolean } = {}) => {
    if (next !== current) {
      const state = root.dataset.state;
      if (state === 'running' || state === 'stopping') {
        say('실행 중에는 실행할 곳을 바꿀 수 없어요. [정지]한 뒤에 바꿔요.');
        tabs[current]?.focus();
        return;
      }
      try {
        lab.setRunTarget(next === 'real' ? target : null);
      } catch (error) {
        say(error instanceof Error ? error.message : String(error));
        tabs[current]?.focus();
        return;
      }
      if (messageShown) {
        say('');
      }
      applyTab(next);
    }
    if (options.focus) {
      tabs[next]?.focus();
    }
  };

  listen(virtualTab, 'click', () => select('virtual'));
  listen(realTab, 'click', () => select('real'));
  listen(tablist, 'keydown', (event) => {
    const focused = TARGET_ORDER.find((kind) => tabs[kind] === document.activeElement) ?? current;
    const next = nextTabForKey(event.key, focused);
    if (next) {
      event.preventDefault();
      select(next, { focus: true });
    }
  });
  applyTab('virtual');

  // 4. 연결 단추(클릭 처리기 안에서 곧바로 부른다 — 포트 선택 창은 사용자 조작 안에서만 열린다)
  const labBusy = () => root.dataset.state === 'running' || root.dataset.state === 'stopping';
  const saveCode = async () => {
    const code = lab.getCode();
    if (code.trim() === '') {
      say('편집칸이 비어 있어서 보드에 저장할 코드가 없어요.');
      return;
    }
    if (labBusy()) {
      say('실행 중에는 보드에 저장할 수 없어요. [정지]한 뒤에 저장해요.');
      return;
    }
    const before = connection.snapshot.lastSave ?? null;
    try {
      await connection.save(code, { libraries: BOARD_LIBRARIES, usesInput: usesInput(code) });
    } catch (error) {
      const after = connection.snapshot.lastSave ?? null;
      if (after === null || after === before) {
        // 저장을 시작하지도 못함(연결 전·다른 일 중)
        context.notice(`보드에 저장하지 못했어요: ${errorMessage(error)}`);
        return;
      }
    }
    const report = connection.snapshot.lastSave ?? null;
    if (report && report !== before) {
      context.notice(saveNoticeText(report));
    }
  };
  const recoverBoard = async () => {
    if (labBusy()) {
      say('실행 중에는 보드를 되찾을 수 없어요. [정지]한 뒤에 눌러요.');
      return;
    }
    const snapshot = await connection.recover();
    if (snapshot.state === 'ready') {
      context.notice(
        snapshot.autorun?.stuck && !snapshot.autorun.disabledAs
          ? `보드를 되찾았어요. 되찾으면서 ${snapshot.autorun.file} 파일을 멈췄어요 — 입력·출력 칸의 [${snapshot.autorun.file} 끄기]로 보드가 켜질 때 저절로 돌지 않게 할 수 있어요.`
          : '보드를 되찾았어요. 이제 [실행]할 수 있어요.',
      );
    } else if (snapshot.problem?.code === 'recover-failed') {
      context.notice('보드를 되찾지 못했어요. 입력·출력 칸의 안내를 따라 EN(RST) 버튼을 누른 채 다시 [보드 되찾기]를 눌러 봐요.');
    }
  };
  const disableAutorun = async () => {
    const file = connection.snapshot.autorun?.file;
    try {
      const snapshot = await connection.disableAutorun();
      if (file && snapshot.autorun?.disabledAs) {
        context.notice(`보드 파일 이름을 바꿨어요: ${file} → ${snapshot.autorun.disabledAs}. 이제 보드가 켜질 때 저절로 돌지 않아요.`);
      }
    } catch (error) {
      context.notice(errorMessage(error));
    }
  };
  const runAction = (action: RealBoardAction): Promise<unknown> => {
    switch (action) {
      case 'connect':
      case 'choose':
        return connection.connect();
      case 'reconnect':
        return connection.reconnect();
      case 'check':
        return connection.check();
      case 'restart':
        return connection.restartBoard();
      case 'disconnect':
        return connection.disconnect();
      case 'save':
        return saveCode();
      case 'recover':
        return recoverBoard();
      case 'disable-autorun':
        return disableAutorun();
    }
  };
  for (const [action, button] of buttons) {
    listen(button, 'click', () => {
      void runAction(action).catch((error: unknown) => {
        console.error('실제 보드 조작 중 오류가 났어요.', error);
      });
    });
  }

  // 펌웨어 굽기 안내 링크: 포트가 열려 있으면 놓아 준 뒤 이동한다(굽기 도구가 같은 포트를 새로 연다)
  listen(realPanel, 'click', (event) => {
    const anchor = (event.target as Element | null)?.closest?.('a[data-real-board-release-port]');
    if (!(anchor instanceof HTMLAnchorElement) || !connection.isOpen || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    const href = anchor.href;
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, 2000));
    void Promise.race([connection.disconnect().then(() => undefined), timeout]).then(() => {
      window.location.assign(href);
    });
  });

  // 5. 실제 보드에서 [실행]하면 결과가 콘솔이라 콘솔을 화면 안으로
  context.onLab('run', ({ target: runTarget }) => {
    if (runTarget === REAL_BOARD_TARGET_LABEL) {
      revealElement(root.querySelector('[data-lab-console]'), { block: 'center' });
    }
  });

  return {
    dispose() {
      for (const cleanup of cleanups.splice(0)) {
        cleanup();
      }
      if (lab.runTarget === target) {
        try {
          lab.setRunTarget(null);
        } catch {
          // 실행 중에 페이지를 떠남 — 셸도 함께 사라진다
        }
      }
      connection.dispose();
    },
  };
}

const module: LabModule = { manifest, mount };
export default module;
