from machine import Pin
from neopixel import NeoPixel
from time import sleep

NUM_OF_LED = 16
np = NeoPixel(Pin(23), NUM_OF_LED)

while True:
    for i in range(16):
        np[i] = (100, 0, 0)
        np.write()  # [사이트판] 색을 정한 뒤 바로 보내야 0번부터 한 칸씩 차례로 켜져요
        sleep(0.1)
    for i in range(15, -1, -1):
        np[i] = (0, 0, 0)
        np.write()
        sleep(0.1)
        
