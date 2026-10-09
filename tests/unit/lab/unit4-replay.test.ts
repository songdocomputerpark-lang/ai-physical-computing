// 4단원 통합 실습실의 재생 입력 선택(R2-008): 카메라가 없어 재생 입력(합성 좌표)으로 바꿀 때, 컴퓨터 코드가 쓰는 solution에 맞는 재생 동작을 고른다.
import { describe, expect, it } from 'vitest';
import { replaySolutionOfCode, UNIT4_TEXT } from '../../../src/lab/unit4/unit4-page.ts';

describe('4단원 재생 동작 고르기', () => {
  it('얼굴 solution을 쓰는 코드는 얼굴 고개 돌리기를 고른다(기본 손 동작이 아니다)', () => {
    expect(replaySolutionOfCode('mp.solutions.face_mesh.FaceMesh()')).toEqual({ kind: 'face', sequence: 'face-turn' });
    expect(replaySolutionOfCode('detector = mp.solutions.face_detection.FaceDetection()')).toEqual({ kind: 'face', sequence: 'face-turn' });
  });

  it('손 solution이거나 모르는 코드는 손 동작을, 자세 solution은 자세 동작을 고른다', () => {
    expect(replaySolutionOfCode('mp.solutions.hands.Hands()')).toEqual({ kind: 'hands', sequence: 'count' });
    expect(replaySolutionOfCode('print(1)')).toEqual({ kind: 'hands', sequence: 'count' });
    expect(replaySolutionOfCode('mp.solutions.pose.Pose()')).toEqual({ kind: 'pose', sequence: 'pose-raise' });
  });

  it('상태 글 세 가지가 모두 있다(실제 화면과 같은 말을 고르려고)', () => {
    expect(UNIT4_TEXT.replaySwitched).toContain('얼굴');
    expect(UNIT4_TEXT.replaySwitchedHands).toContain('손');
    expect(UNIT4_TEXT.replaySwitchedPose).toContain('팔');
  });
});
