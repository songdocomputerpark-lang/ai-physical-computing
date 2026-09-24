/**
 * 블루투스 오류를 학생이 읽을 한국어 풀이로 바꾼다(P4-04) — 순수 함수라 단위 테스트가 그대로 확인한다.
 *
 * 어떤 오류가 나는지(공식 문서, 2026-09-18 확인):
 * - `requestDevice()`는 맞는 기기가 없거나 학생이 선택 창을 닫으면 **NotFoundError**, 보안 문제(https가 아니거나
 *   사용자 조작 없이 불렀을 때·권한 정책으로 막혔을 때)면 **SecurityError**, 설정이 잘못되면 TypeError를 던진다
 *   (MDN Bluetooth.requestDevice()).
 * - `gatt.connect()`·`getPrimaryService()`는 연결이 안 되면 NetworkError, 그 서비스가 기기에 없으면 NotFoundError,
 *   `optionalServices`에 적지 않은 서비스를 달라고 하면 SecurityError다(MDN Web Bluetooth API).
 * 같은 이름(NotFoundError)이 **어느 단계에서 났는지**에 따라 뜻이 달라서 단계를 함께 받는다.
 */
import { bleProblem, type BleProblem } from './text.ts';
import { DEFAULT_NAME_PREFIX } from './uuids.ts';

/** 어느 단계에서 난 오류인가 */
export type BleStage = 'choose' | 'connect' | 'service' | 'notify' | 'write';

function errorName(error: unknown): string {
  if (error instanceof Error) {
    return error.name;
  }
  if (typeof error === 'object' && error !== null && 'name' in error) {
    return String((error as { name: unknown }).name);
  }
  return '';
}

/** 오류 문장(기기 이름·주소가 섞여 들어가지 않게 글자 수를 줄인다 — PLAN §10) */
export function errorMessage(error: unknown, limit = 120): string {
  const text = error instanceof Error ? error.message : String(error ?? '');
  const flat = text.replace(/\s+/gu, ' ').trim();
  return flat.length <= limit ? flat : `${flat.slice(0, limit)}…`;
}

export function describeBleError(error: unknown, stage: BleStage): BleProblem {
  const name = errorName(error);
  if (stage === 'choose') {
    if (name === 'NotFoundError') {
      return bleProblem(
        'no-device',
        '보드를 고르지 않았어요.',
        `선택 창에 보드가 안 보이면 ① 보드에 전원이 들어와 있는지 ② 보드에서 블루투스 코드가 돌고 있는지 ③ 이름 앞부분(${DEFAULT_NAME_PREFIX})이 맞는지 확인해요. 그래도 안 보이면 [가까운 기기 모두 보기]를 켜고 다시 눌러요.`,
      );
    }
    if (name === 'SecurityError' || name === 'NotAllowedError') {
      return bleProblem(
        'insecure',
        '브라우저가 블루투스 선택 창을 열어 주지 않았어요.',
        '주소가 https로 시작하는지 확인하고, [블루투스 보드 연결] 단추를 직접 눌러요(단추를 누르지 않고 저절로 열 수는 없어요).',
      );
    }
  }
  if (stage === 'service' && name === 'NotFoundError') {
    return bleProblem(
      'no-service',
      '고른 기기에서 블루투스 UART 서비스를 찾지 못했어요.',
      '보드에서 ESP32BLE 코드를 실행한 뒤에 연결해요. 다른 기기(이어폰·마우스 등)를 고른 것은 아닌지도 확인해요.',
    );
  }
  if (stage === 'service' && name === 'SecurityError') {
    return bleProblem(
      'no-service',
      '이 기기의 블루투스 UART 서비스를 쓸 수 없어요.',
      '보드를 껐다 켜고 다시 연결해 보세요. 그래도 안 되면 선생님께 알려 주세요(사이트 설정 문제일 수 있어요).',
    );
  }
  if (stage === 'write') {
    return bleProblem('write-failed', '값을 보내지 못했어요.', '연결이 끊기지 않았는지 보고 [블루투스 보드 연결]로 다시 이어요.');
  }
  if (stage === 'notify') {
    return bleProblem('write-failed', '보드가 보내는 값(알림)을 켜지 못했어요.', '보내기는 되지만 보드가 보낸 값은 안 보일 수 있어요. 보드를 껐다 켜고 다시 연결해 보세요.');
  }
  if (name === 'NetworkError' || name === 'AbortError') {
    return bleProblem(
      'connect-failed',
      '보드와 연결하지 못했어요.',
      '보드를 가까이 두고 다시 눌러요. 다른 프로그램이나 다른 컴퓨터가 이미 이 보드와 연결돼 있으면 먼저 끊어야 해요(블루투스는 한 번에 한 곳과만 이어져요).',
    );
  }
  if (name === 'InvalidStateError') {
    return bleProblem('disconnected', '연결이 중간에 끊겼어요.', '[블루투스 보드 연결]을 다시 눌러요.');
  }
  return bleProblem('unknown', `연결 중에 문제가 생겼어요(${name === '' ? '까닭 모름' : name}).`, '보드를 껐다 켜고 다시 해 보세요. 그래도 안 되면 브라우저를 새로 고침해요.');
}
