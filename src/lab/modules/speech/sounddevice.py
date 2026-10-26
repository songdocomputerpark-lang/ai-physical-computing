"""`sounddevice` 대신 움직이는 사이트 모듈(판 1.8.0 — 선택 차시 1-4-3). 화면 쪽은 같은 폴더의 index.ts, 짝은 speech_recognition.py.

왜 있나: 토니 5.0(파이썬 3.14)에는 원고의 `sr.Microphone()`이 쓰는 PyAudio 설치 파일이 없다(2026-10-26 PyPI 확인 — 0.2.14가 cp313까지).
그래서 사이트 예제는 sounddevice로 녹음해 `sr.AudioData`로 감싼다:

    import sounddevice as sd
    import speech_recognition as sr
    RATE = 16000
    recording = sd.rec(5 * RATE, samplerate=RATE, channels=1, dtype='int16')   # 5초 녹음 시작
    sd.wait()                                                                   # 녹음이 끝날 때까지
    audio = sr.AudioData(recording.tobytes(), RATE, 2)
    text = r.recognize_google(audio, language='ko-KR')

브라우저 파이썬에는 마이크가 없으므로 `rec()`가 speech_recognition.py와 같은 방법으로 실습실 음성 패널에 한 마디를 부탁하고
(글자 입력 기본 · 내 기기 안 인식 · 서버 인식 — 고르는 곳은 같은 패널), 받은 글자를 "마지막 녹음"으로 적어 둔다.
돌려주는 배열은 진짜와 같은 모양·자료형의 조용한 소리(0)이고, 그 배열로 만든 `sr.AudioData`가 마지막 녹음의 글자를 이어받는다.
진짜 `rec()`는 곧바로 돌아오고 `wait()`에서 기다리지만, 여기서는 `rec()`가 한 마디를 받을 때까지 기다리고 `wait()`는 바로 끝난다(결과는 같다).

규칙(src/lab/README.md 4.4): 기다리는 일은 speech_recognition.py의 함수가 apc_runtime으로 한다. 라이선스: 사이트 소프트웨어(MIT, PD-26).
원본 python-sounddevice(MIT) 코드는 쓰지 않고 이름만 맞췄다.
"""

import speech_recognition as _sr

__version__ = "0.5.6-apc"


class _Default:
    """진짜 sd.default처럼 기본 값을 담는다(samplerate·channels·dtype — 정해 두면 rec()가 빈 인자 자리에 쓴다)."""

    def __init__(self):
        self.samplerate = None
        self.channels = None
        self.dtype = "float32"
        self.device = None


default = _Default()


class PortAudioError(Exception):
    """진짜 sounddevice의 장치 오류와 같은 이름."""


def _numpy():
    try:
        import numpy
    except ImportError:  # pragma: no cover - 영상 처리 실습실은 numpy를 미리 받는다
        raise RuntimeError("녹음에는 numpy가 필요해요. 코드 위쪽에 import numpy를 두면 실습실이 함께 받아요.") from None
    return numpy


def rec(frames=None, samplerate=None, channels=None, dtype=None, out=None, mapping=None, blocking=False, **_ignored):
    """frames(소리 칸 수)만큼 '녹음'한다 — 실습실 음성 패널이 한 마디를 받을 때까지 기다리고, 조용한 배열(frames×channels)을 돌려준다."""
    numpy = _numpy()
    samplerate = samplerate if samplerate is not None else default.samplerate
    channels = channels if channels is not None else (default.channels or 1)
    dtype = dtype if dtype is not None else default.dtype
    if frames is None and out is None:
        raise TypeError("rec()에는 녹음할 소리 칸 수(frames)를 적어요. 예: sd.rec(5 * 16000, samplerate=16000, channels=1, dtype='int16')")
    if samplerate is None:
        raise PortAudioError("samplerate를 정하지 않았어요. 예: sd.rec(5 * 16000, samplerate=16000, channels=1, dtype='int16')")
    if out is not None:
        frames = len(out)
    frames = int(frames)
    if frames <= 0:
        raise ValueError("frames는 1 이상이어야 해요(녹음할 소리 칸 수).")
    seconds = frames / float(samplerate)
    _sr._record_for_sounddevice(seconds, int(samplerate))
    array = numpy.zeros((frames, int(channels)), dtype=numpy.dtype(dtype))
    if out is not None:
        out[...] = array.reshape(out.shape)
        return out
    return array


def wait(ignore_errors=True):
    """녹음이 끝날 때까지 기다린다. 이 실습실에서는 rec()가 이미 다 받아 두었으므로 바로 끝난다."""
    return None


def stop(ignore_errors=True):
    return None


def play(data, samplerate=None, mapping=None, blocking=False, loop=False, **_ignored):
    """소리 재생 — 이 실습실에서는 소리를 내지 않는다(콘솔에 한 번 알린다)."""
    _sr._notice_once("_notified_play", "sd.play()(소리 재생)는 이 실습실에서 소리를 내지 않아요. 진짜 컴퓨터에서는 스피커로 나와요.", "info")
    return None


def query_devices(device=None, kind=None):
    """장치 목록 — 이 실습실에는 음성 패널 하나뿐이다."""
    info = {
        "name": "실습실 입력(글자 입력 또는 브라우저 음성 인식)",
        "index": 0,
        "hostapi": 0,
        "max_input_channels": 1,
        "max_output_channels": 0,
        "default_samplerate": 16000.0,
    }
    if device is not None or kind is not None:
        return info
    return [info]


def check_input_settings(device=None, channels=None, dtype=None, extra_settings=None, samplerate=None):
    return None


def _unsupported(name):
    def _raise(*_args, **_kwargs):
        raise NotImplementedError(
            f"sounddevice.{name}(실시간 소리 흐름)는 이 실습실에서 쓸 수 없어요. sd.rec(…)와 sd.wait()로 정해진 시간만큼 녹음하는 방법을 써요."
        )

    return _raise


InputStream = _unsupported("InputStream")
OutputStream = _unsupported("OutputStream")
Stream = _unsupported("Stream")
RawInputStream = _unsupported("RawInputStream")
playrec = _unsupported("playrec")
