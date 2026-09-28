/**
 * 점검 페이지의 "카메라 영상 확인" — [카메라 켜서 확인하기]를 누를 때만 카메라를 켠다(판 1.1.0, PROGRESS 미해결 121).
 * 화면(CameraCheck.astro)이 누를 때 import()로 불러오므로 점검 페이지를 열기만 해서는 이 파일도 받지 않는다.
 *
 * 차례
 * 1. 브라우저 기본값으로 카메라를 연다(허락 창이 뜬다) → 허락 뒤라 이름이 채워진 카메라 목록을 읽는다.
 * 2. 브라우저가 먼저 연 카메라부터, 카메라마다 한 대씩 열어 까만지 잰다(black-frame.ts 판정 — 밝은 장이 오면 바로, 까만 장만 오면
 *    2초 + 1초 더 보고, 장이 안 오면 4초 뒤). 다음 카메라를 열기 전에 앞 카메라를 끈다. 한 번에 MAX_CHECKED_CAMERAS대까지.
 * 3. 끝나면 모든 카메라를 끄고 결과(CameraCheckResult)를 돌려준다.
 * 영상은 64×48 작은 그림으로 밝기를 재는 데만 쓰고 저장하거나 보내지 않는다. 장치 이름도 저장하지 않는다(화면에만 — [결과 복사] 글에는
 * 번호·종류·걸린 낱말만, camera-check-report.ts 머리말).
 */
import { BLACK_FRAME_LIMITS } from '../../../lab/vision/black-frame.ts';
import { cameraName, matchedCameraPattern, type CameraDevice } from '../../../lab/vision/camera-devices.ts';
import {
  VideoBlackWatcher,
  describeCameraError,
  hasCameraApi,
  listCameras,
  openedDeviceId,
  requestCamera,
  stopStream,
  type SourceOpenError,
} from '../../../lab/vision/camera-stream.ts';
import { MAX_CHECKED_CAMERAS, type CameraCheckEntry, type CameraCheckResult, type CameraCheckStatus } from './camera-check-report.ts';

export interface RunCameraCheckOptions {
  /** 확인하는 동안 영상을 보여 줄 <video>(끝나면 비운다) */
  readonly video: HTMLVideoElement;
  /** 지금 무엇을 하는지 알리는 글 */
  readonly onProgress?: (text: string) => void;
  /** 지금 시각(테스트용) */
  readonly now?: () => Date;
}

/** 카메라를 못 연 까닭 한 문장(점검 결과에 붙는다 — "샘플 입력으로 실습해요" 같은 실습실 문장은 뺀다) */
function shortReason(failure: SourceOpenError): string {
  switch (failure.reason) {
    case 'busy':
      return '다른 프로그램이 카메라를 쓰고 있어요.';
    case 'not-found':
      return '장치를 찾지 못했어요.';
    case 'denied':
      return '카메라 사용을 허용하지 않았어요.';
    case 'insecure':
      return '보안 연결(https)이 아니에요.';
    default: {
      const index = failure.message.indexOf('. ');
      return index >= 0 ? failure.message.slice(0, index + 1) : failure.message;
    }
  }
}

/** 스트림을 video에 틀고 까만지 잰다. */
function measure(stream: MediaStream, video: HTMLVideoElement): Promise<{ outcome: 'ok' | 'black' | 'no-frames'; meanLuma: number | null }> {
  video.srcObject = stream;
  void video.play().catch(() => undefined);
  return new Promise((resolve) => {
    let finished = false;
    let grace: ReturnType<typeof setTimeout> | null = null;
    const finish = () => {
      if (finished) {
        return;
      }
      finished = true;
      clearTimeout(limit);
      if (grace !== null) {
        clearTimeout(grace);
      }
      watcher.stop();
      const summary = watcher.summary();
      const verdict = watcher.verdict;
      const outcome = verdict === 'ok' ? 'ok' : verdict === 'black' || (verdict === 'watching' && summary.samples > 0) ? 'black' : 'no-frames';
      resolve({ outcome, meanLuma: summary.meanLuma });
    };
    const watcher = new VideoBlackWatcher(video, (verdict) => {
      if (verdict === 'ok') {
        finish();
      } else if ((verdict === 'black' || verdict === 'no-frames') && grace === null) {
        // 노출을 맞추느라 늦게 밝아지는 웹캠이 있어 1초 더 본다.
        grace = setTimeout(finish, 1000);
      }
    });
    const limit = setTimeout(finish, BLACK_FRAME_LIMITS.noFrameMs + 2000);
  });
}

function failedStatus(failure: SourceOpenError): CameraCheckStatus {
  switch (failure.reason) {
    case 'denied':
      return 'denied';
    case 'not-found':
      return 'no-camera';
    case 'insecure':
      return 'insecure';
    default:
      return 'error';
  }
}

/** 카메라 영상 확인을 돌린다(누른 뒤에만 부른다). */
export async function runCameraCheck(options: RunCameraCheckOptions): Promise<CameraCheckResult> {
  const now = options.now ?? (() => new Date());
  const progress = options.onProgress ?? (() => undefined);
  if (typeof window !== 'undefined' && window.isSecureContext === false) {
    return { status: 'insecure', entries: [], checkedAt: now() };
  }
  if (!hasCameraApi()) {
    return { status: 'unsupported', entries: [], checkedAt: now() };
  }
  progress('카메라를 켜는 중이에요. 브라우저가 물으면 "허용"을 눌러 주세요.');
  let first: MediaStream | null;
  try {
    first = await requestCamera(640, 480, null);
  } catch (error) {
    const failure = describeCameraError(error);
    return { status: failedStatus(failure), entries: [], checkedAt: now(), message: shortReason(failure) };
  }
  const video = options.video;
  const entries: CameraCheckEntry[] = [];
  let skipped = 0;
  try {
    const cameras = await listCameras();
    const defaultId = openedDeviceId(first);
    // 브라우저가 먼저 연 카메라(장치 id를 모르면 명세대로 목록 첫 항목)를 맨 앞에 두고 나머지는 브라우저 차례
    const defaultCamera: CameraDevice = cameras.find((camera) => camera.deviceId === defaultId) ??
      cameras[0] ?? { deviceId: defaultId, label: '', kind: 'normal', index: 0 };
    const ordered = [defaultCamera, ...cameras.filter((camera) => camera !== defaultCamera)];
    const toCheck = ordered.slice(0, MAX_CHECKED_CAMERAS);
    skipped = ordered.length - toCheck.length;
    for (const [index, camera] of toCheck.entries()) {
      const name = cameraName(camera);
      const pattern = camera.kind === 'normal' ? undefined : matchedCameraPattern(camera.label)?.name;
      const isDefault = camera === defaultCamera;
      progress(toCheck.length === 1 ? `카메라(${name})를 확인하는 중이에요…` : `카메라 ${toCheck.length}대 가운데 ${index + 1}번째(${name})를 확인하는 중이에요…`);
      let stream: MediaStream;
      if (isDefault && first) {
        stream = first;
        first = null;
      } else {
        try {
          stream = await requestCamera(640, 480, camera.deviceId || null);
        } catch (error) {
          entries.push({ name, kind: camera.kind, pattern, isDefault, outcome: 'error', meanLuma: null, reason: shortReason(describeCameraError(error)) });
          continue;
        }
      }
      try {
        const measured = await measure(stream, video);
        entries.push({ name, kind: camera.kind, pattern, isDefault, outcome: measured.outcome, meanLuma: measured.meanLuma });
      } finally {
        stopStream(stream);
        video.srcObject = null;
      }
    }
  } finally {
    stopStream(first);
    video.srcObject = null;
  }
  return { status: 'done', entries, checkedAt: now(), skipped };
}
