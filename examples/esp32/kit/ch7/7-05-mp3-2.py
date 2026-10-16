# MP3 플레이어 심화 예제: BOOT 버튼을 짧게 누르면 다음 곡, 길게(1초 이상) 누르면 소리 크기가 바뀝니다.
# (모듈 TX → GPIO 25, RX → GPIO 26)
from machine import Pin
from time import sleep_ms, ticks_ms, ticks_diff
from gorillacell_mp3_player import GORILLACELL_MP3PLAYER

boot = Pin(0, Pin.IN, Pin.PULL_UP)
mp3 = GORILLACELL_MP3PLAYER(tx=26, rx=25)
volume = 10
mp3.setVolume(volume)
sleep_ms(500)
mp3.playIndex(1)
print('1번 곡 재생! 짧게 = 다음 곡 / 길게 = 소리 크기 바꾸기')
try:
    while True:
        if boot.value() == 0:
            t0 = ticks_ms()
            while boot.value() == 0:
                sleep_ms(10)
            if ticks_diff(ticks_ms(), t0) >= 1000:
                volume = volume + 5 if volume < 30 else 5
                mp3.setVolume(volume)
                print('소리 크기:', volume, '/ 30')
            else:
                mp3.playNext()
                print('다음 곡')
        sleep_ms(20)
finally:
    mp3.playStop()
