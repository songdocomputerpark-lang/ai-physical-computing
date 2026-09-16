import pyautogui
import os
import time

def screenshot_slideshow(count=5, delay=2):
    folder = "screenshots"
    os.makedirs(folder, exist_ok=True)
    for i in range(count):
        screenshot = pyautogui.screenshot()
        file_path = os.path.join(folder, f"screenshot_{i + 1}.png")
        screenshot.save(file_path)
        print(f"Saved: {file_path}")
        time.sleep(delay)
    print("All screenshots captured!")

screenshot_slideshow()
