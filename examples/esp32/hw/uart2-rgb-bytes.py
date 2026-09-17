from machine import Pin
from machine import PWM
from time import sleep
from machine import UART

uart=UART(2, baudrate=9600, tx=17, rx=16)
#uart=UART(1, baudrate=9600, tx=1, rx=3)
uart.init(9600, bits=8, parity=None, stop=1)

#핀설정
r = Pin(23, Pin.OUT)
g = Pin(25, Pin.OUT)
b = Pin(26, Pin.OUT)

def set_rgb(x, y, z):
    r.value(x)
    g.value(y)
    b.value(z)
    
def rst_rgb():
     r.off()
     g.off()
     b.off()
     
uart.write("hello world")     
    

while True:
   if uart.any() > 0:
        data = uart.read()
        #data = ord(r_data) # ord는 문자의 ASCII 코드를 반환
        data = data[0]
        print(data)
                   
    
        if data ==1:
            set_rgb(1, 1, 1)
        if data ==2:
            set_rgb(1, 0, 0)
        if data ==3:
            set_rgb(0, 1, 0)
        if data ==4:
            set_rgb(0, 0, 1)
          
        
    
