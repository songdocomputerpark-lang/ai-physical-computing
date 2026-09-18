from machine import Pin, UART
import time

laser = Pin(18, Pin.OUT)
uart = UART(2, baudrate=115200, tx=16, rx=17)  

while True:
    if uart.any():
        data = uart.readline().decode().strip()
        if data == 'a':
            laser.on()
            sleep(1)
        elif data == 'b':
            laser.off()
            sleep(1)
