/**
 * 실물 점검 도우미 화면(PLAN §8.3 P3-11, 부록 B-2 Phase 3 항목 · 운영자 할 일 2번).
 *
 * 하는 일
 *   1. 위쪽 연결 칸: 실제 보드 연결·확인·다시 시작·되찾기·자동 실행 파일 끄기(구역 E의 BoardConnection·describeRealBoard를 그대로 씀 —
 *      ESP32 실습실 [실제 보드] 탭과 같은 판별·같은 글이라 결과가 다르지 않다).
 *   2. 항목마다: 왜 확인하는지 · 예상 시간(추정) · 배선 그림(배선이 있으면) · 보낼 코드 · [보드에 보내기] · 눈으로 본 것 예/아니오 · 메모.
 *   3. [결과 복사]: 답을 모아 PROGRESS.md에 붙일 마크다운을 만든다(report.ts).
 *   4. 답은 이 컴퓨터의 브라우저에만 남는다(storage.ts `board-check:answers`). [이 컴퓨터에서 내 기록 지우기]가 함께 지운다.
 *
 * 규칙
 *   - 포트는 한 번 열어 두고 항목마다 코드만 보낸다(한 포트에 주인 하나 — 다른 탭·Thonny가 열어 두면 연결이 안 된다).
 *   - 코드가 input()을 쓰면 실행 중에 입력줄이 열린다(P3-08 규칙: 영어·숫자·기호 + \r, 되울림 한 번).
 *   - 코드가 사이트 보드 라이브러리를 부르면 보드에 없을 때만 먼저 올린다(board-files.ts provisionLibraries).
 *   - seconds가 있는 항목은 그만큼 지켜본 뒤 [정지](Ctrl-C)를 보낸다. 항목이 끝없이 도는 코드를 쓰지 않는다(items.ts).
 */
import { RECORDS_CLEARED_EVENT } from '../../controls/records.ts';
import { readJson, removeItem, writeJson } from '../../../lib/storage.ts';
import { ACTION_LABELS, describeRealBoard, type RealBoardAction } from '../../modules/real-board/status-text.ts';
import { BOARD_LIBRARIES } from '../board-library-files.ts';
import { librariesNeededBy } from '../board-libraries.ts';
import { BoardConnection, type BoardConnectionSnapshot } from '../../serial/board-connection.ts';
import { provisionLibraries } from '../../serial/board-files.ts';
import { InputEchoFilter, prepareBoardInputLine } from '../../serial/board-input.ts';
import { errorMessage } from '../../serial/errors.ts';
import { detectSerialSupport } from '../../serial/support.ts';
import { CHECK_ITEMS, totalMinutes, type CheckItem } from './items.ts';
import { buildReport, itemVerdict, parseRecords, VERDICT_TEXT, type CheckAnswer, type CheckRecords, type ItemRecord } from './report.ts';
import { createWiringFigure } from './wiring-figure.ts';

/** 답을 저장하는 이름(src/lib/storage.ts 규칙 — 머리말 ai-physical-computing:) */
export const CHECK_STORAGE_NAME = 'board-check:answers';

const ANSWER_LABELS: readonly { readonly value: CheckAnswer; readonly text: string }[] = [
  { value: 'yes', text: '예' },
  { value: 'no', text: '아니오' },
  { value: 'unknown', text: '모름' },
];

/** 콘솔에 남기는 줄 수 상한(오래 쓰면 브라우저가 느려지지 않게) */
const CONSOLE_LIMIT = 400;

function text(tag: string, className: string, content: string): HTMLElement {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = content;
  return element;
}

export function mountBoardCheck(root: HTMLElement): (() => void) | void {
  const statusBox = root.querySelector<HTMLElement>('[data-check-status]');
  const statusTitle = root.querySelector<HTMLElement>('[data-check-status-title]');
  const statusDetail = root.querySelector<HTMLElement>('[data-check-status-detail]');
  const infoBox = root.querySelector<HTMLElement>('[data-check-info]');
  const notesBox = root.querySelector<HTMLElement>('[data-check-notes]');
  const actionsBox = root.querySelector<HTMLElement>('[data-check-actions]');
  const list = root.querySelector<HTMLElement>('[data-check-items]');
  const consoleBox = root.querySelector<HTMLElement>('[data-check-console]');
  const progressText = root.querySelector<HTMLElement>('[data-check-progress]');
  const copyButton = root.querySelector<HTMLButtonElement>('[data-check-copy]');
  const reportBox = root.querySelector<HTMLTextAreaElement>('[data-check-report]');
  const inputForm = root.querySelector<HTMLFormElement>('[data-check-input]');
  const inputField = root.querySelector<HTMLInputElement>('[data-check-input-field]');
  if (!list || !actionsBox || !consoleBox) {
    return;
  }

  const support = detectSerialSupport();
  const connection = new BoardConnection();
  let snapshot: BoardConnectionSnapshot = connection.snapshot;
  let records: CheckRecords = parseRecords(readJson<unknown>(CHECK_STORAGE_NAME, {}));
  let running: CheckItem | null = null;
  let stopTimer: ReturnType<typeof setTimeout> | null = null;
  const cleanups: (() => void)[] = [];

  // ── 콘솔 ──
  const appendConsole = (value: string, kind: 'out' | 'notice' | 'input' = 'out') => {
    if (value === '') {
      return;
    }
    const line = document.createElement('span');
    line.dataset.kind = kind;
    line.textContent = kind === 'out' ? value : `${kind === 'input' ? '[입력]' : '[알림]'} ${value}\n`;
    consoleBox.append(line);
    while (consoleBox.childElementCount > CONSOLE_LIMIT) {
      consoleBox.firstElementChild?.remove();
    }
    consoleBox.scrollTop = consoleBox.scrollHeight;
  };
  const notice = (value: string) => appendConsole(value, 'notice');

  // ── 답 저장·진행률 ──
  const save = () => {
    writeJson(CHECK_STORAGE_NAME, records);
  };
  const setRecord = (id: string, patch: Partial<ItemRecord>) => {
    const before = records[id] ?? { answers: {} };
    records = { ...records, [id]: { ...before, ...patch, answers: { ...before.answers, ...(patch.answers ?? {}) } } };
    save();
    renderProgress();
    renderVerdict(id);
  };

  const renderVerdict = (id: string) => {
    const item = CHECK_ITEMS.find((candidate) => candidate.id === id);
    const card = list.querySelector<HTMLElement>(`[data-check-item="${id}"]`);
    if (!item || !card) {
      return;
    }
    const verdict = itemVerdict(item, records[id]);
    card.dataset.verdict = verdict;
    const badge = card.querySelector<HTMLElement>('[data-check-verdict]');
    if (badge) {
      badge.textContent = VERDICT_TEXT[verdict];
    }
  };

  const renderProgress = () => {
    const done = CHECK_ITEMS.filter((item) => itemVerdict(item, records[item.id]) !== 'todo').length;
    if (progressText) {
      progressText.textContent = `${CHECK_ITEMS.length}개 항목 가운데 ${done}개에 답했어요(전체 예상 ${totalMinutes()}분, 추정).`;
    }
    root.dataset.checkAnswered = String(done);
  };

  // ── 연결 칸 ──
  const renderConnection = () => {
    const view = describeRealBoard(snapshot, support);
    root.dataset.checkState = snapshot.state;
    root.dataset.checkVerdict = String(snapshot.verdict ?? '');
    root.dataset.checkTone = view.tone;
    if (statusTitle) {
      statusTitle.textContent = view.title;
    }
    if (statusDetail) {
      // 연결된 뒤 설명은 이 화면의 단추 이름으로(공용 글은 실습실의 [실행]·[보드에 저장]을 가리킨다)
      statusDetail.textContent =
        snapshot.state === 'ready'
          ? '항목의 [보드에 보내기]를 누르면 그 항목의 시험 코드가 이 보드에서 돌아요(보낼 때마다 보드를 새로 시작해요). 보낸 코드는 보드에 저장되지 않아요.'
          : view.detail;
    }
    if (statusBox) {
      statusBox.dataset.tone = view.tone;
    }
    if (infoBox) {
      infoBox.replaceChildren();
      if (view.info) {
        for (const [label, value] of [
          ['펌웨어', view.info.firmware],
          ['보드', view.info.machine],
          ['USB 칩(참고)', view.info.chip],
        ] as const) {
          infoBox.append(text('div', 'board-check__info-item', `${label}: ${value}`));
        }
      }
      infoBox.hidden = view.info === null;
    }
    if (notesBox) {
      notesBox.replaceChildren(...view.notes.map((note) => text('li', '', note)));
      notesBox.hidden = view.notes.length === 0;
    }
    const wanted: readonly RealBoardAction[] = view.actions.filter((action) => action !== 'save');
    actionsBox.replaceChildren(
      ...wanted.map((action) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `lab-button${action === view.primary ? ' lab-button--primary' : ''}`;
        button.dataset.checkAction = action;
        button.textContent = view.actionLabels[action] ?? ACTION_LABELS[action];
        button.addEventListener('click', () => void onAction(action));
        return button;
      }),
    );
    const busy = snapshot.state === 'running' || snapshot.state === 'checking' || snapshot.state === 'opening' || snapshot.state === 'recovering';
    for (const button of list.querySelectorAll<HTMLButtonElement>('[data-check-send]')) {
      button.disabled = busy;
    }
    for (const button of list.querySelectorAll<HTMLButtonElement>('[data-check-stop]')) {
      const card = button.closest<HTMLElement>('[data-check-item]');
      button.hidden = running === null || card?.dataset.checkItem !== running.id;
    }
  };

  const onAction = async (action: RealBoardAction) => {
    try {
      if (action === 'connect' || action === 'choose') {
        await connection.connect();
      } else if (action === 'reconnect') {
        await connection.reconnect();
      } else if (action === 'check') {
        await connection.check();
      } else if (action === 'restart') {
        await connection.restartBoard();
      } else if (action === 'recover') {
        await connection.recover();
      } else if (action === 'disable-autorun') {
        const before = snapshot.autorun?.file ?? null;
        const next = await connection.disableAutorun();
        const renamed = next.autorun?.disabledAs;
        notice(renamed ? `${before ?? '자동 실행 파일'} → ${renamed}으로 이름을 바꿨어요(코드는 지워지지 않아요).` : '자동 실행 파일을 끄지 못했어요.');
      } else if (action === 'disconnect') {
        await connection.disconnect();
      }
    } catch (error) {
      notice(errorMessage(error));
    }
  };

  // ── 항목 카드 ──
  const clearStopTimer = () => {
    if (stopTimer !== null) {
      clearTimeout(stopTimer);
      stopTimer = null;
    }
  };

  const send = async (item: CheckItem, card: HTMLElement) => {
    if (running) {
      return;
    }
    const result = card.querySelector<HTMLElement>('[data-check-result]');
    const outputBox = card.querySelector<HTMLElement>('[data-check-output]');
    if (support.level === 'unsupported') {
      if (result) {
        result.textContent = '이 브라우저에서는 실제 보드를 연결할 수 없어요. 컴퓨터용 Chrome이나 Edge로 열어요.';
      }
      return;
    }
    // 연결이 없으면 이 클릭 안에서 포트 선택 창을 연다(첫 await 앞이어야 브라우저가 허락한다)
    const connectFirst = !connection.isOpen ? connection.connect() : null;
    running = item;
    root.dataset.checkRunning = item.id;
    renderConnection();
    if (result) {
      result.textContent = '보드에 보내는 중이에요…';
    }
    const collected: string[] = [];
    const echo = new InputEchoFilter();
    let finished = false;
    const pushOut = (value: string) => {
      if (value === '') {
        return;
      }
      collected.push(value);
      appendConsole(value);
    };
    const wantsInput = item.code.includes('input(');
    const sendInputLine = (value: string) => {
      const line = prepareBoardInputLine(value);
      if (line.droppedNonAscii) {
        notice('실제 보드는 영어·숫자·기호만 받아요(한글은 빼고 보냈어요).');
      }
      if (connection.sendInput(line.bytes)) {
        echo.expect(line.text);
        appendConsole(line.text, 'input');
      } else {
        notice('지금은 보드로 글자를 보낼 수 없어요.');
      }
    };
    const onSubmit = (event: Event) => {
      event.preventDefault();
      if (!inputField) {
        return;
      }
      const value = inputField.value;
      inputField.value = '';
      sendInputLine(value);
    };
    if (wantsInput && inputForm) {
      inputForm.hidden = false;
      inputForm.addEventListener('submit', onSubmit);
      inputField?.focus();
    }
    try {
      if (connectFirst) {
        await connectFirst;
      }
      const needed = librariesNeededBy(item.code, BOARD_LIBRARIES);
      const answer = await connection.run(item.code, {
        onStdout: (value) => pushOut(echo.push(value)),
        ...(needed.length > 0
          ? {
              prepare: async (tools) => {
                const provisioned = await provisionLibraries(tools, needed, {
                  onUpload: (path, size) => notice(`먼저 보드에 올려요: ${path}(${size.toLocaleString('ko-KR')}바이트)`),
                });
                for (const file of provisioned.filter((entry) => entry.status === 'different')) {
                  notice(`${file.path}이(가) 사이트판과 달라요 — 덮어쓰지 않았어요(ESP32 실습실 [보드에 저장]으로 바꿀 수 있어요).`);
                }
              },
            }
          : {}),
        onStage: (stage) => {
          if (stage === 'running' && item.seconds && stopTimer === null) {
            stopTimer = setTimeout(() => {
              stopTimer = null;
              if (!finished) {
                connection.stop();
              }
            }, item.seconds * 1000);
          }
        },
      });
      finished = true;
      pushOut(echo.release());
      const run = answer.outcome === 'ok' ? 'ok' : answer.outcome === 'error' ? 'error' : 'stopped';
      if (result) {
        result.textContent =
          run === 'ok'
            ? '코드가 끝났어요. 아래 질문에 답해 주세요.'
            : run === 'error'
              ? `보드가 오류로 멈췄어요: ${answer.error?.message ?? '(알 수 없음)'}`
              : '[정지]로 멈췄어요. 아래 질문에 답해 주세요.';
      }
      if (answer.softReboot) {
        notice('코드가 sys.exit()·machine.soft_reset()으로 끝나 보드가 소프트 리셋됐어요.');
      }
      if (answer.bootInterrupted) {
        notice('boot.py가 끝나지 않는 반복이라 멈춤 신호(Ctrl-C)로 멈춘 뒤 코드를 보냈어요.');
      }
      if (answer.stopUnconfirmed) {
        notice('보드가 [정지]에 대답하지 않았어요 — [보드 되찾기]를 눌러요.');
      }
      const output = collected.join('');
      if (outputBox) {
        outputBox.textContent = output.trim();
        outputBox.hidden = output.trim() === '';
      }
      setRecord(item.id, { run, output });
    } catch (error) {
      finished = true;
      pushOut(echo.release());
      const message = errorMessage(error);
      if (result) {
        result.textContent = `보내지 못했어요: ${message}`;
      }
      notice(message);
      setRecord(item.id, { run: 'error' });
    } finally {
      clearStopTimer();
      running = null;
      delete root.dataset.checkRunning;
      if (wantsInput && inputForm) {
        inputForm.hidden = true;
        inputForm.removeEventListener('submit', onSubmit);
      }
      renderConnection();
    }
  };

  const renderItem = (item: CheckItem, index: number): HTMLElement => {
    const card = document.createElement('li');
    card.className = 'board-check__item';
    card.dataset.checkItem = item.id;
    card.dataset.verdict = itemVerdict(item, records[item.id]);

    const head = document.createElement('div');
    head.className = 'board-check__item-head';
    const heading = document.createElement('h3');
    heading.className = 'board-check__item-title';
    heading.id = `check-item-${item.id}`;
    heading.textContent = `${index + 1}. ${item.title}`;
    const badge = text('span', 'board-check__badge', VERDICT_TEXT[itemVerdict(item, records[item.id])]);
    badge.dataset.checkVerdict = '';
    head.append(heading, badge, text('span', 'board-check__minutes', `예상 ${item.minutes}분(추정) · 부록 B-2 ${item.b2}번`));
    card.append(head, text('p', 'board-check__why', item.why));

    if (item.wiring.length > 0) {
      const figureBox = document.createElement('figure');
      figureBox.className = 'board-check__figure';
      figureBox.dataset.checkFigure = item.id;
      try {
        const figure = createWiringFigure(item.wiring);
        figureBox.append(figure.svg);
        const caption = document.createElement('figcaption');
        caption.append(text('span', 'board-check__figure-title', '배선'));
        const pins = document.createElement('ul');
        pins.className = 'board-check__pins';
        pins.append(...figure.parts.map((part) => text('li', '', `${part.label}: ${part.pins}`)));
        caption.append(pins);
        const warnings = figure.issues.filter((issue) => issue.level !== 'info');
        if (warnings.length > 0) {
          const box = document.createElement('ul');
          box.className = 'board-check__issues';
          box.append(...warnings.map((issue) => text('li', '', `${issue.level === 'error' ? '오류' : '주의'}: ${issue.text}`)));
          caption.append(box);
        }
        figureBox.append(caption);
      } catch {
        figureBox.append(text('p', '', '배선 그림을 그리지 못했어요. 아래 코드의 핀 번호대로 꽂아 주세요.'));
      }
      card.append(figureBox);
    }
    if (item.prepare) {
      card.append(text('p', 'board-check__prepare', `먼저 할 일: ${item.prepare}`));
    }

    const codeBox = document.createElement('details');
    codeBox.className = 'board-check__code';
    const summary = document.createElement('summary');
    summary.textContent = '보낼 코드 보기';
    const pre = document.createElement('pre');
    pre.dataset.checkCode = '';
    pre.textContent = item.code;
    codeBox.append(summary, pre);
    card.append(codeBox);

    const controls = document.createElement('div');
    controls.className = 'board-check__controls';
    const sendButton = document.createElement('button');
    sendButton.type = 'button';
    sendButton.className = 'lab-button lab-button--primary';
    sendButton.dataset.checkSend = item.id;
    sendButton.textContent = '보드에 보내기';
    sendButton.addEventListener('click', () => void send(item, card));
    const stopButton = document.createElement('button');
    stopButton.type = 'button';
    stopButton.className = 'lab-button';
    stopButton.dataset.checkStop = item.id;
    stopButton.textContent = '정지';
    stopButton.hidden = true;
    stopButton.addEventListener('click', () => {
      clearStopTimer();
      connection.stop();
    });
    controls.append(sendButton, stopButton);
    card.append(controls, (() => {
      const result = text('p', 'board-check__result', '');
      result.dataset.checkResult = '';
      result.setAttribute('role', 'status');
      return result;
    })());

    const output = document.createElement('pre');
    output.className = 'board-check__output';
    output.dataset.checkOutput = '';
    output.hidden = true;
    const savedOutput = records[item.id]?.output?.trim();
    if (savedOutput) {
      output.textContent = savedOutput;
      output.hidden = false;
    }
    card.append(output);

    if (item.expect && item.expect.length > 0) {
      const box = document.createElement('ul');
      box.className = 'board-check__expect';
      box.append(...item.expect.map((line) => text('li', '', line)));
      card.append(box);
    }

    const questions = document.createElement('div');
    questions.className = 'board-check__questions';
    for (const question of item.questions) {
      const group = document.createElement('fieldset');
      group.className = 'board-check__question';
      const legend = document.createElement('legend');
      legend.textContent = question.text;
      group.append(legend);
      for (const option of ANSWER_LABELS) {
        const id = `check-${item.id}-${question.id}-${option.value}`;
        const label = document.createElement('label');
        label.className = 'board-check__answer';
        label.htmlFor = id;
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.id = id;
        radio.name = `check-${item.id}-${question.id}`;
        radio.value = option.value;
        radio.dataset.checkAnswer = `${item.id}:${question.id}`;
        radio.checked = records[item.id]?.answers?.[question.id] === option.value;
        radio.addEventListener('change', () => {
          if (radio.checked) {
            setRecord(item.id, { answers: { [question.id]: option.value } });
          }
        });
        label.append(radio, document.createTextNode(` ${option.text}`));
        group.append(label);
      }
      questions.append(group);
    }
    card.append(questions);

    const noteLabel = document.createElement('label');
    noteLabel.className = 'board-check__note';
    const noteId = `check-note-${item.id}`;
    noteLabel.htmlFor = noteId;
    noteLabel.append(document.createTextNode('메모(값·다른 점을 적어 주세요) '));
    const noteInput = document.createElement('input');
    noteInput.type = 'text';
    noteInput.id = noteId;
    noteInput.dataset.checkNote = item.id;
    noteInput.value = records[item.id]?.note ?? '';
    noteInput.addEventListener('change', () => setRecord(item.id, { note: noteInput.value }));
    noteLabel.append(noteInput);
    card.append(noteLabel);
    return card;
  };

  list.replaceChildren(...CHECK_ITEMS.map((item, index) => renderItem(item, index)));

  // ── [결과 복사] ──
  copyButton?.addEventListener('click', () => {
    const view = describeRealBoard(snapshot, support);
    const report = buildReport(CHECK_ITEMS, records, {
      ...(view.info ? { board: `${view.info.machine} · ${view.info.firmware} · ${view.info.chip}` } : {}),
      browser: navigator.userAgent,
    });
    if (reportBox) {
      reportBox.value = report;
      reportBox.hidden = false;
    }
    const done = () => {
      copyButton.textContent = '복사했어요';
      window.setTimeout(() => {
        copyButton.textContent = '결과 복사';
      }, 2000);
    };
    void (async () => {
      try {
        await navigator.clipboard.writeText(report);
        done();
      } catch {
        reportBox?.select();
        copyButton.textContent = '아래 글을 직접 복사해 주세요';
      }
    })();
  });

  // ── 기록 지우기(실습실과 같은 단추) ──
  const onCleared = () => {
    records = {};
    removeItem(CHECK_STORAGE_NAME);
    for (const radio of list.querySelectorAll<HTMLInputElement>('[data-check-answer]')) {
      radio.checked = false;
    }
    for (const note of list.querySelectorAll<HTMLInputElement>('[data-check-note]')) {
      note.value = '';
    }
    for (const box of list.querySelectorAll<HTMLElement>('[data-check-output]')) {
      box.textContent = '';
      box.hidden = true;
    }
    for (const item of CHECK_ITEMS) {
      renderVerdict(item.id);
    }
    renderProgress();
  };
  document.addEventListener(RECORDS_CLEARED_EVENT, onCleared);
  cleanups.push(() => document.removeEventListener(RECORDS_CLEARED_EVENT, onCleared));

  cleanups.push(
    connection.subscribe((next) => {
      snapshot = next;
      renderConnection();
    }),
  );
  renderConnection();
  renderProgress();
  root.dataset.checkReady = 'yes';

  // 펌웨어 굽기 안내 링크는 포트를 먼저 놓아 준다(한 포트에 주인 하나)
  for (const link of root.querySelectorAll<HTMLAnchorElement>('[data-check-release-port]')) {
    link.addEventListener('click', () => void connection.disconnect().catch(() => undefined));
  }
  return () => {
    clearStopTimer();
    for (const cleanup of cleanups) {
      cleanup();
    }
    connection.dispose();
  };
}
