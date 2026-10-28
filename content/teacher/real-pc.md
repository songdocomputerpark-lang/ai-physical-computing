---
title: 진짜 PC에서 돌리기
description: 브라우저 대신 컴퓨터에 토니(Thonny) 5.0을 설치해 사이트의 예제 코드를 그대로 돌리는 방법이에요. 설치 파일과 모델 파일은 공식 누리집에서 받아요.
checked: 2026-10-28
---

이 사이트의 실습은 설치 없이 브라우저에서 끝까지 할 수 있어요. 이 안내는 교과서처럼 컴퓨터에 토니(Thonny, 코드를 쓰고 실행하는 프로그램)를 설치해서 사이트의 예제 코드를 그대로 돌리고 싶을 때 봐요. 진짜 마우스를 움직이는 PyAutoGUI 실습, 실제 마이크로 하는 음성 인식, 집 컴퓨터에서 하는 복습이 그런 경우예요.

사이트의 예제는 **토니 5.0(파이썬 3.14)과 최신 라이브러리**(mediapipe 1.2.0 등) 기준으로 다시 썼어요(판 1.8.0). 교과서에 실린 손, 얼굴, 자세 코드는 옛 MediaPipe 사용법(`mp.solutions`)이라 최신 판에서는 돌지 않아요. 그래서 컴퓨터에서도 사이트의 예제 코드를 받아 써요. 교과서 원고의 설치 절차(021\~022쪽, 120\~122쪽, 191\~193쪽, 198쪽)를 최신 판에 맞게 다듬어 옮겼어요.

:::주의[설치 파일은 공식 누리집에서 받아요]
이 사이트는 설치 프로그램을 올려 두지 않아요. 아래에 적은 공식 주소에서 받아요. 학교 컴퓨터에 프로그램을 설치하려면 관리자 권한이 필요할 수 있으니 전산 담당 선생님과 먼저 이야기해 주세요.
:::

## 판 번호 한눈에 보기

2026-10-28에 다시 확인한 최신 판이에요(처음 맞춘 날 2026-10-26 — 토니 5.0.1이 나와 2026-10-27에, mediapipe 1.2.0이 나와 2026-10-28에 고침). 사이트 예제는 이 판들로 돌려 확인했어요.

| 무엇 | 판 | 쓰는 차시 | 라이선스 |
| --- | --- | --- | --- |
| 토니(Thonny) | 5.0.1(2026-10-26 — 파이썬 3.14.10이 함께 들어 있어요) | 코드를 쓰고 실행하기, 보드에 파일 저장하기 | MIT |
| mediapipe | 1.2.0(2026-10-27 — 손, 얼굴, 자세 사용법은 1.1.1과 같아요) | 손, 얼굴, 자세 인식(1단원, 3-1-2\~3-1-4, 4단원) | Apache-2.0 |
| MediaPipe 모델 파일 4개(자세는 lite, 더 정확하게 하려면 full도) | 아래 [모델 파일 받기](#모델-파일-받기) | 손, 얼굴, 자세 인식 | Apache-2.0 |
| OpenCV(opencv-contrib-python), numpy | 5.0.0.93, 2.5.4(mediapipe를 설치하면 함께 설치돼요) | 카메라와 영상 처리(1단원 전체) | Apache-2.0, BSD |
| pyserial | 3.5 | 시리얼 통신(3-1-2) | BSD |
| bleak | 3.0.2 | 블루투스 통신(3-1-3, 4단원) | MIT |
| PyAutoGUI | 0.9.54 | 마우스와 키보드 조작(보충 P1, 3-1-4, 4단원) | BSD |
| SpeechRecognition, sounddevice | 3.17.0, 0.5.6 | 음성 인식(1-4-3, 선택 차시) | BSD, MIT |
| Pillow | 13.0.0 | 그림에 한글 쓰기(1-4-2) | MIT-CMU |

공식 누리집: [토니](https://thonny.org/), [mediapipe](https://pypi.org/project/mediapipe/), [pyserial](https://pypi.org/project/pyserial/), [bleak](https://pypi.org/project/bleak/), [PyAutoGUI](https://pypi.org/project/PyAutoGUI/), [SpeechRecognition](https://pypi.org/project/SpeechRecognition/), [sounddevice](https://pypi.org/project/sounddevice/), [Pillow](https://pypi.org/project/pillow/)

:::참고[교과서 코드(옛 MediaPipe)를 그대로 돌려야 한다면]
교과서의 `mp.solutions` 코드는 mediapipe 0.10.21 이하에서만 돌아요. 이 판은 파이썬 3.9\~3.12에서만 설치되므로, [파이썬 누리집](https://www.python.org/downloads/)에서 3.12로 시작하는 판을 따로 설치하고 토니의 [도구]-[옵션...]-[인터프리터]에서 그 파이썬을 고른 뒤 `pip install mediapipe==0.10.21`로 설치해요. 사이트 예제와 차시 글은 최신 판 기준이라 이 방법은 교과서 코드를 견줘 보고 싶을 때만 써요.
:::

## 1. 토니와 파이썬 설치하기

1. [토니 누리집](https://thonny.org/)에서 Windows용 설치 파일(5.0.1)을 받아 설치해요. 파이썬 3.14(5.0.1에는 3.14.10)가 함께 들어 있어서 파이썬을 따로 설치하지 않아도 돼요. 토니 5.0은 Windows 10, 11에서 돌아요.
2. 토니를 처음 실행하면 언어(Language)를 고르는 창이 떠요. 한국어를 골라요(원고 021쪽).
3. mediapipe 1.2.0은 64비트 Windows(10, 11)에서만 설치돼요. 32비트 Windows나 Windows 7, 8에서는 손, 얼굴, 자세 인식을 사이트 실습실에서 해요.

토니 5.0의 한국어 메뉴 이름은 다음과 같아요(괄호는 영어 화면). 원고 화면(토니 4)과 조금 달라요.

| 하는 일 | 메뉴 |
| --- | --- |
| 라이브러리 설치(창으로) | [도구]-[패키지 관리...] (Tools → Manage packages...) |
| 라이브러리 설치(명령으로) | [도구]-[시스템 쉘 열기...] (Tools → Open system shell...) |
| 코드를 어디서 돌릴지 고르기 | [실행]-[인터프리터 환경설정...] (Run → Configure interpreter...), 또는 [도구]-[옵션...]의 [인터프리터] 칸 |
| 파이썬 다시 시작 | 빨간 [정지/재시작] 단추 |

## 2. 라이브러리 설치하기

원고 022쪽처럼 토니의 [도구]-[패키지 관리...]에서 이름을 찾아 설치해도 돼요. 여러 개를 한 번에 넣을 때는 명령이 빨라요.

1. 토니의 [도구]-[시스템 쉘 열기...]를 눌러요. 토니가 쓰는 파이썬에 설치되는 명령 창이 열려요.
2. 수업에 필요한 줄만 골라 한 줄씩 입력해요.

```text
pip install mediapipe
pip install pyserial
pip install bleak
pip install pyautogui
pip install pillow
pip install SpeechRecognition sounddevice
```

3. 설치가 끝나면 같은 창에 `python -c "import mediapipe; print(mediapipe.__version__)"`를 입력해 판 번호(1.1.1 이상)가 나오는지 봐요.
4. 토니의 빨간 [정지/재시작] 단추를 한 번 눌러 파이썬을 다시 시작한 뒤 코드를 실행해요.

:::주의[opencv-python을 따로 설치하지 않아요]
mediapipe는 OpenCV(opencv-contrib-python)와 numpy를 함께 설치해요. 원고 022쪽처럼 opencv-python을 따로 또 설치하면 같은 이름(`cv2`)의 OpenCV가 두 벌 생겨 오류가 날 수 있어요. [OpenCV 공식 안내](https://pypi.org/project/opencv-python/)도 네 가지 OpenCV 꾸러미 가운데 하나만 설치하라고 해요. 이미 둘 다 설치했다면 `pip uninstall opencv-python opencv-contrib-python`으로 모두 지운 뒤 `pip install --force-reinstall mediapipe`를 입력해요.
:::

:::주의[최신 mediapipe는 사용 기록을 보내요]
mediapipe 1.x는 인식을 하는 동안 사용 기록을 구글 서버(play.googleapis.com)로 보내요. 사이트가 2026-10-26에 손 인식을 80초 동안 돌려 보니 이 서버에 두 번 접속했어요. 무엇을 보내는지 적은 공식 문서와 끄는 공식 방법은 찾지 못했어요(옛 0.10.21에는 이 기능이 없어요). 학교의 정보 보호 규정에 맞는지 먼저 확인해 주세요. 사이트의 브라우저 실습실은 이런 기록을 보내지 않는 판(브라우저용 0.10.35)으로 돌아요.
:::

- 원고 022쪽의 `wifi` 패키지는 예제 코드에서 쓰지 않아서 설치하지 않아도 돼요.
- `sounddevice`는 마이크로 말할 때만 필요해요(1-4-3). 원고의 PyAudio는 파이썬 3.14용 설치 파일이 없어서, 사이트 예제는 PyAudio 대신 sounddevice로 녹음해요.

## 3. 예제 코드 받기

- 실습실에서 예제를 열고 <strong>[.py 내려받기]</strong>를 누르면 편집칸의 코드가 파일로 내려와요. 차시별 예제는 [예제 갤러리](/labs/gallery/)에서 찾을 수 있어요.
- 손, 얼굴, 자세 예제는 최신 MediaPipe 사용법(`from mediapipe.tasks.python import vision`)으로 다시 쓴 코드예요. 교과서 코드와 줄 번호가 다르고, 무엇을 바꿨는지는 [교과서 원고 정정 목록](/teacher/corrections/)과 차시의 교사용 칸에 적었어요.
- 이름 끝에 "사이트판"이 붙은 예제(보드 쪽 코드 등)는 원본 코드 파일의 오류를 고친 판이에요(고친 줄 끝에 `# [사이트판]`). 진짜 PC에서도 그대로 돌아요.
- 코드 안의 `# @slider 0 255 1` 같은 표시는 실습실의 조절 막대를 만드는 주석이에요. 진짜 PC에서는 보통 주석이라 지우지 않아도 돼요.
- 1-3-3 심화 예제가 읽는 `mask.png`는 교과서 자료에 없어요. 영상 처리 실습실에서 그 예제를 [실행]하면 파일 목록에 사이트가 그린 `mask.png`가 보여요. [내려받기]로 받아 코드 파일과 같은 폴더에 두어요.
- 1-4-2 심화 예제의 한글 글꼴 `C:/Windows/Fonts/malgun.ttf`(맑은 고딕)는 Windows에 들어 있어서 진짜 PC에서는 그대로 써요. 실습실은 이 글꼴 대신 사이트 글꼴(Pretendard)로 그려요.
- 보충 C3의 컴퓨터 쪽 예제는 사이트 전용 `bridge` 모듈을 써서 진짜 PC에서는 돌지 않아요. 진짜 PC에서는 3-1-2처럼 pyserial로 보내요.

## 4. 영상 인식 예제 돌리기(1단원)

- 웹캠이 있어야 해요. `cv2.VideoCapture(0)`의 0은 기본 웹캠이고, 외장 카메라를 달았으면 1이나 2로 바꿔 봐요(원고 198쪽).
- 결과 창을 한 번 눌러 고른 뒤 q 키를 눌러야 끝나요. 키보드 입력은 선택된 창으로 가요.
- 카메라가 켜졌는데 화면이 까맣다면 [카메라는 켜졌는데 화면이 까맣게만 보여요](/help/#camera-black)를 봐요.

### 모델 파일 받기

최신 MediaPipe는 인식에 쓰는 모델 파일을 따로 받아 두어야 해요. 코드의 `model_asset_path='hand_landmarker.task'`가 이 파일 이름이에요. 아래 파일을 받아 **예제 코드 파일과 같은 폴더**에 두어요(토니는 코드 파일이 있는 폴더에서 코드를 실행해요). 학교망에서 공식 주소가 막히면 같은 파일을 사이트에서 받아도 돼요.

| 파일 | 쓰는 코드 | 크기 | 받는 곳 |
| --- | --- | --- | --- |
| `hand_landmarker.task` | 손 인식(`vision.HandLandmarker`) | 7.8MB | [공식](https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task), [사이트](/models/hand_landmarker.task) |
| `face_landmarker.task` | 얼굴 그물(`vision.FaceLandmarker`) | 3.8MB | [공식](https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task), [사이트](/models/face_landmarker.task) |
| `pose_landmarker_lite.task` | 자세 인식(`vision.PoseLandmarker`) | 5.8MB | [공식](https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task), [사이트](/models/pose_landmarker_lite.task) |
| `pose_landmarker_full.task` | 자세 인식을 더 정확하게(lite 대신 쓸 때 — 코드의 파일 이름만 바꿔요, 컴퓨터가 더 느려져요) | 9.4MB | [공식](https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task), [사이트](/models/pose_landmarker_full.task) |
| `blaze_face_short_range.tflite` | 얼굴 상자(`vision.FaceDetector`) | 0.2MB | [공식](https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite), [사이트](/models/blaze_face_short_range.tflite) |

- 모델 파일의 출처와 라이선스(Apache-2.0)는 [MediaPipe 공식 안내](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker)와 사이트의 [출처와 라이선스](/credits/)에 있어요.
- 파일이 없거나 이름이 다르면 `FileNotFoundError: Unable to open file at hand_landmarker.task`가 나요([오류 사전](/help/errors/#mediapipe-model-file)).
- 모델 파일을 한 폴더에 모아 두려면 `model_asset_path='C:/models/hand_landmarker.task'`처럼 전체 경로를 적어요.

## 5. ESP32 보드를 토니로 쓰기(2단원)

1. 보드를 USB 케이블로 컴퓨터에 이어요. 연결할 포트가 보이지 않으면 보드의 USB 칩에 맞는 :용어[드라이버]를 설치해요. CH340 계열은 [WCH 공식 드라이버](https://www.wch-ic.com/downloads/CH341SER_EXE.html), CP210x 계열은 [Silicon Labs 공식 드라이버](https://www.silabs.com/software-and-tools/usb-to-uart-bridge-vcp-drivers)예요. 원고 120쪽처럼 Windows가 스스로 설치하기도 해요. 자세한 확인 순서는 [보드 준비하기](/start/board/#port-not-found)에 있어요.
2. 보드에 :용어[MicroPython] :용어[펌웨어]가 있어야 해요. 가장 쉬운 방법은 [보드 준비하기](/start/board/)의 펌웨어 굽기예요(브라우저에서 MicroPython v1.29.0을 구워요). 토니로 하려면 [실행]-[인터프리터 환경설정...]에서 "MicroPython (ESP32)"와 보드가 연결된 포트를 고른 뒤 아래쪽의 "Install or update MicroPython"을 눌러요(토니 5.0도 이 말은 영어로 보여요). 원고 122쪽처럼 family는 ESP32, variant는 Espressif · ESP32 / WROOM을 골라요. 원고 화면의 판은 1.25.0이고, 사이트는 1.29.0으로 확인했어요.
3. 토니 오른쪽 아래의 인터프리터 이름을 눌러 바꿔요. "MicroPython (ESP32)"를 고르면 코드가 보드에서 돌고, "Local Python 3"을 고르면 컴퓨터에서 돌아요(원고 192쪽, 200쪽).
4. 보드 코드가 부르는 :용어[라이브러리] 파일은 보드에 먼저 저장해요. 토니에서 라이브러리 파일을 열고 [파일]-[...(으)로 저장](영어 화면 File → Save as...)에서 "MicroPython 장치"를 골라 같은 이름으로 저장해요(원고 125\~126쪽, 191쪽). 사이트가 쓰는 라이브러리 파일은 [저장소의 examples/esp32/lib 폴더](https://github.com/songdocomputerpark-lang/ai-physical-computing/tree/main/examples/esp32/lib)에 있어요. 다른 사람이 만든 파일은 그 안의 `third-party` 폴더에 있어요.

| 파일 | 쓰는 차시 |
| --- | --- |
| `i2c_lcd.py` | 문자 LCD(2-1-2, 4-1-4, 4-2-1, 4-2-2) |
| `buzzer.py` | 버저(2-2-1 — 원본에서 게임 음악 선율 목록만 뺀 사이트판) |
| `gorillacell_dcmotors.py` | 팬 모터(2-2-3) |
| `servo_library.py` | 서보모터(2-2-4) |
| `mg90s_servo.py` | 서보모터(4-2-1, 4-2-2, 블루투스 수업 교안) |
| `ESP32BLE.py` | 블루투스(3-1-3, 4단원, 보충 C3의 블루투스판) |
| `esp32_ble_util.py` | 블루투스(블루투스 수업 교안의 스마트폰 앱 예제 `ble-dabble-rgb.py`) |

5. OLED(2-1-3)를 쓰려면 보드에 OLED 드라이버 파일이 있어야 하는데, 사이트는 이 파일을 아직 싣지 않아요. OLED 칩이 SSD1306이면 [micropython-lib의 ssd1306.py](https://github.com/micropython/micropython-lib/tree/master/micropython/drivers/display/ssd1306)(MIT)를 받아 보드에 저장해요. 원고 133쪽의 `sh1106.py`는 원래 출처를 확인하지 못해 사이트가 안내하지 않아요.
6. 사이트 ESP32 실습실의 [실제 보드] 탭을 쓰면 토니 없이도 [실행]과 [보드에 저장]이 되고, 코드가 부르는 라이브러리 파일도 함께 올려 줘요(OLED 드라이버는 빼고).
7. 토니와 사이트는 같은 보드 포트를 함께 쓸 수 없어요. 한쪽을 닫은 뒤 다른 쪽에서 연결해요.

## 6. 통신 실습을 진짜 PC로 하기(3, 4단원)

### 시리얼 통신(3-1-2)

1. USB-UART 변환기를 원고 190쪽 그림처럼 보드에 이어요.
2. 보드 코드를 토니에서 열고 [파일]-[...(으)로 저장]에서 "MicroPython 장치"를 골라 `boot.py`로 저장해요(원고 191쪽). 보드에 전원이 들어오면 저절로 실행돼요. 사이트의 [보드에 저장]은 같은 일을 `main.py`로 해요. 교과서 코드 파일에는 오류가 있어서 사이트판 보드 코드(`3-1-2-uart-laser-site.py`)를 권해요([정정 목록 190·191쪽](/teacher/corrections/#corr-u3)).
3. Windows의 장치 관리자에서 [포트(COM & LPT)]를 펼쳐 변환기의 COM 번호를 찾아요. 컴퓨터 쪽 코드의 `'COM10'` 자리에 그 번호를 적어요. 보드에 코드를 올리는 포트와 변환기 포트는 번호가 달라요.
4. 토니 오른쪽 아래를 "Local Python 3"으로 바꾸고 컴퓨터 쪽 코드를 실행해요(원고 192쪽).

:::참고[boot.py를 되돌리려면]
`boot.py`에 넣은 코드는 보드를 켤 때마다 돌아요. 다음 실습 전에는 보드의 `boot.py`를 지우거나 이름을 바꿔요. 사이트 ESP32 실습실의 [실제 보드] 탭에서 [boot.py 끄기]를 누르면 파일 이름을 `boot_off.py`로 바꿔 저절로 돌지 않게 해요(코드는 지워지지 않아요). 보드가 멈추지 않으면 [보드 되찾기]를 먼저 눌러요.
:::

### 블루투스 통신(3-1-3, 4단원)

1. 컴퓨터 쪽 코드는 `import bluetooth`로 PC용 블루투스 파일을 불러요. 저장소의 [examples/vision/lib/bluetooth.py](https://github.com/songdocomputerpark-lang/ai-physical-computing/blob/main/examples/vision/lib/bluetooth.py)를 받아 코드와 같은 폴더에 두어요(4단원의 일부 예제는 같은 내용의 `bluetooth_lib.py`를 불러요). 이 파일은 bleak 3.0.2에 맞춰 고쳤어요(연결 제한 시간을 연결할 때가 아니라 만들 때 넘겨요).
2. 보드에 `ESP32BLE.py`를 저장하고 보드 코드를 실행하면 콘솔에 "ESP32 블루투스 주소:"와 주소가 나와요. 그 주소를 컴퓨터 쪽 코드의 `bluetooth.init('…')` 자리에 붙여 넣어요(원고 197\~198쪽).
3. 컴퓨터 쪽 코드는 "Local Python 3"에서 실행해요(원고 200쪽).

:::주의[기기 주소는 공개하지 않아요]
블루투스 기기 주소는 보드마다 다른 고유 번호예요. 과제 파일이나 게시판에 그대로 올리지 않고, 예시에는 `XX:XX:XX:XX:XX:XX`처럼 가려 적어요. 사이트는 브라우저가 주소로 연결하지 않아서 광고 이름(예: `ESP32-07`)으로 보드를 골라요. 보드 이름에는 학생 이름이나 학번 대신 자리 번호를 붙여요.
:::

### PyAutoGUI(보충 P1, 3-1-4, 4단원)

- 진짜 마우스와 키보드가 움직여요. 코드가 도는 동안에는 마우스를 쓰기 어려우니, 멈추는 방법을 먼저 알려 주고 실행해요. 마우스를 화면 모서리로 힘껏 밀면(네 모서리 어디든 되고, 보통 왼쪽 위) 안전장치(FAILSAFE)가 코드를 멈춰요.
- 내 코드 파일 이름을 `pyautogui.py`로 짓지 않아요. 파이썬이 설치된 PyAutoGUI 대신 내 파일을 불러와 오류가 나요.
- 보충 P1의 메모장 예제는 기다리는 5초 안에 메모장 창을 눌러 두어야 글자가 그 창에 들어가요.

### 음성 인식(1-4-3, 선택 차시)

- SpeechRecognition과 녹음용 sounddevice가 필요해요. 원고의 `sr.Microphone()`은 PyAudio가 있어야 하는데, PyAudio는 파이썬 3.14(토니 5.0)용 설치 파일이 없어요. 그래서 사이트 예제는 `sounddevice`로 5초를 녹음해 `sr.AudioData`로 감싼 뒤 인식해요.
- `recognize_google()`은 녹음한 목소리를 구글 서버로 보내 글자로 바꾸므로 인터넷에 연결돼 있어야 해요(원고 294쪽 해설).
- 목소리는 개인정보예요. 14세 미만 학생이 듣는 수업에서는 쓰지 않기를 권해요. 사이트 실습실은 목소리 대신 글자를 입력하는 방법이 기본이에요.

## 7. 사이트와 진짜 PC가 다른 점

| 무엇 | 사이트(브라우저 실습실) | 진짜 PC |
| --- | --- | --- |
| 카메라 | 없으면 샘플 입력(움직이는 도형)이나 재생 입력(계산으로 만든 손, 얼굴, 자세 좌표) | 웹캠이 있어야 해요 |
| MediaPipe 모델 파일 | 사이트에 들어 있어요 | 받아서 코드와 같은 폴더에 둬요 |
| MediaPipe 사용 기록 | 보내지 않아요(브라우저용 0.10.35) | mediapipe 1.x가 구글 서버로 보내요 |
| 마우스와 키보드 | 가상 데스크톱(1920×1080) 안의 커서 | 진짜 마우스와 키보드가 움직여요 |
| 음성 | 글자 입력이 기본 | 마이크와 인터넷이 필요해요(구글 서버) |
| 한글 글꼴 | 사이트 글꼴(Pretendard)로 대신 그려요 | Windows의 맑은 고딕을 그대로 써요 |
| 시리얼 통신 | [보내기] 패널이 두 실습실을 이어 줘요 | 코드에 COM 포트 번호를 적어요 |
| 블루투스 | 광고 이름으로 보드를 골라요 | 코드에 기기 주소를 적어요 |
| 보드 라이브러리 | 가상 보드와 [실제 보드] 탭이 알아서 넣어 줘요 | 토니로 보드에 저장해요 |
| 파일 | 실습실의 작업 폴더와 파일 목록 | 코드 파일과 같은 폴더 |

## 이 안내를 확인한 방법

판 번호는 2026-10-26에 각 공식 누리집(PyPI, 토니)에서 확인했어요. mediapipe 0.10.21·0.10.30·1.1.1 설치 파일을 받아 열어 보고 `mp.solutions`가 0.10.30부터 없다는 것을 확인했고, 파이썬 3.14.6에 mediapipe 1.1.1·OpenCV 5.0.0.93·numpy 2.5.4·Pillow 13.0.0을 설치해 사이트 예제를 실제로 돌렸어요(카메라 대신 계산으로 만든 좌표, 인식은 MediaPipe 공식 예시 사진으로). 토니 5.0의 한국어 메뉴 이름은 토니 5.0 설치 꾸러미 안의 한국어 번역 파일에서 확인했어요. 2026-10-27에 판 번호를 다시 확인해 토니 5.0.1(2026-10-26 — 파이썬 3.14.10 동봉)이 나온 것을 반영했고, 5.0.1의 한국어 번역 파일에서도 메뉴 이름이 같았어요. 이날 사이트 예제 76개(컴퓨터 쪽)를 파이썬 3.14로 다시 검사했고, MediaPipe를 쓰지 않는 영상 처리 예제는 OpenCV 5.0.0.93으로 실제 실행해 오류가 없었어요. 2026-10-28에는 mediapipe 1.2.0(2026-10-27)이 나와 설치 파일을 1.1.1과 견줘 보니 손, 얼굴, 자세를 찾는 파이썬 코드가 한 글자도 다르지 않았고(바뀐 것은 새 오디오 기능과 안쪽 엔진), 진짜 1.2.0으로 사이트 예제 45개를 돌려 1.1.1 때와 출력·그림이 같았어요. 1.2.0도 인식하는 동안 같은 구글 서버로 접속하는 코드가 들어 있어요. Windows 컴퓨터에서 토니 화면을 직접 눌러 보지는 못했어요. 설치하다 막히는 곳이 있으면 [기여·문의](/contribute/)로 알려 주세요.
