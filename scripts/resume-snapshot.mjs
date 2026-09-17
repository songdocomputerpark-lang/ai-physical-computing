// 이어받기 자동 기록 — 지금 상태를 `.cache/resume/STATE.md`에 적는다.
//
// 왜: 사용량 한도에 걸리면 Claude는 "저장하고 정지"조차 할 수 없다. 그래서 사람이나
// Claude가 아니라 이 스크립트가 10분마다 상태를 적어 둔다. 갑자기 멈춰도 다른 계정·새
// 대화가 `.cache/resume/STATE.md` 한 장만 읽고 이어받을 수 있다(자세한 순서는
// `docs/HANDOFF.md`).
//
// 적는 것: git HEAD·커밋 안 된 파일·origin과의 차이, 돌고 있는 워크플로의 run id·
// 스크립트·진행 기록 폴더·단계별 시작·끝 시각·마지막 활동 시각.
// 읽기만 한다(git은 `--no-optional-locks`로 잠금 파일을 건드리지 않는다). 커밋하지 않고,
// 결과 파일은 git 제외(`.cache/`)다.
//
// 쓰기:
//   node scripts/resume-snapshot.mjs            한 번 적고 끝
//   node scripts/resume-snapshot.mjs --watch     10분마다 계속 (기본 600초)
//   node scripts/resume-snapshot.mjs --watch 300 간격을 초로 지정
// 백그라운드로 띄우기(운영자 PC, PowerShell):
//   Start-Process powershell -WindowStyle Hidden -ArgumentList "-NoProfile","-Command","node scripts/resume-snapshot.mjs --watch"

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, '.cache', 'resume');
const OUT_FILE = path.join(OUT_DIR, 'STATE.md');
const LOG_FILE = path.join(OUT_DIR, 'history.log');
/** Claude Code가 이 프로젝트의 대화·워크플로 기록을 두는 폴더 이름(사용자 이름 없음). */
const PROJECT_KEY = 'C--Users-----Desktop-2026yearwork-2026-9-15---------------------';

function git(args) {
  try {
    return execFileSync('git', ['--no-optional-locks', ...args], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 20_000,
    }).trim();
  } catch {
    return '';
  }
}

function stamp(ms) {
  if (!ms) return '?';
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function mtime(file) {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

function claudeProjectDir() {
  const home = process.env.USERPROFILE || process.env.HOME || '';
  if (!home) return '';
  const base = path.join(home, '.claude', 'projects');
  const exact = path.join(base, PROJECT_KEY);
  if (fs.existsSync(exact)) return exact;
  try {
    const hit = fs.readdirSync(base).find((name) => name.includes('2026-9-15'));
    return hit ? path.join(base, hit) : '';
  } catch {
    return '';
  }
}

/** 이 프로젝트의 모든 세션 폴더에서 워크플로 진행 기록(wf_*)을 모아 가장 최근 것을 고른다. */
function findWorkflows(projectDir) {
  const runs = [];
  let sessions = [];
  try {
    sessions = fs.readdirSync(projectDir, { withFileTypes: true }).filter((e) => e.isDirectory());
  } catch {
    return runs;
  }
  for (const session of sessions) {
    const dir = path.join(projectDir, session.name, 'subagents', 'workflows');
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && e.name.startsWith('wf_'));
    } catch {
      continue;
    }
    for (const entry of entries) {
      const runDir = path.join(dir, entry.name);
      const run = readRun(runDir, entry.name, session.name, projectDir);
      if (run) runs.push(run);
    }
  }
  runs.sort((a, b) => b.lastActivity - a.lastActivity);
  return runs;
}

function readRun(runDir, runId, sessionId, projectDir) {
  let journal = '';
  try {
    journal = fs.readFileSync(path.join(runDir, 'journal.jsonl'), 'utf8');
  } catch {
    return null;
  }
  const events = journal
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  const done = new Set(events.filter((e) => e.type === 'result').map((e) => e.agentId));
  const labels = new Map();
  for (const e of events) if (e.agentId && e.label) labels.set(e.agentId, e.label);

  const stages = [];
  let lastActivity = mtime(path.join(runDir, 'journal.jsonl'));
  let metas = [];
  try {
    metas = fs.readdirSync(runDir).filter((n) => n.endsWith('.meta.json'));
  } catch {
    metas = [];
  }
  for (const meta of metas) {
    const agentId = meta.replace(/^agent-/, '').replace(/\.meta\.json$/, '');
    const start = mtime(path.join(runDir, meta));
    const end = mtime(path.join(runDir, `agent-${agentId}.jsonl`));
    let label = labels.get(agentId) || '';
    if (!label) {
      try {
        label = JSON.parse(fs.readFileSync(path.join(runDir, meta), 'utf8')).description || agentId;
      } catch {
        label = agentId;
      }
    }
    lastActivity = Math.max(lastActivity, end, start);
    stages.push({ agentId, label, start, end, finished: done.has(agentId) });
  }
  stages.sort((a, b) => a.start - b.start || a.end - b.end);
  // 결과가 없고 마지막 움직임이 30분 이상 뒤처진 단계는 끊긴 것이다(한도·세션 종료로 죽은 에이전트).
  // 그것까지 "도는 중"으로 적으면 새 Claude가 기다려야 할 단계를 잘못 센다.
  for (const s of stages) s.stalled = !s.finished && lastActivity - s.end > 30 * 60 * 1000;

  let script = '';
  try {
    const scriptDir = path.join(projectDir, sessionId, 'workflows', 'scripts');
    const hit = fs.readdirSync(scriptDir).find((n) => n.includes(runId));
    if (hit) script = path.join(scriptDir, hit);
  } catch {
    script = '';
  }

  return {
    runId,
    sessionId,
    runDir,
    script,
    stages,
    lastActivity,
    running: stages.some((s) => !s.finished && !s.stalled),
  };
}

function build() {
  const now = Date.now();
  const head = git(['log', '-1', '--format=%h %s']);
  const dirty = git(['status', '--porcelain']).split('\n').filter(Boolean);
  const ahead = git(['rev-list', '--left-right', '--count', 'main...origin/main']);
  const projectDir = claudeProjectDir();
  const runs = projectDir ? findWorkflows(projectDir) : [];
  const run = runs[0];

  const lines = [];
  lines.push('# 지금 상태 (자동 기록)', '');
  lines.push(`마지막 기록: **${stamp(now)}** — `+'`scripts/resume-snapshot.mjs`가 10분마다 다시 쓴다. 사람도 Claude도 손대지 않는다.', '');
  lines.push('> 사용량 한도로 대화가 갑자기 멈추면 Claude는 아무것도 저장할 수 없다. 이 파일이 그때의 상태다.');
  lines.push('> 이어받는 순서는 `docs/HANDOFF.md`, 무엇을 만들었고 다음이 무엇인지는 `PROGRESS.md`가 정본이다.', '');

  lines.push('## 한 줄');
  if (run) {
    const running = run.stages.filter((s) => !s.finished && !s.stalled).map((s) => s.label);
    const stalled = run.stages.filter((s) => s.stalled).map((s) => s.label);
    lines.push(
      run.running
        ? `워크플로 \`${run.runId}\` 도는 중 — ${running.length}개 단계(${running.join(', ')}), 마지막 활동 ${stamp(run.lastActivity)}.`
        : `워크플로 \`${run.runId}\` 도는 단계 없음(끝났거나 멈췄다). 마지막 활동 ${stamp(run.lastActivity)}.`,
    );
    if (stalled.length) {
      lines.push('');
      lines.push(
        `**끊긴 단계 ${stalled.length}개: ${stalled.join(', ')}** — 결과를 못 남기고 죽었다(한도·정지). 다시 돌리기 전에 그 단계가 이미 커밋한 것이 있는지 \`git log\`로 확인하고, 프롬프트에 "이미 커밋됨 — 확인만" 주의를 넣는다.`,
      );
    }
  } else {
    lines.push('도는 워크플로 기록을 찾지 못했다. `PROGRESS.md`의 "진행 중"을 보고 판단한다.');
  }
  lines.push('');

  lines.push('## git (프로젝트 폴더)');
  lines.push(`- HEAD: \`${head || '?'}\``);
  lines.push(`- main과 origin/main 차이(앞/뒤, 자동 fetch 안 함): \`${ahead || '?'}\``);
  if (dirty.length === 0) {
    lines.push('- 커밋 안 된 파일: **없음** (작업 트리 깨끗)');
  } else {
    lines.push(`- 커밋 안 된 파일 ${dirty.length}개:`);
    for (const line of dirty.slice(0, 40)) lines.push(`  - \`${line}\``);
    if (dirty.length > 40) lines.push(`  - … 그 밖 ${dirty.length - 40}개`);
    lines.push('  - **주의:** 도는 중이라 중간 결과일 수 있다. 버리지 말고 `git stash` 대신 그대로 두고 이어받는다.');
  }
  lines.push('');

  if (run) {
    lines.push('## 워크플로');
    lines.push(`- run id: \`${run.runId}\``);
    lines.push(`- 만든 세션: \`${run.sessionId}\``);
    lines.push(`- 스크립트: \`${run.script || '(못 찾음 — 세션 폴더의 workflows\\scripts\\ 확인)'}\``);
    lines.push(`- 진행 기록 폴더: \`${run.runDir}\``);
    lines.push('- 단계(시작 → 끝, 시각은 이 컴퓨터 시계):');
    for (const s of run.stages) {
      const mark = s.finished ? '끝' : s.stalled ? '끊김' : '도는 중';
      const end = s.finished ? stamp(s.end) : `${stamp(s.end)} 마지막 활동`;
      lines.push(`  - [${mark}] ${stamp(s.start)} → ${end}  ${s.label}`);
    }
    lines.push('');
    lines.push('**이어받기:** 세션이 바뀌었으면 위 진행 기록 폴더와 스크립트를 새 세션 폴더(`subagents\\workflows\\`, `workflows\\scripts\\`)로 복사한 뒤');
    lines.push(`\`Workflow({scriptPath: "<복사한 스크립트>", resumeFromRunId: "${run.runId}", args: {…}})\`. 끝난 단계는 캐시에서 돌아온다.`);
    lines.push('args 세 값과 주의점(LF 유지, COMMON 건드리지 않기, 중간에 멈춘 단계 프롬프트에 "이미 커밋됨" 주의)은 `docs/HANDOFF.md` 4번.');
    lines.push('');
    if (runs.length > 1) {
      lines.push('### 그 밖의 워크플로 기록');
      for (const other of runs.slice(1)) {
        lines.push(`- \`${other.runId}\` (세션 \`${other.sessionId}\`), 마지막 활동 ${stamp(other.lastActivity)}, 단계 ${other.stages.length}개`);
      }
      lines.push('');
    }
  }

  lines.push('## 멈춘 뒤 운영자가 할 일');
  lines.push('1. (한도면) 로그아웃 → 다른 Claude 아이디로 로그인');
  lines.push('2. 작업 폴더를 **이 프로젝트 폴더로 그대로** 지정');
  lines.push('3. **"사이트 작업 재개"** 라고 말한다 — 저장 명령은 필요 없다. 단계마다 이미 커밋·push되어 있고 이 파일이 자리를 알려 준다');
  lines.push('4. 절전 방지 도우미(`%TEMP%\\claude_keep_awake.ps1`)와 이 자동 기록은 새 Claude가 다시 띄운다');
  lines.push('');

  return lines.join('\n');
}

function once() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const text = build();
  fs.writeFileSync(OUT_FILE, text, 'utf8');
  const first = text.split('\n').find((l) => l.startsWith('워크플로') || l.startsWith('도는')) || '';
  fs.appendFileSync(LOG_FILE, `${stamp(Date.now())}  ${first}\n`, 'utf8');
  return text;
}

const watchIndex = process.argv.indexOf('--watch');
if (watchIndex === -1) {
  once();
  console.log(`적었다: ${OUT_FILE}`);
} else {
  const seconds = Number(process.argv[watchIndex + 1]) || 600;
  once();
  console.log(`${seconds}초마다 적는다: ${OUT_FILE}`);
  setInterval(() => {
    try {
      once();
    } catch (err) {
      try {
        fs.appendFileSync(LOG_FILE, `${stamp(Date.now())}  오류: ${err?.message || err}\n`, 'utf8');
      } catch {
        /* 기록조차 못 하면 넘어간다 */
      }
    }
  }, seconds * 1000);
}
