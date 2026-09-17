from gorillacell_dcmotors import GORILLACELL_DCMOTORS
import time

fan = GORILLACELL_DCMOTORS(25, 26)

fan.rotate('cw')
time.sleep(2)

fan.rotate('ccw')
time.sleep(2)

fan.stop()
time.sleep(2)
