from machine import Pin
import time
from servo_library import ServoMotor

servo_1 = ServoMotor(signal_pin=25)
servo_2 = ServoMotor(signal_pin=26)

while True:
    servo_1.rotate(0)
    servo_2.rotate(0)
    time.sleep(1)

    servo_1.rotate(180)
    servo_2.rotate(180)
    time.sleep(1)
