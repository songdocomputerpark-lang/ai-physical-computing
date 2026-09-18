/**
 * 통로 등록표(P4-01) — **나중에 MQTT·BLE·Web Serial이 끼워질 자리**.
 *
 * 규칙(흉내 모듈 폴더 규약과 같은 뜻 — src/lab/README.md 4.7 "등록 파일을 손으로 고치지 않는다")
 * - 새 통로를 만드는 구역은 **이 파일을 고치지 않는다.** 자기 폴더에서 `registerBridgeChannel(factory)`를 부른다
 *   (모듈 index.ts의 mount 안이나, 통로 파일을 처음 import할 때).
 * - 같은 id를 두 번 등록하면 오류를 낸다(어느 쪽이 이겼는지 모르는 상태를 만들지 않으려고).
 * - 화면은 `listBridgeChannels()`로 고를 수 있는 통로만 보여 준다(`available()`이 참인 것).
 *
 * 붙박이로 들어 있는 통로는 같은 탭 직접 연결(direct)과 같은 컴퓨터 탭(tab) 둘뿐이다 — 둘 다 브라우저 API가
 * 없어도(direct) 또는 같은 출처 안에서만(tab) 돌아 인터넷·권한이 필요 없다.
 */
import { bridgeText } from '../messages.ts';
import type { BridgeChannel, BridgeChannelFactory, BridgeChannelOpenOptions } from '../types.ts';
import { createDirectHub, DIRECT_CHANNEL_ID, type DirectHub } from './direct.ts';
import { createTabChannel, isTabChannelAvailable, TAB_CHANNEL_ID } from './tab.ts';
import { ensurePrefix } from '../prefix.ts';

const registry = new Map<string, BridgeChannelFactory>();

/** 같은 탭 직접 연결 묶음(접두어별로 하나) */
const directHubs = new Map<string, DirectHub>();

function directHub(prefix: string, type?: string): DirectHub {
  const found = directHubs.get(prefix);
  if (found !== undefined) {
    return found;
  }
  const hub = createDirectHub(type === undefined ? {} : { type });
  directHubs.set(prefix, hub);
  return hub;
}

/** 통로 구현을 등록한다. 같은 id가 이미 있으면 오류. */
export function registerBridgeChannel(factory: BridgeChannelFactory): void {
  if (registry.has(factory.id)) {
    throw new Error(`통로 id "${factory.id}"가 이미 등록돼 있어요. 통로 id는 저장소 전체에서 하나여야 해요.`);
  }
  registry.set(factory.id, factory);
}

/** 등록된 통로 목록(등록한 차례대로). onlyAvailable이 참이면 이 브라우저에서 쓸 수 있는 것만. */
export function listBridgeChannels(onlyAvailable = false): readonly BridgeChannelFactory[] {
  const all = Array.from(registry.values());
  return onlyAvailable ? all.filter((factory) => factory.available()) : all;
}

/** id로 통로 구현을 찾는다(없으면 null) */
export function getBridgeChannelFactory(id: string): BridgeChannelFactory | null {
  return registry.get(id) ?? null;
}

/** 통로를 연다. 없는 id면 오류. */
export async function openBridgeChannel(id: string, options: BridgeChannelOpenOptions): Promise<BridgeChannel> {
  const factory = getBridgeChannelFactory(id);
  if (factory === null) {
    const known = Array.from(registry.keys());
    const hint = known.length === 0 ? '붙박이 통로를 먼저 등록해요 — registerBuiltinChannels()' : `등록된 통로: ${known.join(', ')}`;
    throw new Error(`"${id}" 통로를 찾지 못했어요. ${hint}`);
  }
  return factory.open(options);
}

/** 테스트에서만 쓴다 — 등록표와 직접 연결 묶음을 비운다 */
export function clearBridgeChannels(): void {
  registry.clear();
  directHubs.clear();
}

/** 붙박이 통로 두 개를 등록한다(index.ts가 한 번 부른다. 두 번 불러도 괜찮다). */
export function registerBuiltinChannels(): void {
  if (!registry.has(DIRECT_CHANNEL_ID)) {
    registerBridgeChannel({
      id: DIRECT_CHANNEL_ID,
      label: '같은 화면 연결',
      available: () => true,
      // 같은 접두어로 연 통로끼리 한 묶음이 된다(같은 탭 안에서 영상처리와 가상 보드를 잇는 한 화면 모드).
      open: (options) => Promise.resolve(directHub(options.prefix ?? 'default', options.type).join(options.from)),
    });
  }
  if (!registry.has(TAB_CHANNEL_ID)) {
    registerBridgeChannel({
      id: TAB_CHANNEL_ID,
      label: '같은 컴퓨터 탭',
      notice: bridgeText.tabChannelNotice(),
      available: isTabChannelAvailable,
      open: (options) =>
        Promise.resolve(
          createTabChannel({
            from: options.from,
            prefix: options.prefix ?? ensurePrefix(),
            ...(options.type === undefined ? {} : { type: options.type }),
          }),
        ),
    });
  }
}
