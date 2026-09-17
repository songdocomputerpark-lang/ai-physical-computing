# https://github.com/dhylands/python_lcd/
#
# [사이트판] AI 피지컬 컴퓨팅 오픈랩이 나눠 주는 i2c_lcd.py(PLAN §6.5, sources.yaml "python_lcd(i2c_lcd.py 사이트 배포본)").
# 교과서 자료의 i2c_lcd.py(HW 라이브러리 묶음, 코드 id f011 — python_lcd의 lcd_api.py와 i2c_lcd.py를 한 파일로 합친 수정본)를
# 줄 끝(CRLF → LF)만 바꿔 그대로 옮기고, 아래 두 가지만 더했어요. 나머지 줄은 한 글자도 고치지 않았어요.
#   1. 원 저장소(dhylands/python_lcd)의 MIT 라이선스 고지(자료판에는 빠져 있었어요)
#   2. move_to = setcursor 한 줄 — 원고(127쪽 LCD 화면 제어 함수)와 기본 1 예제는 move_to, 자료판은 setcursor라 두 이름이 모두 되게
#      (python_lcd 원본의 이름이 move_to예요). 파일 끝 줄바꿈 하나도 더했어요.
# 가상 보드(사이트의 /board/lib)와 실물 ESP32([보드에 저장]·Thonny로 올리기)에 같은 파일을 써요.
#
# The MIT License (MIT)
#
# Copyright (c) 2013 Dave Hylands
#
# Permission is hereby granted, free of charge, to any person obtaining a copy of
# this software and associated documentation files (the "Software"), to deal in
# the Software without restriction, including without limitation the rights to
# use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
# the Software, and to permit persons to whom the Software is furnished to do so,
# subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in all
# copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
# FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
# COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
# IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
# CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
#

"""Provides an API for talking to HD44780 compatible character LCDs.""" 
import time 
class LcdApi: 
    """Implements the API for talking with HD44780 compatible character LCDs. 
    This class only knows what commands to send to the LCD, and not how to get 
    them to the LCD. 
    It is expected that a derived class will implement the hal_xxx functions. 
    """ 
    # The following constant names were lifted from the avrlib lcd.h 
    # header file, however, I changed the definitions from bit numbers 
    # to bit masks. 
    # 
    # HD44780 LCD controller command set 
    LCD_CLR = 0x01              # DB0: clear display 
    LCD_HOME = 0x02             # DB1: return to home position 
    LCD_ENTRY_MODE = 0x04       # DB2: set entry mode 
    LCD_ENTRY_INC = 0x02        # --DB1: increment 
    LCD_ENTRY_SHIFT = 0x01      # --DB0: shift 
    LCD_ON_CTRL = 0x08          # DB3: turn lcd/cursor on 
    LCD_ON_DISPLAY = 0x04       # --DB2: turn display on 
    LCD_ON_CURSOR = 0x02        # --DB1: turn cursor on 
    LCD_ON_BLINK = 0x01         # --DB0: blinking cursor 
    LCD_MOVE = 0x10             # DB4: move cursor/display 
    LCD_MOVE_DISP = 0x08        # --DB3: move display (0-> move cursor) 
    LCD_MOVE_RIGHT = 0x04       # --DB2: move right (0-> left) 
    LCD_FUNCTION = 0x20         # DB5: function set 
    LCD_FUNCTION_8BIT = 0x10    # --DB4: set 8BIT mode (0->4BIT mode) 
    LCD_FUNCTION_2LINES = 0x08  # --DB3: two lines (0->one line) 
    LCD_FUNCTION_10DOTS = 0x04  # --DB2: 5x10 font (0->5x7 font) 
    LCD_FUNCTION_RESET = 0x30   # See "Initializing by Instruction" section 
    LCD_CGRAM = 0x40            # DB6: set CG RAM address 
    LCD_DDRAM = 0x80            # DB7: set DD RAM address 
    LCD_RS_CMD = 0 
    LCD_RS_DATA = 1 
    LCD_RW_WRITE = 0 
    LCD_RW_READ = 1 
    def __init__(self, num_lines, num_columns): 
        self.num_lines = num_lines 
        if self.num_lines > 4: 
            self.num_lines = 4 
        self.num_columns = num_columns 
        if self.num_columns > 40: 
            self.num_columns = 40 
        self.cursor_x = 0 
        self.cursor_y = 0 
        self.implied_newline = False 
        self.backlight = True 
        self.display_off() 
        self.backlight_on() 
        self.clear() 
        self.hal_write_command(self.LCD_ENTRY_MODE | self.LCD_ENTRY_INC) 
        self.hide_cursor() 
        self.display_on() 
    def clear(self): 
        """Clears the LCD display and moves the cursor to the top left 
        corner. 
        """ 
        self.hal_write_command(self.LCD_CLR) 
        self.hal_write_command(self.LCD_HOME) 
        self.cursor_x = 0 
        self.cursor_y = 0 
    def show_cursor(self): 
        """Causes the cursor to be made visible.""" 
        self.hal_write_command(self.LCD_ON_CTRL | self.LCD_ON_DISPLAY | 
                               self.LCD_ON_CURSOR) 
    def hide_cursor(self): 
        """Causes the cursor to be hidden.""" 
        self.hal_write_command(self.LCD_ON_CTRL | self.LCD_ON_DISPLAY) 
    def blink_cursor_on(self): 
        """Turns on the cursor, and makes it blink.""" 
        self.hal_write_command(self.LCD_ON_CTRL | self.LCD_ON_DISPLAY | 
                               self.LCD_ON_CURSOR | self.LCD_ON_BLINK) 
    def blink_cursor_off(self): 
        """Turns on the cursor, and makes it no blink (i.e. be solid).""" 
        self.hal_write_command(self.LCD_ON_CTRL | self.LCD_ON_DISPLAY | 
                               self.LCD_ON_CURSOR) 
    def display_on(self): 
        """Turns on (i.e. unblanks) the LCD.""" 
        self.hal_write_command(self.LCD_ON_CTRL | self.LCD_ON_DISPLAY) 
    def display_off(self): 
        """Turns off (i.e. blanks) the LCD.""" 
        self.hal_write_command(self.LCD_ON_CTRL) 
    def backlight_on(self): 
        """Turns the backlight on. 
        This isn't really an LCD command, but some modules have backlight 
        controls, so this allows the hal to pass through the command. 
        """ 
        self.backlight = True 
        self.hal_backlight_on() 
    def backlight_off(self): 
        """Turns the backlight off. 
        This isn't really an LCD command, but some modules have backlight 
        controls, so this allows the hal to pass through the command. 
        """ 
        self.backlight = False 
        self.hal_backlight_off() 
    def setcursor(self, cursor_x, cursor_y): 
        """Moves the cursor position to the indicated position. The cursor 
        position is zero based (i.e. cursor_x == 0 indicates first column). 
        """ 
        self.cursor_x = cursor_x 
        self.cursor_y = cursor_y 
        addr = cursor_x & 0x3f 
        if cursor_y & 1: 
            addr += 0x40    # Lines 1 & 3 add 0x40 
        if cursor_y & 2:    # Lines 2 & 3 add number of columns 
            addr += self.num_columns 
        self.hal_write_command(self.LCD_DDRAM | addr) 
    # [사이트판] 원고·기본 1 예제의 lcd.move_to(x, y)도 되게 같은 함수에 이름을 하나 더 붙여요(python_lcd 원본 이름).
    move_to = setcursor
    def putchar(self, char): 
        """Writes the indicated character to the LCD at the current cursor 
        position, and advances the cursor by one position. 
        """ 
        if char == '\n': 
            if self.implied_newline: 
                # self.implied_newline means we advanced due to a wraparound, 
                # so if we get a newline right after that we ignore it. 
                pass 
            else: 
                self.cursor_x = self.num_columns 
        else: 
            self.hal_write_data(ord(char)) 
            self.cursor_x += 1 
        if self.cursor_x >= self.num_columns: 
            self.cursor_x = 0 
            self.cursor_y += 1 
            self.implied_newline = (char != '\n') 
        if self.cursor_y >= self.num_lines: 
            self.cursor_y = 0 
        self.setcursor(self.cursor_x, self.cursor_y) 
    def putstr(self, string): 
        """Write the indicated string to the LCD at the current cursor 
        position and advances the cursor position appropriately. 
        """ 
        for char in string: 
            self.putchar(char) 
    def custom_char(self, location, charmap): 
        """Write a character to one of the 8 CGRAM locations, available 
        as chr(0) through chr(7). 
        """ 
        location &= 0x7 
        self.hal_write_command(self.LCD_CGRAM | (location << 3)) 
        self.hal_sleep_us(40) 
        for i in range(8): 
            self.hal_write_data(charmap[i]) 
            self.hal_sleep_us(40) 
        self.setcursor(self.cursor_x, self.cursor_y)
        
    def hal_backlight_on(self): 
        """Allows the hal layer to turn the backlight on. 
        If desired, a derived HAL class will implement this function. 
        """ 
        pass 
    def hal_backlight_off(self): 
        """Allows the hal layer to turn the backlight off. 
        If desired, a derived HAL class will implement this function. 
        """ 
        pass 
    def hal_write_command(self, cmd): 
        """Write a command to the LCD. 
        It is expected that a derived HAL class will implement this 
        function. 
        """ 
        raise NotImplementedError 
    def hal_write_data(self, data): 
        """Write data to the LCD. 
        It is expected that a derived HAL class will implement this 
        function. 
        """ 
        raise NotImplementedError 
    def hal_sleep_us(self, usecs): 
        """Sleep for some time (given in microseconds).""" 
        time.sleep_us(usecs)



"""Implements a HD44780 character LCD connected via PCF8574 on I2C. 
   This was tested with: https://www.wemos.cc/product/d1-mini.html""" 
# from lcd_api import LcdApi 
from machine import I2C 
from time import sleep_ms 
# The PCF8574 has a jumper selectable address: 0x20 - 0x27 
#DEFAULT_I2C_ADDR = 0x20 
# Defines shifts or masks for the various LCD line attached to the PCF8574 
MASK_RS = 0x01 
MASK_RW = 0x02 
MASK_E = 0x04 
SHIFT_BACKLIGHT = 3 
SHIFT_DATA = 4 
class I2cLcd(LcdApi): 
    """Implements a HD44780 character LCD connected via PCF8574 on I2C.""" 
    def __init__(self, i2c, i2c_addr, num_lines, num_columns): 
        self.i2c = i2c 
        self.i2c_addr = i2c_addr 
        self.i2c.writeto(self.i2c_addr, bytearray([0])) 
        sleep_ms(20)   # Allow LCD time to powerup 
        # Send reset 3 times 
        self.hal_write_init_nibble(self.LCD_FUNCTION_RESET) 
        sleep_ms(5)    # need to delay at least 4.1 msec 
        self.hal_write_init_nibble(self.LCD_FUNCTION_RESET) 
        sleep_ms(1) 
        self.hal_write_init_nibble(self.LCD_FUNCTION_RESET) 
        sleep_ms(1) 
        # Put LCD into 4 bit mode 
        self.hal_write_init_nibble(self.LCD_FUNCTION) 
        sleep_ms(1) 
        LcdApi.__init__(self, num_lines, num_columns) 
        cmd = self.LCD_FUNCTION 
        if num_lines > 1: 
            cmd |= self.LCD_FUNCTION_2LINES 
        self.hal_write_command(cmd) 
    def hal_write_init_nibble(self, nibble): 
        """Writes an initialization nibble to the LCD. 
        This particular function is only used during initialization. 
        """ 
        byte = ((nibble >> 4) & 0x0f) << SHIFT_DATA 
        self.i2c.writeto(self.i2c_addr, bytearray([byte | MASK_E])) 
        self.i2c.writeto(self.i2c_addr, bytearray([byte])) 
    def hal_backlight_on(self): 
        """Allows the hal layer to turn the backlight on.""" 
        self.i2c.writeto(self.i2c_addr, bytearray([1 << SHIFT_BACKLIGHT])) 
    def hal_backlight_off(self): 
        """Allows the hal layer to turn the backlight off.""" 
        self.i2c.writeto(self.i2c_addr, bytearray([0])) 
    def hal_write_command(self, cmd): 
        """Writes a command to the LCD. 
        Data is latched on the falling edge of E. 
        """ 
        byte = ((self.backlight << SHIFT_BACKLIGHT) | (((cmd >> 4) & 0x0f) << SHIFT_DATA)) 
        self.i2c.writeto(self.i2c_addr, bytearray([byte | MASK_E])) 
        self.i2c.writeto(self.i2c_addr, bytearray([byte])) 
        byte = ((self.backlight << SHIFT_BACKLIGHT) | ((cmd & 0x0f) << SHIFT_DATA)) 
        self.i2c.writeto(self.i2c_addr, bytearray([byte | MASK_E])) 
        self.i2c.writeto(self.i2c_addr, bytearray([byte])) 
        if cmd <= 3: 
            # The home and clear commands require a worst case delay of 4.1 msec 
            sleep_ms(5) 
    def hal_write_data(self, data): 
        """Write data to the LCD.""" 
        byte = (MASK_RS | (self.backlight << SHIFT_BACKLIGHT) | (((data >> 4) & 0x0f) << SHIFT_DATA)) 
        self.i2c.writeto(self.i2c_addr, bytearray([byte | MASK_E])) 
        self.i2c.writeto(self.i2c_addr, bytearray([byte])) 
        byte = (MASK_RS | (self.backlight << SHIFT_BACKLIGHT) | ((data & 0x0f) << SHIFT_DATA)) 
        self.i2c.writeto(self.i2c_addr, bytearray([byte | MASK_E])) 
        self.i2c.writeto(self.i2c_addr, bytearray([byte]))
