/**
 * 영상처리 실습실의 카메라 안내 글(판 1.1.0, PROGRESS 미해결 121) — 글만 만드는 순수 함수라 Node 단위 테스트
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
 */
import { cameraName, type CameraDevice, type CameraKind } from './camera-devices.ts';

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
    return `카메라를 켰어요${name ? `: ${name}` : ''}. 가상 카메라${skipped}는 건너뛰었어요 — [카메라] 칸에서 바꿀 수 있어요.`;
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
  '교실 화면 공유 프로그램(EShare 등)의 가상 카메라가 진짜 카메라를 가릴 수 있어요. 선생님께 부탁해 장치 관리자 → 카메라 → 가상 카메라에서 마우스 오른쪽 버튼 → 디바이스 사용 안 함을 고르고, 브라우저를 모두 닫았다가 다시 열어요.';

const COVER_TEXT =
  '렌즈 가리개(뚜껑)나 손·스티커가 렌즈를 가리지 않았는지, 방이 아주 어둡지 않은지 봐요. 가린 것을 치우면 이 안내는 저절로 사라져요.';

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

  if (current?.kind === 'virtual') {
    causes.push({
      id: 'current-virtual',
      text:
        `지금 켠 카메라${currentName ? `(${currentName})` : ''}는 가상 카메라예요. 화면 공유·방송 프로그램이 만든 카메라라서 그 프로그램이 쉬면 까만 화면만 보내요. ` +
        (actionWord ? `${actionWord}로 진짜 카메라를 골라요.` : '진짜 카메라가 목록에 없으면 아래 장치 관리자 방법을 써요.'),
    });
    causes.push({ id: 'cover', text: COVER_TEXT });
    causes.push({ id: 'device-manager', text: DEVICE_MANAGER_TEXT });
  } else if (current?.kind === 'infrared') {
    causes.push({
      id: 'current-infrared',
      text:
        `지금 켠 카메라${currentName ? `(${currentName})` : ''}는 얼굴 인식 로그인용 적외선 카메라라서 화면이 어두워요. ` +
        (actionWord ? `${actionWord}로 보통 카메라를 골라요.` : '보통 카메라가 있으면 [카메라] 칸에서 골라요.'),
    });
    causes.push({ id: 'cover', text: COVER_TEXT });
    causes.push({ id: 'device-manager', text: DEVICE_MANAGER_TEXT });
  } else if (input.flat || input.verdict === 'no-frames') {
    // 잡티 하나 없는 검정(또는 장이 오지 않음)은 렌즈를 가린 진짜 카메라보다 프로그램이 만든 카메라에서 흔하다.
    const other = otherCause();
    if (other) causes.push(other);
    causes.push({ id: 'device-manager', text: DEVICE_MANAGER_TEXT });
    if (input.verdict === 'no-frames') causes.push({ id: 'busy', text: BUSY_TEXT });
    causes.push({ id: 'cover', text: COVER_TEXT });
  } else {
    causes.push({ id: 'cover', text: COVER_TEXT });
    const other = otherCause();
    if (other) causes.push(other);
    causes.push({ id: 'device-manager', text: DEVICE_MANAGER_TEXT });
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
