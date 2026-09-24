"""가상 보드의 와이파이 — MicroPython `network` 흉내(PLAN §6.3 "가상: 항상 연결 성공", P4-06).

학생 코드에서:
    import network
    wlan = network.WLAN(network.STA_IF)
    wlan.active(True)
    wlan.connect("교실-와이파이", "비밀번호")
    while not wlan.isconnected():
        time.sleep(1)
    print(wlan.ifconfig())

왜 늘 연결에 성공하나
- 학교 와이파이 비밀번호를 사이트가 알 수 없고, 알아서도 안 된다(개인정보·보안). 가상 보드는 **브라우저가 이미 인터넷에
  연결돼 있다**는 사실을 그대로 쓰므로, 와이파이 연결 단계는 "코드 모양을 익히는 자리"다. 실물 보드에서는 같은 코드가
  진짜로 공유기에 붙는다(비밀번호가 틀리면 그때는 실패한다).
- 그래서 연결은 늘 성공한다. 다만 **실물처럼 `connect()`는 곧바로 끝나지 않는다**(2026-09-25 Phase 4 검토 반영): 가상 시계로
  `CONNECT_DELAY_NS`(0.5초) 동안은 `isconnected()`가 False·`status()`가 STAT_CONNECTING이고, 그 뒤에 연결된다. 전에는 곧바로 True라
  기다리지 않는 코드(connect 바로 뒤 MQTT 연결)가 가상에서만 돌았다 — 실물은 그 자리에서 중계 서버 주소를 찾지 못해 OSError가 난다.
  `while not wlan.isconnected(): time.sleep(0.1)` 반복문(MicroPython 공식 ESP32 빠른 참조의 do_connect와 같은 모양)이 실물처럼 돌다가 빠져나온다.
- 와이파이가 아직 연결되지 않았는데 MQTT `client.connect()`를 부르면 umqtt 흉내가 한국어 OSError를 낸다(`wifi_pending()`).

흉내 낸 함수(MicroPython v1.29 `network` 문서의 WLAN 항목 기준)
    WLAN(interface_id) · active([is_active]) · connect(ssid, key) · disconnect() · isconnected()
    status([param]) · ifconfig([tuple]) · ipconfig(param) · config(param=…) · scan()
    module: STA_IF · AP_IF · STAT_* · hostname() · country()
상수 숫자는 ESP32 펌웨어 값을 따랐지만 **펌웨어 판에 따라 다를 수 있다**(실물 대조는 운영자 할 일 — 가상 보드는 늘
`STAT_GOT_IP`만 돌려주므로 실습에는 영향이 없다).

규칙(src/lab/README.md 4.4): 화면과 주고받는 일은 `apc_runtime`의 함수만 쓰고, 이 파일이 import될 때(동기 진입점)는 양보하지 않는다.
라이선스: 사이트 소프트웨어(MIT, PD-26).
"""

import types

import apc_board
import apc_runtime

#: 화면(MQTT 흉내 모듈)에 "가상 와이파이가 연결됐다"고 알리는 이벤트 — 패널이 와이파이 표시를 켠다.
EVENT_WIFI = "mqtt.wifi"

STA_IF = 0
AP_IF = 1

#: 연결 상태(ESP32 펌웨어 값). 가상 보드는 STAT_GOT_IP만 쓴다.
STAT_IDLE = 1000
STAT_CONNECTING = 1001
STAT_GOT_IP = 1010
STAT_BEACON_TIMEOUT = 200
STAT_NO_AP_FOUND = 201
STAT_WRONG_PASSWORD = 202
STAT_ASSOC_FAIL = 203
STAT_HANDSHAKE_TIMEOUT = 204

#: 가상 보드가 받았다고 알려 줄 주소(사설 주소 — 실제 기기 주소가 아니다)
_VIRTUAL_IFCONFIG = ("192.168.0.77", "255.255.255.0", "192.168.0.1", "192.168.0.1")

#: connect()부터 연결되기까지의 가상 시간(나노초) — 실물처럼 곧바로 연결되지 않는다(머리말)
CONNECT_DELAY_NS = 500_000_000

#: 이번 실행에서 만든 STA(공유기에 붙는 쪽) 인터페이스 — MQTT 흉내가 "와이파이가 아직 연결 중인가"를 본다. 실행마다 비운다.
_stations = []

_hostname = "esp32-virtual"
_country = "KR"


class WLAN:
    """가상 무선 랜 인터페이스. STA_IF(공유기에 붙는 쪽)와 AP_IF(보드가 공유기가 되는 쪽) 모두 만들 수 있다."""

    def __init__(self, interface_id=STA_IF):
        self.interface_id = int(interface_id)
        self._active = False
        self._connected = False
        self._ssid = ""
        #: connect()를 부른 뒤 연결될 가상 시각(나노초). 연결 중이 아니면 None
        self._connect_at = None
        if self.interface_id == STA_IF:
            _stations.append(self)

    def active(self, is_active=None):
        """켜고 끄기. 인자가 없으면 지금 상태를 돌려준다(MicroPython과 같다)."""
        if is_active is None:
            return self._active
        self._active = bool(is_active)
        if not self._active:
            self._connected = False
            self._connect_at = None
        return self._active

    def connect(self, ssid=None, key=None, **kwargs):
        """공유기에 붙기 시작한다. 가상 보드는 늘 성공하지만 실물처럼 곧바로 연결되지는 않는다(CONNECT_DELAY_NS 뒤 — 머리말)."""
        if not self._active:
            # 실물도 active(True) 전에는 붙지 않는다. 학생이 빠뜨리기 쉬운 자리라 대신 켜 주고 알려 준다.
            self._active = True
            apc_runtime.notice("가상 보드가 wlan.active(True)를 대신 켰어요. 실물 보드에서는 connect() 앞에 꼭 넣어야 해요.", "warn")
        self._ssid = "" if ssid is None else str(ssid)
        if not self._connected:
            self._connect_at = apc_board.BOARD.clock.now_ns() + CONNECT_DELAY_NS
        return None

    def _settle(self):
        """연결될 시각이 지났으면 연결된 상태로 바꾸고 화면에 알린다(가상 와이파이 표시)."""
        if self._connected or self._connect_at is None:
            return
        if apc_board.BOARD.clock.now_ns() >= self._connect_at:
            self._connect_at = None
            self._connected = True
            apc_runtime.emit(EVENT_WIFI, {"connected": True, "ssid": self._ssid, "ip": _VIRTUAL_IFCONFIG[0], "virtual": True})

    def connecting(self):
        """connect()를 불렀지만 아직 연결되지 않았나(MQTT 흉내가 본다)."""
        self._settle()
        return self._connect_at is not None and not self._connected

    def disconnect(self):
        self._connected = False
        self._connect_at = None
        apc_runtime.emit(EVENT_WIFI, {"connected": False, "ssid": self._ssid, "virtual": True})
        return None

    def isconnected(self):
        self._settle()
        return self._connected

    def status(self, param=None):
        """param이 없으면 연결 상태 숫자, 'rssi'면 신호 세기(가상 값)."""
        if param == "rssi":
            return -55
        if param is not None:
            raise ValueError("unknown status param")
        self._settle()
        if self._connected:
            return STAT_GOT_IP
        return STAT_CONNECTING if self._connect_at is not None else STAT_IDLE

    def ifconfig(self, config=None):
        """(ip, subnet, gateway, dns). 인자를 주면 그대로 받아 둔다(가상이라 바뀌는 것은 없다)."""
        if config is None:
            return _VIRTUAL_IFCONFIG
        return None

    def ipconfig(self, param=None, **kwargs):
        """새 이름의 주소 확인(addr4 등). 가상 보드는 ifconfig와 같은 값을 돌려준다."""
        if param in ("addr4", None):
            return (_VIRTUAL_IFCONFIG[0], _VIRTUAL_IFCONFIG[1])
        if param == "gw4":
            return _VIRTUAL_IFCONFIG[2]
        if param == "dhcp4":
            return True
        return None

    def config(self, *args, **kwargs):
        """설정 읽기·쓰기. 읽을 때는 이름 하나를 넘긴다(예: wlan.config('mac') 대신 'essid'를 쓴다)."""
        global _hostname
        if args:
            name = args[0]
            if name == "essid" or name == "ssid":
                return self._ssid
            if name == "hostname":
                return _hostname
            if name == "channel":
                return 1
            if name == "txpower":
                return 20
            if name == "mac":
                # 기기 주소는 가상 값을 돌려준다(실제 주소를 쓰지 않는다 — PLAN §10).
                return b"\x02\x00\x00\x00\x00\x01"
            raise ValueError("unknown config param")
        for name, value in kwargs.items():
            if name == "hostname":
                _hostname = str(value)
        return None

    def scan(self):
        """주변 와이파이 목록 (ssid, bssid, channel, RSSI, security, hidden). 가상 값 두 개를 돌려준다."""
        return [
            (b"classroom-wifi", b"\x02\x00\x00\x00\x00\x01", 1, -52, 3, False),
            (b"apc-lab", b"\x02\x00\x00\x00\x00\x02", 6, -70, 3, False),
        ]


def wifi_pending():
    """이번 실행의 코드가 와이파이에 붙기 시작했는데 아직 연결되지 않았나(umqtt 흉내가 connect() 앞에서 본다)."""
    return any(station.connecting() for station in _stations)


def wifi_used():
    """이번 실행의 코드가 공유기에 붙는 인터페이스(STA_IF)를 만들었나."""
    return len(_stations) > 0


def _reset():
    """실행이 시작될 때 지난 실행의 인터페이스 기록을 비운다(동기 진입점 — 양보하지 않는다)."""
    del _stations[:]


apc_runtime.register_reset_hook(_reset)


def hostname(name=None):
    global _hostname
    if name is None:
        return _hostname
    _hostname = str(name)
    return None


def country(code=None):
    global _country
    if code is None:
        return _country
    _country = str(code)
    return None


def _make_module():
    module = types.ModuleType("network")
    module.WLAN = WLAN
    module.STA_IF = STA_IF
    module.AP_IF = AP_IF
    module.STAT_IDLE = STAT_IDLE
    module.STAT_CONNECTING = STAT_CONNECTING
    module.STAT_GOT_IP = STAT_GOT_IP
    module.STAT_BEACON_TIMEOUT = STAT_BEACON_TIMEOUT
    module.STAT_NO_AP_FOUND = STAT_NO_AP_FOUND
    module.STAT_WRONG_PASSWORD = STAT_WRONG_PASSWORD
    module.STAT_ASSOC_FAIL = STAT_ASSOC_FAIL
    module.STAT_HANDSHAKE_TIMEOUT = STAT_HANDSHAKE_TIMEOUT
    module.hostname = hostname
    module.country = country
    return module


#: 학생 코드의 `import network`(그리고 옛 이름 `unetwork`)가 받을 모듈. apc_board.install()이 먼저 등록해 둔
#: "아직 흉내 내지 않아요" 자리 안내를 여기서 덮어쓴다(ext/network/README.md).
NETWORK_MODULE = _make_module()
apc_board.register_board_module("network", NETWORK_MODULE)
apc_board.register_board_module("unetwork", NETWORK_MODULE)
