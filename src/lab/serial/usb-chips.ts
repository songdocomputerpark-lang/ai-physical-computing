/**
 * 고른 포트의 USB VID·PID로 USB-시리얼 칩 이름을 알려 준다(P3-07 — PLAN §8.3 "포트가 보일 때 getInfo()의 USB VID·PID로 칩 표시, 보조 정보").
 *
 * 보조 정보일 뿐이다: 칩 이름으로 연결을 막거나 포트 선택 창을 거르지 않는다(requestPort에 filters를 넣지 않음 — PLAN P3-10
 * "VID·PID 판별은 포트가 보일 때의 보조 정보로만"). 교과서 키트 보드는 CH340이다(원고 2단원 "USB 드라이브(CH340) 다운로드").
 *
 * 값의 근거(2026-09-17 원문 확인)
 * - WCH CH340·CH341 계열 1a86:7523·7522·5523 — Linux 커널 drivers/usb/serial/ch341.c의 id_table. 7523을 CH340으로 부르는 것은 PLAN §8.3(P3-07)과 같다.
 * - WCH CH9102 1a86:55d4, CH343 1a86:55d3 — WCH 공식 Linux 드라이버 WCHSoftGroup/ch343ser_linux driver/ch343.c의 ch343_ids 주석("CH9102 chip", "CH343 chip").
 * - Silicon Labs CP210x 10c4:ea60 — 커널 drivers/usb/serial/cp210x.c "Silicon Labs factory default"(ea70도 같은 주석).
 * - FTDI 0403:6001·6010·6014·6015 — 커널 drivers/usb/serial/ftdi_sio_ids.h(FTDI_VID 0x0403, 8U232AM·8U2232C·232H·FTX).
 * - Espressif USB-Serial/JTAG 303a:1001 — esptool 문서 "vid=0x303A pid=0x1001 matches Espressif USB-Serial/JTAG unit used by multiple chips"
 *   (ESP32-S3·C3 같은 칩에 들어 있는 USB. 교과서 키트의 ESP32는 이 USB가 없다).
 */

export interface UsbSerialChip {
  readonly vendorId: number;
  readonly productIds: readonly number[];
  /** 화면에 보이는 칩 이름 */
  readonly chip: string;
  /** 만든 회사 */
  readonly maker: string;
}

export const USB_SERIAL_CHIPS: readonly UsbSerialChip[] = Object.freeze([
  { vendorId: 0x1a86, productIds: [0x7523], chip: 'CH340', maker: 'WCH' },
  { vendorId: 0x1a86, productIds: [0x7522, 0x5523], chip: 'CH340·CH341 계열', maker: 'WCH' },
  { vendorId: 0x1a86, productIds: [0x55d4], chip: 'CH9102', maker: 'WCH' },
  { vendorId: 0x1a86, productIds: [0x55d3], chip: 'CH343', maker: 'WCH' },
  { vendorId: 0x10c4, productIds: [0xea60, 0xea70], chip: 'CP210x', maker: 'Silicon Labs' },
  { vendorId: 0x0403, productIds: [0x6001, 0x6010, 0x6014, 0x6015], chip: 'FTDI USB-시리얼', maker: 'FTDI' },
  { vendorId: 0x303a, productIds: [0x1001], chip: 'ESP32 칩 안의 USB(USB-Serial/JTAG)', maker: 'Espressif' },
]);

export type PortKind = 'usb' | 'bluetooth' | 'unknown';

export interface PortDescription {
  readonly kind: PortKind;
  /** "1a86:7523"(USB일 때만) */
  readonly usbId: string | null;
  /** 아는 칩이면 이름, 모르면 null */
  readonly chip: string | null;
  readonly maker: string | null;
  /** 화면에 한 줄로 보일 글 — "CH340(WCH) · USB 1a86:7523" */
  readonly text: string;
}

/** 16진수 네 자리 두 개를 ":"로 — 1a86:7523 */
export function formatUsbId(vendorId: number, productId: number): string {
  const hex = (value: number) => (value & 0xffff).toString(16).padStart(4, '0');
  return `${hex(vendorId)}:${hex(productId)}`;
}

export function findUsbSerialChip(vendorId: number | undefined, productId: number | undefined): UsbSerialChip | null {
  if (typeof vendorId !== 'number' || typeof productId !== 'number') {
    return null;
  }
  return USB_SERIAL_CHIPS.find((chip) => chip.vendorId === vendorId && chip.productIds.includes(productId)) ?? null;
}

/** SerialPort.getInfo() 값을 사람이 읽는 설명으로 */
export function describePortInfo(info: Partial<SerialPortInfo> | null | undefined): PortDescription {
  if (info && typeof info.usbVendorId === 'number' && typeof info.usbProductId === 'number') {
    const usbId = formatUsbId(info.usbVendorId, info.usbProductId);
    const chip = findUsbSerialChip(info.usbVendorId, info.usbProductId);
    return Object.freeze({
      kind: 'usb' as const,
      usbId,
      chip: chip?.chip ?? null,
      maker: chip?.maker ?? null,
      text: chip ? `${chip.chip}(${chip.maker}) · USB ${usbId}` : `알려지지 않은 USB 장치 · USB ${usbId}`,
    });
  }
  if (info && typeof info.bluetoothServiceClassId !== 'undefined') {
    return Object.freeze({ kind: 'bluetooth' as const, usbId: null, chip: null, maker: null, text: '블루투스 직렬 포트(USB 보드가 아니에요)' });
  }
  return Object.freeze({ kind: 'unknown' as const, usbId: null, chip: null, maker: null, text: '포트 정보를 알 수 없어요' });
}
