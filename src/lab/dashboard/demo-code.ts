/**
 * 대시보드 옆에서 바로 돌려 볼 **가상 보드 예제 코드**(P4-07). 페이지의 [이 자리에서 가상 보드 열기]가
 * 이 코드를 공유 링크(`#code=…`)에 담아 ESP32 실습실을 연다 — 학생이 아무것도 베끼지 않아도 값이 흐른다.
 *
 * 안전(PD-29): 받는 쪽은 ① 20바이트 길이 ② 허용 목록(`on`·`off`)을 보고, 통과한 것만 **LED 표시**에 쓴다.
 * 레이저·모터처럼 움직이는 장치는 이 코드에 없다.
 *
 * 같은 일을 하는 교과서용 템플릿은 `examples/esp32/templates/mqtt-pub-sub.py`다(P4-10). 이 코드는 대시보드 설명에
 * 맞춰 값이 0~100 사이를 오르내리게 줄인 것이라 그래프·게이지 눈금과 바로 맞는다.
 */
import { COMMAND_TOPIC, VALUE_TOPIC } from './defaults.ts';

/** 보드가 보내는 값 토픽(대시보드 기본 위젯과 같은 이름) */
export const DEMO_VALUE_TOPIC = VALUE_TOPIC;
/** 보드가 받는 명령 토픽 */
export const DEMO_COMMAND_TOPIC = COMMAND_TOPIC;

/** 대시보드 실습용 MicroPython 코드(실물 보드에 그대로 올려도 되는 모양) */
export const DASHBOARD_DEMO_CODE = [
  '# 대시보드 실습: 보드가 값을 보내고, 대시보드 스위치로 LED를 켜요',
  '# 토픽은 짧게 적어요 — 우리 반 접두어는 사이트가 앞에 붙여요.',
  'from machine import Pin',
  'from umqtt.simple import MQTTClient',
  'import network',
  'import time',
  '',
  'DEVICE = "esp32-01"',
  'ALLOW = ("on", "off")  # 이 말만 받아요(PD-29 허용 목록)',
  '',
  'wlan = network.WLAN(network.STA_IF)',
  'wlan.active(True)',
  'wlan.connect("classroom-wifi", "1234")',
  '',
  'led = Pin(2, Pin.OUT)  # 받은 명령으로 켜는 것은 LED 같은 표시 장치만',
  '',
  '',
  'def on_message(topic, msg):',
  '    if len(msg) > 20:',
  '        print("무시했어요(너무 긴 메시지)")',
  '        return',
  '    text = msg.decode().strip()',
  '    if text not in ALLOW:',
  '        print("무시했어요(허용 목록에 없어요):", text)',
  '        return',
  '    led.value(1 if text == "on" else 0)',
  '    print("받음:", text)',
  '',
  '',
  'client = MQTTClient(DEVICE, "broker.emqx.io")',
  'client.set_callback(on_message)',
  'client.connect()',
  'client.subscribe(DEVICE + "/rx")',
  'print("준비 끝")',
  '',
  'value = 0',
  'step = 5',
  'while True:',
  '    value = value + step',
  '    if value >= 100 or value <= 0:',
  '        step = -step',
  '    client.publish(DEVICE + "/tx", str(value))  # 대시보드 그래프·게이지가 보는 값',
  '    client.check_msg()',
  '    time.sleep(0.3)',
].join('\n');
