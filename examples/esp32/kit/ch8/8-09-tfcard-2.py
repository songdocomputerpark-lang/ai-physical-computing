# 데이터 로거: 1초마다 (시간, 번호, 남은 메모리)를 TF 카드의 log.csv 에 한 줄씩 저장해요.
# BOOT 버튼을 누르면 기록을 끝내고, 파일을 닫고, 카드 연결을 안전하게 끊어요. (log.csv 는 매번 새로 만들어져요)
# 센서가 있다면 `free_mem` 자리에 센서 값을 넣으면 진짜 측정 기록장이 돼요. 컴퓨터에 카드를 꽂으면 엑셀로 열 수 있어요.
# ⚠️ 카드를 뺄 땐 프로그램이 끝난 뒤에 빼세요.
import gc
import os
from machine import Pin, SDCard
from time import sleep_ms, ticks_ms, ticks_diff

# TF 카드 어댑터는 SPI 로 연결해요: SCK → GPIO 18, MISO → GPIO 19, MOSI → GPIO 23, CS → GPIO 5
try:
    sd = SDCard(slot=2, sck=Pin(18), miso=Pin(19), mosi=Pin(23), cs=Pin(5))
    os.mount(sd, '/sd')
except OSError as e:
    print('TF 카드를 못 찾았어요. 카드가 끝까지 꽂혔는지(FAT32), 선을 확인하세요.', e)
    raise SystemExit

button = Pin(0, Pin.IN, Pin.PULL_UP)                  # 보드의 BOOT 버튼 (누르면 0)
f = open('/sd/log.csv', 'w')
f.write('sec,count,free_mem\n')                       # 맨 윗줄 = 제목
t0 = ticks_ms()
count = 0
print('기록 시작! 끝내려면 BOOT 버튼을 누르세요.')
try:
    while button.value() == 1:
        sec = ticks_diff(ticks_ms(), t0) // 1000
        line = '{},{},{}'.format(sec, count, gc.mem_free())
        f.write(line + '\n')
        f.flush()                                     # 바로 카드에 저장
        print('기록:', line)
        count += 1
        sleep_ms(1000)
    print('버튼이 눌려서 기록을 끝낼게요.')
finally:
    f.close()
    with open('/sd/log.csv') as r:
        print('저장된 줄 수 (제목 포함):', len(r.readlines()))
    os.umount('/sd')
    print('연결을 끊었어요. 이제 카드를 빼도 안전해요.')
