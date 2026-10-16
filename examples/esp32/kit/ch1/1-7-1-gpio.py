from machine import Pin
from time import sleep

# GPIO Output: LED (GPIO 2)
led = Pin(2, Pin.OUT)

# GPIO Input: Boot 버튼 (GPIO 0)
button = Pin(0, Pin.IN)

# 버튼을 누르면 LED 켜짐, 떼면 꺼짐
while True:
    if button.value() == 0:   # 버튼 눌림 (LOW)
        led.on()
        print("Button pressed - LED ON")
    else:
        led.off()
        print("Button released - LED OFF")
    sleep(0.1)
