/**
 * 모의 시리얼 플러그인: 모의 MicroPython 보드마다 모의 ESP32 ROM 부트로더(./esp32-rom.ts)를 붙인다(브라우저 테스트 도구 — 배포 번들에 없음).
 *
 *   await page.addInitScript((options) => { globalThis.__APC_ESP32_ROM_OPTIONS__ = options; }, { board: { writeMsPerBlock: 2 } }); // (선택) 먼저
 *   await installSerialMock(page, { ports: [{ id: 'board' }] }, { plugins: ['src/lab/firmware/mock/serial-plugin.ts'] });
 *   // 테스트 쪽: page.evaluate(() => window.__apcEsp32Rom.summary('board'))
 *
 * installSerialMock(tests/e2e/helpers/serial.ts)은 플러그인 경로를 저장소 뿌리 기준으로 받아 esbuild로 함께 묶는다.
 * 브라우저 안에서 도는 코드라 Node 모듈을 import하지 않는다.
 */
import type { SerialMockPluginContext } from '../../serial/mock/browser-entry.ts';
import { MicroPythonDevice } from '../../serial/mock/micropython-device.ts';
import { Esp32RomEmulator, type Esp32RomOptions } from './esp32-rom.ts';

/** 테스트가 page.evaluate로 부르는 도구(돌려주는 값은 JSON으로 옮길 수 있다) */
export interface Esp32RomBrowserHandle {
  ids(): string[];
  /** 받은 명령 이름 순서 */
  commands(id: string): string[];
  count(id: string, name: string): number;
  summary(id: string): {
    readonly commands: number;
    readonly baudRate: number;
    readonly protocolErrors: number;
    readonly spiAttachLength: number | null;
    readonly flashParameterSize: number | null;
    readonly erased: { offset: number; size: number }[];
  };
  md5(id: string, offset: number, length: number): string;
  /** 플래시 바이트(0~255 숫자 배열) */
  read(id: string, offset: number, length: number): number[];
  setOption(id: string, key: keyof Esp32RomOptions, value: unknown): void;
}

/**
 * 보드 흉내 선택(포트 id마다, 테스트가 installSerialMock 전에 globalThis.__APC_ESP32_BOARD_OPTIONS__에 넣는다).
 * firmware: 'none' — 펌웨어가 지워진 ESP32처럼 굽기 전까지 MicroPython이 대답하지 않고 ROM이 "invalid header: 0xffffffff"를 되풀이한다.
 *   모의 ROM에 펌웨어 데이터(FLASH_DATA·FLASH_DEFL_DATA)가 한 블록이라도 쓰이면 그때부터 보통 MicroPython 보드로 돈다(보드 준비 페이지의
 *   시나리오 C 흐름 "연결 → MicroPython 없음 → 굽기 → 다시 연결"을 한 포트로 시험하려고 — tests/e2e/start-board.spec.ts).
 *   모의 보드(src/lab/serial/mock/micropython-device.ts)는 고치지 않고, 이 보드 객체의 받기·내보내기만 이 페이지 안에서 감싼다(테스트 도구).
 */
export interface Esp32BoardSimulationOptions {
  readonly firmware?: 'micropython' | 'none';
  /** firmware 'none'일 때 ROM 부팅 실패 글을 되풀이하는 간격(밀리초, 기본 200) */
  readonly bootLoopMs?: number;
}

interface RomScope {
  __APC_ESP32_ROM_OPTIONS__?: Readonly<Record<string, Esp32RomOptions>>;
  __APC_ESP32_BOARD_OPTIONS__?: Readonly<Record<string, Esp32BoardSimulationOptions>>;
  __apcEsp32Rom?: Esp32RomBrowserHandle;
}

/** 펌웨어가 지워진 보드: 굽기 전까지 REPL 대답을 막고 부팅 실패 글을 되풀이한다 */
function simulateMissingFirmware(device: MicroPythonDevice, rom: Esp32RomEmulator, options: Esp32BoardSimulationOptions): void {
  const hasFirmware = () => rom.count('FLASH_DEFL_DATA') + rom.count('FLASH_DATA') > 0;
  const romOnly = () => !hasFirmware() && device.mode !== 'bootloader';
  const receive = device.receive.bind(device);
  device.receive = (bytes: Uint8Array) => {
    if (!romOnly()) {
      receive(bytes);
    }
  };
  // 내보내기(배너·프롬프트)는 TypeScript private일 뿐 실행 중에는 보통 메서드라, 이 객체에서만 감싼다
  const target = device as unknown as { emit(data: string | Uint8Array): void };
  const emit = target.emit.bind(device);
  target.emit = (data) => {
    if (!romOnly()) {
      emit(data);
    }
  };
  setInterval(() => {
    if (romOnly() && device.mode !== 'off' && device.mode !== 'reset-held') {
      device.send('invalid header: 0xffffffff\r\n');
    }
  }, Math.max(20, options.bootLoopMs ?? 200));
}

export default function esp32RomPlugin({ kit, controller }: SerialMockPluginContext): void {
  const scope = globalThis as unknown as RomScope;
  const roms = new Map<string, Esp32RomEmulator>();
  for (const id of kit.ports.keys()) {
    const device = kit.devices.get(id);
    if (!(device instanceof MicroPythonDevice)) {
      continue;
    }
    const rom = new Esp32RomEmulator(scope.__APC_ESP32_ROM_OPTIONS__?.[id] ?? {});
    controller.setBootloaderHandler(id, rom.handler);
    roms.set(id, rom);
    const board = scope.__APC_ESP32_BOARD_OPTIONS__?.[id];
    if (board?.firmware === 'none') {
      simulateMissingFirmware(device, rom, board);
    }
  }
  const rom = (id: string): Esp32RomEmulator => {
    const found = roms.get(id);
    if (!found) {
      throw new Error(`모의 ROM 부트로더가 붙은 포트 "${id}"이(가) 없어요. 있는 포트: ${[...roms.keys()].join(', ')}`);
    }
    return found;
  };
  scope.__apcEsp32Rom = {
    ids: () => [...roms.keys()],
    commands: (id) => rom(id).commandNames(),
    count: (id, name) => rom(id).count(name),
    summary: (id) => {
      const item = rom(id);
      return {
        commands: item.commands.length,
        baudRate: item.baudRate,
        protocolErrors: item.protocolErrors,
        spiAttachLength: item.spiAttach?.length ?? null,
        flashParameterSize: item.flashParameterSize,
        erased: item.erased.map((entry) => ({ ...entry })),
      };
    },
    md5: (id, offset, length) => rom(id).md5(offset, length),
    read: (id, offset, length) => Array.from(rom(id).read(offset, length)),
    setOption: (id, key, value) => rom(id).setOption(key, value as never),
  };
}
