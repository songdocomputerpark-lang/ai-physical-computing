// 커밋 전 저장소 검사 훅 켜기(PLAN §8.0 PD-32)
//
// npm install·npm ci가 끝날 때(npm의 prepare 단계) 이 저장소의 git 설정에 core.hooksPath=.githooks를 적는다.
// 그러면 git commit을 할 때마다 .githooks/pre-commit → scripts/check-repo.mjs가 먼저 돈다.
// 새로 받은 저장소(다른 PC·클라우드 세션)에서도 훅을 잊지 않게 하려는 것이다.
//
// 설치를 절대 멈추지 않는다: git이 없거나, git 저장소가 아니거나(압축 파일로 받은 경우),
// 이미 다른 훅 폴더를 쓰도록 정해져 있으면 바꾸지 않고 안내만 한다.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOOKS_PATH = '.githooks';
const rootDir = fileURLToPath(new URL('..', import.meta.url));

/**
 * @param {string[]} args
 * @returns {{ ok: boolean, output: string }}
 */
function runGit(args) {
  const result = spawnSync('git', args, { cwd: rootDir, encoding: 'utf8' });
  return { ok: result.status === 0, output: (result.stdout ?? '').trim() };
}

/**
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function isSamePath(a, b) {
  /** @param {string} value */
  const normalize = (value) => {
    const resolved = path.resolve(value);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  return normalize(a) === normalize(b);
}

try {
  const topLevel = runGit(['rev-parse', '--show-toplevel']);
  // 이 package.json이 있는 폴더가 git 저장소의 뿌리일 때만 설정한다(다른 저장소 안에 들어 있으면 건드리지 않음).
  if (topLevel.ok && topLevel.output !== '' && isSamePath(topLevel.output, rootDir)) {
    const current = runGit(['config', '--local', '--get', 'core.hooksPath']).output;
    if (current === HOOKS_PATH) {
      // 이미 켜져 있다.
    } else if (current !== '') {
      console.warn(
        `[훅 설정] core.hooksPath가 이미 "${current}"(으)로 정해져 있어 바꾸지 않았어요. ` +
          `커밋 전 저장소 검사를 쓰려면 git config core.hooksPath ${HOOKS_PATH} 를 실행해요.`,
      );
    } else if (runGit(['config', '--local', 'core.hooksPath', HOOKS_PATH]).ok) {
      console.log(`[훅 설정] 커밋 전 저장소 검사를 켰어요(git config core.hooksPath ${HOOKS_PATH}).`);
    }
  }
} catch {
  // git을 실행하지 못해도 설치는 계속한다.
}
