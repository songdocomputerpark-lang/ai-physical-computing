/**
 * 데이터 포트를 브릿지 통로로 끼우기(P4-05 + P4-01 규약 9.6 "새 통로는 registerBridgeChannel로 끼운다 — 등록표를 고치지 않는다").
 *
 * 이 통로를 고르면 영상처리 실습실의 `serial.Serial(…).write(b'a')`(P4-02의 흉내 모듈)가 보내는 바이트가
 * **진짜 USB-UART 변환기**로 나간다. 같은 글자가 같은 코드로 가상 보드·탭 통로·BLE·MQTT로도 나간다(PLAN §7.2 규칙 6).
 *
 * 통로 약속(BridgeChannel)에 맞춘 것
 * - `id`는 저장소 전체에서 하나다 — P4-01이 정한 이름 그대로 `serial`.
 * - `knowsPeers`는 **거짓**이다: 시리얼 선 반대쪽에 누가 듣고 있는지 브라우저가 알 방법이 없다(선만 연결돼 있다).
 *   그래서 "받을 쪽이 없어요"를 말하지 않고, 포트가 닫혀 있을 때만 BridgeClosedError를 던진다.
 * - 받은 바이트는 `uart.data` 봉투로 알린다(탭 통로와 같은 type — PLAN §8.4 설계 메모 ②).
 *   from은 `board`다: 데이터 포트로 들어오는 바이트는 선 반대쪽(보드)이 보낸 것이다.
 * - 봉투에 `baud`를 실어 받는 쪽이 속도 불일치를 실물처럼 다룰 수 있게 한다(PLAN §8.4 설계 메모 ④).
 *
 * 열려 있는 포트는 화면(modules/data-port)이 들고 있는 `DataPortConnection` 하나뿐이다 — 통로를 여러 번 열어도
 * 같은 포트를 함께 쓴다(Web Serial은 한 포트를 한 번만 열 수 있다).
 */
import { BridgeClosedError, TAB_UART_DATA_TYPE, getBridgeChannelFactory, makeEnvelope, registerBridgeChannel } from '../../bridge/index.ts';
import type { BridgeChannel, BridgeChannelEvents, BridgeChannelFactory, BridgeChannelOpenOptions, BridgeChannelState, BridgeParty, BridgeSendOptions } from '../../bridge/index.ts';
import type { DataPortConnection } from './data-port.ts';
import { dataPortText } from './text.ts';

/**
 * 아주 작은 알림 도우미. 브릿지 핵심에도 같은 것이 있지만 공개 자리(index.ts)에 나와 있지 않고,
 * 브릿지 안쪽 파일은 직접 import하지 않는 규약이라(README 9.7) 여기에 열 줄짜리로 둔다.
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

/** 통로 종류 id(저장소 전체에서 하나 — P4-01 규약 9.6) */
export const DATA_PORT_CHANNEL_ID = 'serial';
/** 봉투 type — 탭 통로와 **같은 값을 가져다 쓴다**(따로 적어 두면 한쪽만 바뀌어 받는 쪽이 봉투를 못 알아본다) */
export const UART_DATA_TYPE: string = TAB_UART_DATA_TYPE;
/** 선 반대쪽(보드)이 보낸 것으로 적는 이름 */
export const WIRE_PEER: BridgeParty = 'board';

class DataPortChannel implements BridgeChannel {
  readonly id = DATA_PORT_CHANNEL_ID;
  readonly label = dataPortText.channelLabel();
  readonly from: BridgeParty;
  /** 선 반대쪽에 누가 있는지 알 수 없다 */
  readonly knowsPeers = false;
  readonly #emitter = new ChannelEmitter();
  readonly #connection: DataPortConnection;
  readonly #type: string;
  readonly #offData: () => void;
  #state: BridgeChannelState = 'open';

  constructor(connection: DataPortConnection, options: { from: BridgeParty; type?: string }) {
    this.#connection = connection;
    this.from = options.from;
    this.#type = options.type ?? UART_DATA_TYPE;
    this.#offData = connection.onData((bytes) => {
      if (this.#state !== 'open') {
        return;
      }
      this.#emitter.emit(
        'message',
        makeEnvelope({ type: this.#type, from: WIRE_PEER, to: this.from, baud: connection.baudRate, bytes, at: Date.now() }),
      );
    });
  }

  get state(): BridgeChannelState {
    return this.#state;
  }

  get peers(): readonly BridgeParty[] {
    return [];
  }

  async send(bytes: Uint8Array, options: BridgeSendOptions = {}): Promise<void> {
    if (this.#state !== 'open' || !this.#connection.isOpen) {
      throw new BridgeClosedError(this.label);
    }
    void options;
    await this.#connection.write(bytes);
  }

  on<K extends keyof BridgeChannelEvents>(event: K, listener: BridgeChannelEvents[K]): () => void {
    return this.#emitter.on(event, listener);
  }

  /** 통로만 닫는다 — 포트는 화면의 [연결 끊기]가 닫는다(다른 통로·시험 보내기가 아직 쓸 수 있다) */
  close(reason = '닫음'): void {
    if (this.#state === 'closed') {
      return;
    }
    this.#state = 'closed';
    this.#offData();
    this.#emitter.emit('close', reason);
    this.#emitter.clear();
  }
}

/** 열려 있는 데이터 포트 연결을 브릿지 통로로 감싼다 */
export function createDataPortChannel(connection: DataPortConnection, options: { from: BridgeParty; type?: string }): BridgeChannel {
  return new DataPortChannel(connection, options);
}

/**
 * 등록표에 이 통로를 끼운다(등록표 파일은 고치지 않는다 — 9.6).
 * `connection`을 돌려주는 함수를 받는 이유: 화면이 만드는 연결 하나를 통로가 나중에 찾아 쓰기 때문이다.
 * 같은 id가 이미 등록돼 있으면 아무것도 하지 않는다(모듈이 실습실마다 다시 mount돼도 안전하게).
 */
export function registerDataPortChannel(getConnection: () => DataPortConnection | null): void {
  if (getBridgeChannelFactory(DATA_PORT_CHANNEL_ID) !== null) {
    return;
  }
  const factory: BridgeChannelFactory = {
    id: DATA_PORT_CHANNEL_ID,
    label: dataPortText.channelLabel(),
    notice: dataPortText.channelNotice(),
    // 이 브라우저에 Web Serial이 아예 없으면 고를 수 없는 통로다(규약 9.6 "없는 API를 쓰는 통로는 false").
    // 포트를 아직 안 열었어도 고를 수는 있다 — [보내기] 패널에서 통로를 고른 뒤 [데이터 포트 연결]을 누르는 차례라서.
    available: () => getConnection()?.supported === true,
    open: (openOptions: BridgeChannelOpenOptions) => {
      const connection = getConnection();
      if (connection === null) {
        return Promise.reject(new BridgeClosedError(dataPortText.channelLabel()));
      }
      return Promise.resolve(
        createDataPortChannel(connection, {
          from: openOptions.from,
          ...(openOptions.type === undefined ? {} : { type: openOptions.type }),
        }),
      );
    },
  };
  registerBridgeChannel(factory);
}
