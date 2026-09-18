"""가상 ESP32 보드의 machine 모듈(PLAN §8.3 P3-01, CODE_MAPPING §3.8.1). 보드 상태는 같은 폴더의 apc_board.py가 들고 있다.

학생 코드는 실물 보드와 똑같이 쓴다(ESP32 실습실에서만 import된다 — 워커가 이 실습실에만 이 파일을 넣는다):

    from machine import Pin, Timer
    led = Pin(2, Pin.OUT)          # 내장 LED
    led.on(); led.off(); led.value(1); led(0); led.toggle()
    button = Pin(0, Pin.IN)        # BOOT 버튼: 평소 1, 누르면 0
    button.value()                 # 입력 확인 지점(화면의 버튼 상태가 여기서 들어온다)
    button.irq(trigger=Pin.IRQ_FALLING, handler=lambda pin: print('눌림', pin))
    timer = Timer(0)
    timer.init(period=500, mode=Timer.PERIODIC, callback=lambda t: led.toggle())

실물과 같게 맞춘 것(MicroPython v1.29.0 ports/esp32/machine_pin.c·machine_timer.c, 2026-09-17 확인)
- 핀 번호: 0~23, 25~27, 32~39만 있다. 그 밖(24, 28~31, 40 이상, 음수, 소수, 글자)은 ValueError('invalid pin').
- 34~39번은 입력 전용: 출력 모드(OUT·OPEN_DRAIN)로 정하면 ValueError('pin can only be input').
- Pin(2)는 같은 객체를 돌려준다(실물의 핀 표). 번호만 주면 설정을 바꾸지 않는다.
- 상수 값: IN 1, OUT 3, OPEN_DRAIN 7, PULL_DOWN 1, PULL_UP 2, IRQ_RISING 1, IRQ_FALLING 2, WAKE_LOW 4, WAKE_HIGH 5, DRIVE_0~3.
- irq()의 trigger 기본값은 IRQ_FALLING | IRQ_RISING(3), handler=None이면 끈다. 콜백은 Pin 객체를 받는다.
- Timer(id): 0~3은 하드웨어 타이머(같은 번호는 같은 객체), 음수(기본 -1)는 가상 타이머, 4 이상은 ValueError.
  init()의 인자는 모두 키워드(mode=PERIODIC, callback, period(ms), tick_hz=1000, freq, hard=False). hard=True는 ValueError.
- 가상 보드와 다른 점: 콜백은 입력 확인 지점(time.sleep*, 입력 핀 읽기, ticks_*)과 코드가 끝난 뒤의 대기에서만 돈다(P3-00 차이 표 12번).

아직 흉내 내지 않는 machine 이름(PWM·ADC·SoftI2C·UART·RTC 등)은 쓰면 한국어로 알린다. 부품 단계(P3-03~P3-05)가
apc_board_*.py 확장 파일로 더하면(apc_board.register_machine_export) 이 파일을 고치지 않고 machine에 들어온다.
라이선스: 사이트 소프트웨어(MIT, PD-26).
"""

import apc_board

_MISSING = object()


def _not_emulated_message(name, planned):
    if planned:
        return f"machine.{name}은(는) 가상 보드에 아직 없어요(실물 ESP32에는 있어요). 가상 보드에 부품을 더하는 다음 단계에서 들어와요."
    return f"machine.{name}은(는) 가상 보드에 아직 없어요(실물 ESP32에는 있어요). 이 기능은 실물 보드에서 확인해요."


#: 실물 ESP32의 machine에는 있지만 가상 보드가 아직 흉내 내지 않는 이름 → 부품 단계에서 더할 예정인지
_NOT_YET = {
    "PWM": True,
    "ADC": True,
    "SoftI2C": True,
    "I2C": True,
    "UART": True,
    "RTC": True,
    "time_pulse_us": True,
    "ADCBlock": False,
    "DAC": False,
    "SPI": False,
    "SoftSPI": False,
    "I2S": False,
    "WDT": False,
    "SDCard": False,
    "Signal": False,
    "TouchPad": False,
    "Counter": False,
    "Encoder": False,
    "USBDevice": False,
    "reset": False,
    "soft_reset": False,
    "freq": False,
    "unique_id": False,
    "idle": False,
    "lightsleep": False,
    "deepsleep": False,
    "wake_reason": False,
    "reset_cause": False,
    "disable_irq": False,
    "enable_irq": False,
    "bitstream": False,
    "bootloader": False,
}


class _PinIRQ:
    """pin.irq()가 돌려주는 객체: irq()로 콜백을 한 번 부르게 하고, trigger()로 조건을 읽고 바꾼다."""

    __slots__ = ("_pin",)

    def __init__(self, pin):
        self._pin = pin

    def __call__(self):
        state = apc_board.BOARD.pins.get(self._pin._apc_gpio)
        if state is not None and state.irq_handler is not None:
            apc_board.BOARD.schedule(state.irq_handler, self._pin)
        return None

    def trigger(self, *args):
        if len(args) > 1:
            raise TypeError(f"function expected at most 2 arguments, got {len(args) + 1}")
        state = apc_board.BOARD.state(self._pin._apc_gpio)
        original = state.irq_trigger
        if args:
            state.irq_trigger = apc_board.mp_int(args[0])
        return original


class Pin:
    IN = apc_board.MODE_IN
    OUT = apc_board.MODE_OUT
    OPEN_DRAIN = apc_board.MODE_OPEN_DRAIN
    PULL_UP = apc_board.PULL_UP
    PULL_DOWN = apc_board.PULL_DOWN
    IRQ_RISING = apc_board.IRQ_RISING
    IRQ_FALLING = apc_board.IRQ_FALLING
    WAKE_LOW = apc_board.WAKE_LOW
    WAKE_HIGH = apc_board.WAKE_HIGH
    DRIVE_0 = 0
    DRIVE_1 = 1
    DRIVE_2 = 2
    DRIVE_3 = 3

    def __new__(cls, id, *args, **kwargs):  # noqa: A002 — MicroPython 인자 이름 그대로
        gpio = apc_board.find_pin(id)
        board = apc_board.BOARD
        existing = board.pin_objects.get(gpio)
        if existing is not None and type(existing) is cls:
            return existing
        pin = object.__new__(cls)
        pin._apc_gpio = gpio
        board.pin_objects[gpio] = pin
        board.state(gpio)
        return pin

    def __init__(self, id, *args, **kwargs):  # noqa: A002
        if args or kwargs:
            self.init(*args, **kwargs)

    def init(self, mode=None, pull=-1, *, value=_MISSING, drive=_MISSING, hold=_MISSING):
        apc_board.BOARD.configure(
            self._apc_gpio,
            mode=mode,
            pull=pull,
            value=None if value is _MISSING else (1 if value else 0),
            drive=None if drive is _MISSING else drive,
            hold=None if hold is _MISSING else hold,
        )

    def _read(self):
        board = apc_board.BOARD
        if board.reads_outside_world(self._apc_gpio):
            apc_board.check_point()
        return board.read(self._apc_gpio)

    def value(self, *args):
        if len(args) > 1:
            raise TypeError(f"function expected at most 2 arguments, got {len(args) + 1}")
        if not args:
            return self._read()
        apc_board.BOARD.write(self._apc_gpio, args[0])
        return None

    def __call__(self, *args, **kwargs):
        if kwargs:
            raise TypeError("function doesn't take keyword arguments")
        if len(args) > 1:
            raise TypeError(f"function expected at most 1 arguments, got {len(args)}")
        if not args:
            return self._read()
        apc_board.BOARD.write(self._apc_gpio, args[0])
        return None

    def on(self):
        apc_board.BOARD.write(self._apc_gpio, 1)

    def off(self):
        apc_board.BOARD.write(self._apc_gpio, 0)

    def toggle(self):
        state = apc_board.BOARD.state(self._apc_gpio)
        apc_board.BOARD.write(self._apc_gpio, 1 - state.out)

    def irq(self, *args, **kwargs):
        names = ("handler", "trigger", "wake")
        if len(args) > len(names):
            raise TypeError("extra positional arguments given")
        values = dict(zip(names, args))
        for key, value in kwargs.items():
            if key not in names:
                raise TypeError(f"unexpected keyword argument '{key}'")
            if key in values:
                raise TypeError(f"argument '{key}' given twice")
            values[key] = value
        if values:
            handler = values.get("handler")
            trigger = apc_board.mp_int(values.get("trigger", apc_board.IRQ_FALLING | apc_board.IRQ_RISING))
            wake = values.get("wake")
            if wake is not None and trigger in (apc_board.WAKE_LOW, apc_board.WAKE_HIGH):
                apc_board.BOARD.warn_once(
                    ("wake", self._apc_gpio),
                    "가상 보드는 잠자기(deepsleep·lightsleep)에서 핀으로 깨우는 기능(wake)을 흉내 내지 않아요. 실물 보드에서 확인해요.",
                )
                apc_board.BOARD.set_irq(self._apc_gpio, None, 0, wake)
            else:
                apc_board.BOARD.set_irq(self._apc_gpio, handler, trigger if handler is not None else 0, None)
        return _PinIRQ(self)

    def __repr__(self):
        state = apc_board.BOARD.pins.get(self._apc_gpio)
        text = f"Pin({self._apc_gpio}"
        if state is not None:
            mode = state.mode or 0
            # ESP-IDF 5.5의 gpio_get_io_config 순서 그대로: 출력이 켜져 있으면 OUT(OPEN_DRAIN도), 아니면 IN
            text += ", mode=Pin.OUT" if mode & apc_board.MODE_DEF_OUTPUT else ", mode=Pin.IN"
            if state.pull and state.pull & apc_board.PULL_UP:
                text += ", pull=Pin.PULL_UP"
            elif state.pull and state.pull & apc_board.PULL_DOWN:
                text += ", pull=Pin.PULL_DOWN"
            if state.drive != apc_board.DEFAULT_DRIVE:
                text += f", drive=Pin.DRIVE_{state.drive}"
        return text + ")"


class Timer:
    ONE_SHOT = 0
    PERIODIC = 1

    def __new__(cls, id=-1, *args, **kwargs):  # noqa: A002
        timer_id = apc_board.mp_int(id)
        board = apc_board.BOARD
        if timer_id >= apc_board.HARDWARE_TIMERS:
            raise ValueError(f"Timer({timer_id}) doesn't exist, there are only {apc_board.HARDWARE_TIMERS} hardware timers")
        if timer_id >= 0:
            existing = board.hw_timers.get(timer_id)
            if existing is not None:
                return existing
        timer = object.__new__(cls)
        timer._id = timer_id
        timer._core = None
        timer._counts = 0
        timer._repeat = False
        timer._stopped_ms = 0
        if timer_id >= 0:
            board.hw_timers[timer_id] = timer
        return timer

    def __init__(self, id=-1, *args, **kwargs):  # noqa: A002
        if args or kwargs:
            self.init(*args, **kwargs)

    def _hz(self):
        return apc_board.HARDWARE_TIMER_HZ if self._id >= 0 else apc_board.VIRTUAL_TIMER_HZ

    def init(self, *args, mode=1, callback=None, period=0xFFFFFFFF, tick_hz=1000, freq=None, hard=False):
        if args:
            raise TypeError("extra positional arguments given")
        if self._core is not None:
            self.deinit()
        mode_value = apc_board.mp_int(mode)
        period_value = apc_board.mp_int(period)
        tick_value = apc_board.mp_int(tick_hz)
        if hard:
            raise ValueError("hard Timers are not implemented")
        hz = self._hz()
        if freq is not None:
            frequency = apc_board.float32(apc_board.mp_float(freq))
            counts = int(hz / frequency) if frequency > 0 else 0
        else:
            if tick_value == 0:
                raise ZeroDivisionError("divide by zero")
            counts = (((period_value & ((1 << 64) - 1)) * hz) & ((1 << 64) - 1)) // tick_value
        if counts == 0:
            raise ValueError("Timer period is too short for this timer")
        board = apc_board.BOARD
        self._counts = counts
        self._repeat = mode_value != 0
        self._core = apc_board.TimerCore(self, counts * 1_000_000_000 // hz, self._repeat, callback, board.clock.now_ns())
        board.add_timer(self._core)

    def deinit(self):
        core = self._core
        if core is not None:
            self._stopped_ms = self.value()
            apc_board.BOARD.remove_timer(core)
        self._core = None
        self._counts = 0
        self._repeat = False

    def value(self):
        core = self._core
        if core is None:
            return self._stopped_ms
        elapsed = apc_board.BOARD.clock.now_ns() - core.started_ns
        return max(0, elapsed // 1_000_000)

    def __repr__(self):
        # 실물(machine_timer_print)은 repeat일 때 ONE_SHOT이라고 찍는다 — v1.29.0 소스의 뒤바뀐 조건을 그대로 따른다.
        mode = "ONE_SHOT" if self._repeat else "PERIODIC"
        period_ms = self._counts // (self._hz() // 1000)
        return f"Timer({self._id}, mode={mode}, period={period_ms})"


for _name, _value in apc_board.machine_exports().items():
    globals()[_name] = _value

__all__ = ["Pin", "Timer", *sorted(apc_board.machine_exports())]


def __getattr__(name):
    exported = apc_board.machine_exports().get(name)
    if exported is not None:
        return exported
    if name in _NOT_YET:
        raise ImportError(_not_emulated_message(name, _NOT_YET[name]))
    raise AttributeError(f"module 'machine' has no attribute '{name}'")


def __dir__():
    """dir(machine)이 실물에 있는 이름만 보이게 한다(2026-09-18 검토 반영).

    모듈 전역에는 사이트 안쪽 이름(apc_board)이 들어 있어 dir()이 그대로 보여 주고, 반대로 아직 흉내 내지 않은
    실물 이름(reset·freq·unique_id …)은 보이지 않았다. 여기 있는 이름을 부르면 _NOT_YET 안내(ImportError + 한국어)가 나오므로
    학생이 "이름은 있는데 가상 보드가 아직 흉내 내지 않는다"를 바로 안다.
    """
    return sorted(set(__all__) | set(_NOT_YET))
