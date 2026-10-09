/**
 * 영상 처리 실습실의 카메라 안내 글(판 1.1.0, PROGRESS 미해결 121) — 글만 만드는 순수 함수라 Node 단위 테스트
 * (tests/unit/camera/camera-notice.test.ts)가 문장을 그대로 검사한다. 화면에 붙이는 것은 vision-lab.ts.
 *
 * 1. 카메라를 켠 뒤의 한 줄(cameraOpenedMessage): 어떤 카메라를 켰는지, 가상 카메라를 건너뛰었는지, 고른 카메라를 못 열어 다른 것을 켰는지.
 * 2. 까만 영상 안내(cameraNotice): 원인을 하나로 단정하지 않는다 — 가상 카메라·다른 카메라·렌즈 가리개/손/어두운 방·장치 관리자 방법을
 *    **가능성이 큰 차례로** 보인다. 차례는 지금 켠 카메라의 종류(이름)와 영상의 모양(잡티 없는 "디지털 검정"인지)으로 정한다.
 *    - 가상·적외선 카메라를 켰으면: 그 카메라 이야기 → 가리개 → 장치 관리자
 *    - 보통 카메라인데 잡티 하나 없는 검정이면(센서는 어두워도 잡티가 있다): 다른 카메라 → 장치 관리자 → 가리개
 *    - 그 밖(어둡고 잡티가 있는 영상): 가리개·어두운 방 → 다른 카메라 → 장치 관리자
 *    카메라 없이도 실습은 끝까지 된다는 것([샘플로 계속])은 늘 마지막 줄에 둔다(원칙 3).
 * 장치 이름은 화면에만 보이고 어디에도 저장하거나 보내지 않는다. 한국어 조사가 이름(영어가 많다)에 맞지 않을 수 있어 이름 뒤에는 조사를
 * 붙이지 않는다("켠 카메라: HD Webcam", "가상 카메라(OBS Virtual Camera)는").
 * 1.1.0 검토 반영(2026-09-29): 장치 관리자 방법은 목록에 가상 카메라가 있거나 카메라가 두 대 이상일 때만 적는다(카메라 한 대뿐인
 * 노트북을 장치 관리자로 보내지 않게), 가상 카메라만 보이는 컴퓨터는 "진짜 웹캠이 없거나 꺼져 있을 수 있어요"를 먼저 적는다,
 * 장치 관리자 문장에 관리자 권한·다시 켜기를, 가리개 문장에 노트북 카메라 끄기 키(Fn)를 더했다. 카메라 허용을 되돌리는 문장은
 * CAMERA_PERMISSION_STEP 한 곳(실습실·점검 페이지·도움말이 같은 글을 쓴다).
 */
import { cameraName, type CameraDevice, type CameraKind } from './camera-devices.ts';

/**
 * 카메라 허용을 되돌리는 방법 — 실습실(camera-stream.ts describeCameraError)·점검 페이지(camera-check-report.ts)·도움말(/help/)이
 * 같은 글을 쓴다(1.1.0 검토 반영: 셋이 서로 다른 메뉴 이름을 적었다). Chrome·Edge 모두 주소창 왼쪽 아이콘으로 된다.
 * 뒤에 "해요."·"한 뒤 …"·"하거나 …"를 붙여 쓴다.
 */
export const CAMERA_PERMISSION_STEP = '주소창 왼쪽의 사이트 정보 아이콘(자물쇠나 조절 막대 모양)에서 카메라를 "허용"으로 바꾸고 새로고침';

/**
 * 휴대폰·태블릿용 카메라 허용 되돌리기(R2-002). 휴대폰 브라우저에는 "주소창 왼쪽 사이트 정보 아이콘"이 없는 것이 많다(주소창 위치·메뉴가 브라우저마다 다르다).
 * 그래서 아이콘 위치를 말하지 않고 브라우저의 사이트 설정에서 바꾸라고 한다. 뒤에 "해요."·"하거나 …"를 붙여 쓰는 것은 같다.
 */
export const CAMERA_PERMISSION_STEP_PHONE = '브라우저 주소창 근처나 메뉴의 "사이트 설정"에서 카메라를 "허용"으로 바꾸고 새로고침';

/** 이 기기가 휴대폰·태블릿인지(사용자 에이전트 글자로 — 카메라 허용 안내 글을 고르는 데만 쓴다. 모르면 컴퓨터로 본다) */
export function isPhoneLikeDevice(userAgent: string | undefined = typeof navigator === 'undefined' ? undefined : navigator.userAgent): boolean {
  return typeof userAgent === 'string' && /Android|iPhone|iPad|iPod|Mobile/u.test(userAgent);
}

/** 이 기기에 맞는 카메라 허용 되돌리기 글 */
export function cameraPermissionStep(userAgent?: string): string {
  return isPhoneLikeDevice(userAgent) ? CAMERA_PERMISSION_STEP_PHONE : CAMERA_PERMISSION_STEP;
}

/** 카메라를 켠 뒤 입력 칸 안내 한 줄 */
export function cameraOpenedMessage(info: {
  readonly current: CameraDevice | null;
  readonly avoided: CameraDevice | null;
  readonly fallbackReason: string | null;
  readonly count: number;
}): string {
  const name = info.current && info.current.label.trim() !== '' ? cameraName(info.current) : null;
  if (info.fallbackReason) {
    return name ? `${info.fallbackReason} 대신 켠 카메라: ${name}.` : `${info.fallbackReason} 다른 카메라를 켰어요.`;
  }
  if (info.avoided) {
    const skipped = info.avoided.label.trim() !== '' ? `(${cameraName(info.avoided)})` : '';
    return `카메라를 켰어요${name ? `: ${name}` : ''}. 가상 카메라${skipped}는 건너뛰었어요 — 가상 카메라를 쓰려면 [카메라] 칸에서 골라요(이 브라우저가 기억해요).`;
  }
  if (name && info.count >= 2) {
    return `카메라를 켰어요: ${name}.`;
  }
  return '카메라를 켰어요.';
}

/** 안내 한 줄의 종류(테스트·화면의 data-cause) */
export type CameraNoticeCauseId = 'current-virtual' | 'current-infrared' | 'other-camera' | 'cover' | 'busy' | 'device-manager';

export interface CameraNoticeCause {
  readonly id: CameraNoticeCauseId;
  readonly text: string;
}

export interface CameraNoticeInput {
  /** 'black' = 까만 장만 들어옴, 'no-frames' = 장이 아예 오지 않음 */
  readonly verdict: 'black' | 'no-frames';
  /** 지금 켠 카메라(모르면 null) */
  readonly current: CameraDevice | null;
  /** 이 컴퓨터의 카메라 목록(허락 뒤 — 이름이 있다) */
  readonly cameras: readonly CameraDevice[];
  /** 까만 장이 잡티 하나 없는 "디지털 검정"인지(black-frame.ts summary.flat) */
  readonly flat: boolean;
}

export interface CameraNoticeContent {
  readonly title: string;
  readonly lead: string;
  readonly causes: readonly CameraNoticeCause[];
  /** 바꿀 카메라가 하나뿐이면 그 카메라([다른 카메라로 바꾸기]가 바로 바꾼다) */
  readonly switchTo: CameraDevice | null;
  /** 바꿀 카메라가 둘 이상이면 true([다른 카메라 고르기]가 [카메라] 칸으로 옮겨 준다) */
  readonly chooseAmong: boolean;
  /** 마지막 줄(카메라 없이 이어 하기) */
  readonly sampleHint: string;
  /** 화면 낭독기가 한 번 읽을 문장(입력 칸의 상태 줄) */
  readonly announce: string;
  /** 콘솔에 한 줄 */
  readonly consoleLine: string;
}

/**
 * 지금 켠 카메라 말고 고를 수 있는 카메라(보통 카메라 먼저). 켠 카메라를 모르면(브라우저가 장치 id를 알려 주지 않음) 한 대뿐인 목록에는
 * 바꿀 곳이 없다고 보고, 두 대 이상이면 모두 후보로 둔다([다른 카메라 고르기]가 [카메라] 칸으로 옮겨 준다).
 */
export function otherCameras(cameras: readonly CameraDevice[], current: CameraDevice | null): CameraDevice[] {
  const rank: Readonly<Record<CameraKind, number>> = { normal: 0, infrared: 1, virtual: 2 };
  if (current === null && cameras.length < 2) {
    return [];
  }
  return cameras
    .filter((camera) => camera.deviceId !== '' && camera.deviceId !== current?.deviceId)
    .sort((a, b) => rank[a.kind] - rank[b.kind] || a.index - b.index);
}

const DEVICE_MANAGER_TEXT =
  '교실 화면 공유 프로그램(EShare 등)의 가상 카메라가 진짜 카메라를 가릴 수 있어요. 선생님께 부탁해 장치 관리자 → 카메라 → 가상 카메라에서 마우스 오른쪽 버튼 → 디바이스 사용 안 함을 고르고(관리자 권한이 필요할 수 있어요), 브라우저를 모두 닫았다가 다시 열어요. 화면 공유를 쓸 때는 다시 켜요.';

const COVER_TEXT =
  '렌즈 가리개(뚜껑)나 손·스티커가 렌즈를 가리지 않았는지, 노트북의 카메라 끄기 키(Fn + 카메라 그림)가 눌려 있지 않은지, 방이 아주 어둡지 않은지 봐요. 가린 것을 치우면 이 안내는 저절로 사라져요.';

/** 가상 카메라만 보이는 컴퓨터(웹캠이 없는 교실 데스크톱 + 화면 공유 프로그램) — 장치 관리자로 가상 카메라를 끄면 카메라가 아예 없어진다 */
const NO_REAL_CAMERA_TEXT =
  '이 컴퓨터에는 진짜 카메라가 보이지 않아요. 웹캠이 없거나 꺼져 있을 수 있어요 — 데스크톱이면 USB 웹캠을 꽂고 새로고침해요. 웹캠이 없으면 [샘플로 계속]을 눌러요.';

const BUSY_TEXT = '화상 수업 프로그램처럼 카메라를 쓰는 다른 프로그램이 켜져 있으면 닫고 다시 [입력 켜기]를 눌러요.';

/** 까만 영상 안내 글 */
export function cameraNotice(input: CameraNoticeInput): CameraNoticeContent {
  const { current, cameras } = input;
  const others = otherCameras(cameras, current);
  const switchTo = others.length === 1 ? (others[0] ?? null) : null;
  const chooseAmong = others.length >= 2;
  const actionWord = switchTo ? '[다른 카메라로 바꾸기]' : chooseAmong ? '[다른 카메라 고르기]' : null;
  const currentName = current && current.label.trim() !== '' ? cameraName(current) : null;

  const causes: CameraNoticeCause[] = [];
  const otherCause = (): CameraNoticeCause | null =>
    actionWord ? { id: 'other-camera', text: `이 컴퓨터에는 카메라가 ${cameras.length}대 있어요. ${actionWord}로 다른 카메라를 켜 봐요.` } : null;
  // 장치 관리자 방법(가상 카메라 끄기)은 목록에 가상 카메라가 있거나, 이름으로 못 가른 카메라가 둘 이상일 때만 도움이 된다 —
  // 카메라가 한 대뿐인 노트북(렌즈를 가림)이나 적외선 카메라만 문제인 컴퓨터를 장치 관리자로 보내지 않는다(1.1.0 검토 반영).
  const hasVirtual = cameras.some((camera) => camera.kind === 'virtual');
  const deviceManager = (): void => {
    if (hasVirtual || (cameras.length >= 2 && current?.kind !== 'infrared')) {
      causes.push({ id: 'device-manager', text: DEVICE_MANAGER_TEXT });
    }
  };

  if (current?.kind === 'virtual') {
    causes.push({
      id: 'current-virtual',
      text:
        `지금 켠 카메라${currentName ? `(${currentName})` : ''}는 가상 카메라예요. 화면 공유·방송 프로그램이 만든 카메라라서 그 프로그램이 쉬면 까만 화면만 보내요. ` +
        (actionWord ? `${actionWord}로 진짜 카메라를 골라요.` : NO_REAL_CAMERA_TEXT),
    });
    causes.push({ id: 'cover', text: COVER_TEXT });
    // 다른 카메라가 없으면(가상 카메라만) 장치 관리자로 끄면 카메라가 아예 없어진다 — 적지 않는다.
    if (actionWord) {
      deviceManager();
    }
  } else if (current?.kind === 'infrared') {
    causes.push({
      id: 'current-infrared',
      text:
        `지금 켠 카메라${currentName ? `(${currentName})` : ''}는 얼굴 인식 로그인용 적외선 카메라라서 화면이 어두워요. ` +
        (actionWord ? `${actionWord}로 보통 카메라를 골라요.` : '보통 카메라가 있으면 [카메라] 칸에서 골라요.'),
    });
    causes.push({ id: 'cover', text: COVER_TEXT });
    deviceManager();
  } else if (input.flat || input.verdict === 'no-frames') {
    // 잡티 하나 없는 검정(또는 장이 오지 않음)은 렌즈를 가린 진짜 카메라보다 프로그램이 만든 카메라에서 흔하다.
    const other = otherCause();
    if (other) causes.push(other);
    deviceManager();
    if (input.verdict === 'no-frames') causes.push({ id: 'busy', text: BUSY_TEXT });
    causes.push({ id: 'cover', text: COVER_TEXT });
  } else {
    causes.push({ id: 'cover', text: COVER_TEXT });
    const other = otherCause();
    if (other) causes.push(other);
    deviceManager();
  }

  const title = input.verdict === 'no-frames' ? '카메라는 켜졌는데 영상이 들어오지 않아요' : '카메라는 켜졌는데 화면이 까매요';
  const lead =
    input.verdict === 'no-frames'
      ? '카메라를 켠 지 4초가 지나도 영상이 한 장도 오지 않아요. 아래를 차례로 확인해 봐요.'
      : '2초 넘게 거의 까만 화면만 들어와요. 아래를 차례로 확인해 봐요.';
  return Object.freeze({
    title,
    lead,
    causes: Object.freeze(causes),
    switchTo,
    chooseAmong,
    sampleHint: '카메라 없이 이어 하려면 [샘플로 계속]을 눌러요 — 실습실이 그린 도형으로 똑같이 실습해요.',
    announce: `${title}. 미리 보기 아래 안내를 봐요.`,
    consoleLine: `[안내] ${title}. 미리 보기 아래 안내를 봐요(다른 카메라 고르기·렌즈 가리개·가상 카메라).`,
  });
}
