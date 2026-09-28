/**
 * 카메라 장치 고르기의 순수 논리(판 1.1.0, PROGRESS 미해결 121) — 화면 요소·브라우저 없이 계산만 한다.
 * 영상처리 실습실(vision-lab.ts·sources.ts)과 점검 페이지의 카메라 확인(src/components/start/camera-check/)이 함께 쓰고,
 * Node 단위 테스트(tests/unit/camera/camera-devices.test.ts)가 그대로 읽는다.
 *
 * 왜 필요한가
 * - 교실 컴퓨터에 화면 공유·방송 프로그램(EShare 등)이 깔리면 그 프로그램의 **가상 카메라**(진짜 렌즈가 없는, 프로그램이 만든 카메라)가
 *   장치 목록 맨 앞에 서서, Chrome·Edge가 진짜 웹캠 대신 그 장치를 연다 → 실습실이 까만 화면만 받는다
 *   (2026-09-17 운영자 컴퓨터에서 겪고, 장치 관리자에서 가상 카메라를 꺼서 해결).
 * - 그래서 ① 이름에 가상 카메라 낱말이 든 장치(와 얼굴 인식 로그인용 적외선 카메라)는 **처음 고를 때 뒤로 미루고** 진짜 카메라를 먼저 고르며
 *   ② 학생이 [카메라] 칸에서 직접 고른 장치는 **이 브라우저에만** 기억한다(저장 이름 VISION_CAMERA_STORAGE_NAME — 값은 deviceId만).
 *
 * 브라우저가 알려 주는 것(W3C Media Capture and Streams "device information exposure", MDN MediaDevices.enumerateDevices — 2026-09-28 확인)
 * - 장치 이름(label)은 이 사이트가 카메라 허락을 받은 뒤에만 채워진다. 허락 전에는 이름이 비고, 명세는 종류마다 **첫 항목 하나만** 주게 한다
 *   (Chrome도 허락 전에는 카메라 한 개·빈 deviceId). 허락 전인데 여러 개가 오면(옛 브라우저) 이름 대신 "카메라 1·2"로 보인다.
 * - 명세는 시스템 기본 장치를 목록 **맨 앞**에 두게 한다. 그래서 "기본으로 열리는 장치 ≈ 첫 항목"으로 보고, 연 뒤에는
 *   track.getSettings().deviceId로 실제로 열린 장치를 다시 확인한다.
 * - deviceId는 이 사이트(출처)에서만 쓰는 무작위 글자라 다른 사이트와 이어지지 않는다. 사이트는 장치 **이름은 저장하지 않는다**.
 */

/** 브라우저 장치 목록 한 항목 가운데 이 파일이 보는 것(MediaDeviceInfo의 일부 — 단위 테스트는 가짜 값을 넣는다) */
export interface CameraDeviceLike {
  readonly kind?: string;
  readonly deviceId?: string;
  readonly label?: string;
  readonly groupId?: string;
}

/** 이름으로 가른 카메라 종류: 보통 카메라 · 가상 카메라 · 적외선 카메라 */
export type CameraKind = 'normal' | 'virtual' | 'infrared';

/** 실습실·점검 페이지가 쓰는 카메라 한 대 */
export interface CameraDevice {
  /** 브라우저가 준 장치 id(허락 전에는 빈 글자일 수 있다) */
  readonly deviceId: string;
  /** 브라우저가 준 이름(허락 전에는 빈 글자) */
  readonly label: string;
  readonly kind: CameraKind;
  /** 브라우저 목록에서의 차례(0부터 — 0번이 시스템 기본) */
  readonly index: number;
}

/** 뒤로 미루는 카메라 이름의 낱말 하나 */
export interface CameraNamePattern {
  readonly kind: Exclude<CameraKind, 'normal'>;
  /** 사람이 읽는 이름(문서·테스트용) */
  readonly name: string;
  readonly pattern: RegExp;
}

/**
 * 처음 고를 때 뒤로 미루는 카메라 이름 목록 — **한 곳**(새 프로그램 이름이 보이면 여기에 한 줄 더한다, 단위 테스트가 지킨다).
 * 가상 카메라: 화면 공유·방송·휴대폰 웹캠 프로그램이 만드는 카메라. 프로그램이 꺼져 있으면 까만 화면이나 안내 그림만 보낸다.
 * 적외선 카메라: 노트북의 얼굴 인식 로그인(Windows Hello)용이라 영상이 흑백이고 어둡다.
 * 낱말 경계(\b)를 둔 것은 짧은 낱말(OBS·NDI·IR)이 다른 이름 속 글자와 겹치지 않게 하려는 것이다.
 * 여기 없는 이름의 가상 카메라는 "까만 영상 감지"(black-frame.ts)가 뒤에서 한 번 더 잡는다.
 */
export const DEPRIORITIZED_CAMERA_PATTERNS: readonly CameraNamePattern[] = Object.freeze([
  { kind: 'virtual', name: 'Virtual(가상)', pattern: /virtual/iu },
  { kind: 'virtual', name: '가상', pattern: /가상/iu },
  { kind: 'virtual', name: 'EShare', pattern: /\be-?share/iu },
  { kind: 'virtual', name: 'OBS', pattern: /\bobs\b/iu },
  { kind: 'virtual', name: 'ManyCam', pattern: /manycam/iu },
  { kind: 'virtual', name: 'Snap Camera', pattern: /snap\s*camera/iu },
  { kind: 'virtual', name: 'XSplit', pattern: /xsplit/iu },
  { kind: 'virtual', name: 'NDI', pattern: /\bndi\b/iu },
  { kind: 'virtual', name: 'VCam', pattern: /\bv-?cam\b/iu },
  { kind: 'virtual', name: 'Streamlabs', pattern: /streamlabs/iu },
  { kind: 'virtual', name: 'vMix', pattern: /\bvmix\b/iu },
  { kind: 'virtual', name: 'Wirecast', pattern: /wirecast/iu },
  { kind: 'virtual', name: 'SplitCam', pattern: /splitcam/iu },
  { kind: 'virtual', name: 'YouCam', pattern: /youcam/iu },
  { kind: 'virtual', name: 'Logi Capture', pattern: /logi\s*capture/iu },
  { kind: 'virtual', name: 'DroidCam', pattern: /droidcam/iu },
  { kind: 'virtual', name: 'iVCam', pattern: /\bivcam\b/iu },
  { kind: 'virtual', name: 'EpocCam', pattern: /epoccam/iu },
  { kind: 'virtual', name: 'Camo', pattern: /\bcamo\b/iu },
  { kind: 'virtual', name: 'Screen Capture', pattern: /screen[-\s]?capture/iu },
  { kind: 'infrared', name: 'IR(적외선)', pattern: /\bir\b|infrared|적외선/iu },
] satisfies CameraNamePattern[]);

/** 영상처리 실습실이 학생이 고른 카메라(deviceId)를 이 브라우저에 기억하는 이름(src/lib/storage.ts 규칙 — [기록 지우기]가 함께 지운다) */
export const VISION_CAMERA_STORAGE_NAME = 'vision:camera';

/** 이름으로 카메라 종류를 가른다(이름이 비면 보통 카메라로 본다 — 허락 전에는 알 수 없으므로). */
export function classifyCameraLabel(label: string | null | undefined): CameraKind {
  const text = typeof label === 'string' ? label.trim() : '';
  if (text === '') {
    return 'normal';
  }
  const found = DEPRIORITIZED_CAMERA_PATTERNS.find((item) => item.pattern.test(text));
  return found ? found.kind : 'normal';
}

/** 이름에서 걸린 낱말(없으면 null) — 안내 글·점검 결과에 "무엇 때문에 가상 카메라로 봤는지" 적을 때 쓴다 */
export function matchedCameraPattern(label: string | null | undefined): CameraNamePattern | null {
  const text = typeof label === 'string' ? label.trim() : '';
  if (text === '') {
    return null;
  }
  return DEPRIORITIZED_CAMERA_PATTERNS.find((item) => item.pattern.test(text)) ?? null;
}

/** 뒤로 미루는 카메라(가상·적외선)인지 */
export function isDeprioritized(device: Pick<CameraDevice, 'kind'>): boolean {
  return device.kind !== 'normal';
}

/** 장치 목록에서 카메라(videoinput)만 골라 CameraDevice로 만든다(브라우저 차례 그대로). */
export function toCameraDevices(devices: readonly CameraDeviceLike[] | null | undefined): CameraDevice[] {
  if (!Array.isArray(devices)) {
    return [];
  }
  const cameras: CameraDevice[] = [];
  for (const device of devices) {
    if (!device || device.kind !== 'videoinput') {
      continue;
    }
    const label = typeof device.label === 'string' ? device.label : '';
    const deviceId = typeof device.deviceId === 'string' ? device.deviceId : '';
    cameras.push(Object.freeze({ deviceId, label, kind: classifyCameraLabel(label), index: cameras.length }));
  }
  return cameras;
}

/** 이름을 하나라도 아는지(= 이 사이트가 카메라 허락을 받았는지) */
export function hasCameraLabels(cameras: readonly CameraDevice[]): boolean {
  return cameras.some((camera) => camera.label.trim() !== '');
}

/** 골라서 열 수 있는 목록인지(장치 id가 모두 있고 서로 다르다 — 허락 전 빈 id 목록은 고를 수 없다) */
export function canChooseCameras(cameras: readonly CameraDevice[]): boolean {
  if (cameras.length < 2) {
    return false;
  }
  const ids = new Set(cameras.map((camera) => camera.deviceId));
  return !ids.has('') && ids.size === cameras.length;
}

/** 종류의 앞뒤(작을수록 먼저): 보통 → 적외선 → 가상 */
const KIND_RANK: Readonly<Record<CameraKind, number>> = Object.freeze({ normal: 0, infrared: 1, virtual: 2 });

/** 고르는 차례로 줄 세운다: 보통 카메라 먼저, 적외선, 가상 카메라는 뒤로(같은 종류 안에서는 브라우저 차례 — 기본 장치가 앞). */
export function orderCameras(cameras: readonly CameraDevice[]): CameraDevice[] {
  return [...cameras].sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || a.index - b.index);
}

/** 처음 열 때 고를 카메라: 기억해 둔 장치가 목록에 있으면 그것, 없으면 보통 카메라 가운데 첫째(가상 카메라는 뒤로). */
export function pickCamera(cameras: readonly CameraDevice[], rememberedId?: string | null): CameraDevice | null {
  if (cameras.length === 0) {
    return null;
  }
  if (rememberedId) {
    const remembered = cameras.find((camera) => camera.deviceId === rememberedId);
    if (remembered) {
      return remembered;
    }
  }
  return orderCameras(cameras)[0] ?? null;
}

/**
 * 기본으로 열린 장치(openedId) 대신 열 더 나은 카메라. 열린 장치가 가상·적외선 카메라이고 보통 카메라가 따로 있을 때만 그것을 돌려준다
 * (보통 카메라가 열렸거나, 다른 보통 카메라가 없으면 null — 그대로 쓴다).
 */
export function betterCameraThan(cameras: readonly CameraDevice[], openedId: string | null | undefined): CameraDevice | null {
  if (!openedId) {
    return null;
  }
  const opened = cameras.find((camera) => camera.deviceId === openedId);
  if (!opened || !isDeprioritized(opened)) {
    return null;
  }
  const better = orderCameras(cameras).find((camera) => camera.deviceId !== openedId && camera.deviceId !== '' && KIND_RANK[camera.kind] < KIND_RANK[opened.kind]);
  return better ?? null;
}

/**
 * 고르기 칸에 바로 앞에 열 카메라(허락 전 목록에서도 쓸 수 있게): 시스템 기본(첫 항목)이 가상·적외선 카메라이고 보통 카메라가 따로 있으면
 * 그 보통 카메라. 이름을 모르거나(허락 전) 기본이 보통 카메라면 null — 브라우저 기본값으로 연다.
 */
export function avoidDefaultCamera(cameras: readonly CameraDevice[]): CameraDevice | null {
  const first = cameras[0];
  if (!first || !hasCameraLabels(cameras)) {
    return null;
  }
  return betterCameraThan(cameras, first.deviceId);
}

/** 종류 이름(화면 글) */
export const CAMERA_KIND_LABELS: Readonly<Record<CameraKind, string>> = Object.freeze({
  normal: '',
  virtual: '가상 카메라',
  infrared: '적외선 카메라',
});

/** 카메라 이름(허락 전이면 "카메라 1"처럼 차례로) */
export function cameraName(camera: Pick<CameraDevice, 'label' | 'index'>): string {
  const label = camera.label.trim();
  return label === '' ? `카메라 ${camera.index + 1}` : label;
}

/**
 * 고르기 칸의 선택지 글: 가상·적외선 카메라는 종류를 **앞에** 붙인다("가상 카메라: EShare Virtual Camera"). 좁은 입력 칸에서는 닫힌
 * 고르기 칸이 긴 이름의 뒤를 잘라 보여서, 종류를 뒤에 붙이면 "가상 카메라" 표시가 가려졌다(2026-09-28 화면 확인).
 */
export function cameraOptionLabel(camera: CameraDevice): string {
  const name = cameraName(camera);
  return camera.kind === 'normal' ? name : `${CAMERA_KIND_LABELS[camera.kind]}: ${name}`;
}

/** 고르기 칸에 보일 차례(보통 카메라 먼저, 가상 카메라는 뒤로 — 처음 고르는 차례와 같게) */
export function cameraOptions(cameras: readonly CameraDevice[]): { value: string; label: string; kind: CameraKind }[] {
  return orderCameras(cameras).map((camera) => ({ value: camera.deviceId, label: cameraOptionLabel(camera), kind: camera.kind }));
}
