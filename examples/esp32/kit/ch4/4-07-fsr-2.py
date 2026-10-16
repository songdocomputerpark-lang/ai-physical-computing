# 한 번 누를 때 가장 세게 눌렀던 값을 기억했다가, 손가락을 뗄 때 알려 줘요.
# 세기는 약함/보통/세게 로 나눠요. 눌리는 동안 내장 LED(GPIO 2)가 켜지고 LCD 에도 보여요. 배선은 1단계와 같아요.
from machine import Pin, ADC
from machine import SoftI2C
from i2c_lcd import I2cLcd
from time import sleep_ms

fsr = ADC(Pin(32))
fsr.atten(ADC.ATTN_11DB)
led = Pin(2, Pin.OUT)
# LCD(I2C 주소 0x20): SDA → GPIO 21, SCL → GPIO 22 (센서 값을 화면에도 보여 줘요)
i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)
lcd = I2cLcd(i2c, 0x20, 2, 16)
lcd.clear()

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])
TOUCH = 300          # 이 값보다 크면 '눌렀다'고 봐요
peak = 0
pressing = False
count = 0
print('센서를 눌러 보세요 (뗄 때 최대 힘을 알려 줘요)')
show(0, 'Press the FSR')
show(1, 'Waiting...')

while True:
    v = fsr.read()
    if v > TOUCH:
        pressing = True
        if v > peak:
            peak = v
        show(0, 'Now {} Max {}'.format(v, peak))
    elif pressing:                      # 막 손가락을 뗐다
        pressing = False
        count += 1
        if peak < 1000:
            word, eng = '약하게', 'Light'
        elif peak < 2500:
            word, eng = '보통으로', 'Medium'
        else:
            word, eng = '세게', 'HARD'
        print(count, '번째:', word, '눌렀어요 (최대', peak, ')')
        show(0, 'Peak {}'.format(peak))
        show(1, '#{} {}'.format(count, eng))
        peak = 0
    led.value(1 if pressing else 0)
    sleep_ms(30)
