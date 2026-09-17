/**
 * 키트 모듈명 ↔ 범용 부품 대응표의 줄(SPEC §6.2 "특정 키트를 쓰는 학교를 위해 키트 모듈명 ↔ 범용 부품 대응표", PLAN §8.3 P3-10).
 * 보드 준비 페이지(src/pages/start/board/)의 KitPartsTable.astro가 이 목록을 그린다. 줄을 고칠 때는 이 목록만 고친다.
 *
 * 근거: docs/INVENTORY.md §4.1 부품 목록(원고·교안 사진과 코드에서 읽은 표기)·§4.2 핀 불일치·§10.5 실물 미확정 목록,
 * PLAN 부록 A PD-36(진동 모터 GPIO19 — 원고에 핀이 없어 사이트가 정함, P3-02), PD-34(디지털 터치 GPIO17).
 * - "키트·원고 표기"는 교과서 원고와 수업 교안에 적힌 이름이다. 범용 이름은 다른 회사 부품을 살 때 찾아보는 이름이다.
 * - 핀 번호는 차시마다 달라서(PD-05) 예만 적었다. 실습할 때는 그 차시의 배선도(ESP32 실습실 보드 그림)를 따른다.
 * - 실물로 확인하지 못한 사실에는 unconfirmed를 적는다 → 화면에 "실물 확인 전"(DECISIONS §3, 운영자 할 일 2번·PLAN 부록 B-2).
 * P1-08의 src/components/start/KitPartsTable.astro에서 옮기며 진동 모터 줄을 P3-02 결정(GPIO19)에 맞췄다(2026-09-18).
 */

export interface KitPart {
  /** 키트·원고에 적힌 이름 */
  readonly kitName: string;
  /** 범용 부품 이름 */
  readonly generic: string;
  /** 연결 방식 */
  readonly connection: string;
  /** 교과서 예제에서 쓴 핀(예) */
  readonly pins: string;
  /** 쓰는 차시(사이트 차시 번호) */
  readonly lessons: string;
  /** 실물로 확인하지 못한 점(없으면 비움) */
  readonly unconfirmed?: string;
}

export const KIT_PARTS: readonly KitPart[] = Object.freeze([
  {
    kitName: 'ESP32 개발 보드(모듈 표기 ESP-WROOM-32)',
    generic: 'ESP32 개발 보드(ESP-WROOM-32 모듈, 30핀)',
    connection: 'USB-C 케이블(프로그램 올리기·전원)',
    pins: '내장 LED GPIO2, BOOT 버튼 GPIO0',
    lessons: '2-1-1부터 보드를 쓰는 모든 차시',
  },
  {
    kitName: '확장 실드(기판 표기 ESP32 Shield V2)',
    generic: 'ESP32 확장 보드(핀마다 GND·VCC·신호 3핀 헤더가 있는 센서 실드)',
    connection: 'ESP32 보드를 꽂아서 씀',
    pins: '핀 번호가 기판에 인쇄되어 있음',
    lessons: '부품을 연결하는 모든 차시',
    unconfirmed: '줄마다 나오는 전압(3.3V·5V)과 핀 배치',
  },
  {
    kitName: 'USB 드라이브(CH340)',
    generic: 'USB-시리얼 변환 칩(보드 안에 있음)',
    connection: '보드의 USB 단자와 이어짐',
    pins: '—',
    lessons: '2-1-1(드라이버 안내)',
    unconfirmed: '보드에 실제로 붙은 칩 이름',
  },
  {
    kitName: 'LCD(2x16), 기판 1602A, 백팩 I2C Addr:0x20',
    generic: '16×2 문자 LCD(1602) + I2C 변환 모듈(PCF8574 계열)',
    connection: 'I2C 4핀(GND·VCC·SDA·SCL)',
    pins: 'SDA 21, SCL 22, 주소 0x20',
    lessons: '2-1-2, 4-1-4, 4-2-1, 4-2-2',
    unconfirmed: '실제 I2C 주소(모듈 점퍼에 따라 0x20~0x27)',
  },
  {
    kitName: 'OLED(SH1106), 기판 OLED 1.3인치',
    generic: '1.3인치 OLED 128×64(I2C)',
    connection: 'I2C 4핀(GND·VCC·SDA·SCL)',
    pins: 'SDA 21, SCL 22',
    lessons: '2-1-3',
    unconfirmed: '화면 칩 종류(SH1106 또는 SSD1306)',
  },
  {
    kitName: '터치 센서',
    generic: '터치 센서 모듈(디지털 출력)',
    connection: '디지털 입력(누르는 동안 1)',
    pins: 'GPIO17',
    lessons: '2-1-2, 2-2-1',
    unconfirmed: '어느 모듈을 어떻게 연결하는지',
  },
  {
    kitName: 'Analog Touch Sensor, 터치 센서(4채널)',
    generic: '4버튼 아날로그 터치 패드(버튼마다 다른 값이 나옴)',
    connection: '아날로그 입력 1개',
    pins: 'GPIO32(값 약 688·1535·2381·3263)',
    lessons: '2-1-3, 2-1-5, 2-2-2',
  },
  {
    kitName: 'RGB LED(교안: Led_rgb)',
    generic: 'RGB LED 모듈(5핀: GND·VCC·R·G·B)',
    connection: '디지털 출력 또는 PWM(밝기 조절)',
    pins: '예: 27·32·33(2-1-4), 25·26·27(3-1-3)',
    lessons: '2-1-3, 2-1-4, 3-1-3, 4-2-2',
    unconfirmed: '공통 극성(켜지는 값이 1인지 0인지)',
  },
  {
    kitName: 'Laser 레이저',
    generic: '레이저 모듈(3핀: GND·VCC·신호)',
    connection: '디지털 출력',
    pins: '예: GPIO21(2-1-4), GPIO18(3-1-2)',
    lessons: '2-1-4, 3-1-2, 4-2-2',
  },
  {
    kitName: '16구 네오픽셀(3핀)',
    generic: '16구 링 LED(네오픽셀, WS2812 방식으로 제어)',
    connection: '데이터 입력(DIN) 1개',
    pins: 'GPIO23',
    lessons: '2-1-5',
    unconfirmed: 'LED 칩 이름',
  },
  {
    kitName: 'M_Buzzer 수동버저',
    generic: '수동(패시브) 버저 모듈(3핀)',
    connection: 'PWM(음 높이 조절)',
    pins: '예: GPIO15(2-2-1), GPIO2(4-2-2)',
    lessons: '2-2-1, 4-2-2',
  },
  {
    kitName: 'MP3 Player MP3플레이어(원고: DFPlayer Mini)',
    generic: 'DFPlayer Mini 계열 MP3 모듈 + 스피커 + microSD 카드',
    connection: 'UART2(9600bps)',
    pins: 'ESP32 TX 17 → 모듈 RX, 모듈 TX → ESP32 RX 16',
    lessons: '2-2-2',
    unconfirmed: '수업에서 쓰는 모듈 종류',
  },
  {
    kitName: 'Fan Motor 선풍기',
    generic: 'DC 팬 모터 모듈(4핀: GND·VCC·INA·INB) + 프로펠러',
    connection: '디지털 출력 2개(방향), PWM(속도)',
    pins: 'INA GPIO25, INB GPIO26',
    lessons: '2-2-3',
  },
  {
    kitName: 'MG90S Micro servo(교안 사진: SG90)',
    generic: '마이크로 서보모터(MG90S·SG90급)',
    connection: 'PWM 50Hz',
    pins: '예: GPIO25(2-2-4), 25·26(두 축)',
    lessons: '2-2-4, 4-2-1, 4-2-2',
    unconfirmed: '펄스 폭과 각도의 정확한 관계',
  },
  {
    kitName: 'Vibration Motor 진동모터',
    generic: '진동 모터 모듈(3핀: GND·VCC·신호)',
    connection: '디지털 출력(켜기·끄기) 또는 PWM(세기)',
    pins: 'GPIO19(원고에 핀이 없어 사이트가 정한 핀)',
    lessons: '2-2-1(사이트 새 예제)',
    unconfirmed: 'GPIO19에 꽂았을 때 실제로 떨리는지',
  },
  {
    kitName: 'USB to UART Converter',
    generic: 'USB-UART 변환기(3.3V/5V 전환 스위치)',
    connection: 'TX·RX·GND 선으로 보드와 연결, 컴퓨터와는 따로 USB',
    pins: '원고 그림: 변환기 TX → GPIO16, RX → GPIO17',
    lessons: '3-1-2',
    unconfirmed: '칩 종류와 TX·RX 연결 방향',
  },
]);
