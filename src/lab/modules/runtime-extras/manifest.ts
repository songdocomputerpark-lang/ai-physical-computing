/**
 * 러너 공통 모듈(PLAN §8.2 P2-10, CODE_MAPPING §3.3 RUN·FS·FONT)의 manifest — 순수 데이터(src/lab/README.md 4절).
 *
 * 하는 일(화면 index.ts + 파이썬 apc_files.py)
 * - 가상 파일: 예제가 읽는 파일(자체 제작 mask.png — assets/mask.svg를 브라우저가 PNG로 그림)을 실습실이 준비될 때마다 작업 폴더(/home/pyodide)에 넣고,
 *   학생이 [파일 넣기]로 고른 파일도 같은 폴더에 넣는다(브라우저 메모리에만, 서버 없음). 파이썬을 다시 시작하면(정지 2단계) 다시 넣는다.
 * - 저장 파일 내려받기: cv2.imwrite·PIL Image.save 등으로 코드가 만든 파일을 파이썬 쪽이 알려 오면(event) 파일 패널에서 [내려받기].
 * - 글꼴 경로 연결: PIL.ImageFont.truetype('C:/Windows/Fonts/malgun.ttf', 30)처럼 이 브라우저에 없는 글꼴 경로를 사이트 글꼴(Pretendard, OFL-1.1)로
 *   바꾼다. 글꼴 파일은 처음 필요할 때 파이썬이 request('runtime-extras.font')로 부탁하고 화면이 같은 사이트에서 받아 가상 파일시스템에 넣는다.
 * - 이름 가림 경고: 학생 파일 이름이 cv2.py·numpy.py처럼 라이브러리 이름과 같으면 넣지 않고 한국어로 알린다(파이썬 쪽도 실행 시작 때 검사).
 * - 콘솔 오래된 줄 접기: 콘솔의 보이는 줄이 많아지면 오래된 줄을 접어 두고 [펼치기]로 본다([콘솔 지우기]는 실습실 틀의 것 그대로).
 *
 * shims에 builtins를 적은 이유: apc_shims.install_available()은 "받아 둔 패키지"가 있을 때만 흉내 모듈의 install()을 부른다. 러너 공통은 특정 패키지의
 * 흉내가 아니라 실행 환경(작업 폴더·글꼴·저장 파일)을 보완하므로 매 실행 직전에 install()이 불려야 하고, 늘 있는 builtins를 열쇠로 쓰면 그렇게 된다
 * (install()이 하는 일은 파이썬 파일 머리말에). 학생 코드가 import할 이름은 없다.
 */
import type { LabModuleManifest } from '../types.ts';

const manifest: LabModuleManifest = {
  id: 'runtime-extras',
  title: '러너 공통(가상 파일·글꼴·저장 파일 내려받기)',
  // 모든 실습실(영상처리·ESP32·통신·개발용 시험 페이지)에 붙는다 — 어느 실습실이든 파일을 읽고 쓰는 코드가 있다.
  labs: '*',
  shims: { builtins: 'apc_files' },
  requestKinds: ['runtime-extras.font'],
  eventKinds: ['runtime-extras.file_saved', 'runtime-extras.files', 'runtime-extras.shadow'],
  channels: [],
  placement: 'panel',
};

export default manifest;
