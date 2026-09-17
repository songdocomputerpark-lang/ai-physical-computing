from machine import Pin
from neopixel import NeoPixel
from time import sleep

NUM_OF_LED=16
np=NeoPixel(Pin(23),NUM_OF_LED)

while True:
    for i in range(16):
        np[i]=(255,0,0)
        np.write()
        sleep(0.1)
    for i in range(15,-1,-1):
        np[i]=(255,94,0)
        np.write()
        sleep(0.1)
    for i in range(16):
        np[i]=(255,228,0)
        np.write()
        sleep(0.1)
    for i in range(15,-1,-1):
        np[i]=(0,255,0)
        np.write()
        sleep(0.1)
    for i in range(16):
        np[i]=(0,0,255)
        np.write()
        sleep(0.1)
    for i in range(15,-1,-1):
        np[i]=(0,0,75)
        np.write()
        sleep(0.1)
    for i in range(16):
        np[i]=(95,0,255)
        np.write()
        sleep(0.1)
        
        
