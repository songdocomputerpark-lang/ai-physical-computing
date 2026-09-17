"""가상 ESP32 보드의 machine.bitstream(PLAN §8.3 P3-05 네오픽셀, src/lab/README.md 7.6) — 네오픽셀 드라이버(neopixel.py)가 색 바이트를 보내는 함수.

    from machine import bitstream
    bitstream(Pin(23), 0, (400, 850, 800, 450), b'\\x00\\xff\\x00')   # 인코딩 0 = 높음·낮음 시간(ns) 네 개로 바이트를 보냄

실물과 같게 맞춘 것(MicroPython v1.29.0 extmod/machine_bitstream.c·ports/esp32/machine_bitstream.c·py/obj.c, 2026-09-18 원문 확인)
- 인자 네 개(pin, encoding, timing, buf). 핀은 Pin·정수(machine_pin_find — 없는 번호 ValueError('invalid pin')), encoding은 정수.
- 확인 순서: 핀 → encoding 정수 변환 → buf가 버퍼인지(아니면 TypeError('object with buffer protocol required')) → encoding이 0이 아니면
  ValueError('encoding') → timing이 튜플·리스트가 아니면 TypeError("object 'int' isn't a tuple or list"), 길이가 4가 아니면
  ValueError('requested length 4 but object has length 3'), 값은 정수(소수면 TypeError("can't convert float to int")).
- 바이트는 앞에서부터 한 바이트씩 가장 높은 비트부터 보낸다(RMT bytes encoder msb_first). 보내기가 끝나면 핀은 GPIO 출력 0으로 돌아간다.
가상 보드는 신호 모양 대신 바이트를 그 핀에 이어진 부품 흉내에 준다: 배선에서 BITSTREAM_ROLE(기본 'din') 핀이 이 핀인 장치의
receive_bitstream(data: bytes, timing: tuple) — 네오픽셀 링(apc_part_neopixel.py)이 G·R·B 차례로 읽는다.
라이선스: 사이트 소프트웨어(MIT, PD-26). MicroPython 코드는 옮기지 않고 동작·문구만 맞췄다.
"""

import apc_board

__all__ = ["bitstream"]


def bitstream(*args, **kwargs):
    # MP_DEFINE_CONST_FUN_OBJ_VAR_BETWEEN(…, 4, 4, …) → py/argcheck.c의 문구
    if kwargs:
        raise TypeError("function doesn't take keyword arguments")
    if len(args) != 4:
        raise TypeError(f"function takes 4 positional arguments but {len(args)} were given")
    pin, encoding, timing, buf = args
    gpio = apc_board.find_pin(pin)
    encoding_value = apc_board.mp_int(encoding)
    if isinstance(buf, str):
        data = buf.encode("utf-8")  # MicroPython의 str은 버퍼 프로토콜이 있다
    else:
        try:
            data = bytes(memoryview(buf))
        except TypeError:
            raise TypeError("object with buffer protocol required") from None
    if encoding_value != 0:
        raise ValueError("encoding")
    if not isinstance(timing, (tuple, list)):
        raise TypeError(f"object '{type(timing).__name__}' isn't a tuple or list")
    if len(timing) != 4:
        raise ValueError(f"requested length 4 but object has length {len(timing)}")
    timing_ns = tuple(apc_board.mp_int(value) for value in timing)
    board = apc_board.BOARD
    reached = False
    for entry, device in apc_board.wired_devices():
        receive = getattr(device, "receive_bitstream", None)
        role = getattr(device, "BITSTREAM_ROLE", "din")
        if receive is not None and entry.get("pins", {}).get(role) == gpio:
            reached = True
            receive(data, timing_ns)
    if not reached and board.wiring_known:
        board.warn_once(
            ("bitstream-nowhere", gpio),
            f"{gpio}번 핀으로 네오픽셀 색 신호를 보냈지만, 이 예제의 배선도에는 {gpio}번 핀에 이은 네오픽셀이 없어요. "
            "NeoPixel(Pin(번호), …)의 번호가 배선도의 DIN 핀과 같은지 확인해요.",
        )


apc_board.register_machine_export("bitstream", bitstream)
