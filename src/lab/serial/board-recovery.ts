/**
 * 멈추지 않는 보드 되찾기와 자동 실행 파일 끄기에 쓰는 순수 함수(P3-08 실제 보드 ② — PLAN §8.3 "boot.py 무한 반복에 막혔을 때 Ctrl-C 반복으로 되찾기").
 * 순서(Ctrl-C 되풀이 → 보드 다시 시작하며 되풀이 → EN 버튼 안내)는 board-connection.ts recover, 바이트를 보내고 받는 일은 raw-repl.ts interruptUntilPrompt.
 *
 * 왜 이렇게(2026-09-18 MicroPython v1.29.0 원문 확인)
 * - ports/esp32/main.c: 켜지거나 소프트 리셋하면 boot.py를 돌리고, 보통 REPL이고 boot.py가 제대로 끝났을 때만 main.py를 돌린다.
 *   raw REPL로 소프트 리셋해도 boot.py는 돈다 — boot.py가 끝나지 않는 반복이면(교과서 3단원 190~191쪽·블루투스 교안이 받는 코드를
 *   boot.py에 저장한다) [실행]할 때마다 소프트 리셋 뒤 raw 프롬프트가 오지 않는다 → Ctrl-C로 멈춘다(raw-repl.ts #softReset).
 * - shared/runtime/pyexec.c: 스크립트를 실행하는 동안만 Ctrl-C가 KeyboardInterrupt가 된다. 반복문을 맨 except로 감싸 KeyboardInterrupt까지
 *   삼키면 Ctrl-C가 try 바깥(반복 머리)에 떨어질 때만 멈춘다 → 짧은 간격으로 되풀이해 보내고, 그래도 안 되면 보드를 다시 켜면서(RTS → EN)
 *   반복에 들어가기 전(import·첫 sleep)에 걸리게 보낸다.
 * - 멈춘 스크립트는 트레이스백 'File "boot.py", line N, in <module>' 뒤 'KeyboardInterrupt:'를 남긴다 → 어느 파일이었는지 읽는다.
 * 되찾은 뒤 그 파일을 그대로 두면 다음 소프트 리셋·전원에서 다시 막히므로, [boot.py 끄기]가 파일 이름을 boot_off.py로 바꾼다
 * (지우지 않는다 — 코드는 남고, 다시 쓰려면 이름을 되돌린다).
 */
import { pythonPathLiteral } from './board-files.ts';

/** 보드가 켜질 때 저절로 도는 파일 */
export type AutorunFile = 'boot.py' | 'main.py';

export const AUTORUN_FILES: readonly AutorunFile[] = Object.freeze(['boot.py', 'main.py']);

const TRACEBACK = /Traceback \(most recent call last\):\n((?:[ \t]+[^\n]*\n)*)KeyboardInterrupt/gu;

/**
 * 보드가 보낸 글에서 KeyboardInterrupt로 멈춘 자동 실행 파일을 찾는다(가장 마지막 트레이스백의 가장 바깥 프레임).
 * 없으면 null(REPL에서 멈췄거나 트레이스백을 받지 못함).
 */
export function findInterruptedAutorun(transcript: string): AutorunFile | null {
  const text = transcript.replace(/\r\n?/gu, '\n');
  let found: AutorunFile | null = null;
  for (const match of text.matchAll(TRACEBACK)) {
    const outer = /File "([^"]+)"/u.exec(match[1] ?? '');
    const file = outer?.[1] ?? null;
    found = file === 'boot.py' || file === 'main.py' ? file : null;
  }
  return found;
}

/** 끈 파일의 새 이름 앞부분(boot.py → boot_off.py, 이미 있으면 boot_off2.py …) */
export function disabledNameBase(file: AutorunFile): string {
  return `${file.replace(/\.py$/u, '')}_off`;
}

/**
 * 자동 실행 파일 끄기 명령: 비어 있는 새 이름(boot_off.py → boot_off2.py …)을 찾아 이름을 바꾸고 "apc:renamed <새 이름>"을 찍는다.
 * 파일이 없으면 OSError(ENOENT). 모의 보드 mini-python도 도는 모양(def·with·% 없이).
 */
export function disableAutorunCommand(file: AutorunFile): string {
  const base = disabledNameBase(file);
  return [
    'import os',
    `_n='${base}.py'`,
    '_i=1',
    'while True:',
    ' try:',
    '  os.stat(_n)',
    ' except OSError:',
    '  break',
    ' _i+=1',
    ` _n='${base}'+str(_i)+'.py'`,
    `os.rename(${pythonPathLiteral(file)},_n)`,
    "print('apc:renamed',_n)",
  ].join('\n');
}

/** disableAutorunCommand 출력의 새 이름(없으면 null) */
export function parseRenamed(stdout: string): string | null {
  let found: RegExpMatchArray | null = null;
  for (const match of stdout.matchAll(/apc:renamed ([A-Za-z0-9_.-]+)/gu)) {
    found = match;
  }
  return found ? found[1]! : null;
}
