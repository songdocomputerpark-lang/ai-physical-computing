/**
 * 블록 모드의 예시 작업판(Blockly JSON 직렬화 모양 — Blockly.serialization.workspaces.load가 읽는다). 순수 데이터.
 *
 * - blink: 처음 블록 모드를 열 때 보이는 예시(사이트 예제 01 "내장 LED 깜빡이기"와 같은 동작) — [실행]만 눌러도 가상 보드가 움직인다.
 * - boot-led: BOOT 버튼(GPIO0)을 누르고 있으면 LED — "거꾸로 동작하는 버튼" 바꿔보기(PLAN PD-34): BOOT 버튼은 누르면 0이라 코드에 == 0이 나온다.
 *   코드로 바꾼 뒤 == 0을 == 1로 고치면 누르지 않을 때 켜지는 것을 확인한다(시나리오 B BOOT판).
 * - empty: 빈 작업판(시나리오 B는 여기서 "터치 센서를 누르면 LED"를 직접 만든다 — PD-34의 기본 입력은 터치 센서 GPIO17).
 */

export interface SerializedBlock {
  readonly type: string;
  readonly x?: number;
  readonly y?: number;
  readonly fields?: Record<string, unknown>;
  readonly inputs?: Record<string, { block?: SerializedBlock; shadow?: SerializedBlock }>;
  readonly next?: { block: SerializedBlock };
  readonly extraState?: Record<string, unknown>;
}

export interface SerializedWorkspace {
  readonly blocks: { readonly languageVersion: 0; readonly blocks: readonly SerializedBlock[] };
}

export interface BlocksPreset {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly state: SerializedWorkspace;
}

/** 블록 목록을 next로 이은 한 줄기(맨 앞 블록)를 만든다 */
export function chain(blocks: readonly SerializedBlock[]): SerializedBlock | undefined {
  let next: SerializedBlock | undefined;
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const current = blocks[index]!;
    next = next ? { ...current, next: { block: next } } : current;
  }
  return next;
}

export function numberShadow(value: number): { shadow: SerializedBlock } {
  return { shadow: { type: 'math_number', fields: { NUM: value } } };
}

function workspace(top: SerializedBlock | undefined): SerializedWorkspace {
  return { blocks: { languageVersion: 0, blocks: top ? [{ ...top, x: 32, y: 32 }] : [] } };
}

export const BLOCK_PRESETS: readonly BlocksPreset[] = Object.freeze([
  {
    id: 'blink',
    title: '내장 LED 깜빡이기',
    description: '0.5초마다 내장 LED를 켰다 꺼요. [실행]을 누르면 가상 보드의 LED(IO2)가 깜빡여요.',
    state: workspace({
      type: 'apc_forever',
      inputs: {
        DO: {
          block: chain([
            { type: 'apc_builtin_led', fields: { STATE: 'on' } },
            { type: 'apc_wait_seconds', inputs: { SECONDS: numberShadow(0.5) } },
            { type: 'apc_builtin_led', fields: { STATE: 'off' } },
            { type: 'apc_wait_seconds', inputs: { SECONDS: numberShadow(0.5) } },
          ])!,
        },
      },
    }),
  },
  {
    id: 'boot-led',
    title: 'BOOT 버튼으로 LED 켜기(거꾸로 동작하는 버튼)',
    description: 'BOOT 버튼을 누르고 있으면 LED가 켜져요. 코드로 바꾸면 button.value() == 0이 보여요 — 이 버튼은 누르면 0이에요.',
    state: workspace({
      type: 'apc_forever',
      inputs: {
        DO: {
          block: chain([
            {
              type: 'controls_if',
              extraState: { hasElse: true },
              inputs: {
                IF0: { block: { type: 'apc_boot_pressed' } },
                DO0: { block: { type: 'apc_builtin_led', fields: { STATE: 'on' } } },
                ELSE: { block: { type: 'apc_builtin_led', fields: { STATE: 'off' } } },
              },
            },
            { type: 'apc_wait_ms', inputs: { MS: numberShadow(20) } },
          ])!,
        },
      },
    }),
  },
  {
    id: 'empty',
    title: '빈 작업판',
    description: '블록이 하나도 없는 작업판이에요. 도구 상자(컴퓨터는 왼쪽, 휴대폰은 위쪽)에서 블록을 끌어 와요.',
    state: workspace(undefined),
  },
]);

/** 처음 블록 모드를 열 때의 예시 */
export const DEFAULT_PRESET_ID = 'blink';

export function findPreset(id: string | null | undefined): BlocksPreset | null {
  return BLOCK_PRESETS.find((preset) => preset.id === id) ?? null;
}
