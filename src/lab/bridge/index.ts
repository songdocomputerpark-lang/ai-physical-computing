/**
 * 통신 브릿지 공개 자리(P4-01). **다른 코드는 이 파일에서만 가져다 쓴다** — 안쪽 파일 구조가 바뀌어도 쓰는 쪽이 흔들리지 않게.
 * 규약 전체는 `src/lab/README.md` 9절, 근거는 `docs/PLAN.md` §7.
 */
export type {
  BridgeCategory,
  BridgeChannel,
  BridgeChannelEvents,
  BridgeChannelFactory,
  BridgeChannelOpenOptions,
  BridgeChannelState,
  BridgeEnvelope,
  BridgeMessage,
  BridgeParty,
  BridgeSendOptions,
  BridgeShape,
  BridgeWarning,
  BridgeWarningCode,
} from './types.ts';
export { BRIDGE_PARTY_LABELS, partyLabel } from './types.ts';

export {
  BRIDGE_MAX_BYTES,
  BRIDGE_MAX_QUEUE,
  BRIDGE_MIN_INTERVAL_MS,
  BridgeClosedError,
  BridgeError,
  BridgeMessageError,
  BridgeNoPeerError,
  bridgeText,
  bridgeWarning,
  byteLengthOf,
  previewOf,
} from './messages.ts';

export {
  BRIDGE_TERMINATOR,
  classifyText,
  inspectBytes,
  rawMessage,
  sameBytes,
  sentLineOf,
  streamMessage,
  textMessage,
  type BridgeClassification,
  type RawMessageOptions,
  type TextMessageOptions,
} from './message.ts';

export { BridgeOutbox, systemScheduler, type BridgeOutboxOptions, type BridgeScheduler, type BridgeSendResult, type BridgeWrite } from './outbox.ts';

export { BridgeInbox, checkInbound, type BridgeInboundCheck, type BridgeInboundPolicy, type BridgeInboxOptions } from './inbox.ts';

export {
  PREFIX_ALPHABET,
  PREFIX_LENGTH,
  PREFIX_QUERY_NAMES,
  PREFIX_STORAGE_NAME,
  createPrefix,
  ensurePrefix,
  isPinned,
  isValidPrefix,
  parsePrefix,
  pinPrefix,
  prefixFromQuery,
  readPrefix,
  unpinPrefix,
  writeSessionPrefix,
  type PrefixStores,
  type RandomBytes,
} from './prefix.ts';

export { Bridge, createBridge, type BridgeOptions } from './bridge.ts';

export {
  BRIDGE_DATA_TYPE,
  DIRECT_CHANNEL_ID,
  DirectHub,
  createDirectHub,
  createDirectPair,
  type DirectHubOptions,
} from './channels/direct.ts';
export {
  TAB_CHANNEL_ID,
  TAB_CHANNEL_NAME_PREFIX,
  TAB_UART_DATA_TYPE,
  TAB_UART_STATUS_TYPE,
  createTabChannel,
  isTabChannelAvailable,
  tabChannelName,
  type BroadcastChannelLike,
  type TabChannelOptions,
} from './channels/tab.ts';
export {
  BRIDGE_BYE_TYPE,
  BRIDGE_HELLO_TYPE,
  BRIDGE_HERE_TYPE,
  isPresenceType,
  isSignalType,
  makeEnvelope,
  parseEnvelope,
  toBytes,
} from './channels/envelope.ts';
export {
  clearBridgeChannels,
  getBridgeChannelFactory,
  listBridgeChannels,
  onBridgeChannelsChanged,
  openBridgeChannel,
  registerBridgeChannel,
  registerBuiltinChannels,
} from './channels/registry.ts';
