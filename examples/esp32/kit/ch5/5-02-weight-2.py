# 저울 위에 물건이 올라왔는지 알아내고, 가장 무거웠던 무게(최대)를 기억해요.
# BOOT 버튼(실드의 작은 버튼)을 누르면 지금 무게를 0으로 맞춰요(그릇 무게 빼기). 배선은 1단계와 같아요.
from machine import Pin, SoftI2C
from i2c_lcd import I2cLcd
from time import sleep_ms

# 무게 모듈은 100kHz 로 읽어야 안전해요. LCD 도 같은 I2C 선을 같이 써요.
i2c = SoftI2C(scl=Pin(22), sda=Pin(21), freq=100000)
lcd = I2cLcd(i2c, 0x20, 2, 16)      # 브릭셀 LCD (주소 0x20, 영문·숫자만 나와요)
lcd.clear()
WEIGHT_ADDR = 0x63                  # 무게 모듈 주소 (모듈 뒷면 'I2C addr: 0x63')

def show(row, text):                 # LCD 한 줄(16칸)을 덮어써서 깜빡임 없이 갱신
    lcd.setcursor(0, row)
    lcd.putstr((text + ' ' * 16)[:16])

def read_weight():
    # 모듈이 [상태 0xFF, 상위 바이트, 하위 바이트] 3바이트를 보내요. 무게(g) = 상위 x 256 + 하위
    # 대답이 없거나 모양이 틀리면 -1 을 돌려줘요.
    try:
        data = i2c.readfrom(WEIGHT_ADDR, 3)
    except OSError:
        return -1
    if data[0] != 0xFF:
        return -1
    return data[1] * 256 + data[2]

boot = Pin(0, Pin.IN, Pin.PULL_UP)  # BOOT 버튼 (누르면 0)
led = Pin(2, Pin.OUT)               # 보드 내장 LED (물건이 올라오면 켜져요)
LIMIT = 20                          # 이 무게(g)보다 무거우면 '물건이 올라왔다'고 봐요

zero = max(0, read_weight())        # 시작할 때의 무게를 0으로 삼아요
biggest = 0
on_scale = False
print('저울 시작! 물건을 올려 보세요 (BOOT = 영점 맞추기)')
show(0, 'Scale ready')

while True:
    if boot.value() == 0:
        w = read_weight()
        if w >= 0:
            zero = w
            biggest = 0
            print('영점을 다시 맞췄어요 (그릇 무게', w, 'g 빼기)')
            show(0, 'Zero set')
        while boot.value() == 0:
            sleep_ms(20)
    w = read_weight()
    if w < 0:
        print('무게 센서가 대답하지 않아요')
        show(1, 'No response')
        led.value(0)
        sleep_ms(300)
        continue
    net = w - zero
    if net > biggest:
        biggest = net
    if net > LIMIT and not on_scale:
        on_scale = True
        print('물건이 올라왔어요!', net, 'g')
    elif net <= LIMIT and on_scale:
        on_scale = False
        print('물건을 내렸어요. 지금까지 최대:', biggest, 'g')
    led.value(1 if on_scale else 0)
    print('지금', net, 'g  (최대', biggest, 'g)')
    show(0, 'Now {} g'.format(net))
    show(1, 'Max {} g {}'.format(biggest, 'ON' if on_scale else ''))
    sleep_ms(300)
