import pyautogui
import time

time.sleep(5)

for i in range(10):
    pyautogui.typewrite("hello, world!\n",interval=0.1)
    time.sleep(1)

pyautogui.hotkey('ctrl','s')