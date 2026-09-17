from machine import Pin
from time import sleep

touch = Pin(17, Pin.IN)

while True:
    print("Touch value:", touch.value())
    sleep(0.2)
    
    