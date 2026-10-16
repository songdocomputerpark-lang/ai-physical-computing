# 손가락을 올리고 있으면 심장이 뛸 때마다 LED 가 깜빡이고 1분당 심박수를 알려 줘요.
# 배선은 1단계와 같아요. 손가락을 움직이지 않고 10초쯤 기다려 보세요.
from machine import Pin, SoftI2C
from i2c_lcd import I2cLcd
from max30105 import MAX30105, HeartBeat
from time import ticks_ms, ticks_diff

i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=100000)
lcd = I2cLcd(i2c, 0x20, 2, 16)      # 브릭셀 LCD (주소 0x20, 영문·숫자만 나와요)

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])

lcd.clear()
sensor = MAX30105(i2c, 0x57)
sensor.setup_sensor()
sensor.setPulseAmplitudeRed(0x0A)
sensor.setPulseAmplitudeGreen(0x00)
beat = HeartBeat()
led = Pin(2, Pin.OUT)    # 보드 내장 LED

rates = [0] * 4
spot = 0
filled = 0
last_beat = ticks_ms()
show(0, 'Heart Rate')
show(1, 'Put finger')
print('심박수 재기 시작! 손가락을 센서 위에 올려 주세요.')
while True:
    for p in range(32):
        red, ir, green = sensor.read_sensor_multiLED(p)
        if red < 40000:                     # 손가락이 없을 때는 처음부터 다시
            rates = [0] * 4
            spot = 0
            filled = 0
            last_beat = ticks_ms()
            led.off()
        elif beat.checkForBeat(int(ir)):
            now = ticks_ms()
            bpm = 60000 / ticks_diff(now, last_beat)
            last_beat = now
            if 20 < bpm < 255:
                rates[spot] = bpm
                spot = (spot + 1) % 4
                filled = min(filled + 1, 4)
                avg = int(sum(rates) / filled)
                print('심박수:', avg, '번/분')
                show(1, '{} BPM'.format(avg))
                led.value(not led.value())
    if red < 40000:
        print('손가락을 센서 위에 올려 주세요.')
        show(1, 'Put finger')
