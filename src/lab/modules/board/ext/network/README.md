# 가상 보드 확장 자리 — 와이파이(`network.WLAN`)와 `umqtt.simple`

Phase 4 준비(2026-09-18)에서 **자리만** 만들어 둔 폴더예요. 채우는 곳은 **P4-06 MQTT와 탭 통로** 구역이에요.

## 여기에 만드는 파일

| 파일 | 하는 일 |
|---|---|
| `apc_board_network.py` | MicroPython `network` 흉내. `apc_board.register_board_module('network', 모듈)`로 자리 안내를 덮어써요 |
| `apc_board_umqtt.py`(또는 `umqtt/` 꾸러미) | `umqtt.simple.MQTTClient` 흉내 — `connect`·`publish`·`subscribe`·`set_callback`·`check_msg`·`wait_msg` |

`apc_board.py`의 `load_extensions()`가 `/apc`의 `apc_board_*.py`를 한 번씩 import해요 — 등록 파일을 고치지 않아도 파일을 두면 들어와요.
`umqtt`는 점이 든 이름(`umqtt.simple`)이라 파일 하나로는 안 돼요. `register_board_module('umqtt', 꾸러미 모듈)`로 등록하고
그 모듈에 `simple` 속성을 달아 `from umqtt.simple import MQTTClient`가 되게 해요(`apc_board.NOT_YET_MODULES`의 `umqtt` 줄은 그대로 둬요 — 안전망이에요).

## 지켜야 할 것(PLAN §7.4, PD-29)

- 가상 와이파이는 **늘 연결 성공**으로 둬요(PLAN §6.3). 학교망 때문에 실습이 막히지 않아야 해요.
- 토픽에 **고정 루트를 쓰지 않아요.** 접두어는 `src/lab/bridge/prefix.ts`의 무작위 12글자예요.
- 공개 브로커 통로에는 "누구나 보고, 누구나 보낼 수도 있어요" 경고를 **늘** 보이게 해요(`bridgeText.publicBrokerNotice()`).
- 실제 보드로 가는 수신은 허용 명령 목록(`BridgeInbox`의 `allow`)과 길이 검사(20바이트)를 기본으로 하고 **LED·LCD 표시만** 해요.
  레이저·팬·서보처럼 움직이는 장치는 공개 브로커 통로에 잇지 않아요.
