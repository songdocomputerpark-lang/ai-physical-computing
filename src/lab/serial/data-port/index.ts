/**
 * 데이터 포트(P4-05) 공개 자리 — **쓰는 쪽은 이 파일에서만 가져온다**(브릿지 핵심 `src/lab/bridge/index.ts`와 같은 규칙).
 *
 * 무엇인가: USB-UART 변환기 포트를 보드 REPL 포트와 **나란히 두 번째 포트로** 열어 데이터를 주고받는다.
 * 규약·근거는 `data-port.ts` 머리말, 실험(USB 한 개로 보내기) 결과는 `single-usb.ts` 머리말에 있다.
 */
export { DATA_PORT_BAUD_RATES, DEFAULT_DATA_PORT_BAUD, MAX_DATA_PORT_BAUD, MIN_DATA_PORT_BAUD, baudLabel, baudMismatchNotice, isListedBaud, normalizeBaud, type DataPortBaudRate } from './baud-rates.ts';
export { BYTE_LOG_LIMIT, ByteLog, HEX_TAIL_BYTES, LINE_LIMIT, decodeUtf8, toHex, visibleText, type ByteLogView } from './byte-log.ts';
export {
  DataPortClosedError,
  DataPortConnection,
  openProblemCode,
  type DataPortOptions,
  type DataPortProblem,
  type DataPortProblemCode,
  type DataPortSnapshot,
  type DataPortState,
} from './data-port.ts';
export { DATA_PORT_CHANNEL_ID, UART_DATA_TYPE, WIRE_PEER, createDataPortChannel, registerDataPortChannel } from './channel.ts';
export {
  DATA_PORT_LABEL_MAX,
  DATA_PORT_LABEL_STORAGE,
  PortLabelStore,
  defaultLabel,
  identifyPort,
  looksLikeBoardRepl,
  portLabelText,
  sanitizeLabel,
  type DataPortIdentity,
  type LabelStoreOptions,
} from './port-labels.ts';
export { SINGLE_USB_SUMMARY, SINGLE_USB_TEMPLATE, UNSAFE_CONTROL_BYTES, checkSingleUsbLine, type SingleUsbCheck, type SingleUsbWarning, type SingleUsbWarningCode } from './single-usb.ts';
export { dataPortText } from './text.ts';
