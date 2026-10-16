from machine import Pin, SoftI2C
from i2c_lcd import I2cLcd
from time import sleep_ms, ticks_ms, ticks_diff

# LCD(I2C 주소 0x20): SDA → GPIO 21, SCL → GPIO 22
i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)
lcd.clear()

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])

# 물이 차면 보드 LED(GPIO 2)를 깜빡여 '넘침 경고'를 하고, 수위가 바뀐 시각과 유지 시간을 기록해요.
# WET 은 '물이 찼을 때' 센서가 주는 값이에요. 반대로 나오면 0 으로 바꾸세요.
sensor = Pin(23, Pin.IN)
led = Pin(2, Pin.OUT)
WET = 1
last = sensor.value()            # 지금 상태
t0 = ticks_ms()                  # 프로그램을 켠 시각
t_change = t0                    # 마지막으로 상태가 바뀐 시각
changes = 0
history = []                     # [(바뀐 시각(초), 새 값), ...] 최근 5개만 기억
print('넘침 경고 + 상태 변화 기록 시작!')

while True:
    v = sensor.value()
    sleep_ms(30)
    if v == sensor.value() and v != last:          # 30ms 동안 같은 값이면 진짜 변화(떨림 무시)
        now = ticks_ms()
        held = ticks_diff(now, t_change) // 1000
        changes += 1
        last = v
        t_change = now
        history.append((ticks_diff(now, t0) // 1000, v))
        history = history[-5:]
        print('수위 변화!', '→ 물이 찼어요' if v == WET else '→ 물이 낮아졌어요', '/ 앞 상태 유지:', held, '초')
        print('최근 기록 (켠 뒤 몇 초, 값):', history)
    if last == WET:
        led.value(not led.value())                  # 깜빡깜빡 = 넘침 경고
        show(0, 'FULL! OVERFLOW')
    else:
        led.off()
        show(0, 'Water low  OK')
    show(1, 'Chg {} Hold {}s'.format(changes, ticks_diff(ticks_ms(), t_change) // 1000))
    sleep_ms(200)
