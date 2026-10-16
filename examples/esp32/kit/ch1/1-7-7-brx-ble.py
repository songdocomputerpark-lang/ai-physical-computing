# brx_ble.py — 웹 블루투스 무선 연결 통로 (브릭셀 ESP32 가이드 1.7.7)
# 보드의 대화 창(REPL)을 USB 와 블루투스(BLE) 두 길로 함께 열어 둔다.
# 크롬·엣지의 «📶 무선 연결»이 이 길로 코드를 보내고 print 출력을 받는다 → 실습 코드는 한 줄도 안 바뀐다.
# boot.py 에서 start() 를 한 번 부르면 보드를 켤 때마다 연결을 기다린다.
import bluetooth, io, os, time
from micropython import const

_CONNECT = const(1)       # 컴퓨터가 연결함
_DISCONNECT = const(2)    # 연결이 끊김
_WRITE = const(3)         # 컴퓨터가 보낸 글자가 도착함
_MTU = const(21)          # 한 번에 보낼 수 있는 크기가 정해짐

# Nordic UART Service(NUS) — 블루투스로 «시리얼 통신»을 하는 널리 쓰는 약속
_NUS = bluetooth.UUID('6E400001-B5A3-F393-E0A9-E50E24DCCA9E')
_RX = (bluetooth.UUID('6E400002-B5A3-F393-E0A9-E50E24DCCA9E'),
       bluetooth.FLAG_WRITE | bluetooth.FLAG_WRITE_NO_RESPONSE)   # 컴퓨터 → 보드
_TX = (bluetooth.UUID('6E400003-B5A3-F393-E0A9-E50E24DCCA9E'),
       bluetooth.FLAG_NOTIFY)                                      # 보드 → 컴퓨터


class _Link(io.IOBase):
    """os.dupterm 에 끼우는 «두 번째 입출력 창» — 읽기 = 컴퓨터가 보낸 글자, 쓰기 = print 출력"""

    def __init__(self, name):
        self.name = name
        self.conn = None              # 연결된 컴퓨터(없으면 None)
        self.size = 20                # 한 번에 보낼 바이트 수
        self.inbox = bytearray()      # 받은 글자
        self.pos = 0                  # inbox 에서 이미 읽은 곳
        ble = self.ble = bluetooth.BLE()
        ble.active(True)
        ble.config(gap_name=name, mtu=247)
        ble.irq(self._irq)
        ((self.tx, self.rx),) = ble.gatts_register_services(((_NUS, (_TX, _RX)),))
        ble.gatts_set_buffer(self.rx, 1024, True)
        self._advertise()

    def _advertise(self):             # «나 여기 있어요» 신호 — 서비스 번호 + 이름
        uuid = bytes(_NUS)
        name = self.name.encode()
        self.ble.gap_advertise(100000, adv_data=b'\x02\x01\x06' + bytes((len(uuid) + 1, 0x07)) + uuid,
                               resp_data=bytes((len(name) + 1, 0x09)) + name)

    def _irq(self, event, data):
        if event == _CONNECT:
            self.conn, self.size = data[0], 20
            self.inbox, self.pos = bytearray(), 0
            os.dupterm(self)          # 이제부터 대화 창이 블루투스로도 열린다
        elif event == _DISCONNECT:
            if data[0] == self.conn:
                self.conn = None
                os.dupterm(None)
            self._advertise()         # 다음 연결을 기다린다
        elif event == _WRITE and data[1] == self.rx:
            if self.pos:
                self.inbox, self.pos = self.inbox[self.pos:], 0
            self.inbox += self.ble.gatts_read(self.rx)
            if hasattr(os, 'dupterm_notify'):
                os.dupterm_notify(None)   # «글자 왔다» 알림 — 실행 중 Ctrl-C(멈추기)도 이 길로 간다
        elif event == _MTU:
            self.size = data[1] - 3

    # ---- dupterm 이 부르는 함수 ----
    def readinto(self, buf):
        n = len(self.inbox) - self.pos
        if n <= 0:
            return None
        n = min(n, len(buf))
        buf[:n] = self.inbox[self.pos:self.pos + n]
        self.pos += n
        return n

    def write(self, buf):
        c = self.conn
        try:
            mv, i, tries = memoryview(buf), 0, 0
            while c is not None and c == self.conn and i < len(mv):
                try:
                    self.ble.gatts_notify(c, self.tx, mv[i:i + self.size])
                    i += self.size
                    tries = 0
                except OSError:           # 보낼 줄이 꽉 참 → 잠깐 기다렸다 다시
                    tries += 1
                    if tries > 100:
                        break
                    time.sleep_ms(5)
        except Exception:
            pass
        return len(buf)

    def ioctl(self, op, arg):
        if op == 3 and len(self.inbox) > self.pos:   # 3 = «읽을 것 있나?»
            return 1
        return 0


_link = None


def start(name=None):
    """무선 통로를 연다(boot.py 에서 한 번). 돌려주는 값 = 무선 이름"""
    global _link
    if _link is None:
        if not name:
            try:
                name = open('brx_ble.txt').read().strip()
            except OSError:
                name = ''
        if not name:
            ble = bluetooth.BLE()
            ble.active(True)
            mac = ble.config('mac')[1]
            name = 'BRX-%02X%02X' % (mac[4], mac[5])
        _link = _Link(name[:20])
    return _link.name


def name():
    return _link.name if _link else None
