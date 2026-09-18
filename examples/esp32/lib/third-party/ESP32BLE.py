from machine import Pin, Timer
from time import sleep_ms
import ubluetooth
from micropython import const

_IRQ_CENTRAL_CONNECT = const(1)
_IRQ_CENTRAL_DISCONNECT = const(2)
_IRQ_GATTS_WRITE = const(3)

class ESP32_BLE:
    def __init__(self, name="ESP32"):
        self.led = Pin(12, Pin.OUT)
        self.timer = Timer(0)
        self.name = name
        self.ble = ubluetooth.BLE()
        self.ble.active(True)
        self.message = None  # Store received message
        self.disconnected()
        self.ble.irq(self.ble_irq)
        self.register()
        self.advertiser()

    def connected(self):
        self.led.value(1)
        self.timer.deinit()

    def disconnected(self):
        self.timer.init(period=100, mode=Timer.PERIODIC, callback=lambda t: self.led.value(not self.led.value()))

    def ble_irq(self, event, data):
        if event == _IRQ_CENTRAL_CONNECT:
            self.connected()

        elif event == _IRQ_CENTRAL_DISCONNECT:
            self.advertiser()
            self.disconnected()

        elif event == _IRQ_GATTS_WRITE:
            buffer = self.ble.gatts_read(self.rx)
            self.message = buffer.decode('UTF-8').strip()  # Store received message

    def register(self):
        NUS_UUID = '6E400001-B5A3-F393-E0A9-E50E24DCCA9E'
        RX_UUID = '6E400002-B5A3-F393-E0A9-E50E24DCCA9E'
        TX_UUID = '6E400003-B5A3-F393-E0A9-E50E24DCCA9E'

        BLE_NUS = ubluetooth.UUID(NUS_UUID)
        BLE_RX = (ubluetooth.UUID(RX_UUID), ubluetooth.FLAG_WRITE)
        BLE_TX = (ubluetooth.UUID(TX_UUID), ubluetooth.FLAG_NOTIFY)

        BLE_UART = (BLE_NUS, (BLE_TX, BLE_RX,))
        SERVICES = (BLE_UART, )
        ((self.tx, self.rx,), ) = self.ble.gatts_register_services(SERVICES)

    def send(self, data):
        self.ble.gatts_notify(0, self.tx, data + '\n')

    def advertiser(self):
        try:
            address = self.ble.config('mac')
            print("ESP32 블루투스 주소:", ':'.join('%02x' % b for b in address[1]))
        except Exception as e:
            print("에러:", e)

        name = bytes(self.name, 'utf-8')
        adv_data = bytearray(b'\x02\x01\x02') + bytearray((len(name) + 1, 0x09)) + name
        self.ble.gap_advertise(100, adv_data)

    def read(self):
        # Return message if available, then clear it
        if self.message:
            data = self.message
            self.message = None
            return data
        return None

# Initialize BLE instance
def init(name="ESP32"):
    return ESP32_BLE(name)
