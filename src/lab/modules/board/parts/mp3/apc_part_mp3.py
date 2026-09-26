"""부품 흉내: MP3 모듈(DFPlayer Mini 계열) — 보드 UART가 보낸 명령 바이트를 알아듣고 트랙을 재생한다(PLAN §6.2 "MP3 모듈", §6.5 PD-16,
CODE_MAPPING §3.8.3·§6.1 D1, src/lab/README.md 7.5·7.9). 화면 쪽은 같은 폴더의 part.ts(모습·합성 음원).

학생 코드는 교과서 그대로다(원고 162~165쪽, f070~f072):

    uart = UART(2, baudrate=9600, tx=Pin(17), rx=Pin(16))
    uart.write(bytearray([0x7E, 0xFF, 0x06, 0x03, 0x00, 0x00, 0x01, 0xEF]))   # 1번 곡(001.mp3) 재생

배선(원고 162쪽 "TX(16번 핀)·RX(17번 핀)"): 역할 이름은 모듈 쪽 이름이다 — rx(모듈이 받는 핀) ← 보드 TX 17, tx(모듈이 보내는 핀) → 보드 RX 16.

명령 프레임(바이트): 7E VER(FF) LEN(06) CMD FB P1 P2 [CHK_H CHK_L] EF
- 체크섬이 있는 10바이트와 없는 8바이트를 모두 받는다. 체크섬은 DFRobot 공식 Arduino 라이브러리(DFRobotDFPlayerMini 1.0.6 calculateCheckSum)와 같게
  -(VER+LEN+CMD+FB+P1+P2)를 16비트로 자른 값이다. 10바이트인데 체크섬이 다르면 명령을 무시하고 오류 프레임(0x40, 4 = CheckSumNotMatch)을 돌려준다.
  근거와 확인 필요: 데이터시트 형식은 체크섬이 든 10바이트다(DFPlayer Mini 설명서 3.1 — PICAXE 사본 spe033). 교과서는 체크섬 없는 8바이트를 보내고
  (f070은 bytearray(10)에 8바이트만 채워 7E FF 06 03 00 00 01 EF 00 00을 보낸다) 원고 163쪽 실행 결과 사진에 보드·스피커가 있어 실물 모듈이
  8바이트 명령을 받는 것으로 보이지만, 키트 모듈에서 직접 확인하지는 않았다(부록 B-2). 설명서의 예시 체크섬(FF E6)은 계산식과 맞지 않아 라이브러리 식을 따른다.
- 프레임 뒤에 붙은 바이트(f070의 00 00)는 다음 7E가 올 때까지 버린다. VER이 FF가 아니거나 LEN이 06이 아니면 그 프레임을 버린다.
- FB(피드백)가 1이면 명령마다 응답 프레임 7E FF 06 41 00 00 00 FE BA EF를 보낸다(라이브러리 parseStack의 0x41 ACK).

흉내 내는 명령(설명서 3.2 표와 DFRobot 라이브러리가 같은 뜻인 것만): 0x01 다음 곡, 0x02 이전 곡, 0x03 트랙 재생(1~트랙 수), 0x04·0x05 소리 크게·작게,
0x06 볼륨(0~30, 전원 켤 때 30 — 설명서 3.4.2), 0x07 EQ(0~5), 0x0A 잠자기, 0x0B 깨우기, 0x0C 모듈 재설정, 0x0D 재생(일시 정지·정지에서 이어서),
0x0E 일시 정지, 0x11 전체 반복(1 켬·0 끔), 0x16 정지(라이브러리 stop — 설명서 표에는 없음), 0x19 한 곡 반복(0 켬·1 끔, 라이브러리 enableLoop),
0x43·0x44 볼륨·EQ 묻기(같은 명령 번호로 답한다). 뜻이 자료마다 다른 명령(0x08·0x09·0x0F·0x12 이후·0x42·0x47~0x4D)은 흉내 내지 않고 화면에 알린다.
- 곡이 끝나면 멈추고 곡 번호가 다음 곡으로 넘어가며(설명서 3.3.2 4번) 7E FF 06 3D 00 00 <곡> <체크섬> EF를 한 번 보낸다.
- 없는 곡 번호는 재생하지 않고 오류 프레임(0x40, 5 = FileIndexOut — 라이브러리 오류 번호)을 보낸다. 잠자기 중의 재생 명령은 오류 2(Sleeping).
- 음원 파일은 두지 않는다(PD-16): SD 카드에 001~003.mp3가 있는 것처럼 트랙 3개를 두고, 소리는 화면이 사이트가 지은 짧은 멜로디로 합성한다.
  곡 길이는 TRACK_LENGTHS_MS이고 화면 멜로디(parts/mp3/melodies.ts)와 같아야 한다(tests/unit/board-uart/mp3-melodies.test.ts가 맞춰 본다).
- 곡 재생 시간은 가상 시계로 센다(sleep한 만큼 흘러감). 곡이 끝나는 시각에는 가상 시각 알람(apc_board.register_wake_hook)이 긴 sleep을
  끊어 그 시각에 멈추고 화면에 알린다(2026-09-26 PROGRESS 미해결 177). 모듈은 [실행]마다 보드와 함께 새로 켜진 것으로 본다(초기화 대기 1.5~3초는 흉내 내지 않음).

화면에 보내는 상태('board.device' state): {v, status: 'stopped'|'playing'|'paused'|'sleep', track, volume, eq, loop: 'none'|'one'|'all',
playId(곡을 처음부터 틀 때마다 1씩), positionMs(지금까지 재생한 시간), commands(알아들은 명령 수), last{cmd, name, param, bytes, feedback},
ignored(버린 프레임 수), issue('checksum'|'frame'|'baud'|'no-file'|'sleeping'|'unsupported'|null), issueText(한국어), replies(보낸 응답 수)}
라이선스: 사이트 소프트웨어(MIT, PD-26). DFRobot 라이브러리(LGPL) 코드는 옮기지 않고 명령 번호·체크섬 식 같은 통신 규약만 맞췄다.
"""

import apc_board
import apc_board_uart
import apc_runtime

__all__ = [
    "DEFAULT_VOLUME",
    "FILE_COUNT",
    "MAX_VOLUME",
    "PART_ID",
    "TRACK_LENGTHS_MS",
    "FrameParser",
    "Mp3Module",
    "build_frame",
    "frame_checksum",
]

PART_ID = "mp3"
#: 트랙 1~3의 길이(밀리초) — 화면 합성 멜로디(parts/mp3/melodies.ts TRACKS)의 음 길이 합과 같다
TRACK_LENGTHS_MS = (3600, 4800, 4200)
FILE_COUNT = len(TRACK_LENGTHS_MS)
MAX_VOLUME = 30
DEFAULT_VOLUME = 30
MAX_EQ = 5

START = 0x7E
VERSION = 0xFF
LENGTH = 0x06
END = 0xEF

CMD_ACK = 0x41
CMD_ERROR = 0x40
CMD_TF_FINISHED = 0x3D
CMD_ONLINE = 0x3F

#: 오류 번호(DFRobotDFPlayerMini.h: Busy 1, Sleeping 2, SerialWrongStack 3, CheckSumNotMatch 4, FileIndexOut 5, FileMismatch 6)
ERROR_SLEEPING = 2
ERROR_CHECKSUM = 4
ERROR_FILE_INDEX_OUT = 5

COMMAND_NAMES = {
    0x01: "다음 곡",
    0x02: "이전 곡",
    0x03: "트랙 재생",
    0x04: "소리 크게",
    0x05: "소리 작게",
    0x06: "볼륨 정하기",
    0x07: "EQ 정하기",
    0x0A: "잠자기",
    0x0B: "깨우기",
    0x0C: "모듈 재설정",
    0x0D: "재생",
    0x0E: "일시 정지",
    0x11: "전체 반복",
    0x16: "정지",
    0x19: "한 곡 반복",
    0x43: "볼륨 묻기",
    0x44: "EQ 묻기",
}

_live = []


def _reset():
    """실행 시작(보드를 새로 켬): 지난 실행의 모듈을 잊는다(장치는 실행마다 새로 만들어진다 — apc_board.wired_devices)."""
    _live.clear()


def _wake(now_ns):
    """가상 시각 알람(apc_board.register_wake_hook — 입력 확인 지점마다, 양보 금지): 재생 중인 곡이 끝났는지 가상 시계로 보고,
    다음 곡 끝 시각을 알려 준다. 그래서 time.sleep(5) 안에서도 3.6초 곡이 끝나는 그 시각에 멈춘다(2026-09-26 PROGRESS 미해결 177 —
    전에는 틱 훅이라 sleep이 끝난 뒤에야 알아채 그동안 "재생 중"이었다. 실물 DFPlayer는 스스로 멈춘다)."""
    due = None
    for module in list(_live):
        module.advance()
        when = module.finish_due_ns()
        if when is not None and (due is None or when < due):
            due = when
    return due


apc_runtime.register_reset_hook(_reset)
apc_board.register_wake_hook(_wake)


def frame_checksum(values):
    """VER·LEN·CMD·FB·P1·P2 여섯 바이트의 체크섬(16비트): -(합)"""
    return (-sum(int(value) & 0xFF for value in values)) & 0xFFFF


def build_frame(cmd, param=0, feedback=0):
    """모듈이 보내는 10바이트 프레임(체크섬 포함)"""
    body = [VERSION, LENGTH, cmd & 0xFF, feedback & 0xFF, (param >> 8) & 0xFF, param & 0xFF]
    checksum = frame_checksum(body)
    return bytes([START, *body, checksum >> 8, checksum & 0xFF, END])


class FrameParser:
    """받은 바이트를 이어 붙여 명령 프레임을 찾는다(바이트가 여러 번에 나눠 와도 된다).
    feed(data) → 목록: 프레임 {'kind': 'frame', 'bytes': 8|10, 'cmd', 'feedback', 'param', 'checksum': None|True|False, 'raw'}
    또는 버린 것 {'kind': 'invalid', 'reason': 'version'|'length'|'end', 'raw'}. 7E 앞의 잡음 바이트 수는 noise에 센다."""

    def __init__(self):
        self.buffer = bytearray()
        self.noise = 0

    def feed(self, data):
        results = []
        for value in bytes(data):
            self._push(value, results)
        return results

    def _restart_from(self, raw, results, reason):
        results.append({"kind": "invalid", "reason": reason, "raw": list(raw)})
        self.buffer = bytearray()
        # 버린 바이트 안에 새 프레임의 시작(7E)이 있으면 그곳부터 다시 읽는다
        tail = raw[1:]
        at = tail.find(bytes([START]))
        if at >= 0:
            for value in tail[at:]:
                self._push(value, results)

    def _push(self, value, results):
        buffer = self.buffer
        if not buffer:
            if value == START:
                buffer.append(value)
            else:
                self.noise += 1
            return
        buffer.append(value)
        size = len(buffer)
        if size == 2 and value != VERSION:
            self._restart_from(bytes(buffer), results, "version")
        elif size == 3 and value != LENGTH:
            self._restart_from(bytes(buffer), results, "length")
        elif size == 8 and value == END:
            results.append(self._frame(bytes(buffer), None))
            self.buffer = bytearray()
        elif size == 10:
            if value == END:
                checksum = (buffer[7] << 8) | buffer[8]
                results.append(self._frame(bytes(buffer), checksum == frame_checksum(buffer[1:7])))
                self.buffer = bytearray()
            else:
                self._restart_from(bytes(buffer), results, "end")

    @staticmethod
    def _frame(raw, checksum_ok):
        return {
            "kind": "frame",
            "bytes": len(raw),
            "cmd": raw[3],
            "feedback": raw[4],
            "param": (raw[5] << 8) | raw[6],
            "checksum": checksum_ok,
            "raw": list(raw),
        }


class Mp3Module:
    """배선의 MP3 모듈 하나(실행마다 새로 — apc_board.register_part factory)"""

    SERIAL_RX_ROLE = "rx"
    SERIAL_TX_ROLE = "tx"

    def __init__(self, entry):
        self.entry = entry
        self.id = entry["id"]
        self.pins = entry.get("pins", {})
        self.parser = FrameParser()
        self.status = "stopped"
        self.track = None
        self.pointer = 1
        self.volume = DEFAULT_VOLUME
        self.eq = 0
        self.loop = "none"
        self.play_id = 0
        self.position_ns = 0
        self.resumed_at_ns = None
        self.commands = 0
        self.ignored = 0
        self.replies = 0
        self.last = None
        self.issue = None
        self.issue_text = None
        _live.append(self)
        self.publish()

    # ── 선 ──

    def serial_settings(self):
        return dict(apc_board_uart.SERIAL_DEFAULT)

    def serial_receive(self, data, info):
        self.advance()
        if not info.get("matched", True):
            settings = info.get("settings", {})
            self._set_issue(
                "baud",
                f"MP3 모듈은 9600bps(8N1)로만 알아들어요. 보드 UART{info.get('uart')}는 {settings.get('baudrate')}bps라 신호가 깨졌어요. "
                "UART(2, baudrate=9600, …)으로 맞춰요.",
            )
        for item in self.parser.feed(data):
            if item["kind"] == "invalid":
                self.ignored += 1
                self._set_issue("frame", f"명령 모양이 맞지 않는 바이트({_hex(item['raw'])})를 버렸어요. 7E FF 06 명령 00 값 값 EF 차례인지 확인해요.")
                continue
            self._handle(item)
        self.publish()

    def _reply(self, cmd, param=0, at_ns=None):
        pin = self.pins.get(self.SERIAL_TX_ROLE)
        if pin is None:
            return
        apc_board_uart.deliver(pin, build_frame(cmd, param), apc_board_uart.SERIAL_DEFAULT, at_ns)
        self.replies += 1

    # ── 명령 ──

    def _handle(self, frame):
        cmd = frame["cmd"]
        param = frame["param"]
        if frame["checksum"] is False:
            self.ignored += 1
            expected = frame_checksum(frame["raw"][1:7])
            self._set_issue(
                "checksum",
                f"체크섬({frame['raw'][7]:02X} {frame['raw'][8]:02X})이 계산값({expected >> 8:02X} {expected & 0xFF:02X})과 달라 명령을 무시했어요. "
                "체크섬 없이 8바이트(… 값 값 EF)로 보내도 돼요.",
            )
            self._reply(CMD_ERROR, ERROR_CHECKSUM)
            return
        self.last = {"cmd": cmd, "name": COMMAND_NAMES.get(cmd, "알 수 없는 명령"), "param": param, "bytes": frame["bytes"], "feedback": frame["feedback"]}
        if cmd not in COMMAND_NAMES:
            self.ignored += 1
            self._set_issue(
                "unsupported",
                f"명령 0x{cmd:02X}은(는) 가상 MP3 모듈이 흉내 내지 않아요(자료마다 뜻이 달라요). 실물 모듈에서 확인해요.",
            )
            return
        if self.status == "sleep" and cmd not in (0x0B, 0x0C, 0x43, 0x44):
            self._set_issue("sleeping", "모듈이 잠자기(0x0A) 상태라 명령을 받지 않았어요. 먼저 깨우기(0x0B)를 보내요.")
            self._reply(CMD_ERROR, ERROR_SLEEPING)
            return
        self.commands += 1
        self.issue = None
        self.issue_text = None
        if frame["feedback"]:
            self._reply(CMD_ACK, 0)
        if cmd == 0x03:
            self._play(param)
        elif cmd == 0x01:
            # 곡 번호(pointer)의 다음 곡 — 1번 곡을 끝까지 들은 뒤(pointer 2)의 "다음"은 3번 곡(설명서 3.3.2 4번)
            self._play(self.pointer % FILE_COUNT + 1)
        elif cmd == 0x02:
            self._play(FILE_COUNT if self.pointer <= 1 else self.pointer - 1)
        elif cmd == 0x04:
            self.volume = min(MAX_VOLUME, self.volume + 1)
        elif cmd == 0x05:
            self.volume = max(0, self.volume - 1)
        elif cmd == 0x06:
            self.volume = max(0, min(MAX_VOLUME, param))
            if param > MAX_VOLUME:
                self._set_issue("volume", f"볼륨은 0~30이에요. {param}을(를) 보내서 30으로 맞췄어요(실물 모듈의 처리는 확인 전).")
        elif cmd == 0x07:
            self.eq = param if 0 <= param <= MAX_EQ else self.eq
        elif cmd == 0x0A:
            self._pause_clock()
            self.status = "sleep"
        elif cmd == 0x0B:
            if self.status == "sleep":
                self.status = "stopped"
        elif cmd == 0x0C:
            self.status = "stopped"
            self.track = None
            self.pointer = 1
            self.volume = DEFAULT_VOLUME
            self.eq = 0
            self.loop = "none"
            self.position_ns = 0
            self.resumed_at_ns = None
            self._reply(CMD_ONLINE, 0x02)
        elif cmd == 0x0D:
            if self.status == "paused":
                self.status = "playing"
                self.resumed_at_ns = self._now()
            elif self.status == "stopped":
                self._play(self.pointer)
        elif cmd == 0x0E:
            if self.status == "playing":
                self._pause_clock()
                self.status = "paused"
        elif cmd == 0x11:
            self.loop = "all" if param & 0xFF else "none"
        elif cmd == 0x16:
            self._pause_clock()
            self.status = "stopped"
            self.position_ns = 0
        elif cmd == 0x19:
            self.loop = "one" if (param & 0xFF) == 0 else "none"
        elif cmd == 0x43:
            self._reply(0x43, self.volume)
        elif cmd == 0x44:
            self._reply(0x44, self.eq)

    def _now(self):
        return apc_board.BOARD.clock.now_ns()

    def _pause_clock(self):
        if self.status == "playing" and self.resumed_at_ns is not None:
            self.position_ns += max(0, self._now() - self.resumed_at_ns)
        self.resumed_at_ns = None

    def _play(self, number):
        if number < 1 or number > FILE_COUNT:
            self._set_issue(
                "no-file",
                f"{number}번 곡이 없어요. 가상 SD 카드에는 001.mp3~{FILE_COUNT:03d}.mp3({FILE_COUNT}곡)만 있어요.",
            )
            self._reply(CMD_ERROR, ERROR_FILE_INDEX_OUT)
            return
        self.track = number
        self.pointer = number
        self.status = "playing"
        self.position_ns = 0
        self.resumed_at_ns = self._now()
        self.play_id += 1

    def finish_due_ns(self):
        """재생 중인 곡이 끝날 가상 시각(나노초). 재생 중이 아니면 None — 가상 시각 알람(_wake)이 wait_ns를 이 시각에 깨운다."""
        if self.status != "playing" or self.track is None or self.resumed_at_ns is None:
            return None
        length = TRACK_LENGTHS_MS[self.track - 1] * 1_000_000
        return self.resumed_at_ns + max(0, length - self.position_ns)

    def advance(self):
        """가상 시계로 곡이 끝났는지 본다: 끝나면 멈추고 다음 곡을 가리키며 0x3D를 보낸다(한 곡 반복·전체 반복이면 이어 튼다).
        보통은 가상 시각 알람(_wake)이 곡 끝 시각에 부른다. 늦게 알아채도(계산만 하는 반복문 뒤 등) 곡이 끝난 그 가상 시각을 기준으로
        다음 곡을 시작하고 응답을 보낸다(apc_board_uart.deliver at_ns)."""
        changed = False
        now = self._now()
        while True:
            finish_at = self.finish_due_ns()
            if finish_at is None or now < finish_at:
                break
            changed = True
            finished = self.track
            if self.loop == "one":
                self.position_ns = 0
                self.resumed_at_ns = finish_at
                self.play_id += 1
            elif self.loop == "all":
                self._play(finished % FILE_COUNT + 1)
                self.resumed_at_ns = finish_at
            else:
                self.status = "stopped"
                self.position_ns = 0
                self.resumed_at_ns = None
                self.pointer = finished % FILE_COUNT + 1
                self._reply(CMD_TF_FINISHED, finished, finish_at)
        if changed:
            self.publish()

    # ── 화면 ──

    def _set_issue(self, code, text):
        self.issue = code
        self.issue_text = text

    def publish(self):
        position = self.position_ns
        if self.status == "playing" and self.resumed_at_ns is not None:
            position += max(0, self._now() - self.resumed_at_ns)
        apc_board.set_device_state(
            self.id,
            PART_ID,
            {
                "v": 1,
                "status": self.status,
                "track": self.track,
                "volume": self.volume,
                "eq": self.eq,
                "loop": self.loop,
                "playId": self.play_id,
                "positionMs": position // 1_000_000,
                "commands": self.commands,
                "last": self.last,
                "ignored": self.ignored,
                "issue": self.issue,
                "issueText": self.issue_text,
                "replies": self.replies,
            },
        )


def _hex(values):
    return " ".join(f"{int(value) & 0xFF:02X}" for value in values[:12]) + (" …" if len(values) > 12 else "")


apc_board.register_part(PART_ID, Mp3Module)
