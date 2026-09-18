/**
 * MQTT·같은 컴퓨터 탭 통로 공개 자리(P4-06). **다른 코드는 이 파일에서만 가져다 쓴다** — 안쪽 파일 구조가 바뀌어도
 * 쓰는 쪽이 흔들리지 않게(브릿지 `src/lab/bridge/index.ts`와 같은 규칙).
 *
 * 규약은 `docs/PLAN.md` §7.4(토픽·브로커·PD-29)와 `src/lab/README.md` 9.6(새 통로 더하기).
 *
 * 다른 구역이 쓰는 법
 *   import { registerMqttChannel, getMqttSession } from '../../mqtt/index.ts';
 *   registerMqttChannel();                       // 브릿지 통로 목록에 'mqtt'가 나온다
 *   const session = getMqttSession();            // 이 탭의 연결(패널·파이썬 흉내와 함께 쓴다)
 */
export { CUSTOM_BROKER_ID, DEFAULT_BROKER_ID, MQTT_BROKERS, brokerById, brokerByUrl, brokerUrlForServer, checkBrokerUrl, defaultBrokerUrl, requireBrokerUrl, type BrokerUrlCheck, type MqttBrokerOption } from './brokers.ts';
export { MqttConnectError, MqttError, MqttNotConnectedError, MqttTopicError, mqttText } from './messages.ts';
export {
  DEFAULT_DEVICE,
  DEVICE_PATTERN,
  MAX_TOPIC_LENGTH,
  checkTopic,
  dashTopic,
  deviceRxTopic,
  deviceTxTopic,
  isUnderPrefix,
  isValidDevice,
  parseDevice,
  prefixFilter,
  stripTopicPrefix,
  topicMatches,
  withTopicPrefix,
  type PrefixedTopic,
} from './topics.ts';
export { MqttEmitter, makeClientId, previewBytes, toBytes, type MqttIncoming, type MqttPublishOptions, type MqttTransport, type MqttTransportEvents, type MqttTransportOptions, type MqttVia } from './transport.ts';
export { isTabMqttAvailable, openTabTransport, parseTabEnvelope, tabMqttChannelName, type BroadcastChannelLike, type TabMqttEnvelope, type TabMqttTransportOptions } from './tab-transport.ts';
export { isBrokerAvailable, openBrokerTransport, reasonOf, type BrokerTransportOptions, type MqttClientLike, type MqttConnectFn } from './broker-transport.ts';
export { MqttConnection, type MqttConnectionEvents, type MqttConnectionOptions, type MqttConnectionState, type MqttLogEntry, type MqttMode, type MqttReceived } from './connection.ts';
export { getMqttSession, peekMqttSession, resetMqttSession } from './session.ts';
export { MQTT_CHANNEL_ID, MQTT_DATA_TYPE, envelopeTextOf, forgetMqttChannelRegistration, registerMqttChannel, type MqttChannelExtra } from './channel.ts';
export { readMqttSettings, writeMqttSettings, type MqttSettings } from './settings.ts';
