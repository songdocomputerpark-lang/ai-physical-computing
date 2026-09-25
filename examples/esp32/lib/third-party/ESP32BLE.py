# [사이트가 붙인 고지] 아래 코드는 교과서·수업 자료의 ESP32BLE.py를 한 글자도 고치지 않고 옮겼어요.
# 구조가 비슷한 공개 구현 2black0/MicroPython-ESP32-BLE(https://github.com/2black0/MicroPython-ESP32-BLE)의
# MIT 고지를 함께 실어요. 이 파일이 그 구현에서 왔는지는 확인하지 못했어요 — 만약 그렇다면 지켜야 할 고지를
# 빠뜨리지 않으려는 것이에요(AI 피지컬 컴퓨팅 오픈랩, DECISIONS C12).
#
# MIT License
#
# Copyright (c) 2021 Ardy Seto
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in all
# copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
# SOFTWARE.
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
