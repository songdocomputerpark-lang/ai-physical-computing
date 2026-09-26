/**
 * 파이썬 워커의 패키지 받기(loadPackage·loadPackagesFromImports)를 한 줄로 세우는 작은 도우미(worker.ts가 쓴다).
 *
 * 까닭: Pyodide 314.0.7의 loadPackage는 알림 함수(messageCallback)를 쓰는 동안 stdout 자리를 잠깐 바꿔 두었다가 끝나면 되돌린다
 * (PackageManager.setCallbacks). 받기 두 개가 겹치면 앞 받기가 되돌린 자리(진짜 stdout)에 뒤 받기가 "Loading numpy, opencv-python"을
 * 써서, 준비 직후(numpy·OpenCV 미리 받기가 도는 동안) [실행]을 누른 학생의 콘솔과 "콘솔에 결과가 나왔어요" 칸에 영어 줄이 결과처럼
 * 나왔다(2026-09-26 Phase 6 사용성 검토 지적 4). 뒤 받기는 어차피 Pyodide 안의 잠금을 기다리므로 줄을 세워도 늦어지지 않는다.
 * 실제 Pyodide로 확인하는 검사: tests/unit/lab/pyodide-package-queue.test.ts.
 */
export interface PackageQueue {
  /** 앞의 받기가 모두 끝난 뒤(성공이든 실패든) task를 부른다 */
  run<T>(task: () => Promise<T>): Promise<T>;
}

export function createPackageQueue(): PackageQueue {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    run<T>(task: () => Promise<T>): Promise<T> {
      const next = tail.then(task, task);
      tail = next.catch(() => undefined);
      return next;
    },
  };
}
