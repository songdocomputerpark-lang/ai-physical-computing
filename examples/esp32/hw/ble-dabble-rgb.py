from machine import Pin
from machine import PWM
from esp32_ble_util import BLESimplePeripheral
from bluetooth import BLE
from time import sleep_ms

ble = BLESimplePeripheral(ble=BLE(), name="esp32ble")

isNewData = False
bleData = ""

def ble_cb(payload):
    #print("RX", payload)
    global isNewData
    global bleData
    isNewData = True
    bleData = payload

ble.on_write(ble_cb)

red = PWM(Pin(25))
grn = PWM(Pin(26))
blu = PWM(Pin(27))
red.freq(65535)
grn.freq(65535)
blu.freq(65535)
red.duty_u16(0)
grn.duty_u16(0)
blu.duty_u16(0)
RGB_PWM_BRIGHTNESS = 65535

while True:
    if ble.is_connected():
        if isNewData:
            isNewData = False
            msg = bleData
            print(msg)

            if ( msg[0] == 0xFF and
                 msg[1] == 0x02 and
                 msg[2] == 0x01 and
                 msg[3] == 0x01 ):
                buf = msg[5:-1]
                buf = buf.decode('UTF-8')
                print(buf)
                if '1' in buf:
                    print('red')
                    red.duty_u16(RGB_PWM_BRIGHTNESS)
                    grn.duty_u16(0)
                    blu.duty_u16(0)
                elif '2' in buf:
                    print('grn')
                    red.duty_u16(0)
                    grn.duty_u16(RGB_PWM_BRIGHTNESS)
                    blu.duty_u16(0)
                elif '3' in buf:
                    print('blu')
                    red.duty_u16(0)
                    grn.duty_u16(0)
                    blu.duty_u16(RGB_PWM_BRIGHTNESS)
    sleep_ms(100)