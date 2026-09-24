# 가상 보드 확장 자리 — 와이파이(`network.WLAN`)와 `umqtt.simple`

Phase 4 준비(2026-09-18)에서 자리만 만들어 둔 폴더를 **P4-06 MQTT와 탭 통로**가 채웠어요(2026-09-18, 통합 2026-09-24). 화면 쪽(모듈 `src/lab/modules/mqtt/`·연결 `src/lab/mqtt/`)과 토픽 규칙은 `src/lab/README.md` 7.10·9.9에 있어요. 아래는 준비 때 적은 약속이에요(그대로 지켜요).

## 여기에 만드는 파일

| 파일 | 하는 일 |
|---|---|
| `apc_board_network.py` | MicroPython `network` 흉내. `apc_board.register_board_module('network', 모듈)`로 자리 안내를 덮어써요 |
| `apc_board_umqtt.py`(또는 `umqtt/` 꾸러미) | `umqtt.simple.MQTTClient` 흉내 — `connect`·`publish`·`subscribe`·`set_callback`·`check_msg`·`wait_msg` |

`apc_board.py`의 `load_extensions()`가 `/apc`의 `apc_board_*.py`를 한 번씩 import해요 — 등록 파일을 고치지 않아도 파일을 두면 들어와요.

**`umqtt`는 점이 든 이름(`umqtt.simple`)이라 한 줄로는 안 돼요.** 교과서·템플릿이 쓰는 두 모양을 모두 받으려면 둘 다 해요.

```python
import sys, types
import apc_board

umqtt = types.ModuleType("umqtt")
simple = types.ModuleType("umqtt.simple")
simple.MQTTClient = MQTTClient          # 아래에서 만든 흉내 클래스
umqtt.simple = simple
sys.modules.setdefault("umqtt", umqtt)          # from umqtt.simple import MQTTClient
sys.modules.setdefault("umqtt.simple", simple)  # (파이썬이 점이 든 이름을 sys.modules에서 찾아요)
apc_board.register_board_module("umqtt", umqtt) # import umqtt (학생 코드 전용 import 훅)
```

`apc_board.NOT_YET_MODULES`의 `umqtt` 줄은 **그대로 둬요** — 확장이 빠졌을 때 한국어로 알리는 안전망이고, 점이 든 이름도 맨 앞 이름으로 봐요.

## 지켜야 할 것(PLAN §7.4, PD-29)

- 가상 와이파이는 **늘 연결 성공**으로 둬요(PLAN §6.3). 학교망 때문에 실습이 막히지 않아야 해요.
- 토픽에 **고정 루트를 쓰지 않아요.** 접두어는 `src/lab/bridge/prefix.ts`의 무작위 12글자예요.
- 공개 브로커 통로에는 "누구나 보고, 누구나 보낼 수도 있어요" 경고를 **늘** 보이게 해요(`bridgeText.publicBrokerNotice()`).
- 실제 보드로 가는 수신은 허용 명령 목록(`BridgeInbox`의 `allow`)과 길이 검사(20바이트)를 기본으로 하고 **LED·LCD 표시만** 해요.
  레이저·팬·서보처럼 움직이는 장치는 공개 브로커 통로에 잇지 않아요.
