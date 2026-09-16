import pyautogui
import math

def draw_star():
    pyautogui.moveTo(500, 500)
    for _ in range(5):
        pyautogui.dragRel(100, 0, duration=0.5)  # 오른쪽으로 이동
        pyautogui.dragRel(-50, -87, duration=0.5)  # 왼쪽 위로 이동
        pyautogui.dragRel(-50, 87, duration=0.5)  # 왼쪽 아래로 이동

draw_star()

