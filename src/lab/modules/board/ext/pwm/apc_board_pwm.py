"""가상 ESP32 보드의 machine.PWM(PLAN §8.3 P3-03, §6.2, CODE_MAPPING §3.8.1, src/lab/README.md 7.6·7.10). 보드 핵심은 apc_board.py.

학생 코드는 실물 보드와 똑같이 쓴다(ESP32 실습실에서만 — 이 파일은 machine.py가 import할 때 확장으로 들어온다):

    from machine import Pin, PWM
    led = PWM(Pin(27), freq=1000)    # 주파수(Hz). PWM(27)처럼 번호만 적어도 된다
    led.duty(512)                    # 켜진 시간 비율 0~1023(512면 절반) → 가상 부품의 밝기·버저 소리·서보 각도·팬 속도
    led.duty_u16(32768)              # 같은 비율을 0~65535로
    led.freq(262)                    # 주파수 바꾸기(버저의 음 높이)
    print(led.freq(), led.duty())    # 읽기
    led.deinit()                     # 끄기

실물과 같게 맞춘 것 — MicroPython v1.29.0 ports/esp32/machine_pwm.c·extmod/machine_pwm.c·py/argcheck.c, ESP-IDF v5.5
esp_driver_ledc/src/ledc.c(2026-09-18 원문 확인). 코드는 옮기지 않고 같은 규칙을 파이썬으로 다시 썼다.
- 범위와 오류 문구: duty 0~1023 → 밖이면 ValueError("duty must be from 0 to 1023"), duty_u16 0~65535 → ValueError("duty_u16 must be from
  0 to 65536")(문구의 숫자는 실물 그대로 65536), duty_ns 0~한 주기 → ValueError("duty_ns must be from 0 to N ns"), freq 1Hz~40MHz →
  ValueError("frequency must be from 1Hz to 40MHz"). 소수·글자는 TypeError("can't convert float to int"). deinit() 뒤의 freq()·duty() 읽기·쓰기는
  RuntimeError("PWM is inactive"). 새 PWM을 duty_ns=…로 만들면 실물 소스처럼 RuntimeError("PWM is inactive")가 난다(한 주기 길이를 아직 몰라서).
- 기본값: freq를 적지 않으면 그 핀의 채널이 쓰던 주파수, 없으면 5000Hz. duty를 적지 않은 새 PWM은 50%(duty_u16 32768) — PWM(Pin(15))만 해도
  5kHz 소리가 난다. duty(1023)·duty_u16(65535)는 100%(늘 켜짐)로 바꿔 넣는다.
- LEDC 주변장치: 채널 16개(고속·저속 모드 × 8)·타이머 8개(× 4). 같은 주파수는 타이머를 함께 쓰고, 채널이 모자라면 RuntimeError("out of PWM
  channels:16"), 서로 다른 주파수가 9개째면 RuntimeError("out of PWM timers:8"). 채널·타이머를 고르는 순서도 소스와 같다.
- 해상도와 읽기 값: 80MHz 클럭(10Hz 미만은 1MHz)으로 주파수마다 duty 비트 수(최대 16)가 정해지고, freq()·duty()·duty_u16()·repr은 그 해상도와
  나눗수로 계산한 값을 돌려준다(예: freq(262) → 262, 5kHz에서 duty(1) → 1, 100kHz에서 duty(1) → 0).
- 핀: Pin 객체나 번호. 34~39번(입력 전용)은 실물처럼 OSError: (-258, 'ESP_ERR_INVALID_ARG')(ledc_channel_config의 GPIO 검사).
  PWM이 켜진 핀을 Pin(n, …)으로 다시 정하면 신호가 핀에서 끊기고, 같은 PWM 객체로 duty를 바꿔도 다시 이어지지 않는다(실물: 새 채널 배정 때만
  핀을 잇는다) — 콘솔에 한 번 알린다. deinit() 뒤 새 PWM을 만들면 다시 이어진다.
- 화면: 핀에 실제로 나가는 신호를 apc_board.BOARD.set_pwm(핀, 켜진 비율, 실제 주파수)로 알린다 → board.state 핀 항목 mode 'pwm'·duty·freq(README 7.3).
  실행마다 보드를 새로 켜므로 채널·타이머도 비운다(지난 실행의 PWM 객체는 멈춘 것으로 본다).

가상 보드와 다른 점(흉내 내지 않음 — 차이는 콘솔 안내·교사용 접기로)
- 실물 LEDC는 새 duty를 다음 주기부터 반영해, 1Hz처럼 느린 주파수에서 바로 duty()를 읽으면 옛 값이 나올 수 있다. 가상 보드는 바로 반영한다.
- lightsleep=True의 클럭(RC_FAST)은 흉내 내지 않고 받기만 한다. invert=True에서 deinit()한 뒤의 쉬는 전압, deinit() 뒤 Pin으로 다시 정하지 않은 핀의
  출력은 실물(LEDC가 계속 LOW를 냄)과 다르게 PWM 전 상태로 돌아간다.
라이선스: 사이트 소프트웨어(MIT, PD-26).
"""

import apc_board
import apc_runtime

__all__ = ["PWM", "ledc_frequency", "duty_resolution"]

# ── ESP32 LEDC(ESP-IDF v5.5, soc_caps.h) ──
LEDC_SPEED_MODE_MAX = 2  # 고속(0)·저속(1)
LEDC_HIGH_SPEED_MODE = 0
LEDC_CHANNEL_MAX = 8
LEDC_TIMER_MAX = 4
SOC_LEDC_TIMER_BIT_WIDTH = 20
LEDC_LL_FRACTIONAL_BITS = 8
LEDC_LL_FRACTIONAL_MAX = (1 << LEDC_LL_FRACTIONAL_BITS) - 1
LEDC_TIMER_DIV_NUM_MAX = 0x3FFFF
APB_CLK_HZ = 80_000_000
REF_TICK_HZ = 1_000_000
ESP_ERR_INVALID_ARG = 0x102

# ── MicroPython machine_pwm.c ──
UI_RES_10_BIT = 10
UI_RES_16_BIT = 16
DUTY_10 = UI_RES_10_BIT
DUTY_16 = UI_RES_16_BIT
DUTY_NS = 1
MAX_10_DUTY = 1 << UI_RES_10_BIT
MAX_16_DUTY = 1 << UI_RES_16_BIT
PWM_FREQ = 5000
PWM_DUTY = MAX_16_DUTY // 2
EMPIRIC_FREQ = 10
UPPER_FREQ = 40_000_000

_INT_MIN = -(1 << 31)
_INT_MAX = (1 << 31) - 1


class _Channel:
    __slots__ = ("pin", "timer", "lightsleep", "duty", "routed", "invert", "on_board")

    def __init__(self):
        self.clear()

    def clear(self):
        self.pin = -1
        self.timer = -1
        self.lightsleep = False
        self.duty = 0  # 하드웨어 duty 레지스터 값(타이머 해상도 기준)
        self.routed = False  # 핀이 이 채널의 신호를 내보내는지(새 배정 때 이어지고, Pin(…)으로 다시 정하면 끊긴다)
        self.invert = False
        self.on_board = False  # 가상 보드 핀에 set_pwm으로 알린 적이 있는지


class _Timer:
    __slots__ = ("freq", "resolution", "clock")

    def __init__(self):
        self.clear()

    def clear(self):
        self.freq = -1
        self.resolution = 0
        self.clock = 0


class _Ledc:
    def __init__(self):
        self.generation = 0
        self.chans = []
        self.timers = []
        self.reset()

    def reset(self):
        """보드를 새로 켤 때(실행 시작): 채널·타이머를 모두 비운다. 지난 실행의 PWM 객체는 세대 번호로 알아본다."""
        self.generation += 1
        self.chans = [[_Channel() for _ in range(LEDC_CHANNEL_MAX)] for _ in range(LEDC_SPEED_MODE_MAX)]
        self.timers = [[_Timer() for _ in range(LEDC_TIMER_MAX)] for _ in range(LEDC_SPEED_MODE_MAX)]


LEDC = _Ledc()


def _reset():
    LEDC.reset()


# ───────────────────────── 값 바꾸기·오류 ─────────────────────────


def _get_int(value):
    """mp_obj_get_int: bool·int만(소수·글자는 TypeError), 32비트 보드의 기계 정수에 안 들어가면 OverflowError."""
    number = apc_board.mp_int(value)
    if number < _INT_MIN or number > _INT_MAX:
        raise OverflowError("overflow converting long int to machine word")
    return number


def _esp_error(code):
    """check_esp_err(ESP32 포트 mphalport.c): OSError(-코드, 'ESP_ERR_…') — 출력은 `OSError: (-258, 'ESP_ERR_INVALID_ARG')`."""
    names = {ESP_ERR_INVALID_ARG: "ESP_ERR_INVALID_ARG"}
    error = OSError()
    error.args = (-code, names.get(code, "ESP_FAIL"))
    error.errno = -code
    return error


def _check_call(args, kwargs, most):
    """MP_DEFINE_CONST_FUN_OBJ_VAR_BETWEEN(…, 1, most, …)의 인자 검사(self 포함한 개수)"""
    if kwargs:
        raise TypeError("function doesn't take keyword arguments")
    if len(args) + 1 > most:
        raise TypeError(f"function expected at most {most} arguments, got {len(args) + 1}")


def _check_one(args, kwargs):
    """MP_DEFINE_CONST_FUN_OBJ_1(self만 받는 함수)의 인자 검사"""
    if kwargs:
        raise TypeError("function doesn't take keyword arguments")
    if args:
        raise TypeError(f"function takes 1 positional arguments but {len(args) + 1} were given")


# ───────────────────────── 해상도·주파수(ESP-IDF ledc.c) ─────────────────────────


def _ilog2(value):
    log = 0
    while value > 1:
        value >>= 1
        log += 1
    return log


def _calculate_divisor(clock, freq, precision):
    """ledc_calculate_divisor: ((클럭 << 8) + 주파수 × 정밀도 / 2) / (주파수 × 정밀도)"""
    return ((clock << LEDC_LL_FRACTIONAL_BITS) + freq * precision // 2) // (freq * precision)


def _divisor_invalid(divisor):
    return divisor <= LEDC_LL_FRACTIONAL_MAX or divisor > LEDC_TIMER_DIV_NUM_MAX


def duty_resolution(clock, freq):
    """ESP-IDF ledc_find_suitable_duty_resolution + MicroPython find_suitable_duty_resolution(16비트로 제한)"""
    divisor = (clock + freq // 2) // freq
    resolution = min(_ilog2(divisor), SOC_LEDC_TIMER_BIT_WIDTH) if divisor > 0 else 0
    if _divisor_invalid(_calculate_divisor(clock, freq, 1 << resolution)):
        divisor = clock // freq
        resolution = min(_ilog2(divisor), SOC_LEDC_TIMER_BIT_WIDTH) if divisor > 0 else 0
        if _divisor_invalid(_calculate_divisor(clock, freq, 1 << resolution)):
            resolution = 0
    if resolution > UI_RES_16_BIT:
        resolution = UI_RES_16_BIT
    if resolution >= SOC_LEDC_TIMER_BIT_WIDTH:
        resolution -= 1
    return resolution


def ledc_frequency(mode, timer):
    """ledc_get_freq: 타이머에 적힌 나눗수로 되계산한 실제 주파수(설정 전이면 0)"""
    entry = LEDC.timers[mode][timer]
    if entry.freq <= 0:
        return 0
    precision = 1 << entry.resolution
    divisor = _calculate_divisor(entry.clock, entry.freq, precision)
    if divisor == 0:
        return 0
    return ((entry.clock << LEDC_LL_FRACTIONAL_BITS) + precision * divisor // 2) // (precision * divisor)


# ───────────────────────── 채널·타이머(machine_pwm.c) ─────────────────────────


def _modes(pwm):
    """light sleep을 켠 PWM은 고속 모드를 쓰지 않는다(SOC_LEDC_SUPPORT_HS_MODE)"""
    return [mode for mode in range(LEDC_SPEED_MODE_MAX) if not (pwm._lightsleep and mode == LEDC_HIGH_SPEED_MODE)]


def _register_channel(mode, channel, pin, timer):
    entry = LEDC.chans[mode][channel]
    entry.pin = pin
    entry.timer = timer


def _unregister_channel(mode, channel):
    if 0 <= mode < LEDC_SPEED_MODE_MAX and 0 <= channel < LEDC_CHANNEL_MAX:
        LEDC.chans[mode][channel].clear()


def _unregister_timer(mode, timer):
    if 0 <= mode < LEDC_SPEED_MODE_MAX and 0 <= timer < LEDC_TIMER_MAX:
        LEDC.timers[mode][timer].clear()


def _is_timer_in_use(mode, current_channel, timer):
    for channel in range(LEDC_CHANNEL_MAX):
        entry = LEDC.chans[mode][channel]
        if channel != current_channel and entry.timer == timer and entry.pin >= 0:
            return True
    return False


def _is_free_channels(mode, pin):
    return any(entry.pin < 0 or entry.pin == pin for entry in LEDC.chans[mode])


def _is_free_timers(mode, freq):
    return any(entry.freq < 0 or entry.freq == freq for entry in LEDC.timers[mode])


def _find_channel(pwm, freq):
    for mode in _modes(pwm):
        for channel in range(LEDC_CHANNEL_MAX):
            if LEDC.chans[mode][channel].pin == pwm._pin:
                return mode, channel
    for mode in _modes(pwm):
        for channel in range(LEDC_CHANNEL_MAX):
            if LEDC.chans[mode][channel].pin < 0 and _is_free_timers(mode, freq):
                return mode, channel
    return -1, -1


def _find_timer(pwm, freq):
    for mode in _modes(pwm):
        if _is_free_channels(mode, pwm._pin):
            for timer in range(LEDC_TIMER_MAX):
                if LEDC.timers[mode][timer].freq == freq:
                    return mode, timer
    return -1, -1


def _select_timer(pwm, freq):
    mode, timer = _find_timer(pwm, freq)
    if timer < 0:
        if pwm._mode >= 0 and pwm._channel >= 0 and not _is_timer_in_use(pwm._mode, pwm._channel, pwm._timer):
            mode, timer = pwm._mode, pwm._timer
        if timer < 0:
            mode, timer = _find_timer(pwm, -1)
    if timer < 0:
        count = LEDC_TIMER_MAX if pwm._lightsleep else LEDC_SPEED_MODE_MAX * LEDC_TIMER_MAX
        raise RuntimeError("out of %sPWM timers:%d" % ("light sleep capable " if pwm._lightsleep else "", count))
    if pwm._timer != timer:
        _unregister_channel(pwm._mode, pwm._channel)
        pwm._mode = mode
        pwm._timer = timer
        _register_channel(pwm._mode, pwm._channel, -1, pwm._timer)


def _check_freq_ranges(freq, upper):
    if freq <= 0 or freq > upper:
        raise ValueError(f"frequency must be from 1Hz to {upper // 1_000_000}MHz")


def _set_freq(pwm, freq):
    pwm._freq = freq
    entry = LEDC.timers[pwm._mode][pwm._timer]
    if entry.freq != freq or pwm._lightsleep:
        clock = REF_TICK_HZ if freq < EMPIRIC_FREQ else APB_CLK_HZ
        _check_freq_ranges(freq, clock // 2)
        entry.freq = freq
        entry.resolution = duty_resolution(clock, freq)
        entry.clock = clock


# ───────────────────────── duty(machine_pwm.c) ─────────────────────────


def _self_reset(pwm):
    pwm._mode = -1
    pwm._channel = -1
    pwm._timer = -1
    pwm._freq = -1
    pwm._duty_scale = 0
    pwm._duty_ui = 0
    pwm._channel_duty = -1
    pwm._invert = False
    pwm._invert_prev = False
    pwm._lightsleep = False
    pwm._generation = LEDC.generation


def _fresh(pwm):
    """지난 실행(보드를 새로 켜기 전)에 만든 PWM 객체면 멈춘 것으로 되돌린다."""
    if pwm._generation != LEDC.generation:
        _self_reset(pwm)


def _pwm_is_active(pwm):
    _fresh(pwm)
    if pwm._timer < 0:
        raise RuntimeError("PWM is inactive")


def _ns_to_duty(pwm, ns):
    _pwm_is_active(pwm)
    duty = (ns * MAX_16_DUTY * pwm._freq + 500_000_000) // 1_000_000_000
    if ns > 0 and duty == 0:
        duty = 1
    elif duty > MAX_16_DUTY:
        duty = MAX_16_DUTY
    return duty


def _duty_to_ns(pwm, duty):
    _pwm_is_active(pwm)
    return (duty * 1_000_000_000 + pwm._freq * (MAX_16_DUTY // 2)) // (pwm._freq * MAX_16_DUTY)


def _get_duty_u16(pwm):
    _pwm_is_active(pwm)
    channel = LEDC.chans[pwm._mode][pwm._channel]
    timer = LEDC.timers[pwm._mode][pwm._timer]
    duty = channel.duty << (UI_RES_16_BIT - timer.resolution)
    return duty if duty != MAX_16_DUTY else MAX_16_DUTY - 1


def _get_duty_u10(pwm):
    return _get_duty_u16(pwm) >> (UI_RES_16_BIT - UI_RES_10_BIT)


def _get_duty_ns(pwm):
    return _duty_to_ns(pwm, _get_duty_u16(pwm))


def _check_duty_u16(pwm, duty):
    if duty < 0 or duty > MAX_16_DUTY - 1:
        raise ValueError(f"duty_u16 must be from 0 to {MAX_16_DUTY}")
    if duty == MAX_16_DUTY - 1:
        duty = MAX_16_DUTY
    pwm._duty_scale = DUTY_16
    pwm._duty_ui = duty


def _check_duty_u10(pwm, duty):
    if duty < 0 or duty > MAX_10_DUTY - 1:
        raise ValueError(f"duty must be from 0 to {MAX_10_DUTY - 1}")
    if duty == MAX_10_DUTY - 1:
        duty = MAX_10_DUTY
    pwm._duty_scale = DUTY_10
    pwm._duty_ui = duty


def _check_duty_ns(pwm, ns):
    if ns < 0 or ns > _duty_to_ns(pwm, MAX_16_DUTY):
        raise ValueError("duty_ns must be from 0 to %d ns" % _duty_to_ns(pwm, MAX_16_DUTY))
    pwm._duty_scale = DUTY_NS
    pwm._duty_ui = ns


_REINIT_NOTICE = (
    "{pin}번 핀을 Pin({pin}, …)으로 다시 정해서 PWM 신호가 이 핀에서 끊겼어요. 실물 보드도 같은 PWM 객체로 duty를 바꿔서는 다시 이어지지 않아요. "
    "PWM을 다시 쓰려면 pwm.deinit() 뒤 PWM(Pin({pin}))을 새로 만들어요."
)


def _sync_board(mode, channel):
    """이 채널이 핀에 실제로 내보내는 신호를 가상 보드 핀에 알린다(board.state의 mode 'pwm'·duty·freq)."""
    entry = LEDC.chans[mode][channel]
    if entry.pin < 0 or entry.timer < 0 or not entry.routed:
        return
    board = apc_board.BOARD
    if entry.on_board and board.pwm_of(entry.pin) is None:
        # Pin(…)으로 핀을 다시 정해 GPIO 기능으로 돌아갔다(apc_board.Board.configure) — 새 배정 전까지 이어지지 않는다
        entry.routed = False
        board.warn_once(("pwm-pin-reinit", entry.pin), _REINIT_NOTICE.format(pin=entry.pin))
        return
    timer = LEDC.timers[mode][entry.timer]
    ratio = min(1.0, entry.duty / float(1 << timer.resolution)) if timer.freq > 0 else 0.0
    if entry.invert:
        ratio = 1.0 - ratio
    board.set_pwm(entry.pin, ratio, ledc_frequency(mode, entry.timer))
    entry.on_board = True


def _apply_duty(pwm):
    _pwm_is_active(pwm)
    if pwm._duty_scale == DUTY_16:
        duty = pwm._duty_ui
    elif pwm._duty_scale == DUTY_10:
        duty = pwm._duty_ui << (UI_RES_16_BIT - UI_RES_10_BIT)
    elif pwm._duty_scale == DUTY_NS:
        duty = _ns_to_duty(pwm, pwm._duty_ui)
    else:
        duty = 0
    timer = LEDC.timers[pwm._mode][pwm._timer]
    pwm._channel_duty = duty >> (UI_RES_16_BIT - timer.resolution)
    entry = LEDC.chans[pwm._mode][pwm._channel]
    if entry.pin == -1 or pwm._invert_prev != pwm._invert:
        pwm._invert_prev = pwm._invert
        # 새 배정: ledc_channel_config(출력할 수 있는 GPIO인지 검사) → 핀을 LEDC 신호에 잇는다
        if pwm._pin >= apc_board.FIRST_INPUT_ONLY_GPIO:
            apc_board.BOARD.warn_once(
                ("pwm-input-only", pwm._pin),
                f"{pwm._pin}번 핀은 입력 전용(34~39번)이라 PWM 신호를 내보낼 수 없어요. 실물 보드도 OSError: (-258, 'ESP_ERR_INVALID_ARG')로 멈춰요. "
                "LED·버저·서보는 0~33번 가운데 쓸 수 있는 핀에 이어요.",
            )
            raise _esp_error(ESP_ERR_INVALID_ARG)
        entry.duty = pwm._channel_duty
        entry.routed = True
        entry.invert = pwm._invert
        entry.on_board = False
        board = apc_board.BOARD
        board.warn_special_output(pwm._pin)
        board.check_mode_against_wiring(pwm._pin, apc_board.MODE_OUT)
    else:
        entry.duty = pwm._channel_duty
    if pwm._lightsleep:
        entry.lightsleep = True
    _register_channel(pwm._mode, pwm._channel, pwm._pin, pwm._timer)
    _sync_board(pwm._mode, pwm._channel)


def _set_freq_duty(pwm, freq):
    _select_timer(pwm, freq)
    _set_freq(pwm, freq)
    _apply_duty(pwm)


def _pwm_deinit(mode, channel):
    if not (0 <= mode < LEDC_SPEED_MODE_MAX and 0 <= channel < LEDC_CHANNEL_MAX):
        return
    entry = LEDC.chans[mode][channel]
    if entry.timer >= 0 and not _is_timer_in_use(mode, channel, entry.timer):
        _unregister_timer(mode, entry.timer)
    if entry.pin >= 0 and entry.routed and entry.on_board:
        board = apc_board.BOARD
        if board.pwm_of(entry.pin) is not None:
            board.clear_pwm(entry.pin)
    _unregister_channel(mode, channel)


_INIT_NAMES = ("freq", "duty", "duty_u16", "duty_ns", "invert", "lightsleep")
_KW_ONLY = frozenset(("duty", "duty_u16", "duty_ns", "invert", "lightsleep"))


def _parse_init_args(pwm, args, kwargs):
    """mp_arg_parse_all과 같은 순서: 허용한 이름 차례로 값을 바꾸고(형 오류가 먼저), 남은 위치 인자·키워드 인자를 오류로."""
    values = {}
    used_keywords = 0
    for index, name in enumerate(_INIT_NAMES):
        if index < len(args):
            if name in _KW_ONLY:
                raise TypeError("extra positional arguments given")
            given = args[index]
        elif name in kwargs:
            used_keywords += 1
            given = kwargs[name]
        else:
            continue
        values[name] = bool(given) if name in ("invert", "lightsleep") else _get_int(given)
    if len(args) > len(_INIT_NAMES):
        raise TypeError("extra positional arguments given")
    if used_keywords < len(kwargs):
        raise TypeError("extra keyword arguments given")
    return values


def _init_helper(pwm, args, kwargs):
    _fresh(pwm)
    values = _parse_init_args(pwm, args, kwargs)
    pwm._lightsleep = values.get("lightsleep", pwm._lightsleep)
    freq = values.get("freq", -1)
    if freq != -1:
        _check_freq_ranges(freq, UPPER_FREQ)
    duty = values.get("duty", -1)
    duty_u16 = values.get("duty_u16", -1)
    duty_ns = values.get("duty_ns", -1)
    if duty_u16 >= 0:
        _check_duty_u16(pwm, duty_u16)
    elif duty_ns >= 0:
        _check_duty_ns(pwm, duty_ns)
    elif duty >= 0:
        _check_duty_u10(pwm, duty)
    elif pwm._duty_scale == 0:
        pwm._duty_scale = DUTY_16
        pwm._duty_ui = PWM_DUTY
    pwm._invert = values.get("invert", pwm._invert)
    mode, channel = _find_channel(pwm, freq)
    if channel < 0:
        count = LEDC_CHANNEL_MAX if pwm._lightsleep else LEDC_SPEED_MODE_MAX * LEDC_CHANNEL_MAX
        raise RuntimeError("out of %sPWM channels:%d" % ("light sleep capable " if pwm._lightsleep else "", count))
    pwm._mode = mode
    pwm._channel = channel
    if freq == -1 and mode >= 0 and channel >= 0:
        entry = LEDC.chans[mode][channel]
        if entry.timer >= 0:
            freq = LEDC.timers[mode][entry.timer].freq
        if freq <= 0:
            freq = PWM_FREQ
    _set_freq_duty(pwm, freq)


class PWM:
    """machine.PWM(dest, freq, *, duty, duty_u16, duty_ns, invert, lightsleep) — 머리말의 "실물과 같게 맞춘 것"."""

    def __init__(self, *args, **kwargs):
        if len(args) < 1:
            raise TypeError(f"function missing {1 - len(args)} required positional arguments")
        if len(args) > 2:
            raise TypeError(f"function expected at most 2 arguments, got {len(args)}")
        _self_reset(self)
        self._pin = apc_board.find_pin(args[0])
        _init_helper(self, args[1:], kwargs)

    def init(self, *args, **kwargs):
        _init_helper(self, args, kwargs)

    def deinit(self, *args, **kwargs):
        _check_one(args, kwargs)
        _fresh(self)
        _pwm_deinit(self._mode, self._channel)
        _self_reset(self)

    def freq(self, *args, **kwargs):
        _check_call(args, kwargs, 2)
        if not args:
            _pwm_is_active(self)
            return ledc_frequency(self._mode, self._timer)
        value = _get_int(args[0])
        _pwm_is_active(self)
        _check_freq_ranges(value, UPPER_FREQ)
        if value == LEDC.timers[self._mode][self._timer].freq:
            return None
        _set_freq_duty(self, value)
        return None

    def duty(self, *args, **kwargs):
        _check_call(args, kwargs, 2)
        if not args:
            return _get_duty_u10(self)
        value = _get_int(args[0])
        _fresh(self)
        _check_duty_u10(self, value)
        _apply_duty(self)
        return None

    def duty_u16(self, *args, **kwargs):
        _check_call(args, kwargs, 2)
        if not args:
            return _get_duty_u16(self)
        value = _get_int(args[0])
        _fresh(self)
        _check_duty_u16(self, value)
        _apply_duty(self)
        return None

    def duty_ns(self, *args, **kwargs):
        _check_call(args, kwargs, 2)
        if not args:
            return _get_duty_ns(self)
        value = _get_int(args[0])
        _fresh(self)
        _check_duty_ns(self, value)
        _apply_duty(self)
        return None

    def __repr__(self):
        _fresh(self)
        text = f"PWM(Pin({self._pin})"
        if self._timer >= 0:
            text += f", freq={ledc_frequency(self._mode, self._timer)}"
            if self._duty_scale == DUTY_10:
                text += f", duty={_get_duty_u10(self)}"
            elif self._duty_scale == DUTY_NS:
                text += f", duty_ns={_get_duty_ns(self)}"
            else:
                text += f", duty_u16={_get_duty_u16(self)}"
            if self._invert:
                text += ", invert=True"
            if self._lightsleep:
                text += ", lightsleep=True"
        return text + ")"


apc_runtime.register_reset_hook(_reset)
apc_board.register_machine_export("PWM", PWM)
