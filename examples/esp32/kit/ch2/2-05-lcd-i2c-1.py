# I2C LCD 기본 동작 테스트 — 기능을 하나씩 천천히 보여 주고, 마지막 글자는 화면에 남겨 둡니다.
# 배선: SDA → GPIO 21, SCL → GPIO 22, VCC → 5V (LCD 주소 0x20). LCD 에는 영문·숫자만 나와요.
from machine import Pin, SoftI2C
from i2c_lcd import I2cLcd
from time import sleep

i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)      # 브릭셀 LCD 주소 = 0x20
print('LCD 테스트 시작 (SDA → GPIO 21, SCL → GPIO 22)')

lcd.clear()
lcd.putstr('Hello world')            # 1) 첫 줄에 글자 쓰기
print('1) Hello world 표시')
sleep(2)

lcd.setcursor(2, 1)                  # 2) 커서를 둘째 줄 3번째 칸으로 (x=2, y=1)
lcd.putstr('x=2, y=1')
print('2) 둘째 줄 3번째 칸에 표시')
sleep(2)

lcd.backlight_off()                  # 3) 백라이트 끄기
print('3) 백라이트 끔')
sleep(1)
lcd.backlight_on()                   # 4) 백라이트 켜기
print('4) 백라이트 켬')
sleep(1)

lcd.clear()                          # 5) 화면 지우기
print('5) 화면 지움')
sleep(1)

lcd.putstr('Hello Brixel!')          # 6) 마지막 글자는 지우지 않고 남겨 둔다
lcd.setcursor(0, 1)
lcd.putstr('LCD OK')
print('6) 끝 — 화면에 Hello Brixel! / LCD OK 가 남아 있으면 성공')
