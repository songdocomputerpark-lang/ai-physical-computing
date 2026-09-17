from gorillacell_dcmotors import GORILLACELL_DCMOTORS
import time

fan = GORILLACELL_DCMOTORS(25, 26)

while True:
    fan.stop()
    time.sleep(2)

    fan.rotate('cw', speed=30)
    time.sleep(2)

    fan.rotate('cw', speed=70)
    time.sleep(2)