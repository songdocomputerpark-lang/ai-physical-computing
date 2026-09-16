// 생성한 얼굴·자세 연결표(src/lab/modules/mediapipe/face-connections.ts, apc_mp_tables.py)가 설치된 @mediapipe/tasks-vision와 같은지 대조한다.
// 표는 scripts/gen-landmarks.mjs가 패키지에서 읽어 적는다 — 패키지 판을 올리면 이 검사가 어긋남을 잡고, 스크립트를 다시 돌리면 된다.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FaceLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';
import { FACE_CONNECTIONS, POSE_CONNECTIONS, TABLES_SOURCE_VERSION } from '../../../src/lab/modules/mediapipe/face-connections.ts';

const ROOT = process.cwd();
const pythonTables = fs.readFileSync(path.join(ROOT, 'src/lab/modules/mediapipe/apc_mp_tables.py'), 'utf8');

/** 패키지의 {start, end} 목록 → [[start, end], …] */
const pairs = (list: readonly { start: number; end: number }[]) => list.map((item) => [item.start, item.end]);

/** 생성 파이썬 파일에서 표 하나를 읽는다(frozenset([...]) 안의 (a, b) 쌍) */
function pythonPairs(name: string): number[][] {
  const match = new RegExp(`^${name} = frozenset\\(\\[\\n([\\s\\S]*?)\\n\\]\\)$`, 'mu').exec(pythonTables);
  if (!match) {
    throw new Error(`apc_mp_tables.py에 ${name}이 없어요.`);
  }
  return [...match[1]!.matchAll(/\((\d+), (\d+)\)/gu)].map((pair) => [Number(pair[1]), Number(pair[2])]);
}

const TABLES = [
  ['FACEMESH_TESSELATION', FaceLandmarker.FACE_LANDMARKS_TESSELATION],
  ['FACEMESH_CONTOURS', FaceLandmarker.FACE_LANDMARKS_CONTOURS],
  ['FACEMESH_FACE_OVAL', FaceLandmarker.FACE_LANDMARKS_FACE_OVAL],
  ['FACEMESH_LIPS', FaceLandmarker.FACE_LANDMARKS_LIPS],
  ['FACEMESH_LEFT_EYE', FaceLandmarker.FACE_LANDMARKS_LEFT_EYE],
  ['FACEMESH_LEFT_EYEBROW', FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW],
  ['FACEMESH_LEFT_IRIS', FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS],
  ['FACEMESH_RIGHT_EYE', FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE],
  ['FACEMESH_RIGHT_EYEBROW', FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW],
  ['FACEMESH_RIGHT_IRIS', FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS],
] as const;

describe('얼굴·자세 연결표(생성 파일)', () => {
  it('설치된 @mediapipe/tasks-vision 판을 적어 두었다', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as { dependencies: Record<string, string> };
    expect(TABLES_SOURCE_VERSION).toBe(pkg.dependencies['@mediapipe/tasks-vision']);
    expect(pythonTables).toContain(`@mediapipe/tasks-vision ${TABLES_SOURCE_VERSION}`);
  });

  it.each(TABLES.map(([name]) => name))('%s가 화면·파이썬 양쪽에서 패키지와 같다', (name) => {
    const expected = pairs(TABLES.find(([tableName]) => tableName === name)![1]);
    expect(FACE_CONNECTIONS[name].map(([start, end]) => [start, end])).toEqual(expected);
    expect(pythonPairs(name)).toEqual(expected);
  });

  it('POSE_CONNECTIONS도 같다', () => {
    const expected = pairs(PoseLandmarker.POSE_CONNECTIONS);
    expect(POSE_CONNECTIONS.map(([start, end]) => [start, end])).toEqual(expected);
    expect(pythonPairs('POSE_CONNECTIONS')).toEqual(expected);
  });

  it('눈동자 표는 왼쪽·오른쪽을 합친 것이다', () => {
    expect(FACE_CONNECTIONS.FACEMESH_IRISES.map((pair) => [...pair])).toEqual([
      ...FACE_CONNECTIONS.FACEMESH_LEFT_IRIS.map((pair) => [...pair]),
      ...FACE_CONNECTIONS.FACEMESH_RIGHT_IRIS.map((pair) => [...pair]),
    ]);
  });

  it('레거시와 같은 크기다: 그물 2,556쌍·윤곽 124쌍·자세 35쌍, 점 번호는 0~467', () => {
    expect(FACE_CONNECTIONS.FACEMESH_TESSELATION).toHaveLength(2556);
    expect(FACE_CONNECTIONS.FACEMESH_CONTOURS).toHaveLength(124);
    expect(POSE_CONNECTIONS).toHaveLength(35);
    const nodes = new Set(FACE_CONNECTIONS.FACEMESH_TESSELATION.flatMap(([start, end]) => [start, end]));
    expect(nodes.size).toBe(468);
    expect(Math.min(...nodes)).toBe(0);
    expect(Math.max(...nodes)).toBe(467);
    expect(Math.max(...POSE_CONNECTIONS.flatMap(([start, end]) => [start, end]))).toBe(32);
  });

  it('파이썬 파일이 점 개수(468·478)도 알려 준다', () => {
    expect(pythonTables).toContain('FACEMESH_NUM_LANDMARKS = 468');
    expect(pythonTables).toContain('FACEMESH_NUM_LANDMARKS_WITH_IRISES = 478');
  });
});
