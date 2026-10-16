# >>> 브릭셀 무선 연결 (1.7.7 에서 설치 — 지우려면 이 블록을 지운다)
try:
    import brx_ble
    print('무선 연결 대기:', brx_ble.start())
except Exception as e:
    print('무선 연결 시작 실패:', e)
# <<< 브릭셀 무선 연결
