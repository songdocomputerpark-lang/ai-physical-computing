# 16x8 도트 매트릭스(SPI) 테스트 - 글자·테두리·흐르는 글자를 보여 줘요
# 배선: DIN → GPIO 23, CLK → GPIO 25, CS → GPIO 26
from machine import Pin, SPI
from max7219 import Max7219
from time import sleep

spi = SPI(1, baudrate=10000000, polarity=1, phase=0,
          sck=Pin(25), mosi=Pin(23))
cs = Pin(26, Pin.OUT)
display = Max7219(16, 8, spi, cs, False)
display.brightness(8)

print('16x8 도트 매트릭스 테스트 시작 (DIN → 23, CLK → 25, CS → 26)')
while True:
    print('글자 Hi')
    display.fill(0)
    display.text('Hi', 0, 0, 1)
    display.show()
    sleep(1)
    print('테두리')
    display.fill(0)
    display.rect(0, 0, 16, 8, 1)
    display.show()
    sleep(1)
    print('흐르는 글자')
    display.marquee('Hello world')
