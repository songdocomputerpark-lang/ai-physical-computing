/**
 * 파이썬 코드 에디터(PLAN §8.2 P2-02, §3.1 CodeMirror 6, SPEC §9 접근성).
 *
 * CodeMirror 6를 필요한 부품만 모아 만든다(basicSetup은 쓰지 않는다 — 자동 완성·검색 창처럼 초보자에게 낯선 기능을 빼고
 * 번들도 작게). 들어가는 것: 줄 번호, 현재 줄 표시, 파이썬 구문 강조(색은 theme.ts), 괄호 짝 표시, 되돌리기(Ctrl+Z),
 * Tab 들여쓰기(4칸 공백), Enter 뒤 자동 들여쓰기, 한국어 자리 글, 글자 크기 단계(font-size.ts), Ctrl+Enter로 [실행].
 *
 * 키보드 접근성(WCAG 2.1.2 "키보드 함정 없음"): Tab이 들여쓰기이므로 편집칸에서 키보드로 빠져나가려면 **Esc를 누른 뒤 Tab**을
 * 누른다. CodeMirror 6가 Esc 뒤 2초 동안 Tab을 브라우저 기본 동작(초점 이동)으로 넘기는 "tab focus mode"를 갖고 있어
 * (@codemirror/view 6.43.12 handlers.keydown, 2026-09-16 소스로 확인) 그것을 쓰고, 안내 문장(TAB_HINT)을 편집칸 **위**에 두어
 * aria-describedby로도 붙인다.
 * 여기에 한 가지를 더했다(2026-09-17 Phase 2 검토 반영): 조작 줄에서 **Tab으로 편집칸에 막 들어왔을 때**는 같은 모드를 켜 두어
 * Tab을 한 번 더 누르면 그대로 다음 칸으로 지나간다(EditorView.setTabFocusMode(ms) — 다른 키를 누르면 바로 꺼진다). 예전에는
 * 키보드로 지나가던 학생이 Tab을 누를 때마다 첫 줄에 공백 4칸이 조용히 들어갔다. 글을 쓰거나 화살표로 움직인 뒤의 Tab은 그대로
 * 들여쓰기이고, 마우스로 누른 편집칸의 Tab도 들여쓰기다(편집칸을 떠나거나 마우스로 누르면 "지나가기"를 끈다).
 *
 *   const editor = createPythonEditor({ parent, doc: "print('안녕')\n", onChange: (code) => autosave.update(code), onRun });
 *   editor.getValue() / editor.setValue(code) / editor.focus() / editor.setFontSize(17) / editor.destroy()
 */
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { python } from '@codemirror/lang-python';
import { bracketMatching, indentOnInput, indentUnit, syntaxHighlighting } from '@codemirror/language';
import { EditorState, type Extension } from '@codemirror/state';
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  placeholder,
} from '@codemirror/view';
import { DEFAULT_FONT_SIZE_PX, fontSizeCss } from './font-size.ts';
import { editorTheme, pythonHighlightStyle } from './theme.ts';

/** 편집칸 옆에 보이는 키보드 안내(aria-describedby로도 읽힌다) */
export const TAB_HINT =
  'Tab 키는 들여쓰기예요. 다른 칸으로 가려면 Esc를 누른 뒤 Tab을 눌러요(Tab으로 막 들어왔을 때는 Tab만 눌러도 지나가요). Ctrl+Enter로 실행해요.';

/** 이 시간 안에 Tab 키가 눌린 뒤 편집칸이 초점을 받으면 "Tab으로 들어왔다"로 본다(밀리초) */
export const TAB_ENTRY_WINDOW_MS = 1_000;

/** Tab으로 들어온 뒤 Tab 한 번으로 지나갈 수 있는 최대 시간(밀리초). 사실상 "다른 키를 누를 때까지"다(CodeMirror가 다른 키에서 끈다). */
export const TAB_ENTRY_PASS_MS = 10 * 60_000;

/** 기본 자리 글(코드가 비었을 때) */
export const DEFAULT_PLACEHOLDER = "여기에 파이썬 코드를 써요. 예: print('안녕')";

/** 들여쓰기 한 칸(파이썬 관례 4칸 공백) */
export const INDENT_UNIT = '    ';

export interface PythonEditorOptions {
  /** 에디터를 넣을 요소 */
  readonly parent: HTMLElement;
  /** 처음 코드 */
  readonly doc?: string;
  /** 코드가 비었을 때 보이는 안내 */
  readonly placeholder?: string;
  /** 화면 낭독기가 읽는 편집칸 이름 */
  readonly ariaLabel?: string;
  /** 안내 문장 요소의 id(aria-describedby) */
  readonly describedBy?: string;
  /** 처음 글자 크기(px, font-size.ts 단계) */
  readonly fontSizePx?: number;
  /** 코드가 바뀔 때(사용자 편집·setValue 모두) */
  readonly onChange?: (code: string) => void;
  /** Ctrl+Enter(맥은 Cmd+Enter) */
  readonly onRun?: () => void;
}

export interface PythonEditor {
  /** CodeMirror 뷰(부품을 더 붙일 때) */
  readonly view: EditorView;
  getValue(): string;
  /** 코드를 통째로 바꾼다(되돌리기 기록에는 남는다). */
  setValue(code: string): void;
  /** 코드의 한 구간(from부터 to 앞까지)만 바꾼다. 커서·되돌리기는 그대로 이어진다(조절 패널이 값 숫자를 바꿔 쓸 때). 범위가 틀리면 false. */
  replaceRange(from: number, to: number, insert: string): boolean;
  focus(): void;
  hasFocus(): boolean;
  setFontSize(px: number): void;
  destroy(): void;
}

export function createPythonEditor(options: PythonEditorOptions): PythonEditor {
  const contentAttributes: Record<string, string> = {
    'aria-label': options.ariaLabel ?? '파이썬 코드',
    'aria-multiline': 'true',
    spellcheck: 'false',
    autocorrect: 'off',
    autocapitalize: 'off',
  };
  if (options.describedBy) {
    contentAttributes['aria-describedby'] = options.describedBy;
  }

  // Tab으로 편집칸에 들어왔는지 알려고 문서 전체의 Tab 누름 시각을 적어 둔다(편집칸 밖에서 눌린 Tab이 초점을 옮겨 오기 때문).
  const ownerDocument = options.parent.ownerDocument;
  let lastTabKeyAt = Number.NEGATIVE_INFINITY;
  // 마우스·손가락으로 누른 시각도 적는다: Tab을 누른 직후(1초 안)에 편집칸을 **눌러서** 들어온 것은 "Tab으로 들어옴"이 아니다.
  let lastPointerAt = Number.NEGATIVE_INFINITY;
  const onDocumentKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Tab') {
      lastTabKeyAt = Date.now();
    }
  };
  const onDocumentPointerdown = (): void => {
    lastPointerAt = Date.now();
  };
  ownerDocument.addEventListener('keydown', onDocumentKeydown, true);
  ownerDocument.addEventListener('pointerdown', onDocumentPointerdown, true);
  /** Tab으로 들어와 우리가 "Tab 한 번은 지나가기"를 켰는지 */
  let passTabFromEntry = false;
  /** 학생이 Ctrl-M으로 "Tab은 늘 초점 이동"(CodeMirror toggleTabFocusMode)을 켜 두었는지 */
  let tabFocusModeToggled = false;
  const stopPassingTab = (target: EditorView): void => {
    if (passTabFromEntry && !tabFocusModeToggled) {
      target.setTabFocusMode(false);
    }
    passTabFromEntry = false;
  };

  const extensions: Extension[] = [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    drawSelection(),
    indentOnInput(),
    bracketMatching(),
    highlightActiveLine(),
    indentUnit.of(INDENT_UNIT),
    EditorState.tabSize.of(INDENT_UNIT.length),
    python(),
    syntaxHighlighting(pythonHighlightStyle),
    editorTheme,
    placeholder(options.placeholder ?? DEFAULT_PLACEHOLDER),
    EditorView.contentAttributes.of(contentAttributes),
    keymap.of([
      {
        key: 'Mod-Enter',
        run: () => {
          options.onRun?.();
          return true;
        },
      },
      indentWithTab,
      ...defaultKeymap,
      ...historyKeymap,
    ]),
    /*
     * Tab으로 막 들어온 편집칸은 Tab 한 번으로 지나간다(머리말). 켜 둔 "지나가기"는 편집칸을 떠나거나(blur) 마우스로 편집칸을 누르면 끈다 —
     * 그러지 않으면 키보드로 지나갔던 학생이 나중에 마우스로 줄 앞을 누르고 Tab으로 들여쓰려 할 때 초점이 빠져나간다.
     * 학생이 Ctrl-M(맥 Shift-Alt-M, CodeMirror 기본 단축키)으로 "Tab은 늘 초점 이동"을 켜 두었으면 건드리지 않는다.
     * 관찰자(observer)로 듣는다: 키맵이 Ctrl-M을 처리하면 그 뒤의 일반 처리기는 불리지 않는다.
     */
    EditorView.domEventObservers({
      keydown: (event) => {
        const key = event.key.toLowerCase();
        if (key === 'm' && ((event.ctrlKey && !event.altKey && !event.metaKey) || (event.shiftKey && event.altKey && !event.ctrlKey))) {
          tabFocusModeToggled = !tabFocusModeToggled;
          passTabFromEntry = false;
        }
      },
      focus: (_event, focusedView) => {
        if (!tabFocusModeToggled && lastTabKeyAt > lastPointerAt && Date.now() - lastTabKeyAt <= TAB_ENTRY_WINDOW_MS) {
          focusedView.setTabFocusMode(TAB_ENTRY_PASS_MS);
          passTabFromEntry = true;
        }
      },
      mousedown: (_event, clickedView) => {
        stopPassingTab(clickedView);
      },
      blur: (_event, blurredView) => {
        stopPassingTab(blurredView);
      },
    }),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        options.onChange?.(update.state.doc.toString());
      }
    }),
  ];

  const view = new EditorView({
    parent: options.parent,
    state: EditorState.create({ doc: options.doc ?? '', extensions }),
  });

  const setFontSize = (px: number): void => {
    view.dom.style.setProperty('--lab-editor-font-size', fontSizeCss(px));
    view.requestMeasure();
  };
  setFontSize(options.fontSizePx ?? DEFAULT_FONT_SIZE_PX);

  return {
    view,
    getValue: () => view.state.doc.toString(),
    setValue: (code) => {
      const current = view.state.doc.toString();
      if (current === code) {
        return;
      }
      view.dispatch({ changes: { from: 0, to: current.length, insert: code }, selection: { anchor: 0 } });
    },
    replaceRange: (from, to, insert) => {
      const length = view.state.doc.length;
      if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from || to > length) {
        return false;
      }
      view.dispatch({ changes: { from, to, insert } });
      return true;
    },
    focus: () => view.focus(),
    hasFocus: () => view.hasFocus,
    setFontSize,
    destroy: () => {
      ownerDocument.removeEventListener('keydown', onDocumentKeydown, true);
      ownerDocument.removeEventListener('pointerdown', onDocumentPointerdown, true);
      view.destroy();
    },
  };
}
