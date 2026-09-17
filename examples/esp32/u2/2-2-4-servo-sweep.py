from machine import Pin
import time
from servo_library import ServoMotor

servo_1 = ServoMotor(signal_pin=25)

for angle in range(0, 181, 1):
    servo_1.rotate(angle)
    time.sleep(0.01)

for angle in range(180, -1, -1):
    servo_1.rotate(angle)
    time.sleep(0.01)