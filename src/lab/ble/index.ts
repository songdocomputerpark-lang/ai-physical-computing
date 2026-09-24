/**
 * 실제 블루투스(Web Bluetooth) 공개 자리(P4-04). **쓰는 쪽은 이 파일에서만 가져온다** —
 * 안쪽 파일 구조가 바뀌어도 화면·테스트가 흔들리지 않게(브릿지 `src/lab/bridge/index.ts`, 데이터 포트
 * `src/lab/serial/data-port/index.ts`와 같은 규칙).
 *
 * 무엇이 어디에 있나
 *   connection.ts   연결 하나(선택 창 → GATT → NUS → 쓰기·알림). 화면은 이것만 본다.
 *   write-queue.ts  응답 있는 쓰기를 한 번에 하나씩
 *   channel.ts      브릿지 통로 `ble` 등록(registerBleChannel)
 *   uuids.ts        Nordic UART Service UUID와 선택 창 설정
 *   names.ts        교실 이름 규칙(자리 번호·개인정보 검사)
 *   support.ts      이 브라우저에서 되는지(점검 페이지와 같은 판정)
 *   errors.ts       오류 → 한국어 풀이
 *   text.ts         학생이 보는 한국어 문장
 *   mock/           가짜 navigator.bluetooth(테스트 전용)
 */
export { BleConnection, readableBytes, tooLongForOneWrite, type BleConnectionOptions, type BleSnapshot } from './connection.ts';
export { BLE_CHANNEL_ID, BLE_PEER, BLE_SHOW_EVENT, createBleChannel, longValueNotice, registerBleChannel } from './channel.ts';
export { BLE_MAX_QUEUE, BleQueueFullError, BleWriteCancelledError, BleWriteQueue, type BleWriteQueueOptions } from './write-queue.ts';
export {
  BLE_VALUE_BYTES,
  DEFAULT_NAME_PREFIX,
  NUS_RX_CHARACTERISTIC_UUID,
  NUS_SERVICE_UUID,
  NUS_TX_CHARACTERISTIC_UUID,
  chooserOptions,
  type ChooserOptions,
} from './uuids.ts';
export { NAME_MAX_BYTES, checkBoardName, checkPrefix, initLineFor, normalizePrefix, suggestBoardName, type NameIssue, type NameIssueLevel } from './names.ts';
export { bluetoothApi, detectBleSupport, hasWebBluetooth, unsupportedAdvice, type BleSupport } from './support.ts';
export { describeBleError, errorMessage, type BleStage } from './errors.ts';
export { bleProblem, bleText, type BleConnectionState, type BleProblem, type BleProblemCode } from './text.ts';
