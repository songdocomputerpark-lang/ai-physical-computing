/**
 * 단계별 로딩 진행률 모으기(PLAN §5.4 "① 파이썬 엔진 → ② numpy → ③ OpenCV → ④ 손 인식 모델 + 받은 양(MB) 막대").
 *
 * 세 가지 신호를 한 표로 모은다(순수 논리 — DOM 없음, tests/unit/loading/stages.test.ts).
 * 1. 파이썬 실행기(PythonRuntime)의 state·progress·ready 이벤트: 단계가 시작·끝났는지(바이트는 모른다).
 * 2. 서비스 워커의 파일 받기 메시지(apc:download): 파일마다 받은 바이트·전체 바이트·어디서 받았는지. 서비스 워커가 페이지를 맡은
 *    방문에만 온다. 맡지 않은 첫 방문에는 바이트를 모르므로 표에서 아는 크기(pyodide-files.ts)로 "예상 크기"만 보여 준다.
 * 3. 다른 흉내 모듈이 보내는 단계 알림(apc:loading-stage, 예: mediapipe 모델) — 서비스 워커 메시지가 없을 때의 보조 통로.
 *
 * 단계 id: 'core'(파이썬 엔진), Pyodide 패키지 이름(numpy, opencv-python …), 'models'(같은 사이트 /models/·/vendor/mediapipe/ 파일),
 * 그리고 모듈이 정한 id. 전체 크기는 pyodide-files.ts의 표에서 알고(엔진 13.5MB, numpy 3.0MB, OpenCV 10.7MB), 표에 없는 파일은
 * 서비스 워커가 알려 준 Content-Length를 쓴다(압축 전송이면 실제와 다를 수 있어 서비스 워커가 압축된 응답에는 total을 넣지 않는다).
 */
import type { RuntimeState } from '../runtime/protocol.ts';
import type { DownloadMessage, DownloadSource, LoadingStageDetail } from './constants.ts';
import { PYODIDE_CORE_BYTES, findPyodideFile, formatBytes, packageWheelSize, parsePyodideUrl } from './pyodide-files.ts';

export type StageState = 'pending' | 'active' | 'done' | 'failed';

export interface StageSnapshot {
  readonly id: string;
  readonly label: string;
  readonly state: StageState;
  readonly received: number;
  /** 모르면 null */
  readonly total: number | null;
  /** 0~100, 모르면 null */
  readonly percent: number | null;
  /** 바이트를 실제로 센 것이 아니라 표에서 아는 크기로 짐작한 값인지(서비스 워커가 없는 첫 방문) */
  readonly estimated: boolean;
  readonly from: DownloadSource | null;
}

export type LoadingPhase = 'idle' | 'loading' | 'ready' | 'failed';

export interface LoadingSnapshot {
  readonly phase: LoadingPhase;
  readonly stages: readonly StageSnapshot[];
  /** 시작한 단계들의 합친 진행률(0~100). 바이트를 모르는 단계가 있으면 null(막대는 "정해지지 않음"으로 보인다). */
  readonly percent: number | null;
  readonly received: number;
  readonly total: number | null;
  /** 지금 진행 중인 단계 이름(없으면 '') */
  readonly activeLabel: string;
  /** 마지막으로 받은 곳. 서비스 워커 메시지가 없으면 실행기가 알려 준 위치(indexUrl)로 짐작한다. */
  readonly source: DownloadSource | 'unknown';
  /** 이번 로딩이 시작된 뒤 지난 시간(밀리초) */
  readonly elapsedMs: number;
  /** 사람이 읽는 한 줄: "파이썬 엔진(Pyodide) 4.2MB / 13.5MB" 또는 "OpenCV(영상 처리) 받는 중…" */
  readonly text: string;
}

/** 단계 이름표. 표에 없는 패키지는 "<이름>(파이썬 패키지)". */
export const STAGE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  core: '파이썬 엔진(Pyodide)',
  numpy: 'numpy(배열 계산)',
  'opencv-python': 'OpenCV(영상 처리)',
  pillow: 'Pillow(그림 다루기)',
  models: '인식 모델(MediaPipe)',
});

export function stageLabel(id: string): string {
  return STAGE_LABELS[id] ?? `${id}(파이썬 패키지)`;
}

/** 표에서 아는 단계 전체 크기(바이트). 모르면 null. */
export function knownStageBytes(id: string): number | null {
  if (id === 'core') {
    return PYODIDE_CORE_BYTES;
  }
  return packageWheelSize(id);
}

/** 파일 주소가 어느 단계의 것인지. Pyodide 파일이 아니고 같은 사이트 models/·vendor/mediapipe/도 아니면 null. */
export function stageIdForUrl(url: string, origin: string): string | null {
  const pyodide = parsePyodideUrl(url, origin);
  if (pyodide) {
    const known = findPyodideFile(pyodide.name);
    if (known?.kind === 'package' && known.package) {
      return known.package;
    }
    if (known?.kind === 'core') {
      return 'core';
    }
    // 표에 없는 휠(학생이 import한 다른 패키지): 파일 이름 앞부분이 패키지 이름이다. 코어 폴더의 다른 파일은 core로 본다.
    if (/\.whl$/u.test(pyodide.name)) {
      return (pyodide.name.split('-')[0] ?? 'package').replace(/_/gu, '-');
    }
    return 'core';
  }
  if (url.startsWith(origin) && /\/(?:models|vendor\/mediapipe)\//u.test(url)) {
    return 'models';
  }
  return null;
}

interface FileProgress {
  received: number;
  total: number | null;
  done: boolean;
}

interface Stage {
  readonly id: string;
  label: string;
  state: StageState;
  /** 표에서 아는 전체 크기(없으면 null) */
  readonly knownTotal: number | null;
  readonly files: Map<string, FileProgress>;
  from: DownloadSource | null;
  /** 모듈이 직접 알린 바이트(파일 메시지 대신) */
  reported: { received: number; total: number | null } | null;
}

export interface LoadingTrackerOptions {
  /** 같은 사이트 주소를 알아보는 데 쓰는 출처(브라우저에서는 location.origin) */
  readonly origin: string;
  readonly now?: () => number;
}

/**
 * 단계 표를 들고 있는 작은 상태 기계. 화면(src/lab/modules/loading/index.ts)이 이벤트를 넣고 snapshot()을 그린다.
 * 단계 순서는 처음 알려진 순서 그대로다(core → numpy → opencv-python → 모듈이 더한 것).
 */
export class LoadingTracker {
  readonly #origin: string;
  readonly #now: () => number;
  readonly #stages = new Map<string, Stage>();
  #runtimeState: RuntimeState = 'unloaded';
  #source: DownloadSource | 'unknown' = 'unknown';
  #startedAt: number | null = null;
  #finishedAt: number | null = null;

  constructor(options: LoadingTrackerOptions) {
    this.#origin = options.origin;
    this.#now = options.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
    this.#stage('core');
  }

  #stage(id: string): Stage {
    let stage = this.#stages.get(id);
    if (!stage) {
      stage = { id, label: stageLabel(id), state: 'pending', knownTotal: knownStageBytes(id), files: new Map(), from: null, reported: null };
      this.#stages.set(id, stage);
    }
    return stage;
  }

  #begin(): void {
    if (this.#startedAt === null || this.#finishedAt !== null) {
      this.#startedAt = this.#now();
      this.#finishedAt = null;
    }
  }

  #activate(stage: Stage): void {
    if (stage.state === 'done') {
      return;
    }
    stage.state = 'active';
    this.#begin();
  }

  #complete(stage: Stage): void {
    stage.state = 'done';
    for (const file of stage.files.values()) {
      if (file.total !== null) {
        file.received = file.total;
      }
      file.done = true;
    }
    if (stage.reported?.total != null) {
      stage.reported = { received: stage.reported.total, total: stage.reported.total };
    }
  }

  /** 실행기 상태(unloaded → loading → idle / failed) */
  runtimeState(state: RuntimeState): void {
    const previous = this.#runtimeState;
    this.#runtimeState = state;
    const core = this.#stage('core');
    if (state === 'loading') {
      this.#activate(core);
    } else if (state === 'idle' && previous === 'loading') {
      this.#complete(core);
    } else if (state === 'failed') {
      for (const stage of this.#stages.values()) {
        if (stage.state === 'active') {
          stage.state = 'failed';
        }
      }
      this.#finishedAt = this.#now();
    }
  }

  /** 실행기의 progress 이벤트(core 단계 시작, package 단계 시작·끝) */
  runtimeProgress(progress: { readonly stage: 'core' | 'package'; readonly phase?: 'start' | 'done'; readonly names?: readonly string[] }): void {
    if (progress.stage === 'core') {
      this.#activate(this.#stage('core'));
      return;
    }
    for (const name of progress.names ?? []) {
      const stage = this.#stage(name);
      if (progress.phase === 'done') {
        this.#complete(stage);
      } else {
        this.#activate(stage);
      }
    }
  }

  /** 실행기 준비 끝(ready). indexUrl로 받은 곳을 짐작한다(서비스 워커 메시지가 없을 때). */
  runtimeReady(info: { readonly indexUrl?: string } = {}): void {
    // 로딩 모듈이 늦게 붙어(청크를 받는 동안) loading 상태를 못 본 경우에도 "시작했다"로 본다 — 그래야 phase가 ready가 된다.
    this.#begin();
    this.#complete(this.#stage('core'));
    if (this.#source === 'unknown' && info.indexUrl) {
      // indexUrl은 폴더 주소라 파일 이름이 없다. 아무 파일 이름이나 붙여 어느 쪽 폴더인지만 본다.
      const parsed = parsePyodideUrl(`${info.indexUrl}pyodide.mjs`, this.#origin);
      if (parsed) {
        this.#source = parsed.from;
      }
    }
  }

  /** 서비스 워커의 파일 받기 메시지 */
  download(message: DownloadMessage): void {
    const id = stageIdForUrl(message.url, this.#origin);
    if (!id) {
      return;
    }
    const stage = this.#stage(id);
    const file = stage.files.get(message.url) ?? { received: 0, total: null, done: false };
    stage.files.set(message.url, file);
    stage.from = message.from;
    this.#source = message.from;
    if (message.total !== null && message.total > 0) {
      file.total = message.total;
    }
    switch (message.state) {
      case 'start':
      case 'progress':
      case 'fallback':
        file.received = Math.max(file.received, message.received);
        this.#activate(stage);
        break;
      case 'done':
      case 'cache':
        file.received = file.total ?? Math.max(file.received, message.received);
        file.done = true;
        if (stage.state !== 'done') {
          this.#activate(stage);
        }
        break;
      case 'error':
        file.done = true;
        break;
      default:
        break;
    }
  }

  /** 다른 모듈이 알린 단계(apc:loading-stage) */
  stageEvent(detail: LoadingStageDetail): void {
    const stage = this.#stage(detail.id);
    if (detail.label) {
      stage.label = detail.label;
    }
    if (typeof detail.received === 'number' || detail.total !== undefined) {
      stage.reported = { received: detail.received ?? 0, total: detail.total ?? null };
    }
    if (detail.state === 'done') {
      this.#complete(stage);
    } else if (detail.state === 'failed') {
      stage.state = 'failed';
    } else {
      this.#activate(stage);
    }
  }

  /** 모든 단계가 끝났다고 표시한다(패키지 준비까지 끝난 뒤 화면이 부른다). */
  finish(): void {
    for (const stage of this.#stages.values()) {
      if (stage.state === 'active') {
        this.#complete(stage);
      }
    }
    this.#finishedAt = this.#now();
  }

  /** 한 단계의 받은 양·전체 양. estimated면 실제로 센 바이트가 아니라 표에서 아는 크기로 짐작한 것이다. */
  #bytesOf(stage: Stage): { received: number; total: number | null; estimated: boolean } {
    if (stage.reported) {
      return { received: stage.reported.received, total: stage.reported.total, estimated: false };
    }
    let received = 0;
    let total = 0;
    let totalKnown = stage.files.size > 0;
    for (const file of stage.files.values()) {
      received += file.received;
      if (file.total === null) {
        totalKnown = false;
      } else {
        total += file.total;
      }
    }
    if (stage.knownTotal !== null) {
      // 표에서 아는 전체 크기를 믿는다(파일 메시지가 몇 개 왔든).
      if (stage.state === 'done') {
        return { received: stage.knownTotal, total: stage.knownTotal, estimated: stage.files.size === 0 };
      }
      return { received: Math.min(received, stage.knownTotal), total: stage.knownTotal, estimated: stage.files.size === 0 };
    }
    if (stage.state === 'done' && totalKnown) {
      return { received: total, total, estimated: false };
    }
    return { received, total: totalKnown ? total : null, estimated: false };
  }

  snapshot(): LoadingSnapshot {
    const stages: StageSnapshot[] = [];
    let sumReceived = 0;
    let sumTotal = 0;
    let totalKnown = true;
    let involved = 0;
    for (const stage of this.#stages.values()) {
      const bytes = this.#bytesOf(stage);
      const percent =
        bytes.total !== null && bytes.total > 0 ? Math.min(100, Math.round((bytes.received / bytes.total) * 100)) : stage.state === 'done' ? 100 : null;
      stages.push({
        id: stage.id,
        label: stage.label,
        state: stage.state,
        received: bytes.received,
        total: bytes.total,
        percent,
        estimated: bytes.estimated,
        from: stage.from,
      });
      if (stage.state === 'active' || stage.state === 'done') {
        involved += 1;
        sumReceived += bytes.received;
        if (bytes.total === null) {
          totalKnown = false;
        } else {
          sumTotal += bytes.total;
        }
      }
    }
    // 바이트를 실제로 세지 못한 단계가 진행 중이면(서비스 워커가 아직 페이지를 맡지 않은 첫 방문) 백분율을 말하지 않는다.
    // 0%로 보이면 "멈춰 있다"로 오해하기 때문이다 — 막대는 "받는 중" 줄무늬로 보여 준다.
    const estimating = stages.some((stage) => stage.estimated && stage.state === 'active');
    const anyActive = stages.some((stage) => stage.state === 'active');
    const anyFailed = stages.some((stage) => stage.state === 'failed');
    let phase: LoadingPhase;
    if (this.#runtimeState === 'failed' || (anyFailed && !anyActive)) {
      phase = 'failed';
    } else if (this.#runtimeState === 'loading' || anyActive) {
      phase = 'loading';
    } else if (this.#startedAt !== null) {
      phase = 'ready';
    } else {
      phase = 'idle';
    }
    const percent = involved > 0 && totalKnown && !estimating && sumTotal > 0 ? Math.min(100, Math.round((sumReceived / sumTotal) * 100)) : null;
    const end = this.#finishedAt ?? this.#now();
    const elapsedMs = this.#startedAt === null ? 0 : Math.max(0, Math.round(end - this.#startedAt));
    // 지금 받는 단계: 아직 다 받지 못한 단계를 먼저 고른다. numpy·OpenCV는 둘 다 받은 뒤에야 "준비 끝"이 오므로, 첫 진행 단계만 보이면
    // OpenCV(10MB)를 받는 동안 "numpy(배열 계산) 2.8MB / 2.8MB"에 멈춘 것처럼 보였다(느린 망 100초 — 2026-09-26 Phase 6 사용성 검토 지적 5).
    // 모두 다 받았으면(설치 중) 첫 진행 단계를 보인다.
    const active =
      stages.find((stage) => stage.state === 'active' && !stage.estimated && (stage.total === null || stage.received < stage.total)) ??
      stages.find((stage) => stage.state === 'active');
    // 받은 양을 셀 수 없는 방문(서비스 워커가 아직 쪽을 맡지 않음)에는 어느 파일을 받는 중인지 모른다 — 함께 받는 단계를 모두 적는다
    // ("numpy(배열 계산)·OpenCV(영상 처리) 받는 중… (약 13.6MB)"). 첫 단계만 적으면 OpenCV를 받는 몇 분 동안 numpy만 보였다.
    const estimatedTogether = active?.estimated ? stages.filter((stage) => stage.state === 'active' && stage.estimated) : [];
    const activeLabel = estimatedTogether.length > 1 ? estimatedTogether.map((stage) => stage.label).join('·') : (active?.label ?? '');
    let text: string;
    if (phase === 'failed') {
      text = '파이썬 파일을 받지 못했어요.';
    } else if (active) {
      if (active.estimated) {
        // 받은 양을 셀 수 없는 방문: 표에서 아는 크기를 "약"으로만 알린다.
        const together = estimatedTogether.length > 1 ? estimatedTogether : [active];
        const knownTotal = together.every((stage) => stage.total !== null) ? together.reduce((sum, stage) => sum + (stage.total ?? 0), 0) : null;
        text = knownTotal !== null ? `${activeLabel} 받는 중… (약 ${formatBytes(knownTotal)})` : `${activeLabel} 받는 중…`;
      } else {
        text = active.total !== null ? `${active.label} ${formatBytes(active.received)} / ${formatBytes(active.total)}` : `${active.label} 받는 중…`;
      }
    } else if (phase === 'ready') {
      text = totalKnown && sumTotal > 0 ? `준비 끝 · ${formatBytes(sumTotal)}` : '준비 끝';
    } else {
      text = '';
    }
    return { phase, stages, percent, received: sumReceived, total: totalKnown ? sumTotal : null, activeLabel, source: this.#source, elapsedMs, text };
  }
}
