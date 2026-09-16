/**
 * 영상처리 실습실의 입력 소스(PLAN §8.2 P2-03, SPEC §6.1 "입력 소스: 웹캠(기본) / 카메라 없을 때 샘플 / 파일 업로드", PD-30).
 *
 * 입력 소스는 "열면(open) 프레임을 그려 주는 것(grab)"이다. 파이썬의 cv2.VideoCapture(0)·cap.read()는 어떤 소스가 열려 있든
 * 같은 모양(RGBA 바이트)을 받으므로 학생 코드는 웹캠이든 샘플이든 같다(원칙 3 "하드웨어 없어도 100%").
 *
 * 소스 종류
 * - webcam : 화면 쪽 getUserMedia(640×480 요청, facingMode user). 권한 거부·카메라 없음이면 한국어 이유와 함께 실패한다
 *            (실습실이 샘플 입력으로 자동 전환한다 — vision-lab.ts).
 * - sample : 코드로 그리는 움직이는 도형·글자·그라데이션(frame.ts SampleScene). 사진이 아니라 저작권·개인정보 걱정이 없다.
 * - file   : 학생이 고른 그림 파일(png·jpg 등)을 한 장으로 되풀이해 준다. 파일은 브라우저 메모리에만 있고 밖으로 나가지 않는다.
 * - (P2-08) 합성 랜드마크 재생 입력: registerVisionSource()로 더한다. 화면의 소스 고르기 목록은 등록된 순서대로 보인다.
 *
 * 새 소스를 더하는 법: VisionSource를 만들어 registerVisionSource()에 넘긴다. open()은 OpenedSource(크기·grab·close)를 돌려준다.
 * grab(ctx, width, height)는 주어진 2D 캔버스에 지금 장면을 그린다(실습실이 그 캔버스에서 RGBA를 읽어 파이썬에 준다).
 */
import { DEFAULT_FRAME_HEIGHT, DEFAULT_FRAME_WIDTH, MAX_FRAME_HEIGHT, MAX_FRAME_WIDTH, SampleScene, clampFrameSize } from './frame.ts';

export type VisionSourceKind = 'webcam' | 'sample' | 'file' | 'replay';

export interface OpenOptions {
  /** 부탁하는 크기(웹캠은 ideal 제약, 샘플은 그대로). 기본 640×480 */
  readonly width?: number;
  readonly height?: number;
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

/** 소스를 열지 못한 이유(한국어 설명과 종류). 실습실이 종류에 따라 샘플 입력으로 바꾼다. */
export class SourceOpenError extends Error {
  readonly reason: 'denied' | 'not-found' | 'busy' | 'insecure' | 'unsupported' | 'file' | 'unknown';

  constructor(reason: SourceOpenError['reason'], message: string) {
    super(message);
    this.name = 'SourceOpenError';
    this.reason = reason;
  }
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

/** getUserMedia 오류 이름 → 한국어 이유(MDN getUserMedia 예외 목록 기준) */
export function describeCameraError(error: unknown): SourceOpenError {
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

class WebcamSource implements VisionSource {
  readonly id = 'webcam';
  readonly kind = 'webcam' as const;
  readonly label = '웹캠(카메라)';
  readonly description = '컴퓨터에 달린 카메라 영상을 써요. 영상은 이 컴퓨터 안에서만 처리돼요.';

  isAvailable(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function';
  }

  async open(options: OpenOptions = {}): Promise<OpenedSource> {
    if (!this.isAvailable()) {
      throw new SourceOpenError('unsupported', '이 브라우저에는 카메라 기능(getUserMedia)이 없어요. 샘플 입력으로 실습해요.');
    }
    const width = clampFrameSize(options.width ?? DEFAULT_FRAME_WIDTH, MAX_FRAME_WIDTH);
    const height = clampFrameSize(options.height ?? DEFAULT_FRAME_HEIGHT, MAX_FRAME_HEIGHT);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: width }, height: { ideal: height }, facingMode: 'user' },
        audio: false,
      });
    } catch (error) {
      throw describeCameraError(error);
    }
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('aria-label', '카메라 미리 보기');
    video.srcObject = stream;
    try {
      await video.play();
    } catch (error) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
      throw describeCameraError(error);
    }
    await waitForVideoSize(video);
    const [track] = stream.getVideoTracks();
    const settings = track?.getSettings() ?? {};
    let actualWidth = video.videoWidth || settings.width || width;
    let actualHeight = video.videoHeight || settings.height || height;
    const fps = typeof settings.frameRate === 'number' ? Math.round(settings.frameRate) : 0;

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
        for (const item of stream.getTracks()) {
          item.stop();
        }
        video.srcObject = null;
        video.remove();
      },
    };
    return opened;
  }
}

function waitForVideoSize(video: HTMLVideoElement, timeoutMs = 4000): Promise<void> {
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
