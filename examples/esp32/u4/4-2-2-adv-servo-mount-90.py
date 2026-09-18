from machine import Pin, SoftI2C, PWM
from time import sleep
from mg90s_servo import MG90S_SERVO, map 

# 서보모터 (X: 25번, Y: 26번)
servo_x = MG90S_SERVO(signal_pin=25)
servo_y = MG90S_SERVO(signal_pin=26)


servo_x.rotate(90)
servo_y.rotate(90)