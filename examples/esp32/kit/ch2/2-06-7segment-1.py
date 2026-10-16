# 4자리 7세그먼트 테스트 - 숫자·시계·글자·온도 모양을 차례로 보여요
# 배선: DIO → GPIO 21, CLK → GPIO 22
from machine import Pin
from tm1637 import TM1637
from time import sleep

tm = TM1637(clk=Pin(22), dio=Pin(21))

print('7세그먼트 테스트 시작 (DIO → GPIO 21, CLK → GPIO 22)')
while True:
    print('숫자 1234')
    tm.number(1234)
    sleep(1)
    print('시계 모양 12:34')
    tm.numbers(12, 34, True)
    sleep(1)
    print('글자 abcd')
    tm.show('abcd')
    sleep(1)
    print('온도 25')
    tm.temperature(25)
    sleep(1)
    print('밝기 0 → 7')
    for level in range(8):
        tm.brightness(level)
        tm.number(8888)
        sleep(0.25)
