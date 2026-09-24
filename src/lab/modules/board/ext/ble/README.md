# 가상 보드 확장 자리 — 블루투스(`bluetooth`·`ubluetooth`)

Phase 4 준비(2026-09-18)에서 자리만 만들어 둔 폴더를 **P4-03 가상 BLE**가 채웠어요(2026-09-18, 통합 2026-09-24). 지금 흉내 내는 것·화면 쪽 붙임(부품 `parts/ble/`의 조작 칸, 창 이벤트 `apc:ble-write`·`apc:ble-notify`)은 `src/lab/README.md` 7.5·7.10·9.12에 있어요. 아래는 준비 때 적은 약속이에요(그대로 지켜요).

## 여기에 만드는 파일

| 파일 | 하는 일 |
|---|---|
| `apc_board_ble.py` | MicroPython `ubluetooth`의 저수준 흉내. `apc_board.register_board_module('bluetooth', 모듈)`·`('ubluetooth', 모듈)`로 자리 안내를 덮어써요 |
| (선택) `ble-link.ts` | 화면 쪽 붙임(송신 패널·가상 스마트폰 앱 패널). 보드 모듈 `index.ts`가 아니라 이 폴더에서 만들어요 |

`apc_board.py`의 `load_extensions()`가 `/apc`의 `apc_board_*.py`를 한 번씩 import해요 — **등록 파일을 고치지 않아도** 파일을 두면 들어와요.
`install()`이 먼저 자리 안내(`ModuleNotFoundError` + 한국어)를 등록하고 그다음에 확장을 부르므로, 같은 이름을 다시 등록하면 확장이 이겨요.

## 흉내 낼 것(CODE_MAPPING §2.3 f087 기준 — 원본 `ESP32BLE.py`가 그대로 돌아야 해요)

`BLE()`, `active(True)`, `irq(handler)`(1 연결·2 끊김·3 쓰기), `gatts_register_services(...)` → `((tx, rx),)`, `gatts_read(handle)`,
`gatts_notify(0, tx, 글자)`, `gatts_set_buffer`, `config('mac')`, `gap_advertise(간격, adv_data)`, `UUID`, `FLAG_WRITE`·`FLAG_NOTIFY`.
특성 값 기본 최대 **20바이트**(PLAN §7.2-3) — 넘으면 실물처럼 자르고 콘솔에 한국어로 알려요(§7.7).

## 지켜야 할 것

- **기기 주소(MAC)는 만들어 내더라도 실제 값처럼 보이게 적지 않아요.** 문서·테스트·로그에는 `XX:XX:XX:XX:XX:XX`만 써요(PLAN §10).
- 보드 라이브러리 `examples/esp32/lib/third-party/ESP32BLE.py`는 **원본 그대로** 돌려야 해요 — 맞추는 쪽은 이 흉내예요(PD-10).
- 브릿지(`src/lab/bridge/`)와는 다른 층이에요. 기기 사이 글자 한 줄은 브릿지, 저수준 GATT는 이 확장이에요(README 9.7).
