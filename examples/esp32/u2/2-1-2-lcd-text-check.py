from machine import Pin
from machine import SoftI2C
from i2c_lcd import I2cLcd
from time import sleep_ms

i2c = SoftI2C(scl=Pin(22), sda=Pin(21),\
              freq=400000) 
lcd = I2cLcd(i2c, 0x20, 2, 16)
lcd.clear()

lcd.putstr('Hello LCD!')

'''
# 2. To clear the display:
lcd.clear()
# 3. To control the cursor position:
lcd.setcursor(2,1) 
# 4. To show the cursor:
lcd.show_cursor()
# 5. To hide the cursor:
lcd.hide_cursor()
# 6. To set the cursor to blink:
lcd.blink_cursor_on()
# 7. To stop the cursor on blinking:
lcd.blink_cursor_off()
# 8. To hide the currently displayed character:
lcd.display_off()
# 9. To show the currently hidden character:
lcd.display_on()
# 10. To turn off the backlight:
lcd.backlight_off()
# 11. To turn ON the backlight:
lcd.backlight_on()
# 12. To print a single character:
lcd.putchar('x')
# 13. To print a custom character:
happy = bytearray([0x00,0x0A,0x00,0x04,0x00,0x11,0x0E,0x00])
lcd.custom_char(0, happy)
lcd.putchar(chr(0))
'''
