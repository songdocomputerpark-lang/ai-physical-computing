/**
 * 재생 입력 소스(PLAN §8.2 P2-08 손 · P2-09 얼굴·자세, PD-30) — 카메라 없이 인식 예제를 돌리는 입력. 영상처리 실습실의 입력 소스 등록표
 * (src/lab/vision/sources.ts registerVisionSource)에 kind 'replay'로 들어간다.
 *
 * - 프레임: 사람 영상이 아니라 합성 좌표(synthetic-hands·synthetic-face·synthetic-pose)의 **점과 선만** 어두운 바탕에 그린다. 사진·얼굴 이미지 없음.
 *   왼쪽 위 구석에는 작은 분홍 세모(방향 표시)를 그린다 — 학생 코드가 `cv2.flip(frame, 1)`로 뒤집었는지 알아내는 데 쓴다(mirror.ts).
 * - 좌표: 파이썬 process()가 이 소스의 "마지막으로 그린 장"과 같은 좌표를 받는다(index.ts가 currentFrame()으로 읽어 답한다).
 *   그래서 학생 코드가 그린 점·선이 화면의 뼈대 위에 정확히 겹친다.
 * - 시간: 첫 grab 때부터 흐른 시간으로 장 번호를 정한다(fps 15, 끝나면 처음으로). setSequence로 동작을 바꾸면 처음부터 다시 시작한다.
 * - 이 소스가 아닌 샘플 입력(움직이는 도형)이 열려 있을 때 인식 코드가 돌면 index.ts가 frameAt(now)로 같은 좌표를 빌려 쓴다
 *   (카메라를 못 열어 샘플로 바뀐 경우 — 좌표만 오고 화면의 뼈대는 없다).
 * 등록: index.ts가 이 모듈을 불러올 때 registerReplaySource()를 한 번 부른다(실습실 화면이 먼저 그려졌으면 <option>도 index.ts가 더한다).
 */
import { DEFAULT_FRAME_HEIGHT, DEFAULT_FRAME_WIDTH, MAX_FRAME_HEIGHT, MAX_FRAME_WIDTH, clampFrameSize } from '../../vision/frame.ts';
import { registerVisionSource, type OpenOptions, type OpenedSource, type VisionSource } from '../../vision/sources.ts';
import { FACE_CONNECTIONS, POSE_CONNECTIONS } from './face-connections.ts';
import { ORIENTATION_MARK_COLOR, ORIENTATION_MARK_INSET, ORIENTATION_MARK_SIZE } from './mirror.ts';
import {
  DEFAULT_SEQUENCE_FOR_KIND,
  listReplaySequences,
  isReplaySequenceId,
  replayKindOf,
  replaySequence,
  type ReplayFrame,
  type ReplayKind,
  type ReplaySequence,
  type ReplaySequenceId,
} from './sequences.ts';
import type { SyntheticFace } from './synthetic-face.ts';
import { FINGER_JOINTS, HAND_CONNECTIONS, type SyntheticHand } from './synthetic-hands.ts';
import type { SyntheticPose } from './synthetic-pose.ts';

export const REPLAY_SOURCE_ID = 'replay';
export const REPLAY_SOURCE_LABEL = '재생 입력(합성 좌표)';
export const DEFAULT_SEQUENCE_ID: ReplaySequenceId = 'count';

/** 뼈대 색(어두운 바탕 위. 학생 코드의 기본 스타일 — 빨간 점·회색 선 — 과 구별되게 밝은 회색·하늘색) */
const COLORS = Object.freeze({
  background: '#20242b',
  glow: '#2c323b',
  bone: '#9aa3ad',
  joint: '#e6e9ee',
  fingertip: '#8fd3ff',
  wrist: '#ffd166',
  text: '#c9d1d9',
  /** 얼굴 그물(2,556선)은 아주 옅게 — 학생이 그린 선이 묻히지 않게 */
  mesh: 'rgba(154, 163, 173, 0.35)',
});

export class ReplaySource implements VisionSource {
  readonly id = REPLAY_SOURCE_ID;
  readonly kind = 'replay' as const;
  readonly label = REPLAY_SOURCE_LABEL;
  readonly description =
    '카메라 없이 인식 실습을 해요. 실습실이 코드로 만든 손·얼굴·자세 좌표를 재생하고 화면에는 그 점과 선만 그려요(사람 영상 없음).';

  #sequenceId: ReplaySequenceId = DEFAULT_SEQUENCE_ID;
  #startedAt: number | null = null;
  #lastFrame: ReplayFrame | null = null;
  #lastIndex = -1;
  #opened = false;

  isAvailable(): boolean {
    return true;
  }

  /** 지금 재생하는 시퀀스 id */
  get sequenceId(): ReplaySequenceId {
    return this.#sequenceId;
  }

  get sequence(): ReplaySequence {
    return replaySequence(this.#sequenceId);
  }

  /** 지금 동작이 담은 것(손·얼굴·자세). 입력 소스 종류(this.kind = 'replay')와 다른 값이라 이름을 따로 둔다. */
  get sequenceKind(): ReplayKind {
    return replayKindOf(this.#sequenceId);
  }

  /** 고를 수 있는 시퀀스 목록(id·종류·이름·설명·장 수) */
  listSequences(): { id: ReplaySequenceId; kind: ReplayKind; label: string; description: string; frames: number }[] {
    return listReplaySequences();
  }

  /** 동작을 바꾼다(처음부터 다시). 모르는 id면 false. */
  setSequence(id: string): boolean {
    if (!isReplaySequenceId(id)) {
      return false;
    }
    if (id === this.#sequenceId) {
      return true;
    }
    this.#sequenceId = id;
    this.#startedAt = null;
    this.#lastFrame = null;
    this.#lastIndex = -1;
    return true;
  }

  /**
   * 파이썬이 연 solution 종류에 맞는 동작으로 바꾼다(이미 맞으면 그대로).
   * @returns 바꿨으면 새 동작 id, 그대로면 null
   */
  ensureKind(kind: ReplayKind): ReplaySequenceId | null {
    if (this.sequenceKind === kind) {
      return null;
    }
    const next = DEFAULT_SEQUENCE_FOR_KIND[kind];
    this.setSequence(next);
    return next;
  }

  /** now(ms) 시각의 장 번호와 장 */
  frameAt(now: number): { index: number; frame: ReplayFrame } {
    const sequence = this.sequence;
    if (this.#startedAt === null) {
      this.#startedAt = now;
    }
    const elapsed = Math.max(0, now - this.#startedAt) / 1000;
    const index = Math.floor(elapsed * sequence.fps) % sequence.frames.length;
    return { index, frame: sequence.frames[index]! };
  }

  /** now 시각에 보이는 손(소스가 열려 있지 않아도 계산한다 — 샘플 입력 위에 좌표만 빌려 쓸 때) */
  handsAt(now: number): readonly SyntheticHand[] {
    return this.frameAt(now).frame.hands;
  }

  /** 마지막으로 그린 장(아직 그린 장이 없으면 now 기준). 파이썬 process()의 답이 된다. */
  currentFrame(now: number): ReplayFrame {
    return this.#lastFrame ?? this.frameAt(now).frame;
  }

  /** 마지막으로 그린 장의 손 */
  currentHands(now: number): readonly SyntheticHand[] {
    return this.currentFrame(now).hands;
  }

  /** 마지막으로 그린 장의 얼굴 */
  currentFaces(now: number): readonly SyntheticFace[] {
    return this.currentFrame(now).faces;
  }

  /** 마지막으로 그린 장의 자세 */
  currentPoses(now: number): readonly SyntheticPose[] {
    return this.currentFrame(now).poses;
  }

  /** 마지막으로 그린 장 번호(테스트·표시용, 없으면 -1) */
  get lastFrameIndex(): number {
    return this.#lastIndex;
  }

  get isOpen(): boolean {
    return this.#opened;
  }

  open(options: OpenOptions = {}): Promise<OpenedSource> {
    let width = clampFrameSize(options.width ?? DEFAULT_FRAME_WIDTH, MAX_FRAME_WIDTH);
    let height = clampFrameSize(options.height ?? DEFAULT_FRAME_HEIGHT, MAX_FRAME_HEIGHT);
    this.#opened = true;
    this.#startedAt = null;
    const opened: OpenedSource = {
      kind: 'replay',
      get width() {
        return width;
      },
      get height() {
        return height;
      },
      fps: this.sequence.fps,
      grab: (ctx, targetWidth, targetHeight, now) => {
        const { index, frame } = this.frameAt(now);
        this.#lastFrame = frame;
        this.#lastIndex = index;
        this.draw(ctx, targetWidth, targetHeight, frame, `재생 입력 · ${this.sequence.label} · ${index + 1}/${this.sequence.frames.length}`);
        return true;
      },
      resize: (newWidth, newHeight) => {
        width = clampFrameSize(newWidth, MAX_FRAME_WIDTH);
        height = clampFrameSize(newHeight, MAX_FRAME_HEIGHT);
        return Promise.resolve({ width, height });
      },
      close: () => {
        this.#opened = false;
        this.#lastFrame = null;
        this.#lastIndex = -1;
        this.#startedAt = null;
      },
    };
    return Promise.resolve(opened);
  }

  /** 한 장을 그린다: 어두운 바탕 + 손·얼굴·자세의 점과 선 + 안내 글. 사진·사람 영상은 없다. */
  draw(ctx: CanvasRenderingContext2D, width: number, height: number, frame: ReplayFrame, caption: string): void {
    const gradient = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.1, width / 2, height / 2, Math.max(width, height) * 0.75);
    gradient.addColorStop(0, COLORS.glow);
    gradient.addColorStop(1, COLORS.background);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    const short = Math.min(width, height);
    const boneWidth = Math.max(2, Math.round(short * 0.012));
    const jointRadius = Math.max(2, Math.round(short * 0.012));
    for (const face of frame.faces) {
      this.drawFace(ctx, width, height, face);
    }
    for (const body of frame.poses) {
      this.drawPose(ctx, width, height, body);
    }
    for (const hand of frame.hands) {
      const points = hand.landmarks.map(([x, y]) => [x * width, y * height] as const);
      // 손바닥을 살짝 밝게 채워 손 모양이 보이게 한다(0·5·9·13·17)
      ctx.beginPath();
      for (const [order, index] of [0, 5, 9, 13, 17].entries()) {
        const [px, py] = points[index]!;
        if (order === 0) {
          ctx.moveTo(px, py);
        } else {
          ctx.lineTo(px, py);
        }
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.fill();

      ctx.strokeStyle = COLORS.bone;
      ctx.lineWidth = boneWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (const [from, to] of HAND_CONNECTIONS) {
        const [ax, ay] = points[from]!;
        const [bx, by] = points[to]!;
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
      }
      ctx.stroke();

      const fingertips = new Set(FINGER_JOINTS.map((joints) => joints[3]));
      for (const [index, [px, py]] of points.entries()) {
        ctx.beginPath();
        ctx.arc(px, py, index === 0 ? jointRadius * 1.6 : jointRadius, 0, Math.PI * 2);
        ctx.fillStyle = index === 0 ? COLORS.wrist : fingertips.has(index) ? COLORS.fingertip : COLORS.joint;
        ctx.fill();
      }

      // 손 이름표(Left/Right)를 손목 아래에 작게
      const [wx, wy] = points[0]!;
      ctx.fillStyle = COLORS.text;
      ctx.font = `${Math.round(short * 0.045)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(hand.handedness.label, wx, Math.min(height - short * 0.06, wy + jointRadius * 2));
    }

    const empty = frame.hands.length === 0 && frame.faces.length === 0 && frame.poses.length === 0;
    ctx.fillStyle = COLORS.text;
    ctx.font = `${Math.round(short * 0.04)}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(empty ? `${caption} · 아무것도 없음` : caption, Math.round(width * 0.02), Math.round(height * 0.98));

    this.drawOrientationMark(ctx, width, height);
  }

  /** 얼굴 한 개: 그물(옅은 선) + 윤곽선 + 눈동자. 사진이 아니라 점과 선뿐이다. */
  drawFace(ctx: CanvasRenderingContext2D, width: number, height: number, face: SyntheticFace): void {
    const points = face.landmarks.map(([x, y]) => [x * width, y * height] as const);
    const short = Math.min(width, height);
    const stroke = (pairs: readonly (readonly [number, number])[], color: string, lineWidth: number) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      for (const [from, to] of pairs) {
        const a = points[from];
        const b = points[to];
        if (!a || !b) continue;
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
      }
      ctx.stroke();
    };
    stroke(FACE_CONNECTIONS.FACEMESH_TESSELATION, COLORS.mesh, Math.max(0.5, short * 0.0015));
    stroke(FACE_CONNECTIONS.FACEMESH_CONTOURS, COLORS.bone, Math.max(1, short * 0.004));
    stroke(FACE_CONNECTIONS.FACEMESH_IRISES, COLORS.fingertip, Math.max(1, short * 0.004));
    ctx.fillStyle = COLORS.fingertip;
    for (const index of [1, 13, 14, 33, 263]) {
      const point = points[index];
      if (!point) continue;
      ctx.beginPath();
      ctx.arc(point[0], point[1], Math.max(1.5, short * 0.006), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** 자세 한 사람: 뼈대 선 + 관절. visibility가 낮은 점(화면 밖 다리)은 흐리게 그린다. */
  drawPose(ctx: CanvasRenderingContext2D, width: number, height: number, body: SyntheticPose): void {
    const short = Math.min(width, height);
    const points = body.landmarks.map(([x, y, , visibility]) => ({ x: x * width, y: y * height, visibility: visibility ?? 1 }));
    ctx.strokeStyle = COLORS.bone;
    ctx.lineWidth = Math.max(2, Math.round(short * 0.01));
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const [from, to] of POSE_CONNECTIONS) {
      const a = points[from];
      const b = points[to];
      if (!a || !b || a.visibility < 0.5 || b.visibility < 0.5) continue;
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
    for (const [index, point] of points.entries()) {
      if (point.visibility < 0.5) continue;
      ctx.beginPath();
      ctx.arc(point.x, point.y, Math.max(2, short * (index === 15 || index === 16 ? 0.013 : 0.009)), 0, Math.PI * 2);
      ctx.fillStyle = index === 15 || index === 16 ? COLORS.fingertip : index === 0 ? COLORS.wrist : COLORS.joint;
      ctx.fill();
    }
  }

  /**
   * 왼쪽 위 구석의 작은 분홍 세모 — 학생 코드가 `cv2.flip(frame, 1)`로 영상을 뒤집었는지 알아내는 표시다(mirror.ts).
   * 뒤집힌 영상에서는 이 세모가 오른쪽 위로 가고, 그때는 손 좌표도 함께 뒤집어 돌려준다(그래야 뼈대가 손 위에 그려진다).
   */
  drawOrientationMark(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const short = Math.min(width, height);
    const inset = Math.round(short * ORIENTATION_MARK_INSET);
    const size = Math.max(6, Math.round(short * ORIENTATION_MARK_SIZE));
    ctx.fillStyle = ORIENTATION_MARK_COLOR;
    ctx.beginPath();
    ctx.moveTo(inset, inset);
    ctx.lineTo(inset + size, inset);
    ctx.lineTo(inset, inset + size);
    ctx.closePath();
    ctx.fill();
  }

}

/** 실습실 하나에 소스 하나(index.ts와 요청 처리기가 같은 것을 본다) */
export const replaySource = new ReplaySource();

let registered = false;

/** 입력 소스 등록표에 재생 입력을 더한다(한 번만). 등록 뒤에 그려진 화면 목록에는 index.ts가 <option>을 더한다. */
export function registerReplaySource(): ReplaySource {
  if (!registered) {
    registerVisionSource(replaySource);
    registered = true;
  }
  return replaySource;
}
