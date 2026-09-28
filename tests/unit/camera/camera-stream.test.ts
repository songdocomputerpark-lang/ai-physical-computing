// @vitest-environment jsdom
// 까만 영상 지켜보기 도우미(src/lab/vision/camera-stream.ts VideoBlackWatcher)의 멈춤 규칙 — 1.1.0 안전 검토 지적 6.
// 머리말의 약속("stop()을 부르거나 video가 문서에서 빠지면 멈춘다")을 지킨다: 부르는 쪽이 stop()을 잊어도 0.25초 타이머와 마지막 표본이 남지 않는다.
// (밝기 판정 자체는 black-frame.test.ts, 실제 카메라 흐름은 tests/e2e/camera.spec.ts)
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BLACK_FRAME_LIMITS } from '../../../src/lab/vision/black-frame.ts';
import { VideoBlackWatcher, describeCameraError } from '../../../src/lab/vision/camera-stream.ts';
import { CAMERA_PERMISSION_STEP } from '../../../src/lab/vision/camera-notice.ts';

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('VideoBlackWatcher 멈춤', () => {
  it('video가 문서에서 빠지면 다음 표본 때 스스로 멈추고, 멈춘 뒤에는 다시 재지 않는다', () => {
    vi.useFakeTimers();
    const video = document.createElement('video');
    document.body.append(video);
    const seen: string[] = [];
    const watcher = new VideoBlackWatcher(video, (verdict) => seen.push(verdict), 0);
    expect(watcher.watching).toBe(true);
    vi.advanceTimersByTime(BLACK_FRAME_LIMITS.sampleIntervalMs * 2);
    expect(watcher.watching).toBe(true);
    video.remove();
    vi.advanceTimersByTime(BLACK_FRAME_LIMITS.sampleIntervalMs + 1);
    expect(watcher.watching).toBe(false);
    const before = [...seen];
    expect(watcher.sample(99_999)).toBe(watcher.verdict);
    vi.advanceTimersByTime(BLACK_FRAME_LIMITS.noFrameMs * 3);
    expect(seen).toEqual(before);
  });

  it('stop()을 부르면 타이머가 멈춘다(두 번 불러도 괜찮다)', () => {
    vi.useFakeTimers();
    const video = document.createElement('video');
    document.body.append(video);
    const watcher = new VideoBlackWatcher(video, null, 0);
    watcher.stop();
    watcher.stop();
    expect(watcher.watching).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('카메라 허용 거부 안내', () => {
  it('실습실 문장이 점검 페이지·도움말과 같은 되돌리는 방법을 쓴다', () => {
    // 브라우저의 DOMException은 Error를 물려받는다(jsdom의 것은 다른 영역이라 이름만 같은 Error로 흉내 낸다)
    const failure = describeCameraError(Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' }));
    expect(failure.reason).toBe('denied');
    expect(failure.message).toContain(CAMERA_PERMISSION_STEP);
    expect(failure.message).toContain('샘플 입력으로 실습해요');
  });
});
