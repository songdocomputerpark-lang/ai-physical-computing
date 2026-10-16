from machine import Pin, ADC, SoftI2C
from i2c_lcd import I2cLcd
from time import sleep_ms, ticks_ms, ticks_diff

adc = ADC(Pin(32))
adc.atten(ADC.ATTN_11DB)     # 0~3.3V 까지 읽기 (값 0~4095)
# LCD(I2C 주소 0x20): SDA → GPIO 21, SCL → GPIO 22
i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)
lcd.clear()

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])

def read_mv(n=1):                    # n번 읽은 평균을 mV(밀리볼트)로 돌려줌
    total = 0
    for i in range(n):
        total += adc.read()
        sleep_ms(5)
    raw = total // n
    return raw, raw * 3300 // 4095

# 피에조 진동 센서의 값을 읽어요. S 선은 GPIO 32 에 꽂았어요.
# 센서 근처 책상을 톡톡 두드리면 값이 순간 튀어 올라요.
# 순간적이라 읽는 사이에 놓칠 수 있어서, 아주 짧은 간격으로 읽어요.
print('진동 센서 테스트 시작 (S → GPIO 32)')
show(0, 'Vibration')

while True:
    raw = adc.read()
    print('진동 값:', raw)
    show(1, 'Value: {}'.format(raw))
    sleep_ms(100)
