"""`speech_recognition` 흉내(P2-13, 선택 차시 1-4-3 "말을 글로 바꾸는 기술"). 화면 쪽은 같은 폴더의 index.ts.

학생 코드는 PC에서 쓰던 것을 그대로 쓴다(교과서 f044·f045):

    import speech_recognition as sr

    r = sr.Recognizer()
    with sr.Microphone() as source:
        print("말씀하세요. (5초 이내)")
        audio = r.listen(source, phrase_time_limit=5)
    try:
        text = r.recognize_google(audio, language='ko-KR')
        print("인식된 내용:", text)
    except sr.UnknownValueError:
        print("음성을 인식할 수 없습니다.")
    except sr.RequestError:
        print("서버 요청 실패.")

왜 흉내가 필요한가(CODE_MAPPING §3.5, 확인됨)
- 진짜 라이브러리는 마이크 녹음에 PyAudio(네이티브)를, 인식에 HTTP 전송을 쓴다. 브라우저 안 파이썬(Pyodide)에는 둘 다 없다.
- 브라우저의 음성 인식(Web Speech API)은 **창(window)에서만** 쓸 수 있어 워커에서 부를 수 없다.
  그래서 `listen()`은 apc_runtime.request('speech.listen')으로 화면에 부탁하고, 화면이 글자를 답한다.

세 가지 방식(§10 개인정보, PD-08) — 어느 것이든 이 파일의 코드는 같다. 고르는 곳은 실습실 오른쪽 패널이다.
1. **글자 입력(기본)**: 말하는 대신 입력칸에 적은 문장이 인식 결과가 된다. 마이크도, 바깥으로 나가는 통신도 없다.
2. **내 기기 안 인식**: 브라우저가 기기 안에서 알아듣는다(Chrome 139+의 온디바이스 인식).
3. **서버 인식**: 음성이 브라우저 회사 서버로 전송된다. **교사가 사이트 설정(/settings/)에서 켠 브라우저에서만** 고를 수 있다.

예외는 원본과 같은 자리에서 난다: 못 알아들으면 `UnknownValueError`, 권한·네트워크·미지원이면 `RequestError`.
`listen()`은 이 둘을 바로 내지 않고 오디오에 담아 두었다가 `recognize_google()`에서 낸다(원본 코드의 try 자리가 그대로 산다).

규칙(src/lab/README.md 4.4): apc_runtime의 request·get·notice·register_reset_hook만 쓴다.
초기화 함수(_reset — 실행 시작 때 동기 진입점에서 불림)에서는 양보하는 함수를 쓰지 않는다(PROGRESS 미해결 25번).
라이선스: 사이트 소프트웨어(MIT, PD-26). 원본 SpeechRecognition(BSD-3-Clause) 코드는 쓰지 않고 API 이름만 맞췄다.
"""

import apc_runtime

#: 화면에 "한 마디 받아 주세요"라고 부탁하는 요청 이름(manifest.ts의 requestKinds와 같아야 한다)
REQUEST_LISTEN = "speech.listen"
#: 화면이 알려 주는 지금 방식(text·ondevice·server)
MODE_VALUE = "speech.mode"
#: 제한 모드(JSPI 없는 브라우저)에서 쓸, 실행 전에 적어 둔 문장
TEXT_VALUE = "speech.text"

#: 이 사이트가 알아듣는 언어(화면이 ko-KR로 인식한다)
SITE_LANGUAGE = "ko-KR"

LIMITED_NOTICE = (
    "이 브라우저에서는 실행 중에 말을 받을 수 없어서, 실행 전에 오른쪽 패널의 글자 칸에 적어 둔 문장을 씁니다. "
    "컴퓨터의 Chrome이나 Edge 최신판에서 열면 실행 중에도 주고받을 수 있어요."
)
EMPTY_TEXT_MESSAGE = "받은 문장이 없어요. 오른쪽 패널의 글자 칸에 문장을 적고 [보내기]를 눌러 주세요."

_notified_limited = False
_notified_language = False


class RequestError(Exception):
    """인식 서비스를 쓸 수 없을 때(권한 거부, 네트워크, 지원하지 않는 언어 등). 원본과 같은 이름·자리."""


class UnknownValueError(Exception):
    """말을 알아듣지 못했을 때. 원본과 같은 이름·자리."""


class WaitTimeoutError(Exception):
    """timeout 안에 말이 시작되지 않았을 때(원본 listen의 timeout 인자)."""


class AudioData:
    """`listen()`이 돌려주는 것. 원본은 소리 데이터를 담지만, 이 사이트는 화면이 알아들은 **글자**를 담는다.

    학생 코드는 이 값을 `recognize_google()`에 넘기기만 하므로 쓰는 법은 같다.
    """

    def __init__(self, text="", failure=None, message="", mode="text"):
        self.text = str(text)
        #: None(성공) · "unknown"(못 알아들음) · "request"(권한·네트워크·미지원)
        self.failure = failure
        self.message = str(message)
        #: 어떤 방식으로 받았는지: text · ondevice · server
        self.mode = str(mode)

    def get_text(self):
        """담긴 글자(이 사이트에만 있는 도우미)."""
        return self.text

    def __repr__(self):
        if self.failure:
            return f"<AudioData 실패: {self.failure} ({self.message})>"
        return f"<AudioData {self.mode}: {self.text!r}>"


class Microphone:
    """원본은 PyAudio 마이크를 연다. 이 사이트에서는 실습실 패널(글자 입력 또는 브라우저 음성 인식)이 그 자리를 대신한다.

    원본은 PyAudio가 없으면 `Microphone()`을 만들 때 오류가 나지만, 여기서는 항상 성공한다(CODE_MAPPING §3.5).
    """

    def __init__(self, device_index=None, sample_rate=None, chunk_size=1024, **_ignored):
        self.device_index = device_index
        self.sample_rate = sample_rate
        self.chunk_size = chunk_size
        self.stream = None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        return False

    @staticmethod
    def list_microphone_names():
        """PC에서는 마이크 장치 이름 목록이다. 이 사이트에는 장치가 하나뿐이다."""
        return ["실습실 입력(글자 입력 또는 브라우저 음성 인식)"]

    @staticmethod
    def list_working_microphones():
        return {0: "실습실 입력(글자 입력 또는 브라우저 음성 인식)"}


def _notice_once(flag_name, text, level="info"):
    """같은 안내를 실행마다 한 번만 콘솔에 쓴다(f045처럼 반복하는 코드에서 안내가 도배되지 않게)."""
    if globals().get(flag_name):
        return
    globals()[flag_name] = True
    apc_runtime.notice(text, level)


def _audio_from_reply(reply):
    """화면이 답한 사전을 AudioData로 바꾼다."""
    if not isinstance(reply, dict):
        return AudioData(failure="request", message="화면에서 온 답을 읽지 못했어요.")
    mode = str(reply.get("mode", "text"))
    if reply.get("ok"):
        return AudioData(text=reply.get("text", ""), mode=mode)
    failure = str(reply.get("failure", "unknown"))
    message = str(reply.get("message", ""))
    if failure == "timeout":
        raise WaitTimeoutError(message or "말이 시작되지 않았어요.")
    return AudioData(failure=failure if failure in ("unknown", "request") else "request", message=message, mode=mode)


class Recognizer:
    """원본 `sr.Recognizer()`와 같은 자리. 값 설정(energy_threshold 등)은 받아만 두고 쓰지 않는다."""

    def __init__(self):
        self.energy_threshold = 300
        self.dynamic_energy_threshold = True
        self.pause_threshold = 0.8
        self.phrase_threshold = 0.3
        self.non_speaking_duration = 0.5
        self.operation_timeout = None

    def adjust_for_ambient_noise(self, source=None, duration=1):
        """원본은 주변 소음을 재서 기준값을 맞춘다. 이 사이트에서는 할 일이 없다(오류 없이 넘어간다)."""
        return None

    def listen(self, source=None, timeout=None, phrase_time_limit=None, snowboy_configuration=None, **_ignored):
        """한 마디를 받는다. 화면이 답할 때까지 이 자리에서 기다린다([정지]를 누르면 KeyboardInterrupt).

        - phrase_time_limit: 음성으로 받을 때 최대 몇 초까지 들을지(글자 입력 방식에서는 재촉하지 않는다).
        - timeout: 이 시간 안에 말이 시작되지 않으면 원본처럼 WaitTimeoutError.
        """
        payload = {
            "phraseTimeLimit": float(phrase_time_limit) if isinstance(phrase_time_limit, (int, float)) else None,
            "timeout": float(timeout) if isinstance(timeout, (int, float)) else None,
            "language": SITE_LANGUAGE,
        }
        if not apc_runtime.can_wait():
            # 제한 모드(JSPI 없음): 기다릴 수 없으므로 실행 전에 적어 둔 문장을 쓴다(카메라의 camera.frame과 같은 방식).
            _notice_once("_notified_limited", LIMITED_NOTICE, "warn")
            text = apc_runtime.get(TEXT_VALUE, "")
            text = "" if text is None else str(text).strip()
            if text == "":
                return AudioData(failure="unknown", message=EMPTY_TEXT_MESSAGE, mode="text")
            return AudioData(text=text, mode="text")
        return _audio_from_reply(apc_runtime.request(REQUEST_LISTEN, payload))

    def listen_in_background(self, source, callback, phrase_time_limit=None):
        """원본은 따로 스레드를 돌린다. 브라우저 파이썬에는 스레드가 없어 쓸 수 없다."""
        raise RequestError(
            "listen_in_background(백그라운드 듣기)는 이 사이트에서 쓸 수 없어요. "
            "`with sr.Microphone() as source:` 안에서 r.listen(source)를 쓰는 방법으로 바꿔 주세요."
        )

    def recognize_google(self, audio_data, key=None, language="en-US", pfilter=0, show_all=False, with_confidence=False, **_ignored):
        """받은 오디오를 글자로 돌려준다. 못 알아들었으면 UnknownValueError, 서비스 문제면 RequestError."""
        if not isinstance(audio_data, AudioData):
            raise TypeError("``audio_data`` must be audio data")
        if language and not str(language).lower().startswith("ko"):
            _notice_once(
                "_notified_language",
                f"이 사이트의 음성 인식은 한국어({SITE_LANGUAGE})로 동작해요. language='{language}'는 이번에는 그대로 쓰지 못했어요.",
                "warn",
            )
        if audio_data.failure == "request":
            raise RequestError(audio_data.message or "음성 인식 서비스를 쓸 수 없어요.")
        if audio_data.failure or audio_data.text.strip() == "":
            raise UnknownValueError(audio_data.message or "말을 알아듣지 못했어요.")
        text = audio_data.text
        if show_all:
            return {"alternative": [{"transcript": text, "confidence": 1.0}], "final": True}
        if with_confidence:
            return (text, 1.0)
        return text

    def __getattr__(self, name):
        """recognize_google 말고 다른 인식기(sphinx·whisper·azure…)를 부르면 한국어로 까닭을 알려 준다."""
        if name.startswith("recognize_"):

            def _unavailable(*_args, **_kwargs):
                raise RequestError(
                    f"이 사이트에서는 {name}()을(를) 쓸 수 없어요. 브라우저 안에서 도는 인식만 쓰므로 "
                    "recognize_google(audio, language='ko-KR')로 바꿔 주세요."
                )

            return _unavailable
        raise AttributeError(f"'Recognizer' object has no attribute '{name}'")


def _reset():
    """실행이 시작될 때 안내 표시를 되돌린다(동기 진입점 — 양보하는 함수를 쓰지 않는다)."""
    global _notified_limited, _notified_language
    _notified_limited = False
    _notified_language = False


apc_runtime.register_reset_hook(_reset)
