# 8x8 도트 매트릭스(SPI) 테스트 - 글자·테두리·전체 켜기를 보여 줘요
# 배선: DIN → GPIO 23, CLK → GPIO 25, CS → GPIO 26
from machine import Pin, SPI
from max7219 import Max7219
from time import sleep

spi = SPI(1, baudrate=10000000, polarity=1, phase=0,
          sck=Pin(25), mosi=Pin(23))
cs = Pin(26, Pin.OUT)
display = Max7219(8, 8, spi, cs, True)
display.brightness(8)

print('8x8 도트 매트릭스 테스트 시작 (DIN → 23, CLK → 25, CS → 26)')
while True:
    for ch in 'ABC123':
        display.fill(0)
        display.text(ch, 0, 0, 1)
        display.show()
        print('글자:', ch)
        sleep(0.7)
    print('테두리')
    display.fill(0)
    display.rect(0, 0, 8, 8, 1)
    display.show()
    sleep(1)
    print('전체 켜기 (안 켜지는 점이 있는지 확인)')
    display.fill(1)
    display.show()
    sleep(1)
