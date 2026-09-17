from machine import Pin
from time import sleep

r=Pin(27,Pin.OUT)
g=Pin(32,Pin.OUT)
b=Pin(33,Pin.OUT)

led=[r,g,b]
while True:
    for x in range(3):
        print(x)
        led[x].on()
        sleep(0.2)
        led[x].off()
        sleep(0.2)