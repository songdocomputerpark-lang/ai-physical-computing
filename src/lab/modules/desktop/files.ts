/**
 * 가상 데스크톱의 '내 파일'(P2-12) — 학생 코드가 저장한 그림을 미리보기·[내려받기]로 넘기는 작은 도우미.
 *
 * 서버를 거치지 않는다(원칙 2): 파이썬이 보낸 바이트를 브라우저 안에서 Blob 주소로 만들어 <img>에 보여 주고,
 * [내려받기]는 그 Blob을 그대로 <a download>로 넘긴다. 학생 컴퓨터 밖으로 나가는 것은 아무것도 없다.
 * 브라우저가 Blob 주소를 만들지 못하면(아주 오래된 환경) false를 돌려주고 화면이 한국어로 알린다.
 */
import { safeFileName } from '../../controls/download.ts';

export const IMAGE_MIME = 'image/png';

interface ObjectUrlApi {
  createObjectURL?(blob: Blob): string;
  revokeObjectURL?(url: string): void;
}

function urlApi(): ObjectUrlApi | null {
  const api = (globalThis as { URL?: ObjectUrlApi }).URL;
  return api?.createObjectURL && api.revokeObjectURL ? api : null;
}

/** 바이트 → 브라우저 안 주소(미리보기 <img src>). 만들 수 없으면 null. */
export function objectUrlOf(data: Uint8Array, mime = IMAGE_MIME): string | null {
  const api = urlApi();
  if (!api?.createObjectURL || typeof Blob === 'undefined') {
    return null;
  }
  // Uint8Array를 그대로 넘기면 타입이 맞지 않는 환경이 있어 같은 바이트의 새 버퍼를 준다.
  return api.createObjectURL(new Blob([data.slice()], { type: mime }));
}

export function revokeObjectUrl(url: string | null): void {
  if (url) {
    urlApi()?.revokeObjectURL?.(url);
  }
}

/** 바이트를 파일로 내려받는다(src/lab/controls/download.ts의 글자판과 같은 방법). */
export function downloadBytes(fileName: string, data: Uint8Array, mime = IMAGE_MIME, doc: Document = document): boolean {
  const url = objectUrlOf(data, mime);
  if (!url) {
    return false;
  }
  const link = doc.createElement('a');
  link.href = url;
  link.download = safeFileName(fileName, 'screenshot.png');
  link.rel = 'noopener';
  link.hidden = true;
  doc.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => revokeObjectUrl(url), 1000);
  return true;
}

/** 파일 크기를 읽기 쉽게(0.4MB·23KB) */
export function fileSizeText(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '';
  }
  if (bytes >= 1_000_000) {
    return `${(bytes / 1_000_000).toFixed(1)}MB`;
  }
  if (bytes >= 1000) {
    return `${Math.round(bytes / 1000)}KB`;
  }
  return `${Math.round(bytes)}B`;
}
