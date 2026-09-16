# 라이브러리 불러오기
import speech_recognition as sr  # speech_recognition 라이브러리 불러오기

# 음성을 입력받고 처리하는 함수 정의
def recognize_voice():
    r = sr.Recognizer()  # 음성 인식 도구 객체 생성

    # 마이크로부터 음성 입력 받기
    with sr.Microphone() as source:  # 마이크 장치 사용 준비
        print("말씀하세요. (5초 이내)")  # 사용자에게 입력 안내 메시지 출력
        audio = r.listen(source, phrase_time_limit=5)  # 최대 5초간 음성 입력 받기
        
    # 녹음한 음성을 텍스트로 변환하고 결과 출력
    try:
        # 입력된 음성을 텍스트로 변환
        text = r.recognize_google(audio, language='ko-KR')  # 구글 STT 엔진으로 음성 인식 (한글 설정)
        print("인식된 내용:", text)  # 인식된 텍스트 출력
        
    # 음성 인식 실패 또는 서버 오류 처리
    except sr.UnknownValueError:
        print("음성을 인식할 수 없습니다.")  # 말을 제대로 알아듣지 못한 경우
    except sr.RequestError:
        print("서버 요청 실패.")  # 네트워크 또는 서버 오류

# 프로그램 실행
if __name__ == "__main__":
    recognize_voice()  # 음성 인식 함수 실행