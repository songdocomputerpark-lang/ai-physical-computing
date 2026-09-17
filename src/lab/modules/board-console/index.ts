/**
 * 보드 콘솔 input() 모듈의 화면 쪽(PLAN §6.2 "보드 콘솔 입력", §8.3 P3-05). 파이썬 쪽은 같은 폴더의 apc_board_console.py.
 *
 * 실물 보드는 input()이 한 줄을 기다리는 동안에도 Timer·핀 인터럽트 콜백과 UART 받기가 돈다(MicroPython v1.29.0 ports/esp32/mphalport.c
 * mp_hal_stdin_rx_chr의 MICROPY_EVENT_POLL_HOOK). 가상 보드가 같게 하려면 파이썬이 "입력줄을 열어 달라"고 알린 뒤(이벤트 board-console.prompt)
 * 스스로 짧게 자며 보드를 돌리고, 화면은 학생이 적은 줄을 쌓이는 값(board-console.line)으로 보내야 한다.
 *
 * 입력줄은 실습실 틀(LabShell)의 것을 그대로 쓴다 — 실제 보드 실행 대상(lab.setRunTarget의 ctx.prompt)과 같은 자리·같은 되울림이라
 * 가상 보드와 실물 보드의 input() 모습이 같다. 그러려면 실습실 틀이 "보통 파이썬 실행 중에도 쓰는" 공개 lab.prompt(label)을 줘야 한다
 * (지금은 실행 대상용 ctx.prompt뿐 — 구역 C 보고서의 공유 파일 변경 요청). lab.prompt가 없으면 이 모듈은 아무것도 하지 않고,
 * 파이썬은 러너 공통 input()(기다리는 동안 보드가 멈춤)을 그대로 쓴다.
 * 테스트가 읽는 값: 실습실 뿌리 [data-lab]의 data-board-console = live(보드 콘솔 입력) | fallback(러너 공통 input).
 */
import type { LabModule, LabModuleContext, LabModuleHandle } from '../types.ts';
import manifest from './manifest.ts';

export const EVENT_PROMPT = 'board-console.prompt';
export const CHANNEL_LINE = 'board-console.line';
export const CHANNEL_READY = 'board-console.ready';

export type LabPrompt = (label: string) => Promise<string | null>;

/** 실습실 틀이 공개 prompt(label)을 주면 그 함수(this를 묶어서), 아니면 null */
export function labPromptOf(lab: unknown): LabPrompt | null {
  if (!lab || typeof lab !== 'object') {
    return null;
  }
  const candidate = (lab as { prompt?: unknown }).prompt;
  return typeof candidate === 'function' ? (candidate as LabPrompt).bind(lab) : null;
}

/** 파이썬이 보낸 board-console.prompt 값 → { id, prompt }(모양이 틀리면 null) */
export function parsePromptEvent(payload: unknown): { id: number; prompt: string } | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const { id, prompt } = payload as { id?: unknown; prompt?: unknown };
  if (typeof id !== 'number' || !Number.isInteger(id)) {
    return null;
  }
  return { id, prompt: typeof prompt === 'string' ? prompt : '' };
}

/**
 * 파이썬에 보낼 한 줄: 적은 글자면 { id, value }, 입력줄이 닫혔으면(null) { id, cancelled: true }.
 * null을 그대로 보내지 않는 까닭: Pyodide가 JS null을 None이 아닌 jsnull로 넘길 수 있다(2026-09-18 Node Pyodide 314.0.7에서 None 비교가 틀림).
 */
export function lineMessage(id: number, value: string | null): { id: number; value: string } | { id: number; cancelled: true } {
  return typeof value === 'string' ? { id, value } : { id, cancelled: true };
}

function mount(context: LabModuleContext): LabModuleHandle | void {
  const prompt = labPromptOf(context.lab);
  if (!prompt) {
    context.root.dataset.boardConsole = 'fallback';
    return;
  }
  const markReady = () => context.setValue(CHANNEL_READY, true);
  markReady();
  // 정지 2단계(워커 재시작)로 최신 값이 사라져도 다음 실행에서 다시 알린다(README 4.3)
  context.onLab('run', markReady);
  context.onEvent(EVENT_PROMPT, (payload) => {
    const request = parsePromptEvent(payload);
    if (!request) {
      return;
    }
    void prompt(request.prompt).then(
      (value) => context.pushEvent(CHANNEL_LINE, lineMessage(request.id, value)),
      () => context.pushEvent(CHANNEL_LINE, lineMessage(request.id, null)),
    );
  });
  context.root.dataset.boardConsole = 'live';
}

const module: LabModule = { manifest, mount };
export default module;
