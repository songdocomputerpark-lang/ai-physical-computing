# 라이브러리 불러오기
import speech_recognition as sr  

# 인식할 키워드 목록 정의
KEYWORDS = ["시작", "정지", "종료"]

# 현재 프로그램 실행 상태를 저장하는 변수
is_running = False

# 음성을 인식하고 키워드에 따라 프로그램을 제어
def recognize_and_control():
    global is_running  # 함수 안에서 전역 변수 is_running 값을 변경하기 위해 global 선언
    r = sr.Recognizer()  # 음성 인식 도구 객체 생성

    # 마이크로부터 음성 입력받기
    with sr.Microphone() as source:  # 마이크 장치 사용 준비
        if not is_running:
            print("프로그램을 시작하려면 '시작'이라고 말하세요.")  # 실행 전 안내 메시지 출력
        else:
            print("명령어를 말하세요. ('정지' 또는 '종료')")  # 실행 중일 때 안내 메시지 출력

        audio = r.listen(source, phrase_time_limit=5)  # 최대 5초간 음성 입력받기

    try:
        text = r.recognize_google(audio, language='ko-KR')  # 입력된 음성을 한글 텍스트로 변환
        print("인식된 내용:", text)  # 인식 결과 출력

        # 인식된 텍스트에서 키워드 탐지
        for word in KEYWORDS:  # 미리 정의된 키워드 목록을 하나씩 확인
            if word in text:  # 텍스트에 해당 키워드가 포함되어 있는지 확인
                print(f"감지된 키워드: {word}")  # 감지된 키워드 출력

                if word == "시작":
                    if not is_running:
                        print("프로그램이 실행됩니다.")  # 프로그램을 실행 상태로 전환
                        is_running = True
                    else:
                        print("이미 실행 중입니다.")  # 이미 실행 중일 경우 메시지 출력

                elif word == "정지":
                    if is_running:
                        print("프로그램이 일시 정지되었습니다.")  # 프로그램을 정지 상태로 전환
                        is_running = False
                    else:
                        print("이미 정지 상태입니다.")  # 이미 정지 중일 경우 메시지 출력

                elif word == "종료":
                    print("프로그램을 종료합니다.")  # 프로그램 종료 안내
                    return False  # 반복 루프 종료 신호

                break  # 키워드가 하나 감지되면 추가 검사는 생략
        else:
            print("유효한 명령어가 없습니다.")  # 어떤 키워드도 감지되지 않았을 경우 안내 출력

    except sr.UnknownValueError:
        print("음성을 인식할 수 없습니다.")  # 음성이 불명확하거나 인식 실패
    except sr.RequestError:
        print("서버 요청 실패.")  # 구글 서버 접속 오류 등 네트워크 문제 발생

    return True  # '종료' 명령이 없었으면 반복 계속

# 프로그램 실행 루프
if __name__ == "__main__":
    while recognize_and_control():  # recognize_and_control()이 True인 동안 반복
        pass  # 다음 입력 대기