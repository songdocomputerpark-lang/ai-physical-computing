// 보드 콘솔 input() 모듈의 화면 쪽(src/lab/modules/board-console/) — PLAN §6.2 "보드 콘솔 입력"·§8.3 P3-05, README 4절 모듈 폴더 규약.
// 파이썬 쪽(기다리는 동안 Timer가 도는지·취소·인자 규칙)은 pyodide-board-console.test.ts가 본다.
import { describe, expect, it, vi } from 'vitest';
import module, { CHANNEL_LINE, CHANNEL_READY, EVENT_PROMPT, labPromptOf, lineMessage, parsePromptEvent } from '../../../src/lab/modules/board-console/index.ts';
import manifest from '../../../src/lab/modules/board-console/manifest.ts';
import { validateManifests } from '../../../src/lab/modules/manifests.ts';

const PYTHON = await import('node:fs').then((fs) => fs.readFileSync(new URL('../../../src/lab/modules/board-console/apc_board_console.py', import.meta.url), 'utf8'));

describe('manifest', () => {
  it('ESP32 실습실에만 붙고 이름이 모듈 id로 시작한다(모듈 규약 검사 통과)', () => {
    expect(manifest).toMatchObject({ id: 'board-console', labs: ['esp32'], eventKinds: [EVENT_PROMPT], channels: [CHANNEL_LINE, CHANNEL_READY] });
    expect(validateManifests({ './board-console/manifest.ts': { default: manifest } })).toEqual([]);
    expect(module.manifest).toBe(manifest);
  });

  it('파이썬 쪽 이름이 같다', () => {
    expect(PYTHON).toContain(`EVENT_PROMPT = "${EVENT_PROMPT}"`);
    expect(PYTHON).toContain(`CHANNEL_LINE = "${CHANNEL_LINE}"`);
    expect(PYTHON).toContain(`CHANNEL_READY = "${CHANNEL_READY}"`);
  });
});

describe('메시지 모양', () => {
  it('공개 prompt가 있는 실습실 틀만 쓴다(this를 묶어서)', async () => {
    const lab = {
      label: '틀',
      prompt(this: { label: string }, text: string) {
        return Promise.resolve(`${this.label}:${text}`);
      },
    };
    const prompt = labPromptOf(lab);
    expect(prompt).not.toBeNull();
    await expect(prompt!('이름')).resolves.toBe('틀:이름');
    expect(labPromptOf({})).toBeNull();
    expect(labPromptOf(null)).toBeNull();
    expect(labPromptOf({ prompt: 'x' })).toBeNull();
  });

  it('prompt 이벤트를 읽고 답을 만든다(닫힘은 null 대신 cancelled)', () => {
    expect(parsePromptEvent({ id: 3, prompt: '입력(1/0/q):' })).toEqual({ id: 3, prompt: '입력(1/0/q):' });
    expect(parsePromptEvent({ id: 4 })).toEqual({ id: 4, prompt: '' });
    expect(parsePromptEvent({ id: 1.5, prompt: 'x' })).toBeNull();
    expect(parsePromptEvent('x')).toBeNull();
    expect(lineMessage(3, 'q')).toEqual({ id: 3, value: 'q' });
    expect(lineMessage(3, '')).toEqual({ id: 3, value: '' });
    expect(lineMessage(3, null)).toEqual({ id: 3, cancelled: true });
  });
});

describe('mount', () => {
  function contextWith(lab: unknown) {
    const root = { dataset: {} as Record<string, string> };
    const values: [string, unknown][] = [];
    const pushed: [string, unknown][] = [];
    const eventHandlers = new Map<string, (payload: unknown) => void>();
    const labHandlers = new Map<string, () => void>();
    const context = {
      root,
      lab,
      setValue: (name: string, value: unknown) => values.push([name, value]),
      pushEvent: (name: string, value: unknown) => pushed.push([name, value]),
      onEvent: (name: string, handler: (payload: unknown) => void) => eventHandlers.set(name, handler),
      onLab: (name: string, handler: () => void) => labHandlers.set(name, handler),
    };
    return { context, root, values, pushed, eventHandlers, labHandlers };
  }

  it('실습실 틀에 공개 prompt가 없으면 아무것도 하지 않는다(러너 공통 input)', () => {
    const { context, root, values } = contextWith({});
    module.mount(context as never);
    expect(root.dataset.boardConsole).toBe('fallback');
    expect(values).toEqual([]);
  });

  it('있으면 준비를 알리고, 파이썬이 연 입력줄의 답을 id와 함께 보낸다', async () => {
    let resolveLine: (value: string | null) => void = () => undefined;
    const prompt = vi.fn(() => new Promise<string | null>((resolve) => (resolveLine = resolve)));
    const { context, root, values, pushed, eventHandlers, labHandlers } = contextWith({ prompt });
    module.mount(context as never);
    expect(root.dataset.boardConsole).toBe('live');
    expect(values).toEqual([[CHANNEL_READY, true]]);
    labHandlers.get('run')?.();
    expect(values).toHaveLength(2);
    eventHandlers.get(EVENT_PROMPT)?.({ id: 7, prompt: 'cmd:' });
    expect(prompt).toHaveBeenCalledWith('cmd:');
    resolveLine('1');
    await Promise.resolve();
    await Promise.resolve();
    expect(pushed).toEqual([[CHANNEL_LINE, { id: 7, value: '1' }]]);
    eventHandlers.get(EVENT_PROMPT)?.({ id: 8, prompt: '' });
    resolveLine(null);
    await Promise.resolve();
    await Promise.resolve();
    expect(pushed[1]).toEqual([CHANNEL_LINE, { id: 8, cancelled: true }]);
  });
});
