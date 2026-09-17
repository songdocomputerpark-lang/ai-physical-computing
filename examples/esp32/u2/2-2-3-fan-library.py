1  from gorillacell_dcmotors import GORILLACELL_DCMOTORS
2  import time
3
4  fan = GORILLACELL_DCMOTORS(25, 26)
5
6  fan.rotate('cw')
7  time.sleep(2)
8
9  fan.rotate('ccw')
10 time.sleep(2)
11
12 fan.stop()
13 time.sleep(2)