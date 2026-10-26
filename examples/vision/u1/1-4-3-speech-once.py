# 라이브러리 불러오기
import sounddevice as sd         # sounddevice 라이브러리 불러오기 (마이크로 소리 녹음)
import speech_recognition as sr  # speech_recognition 라이브러리 불러오기

RATE = 16000                     # 1초에 소리를 16000번 기록 (녹음 품질)

# 음성을 입력받고 처리하는 함수 정의
def recognize_voice():
    r = sr.Recognizer()  # 음성 인식 도구 객체 생성

    # 마이크로부터 음성 입력 받기
    print("말씀하세요. (5초 동안 녹음)")  # 사용자에게 입력 안내 메시지 출력
    recording = sd.rec(5 * RATE, samplerate=RATE, channels=1, dtype='int16')  # 5초 동안 녹음 시작
    sd.wait()  # 녹음이 끝날 때까지 기다리기
    audio = sr.AudioData(recording.tobytes(), RATE, 2)  # 녹음한 소리를 음성 인식 도구가 읽는 형식으로 감싸기 (2: 소리 한 칸이 2바이트)

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
