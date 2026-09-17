/**
 * 코드 에디터의 오류 줄 강조(PLAN §8.2 P2-06 "해당 줄 강조").
 *
 * 에디터 부품(src/lab/editor/python-editor.ts)을 고치지 않고, CodeMirror 6의 StateEffect.appendConfig로 실행 중에 줄 장식(Decoration.line)
 * 확장을 끼워 넣는다(@codemirror/state 6.7.5·@codemirror/view 6.43.12 — 둘 다 에디터가 이미 쓰는 패키지라 번들에 새로 들어가는 것이 없다).
 * - highlightLine(view, n): n번째 줄(1부터)에 .cm-apc-error-line 장식을 붙이고 그 줄이 보이게 스크롤한다.
 *   focus를 주면([그 줄로 가기] 버튼) 커서를 그 줄 앞으로 옮기고 페이지도 편집칸으로 옮겨 초점을 준다. 오류가 났을 때 자동으로 강조할 때는
 *   초점을 빼앗지 않고 편집칸 안에서만 스크롤한다(페이지는 오류 풀이 카드 쪽에 그대로 — lab-errors.spec.ts).
 * - clearHighlight(view): 장식을 지운다(다음 실행·코드 편집 때).
 * 장식은 편집에 따라 자리를 옮기지만(deco.map), 학생이 코드를 고치기 시작하면 모듈이 지운다(고친 뒤에는 그 줄이 원인이 아닐 수 있다).
 *
 * 다른 화면 부품이 같은 표시를 쓰려면 ERROR_LINE_EVENT('apc:lab-error-line')를 실습실 뿌리 요소에서 듣는다:
 * 모듈이 CustomEvent(detail: { line, scope, message, source })를 cancelable로 보내고, preventDefault되지 않으면 여기 함수로 강조한다.
 */
import { StateEffect, StateField, type Extension } from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';

/** 실습실 뿌리 요소([data-lab])에 보내는 "이 줄을 강조해 달라" 이벤트 이름 */
export const ERROR_LINE_EVENT = 'apc:lab-error-line';

export interface ErrorLineDetail {
  /** 1부터 세는 줄 번호 */
  readonly line: number;
  readonly scope: string | null;
  readonly message: string;
  /** 그 줄의 코드(트레이스백에 보인 것) */
  readonly source: string | null;
  /** 학생이 [그 줄로 가기]를 눌러 초점까지 옮길지 */
  readonly focus: boolean;
}

/** 강조 줄의 CSS 클래스(테스트와 스타일이 함께 쓴다) */
export const ERROR_LINE_CLASS = 'cm-apc-error-line';

const setErrorLine = StateEffect.define<number | null>();

const errorLineDecoration = Decoration.line({ class: ERROR_LINE_CLASS, attributes: { 'data-error-line': 'true' } });

const errorLineField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, transaction) {
    let next = decorations.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (effect.is(setErrorLine)) {
        if (effect.value === null) {
          next = Decoration.none;
        } else {
          const lineCount = transaction.state.doc.lines;
          if (effect.value >= 1 && effect.value <= lineCount) {
            next = Decoration.set([errorLineDecoration.range(transaction.state.doc.line(effect.value).from)]);
          }
        }
      }
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

/** 색은 디자인 토큰(src/styles/tokens.css의 danger 계열)을 쓴다. 글자색은 그대로라 대비는 본문과 같다. */
const errorLineTheme: Extension = EditorView.baseTheme({
  [`.${ERROR_LINE_CLASS}`]: {
    backgroundColor: 'var(--color-danger-bg, #fdecec)',
    boxShadow: 'inset 3px 0 0 var(--color-danger-border, #d24b4b)',
  },
});

function hasField(view: EditorView): boolean {
  return view.state.field(errorLineField, false) !== undefined;
}

/** 확장이 아직 없으면 실행 중에 끼워 넣는다(한 번만). */
export function ensureErrorLineExtension(view: EditorView): void {
  if (!hasField(view)) {
    view.dispatch({ effects: StateEffect.appendConfig.of([errorLineField, errorLineTheme]) });
  }
}

/**
 * n번째 줄(1부터)을 강조하고 보이게 스크롤한다. 줄이 코드 범위 밖이면 false.
 * focus가 참이면 커서를 그 줄 앞으로 옮기고 편집칸에 초점을 준다.
 */
export function highlightLine(view: EditorView, line: number, options: { focus?: boolean } = {}): boolean {
  const lineCount = view.state.doc.lines;
  if (!Number.isInteger(line) || line < 1 || line > lineCount) {
    return false;
  }
  ensureErrorLineExtension(view);
  const info = view.state.doc.line(line);
  if (options.focus) {
    // [그 줄로 가기]: 학생이 누른 것이므로 페이지도 편집칸으로 옮기고 커서·초점을 준다.
    view.dispatch({
      effects: [setErrorLine.of(line), EditorView.scrollIntoView(info.from, { y: 'center' })],
      selection: { anchor: info.from },
    });
    view.focus();
    return true;
  }
  /*
   * 오류가 나서 저절로 강조할 때는 **편집칸 안에서만** 그 줄로 스크롤하고 페이지는 움직이지 않는다.
   * CodeMirror의 scrollIntoView 효과는 바깥 창까지 스크롤해서, 오류 풀이 카드가 화면을 카드 쪽으로 옮긴 직후에
   * 편집칸으로 되돌려 버렸다(2026-09-17 검토 반영 뒤 브라우저 테스트에서 발견 — 카드가 화면 밖에 남음).
   */
  view.dispatch({ effects: setErrorLine.of(line) });
  scrollLineInsideEditor(view, info.from);
  return true;
}

/** 편집칸 자체의 스크롤(.cm-scroller)만 움직여 그 줄을 가운데쯤 보이게 한다(페이지 스크롤은 그대로). */
function scrollLineInsideEditor(view: EditorView, pos: number): void {
  view.requestMeasure({
    key: 'apc-error-line-scroll',
    read: () => {
      const scroller = view.scrollDOM;
      const block = view.lineBlockAt(pos);
      // documentTop은 화면 좌표라, 스크롤 상자 기준 위치로 바꾼다.
      const lineTop = view.documentTop - scroller.getBoundingClientRect().top + scroller.scrollTop + block.top;
      return Math.max(0, Math.round(lineTop - (scroller.clientHeight - block.height) / 2));
    },
    write: (target) => {
      const scroller = view.scrollDOM;
      if (Math.abs(scroller.scrollTop - target) > 1) {
        scroller.scrollTop = target;
      }
    },
  });
}

/** 강조를 지운다(확장이 없으면 아무 일도 하지 않는다). */
export function clearHighlight(view: EditorView): void {
  if (hasField(view)) {
    view.dispatch({ effects: setErrorLine.of(null) });
  }
}

/** 지금 강조된 줄 번호(없으면 null) — 테스트·디버깅용 */
export function highlightedLine(view: EditorView): number | null {
  const field = view.state.field(errorLineField, false);
  if (!field) {
    return null;
  }
  let found: number | null = null;
  field.between(0, view.state.doc.length, (from) => {
    found = view.state.doc.lineAt(from).number;
    return false;
  });
  return found;
}
