# TF 카드 어댑터 V2 기본 동작 테스트: 카드를 연결하고, 파일을 쓰고 → 읽고 → 목록을 보여 줘요.
# 어댑터: 실드 우상단 VSPI 단자에 꽂는다 — SI(MOSI) 23 · SO(MISO) 19 · SCK 18 · CS 5 · 전원 3V3. 카드는 FAT32 로 포맷하세요.
# ⚠️ 카드를 뺄 땐 프로그램이 끝난 뒤에(마지막 줄 `umount` 후) 빼세요. 쓰는 도중 빼면 파일이 망가질 수 있어요.
import os
from machine import Pin, SDCard
from time import sleep_ms

# TF 카드 어댑터는 SPI 로 연결해요: SCK → GPIO 18, MISO → GPIO 19, MOSI → GPIO 23, CS → GPIO 5
try:
    sd = SDCard(slot=2, sck=Pin(18), miso=Pin(19), mosi=Pin(23), cs=Pin(5))
    os.mount(sd, '/sd')
except OSError as e:
    print('TF 카드를 못 찾았어요. 카드가 끝까지 꽂혔는지(FAT32), 선을 확인하세요.', e)
    raise SystemExit

print('TF 카드 연결 성공! 처음 들어 있던 파일:', os.listdir('/sd'))
try:
    with open('/sd/hello.txt', 'w') as f:             # 1) 파일 쓰기
        f.write('Hello, Brixel!\n')
        f.write('Second line\n')
    print('hello.txt 에 글을 썼어요.')
    with open('/sd/hello.txt') as f:                  # 2) 파일 읽기
        print('읽은 내용:')
        print(f.read())
    print('지금 파일 목록:')                           # 3) 목록과 크기 보기
    for name in os.listdir('/sd'):
        print(' -', name, os.stat('/sd/' + name)[6], '바이트')
finally:
    os.umount('/sd')                                  # 4) 안전하게 연결 끊기
    print('연결을 끊었어요. 이제 카드를 빼도 안전해요.')
