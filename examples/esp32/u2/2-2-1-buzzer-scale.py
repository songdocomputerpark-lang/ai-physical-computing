from machine import Pin, PWM
from time import sleep

# 패시브 부저를 GPIO15에 연결
buzzer = PWM(Pin(15))
# 도레미파솔라시도 (C4~C5) 주파수 (Hz)
notes = {"도": 262,"레": 294,"미": 330,"파": 349,
    "솔": 392,"라": 440,"시": 494,"도(높은)": 523}
# 연주 순서
melody = ["도", "레", "미", "파",
          "솔", "라", "시", "도(높은)"]
# 연주
for note in melody:
    buzzer.freq(notes[note])
    buzzer.duty(512)# 음 크기
    print(note)# 음계명 출력
    sleep(0.5)
# 소리 끄기
buzzer.deinit()

