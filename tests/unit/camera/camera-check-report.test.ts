// 점검 페이지 "카메라 영상 확인" 결과 글(src/components/start/camera-check/camera-check-report.ts, 판 1.1.0 — 미해결 121) 단위 테스트.
// 지키는 약속: ① 화면 줄에는 카메라마다 이름·가상 카메라 표시·브라우저가 먼저 여는 카메라·영상 결과 ② [결과 복사] 글에는 장치 이름 대신
// "카메라 N"과 종류·걸린 낱말만(장치 이름에 사람 이름이 들 수 있다 — 1.1.0 안전 검토 지적 1, DECISIONS C58) ③ 판정은 셋(ok·warn·fail)이고,
// 먼저 여는 카메라만 까만 교실(운영자 PC의 경우)에는 실습실 [카메라] 칸에서 고를 카메라를 알려 준다(이름 뒤에 조사를 붙이지 않는다)
// ④ 가상 카메라만 보이는 컴퓨터는 장치 관리자 대신 "진짜 웹캠이 없을 수 있어요" ⑤ 거부·카메라 없음·기능 없음은 이름 없이 까닭만.
import { describe, expect, it } from 'vitest';
import {
  CAMERA_CHECK_RESULT_EVENT,
  MAX_CHECKED_CAMERAS,
  cameraCheckHeadline,
  cameraCheckResultDetail,
  entryReportText,
  entryText,
  formatCameraCheckReport,
  outcomeMark,
  summarizeCameraCheck,
  type CameraCheckEntry,
  type CameraCheckResult,
} from '../../../src/components/start/camera-check/camera-check-report.ts';
import { CAMERA_PERMISSION_STEP } from '../../../src/lab/vision/camera-notice.ts';

const WHEN = new Date(2026, 8, 28, 21, 40);

const eshare: CameraCheckEntry = { name: 'EShare Virtual Camera', kind: 'virtual', pattern: 'EShare', isDefault: true, outcome: 'black', meanLuma: 0 };
const webcam: CameraCheckEntry = { name: 'HD Webcam', kind: 'normal', isDefault: false, outcome: 'ok', meanLuma: 112.43 };
/** 맥 연속성 카메라처럼 기기 이름(흔히 주인 이름)이 붙은 카메라 */
const personal: CameraCheckEntry = { name: '홍길동의 iPhone 카메라', kind: 'normal', isDefault: false, outcome: 'ok', meanLuma: 90 };

function done(entries: CameraCheckEntry[], skipped = 0): CameraCheckResult {
  return { status: 'done', entries, checkedAt: WHEN, skipped };
}

describe('카메라 한 대 결과 줄', () => {
  it('화면 줄: 이름 · 종류 표시 · 먼저 여는 카메라 · 결과(밝기 평균 소수 한 자리)', () => {
    expect(entryText(eshare)).toBe('EShare Virtual Camera [가상 카메라] · 브라우저가 먼저 여는 카메라 — 까만 화면만 와요(밝기 평균 0.0)');
    expect(entryText(webcam)).toBe('HD Webcam — 영상이 잘 들어와요(밝기 평균 112.4)');
    expect(entryText({ name: '카메라 3', kind: 'normal', isDefault: false, outcome: 'no-frames', meanLuma: null })).toBe('카메라 3 — 영상이 한 장도 오지 않아요');
    expect(entryText({ name: 'USB Cam', kind: 'normal', isDefault: false, outcome: 'error', meanLuma: null, reason: '다른 프로그램이 카메라를 쓰고 있어요.' })).toBe(
      'USB Cam — 열지 못했어요: 다른 프로그램이 카메라를 쓰고 있어요.',
    );
    expect([outcomeMark('ok'), outcomeMark('black'), outcomeMark('no-frames'), outcomeMark('error')]).toEqual(['✓', '✕', '!', '✕']);
  });

  it('[결과 복사] 줄: 장치 이름 대신 번호, 가상 카메라는 걸린 낱말만', () => {
    expect(entryReportText(eshare, 0)).toBe("카메라 1 [가상 카메라 — 이름에 'EShare' 낱말] · 브라우저가 먼저 여는 카메라 — 까만 화면만 와요(밝기 평균 0.0)");
    expect(entryReportText(webcam, 1)).toBe('카메라 2 — 영상이 잘 들어와요(밝기 평균 112.4)');
    expect(entryReportText(personal, 2)).not.toContain('홍길동');
  });
});

describe('판정', () => {
  it('모두 영상이 들어오면 ok(대처 없음)', () => {
    expect(summarizeCameraCheck(done([{ ...webcam, isDefault: true }]))).toEqual({ level: 'ok', verdict: '카메라 영상이 잘 들어와요.', advice: [] });
    const two = summarizeCameraCheck(done([{ ...webcam, isDefault: true }, { ...webcam, name: 'USB2.0 HD UVC WebCam' }]));
    expect(two.verdict).toBe('카메라 2대 모두 영상이 잘 들어와요.');
  });

  it('먼저 여는 카메라가 가상 카메라라 까맣고 다른 카메라는 되면 warn — 고를 카메라(조사 없이)와 장치 관리자 방법', () => {
    const summary = summarizeCameraCheck(done([eshare, webcam]));
    expect(summary.level).toBe('warn');
    expect(summary.verdict).toContain('브라우저가 먼저 여는 카메라(EShare Virtual Camera)는 가상 카메라라서 까만 화면만 와요.');
    expect(summary.verdict).toContain('실습실은 이런 카메라를 뒤로 미루고 진짜 카메라를 먼저 켜요');
    expect(summary.verdict).toContain('[카메라]에서 영상이 잘 들어오는 카메라(HD Webcam)를 골라 주세요');
    expect(summary.verdict).not.toContain('을(를)');
    expect(summary.advice.some((line) => line.includes('장치 관리자 → 카메라 → 가상 카메라'))).toBe(true);
    expect(summary.advice.some((line) => line.includes('관리자 권한') && line.includes('다시 켜요'))).toBe(true);
  });

  it('먼저 여는 카메라가 이름으로는 가상 카메라인지 모르는 까만 카메라면 "실습실도 먼저 켜요 — 한 번 고르면 기억"', () => {
    const unknown: CameraCheckEntry = { name: 'USB Video Device', kind: 'normal', isDefault: true, outcome: 'black', meanLuma: 0 };
    const summary = summarizeCameraCheck(done([unknown, webcam]));
    expect(summary.level).toBe('warn');
    expect(summary.verdict).toContain('이름으로는 가상 카메라인지 알 수 없어서 실습실도 먼저 켜요');
    expect(summary.verdict).toContain('그 브라우저가 기억해요');
    expect(summary.verdict).not.toContain('뒤로 미루고');
  });

  it('먼저 여는 카메라는 되고 다른 카메라가 안 되면 warn — 되는 카메라를 쓰면 된다', () => {
    const summary = summarizeCameraCheck(done([{ ...webcam, isDefault: true }, { ...eshare, isDefault: false }]));
    expect(summary.level).toBe('warn');
    expect(summary.verdict).toBe('일부 카메라에서 영상이 들어오지 않아요. 실습에는 영상이 잘 들어오는 카메라(HD Webcam)를 쓰면 돼요.');
  });

  it('영상이 들어오는 카메라가 없으면 fail — 카메라 한 대(가상 아님)는 가리개·샘플 입력(장치 관리자 없음)', () => {
    const summary = summarizeCameraCheck(done([{ ...eshare, kind: 'normal', pattern: undefined, name: 'USB Camera' }]));
    expect(summary.level).toBe('fail');
    expect(summary.verdict).toBe('카메라는 켜지지만 영상이 들어오지 않아요.');
    expect(summary.advice[0]).toContain('렌즈 가리개');
    expect(summary.advice.some((line) => line.includes('장치 관리자'))).toBe(false);
    expect(summary.advice.at(-1)).toContain('샘플 입력');
  });

  it('가상 카메라만 보이는 컴퓨터(웹캠 없는 교실 데스크톱)는 "진짜 웹캠이 없을 수 있어요" — 장치 관리자로 끄라고 하지 않는다', () => {
    const summary = summarizeCameraCheck(done([eshare]));
    expect(summary.level).toBe('fail');
    expect(summary.verdict).toBe('가상 카메라만 있고, 영상이 들어오지 않아요.');
    expect(summary.advice[0]).toContain('진짜 웹캠이 없거나 꺼져 있을 수 있어요');
    expect(summary.advice.some((line) => line.startsWith('화면 공유 프로그램(EShare 등)의 가상 카메라는 장치 관리자'))).toBe(false);
  });

  it('거부·카메라 없음·기능 없음·보안 연결 아님은 까닭만(카메라 줄 없음), 거부는 실습실·도움말과 같은 되돌리는 문장', () => {
    for (const status of ['denied', 'no-camera', 'unsupported', 'insecure', 'error'] as const) {
      const result: CameraCheckResult = { status, entries: [], checkedAt: WHEN };
      const summary = summarizeCameraCheck(result);
      expect(summary.level).toBe('fail');
      expect(summary.verdict.endsWith('요.')).toBe(true);
      const text = formatCameraCheckReport(result);
      expect(text.split('\n')).toHaveLength(2);
      expect(text).toContain(`- 판정: ${summary.verdict}`);
    }
    expect(summarizeCameraCheck({ status: 'denied', entries: [], checkedAt: WHEN }).advice[0]).toContain(CAMERA_PERMISSION_STEP);
  });
});

describe('[결과 복사] 글', () => {
  it('제목(시각)·카메라 수·카메라마다 한 줄(번호·종류)·판정 — 장치 이름은 넣지 않는다', () => {
    const text = formatCameraCheckReport(done([eshare, webcam]));
    expect(text.split('\n')).toEqual([
      '카메라 영상 확인(눌러서 확인, 2026-09-28 21:40):',
      '- 카메라 2대(이름은 넣지 않고 번호로 적어요)',
      "- 카메라 1 [가상 카메라 — 이름에 'EShare' 낱말] · 브라우저가 먼저 여는 카메라 — 까만 화면만 와요(밝기 평균 0.0)",
      '- 카메라 2 — 영상이 잘 들어와요(밝기 평균 112.4)',
      `- 판정: ${summarizeCameraCheck(done([eshare, webcam]), { names: 'number' }).verdict}`,
    ]);
    expect(text).not.toContain('EShare Virtual Camera');
    expect(text).not.toContain('HD Webcam');
    // 판정 글도 이름 대신 번호로
    expect(text).toContain('영상이 잘 들어오는 카메라(카메라 2)를 골라 주세요');
  });

  it('사람 이름이 든 장치 이름(연속성 카메라 등)은 복사 글 어디에도 없다', () => {
    const text = formatCameraCheckReport(done([{ ...eshare }, personal]));
    expect(text).not.toContain('홍길동');
    expect(text).not.toContain('iPhone');
  });

  it(`카메라가 ${MAX_CHECKED_CAMERAS}대를 넘으면 앞의 몇 대만 쟀다고 적는다`, () => {
    const entries = Array.from({ length: MAX_CHECKED_CAMERAS }, (_, index) => ({ ...webcam, name: `Cam ${index + 1}`, isDefault: index === 0 }));
    expect(formatCameraCheckReport(done(entries, 2)).split('\n')[1]).toBe(`- 카메라 ${MAX_CHECKED_CAMERAS + 2}대 — 앞 ${MAX_CHECKED_CAMERAS}대만 확인(이름은 넣지 않고 번호로 적어요)`);
  });

  it('요약 칸·복사 글 첫머리에 넣는 한 줄과 점검 표에 넘기는 값', () => {
    expect(cameraCheckHeadline(done([eshare, webcam]))).toBe('카메라 영상 확인: 주의');
    expect(cameraCheckHeadline(done([{ ...webcam, isDefault: true }]))).toBe('카메라 영상 확인: 됨');
    expect(cameraCheckHeadline({ status: 'denied', entries: [], checkedAt: WHEN })).toBe('카메라 영상 확인: 안 됨');
    const detail = cameraCheckResultDetail(done([eshare, webcam]));
    expect(detail).toEqual({ text: formatCameraCheckReport(done([eshare, webcam])), level: 'warn', headline: '카메라 영상 확인: 주의' });
  });

  it('점검 표에 알리는 이벤트 이름은 사이트 규칙(apc:)을 따른다', () => {
    expect(CAMERA_CHECK_RESULT_EVENT).toBe('apc:camera-check-result');
  });
});
