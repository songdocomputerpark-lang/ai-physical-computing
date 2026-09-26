from buzzer import *
from time import sleep_ms

bu = BUZZER(15)

while True:
    bu.play(jingle, 100)
