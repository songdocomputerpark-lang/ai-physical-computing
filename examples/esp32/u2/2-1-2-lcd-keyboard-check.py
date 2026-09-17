from machine import Pin
from machine import SoftI2C
from i2c_lcd import I2cLcd
from time import sleep_ms

i2c = SoftI2C(scl=Pin(22), sda=Pin(21),\
              freq=400000) 
lcd = I2cLcd(i2c, 0x20, 2, 16)

lcd.clear()

name = input("name: ")
lcd.putstr("Hello, " + name)
