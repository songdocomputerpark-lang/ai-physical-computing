/**
 * 영상 처리 실습실의 입력 소스(PLAN §8.2 P2-03, SPEC §6.1 "입력 소스: 웹캠(기본) / 카메라 없을 때 샘플 / 파일 업로드", PD-30).
 *
 * 입력 소스는 "열면(open) 프레임을 그려 주는 것(grab)"이다. 파이썬의 cv2.VideoCapture(0)·cap.read()는 어떤 소스가 열려 있든
 * 같은 모양(RGBA 바이트)을 받으므로 학생 코드는 웹캠이든 샘플이든 같다(원칙 3 "하드웨어 없어도 100%").
 *
 * 소스 종류
 * - webcam : 화면 쪽 getUserMedia(640×480 요청, facingMode user). 권한 거부·카메라 없음이면 한국어 이유와 함께 실패한다
 *            (실습실이 샘플 입력으로 자동 전환한다 — vision-lab.ts).
 *            카메라가 여러 대면(판 1.1.0, 미해결 121) 학생이 고른 장치(OpenOptions.deviceId)를 deviceId exact로 열고, 고르지 않았으면
 *            가상 카메라(화면 공유 프로그램 등이 만든 카메라 — camera-devices.ts)를 뒤로 미루고 진짜 카메라를 먼저 연다.
 *            허락 전에는 장치 이름을 알 수 없어 브라우저 기본값으로 열고, 허락 뒤 목록에서 연 장치가 가상 카메라로 보이면 진짜 카메라로 바꿔 연다.
 *            열린 장치와 목록은 OpenedSource.camera로 돌려준다(실습실의 [카메라] 고르기 칸이 쓴다).
 * - sample : 코드로 그리는 움직이는 도형·글자·그라데이션(frame.ts SampleScene). 사진이 아니라 저작권·개인정보 걱정이 없다.
 * - file   : 학생이 고른 그림 파일(png·jpg 등)을 한 장으로 되풀이해 준다. 파일은 브라우저 메모리에만 있고 밖으로 나가지 않는다.
 * - (P2-08) 합성 랜드마크 재생 입력: registerVisionSource()로 더한다. 화면의 소스 고르기 목록은 등록된 순서대로 보인다.
 *
 * 새 소스를 더하는 법: VisionSource를 만들어 registerVisionSource()에 넘긴다. open()은 OpenedSource(크기·grab·close)를 돌려준다.
 * grab(ctx, width, height)는 주어진 2D 캔버스에 지금 장면을 그린다(실습실이 그 캔버스에서 RGBA를 읽어 파이썬에 준다).
 */
import { avoidDefaultCamera, betterCameraThan, type CameraDevice } from './camera-devices.ts';
import {
  SourceOpenError,
  describeCameraError,
  hasCameraApi,
  listCameras,
  openedDeviceId,
  requestCamera,
  stopStream,
  waitForVideoSize,
} from './camera-stream.ts';
import { DEFAULT_FRAME_HEIGHT, DEFAULT_FRAME_WIDTH, MAX_FRAME_HEIGHT, MAX_FRAME_WIDTH, SampleScene, clampFrameSize } from './frame.ts';

// 전에 이 파일에 있던 이름(실습실·흉내 모듈이 여기서 가져간다) — 카메라 스트림 도우미로 옮겼다(판 1.1.0).
export { SourceOpenError, describeCameraError, listCameras };

export type VisionSourceKind = 'webcam' | 'sample' | 'file' | 'replay';

export interface OpenOptions {
  /** 부탁하는 크기(웹캠은 ideal 제약, 샘플은 그대로). 기본 640×480 */
  readonly width?: number;
  readonly height?: number;
  /** 웹캠: 열 카메라 장치 id. 없으면 알아서 고른다(가상 카메라는 뒤로 — camera-devices.ts) */
  readonly deviceId?: string | null;
  /**
   * 웹캠: deviceId를 학생이 **지금** [카메라] 칸에서 골랐다. 그 장치를 못 열어도(빠짐·다른 프로그램이 쓰는 중) 입력이 꺼지지 않게
   * 알아서 고른 카메라로 열고, 못 연 까닭을 OpenedCamera.fallbackReason에 적는다(실습실이 학생에게 보인다).
   * false(기본)면 이 브라우저에 기억해 둔 장치라서, 못 열 때 까닭을 짧게만 적는다.
   */
  readonly exactDevice?: boolean;
}

/** 웹캠이 실제로 연 카메라(판 1.1.0 — 실습실의 [카메라] 고르기 칸과 까만 영상 안내가 쓴다) */
export interface OpenedCamera {
  /** 열린 장치 id(브라우저가 알려 주지 않으면 빈 글자) */
  readonly deviceId: string;
  /** 연 뒤(허락 뒤) 다시 읽은 카메라 목록 — 이름이 채워져 있다 */
  readonly cameras: readonly CameraDevice[];
  /** 브라우저 기본 장치가 가상 카메라라서 진짜 카메라로 바꿔 열었으면 그 가상 카메라 */
  readonly avoided: CameraDevice | null;
  /** 고른(또는 이 브라우저에 기억해 둔) 카메라를 열지 못해 다른 카메라로 열었으면 그 까닭(한국어 한두 문장), 아니면 null */
  readonly fallbackReason: string | null;
}

/** 열린 입력 소스 */
export interface OpenedSource {
  readonly kind: VisionSourceKind;
  /** 실제 프레임 크기(cap.get이 돌려주는 값) */
  readonly width: number;
  readonly height: number;
  /** 소스가 스스로 아는 초당 장수(모르면 0) */
  readonly fps: number;
  /** 미리 보기에 그대로 보여 줄 수 있는 요소(웹캠의 <video>). 없으면 실습실이 grab 결과를 미리 보기에 쓴다. */
  readonly previewElement?: HTMLVideoElement;
  /** 웹캠만: 연 카메라 장치와 목록 */
  readonly camera?: OpenedCamera;
  /** 지금 장면을 ctx에 그린다(width×height). 아직 준비 전(첫 프레임 전)이면 false. */
  grab(ctx: CanvasRenderingContext2D, width: number, height: number, now: number): boolean;
  /** 크기 바꾸기(cap.set). 바뀐 실제 크기를 돌려준다(못 바꾸면 그대로). */
  resize(width: number, height: number): Promise<{ width: number; height: number }>;
  /** 카메라·파일을 놓는다. */
  close(): void;
}

export interface VisionSource {
  readonly id: string;
  readonly kind: VisionSourceKind;
  /** 소스 고르기 목록에 보이는 이름 */
  readonly label: string;
  /** 한 줄 설명(고1 눈높이) */
  readonly description: string;
  /** 이 브라우저에서 쓸 수 있는지(웹캠은 getUserMedia 유무) */
  isAvailable(): boolean;
  open(options?: OpenOptions): Promise<OpenedSource>;
}

const registry: VisionSource[] = [];

/** 입력 소스를 목록에 더한다(같은 id면 바꿔 넣는다). 등록 순서가 화면 목록 순서다. */
export function registerVisionSource(source: VisionSource): void {
  const index = registry.findIndex((item) => item.id === source.id);
  if (index >= 0) {
    registry[index] = source;
  } else {
    registry.push(source);
  }
}

export function listVisionSources(): readonly VisionSource[] {
  return registry;
}

export function findVisionSource(id: string | null | undefined): VisionSource | undefined {
  return id ? registry.find((item) => item.id === id) : undefined;
}

// ── 웹캠 ──

/**
 * 고른 카메라를 못 열었을 때의 까닭 한 문장(describeCameraError의 문장은 "…샘플 입력으로 실습해요."로 끝나 다른 카메라가 열린 지금과 맞지 않아
 * 따로 적는다). 실습실이 뒤에 "대신 켠 카메라: …"를 붙인다(camera-notice.ts cameraOpenedMessage).
 */
export function chosenCameraFailure(reason: SourceOpenError['reason']): string {
  switch (reason) {
    case 'not-found':
      return '고른 카메라를 찾지 못했어요(선이 빠졌을 수 있어요).';
    case 'busy':
      return '고른 카메라를 다른 프로그램이 쓰고 있어서 열지 못했어요.';
    default:
      return '고른 카메라를 열지 못했어요.';
  }
}

class WebcamSource implements VisionSource {
  readonly id = 'webcam';
  readonly kind = 'webcam' as const;
  readonly label = '웹캠(카메라)';
  readonly description = '컴퓨터에 달린 카메라 영상을 써요. 영상은 이 컴퓨터 안에서만 처리돼요.';

  isAvailable(): boolean {
    return hasCameraApi();
  }

  async open(options: OpenOptions = {}): Promise<OpenedSource> {
    if (!this.isAvailable()) {
      throw new SourceOpenError('unsupported', '이 브라우저에는 카메라 기능(getUserMedia)이 없어요. 샘플 입력으로 실습해요.');
    }
    const width = clampFrameSize(options.width ?? DEFAULT_FRAME_WIDTH, MAX_FRAME_WIDTH);
    const height = clampFrameSize(options.height ?? DEFAULT_FRAME_HEIGHT, MAX_FRAME_HEIGHT);
    const wanted = typeof options.deviceId === 'string' && options.deviceId !== '' ? options.deviceId : null;
    const chosenNow = wanted !== null && options.exactDevice === true;

    // ① 무엇을 열지 정한다. 허락 전 목록은 이름·id가 비어 있어 기억한 장치가 아직 있는지 알 수 없으므로 그대로 시도한다.
    const before = await listCameras();
    const listKnown = before.length > 0 && before.every((camera) => camera.deviceId !== '');
    let target: string | null = wanted;
    let fallbackReason: string | null = null;
    if (wanted !== null && listKnown && !before.some((camera) => camera.deviceId === wanted)) {
      target = null;
      fallbackReason = chosenNow ? chosenCameraFailure('not-found') : '전에 고른 카메라가 보이지 않아요.';
    }
    let avoided: CameraDevice | null = null;
    if (target === null) {
      // 이미 허락을 받아 이름을 알면: 시스템 기본(첫 항목)이 가상 카메라일 때 진짜 카메라를 바로 연다(가상 카메라를 한 번도 켜지 않게).
      const better = avoidDefaultCamera(before);
      if (better) {
        target = better.deviceId;
        avoided = before[0] ?? null;
      }
    }

    // ② 연다. 고른(또는 기억한) 장치를 못 열면 — 거부·보안 연결이 아닌 한 — 브라우저 기본값으로 한 번 더 연다.
    let stream: MediaStream;
    try {
      stream = await requestCamera(width, height, target);
    } catch (error) {
      const failure = describeCameraError(error);
      if (target === null || failure.reason === 'denied' || failure.reason === 'insecure') {
        throw failure;
      }
      if (target === wanted) {
        fallbackReason = chosenNow ? chosenCameraFailure(failure.reason) : '전에 고른 카메라를 열지 못했어요.';
      }
      avoided = null;
      target = null;
      try {
        stream = await requestCamera(width, height, null);
      } catch (second) {
        throw describeCameraError(second);
      }
    }

    // ③ 허락 뒤라 이름이 채워진 목록을 다시 읽는다. 브라우저 기본값으로 연 장치가 가상 카메라이고 진짜 카메라가 따로 있으면 바꿔 연다
    //    (처음 허락하는 교실 컴퓨터 — 운영자 컴퓨터에서 겪은 경우). 진짜 카메라를 못 열면 처음 장치로 되돌린다.
    let cameras = await listCameras();
    let deviceId = openedDeviceId(stream);
    if (target === null) {
      const better = betterCameraThan(cameras, deviceId);
      if (better) {
        const first = cameras.find((camera) => camera.deviceId === deviceId) ?? null;
        stopStream(stream);
        try {
          stream = await requestCamera(width, height, better.deviceId);
          avoided = first;
        } catch {
          try {
            stream = await requestCamera(width, height, deviceId || null);
          } catch (error) {
            throw describeCameraError(error);
          }
        }
        deviceId = openedDeviceId(stream);
        cameras = await listCameras();
      }
    }

    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('aria-label', '카메라 미리 보기');
    video.srcObject = stream;
    try {
      // 장을 한 장도 보내지 않는 카메라(쉬는 가상 카메라 등)는 play()가 끝나지 않을 수 있어 4초만 기다린다 — 그 뒤에는 실습실의
      // 까만 영상 감지가 "영상이 들어오지 않아요"를 안내한다(판 1.1.0).
      await Promise.race([video.play(), new Promise<void>((resolve) => setTimeout(resolve, 4000))]);
    } catch (error) {
      stopStream(stream);
      throw describeCameraError(error);
    }
    await waitForVideoSize(video);
    const [track] = stream.getVideoTracks();
    const settings = track?.getSettings() ?? {};
    let actualWidth = video.videoWidth || settings.width || width;
    let actualHeight = video.videoHeight || settings.height || height;
    const fps = typeof settings.frameRate === 'number' ? Math.round(settings.frameRate) : 0;
    const camera: OpenedCamera = Object.freeze({ deviceId, cameras: Object.freeze([...cameras]), avoided, fallbackReason });

    const opened: OpenedSource = {
      kind: 'webcam',
      get width() {
        return actualWidth;
      },
      get height() {
        return actualHeight;
      },
      fps,
      previewElement: video,
      camera,
      grab(ctx, targetWidth, targetHeight) {
        if (video.readyState < 2 || video.videoWidth === 0) {
          return false;
        }
        ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
        return true;
      },
      async resize(newWidth, newHeight) {
        if (track && typeof track.applyConstraints === 'function') {
          try {
            await track.applyConstraints({ width: { ideal: newWidth }, height: { ideal: newHeight } });
            await waitForVideoSize(video);
          } catch {
            // 카메라가 그 크기를 못 주면 원래 크기로 둔다.
          }
        }
        actualWidth = video.videoWidth || actualWidth;
        actualHeight = video.videoHeight || actualHeight;
        return { width: actualWidth, height: actualHeight };
      },
      close() {
        video.pause();
        stopStream(stream);
        video.srcObject = null;
        video.remove();
      },
    };
    return opened;
  }
}

// ── 샘플(코드로 그린 장면) ──

class SampleSource implements VisionSource {
  readonly id = 'sample';
  readonly kind = 'sample' as const;
  readonly label = '샘플 입력(움직이는 도형)';
  readonly description = '카메라가 없어도 돼요. 실습실이 직접 그리는 도형과 글자가 천천히 움직여요.';

  isAvailable(): boolean {
    return true;
  }

  open(options: OpenOptions = {}): Promise<OpenedSource> {
    let width = clampFrameSize(options.width ?? DEFAULT_FRAME_WIDTH, MAX_FRAME_WIDTH);
    let height = clampFrameSize(options.height ?? DEFAULT_FRAME_HEIGHT, MAX_FRAME_HEIGHT);
    const scene = new SampleScene();
    let lastAt: number | null = null;
    const opened: OpenedSource = {
      kind: 'sample',
      get width() {
        return width;
      },
      get height() {
        return height;
      },
      fps: 0,
      grab(ctx, targetWidth, targetHeight, now) {
        if (lastAt !== null) {
          scene.advance((now - lastAt) / 1000);
        }
        lastAt = now;
        scene.draw(ctx, targetWidth, targetHeight);
        return true;
      },
      resize(newWidth, newHeight) {
        width = clampFrameSize(newWidth, MAX_FRAME_WIDTH);
        height = clampFrameSize(newHeight, MAX_FRAME_HEIGHT);
        return Promise.resolve({ width, height });
      },
      close() {
        lastAt = null;
      },
    };
    return Promise.resolve(opened);
  }
}

// ── 파일(그림 한 장) ──

/** 파일 소스가 쓸 그림. 실습실의 파일 고르기가 setFileImage()로 넣는다. */
let fileImage: { bitmap: ImageBitmap | HTMLImageElement; name: string; width: number; height: number } | null = null;

export function currentFileImage(): { name: string; width: number; height: number } | null {
  return fileImage ? { name: fileImage.name, width: fileImage.width, height: fileImage.height } : null;
}

/** 학생이 고른 그림 파일을 파일 소스에 넣는다(브라우저 메모리에만). 그림이 아니거나 읽지 못하면 SourceOpenError('file'). */
export async function setFileImage(file: File): Promise<{ name: string; width: number; height: number }> {
  if (!file.type.startsWith('image/')) {
    throw new SourceOpenError('file', `"${file.name}"은(는) 그림 파일이 아니에요. png·jpg·webp 같은 그림 파일을 골라 주세요.`);
  }
  let bitmap: ImageBitmap | HTMLImageElement;
  try {
    bitmap = typeof createImageBitmap === 'function' ? await createImageBitmap(file) : await loadImageElement(file);
  } catch {
    throw new SourceOpenError('file', `"${file.name}" 파일을 그림으로 읽지 못했어요. 다른 파일을 골라 주세요.`);
  }
  const width = 'naturalWidth' in bitmap ? bitmap.naturalWidth : bitmap.width;
  const height = 'naturalHeight' in bitmap ? bitmap.naturalHeight : bitmap.height;
  if (width === 0 || height === 0) {
    throw new SourceOpenError('file', `"${file.name}" 파일이 비어 있어요.`);
  }
  if (fileImage && 'close' in fileImage.bitmap && typeof fileImage.bitmap.close === 'function') {
    fileImage.bitmap.close();
  }
  fileImage = { bitmap, name: file.name, width, height };
  return { name: file.name, width, height };
}

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image'));
    };
    image.src = url;
  });
}

/** 그림을 목표 크기 안에 맞춰(비율 유지) 넣을 때의 크기 */
export function fitSize(sourceWidth: number, sourceHeight: number, maxWidth: number, maxHeight: number): { width: number; height: number } {
  const scale = Math.min(1, maxWidth / sourceWidth, maxHeight / sourceHeight);
  return { width: Math.max(8, Math.round(sourceWidth * scale)), height: Math.max(8, Math.round(sourceHeight * scale)) };
}

class FileSource implements VisionSource {
  readonly id = 'file';
  readonly kind = 'file' as const;
  readonly label = '내 그림 파일';
  readonly description = '컴퓨터에 있는 그림 파일 한 장을 넣어요. 파일은 이 컴퓨터 밖으로 나가지 않아요.';

  isAvailable(): boolean {
    return true;
  }

  open(options: OpenOptions = {}): Promise<OpenedSource> {
    const image = fileImage;
    if (!image) {
      return Promise.reject(new SourceOpenError('file', '먼저 [그림 파일 고르기]로 그림 파일을 골라 주세요.'));
    }
    const maxWidth = clampFrameSize(options.width ?? DEFAULT_FRAME_WIDTH, MAX_FRAME_WIDTH);
    const maxHeight = clampFrameSize(options.height ?? DEFAULT_FRAME_HEIGHT, MAX_FRAME_HEIGHT);
    let size = fitSize(image.width, image.height, maxWidth, maxHeight);
    const opened: OpenedSource = {
      kind: 'file',
      get width() {
        return size.width;
      },
      get height() {
        return size.height;
      },
      fps: 0,
      grab(ctx, targetWidth, targetHeight) {
        ctx.drawImage(image.bitmap, 0, 0, targetWidth, targetHeight);
        return true;
      },
      resize(newWidth, newHeight) {
        size = fitSize(image.width, image.height, clampFrameSize(newWidth, MAX_FRAME_WIDTH), clampFrameSize(newHeight, MAX_FRAME_HEIGHT));
        return Promise.resolve({ ...size });
      },
      close() {
        // 그림은 다음 실행에서도 쓰므로 놓지 않는다(setFileImage가 바꿀 때 닫는다).
      },
    };
    return Promise.resolve(opened);
  }
}

registerVisionSource(new WebcamSource());
registerVisionSource(new SampleSource());
registerVisionSource(new FileSource());

/** 기본 소스: 카메라 기능이 있으면 웹캠, 없으면 샘플 */
export function defaultVisionSourceId(): string {
  const webcam = findVisionSource('webcam');
  return webcam?.isAvailable() ? 'webcam' : 'sample';
}
