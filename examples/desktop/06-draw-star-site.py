# 드래그로 진짜 별 그리기(사이트판)
# 원본(06-draw-star.py)이 왜 별이 아니라 삼각형이 되는지 확인한 뒤, 방향을 144도씩 돌려 진짜 별을 그려요.
# @tags pyautogui, 드래그, 그림판, 각도

import math

import pyautogui

edge = 300  # @slider 120 400 10  한 변의 길이(픽셀)
turn = 144  # @slider 36 180 36  한 변을 그을 때마다 도는 각도
start_x = 600  # @slider 400 1200 10  시작 x
start_y = 500  # @slider 350 800 10  시작 y

pyautogui.moveTo(start_x, start_y)

angle = 0
for _ in range(5):
    dx = edge * math.cos(math.radians(angle))
    dy = edge * math.sin(math.radians(angle))
    pyautogui.dragRel(dx, dy, duration=0.3)
    angle = angle + turn

print("다 그렸어요. 돌아온 자리:", pyautogui.position())

# ── 바꿔볼 것 3가지 ──
# turn을 72로 바꿔 보세요. 별이 아니라 정오각형이 그려져요.
# edge를 크게 하면 별이 화면 밖으로 나가요. start_x·start_y를 함께 옮겨 보세요.
# dragRel을 moveTo로 바꾸면 선이 사라져요(버튼을 누르지 않으니까요).

# ── 왜 이런 결과가 나올까 ──
# 원본 06-draw-star.py는 (100, 0) → (-50, -87) → (-50, 87)을 다섯 번 되풀이해요.
# 세 번 옮긴 거리를 모두 더하면 (0, 0)이라 커서가 늘 제자리로 돌아와서, 같은 삼각형만 다섯 번 겹쳐 그려져요.
# 별(★)은 한 변을 그을 때마다 144도씩 같은 방향으로 돌아야 다섯 번 만에 처음 자리로 돌아와요(144 × 5 = 720 = 두 바퀴).
