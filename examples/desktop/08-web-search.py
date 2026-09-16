import webbrowser
import time
import pyautogui

webbrowser.open("https://www.google.com/")
time.sleep(1)

pyautogui.typewrite("PYAUTOGUI tutorial\n",interval=0.1)
pyautogui.enter('enter')