/**
 * MQTT 화면 설정(통로·중계 서버 주소·보드 이름)을 이 브라우저에 적어 둔다(P4-06).
 *
 * 저장 이름은 흉내 모듈 규칙과 같은 `module:mqtt:<이름>`이라 [이 컴퓨터에서 내 기록 지우기]가 함께 지운다
 * (`src/lib/storage.ts`의 `clearOurs`). **접두어는 여기에 저장하지 않는다** — 접두어는 브릿지의 `prefix.ts`가
 * `sessionStorage`에 두고(PD-29: 탭을 닫으면 사라져 공용 PC의 다음 반 학생에게 이어지지 않는다), [고정]을 누를 때만
 * 이 컴퓨터에 남는다.
 *
 * 기본값을 `tab`(같은 컴퓨터 탭)으로 둔 까닭: PLAN §10 "수업에서는 같은 컴퓨터 탭 통로를 먼저 안내".
 * 공개 중계 서버는 학생이 스스로 고를 때만 쓰고, 그때 경고가 화면에 늘 보인다(§7.4).
 */
import { readItem, writeItem, type StorageSource } from '../../lib/storage.ts';
import { brokerById, checkBrokerUrl, DEFAULT_BROKER_ID, defaultBrokerUrl, CUSTOM_BROKER_ID } from './brokers.ts';
import type { MqttMode } from './connection.ts';
import { DEFAULT_DEVICE, isValidDevice } from './topics.ts';

const MODE_NAME = 'module:mqtt:mode';
const BROKER_NAME = 'module:mqtt:broker';
const BROKER_URL_NAME = 'module:mqtt:broker-url';
const DEVICE_NAME = 'module:mqtt:device';

export interface MqttSettings {
  readonly mode: MqttMode;
  /** 고른 중계 서버 id(목록의 id 또는 'custom') */
  readonly brokerId: string;
  /** 실제로 쓸 주소 */
  readonly brokerUrl: string;
  /** 보드 이름(토픽 `<접두어>/<보드 이름>/rx`) */
  readonly device: string;
}

function parseMode(value: string | null): MqttMode {
  return value === 'broker' || value === 'auto' || value === 'tab' ? value : 'tab';
}

/** 이 브라우저에 저장된 설정을 읽는다(없거나 이상하면 기본값) */
export function readMqttSettings(source?: StorageSource): MqttSettings {
  const mode = parseMode(readItem(MODE_NAME, source));
  const savedId = readItem(BROKER_NAME, source) ?? DEFAULT_BROKER_ID;
  const brokerId = brokerById(savedId) === null ? DEFAULT_BROKER_ID : savedId;
  let brokerUrl = brokerById(brokerId)?.url ?? '';
  if (brokerId === CUSTOM_BROKER_ID) {
    const saved = readItem(BROKER_URL_NAME, source) ?? '';
    const check = checkBrokerUrl(saved);
    brokerUrl = check.ok ? check.url : defaultBrokerUrl();
  }
  if (brokerUrl === '') {
    brokerUrl = defaultBrokerUrl();
  }
  const device = readItem(DEVICE_NAME, source) ?? '';
  return { mode, brokerId, brokerUrl, device: isValidDevice(device) ? device : DEFAULT_DEVICE };
}

/** 설정을 적어 둔다(바꾼 칸만 넘긴다) */
export function writeMqttSettings(values: Partial<MqttSettings>, source?: StorageSource): void {
  if (values.mode !== undefined) {
    writeItem(MODE_NAME, values.mode, source);
  }
  if (values.brokerId !== undefined) {
    writeItem(BROKER_NAME, values.brokerId, source);
  }
  if (values.brokerUrl !== undefined) {
    writeItem(BROKER_URL_NAME, values.brokerUrl, source);
  }
  if (values.device !== undefined && isValidDevice(values.device)) {
    writeItem(DEVICE_NAME, values.device, source);
  }
}
