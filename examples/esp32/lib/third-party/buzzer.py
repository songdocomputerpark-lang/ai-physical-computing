# [사이트판] AI 피지컬 컴퓨팅 오픈랩이 나눠 주는 buzzer.py(PLAN §6.5, CODE_MAPPING §2.8·§3.10·§5.2 코드 id f008).
# 교과서 자료의 buzzer.py(HW 라이브러리 묶음)를 줄 끝(CRLF → LF)만 바꿔 옮기고, 아래 두 가지만 바꿨어요.
# 나머지 줄은 한 글자도 고치지 않았어요.
#   1. 게임 음악 선율 데이터(mario 목록 — 원본 128~141번 줄의 설명 주석 2줄과 목록)를 지우고 그 자리에
#      "# [사이트판] 게임 음악 선율 데이터 제외" 한 줄을 두었어요. 원작 게임의 음악을 사이트가 다시 나눠 주지 않으려는 거예요.
#      징글벨(jingle)과 반짝반짝 작은 별(twinkle), 음 이름(C4 = 262 등), BUZZER의 play()·tone()은 그대로예요.
#   2. 파일 끝 줄바꿈 하나를 더했어요.
# 원본 파일은 공개하지 않는 자료 저장소에만 있어요.
# 출처: TechToTinker "038 - MicroPython TechNotes: Buzzer"(George Bantique, 2021-06-09)의 GORILLACELL_BUZZER와 같은 계열
# 코드를 duty() 대신 duty_u16()으로 고친 판으로 보여요(부분 확인). 글에 저작권·라이선스 표기가 없어 원 권리는 원 저작자에게 있어요
# (운영자 사용 허락 O5, 사이트 라이선스 적용 제외 — 출처 등록부 sources.yaml).
# 쓰는 법(교과서 156~157쪽): from buzzer import * → bu = BUZZER(15) → bu.play(jingle, 100). 음 하나는 bu.tone(C4, 500).
# 가상 보드(사이트의 /board/lib)와 실물 ESP32([보드에 저장]·[실제 보드]로 실행·Thonny로 올리기)에 같은 파일을 써요.
from machine import Pin
from machine import PWM
from time import sleep_ms

class BUZZER: 
    def __init__(self, sig_pin):
        self.pwm = PWM(Pin(sig_pin),duty_u16=0)      
        
    def play(self, melodies, wait, duty=32767):
        for note in melodies:
            if note != 0:
                self.pwm.freq(note)
            self.pwm.duty_u16(duty)
            sleep_ms(wait)
        # Disable the pulse, setting the duty to 0
        self.pwm.duty_u16(0)
        # Disconnect the pwm driver
        #self.pwm.deinit() # remove to play the next melodies
        
    def tone(self, notes, wait, duty=32767):
        self.pwm.freq(notes)
        self.pwm.duty_u16(duty)
        sleep_ms(wait)
        self.pwm.duty_u16(0)

# Notes and its equivalent frequency
           # Octave 0 ********************
B0  = 31   # B
           # Octave 1 ********************
C1  = 33   # C
CS1 = 35   # C#/Db
D1  = 37   # D
DS1 = 39   # D#/Eb
E1  = 41   # E
F1  = 44   # F
FS1 = 46   # F#/Gb
G1  = 49   # G
GS1 = 52   # G#/Ab
A1  = 55   # A
AS1 = 58   # A#/Bb
B1  = 62   # B
           # Octave 2 ********************
C2  = 65   # C
CS2 = 69   # C#/Db
D2  = 73   # D
DS2 = 78   # D#/Eb
E2  = 82   # E
F2  = 87   # F
FS2 = 93   # F#/Gb
G2  = 98   # G
GS2 = 104  # G#/Ab
A2  = 110  # A
AS2 = 117  # A#/Bb
B2  = 123  # B
           # Octave 3 ********************
C3  = 131  # C
CS3 = 139  # C#/Db
D3  = 147  # D
DS3 = 156  # D#/Eb
E3  = 165  # E
F3  = 175  # F
FS3 = 185  # F#/Gb
G3  = 196  # G
GS3 = 208  # G#/Ab
A3  = 220  # A
AS3 = 233  # A#/Bb
B3  = 247  # B
           # Octave 4 ********************
C4  = 262  # C
CS4 = 277  # C#/Db
D4  = 294  # D
DS4 = 311  # D#/Eb
E4  = 330  # E
F4  = 349  # F
FS4 = 370  # F#/Gb
G4  = 392  # G
GS4 = 415  # G#/Ab
A4  = 440  # A
AS4 = 466  # A#/Bb
B4  = 494  # B
           # Octave 5 ********************
C5  = 523  # C
CS5 = 554  # C#/Db
D5  = 587  # D
DS5 = 622  # D#/Eb
E5  = 659  # E
F5  = 698  # F
FS5 = 740  # F#/Gb
G5  = 784  # G
GS5 = 831  # G#/Ab
A5  = 880  # A
AS5 = 932  # A#/Bb
B5  = 988  # B
           # Octave 6 ********************
C6  = 1047 # C
CS6 = 1109 # C#/Db
D6  = 1175 # D
DS6 = 1245 # D#/Eb
E6  = 1319 # E
F6  = 1397 # F
FS6 = 1480 # F#/Gb
G6  = 1568 # G
GS6 = 1661 # G#/Ab
A6  = 1760 # A
AS6 = 1865 # A#/Bb
B6  = 1976 # B
           # Octave 7 ********************
C7  = 2093 # C
CS7 = 2217 # C#/Db
D7  = 2349 # D
DS7 = 2489 # D#/Eb
E7  = 2637 # E
F7  = 2794 # F
FS7 = 2960 # F#/Gb
G7  = 3136 # G
GS7 = 3322 # G#/Ab
A7  = 3520 # A
AS7 = 3729 # A#/Bb
B7  = 3951 # B
           # Octave 8 ********************
C8  = 4186 # C
CS8 = 4435 # C#/Db
D8  = 4699 # D
DS8 = 4978 # D#/Eb



# [사이트판] 게임 음악 선율 데이터 제외

# This is the list of notes for jingle bells
jingle = [
    E7, E7, E7, 0,
    E7, E7, E7, 0,
    E7, G7, C7, D7, E7, 0,
    F7, F7, F7, F7, F7, E7, E7, E7, E7, D7, D7, E7, D7, 0, G7, 0,
    E7, E7, E7, 0,
    E7, E7, E7, 0,
    E7, G7, C7, D7, E7, 0,
    F7, F7, F7, F7, F7, E7, E7, E7, G7, G7, F7, D7, C7, 0 
    ]

# This is the list of notes for Twinkle, Twinkle Little Star
twinkle = [
    C6, C6, G6, G6, A6, A6, G6, 0,
    F6, F6, E6, E6, D6, D6, C6, 0,
    G6, G6, F6, F6, E6, E6, D6, 0,
    G6, G6, F6, F6, E6, E6, D6, 0,
    C6, C6, G6, G6, A6, A6, G6, 0,
    F6, F6, E6, E6, D6, D6, C6, 0,
    ]
