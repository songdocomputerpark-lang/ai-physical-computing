/**
 * 블록 모드 화면(mode-ui.ts)이 따르는 규칙 가운데 DOM 없이 확인할 수 있는 것(순수 함수 — tests/unit/blocks/mode-rules.test.ts).
 */

export type BlocksMode = 'code' | 'blocks';

/** 브라우저 저장 이름(머리말 없이 — src/lib/storage.ts 규칙, [이 컴퓨터에서 내 기록 지우기]가 함께 지운다) */
export const BLOCKS_STORAGE = Object.freeze({
  /** 작업판(Blockly JSON 직렬화) */
  workspace: 'module:blocks:workspace',
  /** 마지막 모드(blocks | code) */
  mode: 'module:blocks:mode',
  /** 블록이 마지막으로 만든 코드(새로고침 뒤에도 블록 전용 호환 모드가 "고치지 않은 코드"를 알아보게) */
  generated: 'module:blocks:generated',
  /** 마지막으로 [코드로 바꾸기]한 코드(그 뒤 학생이 고쳤는지 알아보게) */
  converted: 'module:blocks:converted',
});

/** 주소로 정해진 처음 모드: ?blocks=1이면 블록, ?example=·공유 링크(#code=)면 코드, 아니면 null(저장된 모드를 따른다) */
export function modeFromLocation(search: string, hash: string): BlocksMode | null {
  const params = new URLSearchParams(search);
  const blocks = params.get('blocks');
  if (blocks === '1' || blocks === 'yes' || blocks === 'true') {
    return 'blocks';
  }
  if (params.has('example') || /(^|[#&])code=/u.test(hash)) {
    return 'code';
  }
  return null;
}

/** 처음 모드: 주소가 정한 것 → 저장된 모드(blocks일 때만) → 코드 */
export function initialMode(search: string, hash: string, storedMode: string | null): BlocksMode {
  return modeFromLocation(search, hash) ?? (storedMode === 'blocks' ? 'blocks' : 'code');
}

/**
 * [코드로 바꾸기] 전에 물어야 하는지: 지금 예제 칸에 학생이 고쳐 둔 코드가 저장돼 있으면(예제 원래 코드도, 블록이 만든 코드도,
 * 지난번에 바꿔 둔 블록 코드도 아닌 것) 바꾸면 사라지므로 묻는다.
 */
export function needsConvertConfirm(saved: string | null, exampleCode: string | null, generated: string, converted: string | null): boolean {
  if (saved === null || saved.trim() === '') {
    return false;
  }
  return saved !== exampleCode && saved !== generated && saved !== converted;
}

/** 블록 모드에서 편집칸을 고치려는 키인지(글자·지우기·줄바꿈 — 화살표·Ctrl 조합·Tab은 아님) */
export function isEditingKey(key: string, modifiers: { ctrl: boolean; meta: boolean; alt: boolean }): boolean {
  if (modifiers.ctrl || modifiers.meta || modifiers.alt) {
    return false;
  }
  return key.length === 1 || key === 'Backspace' || key === 'Delete' || key === 'Enter';
}
