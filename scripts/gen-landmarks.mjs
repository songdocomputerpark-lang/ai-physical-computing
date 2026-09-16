// 합성 랜드마크(손·얼굴·자세) 데이터와 MediaPipe 연결표를 만드는 생성기(PLAN §8.2 P2-08·P2-09, PD-30 "코드로 만든 좌표 시퀀스").
//
// 만드는 것 네 가지:
//   1. tests/fixtures/landmarks/hands.json — 합성 손 좌표 전체(단위 테스트가 src/lab/modules/mediapipe/synthetic-hands.ts와 바이트 대조)
//   2. tests/fixtures/landmarks/face-pose.json — 합성 얼굴·자세의 **간추린 기록**(예제가 쓰는 번호만 몇 장씩 + 합계 지문).
//      얼굴은 한 장이 478점이라 전체를 적으면 수 MB가 되므로 간추린다(Node 테스트는 synthetic-face.ts를 바로 불러 쓴다).
//   3. src/lab/modules/mediapipe/face-connections.ts — 화면 쪽이 쓰는 얼굴·자세 연결표(TS, 압축 문자열)
//   4. src/lab/modules/mediapipe/apc_mp_tables.py — 파이썬 흉내 모듈이 쓰는 레거시 이름의 연결표(FACEMESH_*, POSE_CONNECTIONS)
//
// 3·4의 연결표는 **설치된 @mediapipe/tasks-vision 패키지**(node_modules, Apache-2.0)에서 그대로 읽는다. 사람 얼굴을 찍은 데이터가 아니라
// 얼굴 그물의 "몇 번 점과 몇 번 점을 잇는가" 표다. 레거시 mp.solutions의 FACEMESH_*와 같은 데이터이며 고지는 apc_mediapipe.py 머리말에 있다.
// 어긋남은 tests/unit/mediapipe/connections.test.ts가 매번 패키지와 다시 대조해서 잡는다(패키지 판을 올리면 이 스크립트를 다시 돌린다).
//
//   node scripts/gen-landmarks.mjs            # 넷 다 만든다
//   node scripts/gen-landmarks.mjs 다른경로.json   # 손 좌표 픽스처만 다른 곳에
//
// Node.js 24는 .ts를 타입만 지우고 실행하므로 빌드 없이 돈다. 사람을 찍은 데이터는 들어 있지 않다(PD-30 — 커밋 가능).
import fs from 'node:fs';

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { HAND_CONNECTIONS, SEQUENCE_FPS, SYNTHETIC_HANDS_VERSION, generateHandSequences } from '../src/lab/modules/mediapipe/synthetic-hands.ts';

const rootDir = fileURLToPath(new URL('..', import.meta.url));

/** 기본 출력 경로(저장소 뿌리 기준) */
export const DEFAULT_OUTPUT = path.join('tests', 'fixtures', 'landmarks', 'hands.json');

/**
 * @typedef {{ index: number, score: number, label: string }} FixtureHandedness
 * @typedef {{ handedness: FixtureHandedness, landmarks: number[][] }} FixtureHand
 * @typedef {{ hands: FixtureHand[] }} FixtureFrame
 * @typedef {{ id: string, label: string, description: string, fps: number, frames: FixtureFrame[] }} FixtureSequence
 * @typedef {{ version: number, generator: string, note: string, fps: number, connections: number[][], sequences: FixtureSequence[] }} LandmarksFixture
 */

/**
 * 픽스처 객체를 만든다(JSON.stringify 전).
 * @returns {LandmarksFixture}
 */
export function buildLandmarksFixture() {
  return {
    version: SYNTHETIC_HANDS_VERSION,
    generator: 'scripts/gen-landmarks.mjs',
    note: '코드로 계산한 합성 손 좌표(사람 손 촬영 데이터 아님, PD-30). x·y 0~1, z 손목 기준. 고치려면 synthetic-hands.ts를 바꾸고 스크립트를 다시 돌려요.',
    fps: SEQUENCE_FPS,
    connections: HAND_CONNECTIONS.map(([a, b]) => [a, b]),
    sequences: generateHandSequences().map((sequence) => ({
      id: sequence.id,
      label: sequence.label,
      description: sequence.description,
      fps: sequence.fps,
      frames: sequence.frames.map((frame) => ({
        hands: frame.hands.map((hand) => ({ handedness: hand.handedness, landmarks: hand.landmarks.map((point) => [...point]) })),
      })),
    })),
  };
}

/** 한 장을 한 줄로 적어 diff가 읽히게 한다(들여쓰기 전체는 너무 길고, 한 줄은 비교가 어렵다). */
export function stringifyFixture(fixture) {
  const head = { ...fixture, sequences: undefined };
  const lines = [];
  lines.push('{');
  for (const [key, value] of Object.entries(head)) {
    if (value !== undefined) {
      lines.push(`  ${JSON.stringify(key)}: ${JSON.stringify(value)},`);
    }
  }
  lines.push('  "sequences": [');
  fixture.sequences.forEach((sequence, sequenceIndex) => {
    lines.push('    {');
    for (const key of ['id', 'label', 'description', 'fps']) {
      lines.push(`      ${JSON.stringify(key)}: ${JSON.stringify(sequence[key])},`);
    }
    lines.push('      "frames": [');
    sequence.frames.forEach((frame, frameIndex) => {
      lines.push(`        ${JSON.stringify(frame)}${frameIndex < sequence.frames.length - 1 ? ',' : ''}`);
    });
    lines.push('      ]');
    lines.push(`    }${sequenceIndex < fixture.sequences.length - 1 ? ',' : ''}`);
  });
  lines.push('  ]');
  lines.push('}');
  return `${lines.join('\n')}\n`;
}

export function writeLandmarksFixture(outputPath = path.join(rootDir, DEFAULT_OUTPUT)) {
  const text = stringifyFixture(buildLandmarksFixture());
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, text, 'utf8');
  return { path: outputPath, bytes: Buffer.byteLength(text, 'utf8') };
}

// ── MediaPipe 연결표(설치된 @mediapipe/tasks-vision에서 읽어 TS·파이썬 파일로) ──

/** 생성 파일 경로(저장소 뿌리 기준) */
export const CONNECTIONS_TS = path.join('src', 'lab', 'modules', 'mediapipe', 'face-connections.ts');
export const CONNECTIONS_PY = path.join('src', 'lab', 'modules', 'mediapipe', 'apc_mp_tables.py');
export const FACE_POSE_FIXTURE = path.join('tests', 'fixtures', 'landmarks', 'face-pose.json');

/** 레거시 mp.solutions 이름 → Tasks Vision의 상수 이름(같은 데이터) */
const FACE_TABLES = Object.freeze({
  FACEMESH_TESSELATION: 'FACE_LANDMARKS_TESSELATION',
  FACEMESH_CONTOURS: 'FACE_LANDMARKS_CONTOURS',
  FACEMESH_FACE_OVAL: 'FACE_LANDMARKS_FACE_OVAL',
  FACEMESH_LIPS: 'FACE_LANDMARKS_LIPS',
  FACEMESH_LEFT_EYE: 'FACE_LANDMARKS_LEFT_EYE',
  FACEMESH_LEFT_EYEBROW: 'FACE_LANDMARKS_LEFT_EYEBROW',
  FACEMESH_LEFT_IRIS: 'FACE_LANDMARKS_LEFT_IRIS',
  FACEMESH_RIGHT_EYE: 'FACE_LANDMARKS_RIGHT_EYE',
  FACEMESH_RIGHT_EYEBROW: 'FACE_LANDMARKS_RIGHT_EYEBROW',
  FACEMESH_RIGHT_IRIS: 'FACE_LANDMARKS_RIGHT_IRIS',
});

/**
 * 설치된 @mediapipe/tasks-vision에서 얼굴·자세 연결표를 읽는다.
 * @returns {Promise<{ version: string, face: Record<string, number[][]>, pose: number[][] }>}
 */
export async function readMediaPipeTables() {
  // package.json은 exports에 없어서 require.resolve로 못 찾는다 → 폴더 경로로 직접 읽는다.
  const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'node_modules', '@mediapipe', 'tasks-vision', 'package.json'), 'utf8'));
  const vision = await import('@mediapipe/tasks-vision');
  /** @param {{start:number,end:number}[]} list */
  const pairs = (list) => list.map((item) => [item.start, item.end]);
  /** @type {Record<string, number[][]>} */
  const face = {};
  for (const [legacy, tasks] of Object.entries(FACE_TABLES)) {
    const table = vision.FaceLandmarker[tasks];
    if (!Array.isArray(table) || table.length === 0) {
      throw new Error(`@mediapipe/tasks-vision에 ${tasks}가 없어요(판이 바뀌었나요?).`);
    }
    face[legacy] = pairs(table);
  }
  face.FACEMESH_IRISES = [...face.FACEMESH_LEFT_IRIS, ...face.FACEMESH_RIGHT_IRIS];
  return { version: String(packageJson.version), face, pose: pairs(vision.PoseLandmarker.POSE_CONNECTIONS) };
}

/** 연결표를 짧은 글자로(파일 크기·읽기 속도): "127-34,34-139" */
export function encodePairs(pairs) {
  return pairs.map(([start, end]) => `${start}-${end}`).join(',');
}

/** 파이썬 튜플 목록(한 줄에 6쌍) */
function pythonPairs(pairs, indent = '    ') {
  const lines = [];
  for (let index = 0; index < pairs.length; index += 6) {
    lines.push(indent + pairs.slice(index, index + 6).map(([start, end]) => `(${start}, ${end})`).join(', ') + ',');
  }
  return lines.join('\n');
}

const GENERATED_NOTE = '이 파일은 scripts/gen-landmarks.mjs가 만든다 — 직접 고치지 말고 스크립트를 다시 돌린다.';

/** 화면 쪽(TS) 연결표 파일 내용 */
export function buildConnectionsTs(tables) {
  const entry = (name, pairs) => `  ${name}: decode('${encodePairs(pairs)}'),`;
  return `/**
 * 얼굴·자세 연결표(MediaPipe 규격) — ${GENERATED_NOTE}
 *
 * 출처: @mediapipe/tasks-vision ${tables.version}의 FaceLandmarker.FACE_LANDMARKS_*·PoseLandmarker.POSE_CONNECTIONS
 * (Copyright The MediaPipe Authors, Apache License 2.0 — 고지 전문 public/licenses/mediapipe-tasks-vision.txt, 출처 항목 sources.yaml).
 * 같은 데이터를 파이썬 쪽은 apc_mp_tables.py로, 화면 쪽은 이 파일로 쓴다. 무거운 tasks-vision 번들을 화면에서 불러오지 않으려고 표만 옮겨 적는다.
 * 어긋남은 tests/unit/mediapipe/connections.test.ts가 패키지와 다시 대조해 잡는다.
 */

/** "127-34,34-139" → [[127, 34], [34, 139]] */
function decode(text: string): readonly (readonly [number, number])[] {
  return Object.freeze(
    text.split(',').map((pair) => {
      const [start, end] = pair.split('-');
      return Object.freeze([Number(start), Number(end)] as [number, number]);
    }),
  );
}

/** 이 표를 만든 @mediapipe/tasks-vision 판(단위 테스트가 package.json과 대조) */
export const TABLES_SOURCE_VERSION = '${tables.version}';

/** 얼굴 그물 연결표(레거시 mp.solutions.face_mesh의 이름 그대로) */
export const FACE_CONNECTIONS = Object.freeze({
${Object.entries(tables.face).map(([name, pairs]) => entry(name, pairs)).join('\n')}
});

/** 자세 33점 연결표(레거시 mp.solutions.pose.POSE_CONNECTIONS) */
export const POSE_CONNECTIONS: readonly (readonly [number, number])[] = decode('${encodePairs(tables.pose)}');
`;
}

/** 파이썬 쪽 연결표 파일 내용 */
export function buildConnectionsPy(tables) {
  const block = (name, pairs) => `${name} = frozenset([\n${pythonPairs(pairs)}\n])`;
  return `"""얼굴·자세 연결표(MediaPipe 규격) — ${GENERATED_NOTE}

출처: @mediapipe/tasks-vision ${tables.version}의 FaceLandmarker.FACE_LANDMARKS_*·PoseLandmarker.POSE_CONNECTIONS를 그대로 옮겼다
(Copyright The MediaPipe Authors, Apache License 2.0 — 고지 전문 public/licenses/mediapipe-tasks-vision.txt, 출처 항목은 sources.yaml).
레거시 mediapipe 파이썬 판의 FACEMESH_*·POSE_CONNECTIONS와 같은 데이터이고 이름도 같다. apc_mediapipe.py가 이 표를 학생 코드에 내보낸다.
"""

FACEMESH_NUM_LANDMARKS = 468
FACEMESH_NUM_LANDMARKS_WITH_IRISES = 478

${Object.entries(tables.face).map(([name, pairs]) => block(name, pairs)).join('\n\n')}

${block('POSE_CONNECTIONS', tables.pose)}
`;
}

/** 연결표 두 파일을 쓴다. */
export async function writeConnectionFiles() {
  const tables = await readMediaPipeTables();
  const written = [];
  for (const [relative, text] of [
    [CONNECTIONS_TS, buildConnectionsTs(tables)],
    [CONNECTIONS_PY, buildConnectionsPy(tables)],
  ]) {
    const target = path.join(rootDir, relative);
    fs.writeFileSync(target, text, 'utf8');
    written.push({ path: target, bytes: Buffer.byteLength(text, 'utf8') });
  }
  return written;
}

// ── 합성 얼굴·자세의 간추린 기록(픽스처) ──

/**
 * 얼굴·자세 시퀀스의 "예제가 쓰는 번호"만 몇 장씩 적는다. 전체 좌표는 너무 커서(얼굴 한 장 478점) 적지 않고,
 * 대신 모든 좌표의 합계 지문(sum)을 남겨 생성기가 바뀌면 단위 테스트가 알아채게 한다.
 */
export async function buildFacePoseFixture() {
  const { FACE_KEY_LANDMARKS, SYNTHETIC_FACE_VERSION, generateFaceSequences } = await import(
    pathToFileURL(path.join(rootDir, 'src', 'lab', 'modules', 'mediapipe', 'synthetic-face.ts')).href
  );
  const { POSE_KEY_LANDMARKS, SYNTHETIC_POSE_VERSION, generatePoseSequences } = await import(
    pathToFileURL(path.join(rootDir, 'src', 'lab', 'modules', 'mediapipe', 'synthetic-pose.ts')).href
  );
  /** 좌표 전체의 지문(소수 4자리 반올림 값들의 합) */
  const digest = (frames, pick) =>
    Math.round(
      frames.reduce((total, frame) => total + pick(frame).reduce((sum, points) => sum + points.reduce((one, [x, y, z]) => one + x + y + z, 0), 0), 0) * 1e4,
    ) / 1e4;
  const sample = (frames, keys, pick, step) =>
    frames
      .map((frame, index) => ({ index, frame }))
      .filter(({ index }) => index % step === 0)
      .map(({ index, frame }) => {
        const first = pick(frame)[0];
        return {
          frame: index,
          points: first ? Object.fromEntries(keys.map((key) => [key, [first[key][0], first[key][1]]])) : null,
        };
      });
  return {
    version: { face: SYNTHETIC_FACE_VERSION, pose: SYNTHETIC_POSE_VERSION },
    generator: 'scripts/gen-landmarks.mjs',
    note: '코드로 계산한 합성 얼굴·자세 좌표의 간추린 기록(사람 촬영 데이터 아님, PD-30). 예제가 쓰는 번호만 5장마다, 전체는 sum 지문으로 대조해요.',
    face: generateFaceSequences().map((sequence) => ({
      id: sequence.id,
      label: sequence.label,
      fps: sequence.fps,
      frames: sequence.frames.length,
      sum: digest(sequence.frames, (frame) => frame.faces.map((face) => face.landmarks)),
      keys: FACE_KEY_LANDMARKS,
      samples: sample(sequence.frames, FACE_KEY_LANDMARKS, (frame) => frame.faces.map((face) => face.landmarks), 5),
    })),
    pose: generatePoseSequences().map((sequence) => ({
      id: sequence.id,
      label: sequence.label,
      fps: sequence.fps,
      frames: sequence.frames.length,
      sum: digest(sequence.frames, (frame) => frame.poses.map((pose) => pose.landmarks)),
      keys: POSE_KEY_LANDMARKS,
      samples: sample(sequence.frames, POSE_KEY_LANDMARKS, (frame) => frame.poses.map((pose) => pose.landmarks), 5),
    })),
  };
}

export async function writeFacePoseFixture(outputPath = path.join(rootDir, FACE_POSE_FIXTURE)) {
  const fixture = await buildFacePoseFixture();
  const text = `${JSON.stringify(fixture, null, 1)}\n`;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, text, 'utf8');
  return { path: outputPath, bytes: Buffer.byteLength(text, 'utf8') };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const target = process.argv[2] ? path.resolve(process.argv[2]) : path.join(rootDir, DEFAULT_OUTPUT);
  const result = writeLandmarksFixture(target);
  console.log(`[합성 손 좌표] ${path.relative(rootDir, result.path)} (${(result.bytes / 1024).toFixed(0)}KB)`);
  if (!process.argv[2]) {
    for (const file of await writeConnectionFiles()) {
      console.log(`[연결표] ${path.relative(rootDir, file.path)} (${(file.bytes / 1024).toFixed(0)}KB)`);
    }
    const facePose = await writeFacePoseFixture();
    console.log(`[합성 얼굴·자세 기록] ${path.relative(rootDir, facePose.path)} (${(facePose.bytes / 1024).toFixed(0)}KB)`);
  }
}
