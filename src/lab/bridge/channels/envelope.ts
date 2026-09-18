/**
 * 봉투 만들기·읽기(P4-01). 통로가 달라도 봉투 모양은 같다 — BroadcastChannel은 값을 그대로 옮기고,
 * MQTT·BLE는 바이트만 싣고 나머지를 토픽·특성으로 나눠 담는다.
 *
 * 받은 봉투는 **믿지 않고 검사한다**: 같은 출처의 다른 탭이 보낸 값이라도 모양이 다르면 버린다(깨진 메시지로 화면이 멈추지 않게).
 */
import type { BridgeEnvelope, BridgeParty } from '../types.ts';

/** 인사·작별 봉투 type — 상대가 있는지 알아보는 데만 쓴다 */
export const BRIDGE_HELLO_TYPE = 'bridge.hello';
export const BRIDGE_HERE_TYPE = 'bridge.here';
export const BRIDGE_BYE_TYPE = 'bridge.bye';

/** 여러 모양으로 온 바이트를 Uint8Array로 (JSON을 거치는 통로는 숫자 배열이 된다) */
export function toBytes(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) {
    return new Uint8Array(value);
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (Array.isArray(value) && value.every((item) => typeof item === 'number' && Number.isInteger(item) && item >= 0 && item <= 255)) {
    return Uint8Array.from(value as number[]);
  }
  if (typeof value === 'string') {
    return new TextEncoder().encode(value);
  }
  return null;
}

/** 받은 값이 봉투 모양인지 보고, 맞으면 봉투로 돌려준다(아니면 null) */
export function parseEnvelope(data: unknown): BridgeEnvelope | null {
  if (data === null || typeof data !== 'object') {
    return null;
  }
  const record = data as Record<string, unknown>;
  if (record['v'] !== 1 || typeof record['type'] !== 'string' || typeof record['from'] !== 'string') {
    return null;
  }
  const bytes = toBytes(record['bytes']) ?? new Uint8Array(0);
  const at = typeof record['at'] === 'number' && Number.isFinite(record['at']) ? record['at'] : 0;
  return {
    v: 1,
    type: record['type'],
    from: record['from'] as BridgeParty,
    ...(typeof record['to'] === 'string' ? { to: record['to'] as BridgeParty } : {}),
    ...(typeof record['port'] === 'string' ? { port: record['port'] } : {}),
    ...(typeof record['baud'] === 'number' && Number.isFinite(record['baud']) ? { baud: record['baud'] } : {}),
    bytes,
    at,
  };
}

/** 봉투를 만든다 */
export function makeEnvelope(fields: {
  type: string;
  from: BridgeParty;
  to?: BridgeParty;
  port?: string;
  baud?: number;
  bytes?: Uint8Array;
  at: number;
}): BridgeEnvelope {
  return {
    v: 1,
    type: fields.type,
    from: fields.from,
    ...(fields.to === undefined ? {} : { to: fields.to }),
    ...(fields.port === undefined ? {} : { port: fields.port }),
    ...(fields.baud === undefined ? {} : { baud: fields.baud }),
    bytes: fields.bytes === undefined ? new Uint8Array(0) : new Uint8Array(fields.bytes),
    at: fields.at,
  };
}

/** 인사·작별 봉투인가 */
export function isPresenceType(type: string): boolean {
  return type === BRIDGE_HELLO_TYPE || type === BRIDGE_HERE_TYPE || type === BRIDGE_BYE_TYPE;
}
