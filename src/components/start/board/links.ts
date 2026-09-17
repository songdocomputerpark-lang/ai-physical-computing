/**
 * 보드 준비 페이지가 안내하는 사이트 밖 주소 — 드라이버 공식 페이지와 안내의 근거(PLAN §8.3 P3-10).
 * 드라이버 파일은 이 사이트에 올리지 않고 만든 회사의 공식 내려받기 페이지로만 보낸다(SPEC §2 원칙 1의 허용 예외, INVENTORY §2).
 *
 * 확인(2026-09-18, 응답 200과 페이지 내용)
 * - WCH CH341SER.EXE: 스크립트로 그리는 페이지라 브라우저로 열어 확인 — "CH340/CH341 USB to serial port One-Key installation VCP vendor
 *   driver for Windows, supports Windows 11/10/…", 판 4.0, 2026-06-24, 780KB.
 * - WCH CH34XSER_MAC.ZIP: macOS 드라이버("supports … OS X 11(Big Sur) and above"), 판 2.1, 2026-08-31.
 * - Silicon Labs "CP210x USB to UART Bridge VCP Drivers"(Windows·Macintosh·Linux·Android).
 * - Microsoft Update 카탈로그 "USB-SERIAL CH340" 검색: "wch.cn - Ports - 3.9.2024.9"(2024-09-15) — 분류 "Windows 10 and later drivers",
 *   "Windows 11 Client, version 22H2 and later, Servicing Drivers" → 인터넷과 드라이버 자동 설치가 허용된 Windows 10·11은 저절로 설치될 수 있다.
 * - Espressif ESP-IDF(stable, v6.1) "Establish Serial Connection with ESP32": "If device driver does not install automatically, …"(자동 설치가 안 될 때만),
 *   "Disconnect ESP32 and connect it back, to verify which port disappears from the list and then shows back again", Linux dialout 그룹.
 * - Ubuntu brltty 버그 1958224 "brltty claiming cp210x devices on 22.04"(Jammy Fix Released) — 댓글 기록에
 *   "usbfs: interface 0 claimed by ch341 while 'brltty' sets config #1"(CH340 1a86:7523도 같은 증상).
 * - Ubuntu chromium-browser 버그 1890365 "[snap] Web Serial fails to access local device" — 해결: `sudo snap connect chromium:raw-usb`.
 * - snapcraft raw-usb 인터페이스 문서: 자동 연결 안 됨(Auto-connect: no), 파일 권한은 따로 필요(dialout).
 * 주소를 바꾸면 tests/e2e/start.spec.ts(WCH·Silicon Labs 주소)와 tests/e2e/start-board.spec.ts도 함께 본다.
 */

export const LINKS_CHECKED_ON = '2026-09-18';

export interface DriverLink {
  readonly id: 'wch-windows' | 'silabs' | 'wch-macos';
  /** USB 칩 이름 */
  readonly chip: string;
  /** 만든 회사 */
  readonly maker: string;
  /** 운영체제 */
  readonly os: string;
  /** 링크 글자(찾는 파일 이름이 들어가게) */
  readonly label: string;
  readonly url: string;
}

export const DRIVER_LINKS: readonly DriverLink[] = Object.freeze([
  {
    id: 'wch-windows',
    chip: 'CH340·CH341(교과서 키트)',
    maker: 'WCH(Nanjing Qinheng Microelectronics)',
    os: 'Windows',
    label: 'CH341SER.EXE 내려받기 페이지(Windows)',
    url: 'https://www.wch-ic.com/downloads/CH341SER_EXE.html',
  },
  {
    id: 'silabs',
    chip: 'CP210x(CP2102 등)',
    maker: 'Silicon Labs',
    os: 'Windows·macOS·Linux',
    label: 'CP210x USB to UART Bridge VCP 드라이버 페이지',
    url: 'https://www.silabs.com/software-and-tools/usb-to-uart-bridge-vcp-drivers',
  },
  {
    id: 'wch-macos',
    chip: 'CH340·CH341',
    maker: 'WCH',
    os: 'macOS',
    label: 'CH34XSER_MAC.ZIP 내려받기 페이지(macOS)',
    url: 'https://www.wch-ic.com/downloads/CH34XSER_MAC_ZIP.html',
  },
]);

export interface ReferenceLink {
  readonly label: string;
  readonly url: string;
}

/** Windows가 드라이버를 저절로 설치할 수 있다는 근거 */
export const WINDOWS_UPDATE_EVIDENCE: readonly ReferenceLink[] = Object.freeze([
  {
    label: 'Microsoft Update 카탈로그의 CH340 드라이버(wch.cn - Ports 3.9.2024.9, Windows 10 이상)',
    url: 'https://www.catalog.update.microsoft.com/Search.aspx?q=USB-SERIAL%20CH340',
  },
  {
    label: 'Espressif 문서: ESP32와 시리얼 연결하기(드라이버가 자동으로 설치되지 않을 때만 설치)',
    url: 'https://docs.espressif.com/projects/esp-idf/en/stable/esp32/get-started/establish-serial-connection.html',
  },
]);

export const LINUX_REFERENCES = Object.freeze({
  brlttyBug: { label: 'Ubuntu 버그 기록(brltty가 USB-시리얼 장치를 가져감)', url: 'https://bugs.launchpad.net/ubuntu/+source/brltty/+bug/1958224' },
  snapChromiumBug: { label: 'Ubuntu 버그 기록(snap Chromium의 Web Serial)', url: 'https://bugs.launchpad.net/ubuntu/+source/chromium-browser/+bug/1890365' },
  snapRawUsb: { label: 'snap raw-usb 인터페이스 설명', url: 'https://snapcraft.io/docs/reference/interfaces/raw-usb-interface/' },
} satisfies Record<string, ReferenceLink>);

/**
 * 장치 관리자 "하드웨어 ID"의 VID·PID(만든 회사·제품 번호) → 맞는 드라이버. 포트가 보이지 않을 때 드라이버를 고르는 보조 정보다
 * (포트 선택 창을 거르거나 연결을 막는 데 쓰지 않는다 — PLAN P3-10 "VID·PID는 보조 정보로만").
 * 번호는 구역 E의 src/lab/serial/usb-chips.ts(Linux 커널 ch341.c·cp210x.c id 표 근거)와 같다. 같은 회사의 다른 칩(예: WCH CH9102)은
 * 드라이버가 달라 넣지 않았다 — 표에 없는 번호는 보드를 산 곳의 안내를 보게 한다.
 */
export const HARDWARE_ID_HINTS: readonly { readonly id: string; readonly chip: string; readonly driver: DriverLink['id'] }[] = Object.freeze([
  { id: 'VID_1A86&PID_7523', chip: 'WCH CH340', driver: 'wch-windows' },
  { id: 'VID_10C4&PID_EA60', chip: 'Silicon Labs CP210x', driver: 'silabs' },
]);
