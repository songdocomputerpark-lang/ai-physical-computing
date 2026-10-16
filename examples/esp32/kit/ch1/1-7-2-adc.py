from machine import Pin, ADC
from time import sleep

adc = ADC(Pin(32, Pin.IN))
adc.atten(ADC.ATTN_11DB)    # 전체 범위 0~3.3V
adc.width(ADC.WIDTH_12BIT)  # 12비트 해상도 (0~4095)

# 1초마다 아날로그 값 읽어서 전압으로 변환
while True:
    value = adc.read()       # 0~4095
    voltage = value * 3.3 / 4095
    print(f"ADC: {value:4d}, Voltage: {voltage:.2f}V")
    sleep(1)
