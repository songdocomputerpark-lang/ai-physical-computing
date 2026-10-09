// 카메라 안내 글(src/lab/vision/camera-notice.ts, 판 1.1.0 — PROGRESS 미해결 121) 단위 테스트.
// 지키는 약속: ① 까만 영상 안내는 원인을 하나로 단정하지 않는다 — 렌즈 가리개·어두운 방과 가상 카메라·장치 관리자 방법을 함께 적되
// 켠 카메라의 종류와 영상 모양으로 차례를 정한다 ② 바꿀 카메라가 하나면 [다른 카메라로 바꾸기], 여럿이면 [다른 카메라 고르기], 없으면 단추 없음
// ③ 카메라 없이 이어 가는 길([샘플로 계속])을 늘 적는다 ④ 학생이 보는 문장은 해요체이고 장치 이름 뒤에 조사를 붙이지 않는다
// ⑤ (1.1.0 검토 반영) 장치 관리자 방법은 가상 카메라가 목록에 있거나 카메라가 두 대 이상일 때만, 가상 카메라만 보이면 "진짜 카메라가
//    보이지 않아요"를 먼저, 장치 관리자 문장엔 관리자 권한·다시 켜기, 가리개 문장엔 노트북 카메라 끄기 키(Fn).
import { describe, expect, it } from 'vitest';
import { toCameraDevices } from '../../../src/lab/vision/camera-devices.ts';
import { CAMERA_PERMISSION_STEP, CAMERA_PERMISSION_STEP_PHONE, cameraNotice, cameraPermissionStep, cameraOpenedMessage, otherCameras } from '../../../src/lab/vision/camera-notice.ts';

const [virtualCam, realCam, secondReal, irCam] = toCameraDevices([
  { kind: 'videoinput', deviceId: 'v', label: 'EShare Virtual Camera' },
  { kind: 'videoinput', deviceId: 'r', label: 'HD Webcam' },
  { kind: 'videoinput', deviceId: 'r2', label: 'USB2.0 HD UVC WebCam' },
  { kind: 'videoinput', deviceId: 'ir', label: 'Integrated IR Camera' },
]);

function ids(causes: readonly { id: string }[]): string[] {
  return causes.map((cause) => cause.id);
}

describe('까만 영상 안내(cameraNotice)', () => {
  it('가상 카메라를 켰으면: 그 카메라 이야기 → 가리개 → 장치 관리자, 진짜 카메라 하나로 바로 바꾸는 단추', () => {
    const notice = cameraNotice({ verdict: 'black', current: virtualCam!, cameras: [virtualCam!, realCam!], flat: true });
    expect(notice.title).toBe('카메라는 켜졌는데 화면이 까매요');
    expect(ids(notice.causes)).toEqual(['current-virtual', 'cover', 'device-manager']);
    expect(notice.causes[0]!.text).toContain('지금 켠 카메라(EShare Virtual Camera)는 가상 카메라예요');
    expect(notice.causes[0]!.text).toContain('[다른 카메라로 바꾸기]로 진짜 카메라를 골라요');
    expect(notice.switchTo?.deviceId).toBe('r');
    expect(notice.chooseAmong).toBe(false);
  });

  it('보통 카메라인데 잡티 없는 검정(flat)이면: 다른 카메라 → 장치 관리자 → 가리개(가상 카메라가 가렸을 가능성이 크다)', () => {
    const notice = cameraNotice({ verdict: 'black', current: realCam!, cameras: [realCam!, secondReal!, virtualCam!], flat: true });
    expect(ids(notice.causes)).toEqual(['other-camera', 'device-manager', 'cover']);
    expect(notice.causes[0]!.text).toBe('이 컴퓨터에는 카메라가 3대 있어요. [다른 카메라 고르기]로 다른 카메라를 켜 봐요.');
    expect(notice.switchTo).toBeNull();
    expect(notice.chooseAmong).toBe(true);
  });

  it('잡티가 있는 어둠이면 가리개·어두운 방이 먼저이고, 카메라가 한 대뿐이면 바꾸기 단추·장치 관리자 방법이 없다', () => {
    const notice = cameraNotice({ verdict: 'black', current: realCam!, cameras: [realCam!], flat: false });
    // 카메라 한 대(가상 카메라 없음)인 노트북을 장치 관리자로 보내지 않는다
    expect(ids(notice.causes)).toEqual(['cover']);
    expect(notice.causes[0]!.text).toContain('렌즈 가리개(뚜껑)');
    expect(notice.causes[0]!.text).toContain('카메라 끄기 키(Fn + 카메라 그림)');
    expect(notice.causes[0]!.text).toContain('방이 아주 어둡지 않은지');
    expect(notice.causes[0]!.text).toContain('저절로 사라져요');
    expect(notice.switchTo).toBeNull();
    expect(notice.chooseAmong).toBe(false);
  });

  it('장이 오지 않으면(no-frames) 제목이 다르고, 카메라를 쓰는 다른 프로그램도 적는다', () => {
    const notice = cameraNotice({ verdict: 'no-frames', current: null, cameras: [realCam!], flat: false });
    expect(notice.title).toBe('카메라는 켜졌는데 영상이 들어오지 않아요');
    expect(notice.lead).toContain('4초');
    expect(ids(notice.causes)).toEqual(['busy', 'cover']);
    // 카메라가 두 대 이상이면 가상 카메라가 가렸을 수 있다 — 장치 관리자 방법도
    expect(ids(cameraNotice({ verdict: 'no-frames', current: null, cameras: [realCam!, secondReal!], flat: false }).causes)).toContain('device-manager');
  });

  it('적외선 카메라를 켰으면 보통 카메라로 바꾸라고 먼저 말한다', () => {
    const notice = cameraNotice({ verdict: 'black', current: irCam!, cameras: [irCam!, realCam!], flat: false });
    expect(ids(notice.causes)[0]).toBe('current-infrared');
    expect(notice.causes[0]!.text).toContain('적외선 카메라라서 화면이 어두워요');
    expect(notice.switchTo?.deviceId).toBe('r');
  });

  it('장치 관리자 방법은 운영자가 확인한 순서 그대로(장치 관리자 → 카메라 → 가상 카메라 → 디바이스 사용 안 함 → 브라우저 다시 열기) + 권한·다시 켜기', () => {
    const notice = cameraNotice({ verdict: 'black', current: realCam!, cameras: [realCam!, virtualCam!], flat: true });
    const text = notice.causes.find((cause) => cause.id === 'device-manager')!.text;
    expect(text).toMatch(/장치 관리자 → 카메라 → 가상 카메라.*디바이스 사용 안 함.*브라우저를 모두 닫았다가 다시 열어요/u);
    expect(text).toContain('관리자 권한이 필요할 수 있어요');
    expect(text).toContain('화면 공유를 쓸 때는 다시 켜요');
  });

  it('가상 카메라만 보이는 컴퓨터(웹캠 없는 교실 데스크톱 + 화면 공유 프로그램): 진짜 카메라가 없다는 말이 먼저, 장치 관리자 방법은 없다', () => {
    const notice = cameraNotice({ verdict: 'black', current: virtualCam!, cameras: [virtualCam!], flat: true });
    expect(ids(notice.causes)).toEqual(['current-virtual', 'cover']);
    expect(notice.causes[0]!.text).toContain('진짜 카메라가 보이지 않아요');
    expect(notice.causes[0]!.text).toContain('USB 웹캠을 꽂고 새로고침');
    expect(notice.switchTo).toBeNull();
  });

  it('카메라 허용을 되돌리는 문장은 한 곳(실습실·점검 페이지·도움말이 함께 쓴다)', () => {
    expect(CAMERA_PERMISSION_STEP).toContain('주소창 왼쪽의 사이트 정보 아이콘');
    expect(CAMERA_PERMISSION_STEP).toContain('"허용"으로 바꾸고 새로고침');
  });

  it('휴대폰·태블릿은 주소 표시줄 아이콘 대신 사이트 설정 안내를 쓴다(R2-002)', () => {
    const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';
    const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36';
    const desktop = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36';
    expect(cameraPermissionStep(iphone)).toBe(CAMERA_PERMISSION_STEP_PHONE);
    expect(cameraPermissionStep(android)).toBe(CAMERA_PERMISSION_STEP_PHONE);
    expect(cameraPermissionStep(desktop)).toBe(CAMERA_PERMISSION_STEP);
    expect(CAMERA_PERMISSION_STEP_PHONE).not.toContain('주소창 왼쪽');
    expect(CAMERA_PERMISSION_STEP_PHONE).toContain('"허용"으로 바꾸고 새로고침');
  });

  it('카메라 없이 이어 가는 길·낭독 문장·콘솔 한 줄이 늘 있다(해요체)', () => {
    for (const verdict of ['black', 'no-frames'] as const) {
      const notice = cameraNotice({ verdict, current: realCam!, cameras: [realCam!, virtualCam!], flat: false });
      expect(notice.sampleHint).toContain('[샘플로 계속]');
      expect(notice.announce).toContain(notice.title);
      expect(notice.consoleLine.startsWith('[안내] ')).toBe(true);
      for (const sentence of [notice.lead, notice.sampleHint, ...notice.causes.map((cause) => cause.text)]) {
        expect(sentence.trim().endsWith('요.') || sentence.trim().endsWith('봐요.'), sentence).toBe(true);
      }
    }
  });

  it('바꿀 카메라 후보: 지금 켠 것과 id가 빈 것을 빼고 보통 카메라 먼저', () => {
    expect(otherCameras([virtualCam!, realCam!, irCam!], virtualCam!).map((camera) => camera.deviceId)).toEqual(['r', 'ir']);
    expect(otherCameras([realCam!], realCam!)).toEqual([]);
    expect(otherCameras(toCameraDevices([{ kind: 'videoinput', deviceId: '', label: '' }]), null)).toEqual([]);
    // 켠 카메라를 모르면: 한 대뿐이면 바꿀 곳이 없고, 두 대 이상이면 모두 후보([다른 카메라 고르기])
    expect(otherCameras([realCam!], null)).toEqual([]);
    const unknownCurrent = cameraNotice({ verdict: 'black', current: null, cameras: [virtualCam!, realCam!], flat: true });
    expect(unknownCurrent.switchTo).toBeNull();
    expect(unknownCurrent.chooseAmong).toBe(true);
  });
});

describe('카메라를 켠 뒤 한 줄(cameraOpenedMessage)', () => {
  it('한 대뿐이면 전과 같은 "카메라를 켰어요."', () => {
    expect(cameraOpenedMessage({ current: realCam!, avoided: null, fallbackReason: null, count: 1 })).toBe('카메라를 켰어요.');
    expect(cameraOpenedMessage({ current: null, avoided: null, fallbackReason: null, count: 0 })).toBe('카메라를 켰어요.');
  });

  it('여러 대면 켠 카메라 이름을 적고, 가상 카메라를 건너뛰었으면 그 이름과 바꾸는 곳을 알린다', () => {
    expect(cameraOpenedMessage({ current: realCam!, avoided: null, fallbackReason: null, count: 2 })).toBe('카메라를 켰어요: HD Webcam.');
    expect(cameraOpenedMessage({ current: realCam!, avoided: virtualCam!, fallbackReason: null, count: 2 })).toBe(
      '카메라를 켰어요: HD Webcam. 가상 카메라(EShare Virtual Camera)는 건너뛰었어요 — 가상 카메라를 쓰려면 [카메라] 칸에서 골라요(이 브라우저가 기억해요).',
    );
  });

  it('고른 카메라를 못 열어 다른 카메라를 켰으면 까닭과 대신 켠 카메라를 적는다', () => {
    expect(
      cameraOpenedMessage({ current: realCam!, avoided: null, fallbackReason: '고른 카메라를 찾지 못했어요(선이 빠졌을 수 있어요).', count: 2 }),
    ).toBe('고른 카메라를 찾지 못했어요(선이 빠졌을 수 있어요). 대신 켠 카메라: HD Webcam.');
    expect(cameraOpenedMessage({ current: null, avoided: null, fallbackReason: '전에 고른 카메라가 보이지 않아요.', count: 1 })).toBe(
      '전에 고른 카메라가 보이지 않아요. 다른 카메라를 켰어요.',
    );
  });
});
