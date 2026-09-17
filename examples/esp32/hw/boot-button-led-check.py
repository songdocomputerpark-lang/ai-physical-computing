from machine import Pin
from time import sleep
led = Pin(2, Pin.OUT)
sw = Pin(0, Pin.IN)

while True:
    
   if (sw.value() == 0):
       led.on()
   else:
       led.off()
#     led.on()
#     sleep(1)
#     led.off()
#     sleep(1)