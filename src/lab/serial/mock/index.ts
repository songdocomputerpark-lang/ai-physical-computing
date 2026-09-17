/**
 * 모의 시리얼 도구 모음(병렬 제작 준비 2026-09-17) — 실제 보드 연결(P3-07·P3-08)·펌웨어 굽기(P3-09)·실물 점검 도우미(P3-11) 테스트가 함께 쓴다.
 * 쓰는 법·흉내 범위는 src/lab/README.md 8절. 사이트 페이지는 이 폴더를 import하지 않는다(배포 번들에 들어가지 않음).
 */
export { CTRL_A, CTRL_B, CTRL_C, CTRL_D, CTRL_E, concatBytes, cooked, describeBytes, fromLatin1, latin1, toBytes, utf8 } from './bytes.ts';
export { bootSerialMock, type SerialMockPlugin, type SerialMockPluginContext } from './browser-entry.ts';
export { DEFAULT_SERIAL_MOCK_CONFIG, createSerialMock, createSerialMockController, type SerialMockConfig, type SerialMockController, type SerialMockKit, type SerialMockPortConfig } from './config.ts';
export { EchoDevice, SilentDevice, TextDevice, type SerialDevice, type SerialDeviceIO, type SerialLineSignals } from './device.ts';
export { FakeSerial, installFakeSerial, type FakeSerialOptions, type PortChooser } from './fake-serial.ts';
export { MicroPythonDevice, type BootloaderHandler, type ExecutedVia, type MicroPythonDeviceOptions, type MicroPythonMode, type MockScript, type ProgramContext } from './micropython-device.ts';
export { MockFileSystem } from './mock-fs.ts';
export { DEVICE_LOST_MESSAGE, MockSerialPort, USB_IDS, type MockSerialPortOptions } from './mock-port.ts';
export { PyException, formatTraceback, parseMiniPython, runMiniPython, type MiniPythonHost } from './mini-python.ts';
