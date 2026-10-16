# MP3 플레이어 기본 동작 테스트: 첫 번째 곡을 5초 재생 → 2초 일시정지 → 다시 재생을 반복합니다.
# 모듈 TX → GPIO 25, RX → GPIO 26. 모듈에 MP3 파일이 든 TF 카드와 스피커를 연결하세요.
from time import sleep
from gorillacell_mp3_player import GORILLACELL_MP3PLAYER

print('MP3 플레이어 테스트 시작 (모듈 TX → GPIO 25, RX → GPIO 26)')
mp3 = GORILLACELL_MP3PLAYER(tx=26, rx=25)
mp3.setVolume(15)              # 소리 크기 0~30
sleep(1)
try:
    while True:
        print('1번 곡 재생')
        mp3.playIndex(1)
        sleep(5)
        print('일시정지')
        mp3.pause()
        sleep(2)
        print('이어서 재생')
        mp3.play()
        sleep(5)
finally:
    mp3.playStop()
