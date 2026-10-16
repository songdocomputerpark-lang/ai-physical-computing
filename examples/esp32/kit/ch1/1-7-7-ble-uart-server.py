from machine import Pin, Timer
from time import sleep_ms
import ubluetooth
from micropython import const

# ====== BLE 이벤트 상수 ======
_IRQ_CENTRAL_CONNECT = const(1)
_IRQ_CENTRAL_DISCONNECT = const(2)
_IRQ_GATTS_WRITE = const(3)

# ====== BLE UART 서버 클래스 ======
class ESP32_BLE:
    def __init__(self, name="ESP32"):
        self.led = Pin(2, Pin.OUT)        # 내장 LED (연결 상태 표시)
        self.timer = Timer(0)
        self.name = name
        self.ble = ubluetooth.BLE()
        self.ble.active(True)
        self.message = None
        self.disconnected()
        self.ble.irq(self.ble_irq)
        self.register()
        self.advertiser()

    def connected(self):
        """BLE 연결됨 — LED 켜짐"""
        self.led.value(1)
        self.timer.deinit()

    def disconnected(self):
        """BLE 미연결 — LED 깜빡임"""
        self.timer.init(period=100, mode=Timer.PERIODIC,
                        callback=lambda t: self.led.value(not self.led.value()))

    def ble_irq(self, event, data):
        """BLE 이벤트 핸들러"""
        if event == _IRQ_CENTRAL_CONNECT:
            self.connected()
        elif event == _IRQ_CENTRAL_DISCONNECT:
            self.advertiser()
            self.disconnected()
        elif event == _IRQ_GATTS_WRITE:
            buffer = self.ble.gatts_read(self.rx)
            self.message = buffer.decode('UTF-8').strip()

    def register(self):
        """Nordic UART Service(NUS) 등록"""
        NUS_UUID = '6E400001-B5A3-F393-E0A9-E50E24DCCA9E'
        RX_UUID  = '6E400002-B5A3-F393-E0A9-E50E24DCCA9E'
        TX_UUID  = '6E400003-B5A3-F393-E0A9-E50E24DCCA9E'
        BLE_NUS = ubluetooth.UUID(NUS_UUID)
        BLE_RX = (ubluetooth.UUID(RX_UUID), ubluetooth.FLAG_WRITE)
        BLE_TX = (ubluetooth.UUID(TX_UUID), ubluetooth.FLAG_NOTIFY)
        BLE_UART = (BLE_NUS, (BLE_TX, BLE_RX,))
        ((self.tx, self.rx,),) = self.ble.gatts_register_services((BLE_UART,))

    def send(self, data):
        """연결된 Central에 데이터 전송"""
        self.ble.gatts_notify(0, self.tx, data + '\n')

    def read(self):
        """수신된 메시지 읽기 (없으면 None)"""
        if self.message:
            data = self.message
            self.message = None
            return data
        return None

    def advertiser(self):
        """BLE 광고 시작 & MAC 주소 출력"""
        try:
            addr = self.ble.config('mac')
            print("BLE 주소:", ':'.join('%02x' % b for b in addr[1]))
        except Exception as e:
            print("에러:", e)
        name = bytes(self.name, 'utf-8')
        adv = bytearray(b'\x02\x01\x02') + bytearray((len(name)+1, 0x09)) + name
        self.ble.gap_advertise(100, adv)

# ====== 사용 예제 ======
ble = ESP32_BLE("ESP32")  # BLE 시작, 이름을 원하는 것으로 변경
print("BLE 대기 중... (LED 깜빡임 = 미연결, LED 켜짐 = 연결됨)")

while True:
    data = ble.read()
    if data:
        print("수신:", data)
        ble.send("받았습니다: " + data)  # 에코 응답
    sleep_ms(100)
