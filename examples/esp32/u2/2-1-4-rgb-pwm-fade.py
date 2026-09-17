from machine import Pin
from machine import PWM
from time import sleep

r = PWM(Pin(27))
g = PWM(Pin(32))
b = PWM(Pin(33))

r.duty(0)
g.duty(0)
b.duty(0)

while True:
     for i in range(1024): 
          r.duty(i)
          g.duty(0)
          b.duty(0)
          sleep(0.001)
     for i in range(1023, -1, -1): 
          r.duty(i)
          g.duty(0)
          b.duty(0)
          sleep(0.001)
 



