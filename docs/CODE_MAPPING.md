# CODE_MAPPING.md — 소스코드 → 브라우저 대체 매핑 (Phase 0)

- 작성일: 2026-09-15 / 단계: Phase 0 (SPEC §3.2 산출물)
- 대상: 원본 자료 속 코드 파일 **158개 전부**(`fNNN` 번호는 `docs/INVENTORY.md`와 같다).
- 근거: 코드 매핑 5건(1단원 영상 처리, 2단원 피지컬+HW 라이브러리, 3단원 통신, 4단원 프로젝트, opmp·pyautogui·블루투스 폴더)의 결과, 공식 문서 확인 3건(브라우저 파이썬·비전 AI / ESP32 연결·무선 통신 / 교육과정·저작권·개인정보), 그리고 이 문서를 쓰면서 추출 사본을 직접 열고 공식 문서를 추가로 확인한 결과.
- 운영자 결정 반영(`docs/DECISIONS.md`): 승인·선택은 위임받았으므로(O1) 선택이 필요한 곳은 **Claude 결정(근거)** 으로 적었다. 원본 자료와 업체·공개 라이브러리는 모두 **사용 가능**(O2~O5)하고, 파일 안의 원래 저작권·라이선스 주석은 지우지 않는다. 예외는 개인정보뿐이다.
- 기술 세부 결정(가상 보드 입력 전달 방식, Pyodide 로딩 방식, 스택)은 `docs/PLAN.md`가 정한다. 이 문서의 shim 설계는 그 결정이 무엇이든 쓸 수 있게 "동기 대기 도구 하나"에만 기대도록 적었다(§3.0).
- 표기: **확인됨**(공식 문서·저장소·원본 파일로 확인), **추정**(근거는 있으나 확인 못 함), **미확인**(확인 못 함). **연구 결과 반영** = 코드 매핑 당시의 "확인 필요"를 공식 문서 확인 결과로 고친 곳. **사본 대조** = 이 문서를 쓰며 추출 사본을 직접 열어 확인한 곳. T1·T2 = Phase 0 공식 문서 확인 3건 중 T1(브라우저 파이썬·비전 AI)·T2(ESP32 연결·무선 통신), T3는 교육과정·저작권·개인정보(PLAN 머리말).
- **2차 검토 반영(2026-09-15):** 추출 사본 줄 끝 손상 범위(158개 전부, §2.2 머리말), f113 레이저 끄기 코드 부재(§4.2 #4), `ESP32BLE_LIB` 별칭 없음으로 통일(§3.10), Android·Firefox Web Serial 최신 상태(§3.6, §4.1), `time_pulse_us`·UART 기본값(§3.8.1), mediapipe 판 순서(§3.2.7·§5.4), BLE 이름 규칙(§3.9), 제3자 코드 등록·라이선스 적용 제외(§5)를 고쳤다. 매핑 표 id 158개 누락 없음을 기계로 확인했다.

> **공개 저장소 주의:** 이 문서는 공개 저장소에 올라갈 수 있다. 그래서 코드에 박힌 BLE 기기 주소(MAC)·COM 포트 전체 값, 사적인 경로·계정명은 적지 않았다. 사람 이름은 사이트 저작자 표기(C2)와 공개 라이브러리 저작자만 적었다.

---

## 1. 요약

### 1.1 실행 대상별 파일 수와 판정 분포

| 실행 대상 | 파일 수 | 그대로 | shim으로 거의 그대로 | 일부 수정 | 브라우저 불가(다운로드 제공) |
|---|---|---|---|---|---|
| PC 파이썬 (OpenCV·MediaPipe·pyautogui·pyserial·음성 인식·BLE 예제) | 67 | 1 | 63 | 3 | 0 |
| ESP32 MicroPython 예제 | 68 | 0 | 62 | 6 | 0 |
| 라이브러리(ESP32용) | 17 | 0 | 16 | 1 | 0 |
| 라이브러리(PC용, bleak 래퍼 `bluetooth.py` 사본) | 6 | 0 | 0 | 0 | 6 |
| **합계** | **158** | **1** | **141** | **10** | **6** |

- 내용이 완전히 같은 사본 11묶음(29개)을 하나로 치면 서로 다른 코드는 140개다(INVENTORY §7.1). 표에서는 사본도 행을 남기고 "= fNNN과 동일"로 표시했다.
- "일부 수정" 10개: f024, f039, f041(PC) / f062, f074, f082, f083, f111, f113(ESP32) / f009(라이브러리). 이유는 §2 각 행 비고.
- "브라우저 불가" 6개: f088 = f102 = f107 = f116 = f139 = f142(PC용 `bluetooth.py`). 사이트 안에서는 같은 이름·같은 사용법의 대체 모듈(Web Bluetooth)을 쓰고, 원본은 "진짜 PC에서 돌리기" 내려받기로 둔다.
- **판정 변경 2건(코드 매핑 결과 대비):** f043 일부 수정 → 거의 그대로(Pyodide Pillow 빌드에 FreeType이 켜져 있음을 확인, 연구 결과 반영), f050 일부 수정 → 거의 그대로(사이트 배포 `i2c_lcd.py`에 원래 이름 `move_to`를 별칭으로 되살림, Claude 결정). 이 때문에 INVENTORY §1의 집계(거의 그대로 139 / 일부 수정 12)를 141 / 10으로 맞췄다(2차 검토, 매핑 표 158행을 기계로 세어 이 표와 일치 확인).

단원·묶음별 분포:

| 묶음(§2 소제목) | 파일 | 그대로 | 거의 그대로 | 일부 수정 | 불가 |
|---|---|---|---|---|---|
| 2.1 1단원 영상 처리 (f026~f045) | 20 | 0 | 18 | 2 | 0 |
| 2.2 2단원 피지컬 (f046~f081) | 36 | 0 | 34 | 2 | 0 |
| 2.3 3단원 통신 (f082~f091) | 10 | 0 | 7 | 2 | 1 |
| 2.4 4단원 프로젝트 (f092~f117) | 26 | 0 | 21 | 2 | 3 |
| 2.5 opmp (f118~f136) | 19 | 1 | 18 | 0 | 0 |
| 2.6 pyautogui (f016~f025) | 10 | 0 | 9 | 1 | 0 |
| 2.7 블루투스통신 폴더 (f137~f158) | 22 | 0 | 20 | 0 | 2 |
| 2.8 HW 라이브러리 (f001~f015) | 15 | 0 | 14 | 1 | 0 |

### 1.2 모듈별로 필요한 대체물 한눈에 보기

| 원본이 쓰는 것 | 브라우저에서 | 해당 파일(사본 포함 개수) |
|---|---|---|
| `cv2`(OpenCV) | Pyodide `opencv-python` 실물 + 카메라·창 shim | 카메라를 쓰는 PC 예제 전부(f027·f028·f092·f128·f129 등 순수 OpenCV 포함) |
| `mediapipe`(레거시 `mp.solutions`) | MediaPipe Tasks Vision(JS)로 추론하고 레거시 결과 구조를 흉내 내는 shim | 손 19, 얼굴 메시 21, 포즈 5, 얼굴 검출 1 |
| `pyautogui`, `webbrowser` | 페이지 안 가상 데스크톱 mock | `pyautogui` 21(그중 f122·f126은 import만), `webbrowser` 2 |
| `speech_recognition` | Web Speech API 브리지 또는 글자 입력 mock | 2 (f044, f045) |
| `serial`(pyserial) | Web Serial / 가상 UART 선 / MQTT | 2 (f084, f085) |
| PC용 `bluetooth`·`bluetooth_lib`(bleak 래퍼) | Web Bluetooth(Nordic UART Service) / 가상 BLE 링크 | 쓰는 예제 8(f089, f100, f104, f114, f138, f140, f141, f158) + 원본 6 |
| `machine`·`time`·`neopixel`·`micropython`·`ustruct` | 가상 보드 mock + SVG 부품, 실제 보드는 Web Serial raw REPL | ESP32 예제 68 + ESP32 라이브러리 17 |
| `ESP32BLE`(`ubluetooth` 사용), `esp32_ble_util`(`bluetooth` 사용) | 가상 BLE 주변기기 mock | `ESP32BLE` 쓰는 예제 18(`ESP32BLE_LIB` 이름 2 포함) + 원본 4, f002 + f009 |
| `input()` | 콘솔 입력 브리지 | 6 (f049, f056, f076, f077, f081, f084) |

### 1.3 브라우저 전환이 가장 어려운 5개

| 순위 | 파일 | 왜 어려운가 | 대응 방향 |
|---|---|---|---|
| 1 | **f104 = f114** 얼굴 마우스 + BLE 송신 최종판(4.2.1) | 한 페이지에서 Pyodide(OpenCV) + MediaPipe 얼굴 추론(478점, EAR 계산) + 가상 데스크톱(`moveTo`·`doubleClick`·`click(button='right')`) + Web Bluetooth 송신 + 수신 쪽 가상 ESP32(LCD·서보 2·RGB·레이저·버저)를 **동시에** 돌려야 한다. 매 프레임 응답 대기 쓰기, 프레임 수에 묶인 보정(30프레임)과 깜박임 판정(0.4초), 수신 코드의 3840×2160 화면 가정이 겹친다 | 전송은 비동기 큐(상태 메시지는 최신값만, 클릭 이벤트는 보존), 가상 데스크톱 논리 해상도를 예제 설정으로 3840×2160, 가상 ESP32는 가벼운 워커로 분리(§3, §6) |
| 2 | **f088 계열 `bluetooth.py`**(f088 = f102 = f107 = f116 = f139 = f142) | 스레드 + 별도 스레드의 asyncio 루프 + bleak(OS 블루투스)에 기대는 구조다. Pyodide는 스레드를 지원하지 않고(확인됨), bleak 지원 OS 목록에 브라우저가 없다(확인됨). Web Bluetooth는 MAC 주소로 연결할 수 없고 사용자 클릭으로 기기 선택 창을 열어야 하며, 워커에서는 쓸 수 없다(`[Exposed=Window]`, 명세 사본 대조) | 같은 이름·같은 함수(`init/send/connected/disconnect`)의 대체 모듈을 새로 만든다. 연결은 실행 전 [BLE 연결] 버튼, 쓰기는 한 번에 하나씩(§3.7) |
| 3 | **f087 계열 `ESP32BLE.py`**(f087 = f101 = f146 = f153) + **f002·f009** | 가상 보드가 BLE GATT 서버를 흉내 내고, PC 쪽(또는 교실의 다른 브라우저)이 쓴 값을 실행 중인 루프에 IRQ 콜백으로 끼워 넣어야 한다. `Timer(0)` 주기 콜백(상태 LED), 특성 버퍼 기본 20바이트(확인됨), 수신 값 한 칸 덮어쓰기까지 실물과 같아야 결과가 같다. f009는 CPython에서 `bytes + str` 결합이 실패한다(사본 대조) | 저수준 `ubluetooth`/`bluetooth` mock 하나로 f087 원본을 그대로 돌리고(사본 대조: `bytes(self.name, 'utf-8')`라 CPython에서도 결합 가능), f009만 가상 보드용 호환 처리(§3.9) |
| 4 | **f044·f045** 음성 인식(1.4.3) | `speech_recognition` + PyAudio(네이티브) + `recognize_google`(파이썬 HTTP) 사슬이 Pyodide에서 모두 불가능하다(소켓 비작동, 확인됨). 대체 후보 Web Speech API는 창(Window)에서만 쓸 수 있고(명세 확인), Chrome 기본 인식은 음성을 서버로 보내며, Firefox는 설정 플래그 뒤에만 있다(확인됨). 원본은 녹음(`listen`)과 인식(`recognize_google`)이 나뉘지만 Web Speech API는 녹음 파일을 받지 않는다 | 메인 화면 브리지 + 온디바이스 인식 우선(`processLocally`), 안 되면 서버 전송 고지 후 선택, 기본 대안은 글자 입력 mock(§3.5) |
| 5 | **f001·f007·f015** `sleep` 없는 폴링 루프(+ `input()`을 쓰는 f049·f056·f076·f077·f081·f084) | 루프가 양보하지 않아, 실행 중에 가상 버튼·가상 UART 입력을 넣을 틈이 없다. 가상 보드 입력 전달 방식(PLAN 결정1)에 가장 직접 걸린다. `input()`은 워커 안에서 줄 입력을 동기로 기다려야 한다 | 모든 가상 입력 조회 함수(`uart.any()`, `Pin.value()`, `adc.read()`)를 "입력 확인 지점"으로 만들어 일정 간격마다 양보하거나 공유 메모리를 읽는다(§3.0) |

다음 후보: f039(파이썬 3중 루프 픽셀 합성 → WASM에서 실시간 어려움, 추정), f082~f085(USB-UART 변환기 포트와 보드 REPL 포트 두 개), f090·f091·f016~f025(실제 데스크톱 조작 불가 → 가상 데스크톱이 앱까지 흉내 내야 함), f013(TM1637 비트뱅: 명령 한 번에 핀 토글·`sleep_us` 수백 회).

---

## 2. 매핑 표

### 2.0 읽는 법

**판정 기준(Claude 결정 — 매핑 5건의 기준을 하나로 맞춤)**

| 판정 | 뜻 |
|---|---|
| 그대로 | Pyodide에서 shim 없이 돈다 |
| shim으로 거의 그대로 | 사이트가 제공하는 것(§3의 shim·mock, 자료에 없는 라이브러리의 사이트 작성본, `mask.png`·글꼴 같은 자산, 사이트 배포 라이브러리의 호환 별칭)이 있으면 **파일 자체는 고치지 않고** 원래 목적대로 돈다. 끝낼 때만 나는 예외, 판정·계산 논리의 결함, 한 예제 안의 핀 겹침은 판정에 넣지 않고 비고에 "사이트판 수정"으로 적는다 |
| 일부 수정 | 파일을 고쳐야 브라우저에서 원래 목적을 달성한다: 정상 흐름에서 예외로 멈춤(원본 결함 포함), 이름 통일 결정으로 import 줄을 바꿈, 또는 브라우저 성능으로는 목적 달성이 어렵다고 추정됨. 라이브러리는 가상 보드(Pyodide)에서 원본을 그대로 import할 수 없으면 여기에 둔다(실제 보드에는 원본을 올릴 수 있음) |
| 브라우저 불가(다운로드 제공) | 원본 파일을 사이트의 어느 실행 경로(Pyodide, 가상 보드, Web Serial 실제 보드)에서도 쓸 수 없다 |

**원본 파일 칸의 약칭**

| 약칭 | 실제 위치 |
|---|---|
| `강의준비.zip` | `교과서_소스코드/2026.02.03. 인피컴_강의준비.zip` |
| `opmp.zip` | `교과서_소스코드/opmp.zip` |
| `pg.zip` | `pyautugoui_소스코드/pg (1).zip` |
| `HW.zip` | `HW_소스코드/마이크로파이썬_라이브러리__.zip` |
| `BT/…` | `블루투스통신_소스코드/…` (폴더 이름은 앞부분만) |
| `thonny(던짐).zip` / `thonny(받음).zip` | `BT/3.(응용)(값을 던짐)…/thonny_블루투스.zip` / `BT/3.(응용)(값을 받음)…/thonny_블루투스.zip` (두 zip은 MD5 동일) |
| `opmp블루투스.zip` | `BT/3.(응용)(값을 던짐)…/opencvmediapipe_블루투스.zip` |
| 1단원 폴더 `1.1.2` 등 | zip 안 `1. 영상 처리 인공지능/1.1. …/2. …` 같은 폴더 번호. 2단원은 `2.1 디스플레이`·`2.2 출력`, 3·4단원은 `3.1.2`, `4.1.4`처럼 줄였다 |

**교과서 쪽 칸:** "p17"은 인쇄 쪽 번호. U1·U2A·U2B·U2C·U3·BT·PPT 약칭은 INVENTORY와 같다(U1 = 1단원 원고 PDF, BT = 블루투스 수업교안 PDF, PPT = pyautogui 슬라이드). "파일명 기준"은 원고가 없어 파일 이름의 쪽 번호만 적은 것이다.

**실행 방법·shim 칸의 약칭**(상세는 §3)

| 약칭 | 뜻 |
|---|---|
| VL | 영상처리 실습실(Vision Lab): Pyodide 워커에서 학생 코드 실행 |
| CV | `cv2` 카메라·창 shim(§3.1): `VideoCapture`·`imshow`·`waitKey`·`namedWindow`·`getWindowProperty`·`destroyAllWindows`. 그 밖의 OpenCV 함수는 실물 |
| MPH / MPF / MPD / MPP | `mediapipe` 레거시 흉내 shim(§3.2): 손(HandLandmarker) / 얼굴 메시(FaceLandmarker) / 얼굴 검출(FaceDetector) / 포즈(PoseLandmarker) |
| DRAW | `mediapipe.solutions.drawing_utils` 흉내(§3.2.6): numpy 프레임에 직접 그림 |
| PAG / WEB | `pyautogui` 가상 데스크톱 mock / `webbrowser` shim(§3.4) |
| SR | `speech_recognition` shim(§3.5) |
| SER | `serial` shim(§3.6): Web Serial / 가상 UART 선 / MQTT |
| BTPC | PC용 `bluetooth`·`bluetooth_lib` 대체 모듈(§3.7) |
| IN | `input()` 콘솔 입력 브리지(§3.3) |
| RUN | 러너 공통(§3.3): 정지 버튼, `exit()`, `__main__`, 콘솔 출력 제한 |
| FS | Pyodide 가상 파일시스템에 자산 미리 두기(`mask.png`, 글꼴) |
| VB | 가상 보드(§3.8): Pyodide 워커의 `machine`·`time`·`micropython`·`ustruct` mock + SVG 부품 |
| VB-UART / VB-I2C / VB-OLED / VB-PWM / VB-ADC / VB-NEO / VB-BLE / VB-DFP | 가상 보드 부품·주변장치(§3.8~§3.9): UART 상대 / I2C 장치(LCD 0x20 등) / OLED / PWM(서보·팬·버저·LED 밝기) / ADC(4채널 터치) / 네오픽셀 / BLE 주변기기 / MP3 모듈 |
| LIB | 사이트가 제공하는 MicroPython 라이브러리(§3.10): 자료에 있는 원본, 자료에 없어 새로 쓰는 것(`servo_library`, PWM판 `gorillacell_dcmotors`, `ssd1306`/`sh1106`) |
| RB | 실제 보드(§3.11): Web Serial로 raw REPL 실행·보드에 저장·라이브러리 업로드 |

### 2.1 1단원 영상 처리 인공지능 (f026~f045, 20개)

공통: 모두 PC 파이썬. 무한 루프(`while True` / `while cap.isOpened()`) 안에서 `cap.read()`·`process()`·`waitKey()`를 부르므로 VL 워커 실행 + CV가 기본이다. MediaPipe를 쓰는 16개는 모두 레거시 `mp.solutions` API다(Tasks API 사용 0개).

| 원본 파일 | 사용하는 모듈 | 브라우저에서 실행 방법 | 필요한 shim/mock | 그대로 돌아가는가 | id | 교과서 쪽 | 비고 |
|---|---|---|---|---|---|---|---|
| `강의준비.zip ▸ 1.1.2 ▸ [고등] 1-1-2_기본 실습 코드(p17).py` | cv2, mediapipe(hands, drawing_utils) | VL + 손 추론 | CV(`VideoCapture(0)`·`read`·`imshow`·`waitKey`·`destroyAllWindows`), MPH(`Hands()` 기본값), DRAW(`draw_landmarks` 3인자) | shim으로 거의 그대로 | f026 | p17 (U1) | BGR 프레임을 변환 없이 `process()`에 넘김(원본 결함, PC에서도 같음). shim은 받은 배열 그대로 추론해 원본 동작을 재현하고, 사이트판은 RGB 변환을 넣는다. 원고 p17은 정의 안 된 `img_rgb` 사용 → 사이트판 기준은 파일+RGB 변환(Claude 결정). 레거시 `Hands()` 기본 `max_num_hands=2`(연구 결과 반영) → shim `numHands=2` |
| `강의준비.zip ▸ 1.1.3 ▸ [고등] 1-1-3_기본 실습 코드(p23).py` | cv2 | VL | CV만 | shim으로 거의 그대로 | f027 | p23 (U1) | MediaPipe 없는 카메라 출력 틀. `setup_external_services()`는 정의만 있고 호출 안 함. 원고 p21~23의 Thonny 설치 절차는 "설치 없이 실행"으로 대체 |
| `강의준비.zip ▸ 1.2.1 ▸ [고등] 1-2-1_기본 실습 코드(p28).py` | cv2 | VL | CV(`isOpened()` = 카메라 권한·스트림 상태, `waitKey(30)`), RUN(`exit()` → SystemExit를 정상 종료로) | shim으로 거의 그대로 | f028 | p28 (U1) | `flip` 코드(0/1/-1)·`waitKey` 값 바꾸기 활동(p32)은 `@select`·`@slider` 후보. 브라우저 프레임 간격이 PC와 달라 "갱신 속도" 체감이 다를 수 있다. Pyodide에 `exit` 내장이 있는지 미확인 → 없으면 러너가 넣는다 |
| `강의준비.zip ▸ 1.2.1 ▸ [고등] 1-2-1_심화 실습 코드(p30).py` | cv2, mediapipe(hands, drawing_utils) | VL + 손 추론 | CV, MPH(`static_image_mode=False`→VIDEO, `max_num_hands=1`→`numHands:1`, `min_detection_confidence=0.5`→`minHandDetectionConfidence`), DRAW | shim으로 거의 그대로 | f029 | p30~31 (U1) | 원고와 코드 같음. 인자값 조절 활동(p32)은 슬라이더로 적합(0~1 범위 검증). Tasks 모델이 레거시와 달라 같은 신뢰도에서 결과가 조금 다를 수 있다 |
| `강의준비.zip ▸ 1.2.2 ▸ [고등] 1-2-2_기본 실습 코드(p36).py` | cv2, mediapipe(hands), numpy | VL + 손 추론 | CV, MPH(`multi_hand_landmarks[0].landmark[8].x/.y`) | shim으로 거의 그대로 | f030 | p36~37 (U1) | `np.zeros_like`·`cv2.line`·`cv2.addWeighted` 실물. 주석 "한 손만 인식"은 레거시 기본값 2와 어긋나지만 `[0]`만 써서 동작 영향 없음. 원고 p37의 `= =` 조판 오타는 오류 사전 후보. 10~15fps 제한에서는 선이 각지게 보일 수 있다 |
| `강의준비.zip ▸ 1.2.2 ▸ [고등] 1-2-2_심화 실습 코드(p38).py` | cv2, mediapipe(hands), numpy | VL + 손 추론 + 키 입력 | CV(`waitKey`가 캔버스 포커스일 때만 키 코드 0~255, 터치용 화면 키 [d][q]), MPH | shim으로 거의 그대로 | f031 | p38~39 (U1) | `& 0xFF`를 주석 처리했지만 shim이 0~255만 돌려주면 원고판·파일판 모두 동작. 원고 말풍선의 "손가락을 펼쳤을 때만 그림" 기능은 코드에 없음. f030을 확장 |
| `강의준비.zip ▸ 1.2.3 ▸ [고등] 1-2-3_기본 실습 코드(p45).py` | cv2, mediapipe(hands, drawing_utils), math | VL + 손 추론 | CV, MPH(`landmark[4]`·`[8]`), DRAW | shim으로 거의 그대로 | f032 | p45~46 (U1) | 거리가 픽셀 단위라 카메라 해상도에 좌우 → `cap.get` 값과 실제 프레임 크기를 반드시 일치. 손 2개면 `Distance` 글자가 겹침(레거시 기본 2를 흉내 내면 원본과 같음) |
| `강의준비.zip ▸ 1.2.3 ▸ [고등] 1-2-3_심화 실습 코드(p48).py` | cv2, mediapipe(hands, drawing_utils), math | VL + 손 추론 | CV, MPH, DRAW | shim으로 거의 그대로 | f033 | p48~49 (U1) | 원고는 `int(distance)`·색 (255,0,0), 파일은 `int(math.hypot())`·색 (0,255,255). 반지름이 화면보다 커도 `cv2.circle`이 잘라 그려 오류 없음 |
| `강의준비.zip ▸ 1.3.1 ▸ [고등] 1-3-1_기본 실습 코드(p55).py` | cv2, mediapipe(face_mesh) | VL + 얼굴 메시 | CV(`read()`는 프레임이 올 때까지 대기), MPF(`FaceMesh(max_num_faces=1)`, `refine_landmarks` 기본 False → **468점만** 반환) | shim으로 거의 그대로 | f034 | p55 (파일명 기준, 원고 없음) | `if not ret: print(); continue`라서 `read()`가 False를 돌려주면 `waitKey` 없는 폭주 루프 → shim은 False를 거의 돌려주지 않고 정지는 루프 밖 예외·워커 종료로. 레거시 468점·`refine_landmarks` 기본 False, Tasks 478점(연구 결과 반영) |
| `강의준비.zip ▸ 1.3.1 ▸ [고등] 1-3-1_심화 실습 코드(p58).py` | cv2, mediapipe(face_mesh) | VL + 얼굴 메시 | CV, MPF(`landmark[1]`·`[33]`·`[263]`) | shim으로 거의 그대로 | f035 | p58 (파일명 기준) | 임계값 10px(`threshold`)은 해상도·얼굴 거리에 민감 → `@slider` 후보. 인덱스 1/33/263이 Tasks에서도 같은 위치인지는 추정(앞 468점이 같은 메시 배치로 알려짐, 브라우저 확인 필요) |
| `강의준비.zip ▸ 1.3.2 ▸ 1.3.2. 하품감지_기본과제(p65).py` | cv2, mediapipe(face_mesh) | VL + 얼굴 메시 | CV, MPF(입 6점 13·14·19·18·78·308) | shim으로 거의 그대로 | f036 | p65 (파일명 기준) | 파일명 형식이 다른 차시와 다름(`[고등]` 없음) |
| `강의준비.zip ▸ 1.3.2 ▸ 1.3.2._하품감지_심화과제(p68).py` | cv2, mediapipe(face_mesh), math | VL + 얼굴 메시 | CV, MPF(`static_image_mode`·`min_detection_confidence` → Tasks 옵션명) | shim으로 거의 그대로 | f037 | p68 (파일명 기준), 관련 U1 p112 마무리 9번 | `CONSECUTIVE_FRAMES=5`는 프레임 수 기준 → 10~15fps에서는 PC보다 긴 하품이 필요. 사이트판 설명에 "시간 기준으로 바꿔 보기" 과제. `except IndexError`는 사실상 발생 안 함 |
| `강의준비.zip ▸ 1.3.3 ▸ [고등] 1-3-3_기본 실습 코드(p75).py` | cv2, mediapipe(face_mesh) | VL + 얼굴 메시 | CV, MPF(234·454·10·152) | shim으로 거의 그대로 | f038 | p75 (파일명 기준) | 얼굴을 기울이면 박스가 부정확한 한계는 원본과 같음 |
| `강의준비.zip ▸ 1.3.3 ▸ [고등] 1-3-3_심화 실습 코드(p78).py` | cv2, mediapipe(face_mesh), numpy | VL + 얼굴 메시 + 가상 파일 | CV, MPF, FS(RGBA `mask.png` 미리 두기, 업로드로 교체) | 일부 수정 | f039 | p78 (파일명 기준) | ① `mask.png`가 자료에 없음 → 사이트가 직접 만든 RGBA PNG 제공(SPEC §8). ② 마스크 픽셀×3채널 파이썬 3중 루프(얼굴 200×250px면 프레임당 약 15만 번) → WASM에서 실시간이 어려울 것으로 추정(실측 필요) → 사이트판은 numpy 벡터 합성본을 원본과 나란히. ③ 오른쪽·아래 경계는 검사하지만 왼쪽·위는 검사 안 해 음수 인덱스로 반대편에 그림(사본 대조) |
| `강의준비.zip ▸ 1.4.1 ▸ [고등] 1-4-1_기본 실습 코드(p85).PY` | cv2, mediapipe(pose, drawing_utils) | VL + 포즈 추론 | CV, MPP(`Pose()` 기본 `model_complexity=1`), DRAW(포즈만 visibility 0.5 미만 점 생략) | shim으로 거의 그대로 | f040 | p85 (파일명 기준), 관련 U1 p112 마무리 10번 | 확장자 대문자 `.PY` → `examples/`로 옮길 때 소문자로. 레거시 기본값·`draw_landmarks`의 visibility 0.5 생략 규칙(연구 결과 반영). 전신이 보여야 해 교실 카메라 거리 안내 필요 |
| `강의준비.zip ▸ 1.4.1 ▸ [고등] 1-4-1_심화 실습 코드(p88).py` | cv2, mediapipe(pose, drawing_utils) | VL + 포즈 추론 | CV, MPP(`PoseLandmark.LEFT_WRIST.value`), DRAW(numpy 프레임 제자리 그리기 필수) | 일부 수정 | f041 | p88 (파일명 기준), 관련 U1 p112 마무리 4번 | `left_wrist_y`가 포즈가 잡힌 프레임에서만 대입되는데 `if` 밖에서 비교 → 첫 프레임에 사람이 없으면 NameError(원본 결함). 실행 후 자리로 가는 교실에서 흔함 → 사이트판은 루프 전 `left_wrist_y = 1.0` 한 줄(줄 추가 규칙 PLAN §2.6). 그린 뒤 `flip`하므로 DRAW가 캔버스 덮개 방식이면 결과가 달라짐 |
| `강의준비.zip ▸ 1.4.2 ▸ [고등] 1-4-2_기본 실습 코드(p95).py` | cv2, mediapipe(pose, drawing_utils) | VL + 포즈 추론 | CV, MPP(`PoseLandmark`는 IntEnum, `landmark`는 파이썬 list), DRAW | shim으로 거의 그대로 | f042 | p95 (파일명 기준) | `landmarks[mp_pose.PoseLandmark.LEFT_SHOULDER]`처럼 enum을 인덱스로 씀 → 일반 Enum이면 TypeError. 높이 차가 픽셀 단위 |
| `강의준비.zip ▸ 1.4.2 ▸ [고등] 1-4-2_심화 실습 코드(p99).py` | cv2, mediapipe(pose, drawing_utils), numpy, PIL(ImageFont·ImageDraw·Image) | VL + 포즈 추론 + Pillow 실물 | CV, MPP, DRAW, FONT(`ImageFont.truetype('C:/Windows/Fonts/malgun.ttf', 30)` → 사이트 동봉 OFL 한글 글꼴로 연결 + 콘솔 안내), FS | shim으로 거의 그대로 (**판정 변경**) | f043 | p99 (파일명 기준) | 연구 결과 반영: Pyodide Pillow 12.2.0 레시피가 `USE_FREETYPE=1`로 빌드되어 `truetype`을 쓸 수 있다(브라우저 확인 전). 맑은 고딕은 Microsoft 글꼴이라 동봉하지 않고 Pretendard(OFL-1.1) 등으로 대신한다(Claude 결정). `cv2.putText`로 한글을 못 쓰는 이유를 가르치는 예제라 원형 유지 가치가 크다 |
| `강의준비.zip ▸ 1.4.3 ▸ [고등] 1-4-3_기본 실습 코드(p105).py` | speech_recognition(Recognizer, Microphone, recognize_google) | VL 워커 + 메인 화면 음성 브리지 | SR(`Recognizer()`, `Microphone()` with 문, `listen(source, phrase_time_limit=5)`, `recognize_google(audio, language='ko-KR')`, `UnknownValueError`·`RequestError`), 글자 입력 모드 | shim으로 거의 그대로 (조건부) | f044 | p105 (파일명 기준), 관련 U1 p112 마무리 11번 | 원본 사슬(PyAudio·HTTP 전송)은 Pyodide 불가(소켓 비작동, 확인됨). Web Speech API는 창에서만 쓸 수 있고(명세 `[Exposed=Window]`) Chrome 기본 인식은 음성을 서버로 보냄, Firefox는 플래그 뒤, Safari는 접두어판(연구 결과 반영). 온디바이스(`processLocally`, Chrome 139+) 우선 → 안 되면 전송 고지 후 선택 → 기본 대안은 글자 입력. `listen` 동안 인식을 끝내야 해 `language`를 미리 알 수 없으므로 기본 `ko-KR` |
| `강의준비.zip ▸ 1.4.3 ▸ [고등] 1-4-3_심화 실습 코드(p108).py` | speech_recognition | VL 워커 + 메인 화면 음성 브리지 | SR, RUN(`__main__` 실행, 무한 반복 중 정지) | shim으로 거의 그대로 (조건부) | f045 | p108 (파일명 기준) | 반복마다 인식 세션을 새로 시작(권한 창 반복 여부는 브라우저별 미확인). 키워드 `in` 검사라 "시작해"도 매칭. 조건·개인정보는 f044와 같음 |

### 2.2 2단원 피지컬 컴퓨팅 (f046~f081, 36개)

공통: 모두 ESP32 MicroPython 예제. 실행은 **VB**(가상 보드)와 **RB**(실제 보드) 두 경로이며 같은 파일을 쓴다. 핀은 예제마다 원고 코드의 핀을 그대로 쓰는 "예제별 배선"(INVENTORY §4.4 Claude 결정). 검증 메모: 매핑 당시 CPython 3.11 + 간이 mock 하네스로 끝까지 실행해 본 결과이며 Pyodide 실측은 아니다. **추출 사본(`flat`, 비공개 자료 저장소 `extracted/flat`과 같은 바이트)은 158개 전부 줄 끝이 `\r\r\n`으로 손상돼 있다**(원본 zip 멤버·낱개 파일은 158개 모두 정상 CRLF, 2차 검토에서 `zipfile`로 직접 대조). 파이썬은 `\r\r\n`을 줄바꿈 2개로 읽으므로 사본의 줄 번호는 원본의 약 2배로 밀리고(예: f082의 `sleep(1)` 호출 원본 12·15행 → 사본 23·29행), 백슬래시 줄 이음이 있는 **f051(36행)·f069(30행)·f122(52행)는 사본에서만 SyntaxError**가 난다(f074는 원본 결함). → `examples/`로 옮길 때는 원본 zip 멤버를 `zipfile`로 메모리에서 읽어 CRLF → LF로만 바꾸고, 원본과 줄 수·`ast.parse` 결과를 대조한다(PLAN §3.3·PD-33). 이 문서의 행 번호는 모두 원본 기준이다.

| 원본 파일 | 사용하는 모듈 | 브라우저에서 실행 방법 | 필요한 shim/mock | 그대로 돌아가는가 | id | 교과서 쪽 | 비고 |
|---|---|---|---|---|---|---|---|
| `강의준비.zip ▸ 2.1 디스플레이 ▸ (p123)동작테스트(p123).py` | machine(Pin), time(sleep) | VB: 내장 LED(GPIO2) 깜박임 / RB: raw REPL 실행, [보드에 저장] | VB(`Pin(2, Pin.OUT).on/off`, `time.sleep` 가상 시계) | shim으로 거의 그대로 | f046 | p122~123 (U2A) | 첫 실습 예제로 알맞음. 원고와 같음 |
| `강의준비.zip ▸ 2.1 디스플레이 ▸ (p127)출력테스트_문자(p127).py` | machine(Pin, SoftI2C), i2c_lcd(I2cLcd), time | VB: 16×2 LCD SVG / RB: `i2c_lcd.py` 업로드 확인 후 실행 | VB-I2C(`SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000).writeto` → PCF8574→HD44780 해석, 주소 0x20), LIB(`i2c_lcd.py` = f011) | shim으로 거의 그대로 | f047 | p126~127 (U2A) | 주석 블록 속 함수(`setcursor`·커서·백라이트·`custom_char`)는 실행 안 되지만 f011에 모두 있음. 원고 오류표(OSError ENODEV/EIO, ImportError)를 재현하려면 주소가 틀리거나 배선이 빠졌을 때 같은 예외를 던져야 한다. f144 = f151과 거의 같음 |
| `강의준비.zip ▸ 2.1 디스플레이 ▸ (p127)출력테스트_숫자(p127).py` | machine(Pin, SoftI2C), i2c_lcd, time | VB LCD / RB | VB-I2C, LIB(`i2c_lcd.py`) | shim으로 거의 그대로 | f048 | p126~127 (U2A) | f047의 변형 |
| `강의준비.zip ▸ 2.1 디스플레이 ▸ (p127)출력테스트_키보드(p127).py` | machine(Pin, SoftI2C), i2c_lcd, time, input() | VB LCD + 콘솔 입력 / RB: 실행 중 콘솔 입력을 보드 표준입력으로 | IN(`input()` 줄 입력 동기 대기), VB-I2C, LIB | shim으로 거의 그대로 | f049 | p126~127 (U2A) | 입력은 USB 시리얼 REPL(UART0) 표준입력이다(UART2·터치 아님). 16자를 넘으면 2행으로 넘어감. 한글은 오류 없이 하위 8비트 글자로 찍힘(실물 LCD 문자표 모습은 미확인). RB에서 raw REPL 실행 중 `input()`에 줄을 넘기는 방식은 실기기 확인 필요 |
| `강의준비.zip ▸ 2.1 디스플레이 ▸ (p128)기본1(p128).py` | machine(Pin, SoftI2C), i2c_lcd, time | VB LCD / RB | VB-I2C, LIB(사이트 배포 `i2c_lcd.py`에 `move_to` 별칭 추가) | shim으로 거의 그대로 (**판정 변경**) | f050 | p128~129 (U2A) | 자료의 `i2c_lcd.py`에는 `setcursor`만 있고 `move_to`가 없다(사본 대조) → 원본 그대로면 AttributeError. 연구 결과 반영: 원 저장소(dhylands/python_lcd)의 메서드 이름이 `move_to`이고 자료판이 `setcursor`로 바꾼 것이며, 원고 p127 함수 목록도 `move_to`를 쓴다 → Claude 결정: 사이트 배포본에 `move_to = setcursor` 별칭을 넣어 원고·f050·4단원(`setcursor`) 모두 돌게 한다. 원고 p128의 `freq=4000`은 오타(파일은 400000) **P3-04에서 완료(2026-09-18):** 사이트 배포본 `examples/esp32/lib/third-party/i2c_lcd.py`에 MIT 고지와 `move_to = setcursor` 한 줄을 넣었고, 가상 보드에서 Count 0→5가 보이는 것을 Node·Edge에서 확인했다. |
| `강의준비.zip ▸ 2.1 디스플레이 ▸ (p129)기본2(p129).py` | machine(Pin, SoftI2C, RTC), i2c_lcd, time | VB LCD + 가상 시계 / RB | VB(`RTC().datetime(8-튜플)` 설정·읽기), VB-I2C(`freq` 생략), LIB | shim으로 거의 그대로 | f051 | p128~129 (U2A) | 튜플은 (년, 월, 일, 요일, 시, 분, 초, 0). 매초 `clear()`라 화면 깜박임 가능. 사본 줄 끝 문제는 §2.2 머리말 **P3-04:** 가상 RTC는 실행마다 11:00:00부터 돌고(실물은 전원이 남아 있는 동안 유지 — 부록 B-2 9번), 맞출 때 요일 칸은 쓰이지 않아 읽으면 실제 요일(2025-06-21 → 5)이 나온다. |
| `강의준비.zip ▸ 2.1 디스플레이 ▸ (p130)심화(p130).py` | machine(Pin, SoftI2C), i2c_lcd, time | VB: 가상 터치 버튼 + LCD / RB | VB(`Pin(17, Pin.IN).value()`), 가상 터치 버튼(누르는 동안 1, 최소 유지 시간), VB-I2C, LIB | shim으로 거의 그대로 | f052 | p130~131 (U2A) | 0.05초 폴링 + 0.3초 디바운스 → 아주 짧은 클릭은 실물처럼 놓칠 수 있다 |
| `강의준비.zip ▸ 2.1 디스플레이 ▸ (p130)심화_터치센서동작테스트(p130).py` | machine(Pin), time | VB 터치 + 콘솔 / RB 출력 스트리밍 | VB(`Pin(17, Pin.IN)`), 가상 터치 버튼 | shim으로 거의 그대로 | f053 | p130~131 (U2A) | f052의 동작 테스트 부분 |
| `강의준비.zip ▸ 2.1 디스플레이 ▸ (p135)출력테스트_문자(p135).py` | machine(Pin, SoftI2C), ssd1306(SSD1306_I2C, **자료에 없음**), time | VB: 128×64 OLED 캔버스 / RB: OLED 드라이버 업로드 후 실행 | VB-OLED(`SSD1306_I2C(128, 64, i2c)`·`fill`·`text`·`show`, 8×8 글꼴), LIB(`ssd1306`/`sh1106` 두 이름 모두) | shim으로 거의 그대로 | f054 | p134~135 (U2A) | 원고는 `sh1106.SH1106_I2C`(p135 `SHII06_I2C` 오타), 코드는 `ssd1306` → 두 이름을 같은 mock으로 받는다(INVENTORY §4.4). 연구 결과 반영: 공식 `ssd1306` 드라이버는 micropython-lib에 있고(MIT) ESP32 펌웨어에는 기본 포함되지 않아 RB는 업로드·`mip` 설치가 필요. SH1106 패널에 SSD1306 드라이버가 맞는지는 미확인 **P3-04:** 가상 보드는 `ssd1306`·`sh1106` 두 이름을 같은 흉내로 준다(부품 `parts/oled-i2c/`). 실물용 드라이버 파일 배포는 아직 정하지 않았다(PROGRESS 미해결 64). |
| `강의준비.zip ▸ 2.1 디스플레이 ▸ (p135)출력테스트_숫자(p135).py` | machine, ssd1306(자료에 없음), time | VB OLED / RB | VB-OLED, LIB | shim으로 거의 그대로 | f055 | p134~135 (U2A) | f054와 같은 조건 |
| `강의준비.zip ▸ 2.1 디스플레이 ▸ (p135)출력테스트_키보드(p135).py` | machine, ssd1306(자료에 없음), time, input() | VB OLED + 콘솔 입력 / RB | IN, VB-OLED, LIB | shim으로 거의 그대로 | f056 | p134~135 (U2A) | 이름이 16자(128px÷8)를 넘으면 화면 밖으로 잘림 → 가상 OLED도 잘라야 실물과 같다 |
| `강의준비.zip ▸ 2.1 디스플레이 ▸ (p136)기본(p136).py` | machine, ssd1306(자료에 없음), time | VB OLED(프레임버퍼) / RB | VB-OLED(`pixel(x, y, 1)`은 버퍼에 모았다가 `show()` 때 한 번에) | shim으로 거의 그대로 | f057 | p136~137 (U2A) | 재귀 시에르핀스키 삼각형, `pixel` 729번 호출(좌표 모두 화면 안). `pixel`마다 JS로 넘기지 않아야 빠르다 |
| `강의준비.zip ▸ 2.1 디스플레이 ▸ (p137)심화(p137).py` | machine(ADC, Pin, SoftI2C, PWM), ssd1306(자료에 없음), time | VB: 4채널 아날로그 터치 + OLED + RGB LED 밝기 / RB | VB-ADC(`ADC(Pin(32))`·`atten(ATTN_11DB)`·`width(WIDTH_12BIT)`·`read()` 0~4095), VB-PWM(`PWM(Pin, freq=1000).duty`), VB-OLED, LIB | shim으로 거의 그대로 | f058 | p136~139 (U2A) | 판정 구간(1000~1200 등)이 원고 p139 측정값(688/1535/2381/3263)과 맞지 않아 버튼 3개를 못 알아봄(하네스 확인) → 사이트판은 구간을 f066 기준으로 고침(INVENTORY §4.4). R 핀 GPIO12·G 핀 GPIO5는 ESP32 부트 스트래핑 핀(연구 결과 반영: Espressif 문서 "GPIO0, 2, 5, 12, 15") → 실물 부팅 영향 가능, 교사용 접기에 적는다. `ADC.width()`는 호환용으로 남아 있음(확인됨) **P3-03에서 사이트판 만듦:** `examples/esp32/u2/2-1-3-adv-touch4-oled-rgb-site.py`(판정 구간을 원고 152쪽 값으로, 줄 번호는 원본과 같음). |
| `강의준비.zip ▸ 2.1 디스플레이 ▸ (p137)심화_4채널 터치센서 동작 테스트(p137).py` | machine(ADC, Pin), time | VB 4채널 터치 + 콘솔 / RB | VB-ADC | shim으로 거의 그대로 | f059 | p136~137 (U2A) | 구간이 서로 겹쳐 2381→Button 2, 3263→Button 3으로 잘못 판정(하네스 확인) → 사이트판 수정(INVENTORY §4.4). 원고 p137 구간과도 다름 **P3-03에서 사이트판 만듦:** `examples/esp32/u2/2-1-3-adv-touch4-check-site.py`. |
| `강의준비.zip ▸ 2.1 디스플레이 ▸ (p143)기본_RGB LED(p143).py` | machine(Pin, PWM), time | VB: RGB LED 밝기 / RB | VB-PWM(`PWM(Pin(n)).duty(0~1023)` → 투명도), VB 가상 시계(짧은 대기 몰아 처리) | shim으로 거의 그대로 | f060 | p144~145 (U2A, 파일명 p143) | 한 주기에 `sleep(0.001)` 2048번 → 대기마다 양보하면 브라우저 타이머 최소 지연 때문에 실물(약 2초 주기)보다 크게 느려짐 → 1ms 미만·짧은 대기는 가상 시계에 쌓았다가 몰아서 양보(§3.8) |
| `강의준비.zip ▸ 2.1 디스플레이 ▸ (p143)출력테스트_RGB LED(p143).py` | machine(Pin), time | VB RGB LED / RB | VB(`Pin.on/off`) | shim으로 거의 그대로 | f061 | p142~143 (U2A) | 원고와 같음. f014(핀 25/26/27)·f143(12/5/4)과 구조 같음(핀 27/32/33) |
| `강의준비.zip ▸ 2.1 디스플레이 ▸ (p146)기본_레이저(p146).py` | machine(Pin), time | VB 레이저 빛줄기 + RGB LED / RB | VB(`Pin.value()` 포함) | 일부 수정 | f062 | p146~147 (U2A) | `set_color(r_on, b_on)` 정의에 인자 3개로 호출 → 첫 반복에서 TypeError(원본 결함). 원고 p147은 `g = Pin(32)`와 인자 3개로 정상 → 사이트판은 원고대로 고친다(`g` 줄을 새로 넣어야 하므로 줄 추가 규칙 PLAN §2.6을 따름). 레이저 GPIO21은 LCD·OLED 예제의 SDA와 같은 핀(한 화면에 함께 올리지 않음) **P3-03에서 사이트판 만듦:** `examples/esp32/u2/2-1-4-laser-rgb-site.py`(원고 147쪽처럼 `g` 핀 줄과 값 3개 — 줄 번호가 원고와 같다). |
| `강의준비.zip ▸ 2.1 디스플레이 ▸ (p146)출력테스트_레이저(p146).py` | machine(Pin), time | VB 레이저 / RB | VB | shim으로 거의 그대로 | f063 | p144~145 (U2A, 파일명 p146) | f062의 앞부분. 레이저 실습에는 눈 보호 안내 |
| `강의준비.zip ▸ 2.2 출력 ▸ (p149)출력테스트(p149).py` | machine(Pin), neopixel(NeoPixel), time | VB: 네오픽셀 16구 링 / RB(펌웨어 내장 모듈) | VB-NEO(`NeoPixel(Pin(23), 16)`, `np[i] = (r, g, b)`는 버퍼만, `write()` 때 화면 반영) | shim으로 거의 그대로 | f064 | p148~149 (U2A) | 첫 `for`에 `np.write()`가 없어 실물에서 순차 점등이 안 보이고 둘째 루프 첫 `write`에서 15개가 한꺼번에 켜짐(원고 p149도 같음) → 가상 링도 `write()` 때만 갱신해야 실물과 같다. 사이트판에서 `write()` 추가(줄 추가 규칙 PLAN §2.6). 연구 결과 반영: ESP32 펌웨어 매니페스트에 `neopixel`이 들어 있음(v1.29.0 실기기 import는 확인 전). zip 폴더는 '출력 장치'지만 원고는 '디스플레이 장치 제어 5' |
| `강의준비.zip ▸ 2.2 출력 ▸ (p150)기본(p150).py` | machine(Pin), neopixel, time | VB 네오픽셀 / RB | VB-NEO | shim으로 거의 그대로 | f065 | p150~151 (U2A) | 무지개 7색 순방향·역방향. 원고와 같음 |
| `강의준비.zip ▸ 2.2 출력 ▸ (p151)심화(p151).py` | machine(Pin, ADC), neopixel, time | VB 4채널 터치 + 네오픽셀 / RB | VB-ADC, VB-NEO | shim으로 거의 그대로 | f066 | p150~153 (U2A) | 판정 구간 500~800/1000~1700/2000~2500/3000~3500이 원고 p139 측정값을 모두 맞힌다(하네스 확인) → 4채널 터치 사이트판의 기준 구간(INVENTORY §4.4) |
| `강의준비.zip ▸ 2.2 출력 ▸ (p157)출력테스트_버저(p157).py` | machine(Pin), time | VB: 버저(Web Audio) / RB | VB-PWM의 디지털 버저 모드(HIGH 동안 고정음), 오디오는 사용자 클릭 뒤 시작 | shim으로 거의 그대로 | f067 | p156~157 (U2B) | 원고 사진은 '수동 버저'라 DC HIGH만으로 연속음이 나는지 실물 미확인 → 가상 소리와 다를 수 있다. 연구 결과 반영: Chrome은 사용자 조작 전 만든 AudioContext를 멈춤 상태로 둔다 → [실행] 클릭 때 `resume()`. GPIO15는 스트래핑 핀 |
| `강의준비.zip ▸ 2.2 출력 ▸ (p158)기본(p158).py` | machine(Pin, PWM), time | VB 버저 음계 / RB | VB-PWM(`freq(hz)`·`duty(512)`·`deinit()` → OscillatorNode `square`) | shim으로 거의 그대로 | f068 | p158~159 (U2B) | 한글 딕셔너리 키('도', '도(높은)') → 전송·저장 모두 UTF-8. `duty(512)`는 음량이 아니라 파형 비율(50%)인데 원고는 '음 크기'로 설명 → 교사용 정정 후보 |
| `강의준비.zip ▸ 2.2 출력 ▸ (p159)심화(p159).py` | machine(Pin), time | VB 터치 + 버저 / RB | VB, 가상 터치 버튼, VB-PWM 디지털 버저 | shim으로 거의 그대로 | f069 | p158~159 (U2B) | 누르는 순간(0→1)만 0.5초 울림. GPIO17은 MP3 예제의 UART2 TX와 같은 핀(차시가 다름). 사본 줄 끝 문제는 §2.2 머리말 |
| `강의준비.zip ▸ 2.2 출력 ▸ (p161)출력테스트_MP3(p161).py` | machine(UART, Pin), time | VB: 가상 MP3 모듈 + 자체 제작 음원 / RB(DFPlayer·microSD 실물) | VB-UART(`UART(2, baudrate=9600, tx=Pin(17), rx=Pin(16))`, `write(bytearray)`), VB-DFP(0x7E…0xEF 프레임 해석, 8·10바이트 모두 허용) | shim으로 거의 그대로 | f070 | p162~163 (U2B, 파일명 p161) | `bytearray(10)`에 8바이트만 채워 `7E FF 06 03 00 00 01 EF 00 00` 10바이트가 나간다(하네스 확인). 연구 결과 반영: DFRobot 데이터시트 V1.0 프레임은 체크섬 2바이트를 넣은 10바이트이고 정지 명령 0x16은 명령표에 없다(공식 Arduino 라이브러리는 0x16 사용). 체크섬 없는 프레임을 실물이 받는지는 미확인 → 가상 장치는 관대하게 받되 "실물 확인 필요" 표시. 음원 001~003.mp3는 직접 제작 또는 CC0 |
| `강의준비.zip ▸ 2.2 출력 ▸ (p163)기본(p163).py` | machine(UART, Pin), time | VB MP3 / RB | VB-UART, VB-DFP(0x06 볼륨 → GainNode, 0x03 재생) | shim으로 거의 그대로 | f071 | p162~163 (U2B) | 10초마다 볼륨 10·001.mp3 재생. 음원이 9초보다 길면 다음 명령에 끊김 → 가상 음원 길이 결정 때 참고 |
| `강의준비.zip ▸ 2.2 출력 ▸ (p164)심화(p164).py` | machine(ADC, Pin, UART), time | VB 4채널 터치 + MP3 / RB | VB-ADC, VB-UART, VB-DFP(트랙 1~3), RUN(콘솔 줄 수 제한) | shim으로 거의 그대로 | f072 | p164~165 (U2B) | 첫 누름에 곡 번호가 2로 올라 2번 곡부터 재생(코드상). 0.1초마다 ADC 값을 `print` → 콘솔 출력 제한 필요 |
| `강의준비.zip ▸ 2.2 출력 ▸ (p168)팬모터 정회전 역회전 정지(p168).py` | machine(Pin), time | VB: 팬 회전 애니메이션 / RB | VB(INA/INB 논리표: (1,0) 정회전, (0,1) 역회전, (0,0) 정지) | shim으로 거의 그대로 | f073 | p168 (U2C) | 줄마다 한국어 주석. 동작은 f074와 같음 |
| `강의준비.zip ▸ 2.2 출력 ▸ (p169)라이브러리 활용하여 팬 모터 제어하기(p169).py` | gorillacell_dcmotors(GORILLACELL_DCMOTORS), time | VB 팬 / RB(라이브러리 업로드) | LIB(`gorillacell_dcmotors` PWM판, `rotate('cw')` 기본 속도), VB-PWM | 일부 수정 | f074 | p169 (U2C) | 파일의 모든 줄 앞에 원고 줄 번호('1  from …', '10 time.sleep(2)')가 글자로 들어 있어 1행 SyntaxError → 사이트판은 줄 번호 제거. 제거하면 f004(디지털판)·PWM판 모두로 돈다(하네스 확인). 원고 p169의 `GORILLACELL_DEMOTORS`·저장 파일명 `gorillacell_dcmotor.py`(s 빠짐)는 교사용 정정 |
| `강의준비.zip ▸ 2.2 출력 ▸ (p170)회전 속도 제어하기(p170).py` | gorillacell_dcmotors(`rotate` speed 인자), time | VB 팬 속도 / RB | LIB(PWM판: `GORILLACELL_DCMOTORS(pin1, pin2, freq=1000)`, `rotate(direction, speed=100)`, `stop()`), VB-PWM(duty → 회전 속도) | shim으로 거의 그대로 | f075 | p170 (U2C) | 자료의 f004(디지털판)로는 `speed=` 인자에서 TypeError → 사이트가 원고 p169 스크린숏판을 복원해 제공(원고는 운영자 자료, O2). 연구 결과 반영: 같은 계열 공개 글(TechToTinker 034, 2021-05-08)에 PWM판이 있으나 500Hz·speed 0~99를 duty로 환산하는 다른 판이라, `speed=100`(f076)에서 duty가 1023을 넘는다(계산값 1033) → 원고판(speed 0~100으로 자르고 1000Hz) 기준으로 복원(Claude 결정). 스크린숏에서 잘린 'ccw' 분기·`stop()`은 같은 규칙으로 채움 |
| `강의준비.zip ▸ 2.2 출력 ▸ (p171)키보드 활용하기(p171).py` | machine(Pin, import만), time(import만), gorillacell_dcmotors, input() | VB 팬 + 콘솔 입력 / RB | IN, LIB(PWM판), VB-PWM | shim으로 거의 그대로 | f076 | p170~171 (U2C) | 입력은 REPL 표준입력의 `input()`. 'q'로 `break`하면 프로그램이 끝남 → 가상 보드는 [정지] 없이도 종료 처리. 원고 p171의 `else: cmd == …` 문법 오류는 파일에서는 고쳐져 있음 |
| `강의준비.zip ▸ 2.2 출력 ▸ (p172)키보로 회전 속도 조절하기(p172).py` | machine(import만), time(import만), gorillacell_dcmotors(speed 위치 인자), input() | VB 팬 + 콘솔 입력 / RB | IN, LIB(PWM판 `rotate('cw', 40)`), VB-PWM | shim으로 거의 그대로 | f077 | p172 (U2C) | 종료 명령이 없어 [정지](Ctrl-C) 필요. 출력 문구 '선책하세요'·파일명 '키보로' 오타 |
| `강의준비.zip ▸ 2.2 출력 ▸ (p175)서보모터 제어하기(p175).py` | machine(Pin, import만), time, servo_library(ServoMotor, **자료에 없음**) | VB: 서보 각도 SVG / RB(라이브러리 업로드) | LIB(`servo_library.py`: 원고 p174 스크린숏 20행 복원, `rotate` 안에 `sleep(0.5)`), VB-PWM(50Hz duty → 각도) | shim으로 거의 그대로 | f078 | p174~175 (U2C) | 자료에 파일이 없어 그대로면 ModuleNotFoundError → 사이트가 원고 스크린숏대로 제공(O2). duty 40/77/115(하네스). `rotate` 안의 0.5초 때문에 실제 간격은 1.5초. 가상 서보의 duty→각도 환산은 이 판(40~115)과 `mg90s_servo`(23~124)가 달라 PLAN에서 정한다 |
| `강의준비.zip ▸ 2.2 출력 ▸ (p176)서보모터 제어하기(p176).py` | machine(import만), time, servo_library(자료에 없음) | VB 서보 / RB | LIB(`servo_library`), VB-PWM, VB 가상 시계 | shim으로 거의 그대로 | f079 | p176 (U2C) | 라이브러리 `rotate` 안의 `sleep(0.5)` 때문에 한 걸음 약 0.51초, 편도 181걸음 약 92초(하네스 호출 순서). 원고 설명("0.1초 간격 1도씩")과 크게 다름 → 가상 보드도 느린 동작을 그대로 보여 주고 교사용 접기에 적는다 |
| `강의준비.zip ▸ 2.2 출력 ▸ (p177)서보모터 2개 사용하기(p177).py` | machine(import만), time, servo_library(자료에 없음) | VB 서보 2개 / RB | LIB, VB-PWM | shim으로 거의 그대로 | f080 | p176~177 (U2C) | `rotate`마다 0.5초 대기라 서보 2가 서보 1보다 0.5초 늦게 움직임(원고의 "동시에"와 다름). GPIO25/26은 팬 예제의 INA/INB와 같은 핀 |
| `강의준비.zip ▸ 2.2 출력 ▸ (p178)키보드로 서보모터 제어하기(p178).py` | machine(import만), time(import만), servo_library(자료에 없음), input() | VB 서보 + 콘솔 입력 / RB | IN, LIB, VB-PWM | shim으로 거의 그대로 | f081 | p178~179 (U2C) | 90°에서 시작해 '1'→180°, '2'→0°. 종료 명령 없음 |

### 2.3 3단원 인공지능과 피지컬 컴퓨팅 — 통신 (f082~f091, 10개)

공통: PC 쪽(Vision Lab)과 ESP32 쪽(가상/실제 보드)이 짝을 이룬다. 짝 연결은 §6의 데이터 형식을 따른다. UART 실습의 실물 구성은 보드 USB(REPL)와 별도 USB-UART 변환기(UART2) **USB 두 개**다.

| 원본 파일 | 사용하는 모듈 | 브라우저에서 실행 방법 | 필요한 shim/mock | 그대로 돌아가는가 | id | 교과서 쪽 | 비고 |
|---|---|---|---|---|---|---|---|
| `강의준비.zip ▸ 3.1.2 ▸ 4. UART 시리얼 통신 코드 작성 및 저장(p190).py` | machine(Pin, UART), time | VB: 레이저 SVG + 가상 UART 선(짝: f084·f085의 SER, 또는 [a][b] 버튼) / RB: 보드 REPL 포트로 실행·저장, 데이터는 변환기 포트 | VB-UART(`UART(2, baudrate=115200, tx=16, rx=17)`, `any()`, `readline()` → bytes 또는 None), VB(`Pin(18, Pin.OUT)`), 폴링 루프 양보 | 일부 수정 | f082 | p190 (U3) | `import time` 뒤 이름만 `sleep(1)` 호출 → 'a'나 'b'를 처음 받는 순간 NameError(원본 결함, 실물도 같음). 원고 p190은 `from time import sleep`이라 정상 → 사이트판 1줄 수정. TX/RX 방향은 INVENTORY §4.4 결정(사이트판 `tx=17, rx=16`). PC가 줄바꿈 없이 1바이트를 보내므로 `readline()`의 타임아웃 반환에 기댄다(연구 결과 반영: MicroPython 문서 "타임아웃이면 더 일찍 반환할 수 있다", 기본 8N1). 두 글자가 한꺼번에 오면 'ab'가 되어 무시됨 |
| `강의준비.zip ▸ 3.1.2 ▸ 5.마이크로파이썬 devide boot.py로 파일저장(p191).py` | machine(Pin, UART), time | f082와 같음 + RB [보드에 저장]에서 `boot.py` 이름 선택, VB는 [가상 전원 재시작]으로 자동 실행 흉내 | f082와 같음, RB(파일 저장, 부팅 무한 루프를 끊는 Ctrl-C 반복) | 일부 수정 | f083 | p191 (U3) | `Pin(18, PinOUT)` 오타 → 실행하자마자 NameError, `sleep` 문제는 f082와 같음(원고 p191도 `import time`) → 사이트판 2곳 수정. `boot.py` 안 무한 루프는 REPL 진입을 막아 raw REPL 연결 루틴이 Ctrl-C를 여러 번 보내야 한다. 사이트 기본 저장 이름은 `main.py`(INVENTORY §4.4) = f082와 거의 동일 |
| `강의준비.zip ▸ 3.1.2 ▸ 기본실습 Local Python 실행하기(p192).py` | serial(pyserial), time, input() | VL 워커 + 대상 선택([실제 보드 변환기 포트] / [가상 보드 UART2] / [MQTT]) | SER(`Serial('COM10', 115200)`은 포트 문자열을 무시하고 미리 허락받은 포트를 `open({baudRate:115200})`, `write(bytes)`, `close()`), IN(`input()`) | shim으로 거의 그대로 | f084 | p192 (U3) | 전송은 `key.encode('utf-8')` 한 글자, 줄바꿈 없음(원고 p187은 `\n` 필수라고 설명 → §6). `time.sleep(2)`는 포트 안정화 대기라 그대로 둬도 됨. 연구 결과 반영: `requestPort()`는 사용자 조작이 필요하므로 실행 전 메인 화면 [포트 연결] 버튼으로 받고, 워커는 `getPorts()`로 쓴다(`getPorts`는 전용 워커에서 사용 가능, MDN) |
| `강의준비.zip ▸ 3.1.2 ▸ 심화실습 Face Detection 사용하기(p193).py` | cv2, mediapipe(face_detection), serial, time | VL + 얼굴 검출 + SER | CV, MPD(`FaceDetection(min_detection_confidence=0.5)`, 얼굴 없으면 `detections = None`, `location_data.relative_bounding_box.xmin/ymin/width/height`는 Tasks의 픽셀 상자를 프레임 크기로 나눈 값), SER | shim으로 거의 그대로 | f085 | p193~194 (U3) | 상태가 바뀔 때만 `b'a'`(검출)·`b'b'`(사라짐) 전송. `detected = results.detections is not None`이라 shim이 빈 리스트가 아니라 None을 줘야 원본과 같다. 마지막 줄 `ser.close()`(변수는 `uart`) → 'q'로 끝낼 때만 NameError(판정 기준상 비고 처리, 사이트판 수정). 연구 결과 반영: 레거시 기본 `model_selection=0`(2m 이내 근거리 모델), Tasks 기본 모델도 BlazeFace short-range → 같은 계열이지만 결과 동일성은 미확인 |
| `강의준비.zip ▸ 3.1.3 ▸ 5. ESP32boot.py 실행코드 만들기(p196).py` | ESP32BLE(사용자 모듈), machine(Pin), time(sleep) | VB: RGB LED + 가상 BLE 주변기기(짝: f089의 BTPC) / RB: `ESP32BLE.py`와 함께 업로드, PC 역할은 Web Bluetooth | LIB(`ESP32BLE.py` 원본 = f087: `init('ESP32')`, `read()`는 최신 문자열 1개 또는 None), VB-BLE 저수준 mock(쓰기 → IRQ 3 주입), VB(`Pin(25/26/27, Pin.OUT)`) | shim으로 거의 그대로 | f086 | p196~197 (U3) | 'x,y'를 `split(',')`·`int()` → x<100 빨강, y<100 초록, 그 밖 파랑을 1초 켰다 끔(약 2초에 1개 처리, 중간값은 버려짐). 주석 핀(27/32/33)은 f157의 흔적 → 사이트판은 주석을 코드(25/26/27)에 맞춤(INVENTORY §4.4). 원고 p196 인쇄본 오타(`Pin(25, Pin, OUT)` 등)는 그대로 치면 안 돎. f157과 거의 같음 |
| `강의준비.zip ▸ 3.1.3 ▸ ESP32BLE.py` | ubluetooth, machine(Pin, Timer), time(sleep_ms, import만), micropython(const) | VB: 저수준 `ubluetooth` mock 위에서 **원본 그대로** 실행(상태 LED 깜박임까지) / RB: 원본 업로드 | VB-BLE 저수준(`BLE()`, `active`, `irq`, `gatts_register_services`→`((tx, rx),)`, `gatts_read`, `gatts_notify(0, tx, str)`, `config('mac')`, `gap_advertise(100, adv_data)`, `UUID`, `FLAG_WRITE`·`FLAG_NOTIFY`), VB(`Timer(0).init(period=100, mode=Timer.PERIODIC, callback)`·`deinit`), `micropython.const` | shim으로 거의 그대로 | f087 | 코드 본문 없음. p196 용어 설명, p197 실행 결과(주소 출력), BT p73~75 | 사본 대조: 광고 이름을 `bytes(self.name, 'utf-8')`로 바꾼 뒤 결합하므로 CPython(Pyodide)에서도 그대로 돈다 → 가상 보드는 원본 실행(Claude 결정, §3.9). 수신은 IRQ 3에서 `self.message`에 **덮어쓰기**(큐 없음). `send()`는 연결 핸들 0 고정·끝에 `\n`. 연구 결과 반영: 특성 값 기본 최대 20바이트, `gap_advertise` 간격은 마이크로초 단위를 625µs로 내림(100은 규칙상 0이 되는데 실물 동작은 원고 화면으로만 확인), u-접두 `ubluetooth`는 아직 지원되지만 앞으로 제거 예고. 상태 LED GPIO12는 스트래핑 핀. = f101 = f146 = f153 |
| `강의준비.zip ▸ 3.1.3 ▸ bluetooth.py` | bleak(BleakClient), asyncio, threading, time(import만) | 사이트 안에서는 실행하지 않음 → 같은 이름의 BTPC 대체 모듈. 원본은 "진짜 PC에서 돌리기" 내려받기 | BTPC(`init(address)`, `send(str)`, `connected`, `disconnect()`, 알림 → 콘솔) | 브라우저 불가(다운로드 제공) | f088 | 코드 본문 없음. p198 용어 설명·bleak 설치 캡처, BT p71 | 연구 결과 반영: Pyodide는 스레드를 지원하지 않고(공식 문서 "does not support threading"), bleak 지원 OS는 Windows·Linux(BlueZ)·macOS·Android뿐이다. 원본 동작: 생성자에서 연결까지 블로킹(60초), 실패하면 `loop.stop()` 뒤 `init()`이 끝나지 않는다(가짜 bleak 실측, 4단원 매핑 결과). 스레드가 데몬이 아니라 `disconnect()`를 안 부르면 프로그램이 안 끝날 수 있다. 원고 p198 캡처는 MicroPython 장치용 패키지 관리자 화면이라 다운로드 안내에서 Local Python 설치로 바로잡는다. = f102 = f107 = f116 = f139 = f142 |
| `강의준비.zip ▸ 3.1.3 ▸ 기본실습 영상처리로 인한 손끝 좌표를 블루투스로 ESP32에보내기(p198).py` | cv2, mediapipe(hands, drawing_utils), bluetooth(사용자 모듈) | VL + 손 추론 + BTPC(실제 보드는 Web Bluetooth, 없으면 같은 페이지 가상 보드 f086) — AI→피지컬 브릿지 기본 예제 | CV(`cap.set(CAP_PROP_FRAME_WIDTH, 1080)` → 카메라 제약, `cap.get` → 실제 트랙 크기, `waitKey(1) == 27`), MPH(`Hands(max_num_hands=1)`), DRAW(`DrawingSpec`, 4번째=점 스타일·5번째=선 스타일 위치 규칙), BTPC | shim으로 거의 그대로 | f089 | p198~200 (U3) | 코드는 그대로 돌지만 MAC 주소 인자는 브라우저에서 쓸 수 없어 [BLE 연결] 선택 창으로 대체한다고 화면에 안내. 전송 `f"{x},{y}"` 줄바꿈 없음, 손이 보이면 **매 프레임** 전송(원고 p187의 "변할 때만·초당 10회" 권장 미적용 → §6). 좌표가 실제 프레임 크기 기준이라 수신 쪽 임계값 100의 의미가 해상도에 따라 바뀜. `flip`이 `ret` 검사보다 앞 → shim은 늘 유효 프레임을 준다. 연구 결과 반영: `draw_landmarks(image, landmark_list, connections, landmark_drawing_spec, connection_drawing_spec)` 순서 확인. 원고 인쇄본 오타 다수. f158과 거의 같음 |
| `강의준비.zip ▸ 3.1.4 ▸ 기본실습_손동작으로 스크린숏촬영하기(p203).py` | cv2, mediapipe(hands, drawing_utils), pyautogui | VL + 손 추론 + 가상 데스크톱 | CV(`isOpened`, `waitKey(5)`), MPH(`Hands(max_num_hands=1, min_detection_confidence=0.7)`, `HandLandmark.THUMB_TIP`·`INDEX_FINGER_TIP`), DRAW(기본 스타일), PAG(`screenshot('screenshot.png')` → 가상 데스크톱 캡처를 PIL 이미지로, 가상 파일 저장·썸네일·내려받기) | shim으로 거의 그대로 | f090 | p203~204 (U3), 원리 p201~202 | 실제 PC 화면이 아니라 가상 데스크톱을 찍는다(결과 의미가 다름을 안내). 조건이 참인 동안 매 프레임 같은 파일을 덮어써 저장 → mock은 저장 빈도를 제한하고 표시. 원고 p204의 "5초 대기"는 `waitKey(5)`(5밀리초)의 오기 |
| `강의준비.zip ▸ 3.1.4 ▸ 심화실습_손가락으로 마우스 커서조종하는 프로그램 만들기(p205).py` | cv2, mediapipe(hands, drawing_utils), pyautogui | VL + 손 추론 + 가상 데스크톱(가상 버튼·그림판·미니게임) | CV, MPH, DRAW, PAG(`size()` → 가상 모니터 논리 해상도, `moveTo(x, y)`) | shim으로 거의 그대로 | f091 | p205~206 (U3), 활동 p207 | 카메라 전체를 화면 전체에 1:1로 대응시켜 가장자리에 닿기 어렵고 떨림 보정 없음(원본 체감 유지 위해 기본 보정 끔). 연구 결과 반영: PyAutoGUI 기본 `FAILSAFE = True`, 기준점 `(0, 0)`, 예외 `FailSafeException`, 호출마다 기본 `PAUSE = 0.1`초 → 이 파일은 설정을 바꾸지 않으므로 mock도 두 기본값을 흉내 낸다(Claude 결정, §3.4) |

### 2.4 4단원 지능화 사물 개발 프로젝트 (f092~f117, 26개)

공통: 4단원 원고는 자료에 없어 교과서 쪽은 **파일명 기준**이다(대조 못 함). 4.1.2_01 파일은 없고, 4.2.3 파일 두 개는 4.2.2 폴더 안에 있다. 폴더명의 이모지(🖱, 😉, 🚀)는 `examples/`로 옮길 때 뺀다(INVENTORY §7.7). 코드에 박힌 BLE 주소는 자리표시자로 바꾼다.

| 원본 파일 | 사용하는 모듈 | 브라우저에서 실행 방법 | 필요한 shim/mock | 그대로 돌아가는가 | id | 교과서 쪽 | 비고 |
|---|---|---|---|---|---|---|---|
| `강의준비.zip ▸ 4.1.1 ▸ 4.1.1_01_동작테스트(p216).py` | cv2 | VL | CV(키가 없을 때 `waitKey`는 -1 → `& 0xFF`가 255) | shim으로 거의 그대로 | f092 | p216 (파일명 기준) | 웹캠 동작 테스트. f027·f028·f128과 목적 같고 코드는 다름 |
| `강의준비.zip ▸ 4.1.1 ▸ 4.1.1_02_기본_그물망표시(p217).py` | cv2, mediapipe(face_mesh, drawing_utils) | VL + 얼굴 메시 | CV, MPF(`with FaceMesh(max_num_faces=1, refine_landmarks=True, min_detection_confidence=0.5, min_tracking_confidence=0.5) as face_mesh:` → 컨텍스트 매니저 필수), DRAW(`FACEMESH_TESSELATION` 연결표, `landmark_drawing_spec=None`이면 점 생략) | shim으로 거의 그대로 | f093 | p217 (파일명 기준) | `frame.flags.writeable`은 numpy 기능이라 그대로. BGR→RGB→BGR 왕복 뒤 그리므로 캔버스 덮개가 아니라 numpy 프레임에 직접 그려야 원본과 같음. 연결표는 MediaPipe(Apache-2.0) 데이터라 shim에 고지 포함(§5.3). f119와 개념 같음 |
| `강의준비.zip ▸ 4.1.1 ▸ 4.1.1_03_심화_눈코 특징점찍기(p219).py` | cv2, mediapipe(face_mesh) | VL + 얼굴 메시 | CV, MPF(`refine_landmarks=True` → 478점, 인덱스 6·468·473) | shim으로 거의 그대로 | f094 | p219 (파일명 기준) | 468·473은 `refine_landmarks=True`일 때만 있는 홍채 점 → shim은 False면 468점만 줘서 IndexError도 원본과 같게. `process()`에 좌우 반전된 배열을 넘기므로 shim은 **넘겨받은 픽셀로** 추론해야 한다(비디오 원본으로 추론하면 좌표가 거울 반대). 6번을 주석은 '인중', f095는 '코'라 부름(다른 자료는 1번이 코) → 공식 랜드마크 지도 확인 필요(미확인) |
| `강의준비.zip ▸ 4.1.2 ▸ 4.1.2_02_심화_코좌표 마우스 추적_주석처리 버전(p226).py` | cv2, mediapipe(face_mesh), pyautogui | VL + 얼굴 메시 + 가상 데스크톱 | CV(`waitKey(5)`로 r·q), MPF, PAG(`FAILSAFE`·`PAUSE` 속성, `size()`, `moveTo(int, int)`), `cv2.drawMarker(MARKER_CROSS)`·`putText` 실물 | shim으로 거의 그대로 | f095 | p226 (파일명 기준) | 첫 30프레임 평균을 기준점으로 삼음(주석 "1초 정도" = 약 30fps 가정) → 10~15fps에서는 2~3초. 이동 범위 60·30이 카메라 픽셀 단위라 브라우저 카메라 해상도에 따라 감도가 달라짐 → shim 기본 프레임 크기를 정해 둔다. 원본을 실제 PC에서 돌리면 `FAILSAFE=False`라 커서를 멈추기 어려움 → 내려받기판에 "OpenCV 창을 클릭한 뒤 q" 안내 |
| `강의준비.zip ▸ 4.1.3 ▸ 4.1.3_01_기본_눈깜박임 표시하기_V2(p234).py` | cv2, mediapipe(face_mesh), pyautogui, numpy(import만) | VL + 얼굴 메시 + 가상 데스크톱 | CV, MPF(6·468·473, 왼눈 33·160·158·133·153·144, 오른눈 362·385·387·263·373·380), PAG | shim으로 거의 그대로 | f096 | p234 (파일명 기준) | 부드러운 이동(0.7/0.3) + EAR(임계값 0.1) 표시만, 클릭 없음. EAR 값은 랜드마크 정밀도에 좌우 → Tasks 모델에서 같은 임계값으로 같게 반응하는지 실측 필요. `EAR_THRESHOLD`는 `@slider` 후보 |
| `강의준비.zip ▸ 4.1.3 ▸ 4.1.3_02_심화_마우스 클릭제어(p240).py` | cv2, mediapipe(face_mesh), pyautogui, numpy, time | VL + 얼굴 메시 + 가상 데스크톱(더블클릭 → 아이콘 열기, 우클릭 → 메뉴) | CV, MPF, PAG(`click(button='right')`, `doubleClick()`) | shim으로 거의 그대로 | f097 | p240 (파일명 기준) | "이전 프레임 열림 → 현재 감김" 한 프레임 변화로 판정 → 낮은 fps에서 짧은 깜박임을 놓칠 수 있다. 자연스러운 양쪽 깜박임도 우클릭이 됨(1초 간격 제한만). 실제 PC 원본은 의도치 않은 클릭 주의 안내 |
| `강의준비.zip ▸ 4.1.4 ▸ 4.1.4_01_MAC_address_test(p251).py` | ESP32BLE(사용자 모듈), machine(import만), time(import만) | VB: 가상 주소 출력 + 상태 LED 깜박임(스크립트 끝난 뒤에도 유지) / RB: `ESP32BLE.py` 업로드 후 실행 | LIB(`ESP32BLE.py` 원본), VB-BLE 저수준(`config('mac')` → 가상 주소), VB(`Timer` 콜백·BLE 상태를 스크립트 종료 뒤에도 유지) | shim으로 거의 그대로 | f098 | p251 (파일명 기준) | 이 차시의 주소 확인은 PC용 bleak가 주소로 접속하기 때문. Web Bluetooth는 주소를 쓰지 않고 선택 창으로 고르므로 브라우저판 차시 목표는 "광고 이름 확인"으로 바꿔 설명(Claude 결정). 교실 보드가 모두 'ESP32'로 광고하면 선택 창에서 구분이 안 됨 → 보드별 이름 규칙(§4) |
| `강의준비.zip ▸ 4.1.4 ▸ 4.1.4_02_기본_ESP32_ble_Rx_test(p252).py` | ESP32BLE, machine(Pin, SoftI2C), time, i2c_lcd | VB: 가상 BLE 수신 + LCD / RB | LIB(`ESP32BLE.py`, `i2c_lcd.py`), VB-BLE, VB-I2C, 가상 송신 패널(x·y 슬라이더) | shim으로 거의 그대로 | f099 | p252 (파일명 기준) | 형식 검사 `len(parts)==3 and parts[0]=='DATA'`, 예외는 맨 `except`로 무시. 10ms마다 `read()`, 수신 버퍼 한 칸이라 LCD 갱신 중 온 메시지는 덮어써짐 |
| `강의준비.zip ▸ 4.1.4 ▸ 4.1.4_03_심화_영상처리_ble_Tx_test(p254).py` | cv2, mediapipe(face_mesh), time, bluetooth(사용자 모듈) | VL + 얼굴 메시 + BTPC(Web Bluetooth 또는 같은 페이지 가상 보드 f099) | CV, MPF(`FaceMesh(max_num_faces=1)` → 468점), BTPC(`from bluetooth import init as bluetooth_init`, `.connected`, `.send`) | shim으로 거의 그대로 | f100 | p254 (파일명 기준) | 코 좌표(카메라 프레임 픽셀, 반전 뒤)를 0.5초마다 `DATA,x,y`로 전송. Web Bluetooth 연결은 메인 화면 사용자 클릭이 필요 → `init()`이 불리면 연결 버튼을 띄우고 워커가 기다리는 구조(§3.0·§3.7). 3단원 f089는 머리말 없는 'x,y' |
| `강의준비.zip ▸ 4.1.4 ▸ ESP32BLE(p251).py` | ubluetooth, machine(Pin, Timer), time, micropython | VB: 원본 실행 / RB: `ESP32BLE.py`로 이름을 바꿔 업로드 | f087과 같음 | shim으로 거의 그대로 | f101 | p251 (파일명 기준), 3단원 p196에서도 사용 | = f087과 동일. 파일명의 `(p251)` 때문에 원래 이름으로 import할 수 없음 → 사이트 [예제 불러오기]·[보드에 저장]이 이름을 자동으로 바꾼다 |
| `강의준비.zip ▸ 4.1.4 ▸ bluetooth(p254).py` | bleak, asyncio, threading, time | 사이트 안에서 실행하지 않음 → BTPC. 원본은 내려받기(이름을 `bluetooth.py`로) | BTPC | 브라우저 불가(다운로드 제공) | f102 | p254 (파일명 기준) | = f088과 동일. 사용자가 원본을 가상 파일로 올려 BTPC를 가리는 것을 러너가 막는다. 모듈 이름 `bluetooth`는 ESP32 내장 모듈·PyBluez와 이름이 같아 용어 풀이 필요 |
| `강의준비.zip ▸ 4.1.4 ▸ i2c_lcd(p252).py` | machine(I2C import만), time(sleep_ms, sleep_us) | VB: 원본을 SoftI2C 바이트 해석 위에서 실행 / RB: `i2c_lcd.py`로 업로드 | VB-I2C(PCF8574 비트 RS 0x01·RW 0x02·E 0x04·백라이트 bit3·데이터 상위 4비트 → HD44780 명령), VB(`sleep_ms`·`sleep_us`는 짧으면 양보 없이 가상 시계만) | shim으로 거의 그대로 | f103 | p252 (파일명 기준), U2A p124~127 | = f011과 동일. 커서 규칙상 16칸을 넘으면 다음 줄, 마지막 줄을 넘으면 0행 → f105 등의 19자 둘째 줄은 넘친 3칸이 첫 줄 앞을 덮는다(원본 로직 시뮬레이션) → 가상 LCD도 똑같이 재현. 사이트 배포본에 `move_to` 별칭 추가(f050 비고) |
| `강의준비.zip ▸ 4.2.1 ▸ 4.2.1_01_기본_영상처리_BLE_DATA_TX_파이널(p261).py` | cv2, mediapipe(face_mesh), pyautogui, numpy, time, bluetooth(사용자 모듈) | VL + 얼굴 메시 + 가상 데스크톱 + BTPC(실제 보드 Web Bluetooth 또는 같은 페이지 가상 보드 f105·f106·f109·f110·f115) — 화면에 가상 데스크톱·카메라·가상 보드를 함께 배치 | CV, MPF(6번 + EAR 12점), PAG(`FAILSAFE`, `PAUSE`, `size()`, `moveTo`, `doubleClick()`, `click(button='right')`; 논리 해상도 3840×2160 설정), BTPC(비동기 전송, 클릭 플래그 메시지 보존) | shim으로 거의 그대로 | f104 | p261 (파일명 기준) | 브라우저 전환 난이도 1위(§1.3). 클릭은 감은 시간 0.4초(`LONG_BLINK_THRESHOLD`) 이상일 때인데 화면 안내는 '0.3s+'(원본 불일치, 사이트판에서 맞춤). 얼굴이 보이는 매 프레임 `DATA,mx,my,d,r` 전송, 클릭 플래그는 한 프레임만 1. 원본 라이브러리는 매번 응답 대기라 루프가 느려짐 → BTPC는 비동기로 보내되 플래그=1 메시지는 버리지 않음(§6). 보정 전에는 화면 중앙 좌표 전송. f114와 import 이름 2줄만 다름 |
| `강의준비.zip ▸ 4.2.1 ▸ 4.2.1_02_심화_ESP32_BLE_DATA_RX(p270).py` | ESP32BLE, machine(Pin, SoftI2C), time, i2c_lcd | VB: 가상 BLE 수신 + LCD / RB | LIB(`ESP32BLE.py`, `i2c_lcd.py`), VB-BLE, VB-I2C, 가상 송신 패널(x·y 슬라이더, 더블클릭·우클릭 버튼) | shim으로 거의 그대로 | f105 | p270 (파일명 기준) | 필드 수 검사 5(주석은 여전히 3필드). 둘째 줄 `d_c:{:<5} r_c:{:<5}`가 19자라 첫 줄 앞 3칸을 덮음. LCD 갱신(clear 뒤 `sleep_ms(5)`)이 느려 클릭 메시지가 다음 메시지에 덮여 안 보일 수 있다 → 가상 보드도 같은 덮어쓰기 규칙 |
| `강의준비.zip ▸ 4.2.1 ▸ 4.2.1_03_심화_ESP32_BLE_serv(p272).py` | ESP32BLE, machine(Pin, PWM, SoftI2C), time, i2c_lcd, mg90s_servo | VB: BLE 수신 + LCD + 서보 2개 / RB | LIB(`ESP32BLE`, `i2c_lcd`, `mg90s_servo` 원본), VB-BLE, VB-I2C, VB-PWM(`PWM(Pin, freq=50, duty=0).duty(23~124)` → 각도) | shim으로 거의 그대로 | f106 | p272 (파일명 기준) | 각도 = `map(mouse_x, 0, 3840, 0, 180)` → 송신 화면이 1920×1080이면 89°까지만 움직임(계산) → 가상 데스크톱 논리 해상도 3840×2160(Claude 결정, §6.4). `mg90s_servo.map`이 내장 `map`을 가림. 연구 결과 반영: ESP32 PWM `duty()` 0~1023은 현재 문서에 남아 있음 |
| `강의준비.zip ▸ 4.2.1 ▸ bluetooth.py` | bleak, asyncio, threading, time | 사이트 안에서 실행하지 않음 → BTPC, 원본 내려받기 | BTPC | 브라우저 불가(다운로드 제공) | f107 | 폴더 라이브러리(쪽 없음) | = f088과 동일 |
| `강의준비.zip ▸ 4.2.1 ▸ mg90s_servo.py` | machine(Pin, PWM) | VB: `machine.PWM` mock 위에서 원본 실행 / RB 업로드 | VB-PWM(생성자 키워드 `freq`·`duty`, `duty(0~1023)`) | shim으로 거의 그대로 | f108 | 폴더 라이브러리(쪽 없음) | 0°=23, 90°=73, 180°=124(계산). 50Hz 10비트 기준 약 0.45~2.42ms 펄스. 입력 범위를 거꾸로(3840→0) 넣으면 좌우 반전. = f012 = f117과 동일 |
| `강의준비.zip ▸ 4.2.2 ▸ 4.2.2_01_기본_ESP32_BLE_servo_RGB(p278).py` | ESP32BLE, machine, time, i2c_lcd, mg90s_servo | VB: BLE 수신 + LCD + 서보 2 + RGB LED / RB | LIB, VB-BLE, VB-I2C, VB-PWM, VB(`Pin(27/32/33, Pin.OUT).value(0/1)`) | shim으로 거의 그대로 | f109 | p278 (파일명 기준) | LED는 메시지를 받을 때만 갱신 → 클릭 플래그가 한 프레임만 1이라 초당 메시지가 많으면 LED가 거의 안 보이거나 아예 못 받을 수 있다. 가상 보드도 같은 현상이 나야 정직(f113이 타이머로 개선) |
| `강의준비.zip ▸ 4.2.2 ▸ 4.2.2_02_심화_ESP32_BLE_servo_RGB_laser_buzzer(p281).py` | ESP32BLE, machine(Pin, SoftI2C, PWM), time, i2c_lcd, mg90s_servo | VB: BLE + LCD + 서보 2 + RGB + 레이저 + 버저(Web Audio) / RB | LIB, VB-BLE, VB-I2C, VB-PWM(`PWM(Pin(2, Pin.OUT)).freq/duty` → 사각파, duty 0이면 무음), VB(`Pin.value(bool)` 허용) | shim으로 거의 그대로 | f110 | p281 (파일명 기준) | 레이저를 끄는 `else` 분기(99~100행)가 주석 처리되어 첫 수신 뒤 계속 켜짐 → 실제 수업 눈 보호 안내, 사이트판은 주석 해제(PLAN PD-23). 클릭음이 약 0.15초 루프를 막아 그동안 온 메시지는 덮어써짐. 버저 GPIO2는 내장 LED·스트래핑 핀과 겹침(연구 결과 반영: 스트래핑 핀 확인, 내장 LED 영향은 실물 미확인). f111·f115와 서보 `map` 줄만 다름 |
| `강의준비.zip ▸ 4.2.2 ▸ 4.2.2_03_심화_ESP32_BLE_servo_RGB_laser_buzzer_mount.py` | ESP32BLE_LIB(**자료에 없음**), machine, time, i2c_lcd, mg90s_servo | VB / RB(f110과 같음) | f110과 같음. 가상 보드는 옛 이름 `ESP32BLE_LIB`를 별칭으로 받지 않는다(원본은 실물과 같이 ImportError + 한국어 설명) | 일부 수정 | f111 | 쪽 표기 없음 | 사본 대조: `import ESP32BLE_LIB` 뒤 `ESP32BLE_LIB.init("ESP32")`·`read()`만 쓰며 API는 `ESP32BLE`와 같다. 같은 폴더의 f110·f115는 `ESP32BLE`를 쓴다 → Claude 결정: 라이브러리 이름을 하나로 통일해 import 한 줄을 `import ESP32BLE`로 고친다(보드에 같은 파일을 두 이름으로 올리지 않고, 가상 보드에서만 도는 코드를 만들지 않기 위해). 레이저 끄는 분기(100~101행) 주석 처리는 f110과 같고 사이트판은 주석 해제(PLAN PD-23). 차이는 서보 `map(mouse_x, 3840, 0, 45, 135)`·`map(mouse_y, 0, 2160, 30, 90)`. f110과 거의 같음 |
| `강의준비.zip ▸ 4.2.2 ▸ 4.2.2_04_심화_ESP32_BLE_servo_mount_90.py` | machine(Pin, SoftI2C·PWM import만), time(import만), mg90s_servo | VB: 서보 2개 90° 정렬(스크립트 종료 뒤 PWM 유지) / RB | LIB(`mg90s_servo`), VB-PWM(종료 뒤 상태 유지) | shim으로 거의 그대로 | f112 | 쪽 표기 없음 | 파일명에 BLE가 있지만 BLE 코드 없음. 마운트 조립 전 duty 73(=90°)을 계속 내보내야 함 |
| `강의준비.zip ▸ 4.2.2 ▸ 4.2.2_05_탐구_ESP32_RGB_buzzer.py` | ESP32BLE_LIB(**자료에 없음**), machine, time(sleep, ticks_ms), i2c_lcd, mg90s_servo | VB(이 파일 전용 배선도: 서보 X=32, RGB 12/5/4, 레이저 27) / RB | LIB, VB-BLE, VB-I2C, VB-PWM, VB(`ticks_ms()` 가상 밀리초) | 일부 수정 | f113 | 쪽 표기 없음 | import 한 줄 수정은 f111과 같은 결정(사본 대조). **레이저는 46행 `laser.value(1)`만 있고 끄는 코드가 주석까지 포함해 아예 없다**(2차 검토 사본 대조) → 데이터를 한 번 받으면 계속 켜짐. 사이트판은 끄기 논리를 새로 넣는다: 같은 파일의 LED 타이머(`led_timers`·`check_leds`, 2000ms)와 같은 방식으로 마지막 수신 뒤 일정 시간이 지나면 끔(PLAN PD-23, 줄 추가 규칙 §2.6). docstring "1초 후"와 코드 2000ms 불일치. 빨강 LED GPIO12가 `ESP32BLE.py` 상태 LED(GPIO12)와 겹쳐 연결이 끊긴 동안 빨강이 깜박일 수 있다 → 사이트판에서 빨강 핀을 바꾼다(INVENTORY §4.4). GPIO12·5·2는 스트래핑 핀(확인됨). `ticks_diff` 대신 뺄셈 사용(오래 켜 두면 값이 넘어가는 문제는 미확인) |
| `강의준비.zip ▸ 4.2.2 ▸ 4.2.3_01_기본_영상처리_BLE_DATA_TX_파이널.py` | cv2, mediapipe(face_mesh), pyautogui, numpy, time, bluetooth_lib(사용자 모듈) | f104와 같음 | f104와 같음 + BTPC를 `bluetooth_lib` 이름으로도 등록 | shim으로 거의 그대로 | f114 | 쪽 표기 없음 | f104와 12행 `import time, bluetooth_lib`·60행 `bluetooth_lib.init(...)` 2줄만 다름. 파일명은 4.2.3이지만 4.2.2 폴더 안. f104와 거의 같음 |
| `강의준비.zip ▸ 4.2.2 ▸ 4.2.3_02_기본_ESP32_BLE_servo_RGB_laser_buzzer.py` | ESP32BLE, machine, time, i2c_lcd, mg90s_servo | f110과 같음(짝: f114) | f110과 같음 | shim으로 거의 그대로 | f115 | 쪽 표기 없음 | f110과 서보 `map` 2줄만 다름: X `map(mouse_x, 3840, 0, 10, 170)`, Y `map(mouse_y, 0, 2160, 30, 90)`. 1920×1080이면 X는 90~170°만 쓰임(계산). 레이저 끄는 분기(100~101행) 주석 처리도 f110과 같아 사이트판은 주석 해제(PLAN PD-23). f110과 거의 같음 |
| `강의준비.zip ▸ 4.2.2 ▸ bluetooth_lib.py` | bleak, asyncio, threading, time | 사이트 안에서 실행하지 않음 → BTPC(`bluetooth_lib` 이름), 원본 내려받기 | BTPC | 브라우저 불가(다운로드 제공) | f116 | 폴더 라이브러리(쪽 없음) | = f088과 동일(파일 이름만 다름. 이름을 바꾼 이유는 자료에 없음, 내장 `bluetooth`와의 충돌 회피로 추정) |
| `강의준비.zip ▸ 4.2.2 ▸ mg90s_servo.py` | machine(Pin, PWM) | f108과 같음 | VB-PWM | shim으로 거의 그대로 | f117 | 폴더 라이브러리(쪽 없음) | = f012와 동일 |

### 2.5 opmp.zip — OpenCV·MediaPipe 입문 계단 (f118~f136, 19개)

공통: BT 교안 p7~35와 1:1로 대응하는 수업용 원형(zip 날짜 2024-11-06). 손 계단 f128 → f129 → f130 → f131 → f132 → f133 → f134 → f135 → f136 → f118, 얼굴 계단 f119 → f120 → f121 → f122, 포즈 f123, 코 끝 계단 f124 → f125 → f126 → f127. 한 단계에 1~5줄씩 늘어 SPEC §6.1 "예제 계단"에 알맞다. f119~f127은 `while cv2.getWindowProperty(name, cv2.WND_PROP_VISIBLE) >= 1` 형태라 CV가 [정지]·탭 닫힘에 0을 돌려줘야 끝난다.

| 원본 파일 | 사용하는 모듈 | 브라우저에서 실행 방법 | 필요한 shim/mock | 그대로 돌아가는가 | id | 교과서 쪽 | 비고 |
|---|---|---|---|---|---|---|---|
| `opmp.zip ▸ 1_opencv로 캠 화면 띄우기.py` | cv2 | VL | CV(`waitKey(1) == 27` ESC) | shim으로 거의 그대로 | f128 | BT p7~10, 관련 p23·p28·p216 | f092와 거의 같음(창 이름·종료 키). 교안의 "화면이 안 켜지면 fn+f1" 안내는 브라우저 카메라 권한 안내로 대체 |
| `opmp.zip ▸ 2_캠 화면 사이즈 변경.py` | cv2 | VL | CV(`cap.set(CAP_PROP_FRAME_WIDTH, 1080)` → 카메라 제약 재설정, `cap.get` → 실제 트랙 크기 float) | shim으로 거의 그대로 | f129 | BT p11~12 | 요청 해상도를 카메라가 못 주면 가까운 값으로 바뀜(교안 p12와 같은 개념). shim이 성능 때문에 프레임을 줄이면 `get`도 줄인 크기로 일관되게 → f134·f140·f158의 픽셀 임계값 의미 유지 |
| `opmp.zip ▸ 3_mediapipe의 Hands모델 사용하기.py` | cv2, mediapipe(hands, drawing_utils) | VL + 손 추론 | CV, MPH(`Hands(max_num_hands=1)`), DRAW(기본 스타일) | shim으로 거의 그대로 | f130 | BT p13~15, 관련 p30 | 교안 p13의 "Thonny에서 mediapipe 설치"는 "설치 없이 바로"로 대체. 연구 결과 반영: 레거시 기본 스타일은 점 빨강 (0,0,255)·두께 2·반지름 2(흰 테두리), 선 (224,224,224)·두께 2 |
| `opmp.zip ▸ 4_자유자재로꾸미기.py` | cv2, mediapipe(hands, drawing_utils) | VL + 손 추론 | CV, MPH, DRAW(`DrawingSpec(color=(B,G,R), thickness, circle_radius)`, 4번째 인자=점 스타일, 5번째=선 스타일) | shim으로 거의 그대로 | f131 | BT p16~17 | 교안 p17: 인자 순서의 중요성을 가르치려고 일부러 `line_style, circle_style` 순서로 넘김 → shim이 위치 규칙을 지켜야 교안 의도(스타일이 뒤바뀐 결과)가 재현된다(연구 결과 반영: 레거시 시그니처 순서 확인). 원 색상은 교안 (166,114,31) vs 파일 (161,114,31) |
| `opmp.zip ▸ 5_손가락 반전.py` | cv2, mediapipe(hands, drawing_utils) | VL + 손 추론 | CV, MPH(파이썬이 넘긴 반전 배열 기준 추론), DRAW | shim으로 거의 그대로 | f132 | BT p18~19 | f131에 `cv2.flip` 1줄. shim이 비디오 원본을 추론하면 뼈대가 반대쪽에 그려짐. `flip`이 `ret` 검사보다 앞 |
| `opmp.zip ▸ 6_손가락 좌표 확인하기.py` | cv2, mediapipe(hands, drawing_utils) | VL + 손 추론 + 콘솔 | CV, MPH(`landmark[8]` 객체의 `.x .y .z`와 `print()` 문자열), DRAW, RUN(콘솔 출력 제한) | shim으로 거의 그대로 | f133 | BT p20~22 | 레거시 `print(landmark)`는 줄마다 `x: …`, `y: …`, `z: …` 형식으로 알려짐(정확한 형식은 미확인 → 비슷하게 흉내). 매 프레임 `print` |
| `opmp.zip ▸ 7_화면상의 손가락 위치 정확하게 출력하기.py` | cv2, mediapipe(hands, drawing_utils) | VL + 손 추론 | CV(`get` = 실제 프레임 크기), MPH, DRAW | shim으로 거의 그대로 | f134 | BT p23~24 | 정규화 좌표 × `cap.get` 폭·높이. BLE 송신 예제 f140·f158·f089의 공통 뼈대 |
| `opmp.zip ▸ 8_손가락 랜드마크에 점 그리기(검지손가락 인식).py` | cv2, mediapipe(hands, drawing_utils) | VL + 손 추론 | CV, MPH, DRAW | shim으로 거의 그대로 | f135 | BT p25 | 반지름·색 바꾸기 활동은 `@slider` 규약으로. 교과서 1.2.2(f030)가 확장 |
| `opmp.zip ▸ 9_접혀있는 손가락 감지하여 출력하기.py` | cv2, mediapipe(hands, drawing_utils) | VL + 손 추론 — 결과 문자열은 AI→피지컬 브릿지 입력(시나리오 F) | CV(`putText`), MPH(0·2·4·5·8·9·12·13·16·17·20) | shim으로 거의 그대로 | f136 | BT p26~32 | 판별 반복문이 손 반복문 밖이라 마지막 손만 판별(`max_num_hands=1`이라 지금은 문제없음). 교안 p32의 Gesture Recognizer 대안은 모델 라이선스 미확인이라 기본으로 쓰지 않음(연구 결과 반영) |
| `opmp.zip ▸ 10_동시에 출력하기.py` | cv2, mediapipe(hands, drawing_utils) | VL + 손 추론 | CV, MPH(`Hands(max_num_hands=3)`, `multi_handedness[i].classification[0].label`), DRAW | shim으로 거의 그대로 | f118 | BT p33~35 | 라벨을 모두 (50,50)에 써서 손이 여럿이면 겹침. 연구 결과 반영: 레거시 'Left'/'Right'는 "좌우 반전된 셀카 입력"을 가정한다 → Tasks 결과를 옮길 때 같은 규칙인지 브라우저에서 대조(미확인) |
| `opmp.zip ▸ 11_facemesh_landmakr점 띄우기.py` | cv2, mediapipe(face_mesh, drawing_utils) | VL + 얼굴 메시 | CV(`namedWindow`, `getWindowProperty(WND_PROP_VISIBLE)`), MPF(`FaceMesh(refine_landmarks=True)` → 478점), DRAW(`FACEMESH_TESSELATION`) | shim으로 거의 그대로 | f119 | 교안에 없음, 관련 p217·p55 | `cam.release()` 없음. 교과서판 f093은 `with` 문·`q` 종료로 정리된 후속판 |
| `opmp.zip ▸ 12_얼굴에 랜드마크 번호 띄우기.py` | cv2, mediapipe(face_mesh, drawing_utils) | VL + 얼굴 메시 | CV, MPF, DRAW | shim으로 거의 그대로 | f120 | 교안에 없음, 관련 p219 | 0~467 중 5개마다 번호. 변수명 오타 `coodrd`(동작 영향 없음). "랜드마크 번호 찾기" 체험 도구로 쓰기 좋음 |
| `opmp.zip ▸ 13_입술을 감지하여 입을 열면 키보드 동작.py` | cv2, mediapipe(face_mesh), pyautogui | VL + 얼굴 메시 + 가상 데스크톱의 자체 제작 스페이스 키 미니게임 | CV, MPF(`landmark[13]`·`[14]`), PAG(`press('space')`) | shim으로 거의 그대로 | f121 | 교안에 없음, 관련 p65·p68 | 입을 벌린 동안 매 프레임 `press('space')` 연타. 임계값 `dist_lip > 500`은 픽셀 제곱거리라 해상도에 민감 → `@slider`. 원작 게임 복제 금지(SPEC §6.1) |
| `opmp.zip ▸ 14_눈의 상대거리를 이용해 감은 눈 확인.py` | cv2, mediapipe(face_mesh), pyautogui(문자열 블록 안에서만) | VL + 얼굴 메시 | CV, MPF(33·133·153·158), PAG(import 성공용) | shim으로 거의 그대로 | f122 | 교안에 없음, 관련 p234·p240·U1 p112 마무리 9번 | 교과서 EAR(6점) 방식의 전 단계(제곱거리 비율 0.05). 화면 문구 'Opend' 오타. mock이 없으면 ImportError. 원본은 문법 오류가 없지만 추출 사본은 줄 끝 손상으로 백슬래시 줄 이음이 끊겨 SyntaxError로 보인다(§2.2 머리말) |
| `opmp.zip ▸ 15_포즈 랜드마크 그려보기.py` | cv2, mediapipe(pose, drawing_utils) | VL + 포즈 추론 | CV(`namedWindow`·`getWindowProperty`), MPP(`Pose()`), DRAW(`POSE_CONNECTIONS`, visibility 0.5 미만 생략) | shim으로 거의 그대로 | f123 | 교안에 없음, 관련 p85 | 마지막 줄 `cv2.destoyAllWindows()` 오타 → ESC로 끝낼 때만 AttributeError(Pyodide OpenCV에서도 같게 나야 정직, 오류 사전 예시). 변수명 `mp_drawig` 오타(영향 없음) |
| `opmp.zip ▸ 16_0_deque.py` | collections.deque | VL(카메라 불필요) | 없음 | 그대로 | f124 | 교안에 없음 | 표준 라이브러리만. 출력 `deque([...], maxlen=3)`은 CPython·Pyodide 같음. "파이썬 기초 상자" 후보 |
| `opmp.zip ▸ 17_코 끝 위치 출력하기.py` | cv2, mediapipe(face_mesh) | VL + 얼굴 메시 | CV, MPF(`landmark[1]`) | shim으로 거의 그대로 | f125 | 교안에 없음, 관련 p55·p58 | 매 줄 한국어 주석 → 초보자용 원문으로 좋음. `flip`이 `check` 검사보다 앞 |
| `opmp.zip ▸ 18_코 끝의 움직임 방향 감지하기.py` | cv2, mediapipe(face_mesh), collections.deque, pyautogui(import만) | VL + 얼굴 메시 | CV, MPF, PAG(import 성공용), RUN(콘솔 출력 제한) | shim으로 거의 그대로 | f126 | 교안에 없음, 관련 p58 | `print(dq)`가 매 프레임 튜플 30개 출력 → 콘솔 버퍼 제한. x가 정확히 같을 때만 '정지'라 사실상 left/right만 나옴(탐구 소재) |
| `opmp.zip ▸ 19_코 끝으로 마우스 컨트롤 하기.py` | cv2, mediapipe(face_mesh), collections.deque, pyautogui | VL + 얼굴 메시 + 가상 데스크톱 | CV, MPF(`landmark[1]`·`[5]`), PAG(`size()`, `moveTo(x, y)`, 기본 `PAUSE` 0.1초·`FAILSAFE` 흉내) | shim으로 거의 그대로 | f127 | 교안에 없음, 관련 p226·p205 | 교과서 f095의 원형. 정규화 좌표를 화면 전체에 그대로 곱해 커서가 크게 흔들림(보정 필요성 탐구). 연구 결과 반영: 기본 `PAUSE = 0.1`이라 원본 PC에서도 매 프레임 `moveTo` 뒤 0.1초씩 쉰다 → mock도 흉내 내야 체감이 같다 |

### 2.6 pyautogui 예제 (pg.zip, f016~f025, 10개)

공통: 실제 마우스·키보드·화면·다른 웹사이트는 브라우저에서 조작할 수 없다 → 페이지 안 **가상 데스크톱**(가상 커서·메모장·그림판·가상 브라우저의 자체 제작 연습 페이지)에서 같은 코드가 돈다. 원본은 "진짜 PC에서 돌리기" 내려받기로 둔다. 코드 본문은 슬라이드 캡처가 아니라 zip 파일 기준(INVENTORY §7.5). 연구 결과 반영: PyAutoGUI 0.9.54 기준 `size()`는 `Size(width, height)`, `position()`은 `Point(x, y)` 네임드튜플, 기본 `PAUSE = 0.1`, `FAILSAFE = True`.

| 원본 파일 | 사용하는 모듈 | 브라우저에서 실행 방법 | 필요한 shim/mock | 그대로 돌아가는가 | id | 교과서 쪽 | 비고 |
|---|---|---|---|---|---|---|---|
| `pg.zip ▸ 1_화면크기,마우스위치.py` | pyautogui | VL(카메라 없음) + 가상 데스크톱 | PAG(`size()` → `Size`, `position()` → `Point`, repr 형식 같게) | shim으로 거의 그대로 | f017 | PPT 슬라이드 7, 관련 p205 | 슬라이드 실행 화면이 `Size(width=1920, height=1080)` 형식 → 교안과 비교할 수 있게 같은 repr. 값은 가상 모니터 크기 |
| `pg.zip ▸ 2_마우스 이동 및 클릭.py` | pyautogui | VL + 가상 데스크톱 | PAG(`moveTo(x, y, duration)` 애니메이션, `click(x, y)`·`doubleClick(x, y)`·`rightClick(x, y)` → 가상 아이콘·버튼·메뉴에 이벤트) | shim으로 거의 그대로 | f018 | PPT 슬라이드 9 | 슬라이드는 두 번째 이동이 `moveRel(50, 50, duration=1)`, 파일은 `moveTo(50, 50, duration=1)` → 사이트판은 파일 기준, 슬라이드판도 돌도록 `moveRel` 지원. 슬라이드 요약의 `click(button='right')`·`click(clicks=, interval=)`도 지원 |
| `pg.zip ▸ 3_마우스드래그.py` | pyautogui | VL + 가상 데스크톱(그림판에 선, 창 제목줄이면 창 이동) | PAG(`dragTo(x, y, duration)`) | shim으로 거의 그대로 | f019 | PPT 슬라이드 10 | 시작 위치가 "현재 커서"라 가상 데스크톱의 초기 커서 위치를 정해 둔다. 슬라이드에는 `dragRel(-50, -50, duration=1)`이 더 있음 |
| `pg.zip ▸ 4_키 입력.py` | pyautogui, time | VL + 가상 메모장(자동 포커스 또는 5초 카운트다운) | PAG(`typewrite(text, interval)` — 줄바꿈은 엔터, `hotkey('ctrl', 's')` → 가상 저장 대화상자), RUN(약 30초 실행 → [정지] 필수) | shim으로 거의 그대로 | f020 | PPT 슬라이드 11·12 | 실제 브라우저의 Ctrl+S는 합성할 수 없고 해서도 안 된다. 파일은 슬라이드 11·12를 합친 형태이며 문구가 다름 |
| `pg.zip ▸ 5_원 그리기.py` | pyautogui, math | VL + 가상 데스크톱 + "커서 궤적 보기" | PAG(`moveTo(float, float, duration=0.01)` → 정수로 변환, 실제 변환 방식은 미확인) | shim으로 거의 그대로 | f021 | PPT 슬라이드 14 | `moveTo`는 버튼을 누르지 않아 실제 PC 그림판에도 선이 안 생긴다 → 궤적 표시는 "보조 그림"이라고 명확히. 중심 (500,500)·반지름 100 → 가상 모니터 600px 이상. 기본 `PAUSE` 0.1초 때문에 원본 PC에서 한 바퀴(5도 간격 72점)에 7초 넘게 걸림(계산) → mock도 같게 |
| `pg.zip ▸ 6_별 그리기.py` | pyautogui, math(import만) | VL + 가상 그림판(드래그 = 선 긋기) | PAG(`moveTo`, `dragRel(dx, dy, duration)`) | shim으로 거의 그대로 | f022 | PPT 슬라이드 15 | 세 이동의 합이 0이라 같은 정삼각형을 5번 그림(별이 아님) → "왜 별이 안 될까?" 탐구 과제 또는 사이트판 수정 |
| `pg.zip ▸ 7_웹페이지열기.py` | webbrowser, time, pyautogui(import만) | VL + 가상 데스크톱 속 "가상 브라우저" 창 | WEB(`webbrowser.open(url)` → 가상 브라우저 주소창에 URL, 내용은 사이트가 만든 중립 연습 페이지), PAG(import용) | shim으로 거의 그대로 | f023 | PPT 슬라이드 19 | 실제 포털 화면·로고 모사 금지(상표·사칭). 연구 결과 반영: Pyodide 문서가 `webbrowser`를 "기능 제한" 모듈로 분류 → shim으로 덮어쓴다. 실제 새 탭 열기는 선택 기능(사용자 클릭 직후에만) |
| `pg.zip ▸ 8_웹페이지 검색자동화.py` | webbrowser, time, pyautogui | VL + 가상 브라우저 + 자체 제작 검색 연습 페이지 | WEB, PAG(`typewrite('…\n', interval=0.1)`, `press('enter')`) | 일부 수정 | f024 | PPT 슬라이드 20 | 마지막 줄 `pyautogui.enter('enter')` → 연구 결과 반영: PyAutoGUI 소스에 `enter` 함수가 없다(`press(keys, presses=1, interval=0.0)`는 있음) → 원본 PC에서도 AttributeError. 슬라이드는 `press('enter')` → 사이트판은 슬라이드대로 고친다. mock은 없는 `enter`를 몰래 지원하지 않고 AttributeError + 한국어 설명을 보여 준다(Claude 결정) |
| `pg.zip ▸ 9_화면캡처.py` | pyautogui | VL + 가상 데스크톱 캡처 + 가상 파일 미리보기·내려받기 | PAG(`screenshot()` → PIL 이미지(Pyodide Pillow), `.save(path)`), FS | shim으로 거의 그대로 | f025 | PPT 슬라이드 22, 관련 p203(f090) | f090의 선행 학습. `screenshot('파일명')` 형태(f090)도 지원 |
| `pg.zip ▸ 10_화면 주기적으로 캡처.py` | pyautogui, os, time | VL + 가상 데스크톱 캡처 5장 + '내 파일' 패널 | PAG(`screenshot()`), FS(`os.makedirs`·`os.path.join`은 가상 파일시스템에서 그대로), `time.sleep(2)` 대기 | shim으로 거의 그대로 | f016 | PPT 슬라이드 23 | 실제 모니터 반복 캡처(getDisplayMedia)는 매번 권한 창·클릭이 필요해 맞지 않음 → 가상 데스크톱 캡처가 기본, 실제 화면 캡처는 선택 기능. 새로고침하면 파일이 사라지므로 내려받기 안내 |

### 2.7 블루투스통신_소스코드 폴더 (f137~f158, 22개)

공통: BT 교안 p70~91의 BLE 실습 코드(zip 날짜 2024-11-01). 교과서 3·4단원 BLE 코드의 원형이다. 두 `thonny_블루투스.zip`은 MD5가 같아(INVENTORY §7.1) f150~f156은 f143~f149의 사본이다. 수신 쪽은 `ESP32BLE.py`를 보드에 먼저 올린다(교안은 `boot.py`로 저장, 사이트 기본은 `main.py`).

| 원본 파일 | 사용하는 모듈 | 브라우저에서 실행 방법 | 필요한 shim/mock | 그대로 돌아가는가 | id | 교과서 쪽 | 비고 |
|---|---|---|---|---|---|---|---|
| `BT/1. (기초)(값을 받음)… ▸ #ESP32BLE.py 파일을 ESP32에 업로드 후 실행.txt` | ESP32BLE(사용자 모듈), time | VB: 가상 BLE 수신 + 콘솔(보내는 쪽은 통신 실습실 입력창·브릿지) / RB: `ESP32BLE.py` 업로드 후 실행 | LIB(`ESP32BLE.py` 원본), VB-BLE, VB(`time.sleep(0.1)`) | shim으로 거의 그대로 | f137 | BT p70, p73~75 | 확장자가 `.txt`이고 파일 이름이 곧 안내문 → `examples/`에는 `.py`로. 교과서 f098은 `init`까지만 있는 축약판. 교안 p75 화면의 주소가 f158 코드의 주소와 같다(값은 적지 않음) |
| `BT/2. (기초)(값을 던짐)… ▸ ESP32블루투스통신_예제.py` | bluetooth(PC 사용자 모듈) | VL 워커 + BTPC(실행 전 [BLE 연결] 버튼으로 연결된 기기에 바인딩, 또는 같은 페이지 가상 보드) | BTPC(`init(address)` — 주소 무시, `send('c')`, `disconnect()`, 출력 문구 흉내) | shim으로 거의 그대로 | f138 | BT p71~72, p76~77, 관련 p197~198 | Web Bluetooth는 주소를 쓰지 않으므로 교안의 "주소 붙여넣기" 단계가 "연결 버튼 누르기"로 바뀐다고 안내. 모듈 이름 `bluetooth`는 ESP32 내장 모듈·PyBluez와 이름이 같아 용어 풀이 필요. = f141과 동일 |
| `BT/2. (기초)(값을 던짐)… ▸ bluetooth.py` | bleak, asyncio, threading, time | 사이트 안에서 실행하지 않음 → BTPC, 원본 내려받기 | BTPC(모듈 전체 대체, 알림 수신 → 콘솔) | 브라우저 불가(다운로드 제공) | f139 | BT p71 | = f088과 동일(이 폴더판이 날짜상 가장 이른 사본). 이유는 f088 비고 |
| `opmp블루투스.zip ▸ 1_op,mp 손가락제어.py.py` | cv2, mediapipe(hands, drawing_utils), bluetooth(PC 사용자 모듈) | VL + 손 추론 + BTPC(실제 보드 또는 가상 보드 f147·f148·f149) | CV, MPH(`landmark[8]`), BTPC(한 번에 하나씩 쓰기, 최신값만 유지) | shim으로 거의 그대로 | f140 | BT p78~81, p84 | 검지 x < 100 → 'a', x > width-100 → 'b', 그 사이 → 'c'를 **매 프레임** 전송. Web Bluetooth에서 쓰기가 겹치면 오류가 날 수 있어(정확한 오류 문구는 브라우저 확인 필요) 직렬 큐 + 최신값 유지. 수신 쪽도 최신 1개만 보관해 의미 차이 적음. `disconnect()` 호출 없음. 임계값 100px는 해상도 의존. 파일명 확장자 중복 `.py.py` |
| `opmp블루투스.zip ▸ ESP32블루투스통신_예제.py` | bluetooth(PC 사용자 모듈) | f138과 같음 | BTPC | shim으로 거의 그대로 | f141 | BT p71~77 | = f138과 동일 |
| `opmp블루투스.zip ▸ bluetooth.py` | bleak, asyncio, threading, time | f139와 같음 | BTPC | 브라우저 불가(다운로드 제공) | f142 | BT p79~80 | = f139와 동일(= f088) |
| `thonny(던짐).zip ▸ 2_led rgb.py` | machine(Pin), time | VB: RGB LED(핀 12/5/4 배선) / RB | VB(`Pin.on/off`) | shim으로 거의 그대로 | f143 | BT p43~45, 관련 p143 | 같은 예제가 자료마다 핀이 다름(12/5/4, 27/32/33, 25/26/27) → 예제별 배선도(INVENTORY §4.4). RGB LED 공통 극성 미확인(1=켜짐 가정). 교안 사진의 확장 보드 상표는 배선도에 쓰지 않음(브랜드 중립 SVG). = f150과 동일 |
| `thonny(던짐).zip ▸ 7_lcd.py` | machine(Pin, SoftI2C), i2c_lcd, time | VB LCD / RB(`i2c_lcd.py` 업로드) | VB-I2C, LIB(`i2c_lcd.py`) | shim으로 거의 그대로 | f144 | BT p49~57, 관련 p127 | `count = 0` 미사용(교안 p58~60 카운트 예제의 흔적, 그 코드는 교안 이미지에만 있음). f047과 거의 같음. = f151과 동일 |
| `thonny(던짐).zip ▸ 9_servo.py` | machine(Pin, PWM import만), time(sleep_ms), mg90s_servo | VB 서보 / RB(`mg90s_servo.py` 업로드) | LIB(`mg90s_servo` 원본), VB-PWM | shim으로 거의 그대로 | f145 | BT p61~66 | 교안 p65는 `while True`로 0↔90° 반복, 파일은 한 번만(0→90°) → 자료 불일치. Claude 결정: 예제는 파일(한 번 실행)을 기준으로 두고 교안의 반복판은 "바꿔보기" 과제로 싣는다(코드 파일이 교안보다 확인 가능한 원본이므로). 교과서 2단원 서보(f078)는 다른 라이브러리(`servo_library`). = f152와 동일 |
| `thonny(던짐).zip ▸ ESP32BLE.py` | ubluetooth, machine(Pin, Timer), time, micropython | VB: 원본 실행 / RB 업로드 | f087과 같음 | shim으로 거의 그대로 | f146 | BT p73, p75, 관련 p196·p251 | = f087과 동일(= f101 = f153). 사용자 코드가 GPIO12를 쓰면(f148·f155) 상태 LED와 충돌 |
| `thonny(던짐).zip ▸ finger_lcd.py` | ESP32BLE, machine(Pin, SoftI2C), time(import만), i2c_lcd | VB: BLE 수신 + LCD(짝: f140) / RB | LIB(`ESP32BLE`, `i2c_lcd`), VB-BLE, VB-I2C | shim으로 거의 그대로 | f147 | BT p82~83(파일 목록에만), 관련 p252 | 'a' → 'left', 'b' → 'right'를 1초 표시 후 지움, 'c'와 수신 없음은 둘 다 지움. 루프마다 `sleep(1)` → 최대 1초 지연. = f154와 동일 |
| `thonny(던짐).zip ▸ finger_rgb.py` | ESP32BLE, machine(Pin), time | VB: BLE 수신 + RGB LED(짝: f140) / RB | LIB(`ESP32BLE`), VB-BLE, VB, 핀 충돌 경고(한국어) | shim으로 거의 그대로 | f148 | BT p82~84 | 빨강 LED가 GPIO12라 `ESP32BLE.py` 상태 LED와 겹침 → 사이트판은 핀을 바꾸고 'b' 분기를 보완(INVENTORY §4.4·§10.3). 교안 p83 화면은 핀을 27/32/33으로 고치는 중. GPIO12·5는 스트래핑 핀(확인됨). PC(f140)가 보내는 'b'를 처리하지 않아 파랑 미사용. = f155와 동일 |
| `thonny(던짐).zip ▸ finger_servo.py` | ESP32BLE, machine(Pin, SoftI2C, PWM), time, i2c_lcd(import만), mg90s_servo | VB: BLE 수신 + 서보(짝: f140) / RB | LIB(`ESP32BLE`, `mg90s_servo`, `i2c_lcd`는 import만), VB-BLE, VB-PWM | shim으로 거의 그대로 | f149 | BT p82~83(파일 목록에만), 관련 p272·p278 | 'a' → 0°, 'b' → 180°, 'c'는 그대로. 쓰지 않는 `i2c_lcd` import 때문에 실물 보드에 그 파일이 없으면 ImportError → RB [보드에 저장]이 필요한 라이브러리를 함께 올린다. = f156과 동일 |
| `thonny(받음).zip ▸ 2_led rgb.py` | machine(Pin), time | f143과 같음 | VB | shim으로 거의 그대로 | f150 | BT p43~45 | = f143과 동일 |
| `thonny(받음).zip ▸ 7_lcd.py` | machine, i2c_lcd, time | f144와 같음 | VB-I2C, LIB | shim으로 거의 그대로 | f151 | BT p49~57 | = f144와 동일 |
| `thonny(받음).zip ▸ 9_servo.py` | machine, time, mg90s_servo | f145와 같음 | LIB, VB-PWM | shim으로 거의 그대로 | f152 | BT p61~66 | = f145와 동일 |
| `thonny(받음).zip ▸ ESP32BLE.py` | ubluetooth, machine, time, micropython | f146과 같음 | f087과 같음 | shim으로 거의 그대로 | f153 | BT p73, p75 | = f146과 동일(= f087) |
| `thonny(받음).zip ▸ finger_lcd.py` | ESP32BLE, machine, time, i2c_lcd | f147과 같음 | LIB, VB-BLE, VB-I2C | shim으로 거의 그대로 | f154 | BT p82~83 | = f147과 동일 |
| `thonny(받음).zip ▸ finger_rgb.py` | ESP32BLE, machine, time | f148과 같음 | LIB, VB-BLE, VB, 핀 충돌 경고 | shim으로 거의 그대로 | f155 | BT p82~84 | = f148과 동일 |
| `thonny(받음).zip ▸ finger_servo.py` | ESP32BLE, machine, time, i2c_lcd, mg90s_servo | f149와 같음 | LIB, VB-BLE, VB-PWM | shim으로 거의 그대로 | f156 | BT p82~83 | = f149와 동일 |
| `BT/4.(응용(값을 받음)… ▸ 1_thonny 두개의 값을 받는 경우.py` | ESP32BLE, machine(Pin), time | VB: BLE 수신 + RGB LED(짝: f158, 또는 통신 실습실에서 'x,y' 직접 입력) / RB | LIB(`ESP32BLE`), VB-BLE, VB(`Pin(27/32/33)`) | shim으로 거의 그대로 | f157 | BT p85, p89~91, 관련 p196 | 'x,y' → x<100 빨강, y<100 초록, 그 밖 파랑 점멸(약 2초 지연, 최신값만). 파싱 실패 시 원본 `print` 그대로. 교과서 f086의 이전 판 → 사이트는 f086(핀 25/26/27)로 합친다(INVENTORY §4.4). 폴더 이름의 괄호 짝이 맞지 않음(원본 그대로). f086과 거의 같음 |
| `BT/4.(응용)(값을 던짐)vscode… ▸ 1_op,mp 손가락제어 두개의 값 던지는 경우.py` | cv2, mediapipe(hands, drawing_utils), bluetooth(PC 사용자 모듈) | VL + 손 추론 + BTPC — SPEC §6.3 "AI → 피지컬 브릿지" 기본 예제 | CV, MPH(`landmark[8]`), DRAW, BTPC(전송률 제한) | shim으로 거의 그대로 | f158 | BT p85~88, 관련 p198 | 교과서 f089와 코드가 같고 주석·주소만 다름(교과서 코드의 원형). f134 + `send` 한 줄. `disconnect()` 없음. 좌표 기준이 카메라 해상도라 수신 쪽 임계값 100과의 관계를 설명해야 함. f089와 거의 같음 |

### 2.8 HW 라이브러리 zip (f001~f015, 15개)

공통: ESP32용 라이브러리 10개와 테스트 예제 5개(f001, f002, f007, f014, f015). 원래 저작권·출처 주석은 지우지 않는다(O5). 라이브러리 행의 판정은 "가상 보드(Pyodide)에서 원본을 그대로 import할 수 있는가"이며, 실제 보드에는 모두 원본을 올릴 수 있다. f003·f005·f006·f010·f013은 쓰는 예제가 없어 가상 보드 1차 범위 밖(INVENTORY §4.4)이지만 매핑은 남긴다.

| 원본 파일 | 사용하는 모듈 | 브라우저에서 실행 방법 | 필요한 shim/mock | 그대로 돌아가는가 | id | 교과서 쪽 | 비고 |
|---|---|---|---|---|---|---|---|
| `HW.zip ▸ 1_UART2AI.py` | machine(Pin, UART; PWM import만), time(import만) | VB: 가상 UART 선 + RGB LED(상대: 페이지의 'PC 송신' 패널 또는 Vision Lab 결과 연결) / RB: 보드 REPL로 실행, 데이터는 GPIO16·17에 단 USB-UART 변환기를 두 번째 Web Serial 포트로 | VB-UART(`UART(2, baudrate=9600, tx=17, rx=16)` 핀 정수, `init(9600, bits=8, parity=None, stop=1)`, `write(str)`, `any()`, `read()`), VB(`Pin(23/25/26)`), **sleep 없는 폴링 루프의 입력 확인 지점**(§3.0) | shim으로 거의 그대로 | f001 | 원고에 없음(주제상 3.1.2와 이어짐, 추정) | 1바이트 ASCII '1'~'4'(49~52) → RGB. 시작 때 'hello world' 한 번 송신. `read()`가 여러 바이트를 한꺼번에 주면 첫 바이트만 처리. 3단원 f082(115200, tx=16·rx=17)와 속도·핀 방향이 다름. 주석 처리된 `UART(1, tx=1, rx=3)`은 USB REPL 핀과 겹침. f007과 거의 같음 |
| `HW.zip ▸ Dabble_tester_v2.py` | machine(Pin, PWM), esp32_ble_util(BLESimplePeripheral), bluetooth(BLE), time(sleep_ms) | VB: 가상 BLE 앱 패널이 IRQ 1(연결)·3(쓰기)을 넣고 Dabble 형식 프레임을 돌려줌 + RGB LED 밝기 / RB: 원본 업로드, 원하면 Web Bluetooth로 NUS RX에 같은 프레임 쓰기 | VB-BLE 저수준(`bluetooth.BLE`, `UUID`), LIB(가상 보드용 `esp32_ble_util` 호환판 — f009 비고), VB-PWM(`freq(65535)`, `duty_u16`) | shim으로 거의 그대로 | f002 | 원고에 없음 | 학생 코드는 고칠 필요 없음. 프레임 byte0~3이 `FF 02 01 01`이면 `[5:-1]`을 풀어 '1'/'2'/'3'으로 RGB. 연결이 없으면 받은 데이터 무시. 연구 결과 반영: ESP32 PWM 주파수 범위 1Hz~40MHz라 65535Hz는 범위 안, `duty_u16` 지원. Dabble 앱 프로토콜 상수만 쓰고 앱 라이브러리 코드는 복사하지 않음(§5) |
| `HW.zip ▸ Library 6.21 gorillacell_servo (1).py` | machine(Pin, PWM) | VB: 원본 import(이름은 `gorillacell_servo.py`로) / RB 업로드 | VB-PWM(`PWM(Pin, freq=50, duty=0)`, `duty(0~1023)`) | shim으로 거의 그대로 | f003 | 원고에 없음 | `map(0/90/180)` = 23/73/124. 내장 `map`을 가림. 파일명의 공백·괄호 때문에 그대로는 import 불가 → 사이트가 저장 이름을 정한다. 쓰는 예제 없음. f012와 클래스 이름만 다름 |
| `HW.zip ▸ Library-6.20-gorillacell_dcmotors.py` | machine(Pin) | VB: 원본 import(`gorillacell_dcmotors.py`) / RB | VB(INA/INB 논리표) | shim으로 거의 그대로 | f004 | p168~169와 관련(원고 스크린숏은 다른 PWM판) | 디지털판 `rotate(direction='cw')`, 속도 인자 없음 → f075~f077과 함께 쓰면 TypeError. 사이트는 PWM판을 기본 `gorillacell_dcmotors.py`로 제공하고(f075 비고) 이 디지털판은 원본 보관(Claude 결정: PWM판이 f074~f077을 모두 돌림) |
| `HW.zip ▸ Library-6.23-pca9685.py` | ustruct(pack/unpack '<HH'), time(sleep_us), I2C 객체(`writeto_mem`·`readfrom_mem`) | VB: 원본 import + 가상 PCA9685 레지스터 장치(0x40) / RB | VB(`ustruct` → `struct` 별칭), VB-I2C(`writeto_mem`·`readfrom_mem`, MODE1 0x00·PRESCALE 0xFE·LEDn 0x06+4n) | shim으로 거의 그대로 | f005 | 원고에 없음 | 메모리 I2C 하네스로 `DCMotors(i2c).speed(0, 2000)`·`cw()`·`stp()` 확인. 쓰는 예제가 없어 우선순위 낮음, ESP32 I2C 핀·실제 주소 미확인 |
| `HW.zip ▸ Library_fanmotors.py` | machine(Pin, PWM) | VB: 원본 import / RB | VB-PWM(`init(freq=10, duty=0)`, `duty(x)`) | shim으로 거의 그대로 | f006 | 원고에 없음 | 방향이 정수 1/0이라 원고 예제('cw')와 맞지 않음. 속도 범위 검사가 없어 mock은 1023을 넘는 duty에 실물처럼 오류를 내야 함(원고 오류표 "invalid PWM duty" 기준). 쓰는 예제 없음 |
| `HW.zip ▸ UART2AI_TM.py` | machine(Pin, UART), time(import만) | f001과 같음. 상대는 Vision Lab 분류 결과 번호(선택 기능)를 `Uint8Array([n])`으로 | f001과 같음 | shim으로 거의 그대로 | f007 | 원고에 없음 | 원시 바이트 1~4를 받음 → 문자 '1'(49)을 보내면 반응 없음 → 보내는 쪽이 `bytes([n])`. 파일명 'TM'은 Teachable Machine용으로 추정. f001과 거의 같음 |
| `HW.zip ▸ buzzer.py` | machine(Pin, PWM), time(sleep_ms) | VB: 원본 import + Web Audio 버저 / RB | VB-PWM(생성자 `duty_u16=0`, `freq`, `duty_u16` → 사각파, duty 0이면 무음) | shim으로 거의 그대로 | f008 | p156~157 스크린숏(`BUZZER(15)`, `play(jingle, 100)`), p160 과제 | 쉼표(0)에서 `play()`는 주파수를 두고 duty를 켜 직전 음이 계속 울림(원본 동작) → 가상 버저도 같게. `mario` 목록(128~141행)은 게임 음악 선율 데이터라 사이트 배포판(`examples/esp32/lib/buzzer.py`)에서 배열만 지우고 `# [사이트판] 게임 음악 선율 데이터 제외` 주석을 단다. 원래 출처 주석은 유지, 원본은 비공개 자료 저장소에만 둔다. 예제·설명은 `jingle`·`twinkle`만(INVENTORY §8 Claude 결정, SPEC §8 원작 게임 복제 금지). 연구 결과 반영: 같은 계열 공개 글(TechToTinker, GORILLACELL_BUZZER, 2021-06-09)은 `duty()`를 쓰고 이 파일은 `duty_u16`으로 바꾼 판 |
| `HW.zip ▸ esp32_ble_util.py` | bluetooth(BLE, UUID), micropython(const), struct, random·time(import만) | VB: 원본은 CPython에서 광고 데이터 결합이 실패 → 가상 보드용 호환판 사용 / RB: 원본 업로드 | VB-BLE 저수준, `micropython.const` | 일부 수정 | f009 | 원고에 없음 | 사본 대조: `advertising_payload()`의 `struct.pack(...) + value`에 `name`이 문자열(f002의 `name="esp32ble"`)로 들어와 CPython에서는 `bytes + str` TypeError(import가 아니라 `BLESimplePeripheral` 생성 때). MicroPython은 bytes에 버퍼 객체(str 포함)를 더할 수 있어 실물에서는 도는 것으로 추정(공식 예제와 같은 코드, 실기기 확인 전). 가상 보드용 판은 `name`을 bytes로 바꾸는 1곳만 수정(Claude 결정: 원본은 RB용으로 그대로 보관). 원본 URL 주석 두 개 유지 |
| `HW.zip ▸ hcsr04.py` | machine(Pin, time_pulse_us), time(sleep_us) | VB: 원본 import + 거리 슬라이더 / RB | VB(`time_pulse_us(pin, 1, timeout)` → 거리 cm × 2 × 29.1 µs, 시간 초과면 실물(MicroPython 문서·v1.29.0)처럼 예외 없이 -2(조건 대기 중)·-1(측정 중) 반환), `sleep_us` | shim으로 거의 그대로 | f010 | 원고에 없음(p147 과제에 이름만) | 20.0cm·200mm 계산 확인(하네스). 라이브러리 0.2.0은 옛 동작인 `OSError(110)`만 처리하므로, 현재 펌웨어에서는 범위 밖일 때 예외 대신 **음수 거리**가 나온다(실물과 같게 재현하고 교사용 설명에 적음). 쓰는 예제 없음 |
| `HW.zip ▸ i2c_lcd.py` | time(sleep_us, sleep_ms), machine(I2C import만) | VB: 원본을 SoftI2C 바이트 해석 위에서 실행(대안: 같은 커서 규칙의 고수준 mock) / RB 업로드 | VB-I2C(가상 PCF8574+HD44780, 0x20), VB(짧은 `sleep_*`은 가상 시계만) | shim으로 거의 그대로 | f011 | p124~127 (U2A, 스크린숏 첫 줄이 같은 URL) | 연구 결과 반영: dhylands/python_lcd(MIT)의 `lcd_api.py`와 ESP8266용 I2C 구현을 합치고 `move_to`를 `setcursor`로 바꾼 수정본이며 MIT 고지문이 빠져 있다 → 사이트 배포본은 원래 URL 주석을 두고 MIT 고지 추가 + `move_to` 별칭 1줄(f050). 글자 하나에 `writeto` 8회 이상이라 호출이 많음. = f103과 동일 |
| `HW.zip ▸ mg90s_servo.py` | machine(Pin, PWM) | VB: 원본 import / RB 업로드 | VB-PWM | shim으로 거의 그대로 | f012 | 2단원 원고에 없음(3·4단원·BT에서 사용) | duty 23~124. 연구 결과: 같은 계열 공개 글(TechToTinker 037 서보, 2021-05-28)의 `GORILLACELL_SERVO`와 같은 코드로 보고됨(글에 라이선스 표기 없음). = f108 = f117과 동일, f003과 클래스 이름만 다름 |
| `HW.zip ▸ tm1637.py` | micropython(const), machine(Pin: `init(Pin.OUT, value=0)`, 호출형 `pin(v)`), time(sleep_us, sleep_ms) | VB: 원본 import + 가상 TM1637 핀 해독기(4자리 7세그먼트 SVG) / RB | VB(`Pin.__call__`, `Pin.init`), 핀 해독기(시작·정지 조건, LSB부터 8비트, 0x40·0xC0·0x80 명령), `sleep_us(10)`은 양보 없이 | shim으로 거의 그대로 | f013 | 원고에 없음 | 명령 한 번에 핀 호출·`sleep_us`가 수백 회 → 대기를 매번 양보로 바꾸면 매우 느려진다. ACK를 읽지 않는 구현이라 가상 장치가 응답할 필요 없음. MIT 고지 전문이 파일에 있음(확인됨). 쓰는 예제 없음 |
| `HW.zip ▸ trafficled_test.py` | machine(Pin), time | VB: LED 3개 / RB | VB | shim으로 거의 그대로 | f014 | 원고에 없음(p142~143 구조와 같음) | 파일명은 'trafficled'인데 변수는 r, g, b(부품 종류 미확인). 핀 25/26/27. f061과 구조 같음 |
| `HW.zip ▸ working_test.py` | machine(Pin), time(import만) | VB: BOOT 버튼(GPIO0) 누르면 내장 LED(GPIO2) / RB | VB(`Pin(0, Pin.IN).value()` 기본 1·누르면 0), **sleep 없는 폴링 루프의 입력 확인 지점** | shim으로 거의 그대로 | f015 | 원고에 없음(목적은 p122~123과 비슷) | pull 설정이 없음 → 가상 보드는 누르지 않았을 때 1로. GPIO0은 부트 스트래핑 핀(BOOT 버튼 용도라 의도된 사용) |

---

## 3. shim/mock 설계 입력

매핑 5건의 API 목록(api_surface)을 모듈별로 합치고 중복을 뺐다. "필수"는 자료 코드가 실제로 부르는 것, "선택"은 SPEC이나 슬라이드에만 있는 것이다. 각 항목의 브라우저 기술은 공식 문서 확인 결과를 인용했다.

### 3.0 모든 shim이 기대는 공통 실행 모델 (PLAN 결정1의 입력)

**자료 코드가 실행 모델에 요구하는 것**

| 요구 | 해당 파일 | 설명 |
|---|---|---|
| 동기처럼 보이는 대기 | 카메라 예제 전부(`cap.read()`, `process()`, `waitKey()`), f044·f045(`listen`), f084(`input`), f089·f100·f104·f114·f138·f140·f141·f158(`bluetooth.init`/`send`) | 학생 코드는 동기 함수로 부르는데 실제 일은 메인 화면·JS 비동기 API가 한다 |
| 실행 중 입력 받기 | f001·f007·f015(sleep 없는 폴링), f052·f053·f058·f059·f066·f069·f072(가상 터치), f086·f099·f105~f115·f137·f147~f149·f157(가상 BLE 수신), f031·f095~f097·f104·f114(키 입력) | 가상 버튼·슬라이더·송신 패널 값이 실행 중인 루프에 들어가야 한다 |
| 줄 입력 `input()` | f049, f056, f076, f077, f081(보드 REPL 표준입력), f084(PC) | 워커 안에서 한 줄을 기다린다 |
| 아주 짧은 대기의 반복 | f060(`sleep(0.001)`×2048/주기), f079(라이브러리 속 `sleep(0.5)` + `sleep(0.01)`), f013(`sleep_us(10)` 수백 회), f011·f103(글자마다 `sleep_ms`) | 대기마다 이벤트 루프에 양보하면 브라우저 타이머 최소 지연 때문에 실물보다 훨씬 느려진다 |
| 백그라운드 콜백 | f087 계열(`Timer(0)` 100ms 콜백, BLE IRQ), f002·f009(BLE IRQ) | 스크립트가 루프 안에 있어도(또는 끝난 뒤에도, f098·f112) 콜백이 돌아야 한다 |
| 정지 | 모든 무한 루프 | [정지] 버튼으로 루프를 확실히 끊는다 |

**설계 규칙(어느 방식을 골라도 같게)**

1. shim은 JS 쪽 일을 기다릴 때 **도구 하나** `block_on(promise)`만 쓴다. PLAN이 (a) SharedArrayBuffer + Atomics를 고르면 공유 메모리 대기로, JSPI 방식을 고르면 `pyodide.ffi.run_sync()`로 구현한다. shim 코드 나머지는 바꾸지 않는다.
2. **입력 확인 지점**: `cv2.waitKey`, `time.sleep*`, `cap.read`, `uart.any/read/readline`, `Pin.value()`(입력 핀), `adc.read()`, `ble.read()`류, `input()`에서 가상 입력·IRQ·타이머 콜백을 처리한다. sleep이 없는 루프(f001·f007·f015)를 위해 입력 조회 함수는 "N번 호출 또는 일정 시간(예: 16ms)마다 한 번" 양보하거나(JSPI 방식), 공유 메모리를 바로 읽는다(SAB 방식).
3. **가상 시계**: `time.sleep`·`sleep_ms`·`sleep_us`는 가상 시각을 먼저 앞으로 보내고, 쌓인 대기가 약 16ms를 넘을 때만 실제로 양보한다(f060·f013 속도 문제). `ticks_ms()`는 가상 시각을 돌려준다.
4. **정지**: 인터럽트 버퍼로 `KeyboardInterrupt`를 우선 시도하고, 계산만 도는 루프는 `Worker.terminate()` 후 Pyodide를 다시 띄운다(MDN: 즉시 종료). 정지 뒤 카메라·포트·BLE 연결·오디오를 모두 정리한다.
5. **메인 화면에서만 되는 API는 다리(bridge)로**: Web Speech API `SpeechRecognition`(`[Exposed=Window]`), Web Bluetooth `Bluetooth`(`[Exposed=Window, SecureContext]`), Web Serial `requestPort()`(사용자 조작 필요), `getUserMedia`, 오디오 재생. 워커 쪽 shim은 메시지를 보내고 `block_on`으로 기다린다. Web Serial `getPorts()`는 전용 워커에서도 쓸 수 있다.

**근거(공식 문서)**

| 사실 | 상태 | 출처 |
|---|---|---|
| Pyodide 인터럽트는 워커 + SharedArrayBuffer가 필요하고, SAB는 COOP `same-origin` + COEP(`require-corp`/`credentialless`)일 때만 쓸 수 있다 | 확인됨 | https://pyodide.org/en/stable/usage/keyboard-interrupts.html , https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer |
| `pyodide.ffi.run_sync`는 JSPI가 켜져 있고 `runPythonAsync` 등으로 들어온 호출에서만 동작하며 Experimental 표시 | 확인됨 | https://pyodide.org/en/stable/usage/api/python-api/ffi.html |
| Pyodide 0.28부터 JSPI가 있으면 `time.sleep()`이 스택 스위칭으로 이벤트 루프에 양보(314.0.7 `webloop.py`) | 확인됨 | https://github.com/pyodide/pyodide/blob/314.0.7/src/py/pyodide/webloop.py |
| JSPI: Chrome 137, Firefox 153 기본(MDN), V8 블로그는 Firefox 139로 적어 자료가 엇갈림. Safari 미지원 | 부분 확인 | https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/153 , https://v8.dev/blog/jspi |
| Pyodide 314부터 classic worker 미지원 → module worker | 확인됨 | https://pyodide.org/en/stable/usage/webworker.html |
| `setStdin` 처리기는 동기 함수, 워커 예시는 `Atomics.wait` | 확인됨 | https://pyodide.org/en/stable/usage/streams.html |
| Pyodide는 스레드·멀티프로세싱을 지원하지 않고, `threading`·소켓은 import만 되고 작동하지 않으며, `webbrowser`는 기능 제한 | 확인됨(이 문서 작성 중 확인) | https://github.com/pyodide/pyodide/blob/main/docs/usage/wasm-constraints.md |
| `Worker.terminate()`는 즉시 종료 | 확인됨 | https://developer.mozilla.org/en-US/docs/Web/API/Worker/terminate |
| `Serial.getPorts()`는 전용 워커에서 사용 가능, `requestPort()`는 사용자 조작(transient activation) 필요 | 확인됨(이 문서 작성 중 확인) | https://developer.mozilla.org/en-US/docs/Web/API/Serial/getPorts , https://developer.mozilla.org/en-US/docs/Web/API/Serial/requestPort |

### 3.1 `cv2` 카메라·창 shim (CV)

Pyodide `opencv-python`(314.0.7 기준 4.11.0.86)은 **실물**을 쓰고 아래만 덮어쓴다. 연구 결과 반영: Pyodide 빌드는 `highgui` 모듈을 켜지만 GTK·Qt 등 창 백엔드를 끄고, `VideoCapture(0)`는 브라우저에서 장치에 접근할 수 없다(메인테이너 답변). 파일 경로 `VideoCapture('video.mp4')`는 동작한다 → 카메라가 없을 때 샘플 영상 대체에 쓸 수 있다.

| 필수 API(자료가 부르는 형태) | shim 동작 | 쓰는 파일 |
|---|---|---|
| `cv2.VideoCapture(0)` | 메인 화면의 `getUserMedia` 스트림에 연결(권한 거부·카메라 없음이면 샘플 영상 선택 안내). 장치 번호는 0만 쓰임 | 카메라 예제 전부 |
| `cap.read()` → `(bool, ndarray HxWx3 uint8 BGR)` | 다음 프레임이 올 때까지 `block_on`으로 기다려 거의 항상 True(f034의 `continue` 폭주 방지). 프레임은 RGBA → BGR 3채널 | 전부 |
| `cap.isOpened()` → bool | 스트림이 살아 있고 [정지] 전이면 True | f028, f034~f043, f090, f091, f095~f097, f104, f114 |
| `cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1080)` | 트랙 제약 `width: {ideal: 1080}` 재설정 | f089, f129 등 opmp·BT |
| `cap.get(CAP_PROP_FRAME_WIDTH/HEIGHT)` → float | **파이썬이 받는 프레임의 실제 크기**(축소했다면 축소한 크기) | f089, f120, f129, f134, f140, f158 |
| `cap.release()` | 스트림 해제 | 전부 |
| `cv2.imshow(winname, img)` | 출력 캔버스(창 이름마다 탭). 3채널 BGR·1채널 회색 모두 표시 | 전부 |
| `cv2.waitKey(delay)` → int | `delay`ms(0 이하면 키 올 때까지) 기다리며 입력 확인 지점. 출력 캔버스에 포커스가 있을 때 들어온 키의 코드(0~255, ESC=27), 없으면 -1. 코드 편집기 타이핑과 분리, 터치 기기용 화면 키 [q][d][r][ESC]. 형태: `== ord('q')`, `& 0xFF == ord('q')`, `== 27`, `ord('d')`·`ord('r')` | 전부 |
| `cv2.namedWindow(name)` | 탭 만들기 | f119~f127 |
| `cv2.getWindowProperty(name, cv2.WND_PROP_VISIBLE)` → float | 탭이 열려 있고 [정지] 전이면 1.0, 아니면 0.0 | f119~f127(루프 조건) |
| `cv2.destroyAllWindows()` | 무시(탭은 결과 확인용으로 남김). 오타 `destoyAllWindows`는 원래대로 AttributeError | 전부, f123 |

- 실물 그대로 쓰는 OpenCV 함수(목록 확인용): `flip`, `cvtColor`(`COLOR_BGR2RGB`, `COLOR_RGB2BGR`), `line`, `circle`, `rectangle`, `putText`(`FONT_HERSHEY_SIMPLEX`·`FONT_HERSHEY_PLAIN`, `LINE_AA`), `addWeighted`, `imread`(`IMREAD_UNCHANGED`), `resize`, `drawMarker`(`MARKER_CROSS`). `frame.shape`, `frame.flags.writeable`, 픽셀 인덱싱은 numpy 실물.
- 프레임 크기·속도: SPEC §6.1의 10~15fps 제한과 크기 축소를 쓰면 픽셀 임계값 예제(f032·f033·f035·f042·f043·f095·f121·f140·f157·f158)와 프레임 수 기준 예제(f037·f095·f097·f104)의 결과가 PC와 달라진다 → 기본 640×480 요청, 실제 크기는 `cap.get`과 일치, 실행 화면에 "현재 해상도·fps" 표시(Claude 결정).
- 좌우 반전: 대부분 `flip` 뒤 `process()`를 부르므로 추론은 **파이썬이 넘긴 배열**로 한다(§3.2).
- 카메라는 보안 컨텍스트(HTTPS·localhost)에서만: https://w3c.github.io/mediacapture-main/ (확인됨).
- 근거: https://github.com/pyodide/pyodide/issues/4315 , https://github.com/pyodide/pyodide-recipes/blob/main/packages/opencv-python/extras/build_args.sh

### 3.2 `mediapipe` 레거시 흉내 shim (MPH·MPF·MPD·MPP·DRAW)

학생 코드는 레거시 `mp.solutions` 모양 그대로 쓰고, 추론은 MediaPipe Tasks Vision(JS)이 한다. SPEC §3.2의 "랜드마크를 numpy 배열로 넘기는 shim"만으로는 부족하다: 원본은 `results.multi_hand_landmarks[0].landmark[8].x` 같은 속성 접근, `None` 판정, `PoseLandmark` 정수 인덱싱, `print(landmark)`를 쓴다.

#### 3.2.1 공통 결과 객체

| 레거시 모양 | shim 구현 규칙 |
|---|---|
| `NormalizedLandmark` `.x .y .z`(+ 포즈만 `.visibility`) | 파이썬 객체. `__str__`은 `x: …` / `y: …` / `z: …` 줄 형식으로 흉내(f133, 정확한 형식은 미확인). 손·얼굴은 visibility가 "없음"으로 취급되어야 DRAW가 점을 빼지 않는다 |
| `NormalizedLandmarkList` `.landmark` | 파이썬 `list`(정수·IntEnum 인덱싱, 반복, `len` 21/468/478/33) |
| 감지 없음 | 빈 리스트가 아니라 **`None`** (`if results.multi_…:`, `results.detections is not None` 모두 원본과 같게) |
| `process(image)` | 넘겨받은 ndarray(RGB 또는 f026처럼 BGR)를 그대로 추론. `static_image_mode=False`면 VIDEO 모드(`detectForVideo`, 타임스탬프는 가상 시계) |
| 컨텍스트 매니저 | `with FaceMesh(...) as face_mesh:`(f093·f094) → `__enter__`·`__exit__`(`close()`) |

#### 3.2.2 `mp.solutions.hands` → HandLandmarker

- 필수: `Hands()`(인자 없음: f026·f030~f033), `Hands(static_image_mode=False, max_num_hands=1, min_detection_confidence=0.5)`(f029), `Hands(max_num_hands=1|3)`(opmp·BT), `Hands(max_num_hands=1, min_detection_confidence=0.7)`(f090·f091), `process(rgb)` → `multi_hand_landmarks`(손마다 21점), `multi_handedness[i].classification[0].label`(f118), `HAND_CONNECTIONS`, `HandLandmark.THUMB_TIP`(=4)·`INDEX_FINGER_TIP`(=8), 인덱스 0·2·4·5·8·9·12·13·16·17·20.
- 기본값(연구 결과 반영, 레거시 문서): `static_image_mode=False`, **`max_num_hands=2`**, `model_complexity=1`, `min_detection_confidence=0.5`, `min_tracking_confidence=0.5`. Tasks `numHands` 기본은 1이므로 shim이 인자가 없을 때 2로 넘겨야 f032·f033 결과가 원본과 같다.
- handedness: 레거시는 "좌우 반전된 셀카 입력"을 가정해 'Left'/'Right'를 정한다(확인됨). Tasks `handedness[][].categoryName`을 옮길 때 같은 규칙인지 브라우저에서 대조한다(미확인).
- 근거: https://github.com/google-ai-edge/mediapipe/blob/master/docs/solutions/hands.md , https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js

#### 3.2.3 `mp.solutions.face_mesh` → FaceLandmarker

- 필수: `FaceMesh(max_num_faces=1)`, `FaceMesh(static_image_mode=False, max_num_faces=1, min_detection_confidence=0.5)`, `FaceMesh(max_num_faces=1, refine_landmarks=True, min_detection_confidence=0.5, min_tracking_confidence=0.5)`, `FaceMesh(refine_landmarks=True)`, `with … as`, `multi_face_landmarks`, `FACEMESH_TESSELATION`, 사용 인덱스 1·5·6·10·13·14·18·19·33·78·133·144·152·153·158·160·234·263·308·362·373·380·385·387·454·468·473, `range(0, 468, 5)`.
- 기본값(연구 결과 반영): `max_num_faces=1`, **`refine_landmarks=False`**, 신뢰도 0.5·0.5. 레거시 출력은 468점, `refine_landmarks=True`면 눈·입술 주변을 다듬고 홍채 점을 더한다. Tasks FaceLandmarker는 478점 → shim은 `refine_landmarks=False`면 **앞 468점만** 돌려준다(f034의 점 개수, f094의 IndexError 재현).
- 앞 468점의 번호 배치가 레거시와 같다는 것은 추정(브라우저에서 몇 점을 대조). `FACEMESH_TESSELATION` 연결표는 MediaPipe 데이터(Apache-2.0)라 shim 파일에 고지(§5.3).
- 근거: https://github.com/google-ai-edge/mediapipe/blob/master/docs/solutions/face_mesh.md

#### 3.2.4 `mp.solutions.face_detection` → FaceDetector (f085만)

- 필수: `FaceDetection(min_detection_confidence=0.5)`, `process(rgb).detections`(None 또는 list), `detection.location_data.relative_bounding_box.xmin/.ymin/.width/.height`.
- 기본값(연구 결과 반영): `model_selection=0`(2m 이내 근거리 모델), `min_detection_confidence=0.5`. 레거시 상자는 0~1 정규화, Tasks `boundingBox`는 픽셀(`originX/originY/width/height`) → 프레임 폭·높이로 나눠 옮긴다. 키포인트 6개(레거시)는 코드에서 안 씀.
- 근거: https://github.com/google-ai-edge/mediapipe/blob/master/docs/solutions/face_detection.md

#### 3.2.5 `mp.solutions.pose` → PoseLandmarker

- 필수: `Pose()`(f040~f043, f123), `process(rgb).pose_landmarks`(**한 사람, 단수 객체** 또는 None) `.landmark`(33점, `.visibility` 포함), `POSE_CONNECTIONS`, `PoseLandmark`(IntEnum: `LEFT_WRIST.value`, `landmarks[PoseLandmark.LEFT_SHOULDER]`).
- 기본값(연구 결과 반영): `model_complexity=1`, `smooth_landmarks=True`, `enable_segmentation=False`, 신뢰도 0.5·0.5. Tasks는 `landmarks[][]`(여러 명) → 첫 사람만 `pose_landmarks`로. 모델 대응은 추정: 복잡도 0·1·2 ↔ lite·full·heavy. Claude 권장: 기본 full(레거시 기본 1과 같은 등급), 저사양 PC 설정에서 lite.
- `PoseLandmark` 번호(`LEFT_SHOULDER`=11 등)는 레거시 번호표를 그대로 옮긴다(33점 순서가 같다는 것은 추정, 브라우저 대조).
- 근거: https://github.com/google-ai-edge/mediapipe/blob/master/docs/solutions/pose.md

#### 3.2.6 `mp.solutions.drawing_utils` (DRAW)

연구 결과 반영(레거시 소스 v0.10.21 확인):

- 시그니처: `draw_landmarks(image, landmark_list, connections=None, landmark_drawing_spec=DrawingSpec(color=RED_COLOR), connection_drawing_spec=DrawingSpec(), is_drawing_landmarks=True)` → 위치 인자 4번째 = 점 스타일, 5번째 = 선 스타일(f089·f131).
- `DrawingSpec(color=WHITE_COLOR, thickness=2, circle_radius=2)`, `WHITE_COLOR=(224,224,224)`, `RED_COLOR=(0,0,255)`(BGR).
- visibility 또는 presence 필드가 **있고** 0.5 미만인 점은 건너뜀 → 포즈에만 적용, 손·얼굴은 전부 그림.
- 점은 흰 테두리 원(반지름 `max(r+1, int(r*1.2))`) 위에 채운 원. 입력은 3채널 BGR이어야 하며 아니면 오류.
- `landmark_drawing_spec=None`(f093)이면 점을 그리지 않는다.
- **numpy 프레임에 직접** 그린다(캔버스 덮개 금지): f041은 그린 뒤 `flip`, f093은 그린 뒤 색 변환, f043은 PIL 합성 뒤 그림.
- 파이썬(Pyodide OpenCV `cv2.line`·`cv2.circle`)으로 구현하면 원본과 픽셀까지 가깝다. 출처: https://github.com/google-ai-edge/mediapipe/blob/v0.10.21/mediapipe/python/solutions/drawing_utils.py (Apache-2.0)

#### 3.2.7 버전·모델·추론 위치

| 항목 | 내용 | 상태·출처 |
|---|---|---|
| 레거시 지원 종료 | 2023-03-01 레거시 Solutions 지원 종료. 이슈 #6192에서 협업자가 파이썬 판의 Solutions 제거를 확인했다. PyPI 판 순서는 0.10.21(2025-02-06, cp39~cp312 휠) 다음이 0.10.30(2025-12-16, py3 휠)·0.10.31(2025-12-18)이며, 제거가 시작된 정확한 판(0.10.30인지)은 미확인 → "진짜 PC에서 돌리기" 안내는 `mediapipe==0.10.21`(Python 3.9~3.12 휠) 고정 | 지원 종료·제거 확인됨, 시작 판 미확인: https://developers.google.com/edge/mediapipe/solutions/guide , https://github.com/google-ai-edge/mediapipe/issues/6192 , https://pypi.org/pypi/mediapipe/json (2026-09-15) |
| 추론 위치 | `detect()`·`detectForVideo()`는 동기 실행이라 UI를 막으므로 공식 문서가 워커 사용을 권한다 → Pyodide와 **같은 module 워커**에서 추론하면 `process()`가 JS 동기 호출 한 번으로 끝나 프레임 복사가 줄어든다(Claude 권장, 워커 안 GPU/CPU 대리 실행 여부는 브라우저 확인) | 확인됨(권장 사항): https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js |
| 사용 지표 전송 | tasks-vision 1.0.x는 성능·사용 지표를 Google로 보내고(개인정보 고지 2026-06-05) 끄는 공식 옵션은 확인 못 함. 0.10.35 번들에는 해당 코드가 보이지 않음(문자열 검사). 워커는 문서 CSP를 따르지 않아 워커에서 돌리면 meta CSP로 막히지 않을 수 있다 → 버전 선택은 PLAN이 정하되, 워커 추론이면 0.10.35 고정이 유리 | 확인됨/부분 확인: https://developers.google.com/edge/mediapipe/solutions/tasks#mediapipe_tasks_privacy_notice |
| 결과 구조 | `HandLandmarkerResult{landmarks, worldLandmarks, handedness}`, `FaceLandmarkerResult{faceLandmarks, …}`, `PoseLandmarkerResult{landmarks, worldLandmarks}`, `FaceDetectorResult{detections[].boundingBox(픽셀)}` | 확인됨: https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision.d.ts |
| 모델 파일 | hand_landmarker.task 7,819,105B, face_landmarker.task 3,758,596B, pose_landmarker_lite 5,777,746B / full 9,398,198B / heavy 30,664,242B, blaze_face_short_range.tflite 229,746B. 손·얼굴·포즈·얼굴 검출 모델 카드 모두 Apache-2.0 → 버전 경로(`…/float16/1/…`)로 고정해 자체 호스팅 가능. Gesture Recognizer 모델은 라이선스 미확인이라 쓰지 않음 | 확인됨: https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Face%20Mesh%20V2.pdf |
| 모델 차이 | 레거시와 Tasks 모델이 달라 임계값 예제(f035 10px, f037 MAR 0.4, f041 y 0.3, f043 40px, f096·f097·f104 EAR 0.1)가 교재 실행 결과와 조금 다르게 판정될 수 있다 → 임계값은 `@slider`로 드러낸다 | 추정 |

### 3.3 러너 공통·`input()`·자산·PIL 글꼴 (RUN·IN·FS·FONT)

| 항목 | 자료가 요구하는 것 | shim 동작 |
|---|---|---|
| `print()` | 매 프레임 출력(f072, f126, f133, f140 등) | 콘솔 패널. 줄 수 상한과 초당 갱신 제한(오래된 줄부터 버림) |
| `exit()` | f028(카메라 없으면 `exit()`) | `SystemExit`은 정상 종료로 처리. Pyodide에 `exit` 내장이 있는지는 미확인 → 없으면 러너가 넣는다 |
| `if __name__ == '__main__':` | f044, f045 | 학생 코드를 `__main__` 모듈로 실행 |
| `global` | f037, f045, f002 | 파이썬 실물(추가 작업 없음) |
| `input(prompt)` | f049, f056, f076, f077, f081(보드 REPL), f084(PC) | 콘솔 아래 입력줄에 프롬프트 표시 → Enter까지 `block_on`. 가상 보드는 같은 입력줄이 보드 표준입력 역할. 실제 보드는 입력줄 내용 + `\r\n`을 Web Serial로 보냄(raw REPL 실행 중 `input()`에 전달되는지는 실기기 확인 필요) |
| 가상 파일 | f039 `mask.png`(RGBA), f025·f016·f090 스크린숏 저장, f043 글꼴 | 예제마다 필요한 자산을 Pyodide 가상 파일시스템 작업 폴더에 미리 둔다. 학생 업로드로 교체, 결과 파일은 [내려받기] |
| PIL 글꼴 경로 | f043 `ImageFont.truetype('C:/Windows/Fonts/malgun.ttf', 30)` | `ImageFont.truetype`을 감싸 Windows 글꼴 경로(`C:/Windows/Fonts/*.ttf`)를 사이트 동봉 한글 글꼴(OFL-1.1, 예: Pretendard)로 연결하고 콘솔에 "맑은 고딕 대신 사이트 글꼴 사용" 안내. 연구 결과 반영: Pyodide Pillow 12.2.0 레시피가 `USE_FREETYPE=1`·`freetype=True`로 빌드됨 → `truetype` 사용 가능(브라우저 확인 전). 출처 https://github.com/pyodide/pyodide-recipes/blob/main/packages/Pillow/meta.yaml , 글꼴 https://github.com/orioncactus/pretendard |
| 사용자 모듈 가림 방지 | `bluetooth.py` 원본을 가상 파일로 올리면 BTPC를 가림(f102 비고) | 사이트 대체 모듈 이름(`bluetooth`, `bluetooth_lib`, `cv2` 창 함수 등)은 가상 파일보다 먼저 import되게 하고, 가려질 때 한국어 경고 |
| 파일명 쪽 번호 | `ESP32BLE(p251).py`, `bluetooth(p254).py`, `i2c_lcd(p252).py`, `Library 6.21 gorillacell_servo (1).py` | [예제 불러오기]·[보드에 저장]이 import 이름(`ESP32BLE.py` 등)으로 저장 |
| 오류 한국어 설명 후보 | NameError(f041, f082, f083, f085), TypeError(f062, f009), AttributeError(f024 `enter`, f050 `move_to`, f123 `destoyAllWindows`), SyntaxError(f074 줄 번호, 원고 p37 `= =`), ModuleNotFoundError(`ssd1306`·`servo_library` 미업로드), IndexError(`refine_landmarks` 없이 468·473), ValueError(duty 범위 밖), `FailSafeException`(f091) | SPEC §6.1 "자주 나는 오류 15개" 사전의 실제 사례로 쓴다 |

### 3.4 `pyautogui` 가상 데스크톱 mock (PAG)·`webbrowser` shim (WEB)

연구 결과 반영(PyAutoGUI 0.9.54 소스·문서): 기본 `PAUSE = 0.1`(호출마다 0.1초 쉼), `FAILSAFE = True`·`FAILSAFE_POINTS = [(0, 0)]`에 닿으면 `FailSafeException`, `Point = namedtuple("Point", "x y")`, `Size = namedtuple("Size", "width height")`, **`enter()` 함수 없음**. 출처: https://github.com/asweigart/pyautogui/blob/master/pyautogui/__init__.py , https://pyautogui.readthedocs.io/en/latest/quickstart.html

| 필수 API | 시그니처(원본) | mock 동작 | 쓰는 파일 |
|---|---|---|---|
| `size()` | → `Size(width, height)` | 가상 모니터 논리 해상도. Claude 결정: 기본 1920×1080(PPT 실행 화면), 4.2 BLE 예제(f104·f114)는 예제 설정으로 3840×2160(수신 코드 가정) | f017, f091, f095~f097, f104, f114, f127 |
| `position()` | → `Point(x, y)` | 가상 커서 위치 | f017 |
| `moveTo(x, y, duration=0.0, …)` | 소수 좌표도 받음(f021) | 가상 커서 이동(`duration` 동안 애니메이션), 범위 밖은 화면 안으로 자름. 선택: 궤적 보기 | f018, f021, f022, f091, f095~f097, f104, f114, f127 |
| `moveRel(xOffset, yOffset, duration)` | 슬라이드 9에만 | 상대 이동(선택) | PPT |
| `click(x=None, y=None, clicks=1, interval=0.0, button=PRIMARY, …)` | `click(x, y)`, `click(button='right')`, 슬라이드의 `click(clicks=, interval=)` | 가상 데스크톱 요소에 클릭 이벤트 + 클릭 표시 | f018, f097, f104, f114 |
| `doubleClick(x=None, y=None, …)` / `rightClick(…)` | | 아이콘 열기 / 메뉴 표시 | f018, f097, f104, f114 |
| `dragTo(x, y, duration, …)` / `dragRel(xOffset, yOffset, duration, …)` | | 버튼을 누른 채 이동 → 가상 그림판에 선, 창 제목줄이면 창 이동 | f019, f022 |
| `typewrite(message, interval)` | `'…\n'` 포함 | 포커스된 가상 메모장·검색창에 한 글자씩, `\n`은 엔터 | f020, f024 |
| `press(keys, presses=1, interval=0.0)` | `press('space')`, `press('enter')` | 가상 키 이벤트(스페이스 키 미니게임 등) | f121, f024 사이트판 |
| `hotkey(*keys)` | `hotkey('ctrl', 's')`, 슬라이드 `hotkey('win', 'r')` | 가상 앱 단축키(저장 대화상자, 실행 창 흉내). 실제 브라우저 단축키는 보내지 않음 | f020, PPT |
| `screenshot(imageFilename=None)` | → PIL Image, 파일명을 주면 저장 | 가상 데스크톱 캔버스를 PIL 이미지로(Pyodide Pillow), 가상 파일 저장·썸네일·[내려받기]. 같은 이름 반복 저장은 빈도 제한 | f016, f025, f090 |
| `PAUSE`·`FAILSAFE` 속성 | 대입 가능 | Claude 결정: 원본 기본값을 흉내 낸다(0.1초 쉼, (0,0) 닿으면 `FailSafeException`) → f021·f127의 원본 체감과 f091의 모서리 예외가 PC와 같고, f095~f097·f104의 `PAUSE=0.01`·`FAILSAFE=False` 변경도 의미가 산다 | f091, f095~f097, f104, f114, f127 |
| `enter(…)` | 없음 | 만들지 않는다 → AttributeError + 한국어 설명 | f024 |
| `webbrowser.open(url)` | | 가상 브라우저 창 열기(주소창에 URL, 내용은 자체 제작 연습 페이지). 실제 사이트 화면·로고 모사 금지 | f023, f024 |

- SPEC §3.2 목록에만 있는 `keyDown`, `keyUp`, `scroll`: 자료 코드는 쓰지 않지만 SPEC 요구라 mock에 넣는다(가상 키 누름·떼기, 가상 창 스크롤, PLAN P2-11).
- 가상 데스크톱 구성(자료가 요구하는 최소): 가상 커서, 아이콘(더블클릭), 우클릭 메뉴, 메모장(글자 입력·저장 대화상자), 그림판(드래그 선), 가상 브라우저 + 검색 연습 페이지, 스페이스 키로 하는 자체 제작 미니게임(f121), 가상 버튼(f091·f127 hover).
- 실제 화면 캡처(`getDisplayMedia`)는 매번 권한 창·클릭이 필요해 반복 캡처 예제에 맞지 않는다 → 선택 기능으로만.

### 3.5 `speech_recognition` shim (SR)

| 필수 API | shim 동작 |
|---|---|
| `sr.Recognizer()` | 빈 객체 |
| `with sr.Microphone() as source:` | 컨텍스트 매니저. 원본은 PyAudio가 없으면 `Microphone` 생성에서 AttributeError(README) → shim은 항상 성공 |
| `r.listen(source, phrase_time_limit=5)` → AudioData | 메인 화면에 "듣는 중" 표시 → 메인 화면 `SpeechRecognition` 세션을 최대 `phrase_time_limit`초 실행 → 인식 문자열을 담은 AudioData 반환(`block_on`) |
| `r.recognize_google(audio, language='ko-KR')` → str | 담긴 문자열 반환. `language`는 `listen` 시점에 알 수 없어 기본 `ko-KR`(설정으로 변경) |
| `sr.UnknownValueError` / `sr.RequestError` | 말이 없음·인식 실패 → UnknownValueError, 네트워크·권한 거부·미지원 → RequestError |
| 글자 입력 모드 | 온디바이스 인식이 안 되고 서버 전송에 동의하지 않았거나 브라우저가 지원하지 않으면, 같은 코드가 입력줄 문장으로 돈다(기본 대안) |

- 연구 결과 반영: `SpeechRecognition`은 `[SecureContext, Exposed=Window]`(워커 불가), `processLocally`·`available()`·`install()`로 온디바이스 인식 요구 가능(Chrome 139+). MDN은 Chrome 등이 서버 인식을 써 음성이 웹 서비스로 전송되고 오프라인에서 안 된다고 안내. Firefox는 142에서 플래그 뒤, Safari는 14.1부터 접두어판. 출처: https://webaudio.github.io/web-speech-api/ , https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition , https://developer.chrome.com/blog/new-in-chrome-139
- 원본 라이브러리: SpeechRecognition 3.17.0, BSD-3-Clause, Python 3.9 이상, 내장 Google API 키는 테스트용이라 가용성 보장 없음(README) → 내려받기판 안내에 적는다. 출처: https://pypi.org/project/SpeechRecognition/
- Claude 결정: 흐름은 ① `available({langs:['ko-KR'], processLocally:true})` 확인 → 가능하면 온디바이스(필요 시 `install`) ② 안 되면 "음성이 브라우저 회사 서버로 전송됩니다" 고지 후 학생이 선택 ③ 기본은 글자 입력 모드. 오프라인 배포판에서는 ③만.

### 3.6 `serial` shim (SER)

| 필수 API | shim 동작 |
|---|---|
| `serial.Serial(port, baudrate)` | 포트 문자열('COM10' 등)은 무시하고, 선택된 대상에 연결: ① 실제 보드 변환기 포트(Web Serial, 실행 전 메인 화면 [포트 연결]로 `requestPort()`, 워커는 `getPorts()`로 받아 `open({baudRate})`) ② 같은 페이지 가상 보드의 UART2 ③ MQTT 토픽. 생성과 동시에 열림 |
| `write(bytes)` | 순서대로 전송(`key.encode('utf-8')`, `b'a'`) |
| `close()` | 포트 닫기 |
| 선택: `timeout`, `readline()` | 자료 코드는 안 씀. 원고 p208 문항 11(`timeout=0.1`, `(msg + '\n').encode()`)을 위해 받기만 |

- 연구 결과 반영(2차 검토에서 갱신): Web Serial은 Chrome·Edge 89+ 데스크톱, Firefox 151+ 데스크톱 기본 지원(2026-05-19 출시, 처음 쓸 때 자동 생성된 사이트 권한 부가기능 설치 확인), Safari 반대 입장. Android Chrome은 138+에서 블루투스 RFCOMM 직렬 포트, Chrome 148 릴리스 노트에 "Web Serial API on Android" 항목이 있고 blink-dev 공지는 비블루투스(유선) 포트를 "Android Serial API가 있는 일부 기기"에서 2026년 2분기부터 지원한다고 적었다(그 API가 없는 기기는 변화 없음). CH340·CP210x 보드가 실제 Android 기기에서 인식되는지는 미확인이고 MDN 호환성 표는 아직 138 부분 지원(RFCOMM만)으로 적어 자료가 엇갈린다 → 점검 페이지는 버전 추정 대신 `navigator.serial` 유무와 실제 포트 선택 결과로 판정한다. `getInfo()`의 USB VID/PID로 칩(CH340 1a86:7523, CP210x 10c4:ea60)을 알아내는 것은 포트가 보일 때의 보조 정보로만 쓴다(드라이버가 없으면 포트가 선택 창에 안 보일 수 있음, PLAN P3-10). 출처: https://developer.chrome.com/docs/capabilities/serial , https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/151 , https://developer.chrome.com/release-notes/148 , https://groups.google.com/a/chromium.org/g/blink-dev/c/yGhvQ6mEmcY , https://chromestatus.com/feature/6043992171085824
- UART 실습(f082~f085)은 포트가 둘이다: 보드 REPL 포트(코드 업로드·실행)와 변환기 포트(데이터). 두 포트를 동시에 열 수 있게 하고 화면에 이름표를 붙인다. 변환기가 없는 학교는 가상 보드 UART2로 연결(Claude 결정).

### 3.7 PC용 `bluetooth`·`bluetooth_lib` 대체 모듈 (BTPC)

원본(f088 계열) 대신 같은 이름의 모듈을 Pyodide에 넣는다. 학생 코드(f089, f100, f104, f114, f138, f140, f141, f158)는 한 줄도 안 바꾼다.

| 필수 API | 원본 동작(사본·매핑 결과) | 대체 모듈 동작 |
|---|---|---|
| `bluetooth.init(address)` / `from bluetooth import init as bluetooth_init` / `bluetooth_lib.init(address)` → 객체 | 생성자에서 `BleakClient(address).connect(timeout=60)`까지 블로킹, 알림 구독 시작. 실패하면 `Failed to connect: …` 출력(그 뒤 멈춤 문제는 f088 비고) | 주소는 무시. 실행 전 [BLE 연결] 버튼으로 연결해 둔 기기에 붙음. 연결 전이면 메인 화면에 연결 버튼을 띄우고 `block_on`으로 기다림. 대상: 실제 ESP32(Web Bluetooth) / 같은 페이지 가상 보드 / (선택) 교실 다른 브라우저 |
| `obj.send(str)` | 연결을 최대 10초 기다린 뒤 `write_gatt_char(RX, data.encode(), response=True)` 완료까지 블로킹, `Sent: …` 출력 | UTF-8로 RX 특성(6E400002)에 `writeValueWithResponse`. **한 번에 하나만 쓰고** 대기 중인 상태 메시지는 최신값으로 병합, 클릭 이벤트가 담긴 메시지(f104·f114의 플래그=1)는 버리지 않는다(§6.5). 출력 문구는 원본 흉내 |
| `obj.connected` | bool | 연결 상태 |
| `obj.disconnect()` | 알림 중지·연결 해제·루프 정지 | `gatt.disconnect()` |
| 알림 수신 | TX(6E400003) 알림을 `print(data.decode(), end='')` | `startNotifications` → 콘솔 |

- Web Bluetooth 연결 규칙(연구 결과 반영): `requestDevice`는 사용자 조작으로만 호출, `ESP32BLE.py` 광고에는 서비스 UUID가 없어 `filters: [{namePrefix: …}]` + `optionalServices: ['6e400001-b5a3-f393-e0a9-e50e24dcca9e']`로 찾는다. Chrome 데스크톱(Windows 10 1703+, macOS, ChromeOS)·Android에서 기본 지원, Linux는 플래그, Firefox·Safari·iOS 미지원. MAC 주소로 직접 연결할 수 없다(명세는 사이트마다 다른 기기 ID를 권고). 출처: https://webbluetoothcg.github.io/web-bluetooth/ , https://github.com/WebBluetoothCG/web-bluetooth/blob/main/implementation-status.md , https://developer.mozilla.org/en-US/docs/Web/API/Bluetooth/requestDevice
- NUS UUID와 속성(RX = Write/Write Without Response, TX = Notify): https://docs.nordicsemi.com/bundle/ncs-latest/page/nrf/libraries/bluetooth/services/nus.html (확인됨). `ESP32BLE.py`의 RX는 `FLAG_WRITE`만 등록하므로 응답 있는 쓰기를 쓴다.
- 동시 쓰기 오류("GATT operation already in progress" 계열)의 정확한 발생 조건은 미확인 → 직렬 큐로 피한다.
- 원본 의존성: bleak MIT, 최신 3.0.2, Python 3.10 이상, 지원 OS Windows 11 22000+·BlueZ 5.55+ Linux·macOS 10.15+·Android(https://github.com/hbldh/bleak). mediapipe 0.10.21 휠(Python 3.9~3.12)과 함께 쓰려면 "진짜 PC" 안내는 **Python 3.10~3.12**로 적는다(Claude 결정, 두 조건의 교집합).

### 3.8 ESP32 가상 보드 mock (VB)

기준 문서: MicroPython ESP32 quickref(최신)와 사이트가 구울 펌웨어 v1.29.0(연구 결과). 원고 캡처의 펌웨어는 v1.25.0이다. mock이 실물보다 관대하면 "가상에서는 되고 실물에서는 안 되는" 코드가 생기므로, 범위 밖 값에는 실물과 같은 예외를 낸다.

#### 3.8.1 `machine`

| 필수 API(자료가 부르는 형태) | mock 동작·가상 부품 | 쓰는 파일(대표) |
|---|---|---|
| `Pin(id, Pin.OUT)` / `Pin(id, Pin.IN)` / `Pin(id)` / `Pin(id, mode=…, pull=None)` / `Pin.init(Pin.OUT, value=0)` | 핀 상태표. 선언 안 한 핀·입력 핀에 쓰기 등은 한국어 배선 경고(SPEC §6.2) | 전부 |
| `pin.on()` `pin.off()` `pin.value(0/1/True/False)` `pin.value()` `pin(v)`(호출형) | LED·레이저·RGB·팬 INA/INB 등 SVG 즉시 반영. 입력 핀 `value()`는 가상 버튼·터치 값, **입력 확인 지점** | f046, f015, f052, f073, f013 |
| `PWM(Pin(n))` / `PWM(Pin(n), freq=50, duty=0)` / `PWM(Pin(n), freq=1000)` / `PWM(Pin(n), duty_u16=0)` / `pwm.init(freq=10, duty=0)` | 채널 상태표. 부품 종류(서보·팬·버저·LED)는 예제 배선 설정으로 해석 | f003, f008, f012, f058, f060, f068 |
| `pwm.freq(hz)` / `pwm.duty(0~1023)` / `pwm.duty_u16(0~65535)` / `pwm.deinit()` | 서보: 50Hz duty → 펄스 폭 → 각도, 팬: duty → 회전 속도, 버저: `freq`·duty → Web Audio 사각파(duty 0 무음, `deinit` 정지), LED: duty → 밝기. 연구 결과 반영: `duty()` 0~1023·`duty_u16()`·주파수 1Hz~40MHz가 현재 quickref에 있음 → 범위 밖 duty는 `ValueError`(원고 오류표 "invalid PWM duty") | f002, f060, f068, f106, f110 |
| `ADC(Pin(32))`, `adc.atten(ADC.ATTN_11DB)`, `adc.width(ADC.WIDTH_12BIT)`, `adc.read()` → 0~4095 | 가상 4채널 아날로그 터치: 버튼 1~4 = 688/1535/2381/3263, 미터치 0(원고 p139, INVENTORY §4.4) + 값 조절 슬라이더. 연구 결과 반영: `width()`·`atten()`은 호환용으로 유지됨, GPIO32는 ADC1 채널 | f058, f059, f066, f072 |
| `SoftI2C(scl=Pin(22), sda=Pin(21), freq=400000)` / `freq` 생략 / `I2C`(import만) | 가상 I2C 버스 + 장치(§3.8.3). 주소에 장치가 없으면 `OSError`(ENODEV) — 원고 오류표 재현 | f047~f058, f099, f105~f115, f144 |
| `i2c.writeto(addr, buf)` / `writeto_mem(addr, reg, buf)` / `readfrom_mem(addr, reg, n)` | LCD 백팩(0x20)·PCA9685(0x40) 장치로 전달 | f011, f005 |
| `UART(2, baudrate=9600, tx=17, rx=16)`(핀 정수) / `UART(2, baudrate=…, tx=Pin(17), rx=Pin(16))`(Pin 객체) / `uart.init(9600, bits=8, parity=None, stop=1)` | 가상 UART 선. 상대: PC 송신 패널, Vision Lab 브릿지, SER, 가상 MP3 모듈 | f001, f007, f070~f072, f082 |
| `uart.write(str/bytes/bytearray)` / `uart.any()` → int / `uart.read()` → bytes 또는 None / `uart.readline()` → bytes 또는 None | 수신 링버퍼. `readline()`은 줄바꿈까지, 없으면 타임아웃 뒤 쌓인 만큼 또는 None(연구 결과 반영: 문서 "타임아웃이면 더 일찍 반환"). 설정 기본값은 사이트가 구울 v1.29.0 ESP32 드라이버와 같게 **115200bps·8N1**(https://github.com/micropython/micropython/blob/v1.29.0/ports/esp32/machine_uart.c 의 `.baud_rate = 115200`, 일반 문서 `init` 시그니처의 9600과 다름. 자료 예제는 모두 속도를 적음). `any()`·`read*`는 **입력 확인 지점** | f001, f007, f082 |
| `RTC()`, `rtc.datetime((y, m, d, wd, h, mi, s, 0))` 설정 / `rtc.datetime()` 읽기 | 가상 시계 기준 | f051 |
| `Timer(0)`, `timer.init(period=100, mode=Timer.PERIODIC, callback=fn)`, `timer.deinit()`, `Timer.PERIODIC` | 가상 시계로 주기 콜백. 입력 확인 지점과 스크립트 종료 뒤 대기 중에도 실행(f098) | f087 계열 |
| `machine.time_pulse_us(pin, level, timeout_us)` | 거리 슬라이더 값(cm × 2 × 29.1µs). 시간 초과면 예외 없이 -2(펄스 시작을 기다리다 초과)·-1(펄스 측정 중 초과)을 돌려준다(MicroPython machine 문서, v1.29.0 `extmod/machine_pulse.c` 확인). 출처: https://docs.micropython.org/en/latest/library/machine.html#machine.time_pulse_us , https://github.com/micropython/micropython/blob/v1.29.0/extmod/machine_pulse.c | f010 |

#### 3.8.2 `time`·`micropython`·`ustruct`·`neopixel`·내장 이름

| 필수 API | mock 동작 |
|---|---|
| `time.sleep(s)` / `from time import sleep` / `sleep_ms(ms)` / `sleep_us(us)` / `ticks_ms()` | 가상 시계(§3.0 규칙 3). CPython `time`에는 `sleep_ms`·`sleep_us`·`ticks_ms`가 없으므로 가상 보드 워커의 `time`은 MicroPython판으로 바꾼다. 선택: `ticks_diff`(자료는 안 씀, f113은 뺄셈) |
| `from micropython import const` | `const(x)` = x |
| `import ustruct` / `import ubluetooth` | `struct`·`bluetooth` 별칭. 연구 결과 반영: u-접두 이름은 아직 지원되지만 앞으로 제거 예고 → 사이트 새 예제는 접두어 없는 이름을 쓰고, 자료 원본의 u-이름도 받아 준다 |
| `neopixel.NeoPixel(Pin(23), 16)`, `np[i] = (r, g, b)`, `np.write()` | 버퍼는 대입 때, 화면은 `write()` 때만 갱신. 튜플 길이·인덱스 오류는 원고 오류표처럼 `ValueError`·`IndexError` |
| `bytes + str` 결합 | MicroPython은 bytes/bytearray에 버퍼 객체(str 포함)를 더할 수 있어 f009가 실물에서는 도는 것으로 추정되지만, CPython에서는 TypeError → mock으로 흉내 내지 않고 f009만 가상 보드용 판을 쓴다(§2.8). **2026-09-17 P3-00에서 v1.29.0 소스로 확인:** 왼쪽이 bytes면 오른쪽을 버퍼 프로토콜로 읽고 str도 버퍼 프로토콜을 가진다(`py/objstr.c`·`py/objstrunicode.c`). 가상 보드가 지킬 나머지 차이(ticks 넘침·epoch·단정밀도 float·errno 번호 등)는 PLAN §8.3 P3-00 차이 표 |

#### 3.8.3 가상 주변장치

| 장치 | 흉내 수준(Claude 결정) | 근거·주의 |
|---|---|---|
| 문자 LCD 16×2 + PCF8574(0x20) | **바이트 수준**: `writeto` 바이트를 E 신호 하강 때 니블로 모아 RS로 명령/문자를 나누고, DDRAM 주소·clear(0x01)·home(0x02)·백라이트·커서를 처리 → 원본 `i2c_lcd.py`를 그대로 돌림 | f105 등의 19자 줄 넘김 덮어쓰기까지 실물과 같아진다. 글자 하나에 `writeto` 8회 이상이라 짧은 sleep은 양보하지 않아야 빠르다 |
| OLED 128×64 | **고수준**: `ssd1306.SSD1306_I2C`·`sh1106.SH1106_I2C` 두 이름의 같은 mock(`fill`, `text`(8×8 글꼴), `pixel`, `show`) → 1비트 캔버스 | 자료에 드라이버 파일이 없고 원고·코드가 다른 이름을 씀(INVENTORY §4.4). 8×8 글꼴은 MicroPython `framebuf` 글꼴을 쓰면 MicroPython 저장소 기본 MIT(해당 파일이 예외 목록에 있는지는 미확인) 또는 자체 제작 |
| MP3 모듈(DFPlayer Mini) | UART 프레임 해석: `0x7E VER LEN CMD FB P1 P2 [체크섬 2바이트] 0xEF`(8·10바이트 모두 허용), 0x03 트랙·0x06 볼륨·0x0D 재생·0x0E 일시정지·0x16 정지 → 트랙 표시 + 자체 제작/CC0 음원 | 연구 결과 반영: 데이터시트 V1.0(9600bps, 체크섬 있는 10바이트, 볼륨 0~30), 0x16은 명령표에 없고 공식 Arduino 라이브러리가 사용. 출처 https://dfimg.dfrobot.com/wiki/20532/DFR0299_mp3-player-module_datasheet_V1.0.pdf , https://github.com/DFRobot/DFRobotDFPlayerMini |
| 서보 | PWM 50Hz duty → 펄스 폭 → 각도. 환산 기준(`servo_library` 40~115 vs `mg90s_servo` 23~124)은 PLAN에서 정함(INVENTORY §4.2) | 같은 각도에 두 라이브러리가 다른 펄스를 보냄. MG90S 사양은 미확인 |
| 버저 | OscillatorNode `square`(50% 듀티) + GainNode, [실행] 클릭 때 AudioContext 생성·`resume()`. 디지털 on/off(f067·f069)는 고정음 | 연구 결과 반영: https://developer.mozilla.org/en-US/docs/Web/API/OscillatorNode/type , https://developer.chrome.com/blog/autoplay . 수동 버저에 DC만 준 실물 소리는 미확인 |
| 4채널 아날로그 터치 | 버튼 1~4 값 + 슬라이더 | §3.8.1 |
| TM1637(선택) | 핀 해독기(시작·정지 조건, LSB부터 8비트, 0x40/0xC0/0x80) | 쓰는 예제 없음 |
| PCA9685(선택) | 레지스터 장치(MODE1·PRESCALE·LEDn) | 쓰는 예제 없음 |
| 스트래핑 핀 경고 | GPIO0·2·5·12·15를 외부 부품에 쓰는 예제(f058, f067~f069, f087 계열 상태 LED, f110·f111·f113·f115 버저, f143·f148)에 "실물 부팅에 영향 줄 수 있음" 안내 | 연구 결과 반영: Espressif GPIO 문서 "GPIO0, GPIO2, GPIO5, GPIO12 (MTDI), and GPIO15 (MTDO) are strapping pins", GPIO16·17은 PSRAM이 있는 모듈에서 쓰지 말 것(원고 보드는 WROOM-32로 보여 해당 없음). https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/peripherals/gpio.html |

### 3.9 ESP32 쪽 BLE mock (VB-BLE)

Claude 결정: **저수준 mock 하나**(`bluetooth`/`ubluetooth` 모듈)를 만들고 그 위에서 `ESP32BLE.py` 원본을 그대로 돌린다. 근거: ① 사본 대조 결과 `ESP32BLE.py`는 광고 이름을 `bytes(self.name, 'utf-8')`로 바꿔 결합하므로 CPython에서도 돈다(3단원 매핑의 "고수준 mock 권장"은 이 사실 확인 전 판단이었다). ② 상태 LED 깜박임·주소 출력까지 실물과 같아진다. ③ f002·f009(`bluetooth.BLE`)도 같은 mock을 쓴다.

| 필수 API | mock 동작 | 근거(연구 결과 반영) |
|---|---|---|
| `BLE()`, `ble.active(True)` | 가상 주변기기 1개 | |
| `ble.irq(handler)` | 이벤트 1(연결: `(conn_handle, addr_type, addr)`), 2(끊김: 같은 모양), 3(쓰기: `(conn_handle, attr_handle)`)을 **입력 확인 지점에서** 호출 | MicroPython bluetooth 문서의 IRQ 상수·데이터 모양 확인 |
| `ble.gatts_register_services(((UUID, ((UUID, flags), (UUID, flags))),))` → `((tx, rx),)` | 핸들 발급. 플래그 `FLAG_READ` 0x0002, `FLAG_WRITE_NO_RESPONSE` 0x0004, `FLAG_WRITE` 0x0008, `FLAG_NOTIFY` 0x0010 | T2 확인 |
| `ble.gatts_read(handle)` → bytes | 마지막으로 쓰인 값. 특성 값 기본 최대 **20바이트**, 넘치면 잘라 저장하고 콘솔 경고(선택: `gatts_set_buffer`) | 문서 "default maximum size of 20 bytes" |
| `ble.gatts_notify(conn_handle, handle, data)` | str·bytes 모두 받음(MicroPython 버퍼 객체) → PC 쪽 BTPC·송신 패널로 전달 | `data`가 None이면 현재 값 전송 |
| `ble.gap_advertise(interval_us, adv_data)` | 광고 시작, adv_data에서 이름(0x09) 추출해 가상 기기 목록에 표시. 간격 값 검사 안 함 | 문서: 간격은 625µs 단위로 내림(`100`은 0이 되지만 실물은 원고 화면상 동작) |
| `ble.config('mac')` → `(addr_type, bytes6)` | 가상 주소(교실에서 겹치지 않게 무작위) | 활성 상태에서만 조회 가능 |
| `bluetooth.UUID(str/int/bytes)`, `bytes(uuid)` | 2/4/16바이트 | f009 `advertising_payload`의 `bytes(uuid)` |

- `ESP32BLE.read()`의 수신 한 칸 덮어쓰기, 루프 안 `sleep`·LCD 갱신 동안 온 메시지 손실은 **원본 그대로 재현**된다(원본 라이브러리를 돌리므로). 교사용 접기에 "클릭 이벤트가 사라지는 이유" 탐구 소재로 적는다.
- 교실 이름 충돌: 모든 보드가 'ESP32'로 광고하면 Web Bluetooth 선택 창에서 구분되지 않는다 → 사이트판 예제의 `init()` 이름을 **보드·자리 번호**(예: `ESP32-07`)로 바꾸도록 안내하고, 학생 이름·학번·출석번호는 넣지 않게 한다(광고 이름은 주변 누구에게나 보임. Claude 결정, §4, PLAN §7.3·§10). 과목 교육과정의 "다른 학생의 네트워크에 연결하지 않도록 지도한다"(인천광역시교육청 게시 교육과정, INVENTORY §9.2)와도 맞는다.
- 출처: https://docs.micropython.org/en/latest/library/bluetooth.html

### 3.10 사이트가 제공하는 MicroPython 라이브러리 (LIB)

| 라이브러리 | 사이트 제공판 | 가상 보드 | 실제 보드 |
|---|---|---|---|
| `i2c_lcd.py` | f011 원본 + MIT 고지 + `move_to` 별칭 1줄(Claude 결정) | 원본 로직 실행(바이트 수준 LCD) | 업로드 |
| `ESP32BLE.py` | f087 원본(주석 유지). 2black0 구현(MIT)과 같은 코드로 판단되면 MIT 고지 추가(§5.2). f111·f113은 사이트판에서 import 한 줄을 `ESP32BLE`로 고치고, `ESP32BLE_LIB` 별칭은 가상 보드에도 두지 않는다(실물에서 안 되는 코드가 가상에서만 돌지 않게, PLAN §6.5와 같음) | 저수준 BLE mock 위 실행 | 업로드 |
| `mg90s_servo.py` / `gorillacell_servo.py` | f012 / f003 원본 | 실행 | 업로드 |
| `servo_library.py` | 원고 p174 스크린숏 20행 복원(운영자 원고, O2) | 실행 | 업로드 |
| `gorillacell_dcmotors.py` | 원고 p169 스크린숏판(PWM 1000Hz, `rotate(direction, speed=100)`, speed 0~100 자름)을 기본으로 복원, 잘린 'ccw'·`stop()`은 같은 규칙으로 채움. f004 디지털판은 보관(§2.2 f075 비고) | 실행 | 업로드 |
| `buzzer.py` | f008에서 `mario` 배열만 지운 사이트판(`# [사이트판] 게임 음악 선율 데이터 제외`, 원래 출처 주석 유지). 예제·설명은 `jingle`·`twinkle`만 | 실행 | 업로드 |
| `ssd1306` / `sh1106` | 가상 보드: 고수준 mock / 실제 보드: micropython-lib `ssd1306` 드라이버(MIT, 연구 결과: ESP32 펌웨어 매니페스트에 없음). SH1106 패널용 드라이버는 출처 미확인 → 실물 보드 테스트 때 결정 | mock | 업로드 또는 `mip` |
| `esp32_ble_util.py` | 원본 보관 + 가상 보드용 판(`name` bytes 변환 1곳) | 가상 보드용 판 | 원본 업로드 |
| `hcsr04.py`·`tm1637.py`·`Library-6.23-pca9685.py`·`Library_fanmotors.py` | 원본(주석·라이선스 유지), 쓰는 예제 없음 | 1차 범위 밖 | 업로드 가능 |
| `neopixel` | 펌웨어 내장(연구 결과: ESP32 매니페스트 포함, v1.29.0 실기기 확인 전) | mock | 내장 |

### 3.11 실제 보드 경로 요구 (RB)

| 요구 | 자료에서 나온 이유 | 브라우저 기술(연구 결과 반영) |
|---|---|---|
| 코드 실행·출력 | 모든 ESP32 예제 | raw REPL: Ctrl-A 진입 → raw-paste(`\x05A\x01`, 창 크기 흐름제어) 또는 코드 + Ctrl-D → `\x04`로 출력·예외 구분. [정지]는 Ctrl-C. https://docs.micropython.org/en/latest/reference/repl.html |
| 라이브러리 업로드 | `i2c_lcd`, `ESP32BLE`, `mg90s_servo`, `servo_library`, `gorillacell_dcmotors`, `buzzer`, `ssd1306` | raw REPL에서 파일 쓰기 코드 실행. SPEC §6.2가 "선택"으로 둔 파일 기능이 자료상 **필수**(예제가 라이브러리를 부름) |
| 저장 이름 | 원고·교안은 `boot.py`(f083, f086, BT), SPEC은 `main.py` | 기본 `main.py`, 교사용 접기에 차이 설명(INVENTORY §4.4). `boot.py`의 무한 루프가 REPL 진입을 막을 때를 대비해 연결 루틴이 Ctrl-C를 여러 번 보냄 |
| 실행 중 `input()` 전달 | f049, f056, f076, f077, f081 | 입력줄 + `\r\n`을 포트로. raw REPL 실행 중 전달되는지는 실기기 확인 필요(미확인) |
| 포트 두 개 | f082~f085(보드 REPL + USB-UART 변환기), f001·f007 | 두 `SerialPort`를 동시에 열고 이름표 |
| 펌웨어 굽기 | 원고는 Thonny로 v1.25.0 설치 | esptool-js 0.6.1(Apache-2.0), 펌웨어 ESP32_GENERIC v1.29.0(1,790,544바이트, 오프셋 0x1000). micropython.org 파일은 CORS 허용 헤더가 없어 저장소에 직접 둔다. https://micropython.org/download/ESP32_GENERIC/ |
| BLE 수업의 PC 역할 | f089·f140·f158 등 | Web Bluetooth(§3.7) |

---

## 4. 브라우저에서 불가능하거나 위험한 것과 대안

### 4.1 불가능한 것

| # | 브라우저에서 안 되는 것 | 해당 파일 | 이유(근거) | 대안 |
|---|---|---|---|---|
| 1 | 실제 마우스 이동·클릭, 키보드 입력, 다른 앱 조작 | f018~f022, f090, f091, f095~f097, f104, f114, f121, f127 | 웹 페이지는 OS 입력을 합성할 수 없다 | 가상 데스크톱 mock(§3.4). 원본은 "진짜 PC에서 돌리기" 내려받기. 실제 PC 원본은 `FAILSAFE=False`(f095~f097, f104) 때문에 멈추기 어렵다는 안내 |
| 2 | 실제 모니터를 조용히 반복 캡처 | f016, f025, f090 | `getDisplayMedia`는 매번 권한 창·사용자 클릭 필요 | 가상 데스크톱 캡처가 기본, 실제 화면 캡처는 선택 기능 |
| 3 | 다른 웹사이트(포털·검색) 열어 자동 입력 | f023, f024 | 교차 출처 제한으로 다른 사이트 페이지를 조작할 수 없고, 화면 모사는 상표·사칭 문제(SPEC §8) | 가상 브라우저 창 + 자체 제작 연습 페이지 |
| 4 | PC용 BLE 라이브러리 `bluetooth.py`(bleak + 스레드 + asyncio 루프) | f088, f102, f107, f116, f139, f142 | Pyodide는 스레드를 지원하지 않고(확인됨) bleak 지원 OS에 브라우저가 없다(확인됨) | 같은 API의 Web Bluetooth 대체 모듈(§3.7), 원본은 내려받기 |
| 5 | MAC 주소로 BLE 기기에 바로 연결 | f089, f100, f104, f114, f138, f140, f141, f158, 원고 p197~198 활동, f098 | Web Bluetooth는 사용자 선택 창으로만 연결하고, 명세는 사이트마다 다른 기기 ID를 권고 | 실행 전 [BLE 연결] 버튼 → 선택 창. 4.1.4 "주소 확인" 차시는 "광고 이름 확인"으로 목표를 바꿔 설명 |
| 6 | 파이썬 음성 인식 사슬(PyAudio 녹음 + `recognize_google` HTTP) | f044, f045 | 네이티브 PyAudio 불가, Pyodide 소켓 비작동(확인됨) | Web Speech API 브리지 또는 글자 입력(§3.5) |
| 7 | 파이썬 `mediapipe` 패키지 | 레거시 API 쓰는 46개 | Pyodide 패키지 목록에 없음(SPEC §3.2), 파이썬 최신판은 `mp.solutions` 자체가 없음(확인됨) | Tasks Vision(JS) + 레거시 흉내 shim(§3.2) |
| 8 | OpenCV 창·카메라 백엔드 | 카메라 예제 전부 | Pyodide 빌드에 GTK·Qt·V4L 없음, `VideoCapture(0)` 장치 접근 불가(확인됨) | CV shim(§3.1) |
| 9 | Windows 전용 글꼴 경로·Microsoft 글꼴 동봉 | f043 | 브라우저 파일시스템에 `C:/Windows/Fonts` 없음, 맑은 고딕 재배포 조건 미확인(SPEC §8 허용 목록 밖) | 글꼴 경로 shim + OFL 한글 글꼴(§3.3) |
| 10 | Android에서 USB로 CH340·CP210x 보드 연결, 모바일에서 실습실 실행 | 실제 보드 경로 전체, JSPI를 쓰는 실행 경로 | Web Serial: Android Chrome 138+는 블루투스 RFCOMM 포트, Chrome 148 이후 "Android Serial API가 있는 일부 기기"에서 유선 포트 지원 공지(대상 기기와 CH340·CP210x 인식 여부 미확인, §3.6). `web-serial-polyfill`은 CDC-ACM만 구현하고 보관 처리됨(확인됨). JSPI: MDN 호환성 표 기준 Android Chrome·WebView·Safari·iOS 미지원(2026-09-15) | "불가"라고 단정하지 않고 `navigator.serial` 유무와 실제 포트 선택 결과로 안내. **iOS·iPadOS·Android 등 JSPI가 없는 기기에서는 텍스트 코드 실행이 안 되므로 SPEC §9 "모바일 가상 보드(간단 조작)"를 그대로 지키지 못한다** → 블록 모드가 만든 코드만 JSPI 없이 도는 "블록 전용 호환 모드"(PLAN PD-27, P3-06 실험)로 간단 조작을 제공하고, 나머지는 제한 모드. SPEC 이탈은 PLAN §3.2에 기록 |
| 11 | Safari·iOS의 Web Serial·Web Bluetooth, Firefox의 Web Bluetooth | 실제 보드·BLE 경로 | WebKit은 Web Serial에 반대 입장, Web Bluetooth는 Chrome 계열만(확인됨) | 기능 감지(`navigator.serial`, `navigator.bluetooth`)로 안내. Firefox 151+ 데스크톱은 Web Serial을 기본 지원(처음 쓸 때 사이트 권한 부가기능 설치 확인, 실험 기능 아님) → JSPI가 필요 없는 실제 보드 탭(raw REPL·펌웨어 굽기)은 Firefox 151+에서도 쓸 수 있게 한다(PLAN PD-28) |
| 12 | HTTPS 페이지에서 `ws://` 연결(교실 PC의 Mosquitto, 보드 WebREPL) | IoT Lab 확장(자료 코드에는 없음) | 보안 컨텍스트 혼합 콘텐츠 제한(WebREPL README), Chrome 142+ 로컬 네트워크 접근 권한 확인(부분 확인) | `http://localhost`로 띄운 오프라인 배포판에서 사용(localhost는 보안 컨텍스트) |
| 13 | MicroPython 실물 의미 그대로의 실행(`bytes + str`, `const`, `sleep_ms`, u-모듈) | f009(실패), 가상 보드 전부(흉내 필요) | 가상 보드는 CPython(Pyodide) 위라 의미 차이가 있다 | mock으로 흉내(§3.8), 흉내가 어려운 f009만 가상 보드용 판. 대안 검토: MicroPython WebAssembly 포트(아래 4.3) |

### 4.2 위험한 것(동작은 하지만 주의)

| # | 위험 | 해당 파일 | 대책 |
|---|---|---|---|
| 1 | **학생 음성이 외부 서버로 전송**(Chrome 기본 인식). 원본 `recognize_google`도 Google로 전송 | f044, f045 | 온디바이스 우선, 전송 전 고지·선택, 기본 글자 입력(§3.5). 오프라인판은 글자 입력만 |
| 2 | **카메라 영상·얼굴 랜드마크** 개인정보 | 영상 예제 전부 | 프레임·랜드마크는 브라우저 메모리 안에서만 처리하고 서버·`localStorage`·공유 링크에 넣지 않는다. 사람을 구별하는 얼굴 인식 기능은 넣지 않는다(개인정보위 생체정보 안내서의 "일반적인 생체정보" 범위 유지, 확인됨). 화면에 "영상은 이 컴퓨터 밖으로 나가지 않아요" 표시 |
| 3 | **MediaPipe 사용 지표 전송**(tasks-vision 1.0.x) | 영상 예제 전부 | 버전 선택은 PLAN. 워커 추론이면 0.10.35 고정이 유리(§3.2.7) |
| 4 | **레이저 계속 켜짐 + 서보가 방향을 바꿈** | f110·f111·f115(끄는 분기가 주석 처리), **f113(끄는 코드가 아예 없음)**, f062·f063·f082·f083 | 실제 보드 수업 안내에 눈 보호 문구. 사이트판(확정, PLAN PD-23): f110·f111·f115는 주석 해제, f113은 끄기 논리를 새로 추가(같은 파일의 LED 타이머 방식으로 마지막 수신 뒤 일정 시간이 지나면 끔, 추가 줄에 `# [사이트판]`) |
| 5 | **스트래핑 핀**(GPIO0·2·5·12·15)에 외부 부품 | f058(12·5), f067~f069(15), f087 계열 상태 LED(12), f110·f111·f113·f115 버저(2), f113(12·5), f143·f148(12·5) | 가상 보드 경고 + 교사용 접기. 한 예제 안의 GPIO12 겹침(f113, f148, f155)은 사이트판에서 핀 변경(INVENTORY §4.4) |
| 6 | **sleep 없는 폴링 루프**가 가상 입력을 못 받음 | f001, f007, f015 | 입력 확인 지점(§3.0) |
| 7 | **매 프레임 BLE 전송**으로 영상 루프 정지·쓰기 충돌 | f089, f104, f114, f140, f158 | 직렬 큐 + 최신값 병합 + 이벤트 보존(§3.7, §6.5) |
| 8 | **프레임 수·픽셀 단위 임계값**이 브라우저에서 다르게 동작 | f032, f033, f035, f037, f042, f043, f095~f097, f104, f121, f140, f157, f158 | 기본 640×480, `cap.get`과 실제 크기 일치, fps 표시, 임계값 `@slider`, "시간 기준으로 바꿔 보기" 과제 |
| 9 | **WASM 성능**: 파이썬 픽셀 3중 루프 | f039 | numpy 벡터 합성 사이트판을 원본과 나란히(실측 후 확정) |
| 10 | **짧은 sleep 반복**으로 실물보다 느려 보임 | f060, f079, f013, f011 | 가상 시계 + 몰아서 양보(§3.0 규칙 3) |
| 11 | **클릭 이벤트 손실**(수신 한 칸 덮어쓰기, 부저·LCD가 루프를 막음) | f105, f106, f109, f110, f111, f115 | 원본 동작으로 재현하고 탐구 소재로. 사이트판 개선 예시는 f113(타이머) |
| 12 | **교실 BLE 이름 충돌**(모두 'ESP32') | `ESP32BLE.init('ESP32')` 쓰는 예제 전부 | 사이트판 수신 예제는 이름을 보드·자리 번호로 바꾸는 줄을 강조(예: `ESP32BLE.init("ESP32-07")`, 학생 이름·학번·출석번호 금지), PC 쪽은 `namePrefix`로 목록 표시 |
| 13 | **공개 MQTT 브로커**(자료에는 없지만 브릿지 확장 시) — 누구나 보고 **누구나 보낼 수도 있다** | IoT Lab | 학습·테스트 전용·개인정보 금지·가동 보장 없음(EMQX·HiveMQ·mosquitto 공식 안내, 확인됨). test.mosquitto.org는 인증 없는 접속자가 모든 토픽에 발행할 수 있고 `#` 한 글자 외의 와일드카드 구독을 허용한다고 적는다(https://test.mosquitto.org/ , 2026-09-15) → 고정 루트 없는 무작위 접두어, "누구나 보고 보낼 수 있어요" 경고, 실제 보드 MQTT 템플릿은 LED·LCD 표시만 받고 허용 명령·길이를 검사, 레이저·모터는 공개 브로커에 연결하지 않음(PLAN §7.4·PD-29), 브로커 주소 설정 한 곳 |
| 14 | **자료에 없는 라이브러리·자산** | f039(mask.png), f043(글꼴), f054~f058(OLED 드라이버), f070~f072(음원), f075~f081(PWM 팬판·`servo_library`), f111·f113(`ESP32BLE_LIB`) | §3.10 사이트 제공판. 이미지·음원은 직접 제작 또는 CC0 |
| 15 | **원본 결함이 그대로 재현됨** | f024, f026, f041, f062, f064, f074, f082, f083, f085, f123, f136 | 원본은 "오류 읽기" 예제로 활용 가능, 사이트 예제는 수정본(§2 비고) |
| 16 | **원고·코드·교안 불일치**가 학생 혼동을 부름 | f026·f030·f031·f032·f033(원고와 소스), f058·f059(구간), f086(주석 핀), f082(TX/RX), f145(반복 여부), f018·f019·f024(슬라이드) | 사이트판 기준은 "파일 기준 + 원고 의도에 맞게 수정"(Claude 결정), 차이는 교사용 접기 |

### 4.3 가상 보드 실행 엔진 대안 — MicroPython WebAssembly 포트 (참고, 미확인 항목 많음)

§4.1 #13의 의미 차이를 줄이는 대안으로, 가상 보드를 Pyodide(CPython) 대신 MicroPython 공식 WebAssembly 포트로 돌리는 방법이 있다.

| 항목 | 확인한 사실 | 상태 |
|---|---|---|
| 존재·사용법 | `ports/webassembly`가 `micropython.mjs` + `micropython.wasm`을 만들고 `loadMicroPython()` → `mp.runPython(...)`, `runPythonAsync`의 최상위 await, `js` 모듈로 JS 호출 | 확인됨(README) |
| 라이선스 | MicroPython 저장소 LICENSE가 "따로 표시가 없으면 저장소 모든 파일에 MIT" | 확인됨 |
| 한계 | README: "MicroPython 실행이 브라우저를 멈추게 한다", **브라우저에서는 인터럽트가 구현되지 않았다**. 워커 실행·`machine` mock에 대한 언급 없음 | 확인됨 |
| 장점(추정) | `bytes + str`, `const`, u-모듈, `sleep_ms` 등 실물 의미가 같아 f009 같은 차이가 사라지고, Pyodide보다 가벼울 가능성 | 추정 → 2026-09-17 일부 확인: 크기는 npm판 `micropython.mjs` 110,120 + `micropython.wasm` 449,553바이트로 작다. 단 웹어셈블리 포트는 배정밀도 float·epoch 1970이라 ESP32(단정밀도·epoch 2000)와의 차이가 다 사라지지는 않는다 |
| 판단 | 정지 버튼(인터럽트 미구현)과 동기 입력 문제를 워커 종료로 풀어야 해 1차 구현 기본값으로는 권하지 않는다. PLAN에서 Phase 3 착수 전 실험 항목으로 둔다(Claude 권장) | — |

출처: https://github.com/micropython/micropython/blob/master/ports/webassembly/README.md

**2026-09-17 P3-00 판정 — PD-04 유지.** v1.29.0 태그 소스로 다시 확인한 결과 npm판(`@micropython/micropython-webassembly-pyscript` 1.29.0-6, PyScript판)에는 JSPI·ASYNCIFY가 없어 `time.sleep`이 바쁜 대기이고(`mphalport.c`), `input()`이 읽을 표준 입력이 없으며(`mphalport.h`), README는 여전히 "브라우저에서는 인터럽트가 구현되지 않았다"고 적는다. JSPI를 더하는 PR(#19594)과 협조적 양보 PR(#19427)은 열려 있으나 병합 전이다. 근거·비교·다시 볼 조건·가상 보드가 지킬 차이 표는 PLAN §8.3 P3-00 구현 메모.

---

## 5. 제3자 코드와 라이선스

### 5.1 처리 원칙

- 운영자 결정 O2~O5에 따라 자료 속 코드는 **모두 사용 가능**하다. 업체 키트·공개 라이브러리 파일의 원래 저작권·라이선스·출처 주석은 지우지 않는다. 아래 확인 상태는 사용 여부 판단이 아니라 **출처 표기(`sources.yaml`)를 정확히 하기 위한 기록**이다.
- 자료 원본은 C1 문구 "운영자 자체 자료(박상진·김석전, 운영자 확인 2026-09-15)"로 등록하되, **§5.2에서 원 출처가 확인된 파일은 운영자 자료 항목의 파일 목록에서 빼고** 원 저작자·라이선스·URL 항목에만 둔다(한 파일이 저작자가 다른 두 항목에 동시에 걸리지 않게, 검사 스크립트가 중복 매칭을 오류로 처리 — PLAN P1-04).
- 운영자 허락(O5)은 사용 허락이지 재라이선스 권한이 아니므로, 원 저작자가 따로 있는 파일은 사이트 라이선스(MIT·CC BY-NC-SA 4.0) 적용에서 뺀다. `LICENSE`·`LICENSE-CONTENT.md`·바닥글에 "`sources.yaml`에 개별 표기된 제3자 자료는 이 라이선스에서 제외" 조항을 둔다(PLAN §9.5·PD-26).
- 라이선스가 요구하는 고지는 지킨다: MIT는 저작권·허가 고지 유지, Apache-2.0은 받는 사람에게 **라이선스 사본을 주고**(4조 (a), 링크만으로는 부족 — 파일과 함께 전문 파일 배포) 변경 표시(변경한 파일에는 변경 주석). 출처: https://www.apache.org/licenses/LICENSE-2.0.txt
- 예외: 코드 안의 개인정보(기기 주소 등)는 자리표시자로 바꾼다. 게임 음악 선율 데이터(`buzzer.py`의 `mario`)는 제3자 권리 대상이라 사이트 배포판에서 배열을 지운다(INVENTORY §8 Claude 결정, SPEC §8 원작 게임 복제 금지, 법률 판단 아님).
- GPL·AGPL 코드는 사이트 코드(MIT)에 복사하지 않는다: BIPES(GPL-3.0), Arduino Lab for MicroPython·`micropython.js`(AGPL-3.0), STEMpedia Dabble 라이브러리(GPL V3 / LGPL-3.0)는 동작 방식만 참고(확인됨).

### 5.2 자료 속 코드의 원 출처·라이선스

| 파일 | 원 출처 | 라이선스 | 확인 상태 | 사이트에서의 처리 |
|---|---|---|---|---|
| f013 `tm1637.py` | mcauser/micropython-tm1637 (Mike Causer, 2016) | MIT(파일에 전문) | **확인됨** | 원본 그대로, 쓰는 예제 없음 |
| f010 `hcsr04.py` | rsc1975/micropython-hcsr04 (Roberto Sánchez, 0.2.0) | Apache-2.0(파일에 표기, 저장소 LICENSE) | **확인됨** | 원본 그대로 + Apache-2.0 전문 파일을 함께 배포하고 출처 페이지에도 전문(LICENSE 파일이 zip에 없음, 4조 (a)) |
| f011 = f103 `i2c_lcd.py` | dhylands/python_lcd의 `lcd_api.py` + ESP8266용 I2C 구현을 합친 수정본(`move_to` → `setcursor`, 기본 주소 주석 처리) | MIT (Copyright (c) 2013 Dave Hylands) | **확인됨**(출처·라이선스). 파일에 MIT 고지 없음 | URL 주석 유지 + MIT 고지 추가 + `move_to` 별칭(변경 주석) |
| f005 `Library-6.23-pca9685.py` | adafruit/micropython-adafruit-pca9685(Radomir Dopieralski, Adafruit, 보관된 저장소)의 `pca9685.py` + `motor.py` 합본, 모터 2개용 핀표와 cw/ccw/stp 추가("Added for Gorillacell") | MIT | **확인됨** | 원본 그대로 + MIT 고지를 출처 페이지에. 쓰는 예제 없음 |
| f009 `esp32_ble_util.py` | micropython/micropython `examples/bluetooth/ble_advertising.py` + `ble_simple_peripheral.py`(demo 삭제) | MIT(저장소 LICENSE가 따로 표시 없는 모든 파일에 적용) | **확인됨** | 원본 보관 + 가상 보드용 판(변경 주석) |
| f087 = f101 = f146 = f153 `ESP32BLE.py` | TechToTinker "025 - ESP32 MicroPython: ESP32 Bluetooth Low Energy"(George Bantique, 2021-08-15)의 `ESP32_BLE` 클래스와 같은 구조, 2black0/MicroPython-ESP32-BLE(Ardy Seto, 2021)와도 거의 같음. 자료본은 GPIO12·`message`/`read()` 추가 | TechToTinker 글: 라이선스 표기 없음 / 2black0: MIT | **부분 확인**(최초 원작자 미확인) | 원본 그대로. 운영자 자료 항목에서 빼고 `sources.yaml`에 두 공개 출처를 "유사 구현"으로 함께 적음. 2black0 구현과 같은 코드로 판단되면 MIT 고지를 파일·출처 페이지에 더하고, 아니면 "원 권리자 보유 — 운영자 사용 허락(O5), 사이트 라이선스 적용 제외" |
| f003 `gorillacell_servo`, f012 = f108 = f117 `mg90s_servo.py` | TechToTinker "037 - MicroPython TechNotes: Servo Motor"(George Bantique, 2021-05-28)의 `GORILLACELL_SERVO`와 같은 코드(duty 23~124) | 라이선스 표기 없음 | 출처 **부분 확인**, 라이선스 **미확인** | 원본 그대로(O5) + 출처 표기. "제3자 권리 표기 자료"로 등록해 사이트 라이선스 적용 제외 |
| f004 `gorillacell_dcmotors`(디지털판) · 원고 p169 PWM판 | TechToTinker "034 - MicroPython TechNotes: DC Motors"(George Bantique, 2021-05-08) 계열. 이 글의 PWM 예제는 `GORILLACELL_DCMOTORS(pinA, pinB)`·500Hz·`rotate(direction='cw', speed=40)`·speed 0~99를 duty로 환산(이 문서 작성 중 확인). f004 디지털판이 이 글의 다른 예제와 같은지는 미확인. 원고판(1000Hz, speed 0~100)은 이를 고친 판으로 보임(추정) | 라이선스 표기 없음(확인) | 출처 **부분 확인**, 라이선스 **미확인** | f004 원본 보관, 사이트 기본은 원고판 복원(§3.10). 출처 표기, f004는 "제3자 권리 표기 자료"로 사이트 라이선스 적용 제외(원고판 복원본은 운영자 원고 기준) |
| f008 `buzzer.py` | TechToTinker "038 - MicroPython TechNotes: Buzzer"(George Bantique, 2021-06-09)의 `GORILLACELL_BUZZER`(음표 상수·`mario`/`jingle`/`twinkle`, `duty()` 사용)를 `duty_u16`으로 고친 판 | 오픈소스 라이선스 표기 확인 못 함 | 출처 **부분 확인**, 라이선스 **미확인** | 사이트 배포판은 `mario` 배열만 지움(원래 출처 주석 유지), 예제·설명은 `jingle`·`twinkle`만. "제3자 권리 표기 자료"로 사이트 라이선스 적용 제외 |
| f006 `Library_fanmotors.py` | 출처 표기 없음 | 미확인 | 미확인 | 운영자 자료(O5)로 등록 |
| f002 `Dabble_tester_v2.py` | 공식 `BLESimplePeripheral`로 STEMpedia Dabble 앱 프레임을 해석(0xFF 시작, 모듈 ID 0x02 등 프로토콜 상수만 사용, 라이브러리 코드 복사 없음) | 파일 표기 없음 / Dabble 라이브러리 GPL V3·LGPL-3.0 | 확인됨(코드 비복사) | 운영자 자료(O5)로 등록 |
| f001, f007, f014, f015 | 출처 표기 없음(업체 키트 테스트 코드로 추정) | 미확인 | 미확인 | 운영자 자료(O5) |
| f088 계열 `bluetooth.py`·`bluetooth_lib.py` (`BLEUARTBridge`) | 원 출처 찾지 못함. bleak(Henrik Blidh) 사용 | 파일: 미확인 / bleak: MIT | 파일 **미확인**, bleak **확인됨** | 내려받기판으로만 제공(O3) |
| `servo_library.py`(원고 p174 스크린숏) | 교과서 원고 | 운영자 원고(O2) | 운영자 확인 | 스크린숏대로 복원 |
| `sh1106.py`(원고 p133 스크린숏, 파일 없음) | 머리 주석 "MicroPython SH1106 OLED driver, I2C interface, Adapted for ESP32/ESP8266", 원 저장소 미확인 | 미확인 | 미확인 | 스크린숏 코드를 옮기지 않고 가상 보드는 mock, 실제 보드 드라이버는 실물 테스트 때 출처가 확인된 판으로 결정 |
| `ssd1306` (f054~f058이 부르지만 파일 없음) | micropython-lib `micropython/drivers/display/ssd1306` | MIT(micropython-lib 기본) | **부분 확인** | 실제 보드용으로 가져올 때 등록 |
| 1단원 MediaPipe 골격(f026, f029, f032, f033, f040~f043), opmp·BT 손 계단 | 레거시 Solutions 공식 예제 구조와 비슷(짧은 관용 코드라 복사 단정 불가) | MediaPipe Apache-2.0 | 추정 | 운영자 자료(O2·O3) |
| f037(MAR), f096·f097·f104(EAR) | EAR 공식을 입에 적용(공개 튜토리얼에 흔함). EAR 개념은 Soukupová·Čech(2016) 논문으로 흔히 알려짐 | 개념(코드 아님) | 추정 | 교사용 접기에 개념 출처로만 |
| f039(알파 합성 루프), f043(PIL 한글 출력) | 널리 퍼진 튜토리얼 패턴 | 미확인 | 추정 | 운영자 자료. 맑은 고딕은 동봉 안 함 |
| f044·f045 | SpeechRecognition README 마이크 예제 구조와 비슷 | 라이브러리 BSD-3-Clause | 라이브러리 **확인됨**, 코드 유래 추정 | 운영자 자료, 내려받기판 안내에 라이브러리 표기 |
| f016~f025 | PyAutoGUI 입문 예제 형태, 슬라이드 표지 '박상진/김석전' | PyAutoGUI BSD | 라이브러리 **확인됨**(PyPI 분류자) | 운영자 자료(O3) |

출처 URL: https://github.com/mcauser/micropython-tm1637 , https://github.com/rsc1975/micropython-hcsr04 , https://github.com/dhylands/python_lcd , https://github.com/adafruit/micropython-adafruit-pca9685 , https://github.com/micropython/micropython/tree/master/examples/bluetooth , https://raw.githubusercontent.com/micropython/micropython/master/LICENSE , https://techtotinker.com/025-esp32-micropython-esp32-bluetooth-low-energy/ , https://github.com/2black0/MicroPython-ESP32-BLE , https://techtotinker.com/037-micropython-technotes-servo-motor/ , https://techtotinker.com/034-micropython-technotes-dc-motors-gear-motor-and-fan-motor/ , https://techtotinker.com/038-micropython-technotes-buzzer/ , https://raw.githubusercontent.com/STEMpedia/Dabble/master/src/ModuleIds.h , https://github.com/hbldh/bleak , https://github.com/micropython/micropython-lib/tree/master/micropython/drivers/display/ssd1306

### 5.3 shim 안에 들어가는 제3자 데이터·규격

| 데이터 | 출처 | 조건 | 처리 |
|---|---|---|---|
| `HAND_CONNECTIONS`, `FACEMESH_TESSELATION`, `POSE_CONNECTIONS` 연결표, `HandLandmark`·`PoseLandmark` 번호표, `DrawingSpec` 기본값 | google-ai-edge/mediapipe 레거시 파이썬 코드 | Apache-2.0 (drawing_utils.py 머리말 "Copyright 2020 The MediaPipe Authors", 확인됨) | shim 파일 머리에 출처·Apache-2.0 고지, `sources.yaml` 등록 |
| Nordic UART Service UUID(6E400001/02/03-B5A3-F393-E0A9-E50E24DCCA9E)와 RX/TX 역할 | Nordic Semiconductor 문서 | 식별자·규격 사실 인용 | 참고 문헌으로 등록 |
| DFPlayer Mini 명령 프레임 | DFRobot 데이터시트 V1.0 | 문서에 라이선스 표기 없음 → 프로토콜 사실만 인용, 문서·그림 복제 금지 | 참고 문헌 |
| Dabble 프레임 상수 | STEMpedia Dabble 헤더 | GPL V3 코드는 복사하지 않음 | 가상 BLE 앱 패널이 f002용 프레임을 만들 때 상수만 사용 |
| 8×8 OLED 글꼴 | MicroPython `framebuf`(쓸 경우) 또는 자체 제작 | MicroPython 저장소 기본 MIT(파일별 예외 여부 미확인) | 쓰기 전 확인 후 등록 |

### 5.4 "진짜 PC에서 돌리기" 내려받기판이 의존하는 패키지

사이트에 넣지 않고 학생 PC에서 설치하는 패키지다. 안내 문서에 버전·라이선스를 적는다.

| 패키지 | 쓰는 파일 | 버전 안내(Claude 결정) | 라이선스 | 상태·출처 |
|---|---|---|---|---|
| mediapipe | 레거시 API 46개 | `mediapipe==0.10.21` 고정(PyPI에서 0.10.21 다음 판은 0.10.30. 파이썬 판의 `mp.solutions` 제거는 협업자 확인, 제거가 시작된 정확한 판은 미확인 — §3.2.7) | Apache-2.0 | 확인됨: https://github.com/google-ai-edge/mediapipe/issues/6192 , https://pypi.org/pypi/mediapipe/json |
| Python | 전부 | 3.10~3.12(mediapipe 0.10.21 휠 3.9~3.12 ∩ bleak 3.x 요구 3.10+) | PSF | 확인된 두 조건의 교집합 |
| bleak | f088 계열을 쓰는 8개 | 최신 3.0.2 기준(원고 캡처는 1.0.1) | MIT | 확인됨: https://github.com/hbldh/bleak |
| pyserial | f084, f085 | 3.5(2020-11 최신) | BSD | 확인됨: https://pypi.org/project/pyserial/ |
| PyAutoGUI | 21개 | 0.9.54(2023-05 최신) | BSD | 확인됨: https://pypi.org/project/PyAutoGUI/ |
| SpeechRecognition (+ PyAudio) | f044, f045 | 3.17.0, Python 3.9+ / PyAudio 0.2.11 이상(README) | BSD-3-Clause / PyAudio 라이선스 미확인 | 확인됨: https://pypi.org/project/SpeechRecognition/ |
| opencv-python, numpy, Pillow | 영상 예제 | 버전 미지정(사이트 Pyodide와 같은 계열 권장: 4.11.0.86 / 2.4.6 / 12.2.0) | Apache-2.0 / BSD 계열 / MIT-CMU | 확인됨(T1) |

### 5.5 `sources.yaml` 등록 후보 (이 매핑과 직접 관련된 것)

아래는 코드 매핑에서 직접 필요해진 항목만 추렸다. 스택 전체(Astro, CodeMirror, Pagefind 등)는 PLAN.md가 정한다. `가져온 날짜`는 실제로 가져올 때 채운다. `category`는 PLAN §9.2의 분류(`operator` 운영자 자료 / `library` 원래 라이선스가 있는 공개 코드 / `third_party` 제3자 권리 표기 자료 / `stack` 실행 구성요소 / `reference` 규격·사실 인용)다. **한 파일은 한 항목에만 걸린다**(검사 스크립트가 중복 매칭을 빌드 오류로 처리, PLAN P1-04). 원 저작자가 따로 있는 16개(f003·f004·f005·f008·f009·f010·f011·f012·f013·f087·f101·f103·f108·f117·f146·f153)는 운영자 자료 항목에서 빼고, 사이트 저장소에서는 `examples/esp32/lib/third-party/`에 모아 경로로도 구분한다(PLAN §2.6).

```yaml
# 원본 자료(DECISIONS C1 문구, 근거 O2·O3·O5) — 원 저작자가 따로 있는 16개 제외, 142개
- name: "교과서 원고 코드·opmp·pyautogui·블루투스 수업 코드"
  category: operator
  author: "박상진·김석전"
  license: "운영자 자체 자료(박상진·김석전, 운영자 확인 2026-09-15) — 사이트 공개 조건은 CC BY-NC-SA 4.0(PLAN PD-26)"
  url: ""
  paths: ["examples/vision/**", "examples/esp32/u*/**", "examples/esp32/lib/*.py"]   # third-party/ 폴더는 걸리지 않음
  use: "examples/ 예제 원문(f001~f158 중 위 16개를 뺀 142개와 그 사이트판), servo_library 복원본(원고 p174). 원고판 dcmotors 복원본은 TechToTinker 계열로 보여(추정) third-party 항목에 둔다"

# 자료 속 공개 라이브러리(원래 라이선스) — 사이트 라이선스 적용 제외
- { name: "micropython-tm1637", category: library, author: "Mike Causer", license: "MIT", url: "https://github.com/mcauser/micropython-tm1637", use: "tm1637.py (f013)" }
- { name: "micropython-hcsr04", category: library, author: "Roberto Sánchez", license: "Apache-2.0 (전문 파일 동봉)", url: "https://github.com/rsc1975/micropython-hcsr04", use: "hcsr04.py (f010)" }
- { name: "python_lcd", category: library, author: "Dave Hylands", license: "MIT", url: "https://github.com/dhylands/python_lcd", use: "i2c_lcd.py 수정본 (f011 = f103, move_to 별칭·MIT 고지 추가)" }
- { name: "micropython-adafruit-pca9685", category: library, author: "Radomir Dopieralski (Adafruit Industries)", license: "MIT", url: "https://github.com/adafruit/micropython-adafruit-pca9685", use: "Library-6.23-pca9685.py (f005)" }
- { name: "MicroPython examples/bluetooth", category: library, author: "MicroPython 기여자", license: "MIT", url: "https://github.com/micropython/micropython/tree/master/examples/bluetooth", use: "esp32_ble_util.py (f009) 원본·가상 보드판" }
- { name: "TechToTinker MicroPython TechNotes (GORILLACELL_SERVO·DCMOTORS·BUZZER, ESP32_BLE)", category: third_party, author: "George Bantique", license: "원 권리자 보유(라이선스 표기 없음) — 운영자 사용 허락(O5), 사이트 CC BY-NC-SA·MIT 적용 제외", url: "https://techtotinker.com/", use: "mg90s_servo.py(f012 = f108 = f117)·gorillacell_servo(f003)·gorillacell_dcmotors 디지털판(f004)·원고판 복원본·buzzer.py 사이트판(f008)·ESP32BLE.py(f087 계열) — 출처 표기" }
- { name: "MicroPython-ESP32-BLE", category: library, author: "Ardy Seto", license: "MIT", url: "https://github.com/2black0/MicroPython-ESP32-BLE", use: "ESP32BLE.py 유사 구현(같은 코드로 판단되면 MIT 고지 추가)" }
- { name: "micropython-lib ssd1306", category: library, author: "micropython-lib 기여자", license: "MIT", url: "https://github.com/micropython/micropython-lib/tree/master/micropython/drivers/display/ssd1306", use: "OLED 예제 실제 보드용(가져올 때)" }

# shim·가상 보드가 담는 데이터·규격
- { name: "MediaPipe 레거시 Solutions 연결표·번호표·그리기 기본값", category: library, author: "The MediaPipe Authors", license: "Apache-2.0", url: "https://github.com/google-ai-edge/mediapipe/blob/v0.10.21/mediapipe/python/solutions/drawing_utils.py", use: "mediapipe 호환 shim" }
- { name: "Nordic UART Service 명세", category: reference, author: "Nordic Semiconductor", license: "규격 사실 인용", url: "https://docs.nordicsemi.com/bundle/ncs-latest/page/nrf/libraries/bluetooth/services/nus.html", use: "BLE 대체 모듈·가상 BLE" }
- { name: "DFPlayer Mini 데이터시트 V1.0", category: reference, author: "DFRobot", license: "표기 없음 — 프로토콜 사실만 인용", url: "https://dfimg.dfrobot.com/wiki/20532/DFR0299_mp3-player-module_datasheet_V1.0.pdf", use: "가상 MP3 모듈" }

# 매핑 때문에 필요한 실행 구성요소(버전은 PLAN에서 확정)
- { name: "Pyodide 314.0.7", category: stack, author: "Pyodide contributors", license: "MPL-2.0", url: "https://github.com/pyodide/pyodide", use: "Vision Lab·가상 보드 파이썬 실행" }
- { name: "opencv-python 4.11.0.86 (Pyodide 빌드, FFmpeg 4.4.1 LGPL-2.1+ 정적 포함)", category: stack, author: "OpenCV team", license: "Apache-2.0 (+ FFmpeg LGPL-2.1-or-later, libjpeg(IJG)·libpng·zlib·libwebp·libtiff·protobuf·ADE 등 휠 구성요소 고지 — 레시피 기준 추정, PLAN §9.4 B)", url: "https://github.com/opencv/opencv-python", use: "cv2 예제" }
- { name: "Pillow 12.2.0 (Pyodide 빌드)", category: stack, author: "Jeffrey A. Clark and contributors", license: "MIT-CMU (+ FreeType·libjpeg(IJG)·libpng·zlib·libwebp·libtiff 고지 — 레시피 기준 추정)", url: "https://python-pillow.github.io", use: "f043, pyautogui screenshot mock" }
- { name: "@mediapipe/tasks-vision", category: stack, author: "The MediaPipe Authors (Google)", license: "Apache-2.0", url: "https://www.npmjs.com/package/@mediapipe/tasks-vision", use: "mediapipe shim 추론" }
- { name: "MediaPipe 모델(hand_landmarker, face_landmarker, pose_landmarker lite/full, blaze_face_short_range)", category: stack, author: "Google", license: "Apache-2.0 (모델 카드)", url: "https://storage.googleapis.com/mediapipe-models/", use: "mediapipe shim 모델(버전 경로 고정, 자체 호스팅)" }
- { name: "Pretendard", category: stack, author: "Kil Hyung-jin", license: "OFL-1.1", url: "https://github.com/orioncactus/pretendard", use: "f043 한글 글꼴 대체" }
- { name: "esptool-js", category: stack, author: "Espressif Systems", license: "Apache-2.0", url: "https://github.com/espressif/esptool-js", use: "실제 보드 펌웨어 굽기" }
- { name: "MicroPython ESP32_GENERIC 펌웨어 v1.29.0", category: stack, author: "Damien P. George 및 기여자", license: "MIT (+ ESP-IDF 등 서드파티 고지)", url: "https://micropython.org/download/ESP32_GENERIC/", use: "실제 보드 펌웨어" }
```

---

## 6. 기기 간 데이터 형식 정리 — AI→피지컬 브릿지 설계 근거

자료에는 Wi-Fi·MQTT·`socket` 코드가 한 줄도 없다(INVENTORY §4.3). 기기 사이 통신은 **UART**, **BLE(Nordic UART Service)**, **보드 REPL 표준입력** 세 가지뿐이다. 코드에 박힌 BLE 주소·COM 포트 값은 적지 않았다.

### 6.1 경로 한눈에 보기

| 경로 | 보내는 쪽 → 받는 쪽 | 물리층·속도 | 내용(바이트) | 끝 문자 | 보내는 때 | 받는 쪽 해석 |
|---|---|---|---|---|---|---|
| U1 | f084(PC) → f082·f083(ESP32) | PC USB → USB-UART 변환기 → UART2, 115200bps, 8N1 | `key.encode('utf-8')` 한 글자: `b'a'`(0x61) 또는 `b'b'`(0x62) | 없음 | 키보드 입력마다 | `uart.any()`이면 `uart.readline().decode().strip()` → 'a' 레이저 켬, 'b' 끔, 그 밖 무시. 응답 없음 |
| U2 | f085(PC) → f082·f083 | U1과 같음 | `b'a'`(얼굴 나타남) / `b'b'`(사라짐) 1바이트 | 없음 | **상태가 바뀔 때만** | U1과 같음 |
| U3 | PC 프로그램(자료에 없음) → f001 | UART2 9600bps(`tx=17, rx=16`) | ASCII '1'~'4'(0x31~0x34) | 없음 | 미정 | `uart.read()`의 **첫 바이트**만: 49 흰색, 50 빨강, 51 초록, 52 파랑 |
| U4 | PC 프로그램(자료에 없음, 파일명 'TM'으로 보아 분류 번호 추정) → f007 | UART2 9600bps | **원시 바이트** 0x01~0x04 | 없음 | 미정 | 첫 바이트 1~4 → 색. 문자 '1'은 무반응 |
| U5 | f001·f007 → PC | UART2 9600bps | `'hello world'` | 없음 | 시작할 때 한 번 | PC 쪽 코드 없음 |
| R1 | PC 콘솔(Thonny 셸) → f049·f056·f076·f077·f081 | 보드 USB REPL(UART0) | 한 줄 문자열('1', '2', '0', 'q', 이름) | Enter | 입력마다 | `input()` → LCD·OLED 출력, 팬·서보 제어 |
| B1 | f138 = f141(PC) → f137 등(ESP32) | BLE NUS: PC가 RX 특성 6E400002에 응답 있는 쓰기 | `'c'` | 없음 | 연결 뒤 한 번, 곧 연결 해제 | `ble.read()` 출력 |
| B2 | f140(PC) → f147·f148·f149(ESP32) | BLE NUS RX 쓰기 | 한 글자: x < 100 → `'a'`, x > 폭-100 → `'b'`, 그 사이 → `'c'` | 없음 | 손이 보이는 **매 프레임** | finger_rgb: a 빨강·c 초록 1초, 그 밖 끔 / finger_lcd: a 'left'·b 'right' 1초 / finger_servo: a 0°·b 180° |
| B3 | f158 = f089(PC) → f157 = f086(ESP32) | BLE NUS RX 쓰기 | `f"{x},{y}"`(검지 끝 카메라 픽셀 정수, 예 `355,152`) | 없음 | 손이 보이는 **매 프레임** | `split(',')` → `int` 2개 → x<100 빨강, y<100 초록, 그 밖 파랑을 1초 켬·1초 끔(약 2초에 1개 소비) |
| B4 | f100(PC) → f099(ESP32) | BLE NUS RX 쓰기 | `DATA,{x},{y}`(코 6번 점, 좌우 반전 뒤 **카메라 픽셀**) | 없음 | 0.5초마다 | `len(parts)==3 and parts[0]=='DATA'` → LCD 'X:… Y:…' |
| B5 | f104 = f114(PC) → f105·f106·f109·f110·f111·f113·f115(ESP32) | BLE NUS RX 쓰기 | `DATA,{mouse_x},{mouse_y},{double_click},{right_click}`(**화면 좌표** 정수, 클릭 플래그는 이벤트 프레임만 1). 최대 예 `DATA,3839,2159,1,1` = 18바이트 | 없음 | 얼굴이 보이는 **매 프레임**(보정 전에는 화면 중앙 좌표) | `len(parts)==5` → LCD, 서보 `map(x, 0, 3840, …)`·`map(y, 0, 2160, …)`, 클릭 플래그 → LED·버저(f113은 2초 유지) |
| B6 | 스마트폰 Dabble 앱(추정) → f002 | BLE NUS(`BLESimplePeripheral`, RX는 쓰기·응답 없는 쓰기 모두) | 이진 프레임: byte0 0xFF, byte1 0x02, byte2 0x01, byte3 0x01, 내용 `[5:-1]`(UTF-8) | 프레임 끝 바이트(뜻 미확인) | 앱 조작마다 | 내용에 '1'/'2'/'3' 포함 → RGB PWM |
| B7 | ESP32 → PC (알림) | BLE NUS TX 특성 6E400003 알림 | `ESP32BLE.send(data)` → `data + '\n'`(연결 핸들 0 고정) / `BLESimplePeripheral.send(data)` | `\n`(ESP32BLE) | 자료 예제에서는 **안 씀** | PC `bluetooth.py`는 `print(data.decode(), end='')` |
| D1 | ESP32 → MP3 모듈(f070~f072) | UART2 9600bps(`tx=Pin(17), rx=Pin(16)`) | `7E FF 06 CMD 00 P1 P2 EF`(체크섬 없음), f070은 뒤에 `00 00`이 붙은 10바이트. 0x03 트랙(P2=번호), 0x06 볼륨(P2=10), 0x16 정지 | 0xEF | 명령마다 | 모듈(데이터시트는 체크섬 있는 10바이트, §3.8.3) |
| D2 | ESP32 → 문자 LCD(I2C 0x20) | SoftI2C 400kHz | PCF8574 1바이트 = 데이터 니블(bit4~7) + 백라이트(bit3) + E(0x04) + RS(0x01) | — | 글자·명령마다(니블 2개 × E 1→0 = `writeto` 4회) | HD44780(§3.8.3) |

### 6.2 받는 쪽 버퍼 방식의 차이 (가상 보드가 그대로 흉내 내야 할 것)

| 받는 쪽 | 버퍼 | 결과 |
|---|---|---|
| `machine.UART` + `readline()`(f082) | 드라이버 링버퍼에 **누적**. 줄바꿈이 없으면 타임아웃 뒤 반환(문서: "may return sooner if a timeout is reached", 확인됨) | 두 글자가 한꺼번에 오면 `'ab'` 한 덩어리 → 조건 불일치로 무시 |
| `machine.UART` + `read()`(f001·f007) | 누적, 한 번에 여러 바이트 반환 가능 | 첫 바이트만 처리, 나머지 버림 |
| `ESP32BLE.read()`(f086·f099·f105~f115·f137·f147~f149·f157) | IRQ 3마다 `self.message`를 **덮어씀**(한 칸), `read()`가 꺼내면 비움. `decode('UTF-8').strip()` | 루프가 `sleep`·LCD 갱신·버저로 막힌 동안 온 값은 마지막 것만 남음 → 클릭 플래그 메시지 손실 가능 |
| `BLESimplePeripheral.on_write`(f002) | 콜백이 전역 변수에 덮어씀 | 100ms 루프가 최신 값만 처리 |
| 특성 값 크기 | MicroPython GATT 특성 기본 최대 **20바이트**(확인됨) | 20바이트를 넘는 문자열은 잘릴 수 있음. 자료 메시지는 모두 20바이트 이하 |
| `input()`(R1) | 줄 단위 | Enter까지 기다림 |

### 6.3 좌표·단위

| 값 | 기준 | 파일 | 주의 |
|---|---|---|---|
| 정규화 좌표 0~1 | MediaPipe 결과 | 모든 영상 예제 | 화면 밖이면 0~1을 벗어날 수 있음 |
| 카메라 픽셀 | `int(x × cap.get(폭))` 또는 `frame.shape` | B2, B3, B4 | 카메라 해상도에 따라 값이 달라 받는 쪽 임계값 100(B2·B3)의 뜻이 바뀜 → CV shim의 `cap.get`과 실제 크기 일치(§3.1) |
| 화면 좌표 | `pyautogui.size()` 기준, 0~size-1로 자름 | B5 | 받는 쪽이 3840×2160을 가정 → 1920×1080 PC면 서보가 절반만 움직임(계산) |
| 서보 duty | `mg90s_servo` 23~124 / `servo_library` 40~115 | f078~f081, f106~f115, f145·f149 | 가상 서보 환산은 PLAN |

### 6.4 자료끼리 어긋나는 규약과 Claude 결정

| 항목 | 자료 | Claude 결정(근거) |
|---|---|---|
| 끝 문자 | 원고 p187 "메시지 끝에 반드시 `\n`", 원고 p208 문항 11 `(msg + '\n').encode()` / 코드 U1·U2·B1~B5는 `\n` 없음 | 브릿지 기본은 **`\n`을 붙인다**. 자료의 텍스트 수신 코드는 모두 `strip()`하거나(ESP32BLE, f082) 첫 바이트만 보므로(f001) 그대로 호환된다(6.5 표). 원본 PC 코드는 수정하지 않고 둔다 |
| 보내는 빈도 | 원고 p187 "변할 때만 보내기·초당 10회 제한" / 코드 B2·B3·B5는 매 프레임 | 브릿지 기본은 **값이 바뀔 때 + 최대 10Hz**. 원본 파일을 돌릴 때는 BTPC가 대기 중 메시지를 최신값으로 병합(이벤트 메시지는 보존) |
| 메시지 머리말 | B3 `x,y`(3단원) / B4·B5 `DATA,…`(4단원) | 두 형식을 모두 지원. 사이트 새 예제는 필드 수를 검사할 수 있는 `DATA,…` 형식을 권장 |
| 문자 vs 원시 바이트 | U3 문자 '1'~'4' / U4 원시 0x01~0x04 | 브릿지에 "텍스트 줄(기본) / 원시 바이트" 선택 |
| UART 속도·핀 | HW 예제·MP3 9600bps `tx=17, rx=16` / 3단원 115200bps `tx=16, rx=17` | 속도는 예제별 원래 값 유지. 핀은 사이트판 `tx=17, rx=16`(INVENTORY §4.4) |
| DATA 좌표 공간 | B4는 카메라 픽셀, B5는 화면 좌표(같은 머리말) | 브릿지 화면에 "좌표 기준: 카메라/화면" 표시. 4.2 예제의 가상 데스크톱 논리 해상도는 3840×2160 |
| 저장 파일 | 원고·교안 `boot.py` / SPEC `main.py` | `main.py` 기본, 차이는 교사용 접기(INVENTORY §4.4) |

### 6.5 AI→피지컬 브릿지 메시지 규약 (사이트용 제안, Claude 결정)

1. **단위:** UTF-8 텍스트 한 줄. 세 가지 모양만 쓴다.
   - 명령 한 글자: `a`, `b`, `c`(B2·U1 호환)
   - 값 목록: `x,y`(B3 호환), 손가락 개수 같은 한 값은 `3`
   - 머리말 + 필드: `DATA,x,y,d,r`(B4·B5 호환), 받는 쪽은 필드 수로 검사
2. **끝 문자:** `\n` 한 개. 받는 쪽은 `strip()`.
3. **길이:** 끝 문자 포함 **20바이트 이하**(MicroPython GATT 기본 버퍼, 확인됨). 넘으면 브릿지가 보내기 전에 경고.
4. **빈도:** 값이 바뀔 때만, 최대 10Hz(원고 p187). **상태 메시지**(좌표, 개수)는 최신값만 남기고, **이벤트 메시지**(클릭=1, 버튼 눌림)는 큐에 보존해 반드시 한 번 보낸다.
5. **같은 문자열을 모든 통로에 싣는다:** Web Serial(변환기 포트 → UART2), Web Bluetooth(NUS RX 응답 있는 쓰기), MQTT 토픽(예: `<고유접두어>/esp32/rx` — 자료에 없는 새 콘텐츠, ESP32 쪽 `umqtt` 템플릿은 새로 작성), 같은 페이지 가상 보드(UART 링버퍼 또는 BLE IRQ 3).
6. **가상 보드 수신 의미는 실물과 같게:** UART 경로는 누적 링버퍼, BLE 경로는 `ESP32BLE.py` 원본을 돌려 한 칸 덮어쓰기(§6.2).
7. **원시 바이트 모드:** U4(f007) 같은 이진 수신 코드용. 끝 문자 없음.

자료의 받는 쪽 코드가 이 규약을 그대로 받는지:

| 받는 쪽 | 규약 메시지 | 결과 |
|---|---|---|
| f082·f083 (`readline().decode().strip()`) | `a\n` | 정상(오히려 타임아웃 없이 즉시 처리) |
| f001 (`read()` 첫 바이트) | `1\n` | 정상(`\n`만 따로 읽히면 10이라 무시) |
| f007 (원시 바이트) | 원시 바이트 모드 `0x03` | 정상 |
| f086·f157 (`split(',')`) | `355,152\n` | 정상(ESP32BLE가 strip) |
| f099 / f105~f115 (필드 수 검사) | `DATA,120,80\n` / `DATA,1920,1080,0,1\n` | 정상 |
| f147·f148·f149 (`== 'a'`) | `a\n` | 정상 |
| f049·f056·f076·f077·f081 (`input()`) | `1\n` | 정상(REPL 줄 입력) |
| f002 (Dabble 이진 프레임) | 해당 없음 | 가상 BLE 앱 패널이 전용 프레임을 만든다 |

근거 URL: https://docs.micropython.org/en/latest/library/bluetooth.html (20바이트·IRQ), https://docs.micropython.org/en/latest/library/machine.UART.html (`readline` 타임아웃), https://docs.nordicsemi.com/bundle/ncs-latest/page/nrf/libraries/bluetooth/services/nus.html (NUS), https://github.com/mqttjs/MQTT.js (브라우저는 ws/wss만)

---

## 부록. 브라우저·실기기에서 확인할 것 (이 문서의 미확인 항목 모음)

| # | 확인할 것 | 관련 | 언제 |
|---|---|---|---|
| 1 | Pyodide `cv2.imshow`·`waitKey`가 shim 없이 어떤 오류를 내는지, `exit` 내장 유무 | §3.1, §3.3 | Phase 2 |
| 2 | Pyodide Pillow `ImageFont.truetype` 실제 동작 | f043 | Phase 2 |
| 3 | MediaPipe Tasks를 Pyodide와 같은 module 워커에서 돌릴 때의 속도·대리 실행(GPU/CPU) | §3.2.7 | Phase 2 |
| 4 | Tasks FaceLandmarker 앞 468점·PoseLandmarker 33점 순서가 레거시와 같은지(몇 점 대조), handedness 좌우 규칙 | §3.2 | Phase 2 |
| 5 | `print(landmark)` 레거시 출력 형식 | f133 | Phase 2 |
| 6 | f039 3중 루프 실제 fps | f039 | Phase 2 |
| 7 | Web Speech 온디바이스 `ko-KR` 가용성·설치 흐름(Chrome, Edge) | f044, f045 | Phase 2 |
| 8 | Web Bluetooth 동시 쓰기 오류 조건, Windows 학교 PC에서 NUS 연결 | §3.7 | Phase 4 |
| 9 | v1.29.0 펌웨어에서 `ubluetooth`, `PWM(…, duty_u16=…)`, `ADC.width`, `neopixel`, `gap_advertise(100, …)` 동작 | §3.8, §3.9 | Phase 3(실기기) |
| 10 | raw REPL 실행 중 `input()`에 줄 전달, `boot.py` 무한 루프 뒤 연결 | §3.11 | Phase 3(실기기) |
| 11 | DFPlayer가 체크섬 없는 8·10바이트 프레임을 받는지, 수동 버저에 DC만 줄 때 소리 | f067, f070~f072 | Phase 3(실기기) |
| 12 | UART2 TX/RX 결선 방향, 스트래핑 핀에 부품을 단 예제의 부팅 | f058, f082, f087 계열 | Phase 3(실기기) |
| 13 | Android Chrome·iPad Safari의 `WebAssembly.Suspending`(JSPI) 유무, Android 기기에서 유선 Web Serial로 CH340·CP210x 보드가 보이는지, Firefox 151+ 데스크톱 Web Serial로 raw REPL이 되는지 | §3.6, §4.1 #10·#11 | Phase 1(점검 페이지)·Phase 3 |
| 14 | 드라이버가 없는 Windows PC에서 보드 포트가 Web Serial 선택 창에 보이는지 | §3.6 | Phase 3(실기기) |
