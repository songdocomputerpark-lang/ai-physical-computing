"""`bluetooth_lib`라는 이름으로도 같은 다리를 부를 수 있게 하는 파일(자료 f116 = f088과 같은 내용, 이름만 다르다).

교과서 4-2-3 예제(f114)가 `import time, bluetooth_lib`로 부르기 때문에 **파일 이름이 하나 더 필요하다**.
내용은 `bluetooth.py` 하나에만 두고 여기서는 그대로 다시 내보낸다 — 두 벌로 두면 한쪽만 고쳐질 수 있다.
"""

from bluetooth import (  # noqa: F401 — 같은 이름으로 다시 내보내는 것이 이 파일의 일이다
    UART_RX_UUID,
    UART_SERVICE_UUID,
    UART_TX_UUID,
    BLEUARTBridge,
    init,
)

__all__ = [
    "BLEUARTBridge",
    "UART_RX_UUID",
    "UART_SERVICE_UUID",
    "UART_TX_UUID",
    "init",
]
