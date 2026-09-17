"""가상 ESP32 보드의 framebuf 모듈 — MicroPython 펌웨어에 들어 있는 그림 버퍼 모듈을 같은 사용법으로 흉내 낸다(PLAN §8.3 P3-04, CODE_MAPPING §3.8.3).

OLED 드라이버 흉내(같은 부품 폴더의 ssd1306.py·sh1106.py)가 이 FrameBuffer를 물려받아 fill·text·pixel·show를 준다. 학생 코드도 실물처럼 쓸 수 있다:

    import framebuf
    buf = bytearray(16 * 16 // 8)
    icon = framebuf.FrameBuffer(buf, 16, 16, framebuf.MONO_HLSB)
    icon.rect(0, 0, 16, 16, 1)
    oled.blit(icon, 56, 24)

실물과 같게 맞춘 것(MicroPython v1.29.0 extmod/modframebuf.c, 2026-09-18 확인 — C 코드를 옮기지 않고 같은 결과가 나오게 파이썬으로 다시 썼다)
- FrameBuffer(buffer, width, height, format[, stride]): 형식 MONO_VLSB(=MVLSB 0)·RGB565(1)·GS4_HMSB(2)·MONO_HLSB(3)·MONO_HMSB(4)·GS2_HMSB(5)·GS8(6).
  크기·간격이 틀리거나 버퍼가 작으면 ValueError, 모르는 형식은 ValueError('invalid format'), bytes처럼 고칠 수 없는 버퍼는 TypeError.
  FrameBuffer1(buffer, width, height[, stride])은 MONO_VLSB로 만드는 옛 이름.
- fill(c) · fill_rect(x, y, w, h, c) · pixel(x, y[, c]) · hline · vline · rect(x, y, w, h, c[, f]) · line(x1, y1, x2, y2, c) ·
  ellipse(x, y, xr, yr, c[, f, m]) · poly(x, y, coords, c[, f]) · blit(fbuf, x, y[, key, palette]) · scroll(xstep, ystep) · text(s, x, y[, c]).
  그림은 버퍼 밖으로 나가는 부분을 자르고(오류 없음), 선·타원·다각형은 소스와 같은 계산으로 같은 점을 찍는다.
- text(): 글자 하나가 8×8칸(가로 8점씩 오른쪽으로). 글자를 UTF-8 바이트 하나씩 그리므로 한글 한 글자는 칸 3개이고, 32~127 밖의 바이트는
  127번 모양으로 그린다. 128×64 OLED 한 줄에는 16칸이 들어가고 넘치면 잘린다.

실물과 다른 점: 글자 모양(글꼴). 실물 펌웨어의 8×8 글꼴 대신 사이트가 직접 그린 5×8 점 글꼴(칸 안의 1~5열)을 쓴다 — 칸 크기·위치·자르는 규칙은 같아서
몇 칸에 몇 글자가 들어가는지는 실물과 같지만, 점 무늬는 조금 다르다(출처가 분명하지 않은 글꼴 자료는 쓰지 않는다 — CLAUDE.md 원칙 5).
127번(표에 없는 글자) 모양도 사이트가 정한 네모 상자다.
가상 보드 전용: text()로 쓴 글자를 _apc_texts에 적어 둔다(fill()이 비움) — OLED 드라이버 흉내가 화면 낭독기용 설명으로 장치에 넘긴다.
라이선스: 사이트 소프트웨어(MIT, PD-26). 글꼴 점 무늬도 사이트가 직접 그렸다.
"""

import apc_board

__all__ = ["GS2_HMSB", "GS4_HMSB", "GS8", "MONO_HLSB", "MONO_HMSB", "MONO_VLSB", "MVLSB", "RGB565", "FrameBuffer", "FrameBuffer1"]

MVLSB = 0
MONO_VLSB = 0
RGB565 = 1
GS4_HMSB = 2
MONO_HLSB = 3
MONO_HMSB = 4
GS2_HMSB = 5
GS8 = 6

#: 사이트가 그린 글꼴: 32~127번 글자마다 8바이트 = 8개 열(왼쪽부터), 한 바이트의 비트 0이 맨 위 점(extmod 글꼴 표와 같은 배치)
_FONT = bytes.fromhex(
    "0000000000000000"  # 32 space
    "0000005f00000000"  # 33 !
    "0000070007000000"  # 34 "
    "00147f147f140000"  # 35 #
    "00242a7f2a120000"  # 36 $
    "0023130864620000"  # 37 %
    "0036495522500000"  # 38 &
    "0000040300000000"  # 39 '
    "00001c2241000000"  # 40 (
    "000041221c000000"  # 41 )
    "0014083e08140000"  # 42 *
    "0008083e08080000"  # 43 +
    "0000a06000000000"  # 44 ,
    "0008080808080000"  # 45 -
    "0000606000000000"  # 46 .
    "0020100804020000"  # 47 /
    "003e5149453e0000"  # 48 0
    "0000427f40000000"  # 49 1
    "0042615149460000"  # 50 2
    "002141454b310000"  # 51 3
    "001814127f100000"  # 52 4
    "0027454545390000"  # 53 5
    "003c4a4949300000"  # 54 6
    "0001710905030000"  # 55 7
    "0036494949360000"  # 56 8
    "00064949291e0000"  # 57 9
    "0000363600000000"  # 58 :
    "0000563600000000"  # 59 ;
    "0008142241000000"  # 60 <
    "0014141414140000"  # 61 =
    "0000412214080000"  # 62 >
    "0002015109060000"  # 63 ?
    "00324979413e0000"  # 64 @
    "007e1111117e0000"  # 65 A
    "007f494949360000"  # 66 B
    "003e414141220000"  # 67 C
    "007f4141221c0000"  # 68 D
    "007f494949410000"  # 69 E
    "007f090909010000"  # 70 F
    "003e4149497a0000"  # 71 G
    "007f0808087f0000"  # 72 H
    "0000417f41000000"  # 73 I
    "002040413f010000"  # 74 J
    "007f081422410000"  # 75 K
    "007f404040400000"  # 76 L
    "007f020c027f0000"  # 77 M
    "007f0408107f0000"  # 78 N
    "003e4141413e0000"  # 79 O
    "007f090909060000"  # 80 P
    "003e4151215e0000"  # 81 Q
    "007f091929460000"  # 82 R
    "0046494949310000"  # 83 S
    "0001017f01010000"  # 84 T
    "003f4040403f0000"  # 85 U
    "001f2040201f0000"  # 86 V
    "003f4038403f0000"  # 87 W
    "0063140814630000"  # 88 X
    "0007087008070000"  # 89 Y
    "0061514945430000"  # 90 Z
    "00007f4141000000"  # 91 [
    "0002040810200000"  # 92 backslash
    "000041417f000000"  # 93 ]
    "0004020102040000"  # 94 ^
    "0040404040400000"  # 95 _
    "0000010204000000"  # 96 `
    "0020545454780000"  # 97 a
    "007f484444380000"  # 98 b
    "0038444444200000"  # 99 c
    "00384444487f0000"  # 100 d
    "0038545454180000"  # 101 e
    "00087e0901020000"  # 102 f
    "0018a4a4a47c0000"  # 103 g
    "007f080404780000"  # 104 h
    "0000447d40000000"  # 105 i
    "004080847d000000"  # 106 j
    "007f102844000000"  # 107 k
    "0000417f40000000"  # 108 l
    "007c041804780000"  # 109 m
    "007c080404780000"  # 110 n
    "0038444444380000"  # 111 o
    "00fc242424180000"  # 112 p
    "0018242428fc0000"  # 113 q
    "007c080404080000"  # 114 r
    "0048545454200000"  # 115 s
    "00043f4440200000"  # 116 t
    "003c4040207c0000"  # 117 u
    "001c2040201c0000"  # 118 v
    "003c4030403c0000"  # 119 w
    "0044281028440000"  # 120 x
    "001ca0a0a07c0000"  # 121 y
    "004464544c440000"  # 122 z
    "0000083641000000"  # 123 {
    "0000007f00000000"  # 124 |
    "0000413608000000"  # 125 }
    "0008040810080000"  # 126 ~
    "007f4141417f0000"  # 127 DEL(표에 없는 글자)
)

_INT_MIN = -(1 << 31)
_INT_MAX = (1 << 31) - 1


def _int(value):
    """mp_obj_get_int — int·bool만, 32비트 기계 정수"""
    number = apc_board.mp_int(value)
    if not _INT_MIN <= number <= _INT_MAX:
        raise OverflowError("overflow converting long int to machine word")
    return number


def _check_num(count, kwargs, n_min, n_max):
    if kwargs:
        raise TypeError("function doesn't take keyword arguments")
    if n_min == n_max:
        if count != n_min:
            raise TypeError(f"function takes {n_min} positional arguments but {count} were given")
    elif count < n_min:
        raise TypeError(f"function missing {n_min - count} required positional arguments")
    elif count > n_max:
        raise TypeError(f"function expected at most {n_max} arguments, got {count}")


def _byte_view(value, writable):
    if writable and isinstance(value, (bytes, str)):
        raise TypeError("object with buffer protocol required")
    if isinstance(value, str):
        return memoryview(value.encode("utf-8"))
    try:
        view = memoryview(value)
    except TypeError:
        raise TypeError("object with buffer protocol required") from None
    if writable and view.readonly:
        raise TypeError("object with buffer protocol required")
    return view.cast("B")


def _text_bytes(value):
    """mp_obj_str_get_str: str(UTF-8 바이트)·bytes만"""
    if isinstance(value, str):
        return value.encode("utf-8")
    if isinstance(value, (bytes, bytearray)):
        return bytes(value)
    raise TypeError(f"can't convert '{type(value).__name__}' object to str implicitly")


class _Layout:
    """framebuf_make_new_helper의 결과(버퍼·크기·형식·한 줄 간격)"""

    __slots__ = ("format", "height", "obj", "stride", "view", "width", "words")


def _layout(items, writable):
    width = _int(items[1])
    height = _int(items[2])
    fmt = _int(items[3])
    stride = _int(items[4]) if len(items) >= 5 else width
    if width < 1 or height < 1 or width > 0xFFFF or height > 0xFFFF or stride > 0xFFFF or stride < width:
        raise ValueError()
    bpp = 1
    height_required = height
    width_required = width
    strides_required = height - 1
    if fmt == MVLSB:
        height_required = (height + 7) & ~7
        strides_required = height_required - 8
    elif fmt in (MONO_HLSB, MONO_HMSB):
        stride = (stride + 7) & ~7
        width_required = (width + 7) & ~7
    elif fmt == GS2_HMSB:
        stride = (stride + 3) & ~3
        width_required = (width + 3) & ~3
        bpp = 2
    elif fmt == GS4_HMSB:
        stride = (stride + 1) & ~1
        width_required = (width + 1) & ~1
        bpp = 4
    elif fmt == GS8:
        bpp = 8
    elif fmt == RGB565:
        bpp = 16
    else:
        raise ValueError("invalid format")
    view = _byte_view(items[0], writable)
    if (strides_required * stride + (height_required - strides_required) * width_required) * bpp // 8 > len(view):
        raise ValueError()
    layout = _Layout()
    layout.obj = items[0]
    layout.view = view
    layout.words = view[: len(view) // 2 * 2].cast("H") if fmt == RGB565 else None
    layout.width = width
    layout.height = height
    layout.stride = stride
    layout.format = fmt
    return layout


# ── 형식마다 점 하나 쓰기·읽기(좌표는 이미 버퍼 안) ──


def _set(layout, x, y, col):
    fmt = layout.format
    view = layout.view
    if fmt == MVLSB:
        index = (y >> 3) * layout.stride + x
        bit = 1 << (y & 7)
        view[index] = (view[index] | bit) if col != 0 else (view[index] & ~bit & 0xFF)
    elif fmt == MONO_HLSB or fmt == MONO_HMSB:
        index = (x + y * layout.stride) >> 3
        offset = (x & 7) if fmt == MONO_HMSB else 7 - (x & 7)
        bit = 1 << offset
        view[index] = (view[index] | bit) if col != 0 else (view[index] & ~bit & 0xFF)
    elif fmt == RGB565:
        layout.words[x + y * layout.stride] = col & 0xFFFF
    elif fmt == GS2_HMSB:
        index = (x + y * layout.stride) >> 2
        shift = (x & 3) << 1
        view[index] = ((col & 3) << shift) | (view[index] & ~(3 << shift) & 0xFF)
    elif fmt == GS4_HMSB:
        index = (x + y * layout.stride) >> 1
        if x % 2:
            view[index] = (col & 0x0F) | (view[index] & 0xF0)
        else:
            view[index] = ((col << 4) & 0xF0) | (view[index] & 0x0F)
    else:  # GS8
        view[x + y * layout.stride] = col & 0xFF


def _get(layout, x, y):
    fmt = layout.format
    view = layout.view
    if fmt == MVLSB:
        return (view[(y >> 3) * layout.stride + x] >> (y & 7)) & 1
    if fmt == MONO_HLSB or fmt == MONO_HMSB:
        offset = (x & 7) if fmt == MONO_HMSB else 7 - (x & 7)
        return (view[(x + y * layout.stride) >> 3] >> offset) & 1
    if fmt == RGB565:
        return layout.words[x + y * layout.stride]
    if fmt == GS2_HMSB:
        return (view[(x + y * layout.stride) >> 2] >> ((x & 3) << 1)) & 3
    if fmt == GS4_HMSB:
        value = view[(x + y * layout.stride) >> 1]
        return value & 0x0F if x % 2 else value >> 4
    return view[x + y * layout.stride]


def _fill_rect_clipped(layout, x, y, w, h, col):
    """fill_rect(좌표는 이미 버퍼 안으로 잘랐다). 한 쪽(page) 전체를 같은 값으로 채우는 흔한 경우(fill)는 바이트 단위로 빠르게."""
    fmt = layout.format
    view = layout.view
    if fmt == MVLSB and x == 0 and w == layout.width and layout.stride == layout.width and y % 8 == 0 and h % 8 == 0:
        start = (y >> 3) * layout.stride
        count = (h >> 3) * layout.stride
        view[start : start + count] = (b"\xff" if col != 0 else b"\x00") * count
        return
    if fmt == GS8:
        row = bytes((col & 0xFF,)) * w
        for yy in range(y, y + h):
            start = x + yy * layout.stride
            view[start : start + w] = row
        return
    for yy in range(y, y + h):
        for xx in range(x, x + w):
            _set(layout, xx, yy, col)


def _c_div(a, b):
    """C 정수 나눗셈(0 쪽으로 버림)"""
    quotient = abs(a) // abs(b)
    return quotient if (a >= 0) == (b >= 0) else -quotient


class FrameBuffer:
    """framebuf.FrameBuffer(buffer, width, height, format[, stride])"""

    def __init__(self, *args, **kwargs):
        _check_num(len(args), kwargs, 4, 5)
        self._fb = _layout(args, True)
        self._apc_texts = []

    def __buffer__(self, flags):
        return memoryview(self._fb.obj)

    # ── 내부 ──

    def _fill_rect(self, x, y, w, h, col):
        fb = self._fb
        if h < 1 or w < 1 or x + w <= 0 or y + h <= 0 or y >= fb.height or x >= fb.width:
            return
        xend = min(fb.width, x + w)
        yend = min(fb.height, y + h)
        x = max(x, 0)
        y = max(y, 0)
        _fill_rect_clipped(fb, x, y, xend - x, yend - y, col)

    def _set_checked(self, x, y, col, mask=1):
        fb = self._fb
        if mask and 0 <= x < fb.width and 0 <= y < fb.height:
            _set(fb, x, y, col)

    def _line(self, x1, y1, x2, y2, col):
        fb = self._fb
        dx = x2 - x1
        if dx > 0:
            sx = 1
        else:
            dx = -dx
            sx = -1
        dy = y2 - y1
        if dy > 0:
            sy = 1
        else:
            dy = -dy
            sy = -1
        steep = dy > dx
        if steep:
            x1, y1 = y1, x1
            dx, dy = dy, dx
            sx, sy = sy, sx
        e = 2 * dy - dx
        for _ in range(dx):
            if steep:
                if 0 <= y1 < fb.width and 0 <= x1 < fb.height:
                    _set(fb, y1, x1, col)
            elif 0 <= x1 < fb.width and 0 <= y1 < fb.height:
                _set(fb, x1, y1, col)
            while e >= 0:
                y1 += sy
                e -= 2 * dx
            x1 += sx
            e += 2 * dy
        self._set_checked(x2, y2, col)

    def _forget_texts_in(self, x, y, w, h):
        if w < 1 or h < 1:
            return
        self._apc_texts = [item for item in self._apc_texts if not (x <= item[0] and y <= item[1] and item[0] + item[3] <= x + w and item[1] + 8 <= y + h)]

    def _ellipse_points(self, cx, cy, x, y, col, mask):
        if mask & 0x10:
            if mask & 0x01:
                self._fill_rect(cx, cy - y, x + 1, 1, col)
            if mask & 0x02:
                self._fill_rect(cx - x, cy - y, x + 1, 1, col)
            if mask & 0x04:
                self._fill_rect(cx - x, cy + y, x + 1, 1, col)
            if mask & 0x08:
                self._fill_rect(cx, cy + y, x + 1, 1, col)
        else:
            self._set_checked(cx + x, cy - y, col, mask & 0x01)
            self._set_checked(cx - x, cy - y, col, mask & 0x02)
            self._set_checked(cx - x, cy + y, col, mask & 0x04)
            self._set_checked(cx + x, cy + y, col, mask & 0x08)

    # ── 공개 함수(extmod 표 순서) ──

    def fill(self, *args, **kwargs):
        _check_num(1 + len(args), kwargs, 2, 2)
        col = _int(args[0])
        fb = self._fb
        _fill_rect_clipped(fb, 0, 0, fb.width, fb.height, col)
        self._apc_texts = []

    def fill_rect(self, *args, **kwargs):
        _check_num(1 + len(args), kwargs, 6, 6)
        x, y, w, h, col = (_int(value) for value in args)
        self._fill_rect(x, y, w, h, col)
        self._forget_texts_in(x, y, w, h)

    def pixel(self, *args, **kwargs):
        _check_num(1 + len(args), kwargs, 3, 4)
        x = _int(args[0])
        y = _int(args[1])
        fb = self._fb
        if 0 <= x < fb.width and 0 <= y < fb.height:
            if len(args) == 2:
                return _get(fb, x, y)
            _set(fb, x, y, _int(args[2]))
        return None

    def hline(self, *args, **kwargs):
        _check_num(1 + len(args), kwargs, 5, 5)
        x, y, w, col = (_int(value) for value in args)
        self._fill_rect(x, y, w, 1, col)

    def vline(self, *args, **kwargs):
        _check_num(1 + len(args), kwargs, 5, 5)
        x, y, h, col = (_int(value) for value in args)
        self._fill_rect(x, y, 1, h, col)

    def rect(self, *args, **kwargs):
        _check_num(1 + len(args), kwargs, 6, 7)
        x, y, w, h, col = (_int(value) for value in args[:5])
        if len(args) > 5 and args[5]:
            self._fill_rect(x, y, w, h, col)
            self._forget_texts_in(x, y, w, h)
        else:
            self._fill_rect(x, y, w, 1, col)
            self._fill_rect(x, y + h - 1, w, 1, col)
            self._fill_rect(x, y, 1, h, col)
            self._fill_rect(x + w - 1, y, 1, h, col)

    def line(self, *args, **kwargs):
        _check_num(1 + len(args), kwargs, 6, 6)
        x1, y1, x2, y2, col = (_int(value) for value in args)
        self._line(x1, y1, x2, y2, col)

    def ellipse(self, *args, **kwargs):
        _check_num(1 + len(args), kwargs, 6, 8)
        cx, cy, xr, yr, col = (_int(value) for value in args[:5])
        mask = 0x10 if len(args) > 5 and args[5] else 0
        mask |= (_int(args[6]) & 0x0F) if len(args) > 6 else 0x0F
        if xr == 0 and yr == 0:
            self._set_checked(cx, cy, col, mask & 0x0F)
            return
        two_a2 = 2 * xr * xr
        two_b2 = 2 * yr * yr
        x = xr
        y = 0
        xchange = yr * yr * (1 - 2 * xr)
        ychange = xr * xr
        error = 0
        stopping_x = two_b2 * xr
        stopping_y = 0
        while stopping_x >= stopping_y:
            self._ellipse_points(cx, cy, x, y, col, mask)
            y += 1
            stopping_y += two_a2
            error += ychange
            ychange += two_a2
            if 2 * error + xchange > 0:
                x -= 1
                stopping_x -= two_b2
                error += xchange
                xchange += two_b2
        x = 0
        y = yr
        xchange = yr * yr
        ychange = xr * xr * (1 - 2 * yr)
        error = 0
        stopping_x = 0
        stopping_y = two_a2 * yr
        while stopping_x <= stopping_y:
            self._ellipse_points(cx, cy, x, y, col, mask)
            x += 1
            stopping_x += two_b2
            error += xchange
            xchange += two_b2
            if 2 * error + ychange > 0:
                y -= 1
                stopping_y -= two_a2
                error += ychange
                ychange += two_a2

    def poly(self, *args, **kwargs):
        _check_num(1 + len(args), kwargs, 5, 6)
        x = _int(args[0])
        y = _int(args[1])
        coords = _poly_values(args[2])
        n_poly = len(coords) // 2
        if n_poly == 0:
            return
        col = _int(args[3])
        fill = len(args) > 4 and bool(args[4])
        if fill:
            ys = [coords[2 * k + 1] for k in range(n_poly)]
            for row in range(min(ys), max(ys) + 1):
                nodes = []
                px1, py1 = coords[0], coords[1]
                index = n_poly * 2 - 1
                while True:
                    py2 = coords[index]
                    px2 = coords[index - 1]
                    index -= 2
                    if py1 != py2 and ((py1 > row and py2 <= row) or (py1 <= row and py2 > row)):
                        nodes.append(_c_div(32 * px1 + _c_div(32 * (px2 - px1) * (row - py1), py2 - py1) + 16, 32))
                    elif row == max(py1, py2):
                        if py1 < py2:
                            self._set_checked(x + px2, y + py2, col)
                        elif py2 < py1:
                            self._set_checked(x + px1, y + py1, col)
                        else:
                            self._line(x + px1, y + py1, x + px2, y + py2, col)
                    px1, py1 = px2, py2
                    if index < 0:
                        break
                if not nodes:
                    continue
                nodes.sort()
                for k in range(0, len(nodes) - 1, 2):
                    self._fill_rect(x + nodes[k], y + row, nodes[k + 1] - nodes[k] + 1, 1, col)
        else:
            px1, py1 = coords[0], coords[1]
            index = n_poly * 2 - 1
            while True:
                py2 = coords[index]
                px2 = coords[index - 1]
                index -= 2
                self._line(x + px1, y + py1, x + px2, y + py2, col)
                px1, py1 = px2, py2
                if index < 0:
                    break

    def blit(self, *args, **kwargs):
        _check_num(1 + len(args), kwargs, 4, 6)
        source = _readonly_layout(args[0])
        x = _int(args[1])
        y = _int(args[2])
        key = _int(args[3]) if len(args) > 3 else -1
        palette = _readonly_layout(args[4]) if len(args) > 4 and args[4] is not None else None
        fb = self._fb
        if x >= fb.width or y >= fb.height or -x >= source.width or -y >= source.height:
            return
        x0 = max(0, x)
        y0 = max(0, y)
        x1 = max(0, -x)
        y1 = max(0, -y)
        x0end = min(fb.width, x + source.width)
        y0end = min(fb.height, y + source.height)
        key_value = key & 0xFFFFFFFF
        for yy in range(y0, y0end):
            cx1 = x1
            for xx in range(x0, x0end):
                col = _get(source, cx1, y1)
                if palette is not None:
                    col = _get(palette, col, 0)
                if col != key_value:
                    _set(fb, xx, yy, col)
                cx1 += 1
            y1 += 1

    def scroll(self, *args, **kwargs):
        _check_num(1 + len(args), kwargs, 3, 3)
        xstep = _int(args[0])
        ystep = _int(args[1])
        fb = self._fb
        if xstep < 0:
            if -xstep >= fb.width:
                return
            xs = range(0, fb.width + xstep)
        else:
            if xstep >= fb.width:
                return
            xs = range(fb.width - 1, xstep - 1, -1)
        if ystep < 0:
            if -ystep >= fb.height:
                return
            ys = range(0, fb.height + ystep)
        else:
            if ystep >= fb.height:
                return
            ys = range(fb.height - 1, ystep - 1, -1)
        for yy in ys:
            for xx in xs:
                _set(fb, xx, yy, _get(fb, xx - xstep, yy - ystep))
        self._apc_texts = []

    def text(self, *args, **kwargs):
        _check_num(1 + len(args), kwargs, 4, 5)
        data = _text_bytes(args[0])
        x0 = _int(args[1])
        y0 = _int(args[2])
        col = _int(args[3]) if len(args) > 3 else 1
        fb = self._fb
        start_x = x0
        for code in data:
            if code < 32 or code > 127:
                code = 127
            base = (code - 32) * 8
            for column in range(8):
                if 0 <= x0 < fb.width:
                    bits = _FONT[base + column]
                    yy = y0
                    while bits:
                        if bits & 1 and 0 <= yy < fb.height:
                            _set(fb, x0, yy, col)
                        bits >>= 1
                        yy += 1
                x0 += 1
        if data:
            self._apc_texts.append((start_x, y0, data.decode("utf-8", "replace"), 8 * len(data), col))


def _poly_values(value):
    """poly의 coords: 형식 문자가 있는 버퍼(array('h', …))·bytes·bytearray·memoryview의 항목들"""
    if getattr(value, "typecode", None) is not None:
        return [int(item) for item in value]
    if isinstance(value, (bytes, bytearray)):
        return list(value)
    if isinstance(value, memoryview):
        return [int(item) for item in value.tolist()]
    raise TypeError("object with buffer protocol required")


def _readonly_layout(value):
    """blit의 fbuf·palette: FrameBuffer이거나 (buffer, width, height, format[, stride]) 튜플·리스트"""
    if isinstance(value, FrameBuffer):
        return value._fb
    if not isinstance(value, (tuple, list)):
        raise TypeError(f"object '{type(value).__name__}' isn't a tuple or list")
    if len(value) < 4 or len(value) > 5:
        raise ValueError()
    return _layout(list(value), False)


def FrameBuffer1(*args, **kwargs):
    """옛 이름: FrameBuffer1(buffer, width, height[, stride]) = FrameBuffer(buffer, width, height, MONO_VLSB, stride)"""
    _check_num(len(args), kwargs, 3, 4)
    stride = args[3] if len(args) >= 4 else args[1]
    return FrameBuffer(args[0], args[1], args[2], MVLSB, stride)
