// 영상처리 실습실이 코드 글자만 보고 가르는 것(src/lab/vision/code-uses.ts) — 판 1.1.1 최종 점검.
// numpy·OpenCV를 받는 동안의 안내는 영상을 쓰는 코드에만 "영상이 여기에 나와요"를 붙인다(시리얼만 쓰는 3-1-2 컴퓨터 쪽 코드에는 붙이지 않는다).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { codeShowsVideo } from '../../../src/lab/vision/code-uses.ts';

const example = (relative: string): string => fs.readFileSync(path.join(process.cwd(), 'examples', relative), 'utf8');

describe('codeShowsVideo', () => {
  it('cv2를 쓰는 코드는 영상을 쓴다', () => {
    expect(codeShowsVideo('import cv2\ncap = cv2.VideoCapture(0)\n')).toBe(true);
    expect(codeShowsVideo('import numpy as np, cv2\n')).toBe(true);
    expect(codeShowsVideo(example('vision/first-edge.py'))).toBe(true);
  });

  it('시리얼·바이트만 쓰는 코드는 영상을 쓰지 않는다(주석 속 cv2는 세지 않는다)', () => {
    expect(codeShowsVideo('import serial\n# cv2는 쓰지 않아요\nuart = serial.Serial("COM10", 115200)\n')).toBe(false);
    expect(codeShowsVideo(example('vision/u3/3-1-2-uart-key-send.py'))).toBe(false);
    expect(codeShowsVideo(example('vision/u3/3-1-1-bytes-converter.py'))).toBe(false);
  });
});
