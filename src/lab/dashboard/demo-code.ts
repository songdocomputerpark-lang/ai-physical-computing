/**
 * 대시보드 옆에서 바로 돌려 볼 **가상 보드 예제**(P4-07). 페이지의 [이 자리에서 가상 보드 열기]와 "두 탭으로" 링크가
 * ESP32 실습실을 이 예제(`?example=`)로 연다 — 학생이 아무것도 베끼지 않아도 값이 흐른다.
 *
 * 2026-09-25 Phase 4 검토 반영: 전에는 코드를 공유 링크(`#code=…`)로 담아 열어서 실습실의 예제 이름·설명이 "첫 실습: 내장 LED 깜빡이기"로
 * 보였고(코드와 다름), 코드도 실물에 그대로 올리면 안 되는 모양이었다(와이파이를 기다리지 않음·깨진 바이트 한 개에 멈춤·접두어 칸 없음).
 * 이제 코드는 예제 파일 `examples/esp32/templates/dashboard-demo.py`(통신 템플릿 4) 하나에 있다 — 고칠 곳이 한 곳이다.
 *
 * 안전(PD-29): 받는 쪽은 ① 20바이트 길이 ② 글자로 바꿀 수 있는지 ③ 허용 목록(`on`·`off`)을 보고, 통과한 것만 **LED 표시**에 쓴다.
 * 레이저·모터처럼 움직이는 장치는 이 코드에 없다. 실물에 올릴 때는 PREFIX 줄을 채워야 사이트가 실제 보드로 보낸다(real-board-guard.ts).
 */
import { COMMAND_TOPIC, VALUE_TOPIC } from './defaults.ts';

/** 보드가 보내는 값 토픽(대시보드 기본 위젯과 같은 이름) */
export const DEMO_VALUE_TOPIC = VALUE_TOPIC;
/** 보드가 받는 명령 토픽 */
export const DEMO_COMMAND_TOPIC = COMMAND_TOPIC;

/** 대시보드 실습용 예제 파일(`examples/` 뒤 경로 — 실습실 `?example=` 규약) */
export const DASHBOARD_DEMO_FILE = 'esp32/templates/dashboard-demo.py';
