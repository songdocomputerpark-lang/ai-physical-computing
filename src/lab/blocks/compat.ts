/**
 * 블록 전용 호환 모드(PLAN PD-27, §4.5·§8.3 P3-06) — JSPI가 없는 브라우저에서 [실행]이 블록 실행판을 돌리게 한다.
 *
 * 언제: 파이썬 실행기가 제한 모드(JSPI 없음 — iPad·iPhone의 모든 브라우저, Android Chrome, 옛 Chrome·Edge, 또는 ?limited=1)이고,
 * 편집칸 코드가 블록이 마지막으로 만든 화면 코드와 **글자 하나까지 같을 때**만. 그러면 실행기에 실행판(execCode — 기다리는 줄이 await인 판)을 보낸다.
 * 화면·[공유 링크]·[.py 내려받기]·실제 보드에는 늘 보통 코드가 간다(실행판은 워커에만).
 * 코드를 직접 고쳤으면 고친 코드를 그대로 보낸다(제한 모드: time.sleep은 워커를 붙잡은 채 기다려 그동안 화면 입력을 못 받고, [정지]는 파이썬을
 * 다시 시작하는 방식 — apc_runtime.sleep·PLAN §4.5) — PD-27 "코드 모드 편집은 제한 모드".
 *
 * 붙이는 방법: 실습실 틀의 공식 자리 `lab.setRunCodeTransform(fn)`(P3-11 통합에서 더함 — lab-shell.ts)에 chooseRunCode를 끼운다(dispose에서 null).
 * 실행 대상(lab.setRunTarget — 실제 보드)이 끼워져 있으면 틀이 runtime.run을 부르지 않으므로 영향이 없다.
 * installRunCodeTransform(실행기 인스턴스의 run 감싸기)은 틀 밖에서 같은 일을 할 때만 쓰는 예비 길로 남겨 둔다.
 */
import type { PythonRuntime, RunOptions, RunResult } from '../runtime/client.ts';
import { isBlocksCode } from './catalog.ts';
import { sameLineCount } from './generator.ts';

/** 이번 실행에 무엇을 보냈는지: exec = 실행판, edited = 블록 코드를 고쳐서 보통 코드, off = 호환 모드가 필요 없음(JSPI 있음·블록 코드 아님) */
export type CompatDecision = 'exec' | 'edited' | 'off';

export interface GeneratedPair {
  readonly code: string;
  readonly execCode: string;
}

export interface RunCodeChoice {
  readonly code: string;
  readonly decision: CompatDecision;
}

/** 보낼 코드를 고른다(순수 함수) */
export function chooseRunCode(code: string, limited: boolean, generated: GeneratedPair | null): RunCodeChoice {
  if (!limited) {
    return { code, decision: 'off' };
  }
  if (generated && code === generated.code && generated.execCode !== '' && sameLineCount(generated.code, generated.execCode)) {
    return { code: generated.execCode, decision: 'exec' };
  }
  if (isBlocksCode(code)) {
    return { code, decision: 'edited' };
  }
  return { code, decision: 'off' };
}

/** 결정마다 학생에게 보일 한 줄(없으면 null) */
export function compatMessage(decision: CompatDecision): string | null {
  switch (decision) {
    case 'exec':
      return '이 브라우저에는 파이썬 기다리기 기능(JSPI)이 없어서 "블록 전용 호환 모드"로 돌려요. 블록이 만든 코드는 기다리기·버튼 입력·[정지]까지 돼요.';
    case 'edited':
      return '이 브라우저(JSPI 없음)에서 버튼·터치 입력과 [정지]가 제대로 되는 것은 블록이 만든 코드를 고치지 않았을 때예요. 고친 코드는 제한 모드로 돌아서 기다리는 동안 입력을 받지 못할 수 있고, [정지]는 파이썬을 다시 시작해요 — 컴퓨터의 Chrome이나 Edge에서 열면 다 돼요.';
    default:
      return null;
  }
}

/**
 * 실행기 인스턴스의 run을 감싸 보낼 코드를 바꾼다. 돌려주는 함수를 부르면 원래 run으로 돌아간다.
 * transform이 null을 돌려주면 원래 코드 그대로 보낸다.
 */
export function installRunCodeTransform(runtime: PythonRuntime, transform: (code: string) => string | null): () => void {
  const target = runtime as PythonRuntime & { run: PythonRuntime['run'] };
  const hadOwn = Object.prototype.hasOwnProperty.call(target, 'run');
  const previous = target.run;
  const wrapped = (code: string, options?: RunOptions): Promise<RunResult> => previous.call(runtime, transform(code) ?? code, options);
  target.run = wrapped;
  return () => {
    if (target.run !== wrapped) {
      return; // 그 뒤에 다른 곳이 또 감쌌다 — 건드리지 않는다
    }
    if (hadOwn) {
      target.run = previous;
    } else {
      delete (target as { run?: unknown }).run;
    }
  };
}
