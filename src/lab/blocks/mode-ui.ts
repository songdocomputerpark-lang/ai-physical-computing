/**
 * ESP32 실습실 블록 모드의 화면 논리(PLAN §8.3 P3-06, SPEC §6.2 "모드: 블록 ↔ 텍스트", 시나리오 B).
 *
 * 흉내 모듈 폴더 src/lab/modules/blocks/index.ts가 mountBlocksMode(ctx)를 부른다. HTML은 src/components/lab/blocks/BlocksPanel.astro.
 *
 * 두 모드
 *   코드 모드(처음): 지금까지의 실습실 그대로. 코드 칸 제목 아래에 [블록] [코드] 전환 단추만 더 보인다.
 *   블록 모드: 편집칸 위에 Blockly 작업판(도구 상자 한국어)이 열리고, 블록을 바꿀 때마다 편집칸에 MicroPython 코드가 바로 만들어진다
 *             (편집칸은 읽기 전용 "블록이 만든 코드" 칸 — 블록 = 코드). [실행]·[정지]·[공유 링크]·[.py 내려받기]는 그 코드를 그대로 쓴다.
 *   [코드로 바꾸기](또는 [코드] 단추): 블록이 만든 코드를 지금 예제 칸에 저장하고 코드 모드로 — 이제 코드를 한 줄씩 고쳐 [실행]한다.
 *     그 칸에 학생이 고쳐 둔 다른 코드가 있으면 먼저 묻는다(예제 원래 코드는 [초기화]로 되돌릴 수 있음). 코드 → 블록은 바꾸지 않는다(SPEC).
 *   [블록] 단추(코드 모드에서): 작업판으로 돌아간다. 편집칸에는 다시 블록이 만든 코드가 보이고, 고쳐 둔 코드는 저장된 그대로 남는다
 *     ([예제 불러오기]로 다시 열 수 있음).
 *   예제를 불러오거나 [초기화]·기록 지우기를 하면 코드 모드로 돌아간다.
 *
 * 가상 보드 배선: 블록이 쓰는 바깥 부품(터치 센서 등)을 board-link.ts로 뿌리 요소에 알린다(블록 모드), 코드 모드에서는 블록에서 온 코드의
 * 머리말 `# @part`를 읽어 알린다(code-wiring.ts). 보드 모듈이 이것을 받아 그리는 것은 공유 파일 변경 요청(.cache/phase3-requests/blockly.md).
 * 블록 전용 호환 모드(PD-27): compat.ts가 이 실습실 실행기의 run을 감싸, JSPI가 없으면 블록이 만든 코드 대신 같은 줄 수의 실행판을 보낸다.
 *
 * 저장(브라우저, [이 컴퓨터에서 내 기록 지우기]가 함께 지움): module:blocks:workspace(작업판 JSON), module:blocks:mode(blocks|code),
 * module:blocks:generated(마지막으로 만든 코드), module:blocks:converted(마지막으로 [코드로 바꾸기]한 코드).
 * 주소 ?blocks=1이면 블록 모드로 연다(차시 링크용). ?example=·공유 링크(#code=)로 열면 저장된 모드와 상관없이 코드 모드.
 *
 * 테스트가 읽는 값: [data-blocks]의 data-blocks-mode·data-blocks-ready(no|loading|yes|failed)·data-blocks-block-count·data-blocks-parts
 * (배선 id:부품:핀 목록)·data-blocks-conflicts·data-blocks-compat(마지막 [실행]의 exec|edited|off), 실습실 뿌리의 data-block-mode,
 * data-board-wiring-override. 작업판 칸([data-blocks-workspace])의 apcBlocks 속성 { Blockly, workspace, kit, program() } — 브라우저 테스트가
 * 블록 연결 자리를 계산할 때만 쓴다.
 */
import { Compartment, EditorState, StateEffect } from '@codemirror/state';
import type * as BlocklyCore from 'blockly/core';
import { EditorView } from '@codemirror/view';
import { readItem, removeItem, writeItem } from '../../lib/storage.ts';
import { editorStorageName } from '../controls/autosave.ts';
import type { LabController } from '../controls/lab-shell.ts';
import type { LabModuleContext, LabModuleHandle } from '../modules/types.ts';
import type { RuntimeInfo } from '../runtime/protocol.ts';
import { blocklyMediaPath } from '../vendor-paths.ts';
import { announceBoardWiring } from './board-link.ts';
import type { WorkspaceSvg } from './blockly-types.ts';
import { isBlocksCode, type PinConflict } from './catalog.ts';
import { wiringFromBlocksCode } from './code-wiring.ts';
import { chooseRunCode, compatMessage } from './compat.ts';
import type { GeneratedProgram } from './generator.ts';
import type { BlocksKit } from './kit.ts';
import { loadBlocksKit } from './loader.ts';
import { BLOCKS_STORAGE, initialMode, isEditingKey, needsConvertConfirm, type BlocksMode } from './mode-rules.ts';
import { findCommPreset } from './comm/index.ts';
import { DEFAULT_PRESET_ID, findPreset } from './presets.ts';

/** 작업판 JSON을 저장하는 간격(밀리초) */
const WORKSPACE_SAVE_DELAY_MS = 400;

/** 블록 경고 아이콘의 id(Blockly setWarningText의 두 번째 인자) */
const PIN_WARNING_ID = 'apc-pins';

/** 좁은 화면(도구 상자를 위로) */
const NARROW_QUERY = '(max-width: 40rem)';

interface Elements {
  readonly container: HTMLElement;
  readonly bar: HTMLElement;
  readonly area: HTMLElement;
  readonly modeButtons: readonly HTMLButtonElement[];
  readonly presetSelect: HTMLSelectElement | null;
  readonly presetLoad: HTMLButtonElement | null;
  readonly toCode: HTMLButtonElement | null;
  readonly status: HTMLElement | null;
  readonly workspaceHost: HTMLElement;
  readonly warnings: HTMLElement | null;
  readonly compatNote: HTMLElement | null;
  readonly dialog: HTMLDialogElement | null;
  readonly dialogTitle: HTMLElement | null;
  readonly dialogText: HTMLElement | null;
  readonly dialogConfirm: HTMLButtonElement | null;
  readonly dialogCancel: HTMLButtonElement | null;
}

function findElements(panel: HTMLElement | null): Elements | null {
  const container = panel?.querySelector<HTMLElement>('[data-blocks]') ?? null;
  const bar = container?.querySelector<HTMLElement>('[data-blocks-bar]') ?? null;
  const area = container?.querySelector<HTMLElement>('[data-blocks-area]') ?? null;
  const workspaceHost = area?.querySelector<HTMLElement>('[data-blocks-workspace]') ?? null;
  if (!container || !bar || !area || !workspaceHost) {
    return null;
  }
  const q = <T extends Element>(selector: string) => container.querySelector<T>(selector);
  return {
    container,
    bar,
    area,
    modeButtons: [...container.querySelectorAll<HTMLButtonElement>('[data-blocks-mode-button]')],
    presetSelect: q('[data-blocks-preset]'),
    presetLoad: q('[data-blocks-preset-load]'),
    toCode: q('[data-blocks-to-code]'),
    status: q('[data-blocks-status]'),
    workspaceHost,
    warnings: q('[data-blocks-warnings]'),
    compatNote: q('[data-blocks-compat-note]'),
    dialog: q('[data-blocks-dialog]'),
    dialogTitle: q('[data-blocks-dialog-title]'),
    dialogText: q('[data-blocks-dialog-text]'),
    dialogConfirm: q('[data-blocks-dialog-confirm]'),
    dialogCancel: q('[data-blocks-dialog-cancel]'),
  };
}

/** 편집칸을 읽기 전용으로(블록 모드) — 공유 편집기(src/lab/editor/)를 고치지 않고 뷰에 설정 칸을 하나 더 붙여 켜고 끈다 */
function createReadOnlySwitch(view: EditorView, onBlockedEdit: () => void): (readOnly: boolean) => void {
  const compartment = new Compartment();
  let installed = false;
  const blockedKeys = EditorView.domEventHandlers({
    keydown(event) {
      if (isEditingKey(event.key, { ctrl: event.ctrlKey, meta: event.metaKey, alt: event.altKey })) {
        onBlockedEdit();
      }
      return false;
    },
    paste() {
      onBlockedEdit();
      return false;
    },
  });
  return (readOnly) => {
    const extension = readOnly ? [EditorState.readOnly.of(true), blockedKeys] : [];
    if (!installed) {
      if (!readOnly) {
        return;
      }
      view.dispatch({ effects: StateEffect.appendConfig.of(compartment.of(extension)) });
      installed = true;
      return;
    }
    view.dispatch({ effects: compartment.reconfigure(extension) });
  };
}

export function mountBlocksMode(context: LabModuleContext): LabModuleHandle | void {
  const elements = findElements(context.panel);
  const editorSection = context.root.querySelector<HTMLElement>('.lab__editor');
  const editorHost = context.root.querySelector<HTMLElement>('[data-lab-editor]');
  if (!elements || !editorSection || !editorHost) {
    return;
  }
  const { lab, root } = context;
  const cleanups: (() => void)[] = [];
  const listen = <K extends keyof HTMLElementEventMap>(target: HTMLElement | null, type: K, handler: (event: HTMLElementEventMap[K]) => void) => {
    if (!target) {
      return;
    }
    target.addEventListener(type, handler);
    cleanups.push(() => target.removeEventListener(type, handler));
  };

  // 조각을 편집칸 자리로 옮긴다(전환 단추는 코드 칸 제목 아래, 작업판은 편집칸 바로 위, 대화 상자는 뿌리)
  const head = editorSection.querySelector('.lab__section-head');
  if (head) {
    head.after(elements.bar);
  } else {
    editorSection.prepend(elements.bar);
  }
  editorHost.before(elements.area);
  if (elements.dialog) {
    root.append(elements.dialog);
  }
  editorHost.setAttribute('aria-describedby', [editorHost.getAttribute('aria-describedby'), 'lab-blocks-code-title'].filter(Boolean).join(' '));

  let mode: BlocksMode = 'code';
  let kit: BlocksKit | null = null;
  let workspace: WorkspaceSvg | null = null;
  let program: GeneratedProgram | null = null;
  let generatedCode: string | null = readItem(BLOCKS_STORAGE.generated);
  let generatedExec: string | null = null;
  let limited = root.dataset.limited === 'yes';
  let settingCode = false;
  let entering: Promise<boolean> | null = null;
  let saveTimer: number | undefined;
  let regenerateFrame: number | undefined;
  let codeWiringTimer: number | undefined;
  let lastConflicts = '';
  let resizeObserver: ResizeObserver | null = null;

  const setStatus = (text: string, level: 'info' | 'error' = 'info') => {
    if (elements.status) {
      elements.status.textContent = text;
      elements.status.dataset.level = level;
    }
  };

  const setReadOnly = createReadOnlySwitch(lab.editor.view, () => {
    lab.showMessage('블록 모드에서는 코드를 바로 고칠 수 없어요. 고치려면 [코드로 바꾸기]를 눌러요.');
  });

  const renderMode = () => {
    elements.container.dataset.blocksMode = mode;
    root.dataset.blockMode = mode;
    elements.area.hidden = mode !== 'blocks';
    for (const button of elements.modeButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.blocksModeButton === mode));
    }
    if (elements.compatNote) {
      elements.compatNote.hidden = !(mode === 'blocks' && limited);
    }
    setReadOnly(mode === 'blocks');
  };

  /** 코드를 편집칸에 넣는다. save면 지금 예제 칸에 저장([코드로 바꾸기]) */
  const putCode = (code: string, save: boolean) => {
    settingCode = true;
    try {
      if (save) {
        // 같은 글자면 setValue가 아무 일도 하지 않아 저장되지 않으므로 구간 바꾸기로 저장을 일으킨다(되돌리기 기록에 남음)
        lab.replaceCode(0, lab.getCode().length, code, 'set');
      } else if (lab.getCode() !== code) {
        lab.setCode(code, { save: false });
      }
    } finally {
      settingCode = false;
    }
  };

  const renderConflicts = (conflicts: readonly PinConflict[]) => {
    const signature = JSON.stringify(conflicts.map((conflict) => [conflict.gpio, conflict.labels, [...conflict.blockIds].sort()]));
    elements.container.dataset.blocksConflicts = String(conflicts.length);
    if (signature === lastConflicts) {
      return;
    }
    lastConflicts = signature;
    if (elements.warnings) {
      elements.warnings.replaceChildren(
        ...conflicts.map((conflict) => {
          const item = document.createElement('li');
          item.textContent = `주의: ${conflict.text}`;
          item.dataset.gpio = String(conflict.gpio);
          return item;
        }),
      );
      elements.warnings.hidden = conflicts.length === 0;
    }
    if (workspace) {
      const flagged = new Map<string, string>();
      for (const conflict of conflicts) {
        for (const id of conflict.blockIds) {
          flagged.set(id, [flagged.get(id), conflict.text].filter(Boolean).join('\n'));
        }
      }
      for (const block of workspace.getAllBlocks(false)) {
        block.setWarningText(flagged.get(block.id) ?? null, PIN_WARNING_ID);
      }
    }
  };

  const saveWorkspaceSoon = () => {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      if (kit && workspace) {
        writeItem(BLOCKS_STORAGE.workspace, JSON.stringify(kit.Blockly.serialization.workspaces.save(workspace)));
      }
    }, WORKSPACE_SAVE_DELAY_MS);
  };

  const regenerate = () => {
    if (!kit || !workspace) {
      return;
    }
    try {
      program = kit.generate(workspace);
    } catch (error) {
      console.error('블록 코드를 만들지 못했어요.', error);
      setStatus(`블록을 코드로 바꾸지 못했어요: ${error instanceof Error ? error.message : String(error)}`, 'error');
      return;
    }
    generatedCode = program.code;
    generatedExec = program.execCode;
    writeItem(BLOCKS_STORAGE.generated, program.code);
    elements.container.dataset.blocksBlockCount = String(program.blockCount);
    elements.container.dataset.blocksParts = program.plan.parts
      .map((part) => `${part.wiring?.id ?? part.wiring?.part ?? part.kind}:${Object.values(part.pins).join(',')}`)
      .join(' ');
    renderConflicts(program.plan.conflicts);
    if (mode === 'blocks') {
      putCode(program.code, false);
      announceBoardWiring(root, program.wiring);
    }
    if (elements.status?.dataset.level !== 'error') {
      setStatus(program.blockCount === 0 ? '작업판이 비어 있어요. 왼쪽(휴대폰은 위쪽) 도구 상자에서 블록을 끌어 와요.' : '');
    }
  };

  const regenerateSoon = () => {
    if (regenerateFrame !== undefined) {
      return;
    }
    regenerateFrame = window.requestAnimationFrame(() => {
      regenerateFrame = undefined;
      regenerate();
    });
  };

  const loadState = (state: unknown): boolean => {
    if (!kit || !workspace) {
      return false;
    }
    const { Blockly } = kit;
    try {
      Blockly.Events.disable();
      workspace.clear();
      Blockly.serialization.workspaces.load(state as Record<string, unknown>, workspace);
      return true;
    } catch (error) {
      console.error('저장된 블록을 불러오지 못했어요.', error);
      workspace.clear();
      return false;
    } finally {
      Blockly.Events.enable();
    }
  };

  const ensureWorkspace = async (): Promise<boolean> => {
    if (workspace) {
      return true;
    }
    elements.container.dataset.blocksReady = 'loading';
    setStatus('블록 모드를 준비하는 중이에요… (처음 한 번만 조금 걸려요)');
    try {
      kit = await loadBlocksKit();
    } catch (error) {
      console.error('Blockly를 받지 못했어요.', error);
      elements.container.dataset.blocksReady = 'failed';
      setStatus('블록 모드를 불러오지 못했어요. 인터넷 연결을 확인하고 새로고침해 주세요. 코드 모드는 그대로 쓸 수 있어요.', 'error');
      return false;
    }
    // 블록 글자 폭을 글꼴이 준비된 뒤에 재도록 잠깐 기다린다(글꼴 없이 재면 블록 크기가 어긋난다)
    try {
      await Promise.race([document.fonts?.ready, new Promise((resolve) => window.setTimeout(resolve, 1500))]);
    } catch {
      // 글꼴을 못 기다려도 그린다
    }
    if (workspace) {
      return true;
    }
    const narrow = window.matchMedia?.(NARROW_QUERY).matches ?? false;
    const { Blockly } = kit;
    // 영역을 먼저 보여야 Blockly가 칸 크기를 잰다
    elements.area.hidden = false;
    workspace = Blockly.inject(elements.workspaceHost, {
      toolbox: kit.toolbox as unknown as BlocklyCore.utils.toolbox.ToolboxDefinition,
      theme: kit.theme,
      renderer: 'zelos',
      media: blocklyMediaPath(),
      sounds: false,
      trashcan: true,
      horizontalLayout: narrow,
      toolboxPosition: 'start',
      move: { scrollbars: true, drag: true, wheel: false },
      zoom: { controls: true, wheel: false, pinch: true, startScale: narrow ? 0.72 : 0.85, maxScale: 1.6, minScale: 0.45, scaleSpeed: 1.15 },
      grid: { spacing: 24, length: 2, colour: '#e2e8f0', snap: false },
    });
    const stored = readItem(BLOCKS_STORAGE.workspace);
    let loaded = false;
    if (stored) {
      try {
        loaded = loadState(JSON.parse(stored));
      } catch {
        loaded = false;
      }
    }
    if (!loaded) {
      loadState(findPreset(DEFAULT_PRESET_ID)?.state);
    }
    workspace.addChangeListener((event) => {
      if (event.isUiEvent) {
        return;
      }
      regenerateSoon();
      saveWorkspaceSoon();
    });
    if (typeof ResizeObserver === 'function') {
      resizeObserver = new ResizeObserver(() => {
        if (workspace) {
          Blockly.svgResize(workspace);
        }
      });
      resizeObserver.observe(elements.workspaceHost);
    }
    const hostWorkspace = workspace;
    Object.defineProperty(elements.workspaceHost, 'apcBlocks', {
      configurable: true,
      value: { Blockly, workspace: hostWorkspace, kit, program: () => program },
    });
    elements.container.dataset.blocksReady = 'yes';
    setStatus('');
    regenerate();
    return true;
  };

  const persistMode = () => {
    writeItem(BLOCKS_STORAGE.mode, mode);
  };

  const enterBlocks = (reason: 'user' | 'restore' | 'link'): Promise<boolean> => {
    if (mode === 'blocks' && workspace) {
      return Promise.resolve(true);
    }
    if (entering) {
      return entering;
    }
    entering = (async () => {
      mode = 'blocks';
      renderMode();
      const ready = await ensureWorkspace();
      if (!ready || !kit || !workspace) {
        mode = 'code';
        renderMode();
        return false;
      }
      if (mode !== 'blocks') {
        renderMode(); // 준비하는 동안 예제를 불러와 코드 모드로 돌아갔다 — 작업판을 다시 숨긴다
        return false;
      }
      kit.Blockly.svgResize(workspace);
      regenerate();
      persistMode();
      if (reason === 'user') {
        lab.showMessage('블록 모드예요. 블록을 끌어 놓으면 아래 편집칸에 코드가 바로 만들어져요. [실행]을 누르면 그 코드가 돌아요.');
      }
      return true;
    })().finally(() => {
      entering = null;
    });
    return entering;
  };

  /** 코드 모드로(convert면 블록이 만든 코드를 지금 예제 칸에 저장) */
  const leaveBlocks = (convert: boolean) => {
    if (convert && generatedCode !== null) {
      putCode(generatedCode, true);
      writeItem(BLOCKS_STORAGE.converted, generatedCode);
      lab.showMessage('블록이 만든 코드를 편집칸으로 옮겼어요. 이제 코드를 직접 고쳐 [실행]해 봐요.');
    }
    mode = 'code';
    renderMode();
    persistMode();
    syncCodeWiring();
  };

  const confirmDialog = (title: string, text: string, confirmLabel: string): Promise<boolean> => {
    const { dialog, dialogTitle, dialogText, dialogConfirm, dialogCancel } = elements;
    if (!dialog || typeof dialog.showModal !== 'function' || !dialogConfirm || !dialogCancel) {
      return Promise.resolve(window.confirm(`${title}\n${text}`));
    }
    if (dialogTitle) {
      dialogTitle.textContent = title;
    }
    if (dialogText) {
      dialogText.textContent = text;
    }
    dialogConfirm.textContent = confirmLabel;
    return new Promise((resolve) => {
      const finish = (value: boolean) => {
        dialogConfirm.removeEventListener('click', onConfirm);
        dialogCancel.removeEventListener('click', onCancel);
        dialog.removeEventListener('cancel', onCancel);
        if (dialog.open) {
          dialog.close();
        }
        resolve(value);
      };
      const onConfirm = () => finish(true);
      const onCancel = () => finish(false);
      dialogConfirm.addEventListener('click', onConfirm);
      dialogCancel.addEventListener('click', onCancel);
      dialog.addEventListener('cancel', onCancel);
      dialog.showModal();
      dialogCancel.focus();
    });
  };

  const convertToCode = async () => {
    if (mode !== 'blocks' || generatedCode === null) {
      return;
    }
    const example = lab.currentExample;
    let saved: string | null = null;
    try {
      saved = readItem(editorStorageName(lab.labId, example?.id ?? null));
    } catch {
      saved = null;
    }
    if (needsConvertConfirm(saved, example?.code ?? null, generatedCode, readItem(BLOCKS_STORAGE.converted))) {
      const title = example ? `"${example.title}" 예제 칸의 코드를 바꿀까요?` : '편집칸의 코드를 바꿀까요?';
      const ok = await confirmDialog(
        title,
        '이 칸에는 전에 고쳐 둔 코드가 저장돼 있어요. 블록이 만든 코드로 바꾸면 그 코드는 사라져요(예제 원래 코드는 [초기화]로 언제든 되돌릴 수 있어요).',
        '블록 코드로 바꾸기',
      );
      if (!ok) {
        return;
      }
    }
    leaveBlocks(true);
  };

  /** 코드 모드: 블록에서 온 코드의 머리말 배선을 알린다(아니면 알려 둔 배선을 거둔다) */
  function syncCodeWiring() {
    if (mode !== 'code') {
      return;
    }
    announceBoardWiring(root, wiringFromBlocksCode(lab.getCode()));
  }

  // ── 조작 잇기 ──
  for (const button of elements.modeButtons) {
    listen(button, 'click', () => {
      if (button.dataset.blocksModeButton === 'blocks') {
        void enterBlocks('user');
      } else {
        void convertToCode();
      }
    });
  }
  listen(elements.toCode, 'click', () => {
    void convertToCode();
  });
  listen(elements.presetLoad, 'click', async () => {
    // 기본 예시 → 통신 예시(P4-10) 차례로 찾는다(BlocksPanel.astro가 두 목록을 이어 그린다)
    const preset = findPreset(elements.presetSelect?.value) ?? findCommPreset(elements.presetSelect?.value);
    if (!preset || !kit || !workspace) {
      return;
    }
    if (workspace.getAllBlocks(false).length > 0) {
      const ok = await confirmDialog('예시를 불러올까요?', `지금 작업판의 블록을 지우고 "${preset.title}" 예시를 불러와요.`, '예시 불러오기');
      if (!ok) {
        return;
      }
    }
    loadState(preset.state);
    regenerate();
    saveWorkspaceSoon();
    lab.showMessage(`"${preset.title}" 블록 예시를 불러왔어요. ${preset.description}`);
  });

  context.onLab('code', ({ source }) => {
    if (settingCode) {
      return;
    }
    if (mode === 'blocks' && (source === 'example' || source === 'reset' || source === 'records-cleared')) {
      // 예제를 불러오거나 되돌렸다 — 학생이 고른 코드가 보이게 코드 모드로
      leaveBlocks(false);
      return;
    }
    if (mode === 'code') {
      window.clearTimeout(codeWiringTimer);
      if (source === 'edit' || source === 'param' || source === 'set') {
        // 타자·조절 막대: 잠시 모았다가 머리말(# @part) 배선을 다시 읽는다
        codeWiringTimer = window.setTimeout(syncCodeWiring, 250);
      } else {
        // 예제 불러오기·되돌리기·공유 링크: 보드가 같은 작업 안에서 새 코드의 배선을 그리게 바로 알린다
        // (lab-shell은 'example' 다음에 'code'를 보내므로 보드가 먼저 한 번 그린 뒤 같은 작업 안에서 곧바로 고쳐 그린다 — 화면에는 고친 것만 보임)
        syncCodeWiring();
      }
    }
  });
  context.onLab('records-cleared', () => {
    // [이 컴퓨터에서 내 기록 지우기]: 작업판을 처음 예시로, 모드는 코드로, 이 모듈이 저장한 것은 모두 지운다(지우기는 맨 마지막 —
    // 코드 모드로 돌아가며 모드를 다시 저장하므로)
    if (mode === 'blocks') {
      leaveBlocks(false);
    }
    if (kit && workspace) {
      loadState(findPreset(DEFAULT_PRESET_ID)?.state);
      regenerate();
    }
    window.clearTimeout(saveTimer);
    generatedCode = null;
    generatedExec = null;
    for (const name of Object.values(BLOCKS_STORAGE)) {
      removeItem(name);
    }
    announceBoardWiring(root, null);
  });

  const onReady = (info: RuntimeInfo) => {
    limited = info.limited;
    renderMode();
  };
  cleanups.push(context.runtime.on('ready', onReady));

  // 블록 전용 호환 모드: [실행]이 파이썬에 보낼 코드를 고른다(실습실 틀의 공식 자리 — lab.setRunCodeTransform)
  lab.setRunCodeTransform((code) => {
    limited = root.dataset.limited === 'yes' || limited;
    const pair = generatedCode !== null && generatedExec !== null ? { code: generatedCode, execCode: generatedExec } : null;
    const choice = chooseRunCode(code, limited, pair);
    elements.container.dataset.blocksCompat = choice.decision;
    const message = compatMessage(choice.decision);
    if (message) {
      lab.showMessage(message);
    }
    return choice.code;
  });
  cleanups.push(() => lab.setRunCodeTransform(null));

  // ── 처음 모드 ──
  renderMode();
  const initial = initialMode(window.location.search, window.location.hash, readItem(BLOCKS_STORAGE.mode));
  if (initial === 'blocks') {
    void enterBlocks(new URLSearchParams(window.location.search).has('blocks') ? 'link' : 'restore');
  } else if (isBlocksCode(lab.getCode())) {
    syncCodeWiring();
  }

  return {
    dispose() {
      window.clearTimeout(saveTimer);
      window.clearTimeout(codeWiringTimer);
      if (regenerateFrame !== undefined) {
        window.cancelAnimationFrame(regenerateFrame);
      }
      resizeObserver?.disconnect();
      for (const cleanup of cleanups.splice(0)) {
        cleanup();
      }
      workspace?.dispose();
      workspace = null;
    },
  };
}

/** 테스트·다른 모듈이 컨트롤러 타입을 쓰려고(lab-shell.ts의 LabController) */
export type { LabController };
