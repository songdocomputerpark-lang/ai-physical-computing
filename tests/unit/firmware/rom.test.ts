// ROM 부트로더 명령 도우미(src/lab/firmware/rom.ts) — esptool.py v4.8.1 --no-stub과 같은 바이트 모양인지 본다.
import { describe, expect, it } from 'vitest';
import {
  DETECTED_FLASH_SIZES,
  ESP_FLASH_BEGIN,
  ESP_SPI_ATTACH,
  ESP_SPI_FLASH_MD5,
  ESP_SPI_SET_PARAMS,
  ESP32_EFUSE_BLK0_RDATA3,
  ESP32_EFUSE_BLK0_RDATA5,
  flashSizeFromId,
  packU32,
  readSpiAttachValue,
  romEraseRegion,
  romFlashMd5,
  romSetFlashParameters,
  romSpiAttach,
  timeoutPerMb,
} from '../../../src/lab/firmware/rom.ts';

interface Call {
  description: string;
  op: number | null | undefined;
  data: number[];
  responseDataLength: number | undefined;
  timeout: number | undefined;
}

function fakeLoader(options: { registers?: Record<number, number>; response?: Uint8Array | number } = {}) {
  const calls: Call[] = [];
  return {
    calls,
    FLASH_WRITE_SIZE: 0x400,
    async readReg(address: number) {
      return options.registers?.[address] ?? 0;
    },
    async checkCommand(description = '', op: number | null = null, data = new Uint8Array(0), _chk = 0, responseDataLength = 0, timeout = 3000) {
      calls.push({ description, op, data: Array.from(data), responseDataLength, timeout });
      return options.response ?? 0;
    },
  };
}

describe('ROM 명령 모양', () => {
  it('packU32는 32비트 little endian', () => {
    expect(Array.from(packU32(0x1000, 0xffffffff, 1))).toEqual([0x00, 0x10, 0, 0, 0xff, 0xff, 0xff, 0xff, 1, 0, 0, 0]);
  });

  it('SPI_ATTACH는 값 4바이트 + ROM용 0 네 바이트(8바이트)', async () => {
    const loader = fakeLoader();
    await romSpiAttach(loader, 0x12345678);
    expect(loader.calls[0]).toMatchObject({ op: ESP_SPI_ATTACH, data: [0x78, 0x56, 0x34, 0x12, 0, 0, 0, 0] });
  });

  it('eFuse에 SPI 패드가 없으면 0, 있으면 esptool과 같게 6비트씩 묶는다', async () => {
    expect(await readSpiAttachValue(fakeLoader())).toBe(0);
    // clk 6, q 17, d 8, cs 11(RDATA5), hd 16(RDATA3 비트 4~8)
    const rdata5 = 6 | (17 << 5) | (8 << 10) | (11 << 15) | (1 << 20);
    const rdata3 = (16 << 4) | (1 << 9) | (1 << 15);
    const value = await readSpiAttachValue(fakeLoader({ registers: { [ESP32_EFUSE_BLK0_RDATA5]: rdata5, [ESP32_EFUSE_BLK0_RDATA3]: rdata3 } }));
    expect(value).toBe((16 << 24) | (11 << 18) | (8 << 12) | (17 << 6) | 6);
  });

  it('SPI_SET_PARAMS는 id 0·크기·64KB·4KB·256·0xFFFF(24바이트)', async () => {
    const loader = fakeLoader();
    await romSetFlashParameters(loader, 4 * 1024 * 1024);
    expect(loader.calls[0]!.op).toBe(ESP_SPI_SET_PARAMS);
    expect(loader.calls[0]!.data).toEqual(Array.from(packU32(0, 4 * 1024 * 1024, 64 * 1024, 4 * 1024, 256, 0xffff)));
  });

  it('지우기는 FLASH_BEGIN 16바이트(ESP32 ROM — 다섯째 값 없음), 크기는 섹터 배수로 올리고 1MB에 30초 시간 제한', async () => {
    const loader = fakeLoader();
    const size = await romEraseRegion(loader, 0, 4 * 1024 * 1024 - 5);
    expect(size).toBe(4 * 1024 * 1024);
    const call = loader.calls[0]!;
    expect(call.op).toBe(ESP_FLASH_BEGIN);
    expect(call.data).toHaveLength(16);
    expect(call.data).toEqual(Array.from(packU32(4 * 1024 * 1024, 4096, 0x400, 0)));
    expect(call.timeout).toBe(Math.round((30_000 * 4 * 1024 * 1024) / 1_000_000));
  });

  it('MD5는 ROM의 32글자 16진수 ASCII를 그대로 읽고(소문자로), 모양이 틀리면 오류', async () => {
    const ascii = new TextEncoder().encode('9BC5BA8866E70B194D92AF536C143070');
    const loader = fakeLoader({ response: ascii });
    expect(await romFlashMd5(loader, 0x1000, 1_790_544)).toBe('9bc5ba8866e70b194d92af536c143070');
    expect(loader.calls[0]).toMatchObject({ op: ESP_SPI_FLASH_MD5, responseDataLength: 32, data: Array.from(packU32(0x1000, 1_790_544, 0, 0)) });
    // 스텁 모양(16바이트 날값)이 오면 받아들이지 않는다
    await expect(romFlashMd5(fakeLoader({ response: new Uint8Array(16) }), 0, 10)).rejects.toThrow('MD5Sum command returned unexpected result');
    await expect(romFlashMd5(fakeLoader({ response: new TextEncoder().encode('z'.repeat(32)) }), 0, 10)).rejects.toThrow('unexpected result');
  });

  it('플래시 크기: RDID 용량 코드 → 크기, 0xFFFFFF·0·모르는 코드는 null', () => {
    expect(flashSizeFromId(0x1640ef)).toEqual({ label: '4MB', bytes: 4 * 1024 * 1024 });
    expect(flashSizeFromId(0x184020)).toEqual({ label: '16MB', bytes: 16 * 1024 * 1024 });
    expect(flashSizeFromId(0x3620c8)).toEqual({ label: '4MB', bytes: 4 * 1024 * 1024 });
    expect(flashSizeFromId(0xffffff)).toBeNull();
    expect(flashSizeFromId(0)).toBeNull();
    expect(flashSizeFromId(0x0140ef)).toBeNull();
    expect(Object.keys(DETECTED_FLASH_SIZES)).toHaveLength(23);
  });

  it('시간 제한은 최소 3초', () => {
    expect(timeoutPerMb(8_000, 1_000)).toBe(3_000);
    expect(timeoutPerMb(8_000, 1_790_544)).toBe(14_324);
  });
});
