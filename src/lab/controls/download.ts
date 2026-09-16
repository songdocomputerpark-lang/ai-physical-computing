/**
 * [.py 내려받기](PLAN §8.2 P2-02, SPEC §6.1 "파일로 내려받기(.py) 가능").
 * 코드를 UTF-8 텍스트 파일로 만들어 브라우저의 내려받기로 넘긴다. 서버를 거치지 않는다(원칙 2).
 */

/** 파일 이름에 쓸 수 없는 글자(경로 구분자·따옴표·제어 문자)를 -로 바꾼다. 비면 fallback. */
export function safeFileName(name: string, fallback = 'main.py'): string {
  const cleaned = name
    .trim()
    .replace(/[\\/:*?"<>|]|\p{Cc}/gu, '-')
    .replace(/^\.+/u, '');
  return cleaned === '' ? fallback : cleaned;
}

interface ObjectUrlApi {
  createObjectURL?(blob: Blob): string;
  revokeObjectURL?(url: string): void;
}

/**
 * 글자를 파일로 내려받는다. 문서(document)는 테스트에서 바꿔 넣을 수 있다.
 * 내려받기를 시작하지 못하면(Blob 주소를 못 만드는 환경) false.
 */
export function downloadTextFile(fileName: string, text: string, doc: Document = document): boolean {
  const urlApi = (globalThis as { URL?: ObjectUrlApi }).URL;
  if (typeof Blob === 'undefined' || !urlApi?.createObjectURL || !urlApi.revokeObjectURL) {
    return false;
  }
  const blob = new Blob([text], { type: 'text/x-python;charset=utf-8' });
  const url = urlApi.createObjectURL(blob);
  const link = doc.createElement('a');
  link.href = url;
  link.download = safeFileName(fileName);
  link.rel = 'noopener';
  link.hidden = true;
  doc.body.append(link);
  link.click();
  link.remove();
  // 클릭 처리가 끝난 뒤 주소를 거둔다(바로 거두면 일부 브라우저가 내려받기를 시작하지 못한다).
  setTimeout(() => urlApi.revokeObjectURL?.(url), 1000);
  return true;
}
