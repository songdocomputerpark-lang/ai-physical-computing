/**
 * 코드 에디터 색과 모양(PLAN §8.2 P2-02, SPEC §9 명도 대비 AA).
 *
 * 색은 차시 본문의 코드 블록과 같은 Shiki 테마 github-light-high-contrast(astro.config.mjs)에서 가져와,
 * 학생이 차시에서 읽은 코드와 실습실에서 고치는 코드가 같은 색으로 보인다. 나머지 모양(테두리·글꼴·초점 표시)은
 * src/styles/tokens.css의 CSS 변수를 그대로 쓴다.
 *
 * 명도 대비(2026-09-16 WCAG 상대 휘도 공식으로 계산, 흰 바탕 #ffffff 기준 / 현재 줄 바탕 기준):
 *   기본 글자 #0e1116 18.91 · 주석 #66707b 5.04/4.74 · 키워드 #a0111f 8.09 · 문자열 #032563 14.50 · 숫자·상수 #023b95 10.18
 *   함수 이름 #622cbc 8.06 · 클래스 이름 #702c00 10.25 · 잘못된 글자 #6e011a 12.48 · 줄 번호(--color-text-muted #4a5361) 7.31(바탕 #f6f8fb)
 * 모두 글자 기준 4.5:1을 넘는다. 색을 바꾸면 다시 계산해 이 주석을 고친다.
 */
import { HighlightStyle } from '@codemirror/language';
import { EditorView } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';

/** 구문 색(github-light-high-contrast의 값) */
export const EDITOR_COLORS = Object.freeze({
  text: '#0e1116',
  comment: '#66707b',
  keyword: '#a0111f',
  string: '#032563',
  constant: '#023b95',
  functionName: '#622cbc',
  className: '#702c00',
  invalid: '#6e011a',
});

/** 파이썬 구문 강조 규칙(@lezer/python이 붙이는 태그 기준) */
export const pythonHighlightStyle = HighlightStyle.define([
  { tag: [t.comment, t.lineComment], color: EDITOR_COLORS.comment },
  {
    tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.definitionKeyword, t.moduleKeyword, t.modifier],
    color: EDITOR_COLORS.keyword,
  },
  { tag: [t.string, t.special(t.string)], color: EDITOR_COLORS.string },
  { tag: t.escape, color: EDITOR_COLORS.constant },
  { tag: [t.number, t.bool, t.null, t.atom, t.self], color: EDITOR_COLORS.constant },
  {
    tag: [t.function(t.variableName), t.function(t.definition(t.variableName)), t.function(t.propertyName)],
    color: EDITOR_COLORS.functionName,
  },
  { tag: [t.className, t.definition(t.className)], color: EDITOR_COLORS.className },
  { tag: t.meta, color: EDITOR_COLORS.functionName },
  { tag: t.invalid, color: EDITOR_COLORS.invalid },
]);

/**
 * 에디터 모양. 글자 크기는 에디터 뿌리의 CSS 변수 --lab-editor-font-size로 받는다(python-editor.ts의 setFontSize가 바꾼다).
 * 현재 줄 바탕은 반투명이라 선택 영역(아래 층에 그려짐)을 가리지 않는다.
 */
export const editorTheme = EditorView.theme(
  {
    '&': {
      height: '100%',
      fontSize: 'var(--lab-editor-font-size, 0.9375rem)',
      color: 'var(--color-text)',
      backgroundColor: 'var(--color-bg)',
      border: '1px solid var(--color-border-strong)',
      borderRadius: 'var(--radius-md)',
    },
    '&.cm-focused': {
      outline: 'var(--focus-ring-width) solid var(--color-focus)',
      outlineOffset: 'var(--focus-ring-offset)',
    },
    '.cm-scroller': {
      fontFamily: 'var(--font-mono)',
      lineHeight: '1.6',
      borderRadius: 'var(--radius-md)',
    },
    '.cm-content': {
      padding: 'var(--space-2) 0',
      caretColor: 'var(--color-accent-hover)',
    },
    '.cm-line': {
      padding: '0 var(--space-3)',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--color-bg-subtle)',
      color: 'var(--color-text-muted)',
      borderRight: '1px solid var(--color-border)',
    },
    '.cm-lineNumbers .cm-gutterElement': {
      padding: '0 var(--space-2) 0 var(--space-3)',
      minWidth: '2.6em',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'var(--color-bg-muted)',
      color: 'var(--color-text)',
    },
    '.cm-activeLine': {
      backgroundColor: 'rgb(23 25 28 / 0.035)',
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeft: '2px solid var(--color-accent-hover)',
    },
    '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
      {
        backgroundColor: 'var(--color-selection)',
      },
    '&.cm-focused .cm-matchingBracket, .cm-matchingBracket': {
      backgroundColor: 'transparent',
      outline: '1px solid var(--color-accent-border)',
    },
    '&.cm-focused .cm-nonmatchingBracket, .cm-nonmatchingBracket': {
      backgroundColor: 'transparent',
      outline: '1px solid var(--color-danger-border)',
    },
    '.cm-placeholder': {
      color: 'var(--color-text-muted)',
      fontStyle: 'normal',
    },
  },
  { dark: false },
);
