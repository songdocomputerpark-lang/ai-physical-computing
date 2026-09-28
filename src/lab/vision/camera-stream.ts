/**
 * 카메라 스트림 도우미(판 1.1.0, PROGRESS 미해결 121) — 영상처리 실습실의 웹캠 소스(sources.ts)와 점검 페이지의 카메라 확인
 * (src/components/start/camera-check/)이 함께 쓴다. 가벼운 파일이라 점검 페이지가 실습실 전체를 싣지 않고 이것만 불러온다.
 *
 * - 카메라 목록(listCameras): enumerateDevices()는 허락을 묻지 않는다. 허락 전에는 이름이 비고 카메라가 한 개로 보일 수 있다.
 * - 카메라 열기(requestCamera): 장치 id를 주면 deviceId exact(그 장치만), 없으면 브라우저 기본값(facingMode user — 휴대폰은 앞 카메라).
 * - 까만 영상 지켜보기(VideoBlackWatcher): <video>를 작은 캔버스(64×48)에 그려 밝기를 재고 black-frame.ts의 판정에 넣는다.
 *   영상은 이 작은 계산에만 쓰고 저장하거나 보내지 않는다(PLAN §10).
 * - getUserMedia 오류 → 한국어 이유(describeCameraError, MDN getUserMedia 예외 목록 기준) — sources.ts가 그대로 다시 내보낸다.
 */
import { BLACK_FRAME_LIMITS, BlackFrameWatch, measureLuma, type BlackVerdict, type BlackWatchSummary, type LumaStats } from './black-frame.ts';
import { toCameraDevices, type CameraDevice } from './camera-devices.ts';

/** 소스를 열지 못한 이유(한국어 설명과 종류). 실습실이 종류에 따라 샘플 입력으로 바꾼다. */
export class SourceOpenError extends Error {
  readonly reason: 'denied' | 'not-found' | 'busy' | 'insecure' | 'unsupported' | 'file' | 'unknown';

  constructor(reason: SourceOpenError['reason'], message: string) {
    super(message);
    this.name = 'SourceOpenError';
    this.reason = reason;
  }
}

/** getUserMedia 오류 이름 → 한국어 이유(MDN getUserMedia 예외 목록 기준) */
export function describeCameraError(error: unknown): SourceOpenError {
  if (error instanceof SourceOpenError) {
    return error;
  }
  const name = error instanceof Error ? error.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return new SourceOpenError('denied', '카메라 사용을 허용하지 않았어요. 주소 표시줄의 카메라 아이콘에서 허용으로 바꾸거나, 샘플 입력으로 실습해요.');
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return new SourceOpenError('not-found', '이 컴퓨터에 쓸 수 있는 카메라가 없어요. 샘플 입력으로 실습해요.');
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return new SourceOpenError('busy', '다른 프로그램(화상 수업 등)이 카메라를 쓰고 있어서 열지 못했어요. 그 프로그램을 닫고 다시 실행하거나, 샘플 입력으로 실습해요.');
    case 'SecurityError':
      return new SourceOpenError('insecure', '보안 연결(https)이 아니라서 브라우저가 카메라를 막았어요. 샘플 입력으로 실습해요.');
    default:
      return new SourceOpenError('unknown', `카메라를 열지 못했어요(${name || '알 수 없는 오류'}). 샘플 입력으로 실습해요.`);
  }
}

/** 이 브라우저에 카메라 기능(getUserMedia)이 있는지 */
export function hasCameraApi(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function';
}

/** 이 컴퓨터의 카메라 목록(브라우저 차례 — 0번이 기본). 못 읽으면 빈 목록. 허락을 묻는 창은 뜨지 않는다. */
export async function listCameras(): Promise<CameraDevice[]> {
  const mediaDevices = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
  if (!mediaDevices || typeof mediaDevices.enumerateDevices !== 'function') {
    return [];
  }
  try {
    return toCameraDevices(await mediaDevices.enumerateDevices());
  } catch {
    return [];
  }
}

/**
 * 카메라를 연다. deviceId가 있으면 그 장치만(exact), 없으면 브라우저 기본값(facingMode user).
 * 오류는 getUserMedia의 것 그대로 던진다(describeCameraError로 바꾸는 것은 부르는 쪽).
 */
export function requestCamera(width: number, height: number, deviceId: string | null): Promise<MediaStream> {
  const video: MediaTrackConstraints = { width: { ideal: width }, height: { ideal: height } };
  if (deviceId) {
    video.deviceId = { exact: deviceId };
  } else {
    video.facingMode = 'user';
  }
  return navigator.mediaDevices.getUserMedia({ video, audio: false });
}

/** 스트림이 실제로 연 장치 id(브라우저가 알려 주지 않으면 빈 글자) */
export function openedDeviceId(stream: MediaStream | null | undefined): string {
  const [track] = stream?.getVideoTracks() ?? [];
  try {
    const id = track?.getSettings().deviceId;
    return typeof id === 'string' ? id : '';
  } catch {
    return '';
  }
}

/** 스트림의 모든 트랙을 멈춘다(카메라 불이 꺼진다). */
export function stopStream(stream: MediaStream | null | undefined): void {
  for (const track of stream?.getTracks() ?? []) {
    try {
      track.stop();
    } catch {
      // 이미 멈췄으면 그대로
    }
  }
}

/** <video>의 크기(첫 장)가 정해질 때까지 기다린다(최대 timeoutMs). */
export function waitForVideoSize(video: HTMLVideoElement, timeoutMs = 4000): Promise<void> {
  if (video.videoWidth > 0 && video.videoHeight > 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const timer = setTimeout(finish, timeoutMs);
    function finish() {
      clearTimeout(timer);
      video.removeEventListener('loadedmetadata', finish);
      video.removeEventListener('resize', finish);
      resolve();
    }
    video.addEventListener('loadedmetadata', finish);
    video.addEventListener('resize', finish);
  });
}

/** 지켜보는 동안 판정이 바뀔 때마다 부르는 함수 */
export type BlackVerdictListener = (verdict: BlackVerdict, summary: BlackWatchSummary) => void;

/**
 * <video>를 BLACK_FRAME_LIMITS.sampleIntervalMs마다 작은 캔버스에 그려 까만 영상인지 지켜본다.
 * stop()을 부르거나 video가 문서에서 빠지면 멈춘다. 그림 한 장(64×48)만 잠깐 그렸다 버린다 — 저장하지 않는다.
 */
export class VideoBlackWatcher {
  readonly #video: HTMLVideoElement;
  readonly #watch: BlackFrameWatch;
  readonly #listener: BlackVerdictListener | null;
  readonly #canvas: HTMLCanvasElement;
  /** 잡티를 재는 가운데 조각(줄이지 않고 그대로 옮겨 그린다) */
  readonly #noiseCanvas: HTMLCanvasElement;
  #timer: ReturnType<typeof setInterval> | null = null;
  #last: BlackVerdict = 'watching';

  constructor(video: HTMLVideoElement, listener: BlackVerdictListener | null = null, now: number = performance.now()) {
    this.#video = video;
    this.#listener = listener;
    this.#watch = new BlackFrameWatch(now);
    this.#canvas = document.createElement('canvas');
    this.#canvas.width = BLACK_FRAME_LIMITS.sampleWidth;
    this.#canvas.height = BLACK_FRAME_LIMITS.sampleHeight;
    this.#noiseCanvas = document.createElement('canvas');
    this.#noiseCanvas.width = BLACK_FRAME_LIMITS.noiseWidth;
    this.#noiseCanvas.height = BLACK_FRAME_LIMITS.noiseHeight;
    this.#timer = setInterval(() => this.sample(), BLACK_FRAME_LIMITS.sampleIntervalMs);
  }

  get verdict(): BlackVerdict {
    return this.#watch.verdict;
  }

  summary(): BlackWatchSummary {
    return this.#watch.summary();
  }

  /** 지금 장면을 한 번 잰다(타이머가 부른다 — 테스트·점검 페이지가 바로 부를 수도 있다). */
  sample(now: number = performance.now()): BlackVerdict {
    const video = this.#video;
    let verdict: BlackVerdict;
    if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
      const ctx = this.#canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        const { width, height } = this.#canvas;
        ctx.drawImage(video, 0, 0, width, height);
        const stats = measureLuma(ctx.getImageData(0, 0, width, height).data);
        verdict = this.#watch.add(stats, now, this.#measureNoise(video));
      } else {
        verdict = this.#watch.tick(now);
      }
    } else {
      verdict = this.#watch.tick(now);
    }
    if (verdict !== this.#last) {
      this.#last = verdict;
      this.#listener?.(verdict, this.#watch.summary());
    }
    return verdict;
  }

  stop(): void {
    if (this.#timer !== null) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
  }

  /** 영상 가운데를 줄이지 않고 32×24만 옮겨 그려 잡티(밝기 표준편차)를 잰다 — 줄인 장은 잡티가 평균돼 사라진다(black-frame.ts 머리말). */
  #measureNoise(video: HTMLVideoElement): LumaStats | undefined {
    const ctx = this.#noiseCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      return undefined;
    }
    const { width, height } = this.#noiseCanvas;
    const sx = Math.max(0, Math.floor((video.videoWidth - width) / 2));
    const sy = Math.max(0, Math.floor((video.videoHeight - height) / 2));
    ctx.drawImage(video, sx, sy, width, height, 0, 0, width, height);
    return measureLuma(ctx.getImageData(0, 0, width, height).data);
  }
}
