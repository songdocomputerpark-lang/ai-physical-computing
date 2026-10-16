# 불꽃이 3번 연속(약 0.3초) 감지되면 '화재 경보!'를 울려요. 잠깐 스치는 빛은 무시해요.
# 내장 LED(GPIO 2)가 빠르게 깜빡이고 LCD 에 FIRE ALERT! 가 나와요. 불꽃이 없어진 지 3초가 지나면 경보가 꺼져요.
from machine import Pin
from machine import SoftI2C
from i2c_lcd import I2cLcd
from time import sleep_ms, ticks_ms, ticks_diff

fire = Pin(23, Pin.IN)
led = Pin(2, Pin.OUT)
# LCD(I2C 주소 0x20): SDA → GPIO 21, SCL → GPIO 22 (센서 값을 화면에도 보여 줘요)
i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)
lcd.clear()

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])
hits = 0
alarm = False
last_seen = 0
last_blink = ticks_ms()
print('화재 경보기 시작')
show(0, 'Fire alarm')
show(1, 'Safe')

while True:
    if fire.value() == 1:
        hits += 1
        last_seen = ticks_ms()
        if hits >= 3 and not alarm:
            alarm = True
            print('화재 경보! 불꽃이 감지됐어요!')
            show(1, 'FIRE ALERT!')
        elif not alarm:
            show(1, 'Checking {}/3'.format(hits))
    else:
        hits = 0
        if alarm and ticks_diff(ticks_ms(), last_seen) > 3000:
            alarm = False
            led.value(0)
            print('불꽃이 없어졌어요. 경보 끝')
        if not alarm:
            show(1, 'Safe')

    if alarm and ticks_diff(ticks_ms(), last_blink) > 100:
        led.value(not led.value())
        last_blink = ticks_ms()
    sleep_ms(100)
