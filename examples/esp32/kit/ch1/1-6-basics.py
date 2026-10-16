from machine import Pin, ADC, PWM, UART, SPI, I2C
from time import sleep, sleep_ms, sleep_us

# Variables
x = 3          # integer
x = 3.1416     # float
x = "Hello"    # string
x = True       # boolean

# If statement
if x > 5:
    print("big")
elif x > 2:
    print("medium")
else:
    print("small")

# For loop
for i in range(10):
    print(i)

# While loop
while True:
    # your code here
    break

# Function
def my_function(param1, param2):
    return param1 + param2
