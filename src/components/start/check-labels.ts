/**
 * 점검 표(CheckReport.astro)와 짧은 점검(QuickCheck.astro)에 보이는 항목 이름 — 하는 일로 먼저, 영어 이름은 작은 보조 글씨로(판 1.3.0 검수 R1-041).
 *
 * 판단·[결과 복사] 글에 쓰는 이름(src/lib/capabilities.ts의 CHECK_ITEMS label, 예: "Web Serial(USB 보드 연결)")은 그대로 둔다 —
 * 운영자가 복사한 글에서 기술 이름을 바로 알아볼 수 있어야 해서다. 여기는 화면에 보이는 이름만 바꾼다.
 */
import type { CheckId } from '../../lib/capabilities.ts';

export interface CheckDisplay {
  /** 하는 일로 쓴 이름(큰 글씨) */
  readonly name: string;
  /** 영어 기술 이름(작은 보조 글씨). 없으면 name만 보인다 */
  readonly tech?: string;
}

const DISPLAY: Partial<Record<CheckId, CheckDisplay>> = {
  webassembly: { name: '파이썬 실행 바탕 기능', tech: 'WebAssembly' },
  jspi: { name: '파이썬 기다리기 기능', tech: 'JSPI' },
  'web-serial': { name: 'USB로 보드 연결', tech: 'Web Serial' },
  'web-bluetooth': { name: '블루투스로 보드 연결', tech: 'Web Bluetooth' },
};

/** 화면에 보일 항목 이름. 바꿀 필요가 없는 항목은 점검 항목의 원래 이름 그대로 */
export function checkDisplay(id: CheckId, label: string): CheckDisplay {
  return DISPLAY[id] ?? { name: label };
}

/** 미지원일 때 표에 굵게 먼저 보이는 한 줄(누가 무엇을 하면 되는지). 긴 안내는 그 아래에 그대로 있다 */
const QUICK_FIX: Partial<Record<CheckId, string>> = {
  webassembly: '브라우저를 최신판 Chrome이나 Edge로 바꾸면 돼요. 안 되면 전산 담당 선생님께 이 표를 보여 주세요.',
  jspi: '브라우저를 최신판 Chrome이나 Edge로 바꾸면 돼요.',
  'web-serial': '진짜 보드는 컴퓨터용 Chrome이나 Edge에서 연결해요. 보드가 없으면 가상 보드로 해도 돼요.',
  'web-bluetooth': '블루투스 실습은 컴퓨터용 Chrome이나 Edge에서 해요.',
};

export function quickFixLine(id: CheckId): string {
  return QUICK_FIX[id] ?? '';
}
