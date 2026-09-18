// 예제 갤러리(P4-11)가 파일 자리·코드에서 저절로 읽어 내는 태그 — src/lab/gallery/infer.ts
import { describe, expect, it } from 'vitest';
import { commKindsFromCode, commRuleReasons, unitFromExampleFile } from '../../../src/lab/gallery/infer.ts';

describe('폴더 이름에서 대단원 읽기', () => {
  it('examples/<실습실>/u1~u4/ 폴더면 그 번호를 돌려준다', () => {
    expect(unitFromExampleFile('vision/u1/1-2-1-webcam-flip.py')).toBe(1);
    expect(unitFromExampleFile('esp32/u2/2-1-1-touch-led.py')).toBe(2);
    expect(unitFromExampleFile('esp32/u3/3-1-2-uart-laser.py')).toBe(3);
    expect(unitFromExampleFile('vision/u4/4-2-1-face-mouse-ble-tx.py')).toBe(4);
  });

  it('보충·교안·부품 시험 코드처럼 단원 폴더가 아니면 붙이지 않는다', () => {
    expect(unitFromExampleFile('vision/supplement/v1-pixel-numbers.py')).toBeNull();
    expect(unitFromExampleFile('vision/opmp/10-both.py')).toBeNull();
    expect(unitFromExampleFile('esp32/bt/b5-lcd-hello.py')).toBeNull();
    expect(unitFromExampleFile('esp32/hw/uart2-rgb-text.py')).toBeNull();
    expect(unitFromExampleFile('desktop/01-screen-size.py')).toBeNull();
    expect(unitFromExampleFile('vision/first-edge.py')).toBeNull();
  });

  it('u5처럼 없는 단원과 파일 이름 속 u2는 읽지 않는다', () => {
    expect(unitFromExampleFile('vision/u5/a.py')).toBeNull();
    expect(unitFromExampleFile('esp32/u2-2-1-led.py')).toBeNull();
  });
});

describe('코드가 부르는 모듈에서 통신 방식 읽기', () => {
  it('컴퓨터 쪽 pyserial과 보드 쪽 machine.UART를 시리얼로 본다', () => {
    expect(commKindsFromCode('import serial\nport = serial.Serial("COM3", 115200)\n')).toEqual(['uart']);
    expect(commKindsFromCode('from machine import Pin, UART\nuart = UART(2)\n')).toEqual(['uart']);
    expect(commKindsFromCode('from serial import Serial\n')).toEqual(['uart']);
  });

  it('블루투스 모듈은 컴퓨터 쪽·보드 쪽 이름을 모두 알아본다', () => {
    expect(commKindsFromCode('import ubluetooth\n')).toEqual(['ble']);
    expect(commKindsFromCode('import ESP32BLE\n')).toEqual(['ble']);
    expect(commKindsFromCode('import ESP32BLE_LIB\n')).toEqual(['ble']);
    expect(commKindsFromCode('import time, bluetooth  #블루투스 라이브러리 호출\n')).toEqual(['ble']);
    expect(commKindsFromCode('from bleak import BleakClient\n')).toEqual(['ble']);
  });

  it('와이파이·MQTT·탭 통로도 import 줄로 알아본다', () => {
    expect(commKindsFromCode('import network\n')).toEqual(['wifi']);
    expect(commKindsFromCode('from umqtt.simple import MQTTClient\n')).toEqual(['mqtt']);
    expect(commKindsFromCode('import bridge\n')).toEqual(['tab']);
  });

  it('여러 가지를 쓰면 정해진 차례로 모두 돌려준다', () => {
    const code = 'import network\nfrom umqtt.simple import MQTTClient\nfrom machine import UART\n';
    expect(commKindsFromCode(code)).toEqual(['uart', 'wifi', 'mqtt']);
  });

  it('통신을 쓰지 않으면 빈 목록이다(“없음” 같은 값을 만들지 않는다)', () => {
    expect(commKindsFromCode('import cv2\nimport mediapipe as mp\n')).toEqual([]);
    expect(commKindsFromCode('from machine import Pin\nled = Pin(2, Pin.OUT)\n')).toEqual([]);
  });

  it('주석이나 글자 안에 낱말이 있다고 붙이지 않는다', () => {
    expect(commKindsFromCode('# 블루투스(bluetooth)로 보낼 값을 만들어요\nprint("import serial 처럼 보이는 글자")\n')).toEqual([]);
    expect(commKindsFromCode('name = "network"\n')).toEqual([]);
  });

  it('규칙마다 왜 확실한지 적어 둔다(문서·검토용)', () => {
    const reasons = commRuleReasons();
    expect(Object.keys(reasons).sort()).toEqual(['ble', 'mqtt', 'tab', 'uart', 'wifi']);
    for (const why of Object.values(reasons)) {
      expect(why.length).toBeGreaterThan(0);
    }
  });
});
