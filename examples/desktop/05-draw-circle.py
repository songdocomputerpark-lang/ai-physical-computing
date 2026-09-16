import pyautogui
import math

def draw_circle(radius, center_x=500, center_y=500):
    for angle in range(0, 360, 5):
        x = center_x + radius * math.cos(math.radians(angle))
        y = center_y + radius * math.sin(math.radians(angle))
        pyautogui.moveTo(x, y, duration=0.01)

draw_circle(100)
