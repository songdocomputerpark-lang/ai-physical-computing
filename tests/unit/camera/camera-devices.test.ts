// 카메라 장치 고르기(src/lab/vision/camera-devices.ts, 판 1.1.0 — PROGRESS 미해결 121) 단위 테스트.
// 지키는 약속: ① 가상 카메라·적외선 카메라 이름 목록은 한 곳이고, 진짜 웹캠 이름(제조사·USB 번호가 붙은 이름 포함)은 걸리지 않는다
// ② 처음 고를 때 가상 카메라는 뒤로 미루고, 학생이 고른(기억한) 장치가 목록에 있으면 그것이 먼저다
// ③ 허락 전 목록(이름·id가 빈 한 개)으로는 고르기 칸을 만들지 않는다 ④ 기억하는 저장 이름은 사이트 저장 규칙에 맞는다(기록 지우기가 지운다).
import { describe, expect, it } from 'vitest';
import {
  CAMERA_KIND_LABELS,
  DEPRIORITIZED_CAMERA_PATTERNS,
  VISION_CAMERA_STORAGE_NAME,
  avoidDefaultCamera,
  betterCameraThan,
  cameraName,
  cameraOptionLabel,
  cameraOptions,
  canChooseCameras,
  classifyCameraLabel,
  hasCameraLabels,
  matchedCameraPattern,
  orderCameras,
  pickCamera,
  toCameraDevices,
  type CameraDeviceLike,
} from '../../../src/lab/vision/camera-devices.ts';
import { STORAGE_KEY_PREFIX, isValidStorageName, storageKey } from '../../../src/lib/storage.ts';

/** 흔한 가상 카메라 이름(각 프로그램이 Windows에 등록하는 이름 — 운영자 PC의 EShare 포함) */
const VIRTUAL_NAMES = [
  'EShare Virtual Camera',
  'EShare Camera',
  'E-Share Cam',
  'OBS Virtual Camera',
  'OBS-Camera',
  'Streamlabs OBS Virtual Webcam',
  'ManyCam Virtual Webcam',
  'Snap Camera',
  'XSplit VCam',
  'e2eSoft VCam',
  'NDI Webcam Video 1',
  'vMix Video',
  'Wirecast Virtual Camera',
  'SplitCam Video Driver',
  'CyberLink YouCam 10',
  'Logi Capture',
  'DroidCam Source 3',
  'iVCam',
  'EpocCam Camera',
  'Reincubate Camo',
  'screen-capture-recorder',
  'Unity Video Capture (Virtual)',
  '가상 카메라',
];

/** 진짜 웹캠 이름(노트북 내장·USB 웹캠·휴대폰 — 걸리면 안 된다) */
const REAL_NAMES = [
  'Integrated Camera (04f2:b6dd)',
  'HD Webcam (0bda:58c2)',
  'USB2.0 HD UVC WebCam',
  'Logitech HD Webcam C270 (046d:0825)',
  'Logitech BRIO',
  'Microsoft® LifeCam HD-3000',
  'FaceTime HD Camera',
  'Surface Camera Front',
  'camera2 1, facing front',
  'Integrated Webcam',
  'HP HD Camera',
  'Lenovo EasyCamera',
  'ASUS USB2.0 WebCam',
  'OBSBOT Tiny 4K',
  'Fileshare Cam',
  '통합 카메라',
];

function device(label: string, deviceId: string, kind = 'videoinput'): CameraDeviceLike {
  return { kind, label, deviceId, groupId: `g-${deviceId}` };
}

describe('카메라 이름으로 종류 가르기(classifyCameraLabel)', () => {
  it.each(VIRTUAL_NAMES)('가상 카메라: %s', (label) => {
    expect(classifyCameraLabel(label)).toBe('virtual');
  });

  it.each(['Integrated IR Camera', 'IR Camera', 'HP IR Camera (04f2:b67c)', 'Windows Hello Infrared', '적외선 카메라'])('적외선 카메라: %s', (label) => {
    expect(classifyCameraLabel(label)).toBe('infrared');
  });

  it.each(REAL_NAMES)('보통 카메라(걸리지 않음): %s', (label) => {
    expect(classifyCameraLabel(label)).toBe('normal');
  });

  it('이름을 모르면(허락 전 빈 이름) 보통 카메라로 본다', () => {
    expect(classifyCameraLabel('')).toBe('normal');
    expect(classifyCameraLabel('   ')).toBe('normal');
    expect(classifyCameraLabel(undefined)).toBe('normal');
    expect(matchedCameraPattern('')).toBeNull();
  });

  it('목록은 한 곳이고 이름마다 종류·사람이 읽는 이름이 있다(과제의 낱말 Virtual·EShare·OBS·ManyCam·Snap Camera·XSplit·NDI 포함)', () => {
    const names = DEPRIORITIZED_CAMERA_PATTERNS.map((item) => item.name);
    for (const required of ['Virtual(가상)', 'EShare', 'OBS', 'ManyCam', 'Snap Camera', 'XSplit', 'NDI']) {
      expect(names).toContain(required);
    }
    for (const item of DEPRIORITIZED_CAMERA_PATTERNS) {
      expect(['virtual', 'infrared']).toContain(item.kind);
      expect(item.pattern.flags).toContain('i');
    }
    expect(Object.isFrozen(DEPRIORITIZED_CAMERA_PATTERNS)).toBe(true);
    expect(matchedCameraPattern('OBS Virtual Camera')?.kind).toBe('virtual');
  });

  it('걸린 낱말은 종류를 가른 것과 같은 종류 안에서 프로그램 이름을 먼저 — 점검 [결과 복사] 글에 적는 낱말(DECISIONS C58)', () => {
    expect(matchedCameraPattern('EShare Virtual Camera')?.name).toBe('EShare');
    expect(matchedCameraPattern('OBS Virtual Camera')?.name).toBe('OBS');
    expect(matchedCameraPattern('Virtual Camera')?.name).toBe('Virtual(가상)');
    expect(matchedCameraPattern('Integrated IR Camera')?.name).toBe('IR(적외선)');
    // 종류는 classifyCameraLabel과 같다(처음 걸린 것) — 가상·적외선 낱말이 함께 있어도 낱말이 종류와 어긋나지 않는다
    expect(classifyCameraLabel('Virtual IR Camera')).toBe('virtual');
    expect(matchedCameraPattern('Virtual IR Camera')?.kind).toBe('virtual');
    expect(matchedCameraPattern('HD Webcam')).toBeNull();
  });
});

describe('장치 목록 다듬기', () => {
  it('카메라(videoinput)만 브라우저 차례대로 고르고 번호를 매긴다', () => {
    const cameras = toCameraDevices([
      device('Microphone', 'mic-1', 'audioinput'),
      device('EShare Virtual Camera', 'cam-virtual'),
      device('Speakers', 'out-1', 'audiooutput'),
      device('HD Webcam', 'cam-real'),
    ]);
    expect(cameras.map((camera) => [camera.deviceId, camera.kind, camera.index])).toEqual([
      ['cam-virtual', 'virtual', 0],
      ['cam-real', 'normal', 1],
    ]);
    expect(toCameraDevices(null)).toEqual([]);
    expect(toCameraDevices([{ kind: 'videoinput' }])).toEqual([{ deviceId: '', label: '', kind: 'normal', index: 0 }]);
  });

  it('허락 전(이름·id가 빈) 목록은 이름을 모르고 고를 수 없다 — 고르기 칸을 숨긴다', () => {
    const beforePermission = toCameraDevices([{ kind: 'videoinput', deviceId: '', label: '' }]);
    expect(hasCameraLabels(beforePermission)).toBe(false);
    expect(canChooseCameras(beforePermission)).toBe(false);
    // 옛 브라우저처럼 여러 개가 오지만 id가 비면 여전히 고를 수 없다.
    expect(canChooseCameras(toCameraDevices([device('', ''), device('', '')]))).toBe(false);
    // id는 있고 이름이 없으면(허락 전 일부 브라우저) 고를 수 있고 이름은 "카메라 1·2"
    const unnamed = toCameraDevices([device('', 'a'), device('', 'b')]);
    expect(canChooseCameras(unnamed)).toBe(true);
    expect(unnamed.map(cameraName)).toEqual(['카메라 1', '카메라 2']);
    // 한 대뿐이면 칸이 필요 없다.
    expect(canChooseCameras(toCameraDevices([device('HD Webcam', 'a')]))).toBe(false);
    // id가 겹치면 고를 수 없다.
    expect(canChooseCameras(toCameraDevices([device('A', 'x'), device('B', 'x')]))).toBe(false);
  });
});

describe('고르는 차례', () => {
  const cameras = toCameraDevices([
    device('EShare Virtual Camera', 'virtual-1'),
    device('Integrated IR Camera', 'ir-1'),
    device('HD Webcam', 'real-1'),
    device('USB2.0 HD UVC WebCam', 'real-2'),
    device('OBS Virtual Camera', 'virtual-2'),
  ]);

  it('보통 카메라 먼저, 적외선, 가상 카메라는 뒤로(같은 종류 안에서는 브라우저 차례)', () => {
    expect(orderCameras(cameras).map((camera) => camera.deviceId)).toEqual(['real-1', 'real-2', 'ir-1', 'virtual-1', 'virtual-2']);
    expect(cameraOptions(cameras).map((option) => option.label)).toEqual([
      'HD Webcam',
      'USB2.0 HD UVC WebCam',
      `${CAMERA_KIND_LABELS.infrared}: Integrated IR Camera`,
      `${CAMERA_KIND_LABELS.virtual}: EShare Virtual Camera`,
      `${CAMERA_KIND_LABELS.virtual}: OBS Virtual Camera`,
    ]);
  });

  it('처음 열 때: 기억한 장치가 목록에 있으면 그것(가상 카메라여도 — 학생이 고른 것), 없으면 첫 보통 카메라', () => {
    expect(pickCamera(cameras)?.deviceId).toBe('real-1');
    expect(pickCamera(cameras, 'virtual-2')?.deviceId).toBe('virtual-2');
    expect(pickCamera(cameras, 'unplugged')?.deviceId).toBe('real-1');
    expect(pickCamera([], 'x')).toBeNull();
    // 가상 카메라뿐이면 그것이라도 연다.
    expect(pickCamera(toCameraDevices([device('OBS Virtual Camera', 'v')]))?.deviceId).toBe('v');
  });

  it('기본으로 열린 장치가 가상 카메라면 더 나은 보통 카메라를 알려 주고, 보통 카메라면 그대로 둔다', () => {
    expect(betterCameraThan(cameras, 'virtual-1')?.deviceId).toBe('real-1');
    expect(betterCameraThan(cameras, 'ir-1')?.deviceId).toBe('real-1');
    expect(betterCameraThan(cameras, 'real-2')).toBeNull();
    expect(betterCameraThan(cameras, '')).toBeNull();
    expect(betterCameraThan(cameras, 'not-in-list')).toBeNull();
    // 가상 카메라 둘뿐이면 바꿀 곳이 없다.
    expect(betterCameraThan(toCameraDevices([device('OBS Virtual Camera', 'a'), device('ManyCam Virtual Webcam', 'b')]), 'a')).toBeNull();
  });

  it('이미 허락해 이름을 알면 시스템 기본(첫 항목)이 가상 카메라일 때 여는 대신 진짜 카메라를 고른다 — 이름을 모르면 브라우저에 맡긴다', () => {
    expect(avoidDefaultCamera(cameras)?.deviceId).toBe('real-1');
    expect(avoidDefaultCamera(toCameraDevices([device('HD Webcam', 'r'), device('OBS Virtual Camera', 'v')]))).toBeNull();
    expect(avoidDefaultCamera(toCameraDevices([device('', ''), device('', '')]))).toBeNull();
    expect(avoidDefaultCamera([])).toBeNull();
  });
});

describe('기억하는 저장 이름', () => {
  it('사이트 저장 이름 규칙에 맞아 머리말이 붙고 [기록 지우기](clearOurs)가 함께 지운다', () => {
    expect(isValidStorageName(VISION_CAMERA_STORAGE_NAME)).toBe(true);
    expect(storageKey(VISION_CAMERA_STORAGE_NAME)).toBe(`${STORAGE_KEY_PREFIX}vision:camera`);
  });

  it('선택지 글은 이름과 종류 표시만 쓰고, 종류는 앞에 둔다(좁은 칸에서 닫힌 고르기 칸이 뒤를 잘라도 보이게 — 보통 카메라는 표시 없음)', () => {
    const [real, virtual] = toCameraDevices([device('HD Webcam', 'r'), device('OBS Virtual Camera', 'v')]);
    expect(cameraOptionLabel(real!)).toBe('HD Webcam');
    expect(cameraOptionLabel(virtual!)).toBe('가상 카메라: OBS Virtual Camera');
  });
});
