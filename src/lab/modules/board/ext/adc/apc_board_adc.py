"""가상 ESP32 보드의 machine.ADC(PLAN §8.3 P3-03, §6.2 "4채널 아날로그 터치", CODE_MAPPING §3.8.1, src/lab/README.md 7.6·7.10).

학생 코드는 실물 보드와 똑같이 쓴다:

    from machine import ADC, Pin
    touch = ADC(Pin(32))            # 아날로그 입력 핀(ADC(32)처럼 번호만 적어도 된다)
    touch.atten(ADC.ATTN_11DB)      # 측정 범위(감쇠) — 교과서: "전압 범위를 최대 3.3V까지"
    touch.width(ADC.WIDTH_12BIT)    # 해상도 — 교과서: "0~4095"
    value = touch.read()            # 입력 확인 지점: 화면의 부품(4채널 터치 등)이 건 전압이 여기서 들어온다
    touch.read_u16()                # 0~65535
    touch.read_uv()                 # 마이크로볼트(밀리볼트 단위)

실물과 같게 맞춘 것 — MicroPython v1.29.0 ports/esp32/machine_adc.c·adc.h·adc.c·machine_adc_block.c·mpconfigport.h, extmod/machine_adc.c
(2026-09-18 원문 확인). 코드는 옮기지 않고 같은 규칙을 파이썬으로 다시 썼다.
- 쓸 수 있는 핀: ADC1 36·37·38·39·32·33·34·35, ADC2 4·0·2·15·13·12·14·27·25·26. 그 밖의 핀(5·16~19·21~23·1·3)은 ValueError("invalid pin").
  같은 핀의 ADC 객체는 하나다(ADC(Pin(32)) is ADC(Pin(32))).
- 감쇠: ATTN_0DB 0·ATTN_2_5DB 1·ATTN_6DB 2·ATTN_11DB 3. atten을 적지 않고 만들거나 init()하면 ATTN_11DB(ADC_ATTEN_MAX). 0~3 밖은
  ValueError("invalid attenuation"). 감쇠는 핀마다 기억한다.
- 해상도: WIDTH_9BIT 9 ~ WIDTH_12BIT 12(기본 12), width()는 같은 ADC 블록(ADC1·ADC2)의 모든 핀에 적용, 밖이면 ValueError("invalid bit-width").
- read()는 그 해상도의 값, read_u16()은 raw << (16 − 비트) | raw >> (2×비트 − 16), read_uv()는 밀리볼트 × 1000. 세 가지 모두 입력 확인 지점이다
  (P3-00 차이 표 12번 — [정지]·화면 입력·Timer 콜백이 여기서 돈다).
- repr: ADC(Pin(32), atten=3). 인자 개수·키워드 오류 문구는 py/argcheck.c와 같다.

가상 보드의 단순화(실물과 다른 점 — 교사용 접기·부록 B-2 10번 "4채널 측정값"으로 확인)
- 전압 → 값: 부품이 핀에 건 전압(apc_board.BOARD.read_millivolts, 0~3300mV)을 감쇠마다 정한 끝 전압까지 곧은 비율로 바꾼다:
  값(12비트) = 내림(전압 × 4095 ÷ 끝 전압), 끝 전압 이상은 4095. 끝 전압은 ATTN_11DB 3300mV(교과서 138쪽 주석 "전압 범위를 최대 3.3 V까지
  측정 가능하도록 설정"·"해상도를 12비트로 설정(범위: 0~4095)"), ATTN_6DB 1750mV·ATTN_2_5DB 1250mV·ATTN_0DB 950mV(MicroPython ESP32 빠른
  참조의 측정 범위 윗값). 실물은 곡선이 휘고 보드마다 보정값이 달라 같은 전압에서도 수십씩 다르게 읽힌다.
- 해상도를 낮추면 12비트 값을 오른쪽으로 민 값(9비트면 ÷ 8)이다. read_uv()는 보정 곡선 대신 같은 곧은 비율로 되계산한다.
- ADCBlock·adc.block()은 흉내 내지 않는다(쓰면 한국어 안내가 든 ImportError). deinit()은 아무 일도 하지 않는다.
- 부품이 없는 핀을 읽으면 0이다(실물은 떠 있는 핀이라 들쭉날쭉) — 배선을 받은 실행이면 콘솔에 한 번 알린다.
라이선스: 사이트 소프트웨어(MIT, PD-26).
"""

import apc_board
import apc_runtime

__all__ = ["ADC", "ADC_CHANNELS", "FULL_SCALE_MV", "raw12_from_millivolts"]

#: GPIO → (ADC 블록, 채널) — ESP32 madc_obj 표(machine_adc.c)
ADC_CHANNELS = {
    36: (1, 0),
    37: (1, 1),
    38: (1, 2),
    39: (1, 3),
    32: (1, 4),
    33: (1, 5),
    34: (1, 6),
    35: (1, 7),
    4: (2, 0),
    0: (2, 1),
    2: (2, 2),
    15: (2, 3),
    13: (2, 4),
    12: (2, 5),
    14: (2, 6),
    27: (2, 7),
    25: (2, 8),
    26: (2, 9),
}

ATTN_0DB = 0
ATTN_2_5DB = 1
ATTN_6DB = 2
ATTN_11DB = 3
ADC_ATTEN_MIN = ATTN_0DB
ADC_ATTEN_MAX = ATTN_11DB
ADC_WIDTH_MIN = 9
ADC_WIDTH_MAX = 12
RAW12_MAX = 4095

#: 감쇠 → 12비트 값 4095에 닿는 전압(밀리볼트) — 가상 보드의 단순화(머리말)
FULL_SCALE_MV = (950, 1250, 1750, 3300)


def raw12_from_millivolts(millivolts, atten=ATTN_11DB):
    """전압(mV) → 12비트 값(0~4095): 내림(전압 × 4095 ÷ 끝 전압). 화면의 4채널 터치 부품이 같은 식으로 패드 전압을 정한다
    (src/lab/modules/board/parts/touch-analog-4ch/touch4-model.ts — 688·1535·2381·3263이 그대로 읽히게)."""
    full_scale = FULL_SCALE_MV[atten]
    value = int(float(millivolts) * RAW12_MAX // full_scale)
    return max(0, min(RAW12_MAX, value))


class _AdcState:
    def __init__(self):
        self.reset()

    def reset(self):
        """보드를 새로 켤 때(실행 시작): 핀마다 감쇠(0 = 정하지 않음)·블록 해상도(12)·핀별 ADC 객체를 비운다."""
        self.atten = {}
        self.bitwidth = {1: ADC_WIDTH_MAX, 2: ADC_WIDTH_MAX}
        self.objects = {}


STATE = _AdcState()


def _reset():
    STATE.reset()


def _get_int(value):
    number = apc_board.mp_int(value)
    if number < -(1 << 31) or number > (1 << 31) - 1:
        raise OverflowError("overflow converting long int to machine word")
    return number


def _check_one(args, kwargs):
    if kwargs:
        raise TypeError("function doesn't take keyword arguments")
    if args:
        raise TypeError(f"function takes 1 positional arguments but {len(args) + 1} were given")


def _check_two(args, kwargs):
    if kwargs:
        raise TypeError("function doesn't take keyword arguments")
    if len(args) != 1:
        raise TypeError(f"function takes 2 positional arguments but {len(args) + 1} were given")


def _atten_set_helper(gpio, atten):
    if atten < ADC_ATTEN_MIN or atten > ADC_ATTEN_MAX:
        raise ValueError("invalid attenuation")
    STATE.atten[gpio] = atten + 1


def _atten_get_helper(gpio):
    stored = STATE.atten.get(gpio, 0)
    return ADC_ATTEN_MAX if stored == 0 else stored - 1


def _init_helper(gpio, args, kwargs):
    """allowed_args = { atten: KW_ONLY int, 기본 -1 } → 적지 않으면 ADC_ATTEN_MAX"""
    if args:
        raise TypeError("extra positional arguments given")
    atten = -1
    used = 0
    if "atten" in kwargs:
        atten = _get_int(kwargs["atten"])
        used = 1
    if used < len(kwargs):
        raise TypeError("extra keyword arguments given")
    _atten_set_helper(gpio, atten if atten != -1 else ADC_ATTEN_MAX)


class ADC:
    """machine.ADC(dest, *, atten) — 머리말의 "실물과 같게 맞춘 것"."""

    ATTN_0DB = ATTN_0DB
    ATTN_2_5DB = ATTN_2_5DB
    ATTN_6DB = ATTN_6DB
    ATTN_11DB = ATTN_11DB
    WIDTH_9BIT = 9
    WIDTH_10BIT = 10
    WIDTH_11BIT = 11
    WIDTH_12BIT = 12

    def __new__(cls, *args, **kwargs):
        if len(args) < 1:
            raise TypeError(f"function missing {1 - len(args)} required positional arguments")
        gpio = apc_board.find_pin(args[0])
        if gpio not in ADC_CHANNELS:
            raise ValueError("invalid pin")
        existing = STATE.objects.get(gpio)
        if existing is not None:
            return existing
        adc = object.__new__(cls)
        adc._apc_gpio = gpio
        adc._apc_block = ADC_CHANNELS[gpio][0]
        STATE.objects[gpio] = adc
        board = apc_board.BOARD
        board.state(gpio)
        board.mark_dirty()
        return adc

    def __init__(self, *args, **kwargs):
        _init_helper(self._apc_gpio, args[1:], kwargs)

    def init(self, *args, **kwargs):
        _init_helper(self._apc_gpio, args, kwargs)

    def deinit(self, *args, **kwargs):
        _check_one(args, kwargs)

    def block(self, *args, **kwargs):
        _check_one(args, kwargs)
        raise ImportError(
            "machine.ADCBlock(adc.block())은(는) 가상 보드에 아직 없어요(실물 ESP32에는 있어요). 이 기능은 실물 보드에서 확인해요. "
            "값은 adc.read()·read_u16()·read_uv()로 읽어요."
        )

    def _raw(self):
        """입력 확인 지점을 지나 지금 전압을 그 블록 해상도의 값으로"""
        apc_board.check_point()
        gpio = self._apc_gpio
        board = apc_board.BOARD
        millivolts = board.read_millivolts(gpio)
        if board.wiring_known and gpio not in board.wired and gpio not in board.drives and not board.output_enabled(board.pins.get(gpio)):
            board.warn_once(
                ("adc-unwired", gpio),
                f"{gpio}번 핀의 아날로그 값을 읽었지만 이 예제의 배선도에는 {gpio}번 핀에 이은 부품이 없어요. "
                "가상 보드는 0으로 읽고, 실물은 떠 있는 핀이라 값이 들쭉날쭉해요. 코드의 핀 번호가 배선도와 같은지 확인해요.",
            )
        bits = STATE.bitwidth[self._apc_block]
        return raw12_from_millivolts(millivolts, _atten_get_helper(gpio)) >> (ADC_WIDTH_MAX - bits)

    def read(self, *args, **kwargs):
        _check_one(args, kwargs)
        return self._raw()

    def read_u16(self, *args, **kwargs):
        _check_one(args, kwargs)
        raw = self._raw()
        bits = STATE.bitwidth[self._apc_block]
        return (raw << (16 - bits)) | (raw >> (2 * bits - 16))

    def read_uv(self, *args, **kwargs):
        _check_one(args, kwargs)
        raw = self._raw()
        bits = STATE.bitwidth[self._apc_block]
        raw12 = raw << (ADC_WIDTH_MAX - bits)
        full_scale = FULL_SCALE_MV[_atten_get_helper(self._apc_gpio)]
        millivolts = (raw12 * full_scale + RAW12_MAX // 2) // RAW12_MAX
        return millivolts * 1000

    def atten(self, *args, **kwargs):
        _check_two(args, kwargs)
        _atten_set_helper(self._apc_gpio, _get_int(args[0]))

    def width(self, *args, **kwargs):
        _check_two(args, kwargs)
        width = _get_int(args[0])
        if width < ADC_WIDTH_MIN or width > ADC_WIDTH_MAX:
            raise ValueError("invalid bit-width")
        STATE.bitwidth[self._apc_block] = width

    def __repr__(self):
        return f"ADC(Pin({self._apc_gpio}), atten={_atten_get_helper(self._apc_gpio)})"


apc_runtime.register_reset_hook(_reset)
apc_board.register_machine_export("ADC", ADC)
