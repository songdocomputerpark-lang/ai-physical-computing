// Web Serial API 타입(SerialPort·SerialOptions·navigator.serial …) — devDependency @types/w3c-web-serial 1.0.8(MIT, 타입 선언만 — 배포 번들에 없음).
// 이 저장소 설정(TypeScript 6.0.3 + astro/tsconfigs/strict)에서는 @types 패키지가 저절로 포함되지 않아 여기서 한 번 불러온다(2026-09-17 astro check로 확인).
// src/ 안의 파일이라 astro check가 함께 읽으므로 실제 보드 연결(P3-07·P3-08)·펌웨어 굽기(P3-09)·모의 시리얼(src/lab/serial/mock/) 어디서든 import 없이 쓴다.
/// <reference types="w3c-web-serial" />
