/**
 * 점검 페이지의 "카메라 영상 확인" 결과 글(판 1.1.0, PROGRESS 미해결 121) — 글만 만드는 순수 함수라 Node 단위 테스트
 * (tests/unit/camera/camera-check-report.test.ts)가 그대로 읽는다. 카메라를 켜고 재는 쪽은 camera-check-run.ts, 화면은 CameraCheck.astro.
 *
 * 무엇을 알려 주나: 이 컴퓨터의 카메라 수, 카메라마다 이름(가상·적외선 카메라 표시)·브라우저가 먼저 여는 카메라인지·영상이 들어오는지
 * (까만 화면만 오는지·한 장도 안 오는지·열지 못했는지). 교실 컴퓨터의 가상 카메라(화면 공유 프로그램)가 진짜 웹캠을 가리는지 알아보는 것이
 * 목적이다(2026-09-17 운영자 컴퓨터).
 *
 * 개인정보(1.1.0 검토 반영 — DECISIONS C58): 장치 이름은 **화면에만** 보인다. [결과 복사] 글(공개 이슈에 붙일 수 있는 글)에는 이름 대신
 * "카메라 1"처럼 번호와 종류, 가상·적외선으로 본 까닭 낱말(예: 'EShare')만 넣는다 — 장치 이름에는 사람 이름이 들 수 있다(맥의 연속성
 * 카메라 "○○의 iPhone 카메라"처럼 기기 이름을 붙인 카메라). 진단에는 번호·종류·낱말이면 된다. 이름은 저장하거나 보내지 않고,
 * 영상은 까만지 재는 데만 쓰고 버린다.
 */
import { CAMERA_KIND_LABELS, type CameraKind } from '../../../lab/vision/camera-devices.ts';
import { CAMERA_PERMISSION_STEP } from '../../../lab/vision/camera-notice.ts';

/** 점검 결과를 점검 표([결과 복사])에 붙이라고 알리는 이름(document에 CustomEvent — detail: CameraCheckResultDetail) */
export const CAMERA_CHECK_RESULT_EVENT = 'apc:camera-check-result';

/** 카메라 한 대를 재 본 결과 */
export type CameraCheckOutcome = 'ok' | 'black' | 'no-frames' | 'error';

export interface CameraCheckEntry {
  /** 화면에만 쓰는 이름(허락 뒤의 장치 이름, 모르면 "카메라 N") — [결과 복사] 글에는 넣지 않는다 */
  readonly name: string;
  readonly kind: CameraKind;
  /** 가상·적외선 카메라로 본 까닭 낱말(camera-devices.ts DEPRIORITIZED_CAMERA_PATTERNS의 name — 예: 'EShare'). 보통 카메라면 없다 */
  readonly pattern?: string;
  /** 브라우저가 장치를 정하지 않고 열 때 먼저 여는 카메라인지 */
  readonly isDefault: boolean;
  readonly outcome: CameraCheckOutcome;
  /** 잰 장들의 밝기 평균(0~255, 못 쟀으면 null) */
  readonly meanLuma: number | null;
  /** outcome이 error일 때 까닭(한국어 한 문장 — 장치 이름 없음) */
  readonly reason?: string;
}

/** 확인 전체의 결과 */
export type CameraCheckStatus = 'done' | 'denied' | 'no-camera' | 'unsupported' | 'insecure' | 'error';

export interface CameraCheckResult {
  readonly status: CameraCheckStatus;
  readonly entries: readonly CameraCheckEntry[];
  readonly checkedAt: Date;
  /** status가 done이 아닐 때의 까닭(한국어) */
  readonly message?: string;
  /** 카메라가 더 많아 재지 않은 수(한 번에 MAX_CHECKED_CAMERAS대까지 잰다) */
  readonly skipped?: number;
}

/** 한 번에 재는 카메라 수 상한(카메라마다 몇 초씩 걸린다) */
export const MAX_CHECKED_CAMERAS = 4;

export interface CameraCheckSummary {
  /** ok = 모두 영상이 들어옴, warn = 들어오는 카메라가 있지만 일부는 아님, fail = 들어오는 카메라가 없음(또는 확인 못 함) */
  readonly level: 'ok' | 'warn' | 'fail';
  readonly verdict: string;
  readonly advice: readonly string[];
}

/** 점검 표([결과 복사])에 넘기는 값 — 복사 글 끝에 붙는 글과, 요약 칸·복사 글 첫머리에 넣을 한 줄 */
export interface CameraCheckResultDetail {
  /** [결과 복사] 글 끝에 붙는 글(formatCameraCheckReport — 장치 이름 없음) */
  readonly text: string;
  readonly level: CameraCheckSummary['level'];
  /** "카메라 영상 확인: 주의"처럼 한 줄(cameraCheckHeadline) */
  readonly headline: string;
}

/** 판정 글에서 카메라를 부르는 법: 화면은 장치 이름, [결과 복사] 글은 번호("카메라 2") */
export interface CameraCheckTextOptions {
  readonly names?: 'label' | 'number';
}

const OUTCOME_TEXT: Readonly<Record<CameraCheckOutcome, string>> = Object.freeze({
  ok: '영상이 잘 들어와요',
  black: '까만 화면만 와요',
  'no-frames': '영상이 한 장도 오지 않아요',
  error: '열지 못했어요',
});

const OUTCOME_MARK: Readonly<Record<CameraCheckOutcome, string>> = Object.freeze({ ok: '✓', black: '✕', 'no-frames': '!', error: '✕' });

/** 결과 한 줄의 앞 기호(색만으로 알리지 않는다) */
export function outcomeMark(outcome: CameraCheckOutcome): string {
  return OUTCOME_MARK[outcome];
}

/** 이름 뒤에 붙는 부분(먼저 여는 카메라 · 결과 · 밝기 · 못 연 까닭) */
function entryTail(entry: CameraCheckEntry): string {
  const first = entry.isDefault ? ' · 브라우저가 먼저 여는 카메라' : '';
  const luma = entry.meanLuma === null || entry.outcome === 'error' || entry.outcome === 'no-frames' ? '' : `(밝기 평균 ${entry.meanLuma.toFixed(1)})`;
  const reason = entry.outcome === 'error' && entry.reason ? `: ${entry.reason}` : '';
  return `${first} — ${OUTCOME_TEXT[entry.outcome]}${luma}${reason}`;
}

/** 카메라 한 대의 결과 한 줄 — **화면용**(장치 이름이 들어간다, 번호 없이 — 번호는 <ol>이 붙인다) */
export function entryText(entry: CameraCheckEntry): string {
  const kind = entry.kind === 'normal' ? '' : ` [${CAMERA_KIND_LABELS[entry.kind]}]`;
  return `${entry.name}${kind}${entryTail(entry)}`;
}

/**
 * 카메라 한 대의 결과 한 줄 — **[결과 복사] 글용**(장치 이름 대신 번호, 가상·적외선이면 걸린 낱말만).
 * 예: "카메라 1 [가상 카메라 — 이름에 'EShare' 낱말] · 브라우저가 먼저 여는 카메라 — 까만 화면만 와요(밝기 평균 0.0)"
 */
export function entryReportText(entry: CameraCheckEntry, index: number): string {
  const why = entry.pattern ? ` — 이름에 '${entry.pattern}' 낱말` : '';
  const kind = entry.kind === 'normal' ? '' : ` [${CAMERA_KIND_LABELS[entry.kind]}${why}]`;
  return `카메라 ${index + 1}${kind}${entryTail(entry)}`;
}

const ADVICE_COVER = '렌즈 가리개(뚜껑)와 노트북의 카메라 끄기 키(Fn + 카메라 그림)를 확인해요.';
const ADVICE_VIRTUAL =
  '화면 공유 프로그램(EShare 등)의 가상 카메라는 장치 관리자 → 카메라 → 가상 카메라에서 마우스 오른쪽 버튼 → 디바이스 사용 안 함으로 끌 수 있어요(관리자 권한이 필요할 수 있어요). 끈 뒤에는 브라우저를 모두 닫고 다시 열어요. 화면 공유를 쓸 때는 다시 켜요.';
const ADVICE_NO_REAL_CAMERA =
  '이 컴퓨터에는 가상 카메라만 보여요. 진짜 웹캠이 없거나 꺼져 있을 수 있어요 — 데스크톱이면 USB 웹캠을 꽂고 [카메라 다시 확인하기]를 눌러요(가상 카메라를 장치 관리자에서 끄면 카메라가 아예 없어져요).';
const ADVICE_BUSY = '화상 수업 프로그램처럼 카메라를 쓰는 다른 프로그램을 닫은 뒤 다시 확인해요.';
const ADVICE_SAMPLE = '카메라가 없거나 안 되어도 실습실의 샘플 입력(움직이는 도형)으로 모든 실습을 끝까지 할 수 있어요.';

/** 결과를 한 줄 판정과 대처로 줄인다(names: 'number'면 장치 이름 대신 "카메라 N" — [결과 복사] 글). */
export function summarizeCameraCheck(result: CameraCheckResult, options: CameraCheckTextOptions = {}): CameraCheckSummary {
  switch (result.status) {
    case 'denied':
      return {
        level: 'fail',
        verdict: '카메라 사용을 허용하지 않아서 확인하지 못했어요.',
        advice: [`${CAMERA_PERMISSION_STEP}한 뒤 다시 눌러 주세요.`, ADVICE_SAMPLE],
      };
    case 'no-camera':
      return { level: 'fail', verdict: '이 컴퓨터에서 카메라를 찾지 못했어요.', advice: ['웹캠이 USB에 꽂혀 있는지 확인해요.', ADVICE_COVER, ADVICE_SAMPLE] };
    case 'unsupported':
      return { level: 'fail', verdict: '이 브라우저에는 카메라 기능이 없어요.', advice: ['컴퓨터용 Chrome이나 Edge 최신판으로 열어 주세요.', ADVICE_SAMPLE] };
    case 'insecure':
      return { level: 'fail', verdict: '보안 연결(https)이 아니라서 카메라를 켤 수 없어요.', advice: ['주소가 https://로 시작하는지 확인해 주세요. 오프라인판은 http://localhost 주소로 열어요.'] };
    case 'error':
      return { level: 'fail', verdict: result.message ?? '카메라를 확인하지 못했어요.', advice: [ADVICE_BUSY, ADVICE_SAMPLE] };
    default:
      break;
  }
  const entries = result.entries;
  const nameOf = (entry: CameraCheckEntry): string => (options.names === 'number' ? `카메라 ${entries.indexOf(entry) + 1}` : entry.name);
  const working = entries.filter((entry) => entry.outcome === 'ok');
  const hasVirtual = entries.some((entry) => entry.kind === 'virtual');
  const allVirtual = entries.length > 0 && entries.every((entry) => entry.kind === 'virtual');
  const hasBusy = entries.some((entry) => entry.outcome === 'error' || entry.outcome === 'no-frames');
  const count = entries.length;
  if (working.length === count && count > 0) {
    return { level: 'ok', verdict: count === 1 ? '카메라 영상이 잘 들어와요.' : `카메라 ${count}대 모두 영상이 잘 들어와요.`, advice: [] };
  }
  const advice: string[] = [];
  if (working.length > 0) {
    const first = entries.find((entry) => entry.isDefault) ?? null;
    const good = working[0]!;
    let verdict: string;
    // 카메라 이름(영어가 많다) 뒤에는 조사를 붙이지 않는다 — "카메라(HD Webcam)를"처럼 한국어 낱말에 붙인다(camera-notice.ts와 같은 규칙).
    if (first && first.outcome !== 'ok' && first.kind !== 'normal') {
      const why = first.kind === 'virtual' ? '가상 카메라라서 ' : '적외선 카메라라서 ';
      verdict =
        `브라우저가 먼저 여는 카메라(${nameOf(first)})는 ${why}${OUTCOME_TEXT[first.outcome]}. ` +
        `실습실은 이런 카메라를 뒤로 미루고 진짜 카메라를 먼저 켜요. 그래도 까맣게 나오면 실습실 입력 칸의 [카메라]에서 영상이 잘 들어오는 카메라(${nameOf(good)})를 골라 주세요.`;
    } else if (first && first.outcome !== 'ok') {
      // 이름으로는 가상 카메라인지 알 수 없는 카메라(예: "USB Video Device") — 실습실도 이 카메라를 먼저 켠다(1.1.0 검토 반영).
      verdict =
        `브라우저가 먼저 여는 카메라(${nameOf(first)})는 ${OUTCOME_TEXT[first.outcome]}. 이 카메라는 이름으로는 가상 카메라인지 알 수 없어서 실습실도 먼저 켜요 — ` +
        `학생 컴퓨터마다 한 번, 실습실 입력 칸의 [카메라]에서 영상이 잘 들어오는 카메라(${nameOf(good)})를 고르면 그 브라우저가 기억해요.`;
    } else {
      verdict = `일부 카메라에서 영상이 들어오지 않아요. 실습에는 영상이 잘 들어오는 카메라(${nameOf(good)})를 쓰면 돼요.`;
    }
    if (hasVirtual) advice.push(ADVICE_VIRTUAL);
    if (hasBusy) advice.push(ADVICE_BUSY);
    return { level: 'warn', verdict, advice };
  }
  // 영상이 들어오는 카메라가 없다. 가상 카메라만 보이면 진짜 웹캠이 없는 것 — 장치 관리자로 가상 카메라를 끄라고 하지 않는다(1.1.0 검토 반영).
  if (allVirtual) {
    advice.push(ADVICE_NO_REAL_CAMERA);
  } else {
    advice.push(ADVICE_COVER);
    if (hasVirtual) advice.push(ADVICE_VIRTUAL);
  }
  if (hasBusy) advice.push(ADVICE_BUSY);
  advice.push(ADVICE_SAMPLE);
  const verdict = allVirtual
    ? count === 1
      ? '가상 카메라만 있고, 영상이 들어오지 않아요.'
      : `가상 카메라만 ${count}대 있고, 모두 영상이 들어오지 않아요.`
    : count === 1
      ? '카메라는 켜지지만 영상이 들어오지 않아요.'
      : `카메라 ${count}대 모두 영상이 들어오지 않아요.`;
  return { level: 'fail', verdict, advice };
}

/** 점검 시각을 "2026-09-28 21:40"처럼(이 컴퓨터 시간) */
function stamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 판정 수준을 한 낱말로(요약 칸·복사 글 첫머리) */
const LEVEL_WORD: Readonly<Record<CameraCheckSummary['level'], string>> = Object.freeze({ ok: '됨', warn: '주의', fail: '안 됨' });

/**
 * 요약 칸과 [결과 복사] 글 첫머리에 넣는 한 줄 — "점검한 항목이 모두 지원"이라는 자동 점검 요약 옆에서 카메라 결과가 묻히지 않게
 * (1.1.0 검토 반영: 카메라가 까만데 요약은 초록 "모두 지원"이라 복사 글 안에서 앞뒤가 달랐다).
 */
export function cameraCheckHeadline(result: CameraCheckResult): string {
  return `카메라 영상 확인: ${LEVEL_WORD[summarizeCameraCheck(result).level]}`;
}

/** [결과 복사]에 붙는 글(점검 표 글 뒤에 빈 줄 하나를 두고 붙는다) — 장치 이름은 넣지 않는다(머리말 개인정보) */
export function formatCameraCheckReport(result: CameraCheckResult): string {
  const summary = summarizeCameraCheck(result, { names: 'number' });
  const lines = [`카메라 영상 확인(눌러서 확인, ${stamp(result.checkedAt)}):`];
  if (result.status === 'done') {
    const extra = result.skipped ? ` — 앞 ${result.entries.length}대만 확인` : '';
    lines.push(`- 카메라 ${result.entries.length + (result.skipped ?? 0)}대${extra}(이름은 넣지 않고 번호로 적어요)`);
    result.entries.forEach((entry, index) => {
      lines.push(`- ${entryReportText(entry, index)}`);
    });
  }
  lines.push(`- 판정: ${summary.verdict}`);
  return lines.join('\n');
}

/** 점검 표에 넘기는 값(CAMERA_CHECK_RESULT_EVENT의 detail) */
export function cameraCheckResultDetail(result: CameraCheckResult): CameraCheckResultDetail {
  return { text: formatCameraCheckReport(result), level: summarizeCameraCheck(result).level, headline: cameraCheckHeadline(result) };
}
