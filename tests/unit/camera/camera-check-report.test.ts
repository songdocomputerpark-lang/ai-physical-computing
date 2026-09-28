// 점검 페이지 "카메라 영상 확인" 결과 글(src/components/start/camera-check/camera-check-report.ts, 판 1.1.0 — 미해결 121) 단위 테스트.
// 지키는 약속: ① 카메라 수·카메라마다 이름·가상 카메라 표시·브라우저가 먼저 여는 카메라·영상 결과가 [결과 복사] 글에 들어간다
// ② 판정은 셋(ok·warn·fail)이고, 먼저 여는 카메라만 까만 교실(운영자 PC의 경우)에는 실습실 [카메라] 칸에서 고를 카메라 이름을 알려 준다
// ③ 거부·카메라 없음·기능 없음은 이름 없이 까닭만 ④ 영상 자체나 저장 이름은 글에 없다.
import { describe, expect, it } from 'vitest';
import {
  CAMERA_CHECK_RESULT_EVENT,
  MAX_CHECKED_CAMERAS,
  entryText,
  formatCameraCheckReport,
  outcomeMark,
  summarizeCameraCheck,
  type CameraCheckEntry,
  type CameraCheckResult,
} from '../../../src/components/start/camera-check/camera-check-report.ts';

const WHEN = new Date(2026, 8, 28, 21, 40);

const eshare: CameraCheckEntry = { name: 'EShare Virtual Camera', kind: 'virtual', isDefault: true, outcome: 'black', meanLuma: 0 };
const webcam: CameraCheckEntry = { name: 'HD Webcam', kind: 'normal', isDefault: false, outcome: 'ok', meanLuma: 112.43 };

function done(entries: CameraCheckEntry[], skipped = 0): CameraCheckResult {
  return { status: 'done', entries, checkedAt: WHEN, skipped };
}

describe('카메라 한 대 결과 줄', () => {
  it('이름 · 종류 표시 · 먼저 여는 카메라 · 결과(밝기 평균 소수 한 자리)', () => {
    expect(entryText(eshare)).toBe('EShare Virtual Camera [가상 카메라] · 브라우저가 먼저 여는 카메라 — 까만 화면만 와요(밝기 평균 0.0)');
    expect(entryText(webcam)).toBe('HD Webcam — 영상이 잘 들어와요(밝기 평균 112.4)');
    expect(entryText({ name: '카메라 3', kind: 'normal', isDefault: false, outcome: 'no-frames', meanLuma: null })).toBe('카메라 3 — 영상이 한 장도 오지 않아요');
    expect(entryText({ name: 'USB Cam', kind: 'normal', isDefault: false, outcome: 'error', meanLuma: null, reason: '다른 프로그램이 카메라를 쓰고 있어요.' })).toBe(
      'USB Cam — 열지 못했어요: 다른 프로그램이 카메라를 쓰고 있어요.',
    );
    expect([outcomeMark('ok'), outcomeMark('black'), outcomeMark('no-frames'), outcomeMark('error')]).toEqual(['✓', '✕', '!', '✕']);
  });
});

describe('판정', () => {
  it('모두 영상이 들어오면 ok(대처 없음)', () => {
    expect(summarizeCameraCheck(done([{ ...webcam, isDefault: true }]))).toEqual({ level: 'ok', verdict: '카메라 영상이 잘 들어와요.', advice: [] });
    const two = summarizeCameraCheck(done([{ ...webcam, isDefault: true }, { ...webcam, name: 'USB2.0 HD UVC WebCam' }]));
    expect(two.verdict).toBe('카메라 2대 모두 영상이 잘 들어와요.');
  });

  it('먼저 여는 카메라가 가상 카메라라 까맣고 다른 카메라는 되면 warn — 실습실 [카메라] 칸에서 고를 이름과 장치 관리자 방법', () => {
    const summary = summarizeCameraCheck(done([eshare, webcam]));
    expect(summary.level).toBe('warn');
    expect(summary.verdict).toContain('브라우저가 먼저 여는 카메라(EShare Virtual Camera)는 가상 카메라라서 까만 화면만 와요.');
    expect(summary.verdict).toContain('[카메라]에서 HD Webcam을(를) 골라 주세요');
    expect(summary.advice.some((line) => line.includes('장치 관리자 → 카메라 → 가상 카메라'))).toBe(true);
  });

  it('먼저 여는 카메라는 되고 다른 카메라가 안 되면 warn — 되는 카메라를 쓰면 된다', () => {
    const summary = summarizeCameraCheck(done([{ ...webcam, isDefault: true }, { ...eshare, isDefault: false }]));
    expect(summary.level).toBe('warn');
    expect(summary.verdict).toBe('일부 카메라에서 영상이 들어오지 않아요. 실습에는 영상이 잘 들어오는 카메라(HD Webcam)를 쓰면 돼요.');
  });

  it('영상이 들어오는 카메라가 없으면 fail — 가리개·가상 카메라·샘플 입력 순서의 대처', () => {
    const summary = summarizeCameraCheck(done([{ ...eshare, kind: 'normal', name: 'USB Camera' }]));
    expect(summary.level).toBe('fail');
    expect(summary.verdict).toBe('카메라는 켜지지만 영상이 들어오지 않아요.');
    expect(summary.advice[0]).toContain('렌즈 가리개');
    expect(summary.advice.at(-1)).toContain('샘플 입력');
  });

  it('거부·카메라 없음·기능 없음·보안 연결 아님은 까닭만(카메라 줄 없음)', () => {
    for (const status of ['denied', 'no-camera', 'unsupported', 'insecure', 'error'] as const) {
      const result: CameraCheckResult = { status, entries: [], checkedAt: WHEN };
      const summary = summarizeCameraCheck(result);
      expect(summary.level).toBe('fail');
      expect(summary.verdict.endsWith('요.')).toBe(true);
      const text = formatCameraCheckReport(result);
      expect(text.split('\n')).toHaveLength(2);
      expect(text).toContain(`- 판정: ${summary.verdict}`);
    }
  });
});

describe('[결과 복사] 글', () => {
  it('제목(시각)·카메라 수·카메라마다 한 줄·판정 — 점검 표 글 뒤에 붙는다', () => {
    const text = formatCameraCheckReport(done([eshare, webcam]));
    expect(text.split('\n')).toEqual([
      '카메라 영상 확인(눌러서 확인, 2026-09-28 21:40):',
      '- 카메라 2대',
      '- 1. EShare Virtual Camera [가상 카메라] · 브라우저가 먼저 여는 카메라 — 까만 화면만 와요(밝기 평균 0.0)',
      '- 2. HD Webcam — 영상이 잘 들어와요(밝기 평균 112.4)',
      `- 판정: ${summarizeCameraCheck(done([eshare, webcam])).verdict}`,
    ]);
  });

  it(`카메라가 ${MAX_CHECKED_CAMERAS}대를 넘으면 앞의 몇 대만 쟀다고 적는다`, () => {
    const entries = Array.from({ length: MAX_CHECKED_CAMERAS }, (_, index) => ({ ...webcam, name: `Cam ${index + 1}`, isDefault: index === 0 }));
    expect(formatCameraCheckReport(done(entries, 2)).split('\n')[1]).toBe(`- 카메라 ${MAX_CHECKED_CAMERAS + 2}대 — 앞 ${MAX_CHECKED_CAMERAS}대만 확인`);
  });

  it('점검 표에 알리는 이벤트 이름은 사이트 규칙(apc:)을 따른다', () => {
    expect(CAMERA_CHECK_RESULT_EVENT).toBe('apc:camera-check-result');
  });
});
