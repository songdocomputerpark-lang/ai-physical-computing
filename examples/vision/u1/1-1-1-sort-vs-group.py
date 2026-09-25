# 1-1-1 체험: 규칙대로 정렬하기와 예시에서 배워 묶기를 비교해요.
# 카메라가 없어도 돼요. 사진 대신 사진에서 뽑은 숫자(파란색·초록색이 차지하는 비율)를 써요.
# @lesson 1-1-1
# @tags 인공지능, 학습, 추론

# ① 사진 정보: (이름, 찍은 날짜, 파란색 비율 %, 초록색 비율 %)
photos = [
    ("사진1", "2026-03-14", 72, 18),
    ("사진2", "2026-05-02", 15, 70),
    ("사진3", "2026-04-20", 65, 25),
    ("사진4", "2026-03-30", 20, 64),
    ("사진5", "2026-06-11", 58, 30),
    ("사진6", "2026-05-27", 25, 55),
]

# ② 기존 프로그램: 사람이 정한 규칙(날짜가 빠른 순서)대로만 정렬해요.
print("[규칙 기반] 날짜순 정렬")
for name, date, blue, green in sorted(photos, key=lambda photo: photo[1]):
    print(" ", date, name)

# ③ 학습: 이름표가 붙은 예시 사진을 보고, 묶음마다 평균 색을 계산해요.
examples = {
    "바다": [(80, 10), (70, 20)],  # 바다 사진 예시 2장의 (파란색, 초록색)
    "숲": [(10, 80), (20, 70)],  # 숲 사진 예시 2장의 (파란색, 초록색)
}
centers = {}
for label, colors in examples.items():
    blue_average = sum(color[0] for color in colors) / len(colors)  # 파란색 평균
    green_average = sum(color[1] for color in colors) / len(colors)  # 초록색 평균
    centers[label] = (blue_average, green_average)
print("[학습] 묶음별 평균 색:", centers)

# ④ 추론: 사진마다 평균 색과의 차이를 재서, 더 가까운 묶음에 넣어요.
print("[학습 기반] 비슷한 사진끼리 묶기")
for name, date, blue, green in photos:
    best_label = None
    best_gap = None
    for label, (center_blue, center_green) in centers.items():
        gap = abs(blue - center_blue) + abs(green - center_green)  # 색 차이의 합
        if best_gap is None or gap < best_gap:
            best_label = label
            best_gap = gap
    print(" ", name, "→", best_label)

# ── 바꿔볼 것 3가지 ──
# 1. 사진5의 날짜를 "2026-03-01"로 바꿔요. 규칙 기반 정렬에서 몇 번째로 나오고, 묶기 결과도 달라질까요?
# 2. 바다 예시 두 장을 (40, 50)과 (45, 45)로 바꿔요. 묶음이 달라지는 사진은 무엇이고, 왜 그럴까요?
# 3. photos에 ("사진7", "2026-07-01", 45, 45)를 넣어요. 어느 묶음에 들어갈지 먼저 예상한 뒤 실행해요.
# ── 왜 이런 결과가 나올까 ──
# ②는 사람이 정한 규칙(날짜)만 봐서 바다 사진과 숲 사진이 섞여서 나와요.
# ③은 이름표가 붙은 예시에서 "바다는 파란색, 숲은 초록색이 많다"는 기준을 숫자로 배워요.
# ④는 사진마다 그 기준에 더 가까운 쪽으로 묶어요. 기준을 배우는 것이 학습, 배운 기준으로 고르는 것이 추론이에요.
