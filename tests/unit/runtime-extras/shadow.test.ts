// 넣는 파일 이름이 파이썬 라이브러리 이름을 가리는지 보는 검사(src/lab/modules/runtime-extras/shadow.ts, P2-10).
// 파이썬 쪽(작업 폴더를 훑는 apc_files.shadowed_files)은 pyodide-runtime-extras.test.ts가 실제 Pyodide로 본다.
import { describe, expect, it } from 'vitest';
import {
  COMMON_LIBRARY_NAMES,
  MAX_UPLOAD_NAME_LENGTH,
  moduleNameOfFile,
  reservedModuleNames,
  sanitizeUploadName,
  shadowRefusedMessage,
  shadowedName,
} from '../../../src/lab/modules/runtime-extras/shadow.ts';
import type { LabModuleManifest } from '../../../src/lab/modules/types.ts';

const fakeManifests: LabModuleManifest[] = [
  { id: 'hands', title: '손', labs: ['vision'], shims: { mediapipe: 'apc_mediapipe' } },
  { id: 'desktop', title: '가상 데스크톱', labs: ['vision'], shims: { pyautogui: 'apc_pyautogui' } },
];

describe('가려질 수 있는 이름', () => {
  it('자주 쓰는 라이브러리·붙박이 흉내(cv2)·모듈 폴더가 덮어쓰는 패키지와 흉내 모듈 이름을 모두 담는다', () => {
    const names = reservedModuleNames(fakeManifests);
    expect(names.has('cv2')).toBe(true); // 붙박이 흉내(BUILTIN_SHIMS)
    expect(names.has('apc_cv2')).toBe(true);
    expect(names.has('apc_runtime')).toBe(true); // 붙박이 파이썬 모듈
    expect(names.has('mediapipe')).toBe(true);
    expect(names.has('apc_pyautogui')).toBe(true);
    expect(names.has('numpy')).toBe(true);
    expect(names.has('time')).toBe(true);
    expect(names.has('my_cv2')).toBe(false);
  });

  it('자주 쓰는 이름 목록에 겹치는 항목이 없다', () => {
    expect(new Set(COMMON_LIBRARY_NAMES).size).toBe(COMMON_LIBRARY_NAMES.length);
  });
});

describe('파일 이름 → 가리는 라이브러리 이름', () => {
  it('.py 파일 이름이 파이썬 모듈 이름 규칙에 맞을 때만 본다', () => {
    expect(moduleNameOfFile('cv2.py')).toBe('cv2');
    expect(moduleNameOfFile('my-code.py')).toBeNull(); // 하이픈은 import할 수 없는 이름
    expect(moduleNameOfFile('2번.py')).toBeNull();
    expect(moduleNameOfFile('cv2.txt')).toBeNull();
  });

  it('라이브러리와 같은 이름이면 그 이름을, 아니면 null을 돌려준다', () => {
    const reserved = reservedModuleNames(fakeManifests);
    expect(shadowedName('cv2.py', reserved)).toBe('cv2');
    expect(shadowedName('mediapipe.py', reserved)).toBe('mediapipe');
    expect(shadowedName('random.py', reserved)).toBe('random');
    expect(shadowedName('my_cv2.py', reserved)).toBeNull();
    expect(shadowedName('mask.png', reserved)).toBeNull();
  });

  it('거절 안내는 왜 안 되는지와 어떻게 하면 되는지를 한국어로 알려 준다', () => {
    const message = shadowRefusedMessage('cv2.py', 'cv2');
    expect(message).toContain('cv2.py');
    expect(message).toContain('import cv2');
    expect(message).toContain('my_cv2.py');
  });
});

describe('넣는 파일 이름 다듬기', () => {
  it('폴더 경로를 떼고 파일 이름만 남긴다(한글 이름은 그대로)', () => {
    expect(sanitizeUploadName('C:\\Users\\<사용자>\\Pictures\\사진.png')).toBe('사진.png');
    expect(sanitizeUploadName('a/b/내 그림.png')).toBe('내 그림.png');
  });

  it('빈 이름·숨김 파일·제어 문자·너무 긴 이름은 받지 않는다', () => {
    expect(sanitizeUploadName('   ')).toBeNull();
    expect(sanitizeUploadName('.gitignore')).toBeNull();
    expect(sanitizeUploadName('..')).toBeNull();
    expect(sanitizeUploadName('나쁜\u0000이름.png')).toBeNull();
    expect(sanitizeUploadName('a:b.png')).toBeNull();
    expect(sanitizeUploadName(`${'가'.repeat(MAX_UPLOAD_NAME_LENGTH + 1)}.png`)).toBeNull();
  });
});
