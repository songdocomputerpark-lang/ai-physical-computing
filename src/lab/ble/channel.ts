/**
 * 블루투스를 브릿지 통로로 끼우기(P4-04 + P4-01 규약 9.6 "새 통로는 registerBridgeChannel로 끼운다 — 등록표를 고치지 않는다").
 *
 * 이 통로를 고르면 컴퓨터 쪽 코드(`bluetooth.init(...).send("355,152")` 같은 P4-02의 흉내 모듈)가 보내는 글자가
 * **실제 ESP32 보드**로 간다. 같은 글자가 같은 코드로 가상 보드·탭 통로·USB·MQTT로도 나간다(PLAN §7.2 규칙 6).
 *
 * 통로 약속(BridgeChannel)에 맞춘 것
 * - `id`는 저장소 전체에서 하나 — P4-01이 정한 이름 그대로 `ble`.
 * - `knowsPeers`는 **참**이다: 블루투스는 이어져 있는지를 알 수 있다(BridgeChannel 머리말 "MQTT·BLE는 연결 여부로 안다").
 *   이어져 있으면 상대는 `board` 하나다(블루투스는 한 번에 한 곳과 잇는다).
 * - 아직 연결하지 않았으면 **BridgeClosedError**를 던진다("…가 닫혀 있어서 보내지 못했어요. 연결을 다시 해 보세요.").
 *   `BridgeNoPeerError`는 문장이 "받을 쪽 화면을 다른 탭에 열고 같은 접두어로…"라 블루투스 상황과 맞지 않는다
 *   (그 문장은 탭 통로용이다 — `bridge/messages.ts`는 공유 파일이라 고치지 않고 맞는 쪽을 골랐다).
 * - 봉투 type은 브릿지 기본값(`bridge.data`)이다. 블루투스는 UART 선이 아니라 속도(baud)가 없다.
 * - **20바이트가 넘어도 자르지 않고 그대로 보낸다.** 자르는 쪽은 실물 보드다(MicroPython 특성 버퍼 20바이트 — §7.7).
 *   브라우저가 미리 자르면 "실물에서 잘린다"는 사실을 학생이 볼 수 없다. 대신 넘으면 한국어로 알린다.
 */
import { BridgeClosedError, BRIDGE_DATA_TYPE, bridgeText, getBridgeChannelFactory, makeEnvelope, registerBridgeChannel } from '../bridge/index.ts';
import type {
  BridgeChannel,
  BridgeChannelEvents,
  BridgeChannelFactory,
  BridgeChannelOpenOptions,
  BridgeChannelState,
  BridgeParty,
  BridgeSendOptions,
} from '../bridge/index.ts';
import type { BleConnection } from './connection.ts';
import { bleText } from './text.ts';
import { BLE_VALUE_BYTES } from './uuids.ts';

/** 통로 종류 id(저장소 전체에서 하나 — P4-01 규약 9.6) */
export const BLE_CHANNEL_ID = 'ble';
/**
 * 블루투스 칸을 열어 달라고 알리는 창 이벤트. 다른 화면([보내기] 패널에서 이 통로를 고를 때 등)이 보내면
 * 흉내 모듈(src/lab/modules/web-bluetooth/index.ts)이 받아 패널을 연다 — 통로를 골랐는데 연결 단추가 어디 있는지
 * 못 찾는 일이 없게. 통로를 열 때 이 이벤트를 **스스로도** 한 번 보낸다.
 */
export const BLE_SHOW_EVENT = 'apc:web-bluetooth-show';
/** 선 반대쪽(보드)이 보낸 것으로 적는 이름 */
export const BLE_PEER: BridgeParty = 'board';

/**
 * 작은 알림 도우미(브릿지 안쪽 파일을 직접 import하지 않는 규약 9.7 때문에 여기에 둔다 —
 * `src/lab/serial/data-port/channel.ts`와 같은 모양).
 */
class ChannelEmitter {
  readonly #listeners: { [K in keyof BridgeChannelEvents]: Set<BridgeChannelEvents[K]> } = {
    message: new Set(),
    peers: new Set(),
    close: new Set(),
  };

  on<K extends keyof BridgeChannelEvents>(event: K, listener: BridgeChannelEvents[K]): () => void {
    const set = this.#listeners[event] as Set<BridgeChannelEvents[K]>;
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  }

  emit<K extends keyof BridgeChannelEvents>(event: K, ...args: Parameters<BridgeChannelEvents[K]>): void {
    const set = this.#listeners[event] as Set<(...values: Parameters<BridgeChannelEvents[K]>) => void>;
    for (const listener of Array.from(set)) {
      try {
        listener(...args);
      } catch {
        // 듣는 쪽 잘못으로 통로가 멈추지 않게
      }
    }
  }

  clear(): void {
    this.#listeners.message.clear();
    this.#listeners.peers.clear();
    this.#listeners.close.clear();
  }
}

class BleBridgeChannel implements BridgeChannel {
  readonly id = BLE_CHANNEL_ID;
  readonly label = bleText.channelLabel();
  readonly from: BridgeParty;
  readonly knowsPeers = true;
  readonly #emitter = new ChannelEmitter();
  readonly #connection: BleConnection;
  readonly #type: string;
  readonly #offData: () => void;
  readonly #offState: () => void;
  #state: BridgeChannelState = 'open';
  #peers: readonly BridgeParty[] = [];

  constructor(connection: BleConnection, options: { from: BridgeParty; type?: string }) {
    this.#connection = connection;
    this.from = options.from;
    this.#type = options.type ?? BRIDGE_DATA_TYPE;
    this.#peers = connection.isOpen ? [BLE_PEER] : [];
    this.#offData = connection.onData((bytes) => {
      if (this.#state !== 'open') {
        return;
      }
      this.#emitter.emit('message', makeEnvelope({ type: this.#type, from: BLE_PEER, to: this.from, bytes, at: Date.now() }));
    });
    this.#offState = connection.subscribe((snapshot) => {
      const peers: readonly BridgeParty[] = snapshot.state === 'open' ? [BLE_PEER] : [];
      if (peers.length !== this.#peers.length) {
        this.#peers = peers;
        this.#emitter.emit('peers', peers);
      }
    });
  }

  get state(): BridgeChannelState {
    return this.#state;
  }

  get peers(): readonly BridgeParty[] {
    return this.#peers;
  }

  async send(bytes: Uint8Array, options: BridgeSendOptions = {}): Promise<void> {
    void options;
    if (this.#state !== 'open' || !this.#connection.isOpen) {
      throw new BridgeClosedError(this.label);
    }
    await this.#connection.write(bytes);
  }

  on<K extends keyof BridgeChannelEvents>(event: K, listener: BridgeChannelEvents[K]): () => void {
    return this.#emitter.on(event, listener);
  }

  /** 통로만 닫는다 — 블루투스 연결은 화면의 [연결 끊기]가 끊는다(다른 통로·손으로 보내기가 아직 쓸 수 있다) */
  close(reason = '닫음'): void {
    if (this.#state === 'closed') {
      return;
    }
    this.#state = 'closed';
    this.#offData();
    this.#offState();
    this.#emitter.emit('close', reason);
    this.#emitter.clear();
  }
}

/** 이어진 블루투스 연결을 브릿지 통로로 감싼다 */
export function createBleChannel(connection: BleConnection, options: { from: BridgeParty; type?: string }): BridgeChannel {
  return new BleBridgeChannel(connection, options);
}

/**
 * 20바이트가 넘는지 미리 보고 알릴 문장(없으면 null). 문장은 브릿지의 것을 그대로 쓴다(같은 상황에 두 문구가 생기지 않게 — 9.7).
 * 보내기를 막지는 않는다 — 실물 보드가 앞 20바이트만 남기는 것을 학생이 보는 것이 이 실습의 내용이다(§7.7).
 */
export function longValueNotice(text: string, byteLength: number): string | null {
  return byteLength > BLE_VALUE_BYTES ? bridgeText.tooLong(text, byteLength, BLE_VALUE_BYTES) : null;
}

/**
 * 등록표에 이 통로를 끼운다(등록표 파일은 고치지 않는다 — 9.6).
 * `connection`을 돌려주는 함수를 받는 까닭: 화면이 만드는 연결 하나를 통로가 나중에 찾아 쓰기 때문이다.
 * 같은 id가 이미 등록돼 있으면 아무것도 하지 않는다(모듈이 실습실마다 다시 mount돼도 안전하게).
 */
export function registerBleChannel(getConnection: () => BleConnection | null): void {
  if (getBridgeChannelFactory(BLE_CHANNEL_ID) !== null) {
    return;
  }
  const factory: BridgeChannelFactory = {
    id: BLE_CHANNEL_ID,
    label: bleText.channelLabel(),
    notice: bleText.channelNotice(),
    // 이 브라우저에 Web Bluetooth가 아예 없으면 고를 수 없는 통로다(규약 9.6 "없는 API를 쓰는 통로는 false").
    // 아직 연결하지 않았어도 고를 수는 있다 — 통로를 고른 뒤 [블루투스 보드 연결]을 누르는 차례라서.
    available: () => getConnection()?.supported === true,
    open: (openOptions: BridgeChannelOpenOptions) => {
      // 통로를 고르면 블루투스 칸을 열어 준다(브라우저에서만 — Node 단위 테스트에는 window가 없다).
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event(BLE_SHOW_EVENT));
      }
      const connection = getConnection();
      if (connection === null) {
        return Promise.reject(new BridgeClosedError(bleText.channelLabel()));
      }
      return Promise.resolve(
        createBleChannel(connection, {
          from: openOptions.from,
          ...(openOptions.type === undefined ? {} : { type: openOptions.type }),
        }),
      );
    },
  };
  registerBridgeChannel(factory);
}
