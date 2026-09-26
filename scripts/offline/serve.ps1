<#
  AI 피지컬 컴퓨팅 오픈랩 — 오프라인판 작은 웹 서버 (PLAN §5.6, P6-07)

  무엇: 압축을 푼 오프라인판 폴더의 site\ 를 이 컴퓨터 안에서만 여는 정적 웹 서버예요.
        Windows 10·11에 처음부터 들어 있는 PowerShell 5.1과 .NET(System.Net.HttpListener)만 써서 따로 설치할 것이 없어요.
  왜:   카메라·Web Serial(보드 연결)·서비스 워커는 "보안 연결"에서만 돼요. http://localhost 는 브라우저가 보안 연결로 봐요.
        파일을 그냥 더블클릭해 여는 file:// 로는 파이썬 실행기(모듈 워커)·카메라가 돌지 않아요.
  어떻게 여나: 오프라인판 폴더의 시작하기.bat를 더블클릭해요(이 파일을 "-ExecutionPolicy Bypass"로 실행해 줘요).

  안전
  - http://localhost:<포트>/ 와 http://127.0.0.1:<포트>/ 에만 열어요(관리자 권한이 필요 없고, 다른 컴퓨터에서는 접속할 수 없어요).
    요청의 Host 머리말도 그 두 이름일 때만 답해요(다른 이름으로 이 컴퓨터를 가리키게 꾸민 웹 페이지가 읽어 가지 못하게 — 421).
  - site\ 폴더 밖의 파일은 주지 않아요(.. 이나 역슬래시·드라이브 이름이 든 주소는 거절). 점(.)으로 시작하는 파일은 주지 않아요.
  - 폴더 목록을 보여 주지 않아요(폴더에 index.html이 없으면 404). GET·HEAD만 받아요. 요청 기록을 파일로 남기지 않아요.
  - 파일 종류(MIME) 표는 scripts/lib/offline-site.mjs의 OFFLINE_MIME_TYPES와 같아야 해요(tests/unit/offline/serve-scripts.test.ts가 대조).

  쓰는 법(보통은 시작하기.bat가 알아서 해요)
    powershell -NoProfile -ExecutionPolicy Bypass -File serve.ps1 [-Port 8080] [-Root <site 폴더>] [-NoBrowser] [-NoPause] [-Log]
    -Port      처음 시도할 포트(기본 8080). 쓰는 중이면 다음 번호로 넘어가요(최대 -PortTries번).
    -Root      내보낼 폴더(기본: 이 파일이 있는 server\ 옆의 site\).
    -NoBrowser 브라우저를 열지 않아요(자동 검사용).
    -NoPause   오류가 나도 엔터를 기다리지 않아요(시작하기.bat가 대신 기다려요).
    -Log       요청마다 한 줄씩 보여 줘요(문제를 찾을 때).

  이 파일은 UTF-8(BOM 있음)로 저장해요. PowerShell 5.1은 BOM이 없는 파일을 한국어 Windows에서 CP949로 읽어 한국어가 깨져요.
#>
[CmdletBinding()]
param(
  [int]$Port = 8080,
  [string]$Root = '',
  [switch]$NoBrowser,
  [switch]$NoPause,
  [switch]$Log,
  [int]$PortTries = 20
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'

# 빌드(scripts/build-offline.mjs)가 묶을 때 판 번호로 바꿔 넣는 자리
$SiteVersion = '{{APC_VERSION}}'
if ($SiteVersion.StartsWith('{{')) { $SiteVersion = '개발용' }
# 응답 머리말에 넣는 판 표시(머리말 값은 영어·숫자만 — 한국어를 넣으면 .NET이 거절한다)
$VersionToken = if ($SiteVersion -match '^[0-9A-Za-z.+-]+$') { $SiteVersion } else { 'dev' }

try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
try { $Host.UI.RawUI.WindowTitle = "AI 피지컬 컴퓨팅 오픈랩 오프라인판 서버 — 이 창을 닫으면 사이트가 멈춰요" } catch { }

function Write-Note([string]$Text) { Write-Host $Text }

function Stop-WithMessage([string[]]$Lines, [int]$Code = 1) {
  Write-Host ''
  foreach ($line in $Lines) { Write-Host $line -ForegroundColor Yellow }
  if (-not $NoPause) {
    Write-Host ''
    try { [void](Read-Host '엔터를 누르면 창이 닫혀요') } catch { }
  }
  exit $Code
}

# ───────── 파일 종류(MIME) 표 — scripts/lib/offline-site.mjs의 OFFLINE_MIME_TYPES와 같아야 해요 ─────────
$MimeTypes = @{
  '.html' = 'text/html; charset=utf-8'
  '.htm' = 'text/html; charset=utf-8'
  '.css' = 'text/css; charset=utf-8'
  '.js' = 'text/javascript; charset=utf-8'
  '.mjs' = 'text/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.map' = 'application/json; charset=utf-8'
  '.webmanifest' = 'application/manifest+json; charset=utf-8'
  '.txt' = 'text/plain; charset=utf-8'
  '.md' = 'text/markdown; charset=utf-8'
  '.py' = 'text/x-python; charset=utf-8'
  '.xml' = 'application/xml; charset=utf-8'
  '.svg' = 'image/svg+xml'
  '.png' = 'image/png'
  '.jpg' = 'image/jpeg'
  '.jpeg' = 'image/jpeg'
  '.gif' = 'image/gif'
  '.webp' = 'image/webp'
  '.avif' = 'image/avif'
  '.ico' = 'image/x-icon'
  '.cur' = 'image/x-icon'
  '.woff2' = 'font/woff2'
  '.woff' = 'font/woff'
  '.otf' = 'font/otf'
  '.ttf' = 'font/ttf'
  '.wasm' = 'application/wasm'
  '.mp3' = 'audio/mpeg'
  '.wav' = 'audio/wav'
  '.ogg' = 'audio/ogg'
  '.pdf' = 'application/pdf'
  '.zip' = 'application/zip'
  '.whl' = 'application/zip'
  '.bin' = 'application/octet-stream'
  '.task' = 'application/octet-stream'
  '.tflite' = 'application/octet-stream'
  '.pagefind' = 'application/octet-stream'
  '.pf_fragment' = 'application/octet-stream'
  '.pf_index' = 'application/octet-stream'
  '.pf_meta' = 'application/octet-stream'
}
$DefaultMime = 'application/octet-stream'

# ───────── 내보낼 폴더 ─────────
if ([string]::IsNullOrWhiteSpace($Root)) {
  $Root = Join-Path (Split-Path -Parent $PSScriptRoot) 'site'
}
try {
  $RootFull = [System.IO.Path]::GetFullPath($Root).TrimEnd('\')
} catch {
  Stop-WithMessage @("[안내] 사이트 폴더 주소가 올바르지 않아요: $Root")
}
$RootPrefix = $RootFull + '\'
if (-not [System.IO.File]::Exists((Join-Path $RootFull 'index.html'))) {
  Stop-WithMessage @(
    "[안내] 사이트 파일을 찾지 못했어요: $RootFull\index.html",
    '       압축을 모두 푼 뒤, 풀린 폴더 안의 시작하기.bat를 실행해 주세요(압축 파일 안에서 바로 실행하면 안 돼요).'
  )
}

# ───────── 요청 주소 → site 폴더 안 파일(밖으로 나가는 주소는 거절) ─────────
$InvalidNameChars = [System.IO.Path]::GetInvalidFileNameChars()

function Resolve-SitePath([string]$AbsolutePath) {
  # 돌려주는 값: site 폴더 기준 상대 경로('' = 뿌리) 또는 $null(거절)
  try { $decoded = [System.Uri]::UnescapeDataString($AbsolutePath) } catch { return $null }
  if ($decoded.IndexOf([char]0) -ge 0) { return $null }
  if ($decoded.Contains('\') -or $decoded.Contains(':')) { return $null }
  $segments = New-Object System.Collections.Generic.List[string]
  foreach ($segment in $decoded.Split('/')) {
    if ($segment.Length -eq 0) { continue }
    # . 과 .. 과 점으로 시작하는 이름(.git 같은 숨은 파일)은 주지 않는다
    if ($segment.StartsWith('.')) { return $null }
    if ($segment.IndexOfAny($InvalidNameChars) -ge 0) { return $null }
    $segments.Add($segment)
  }
  return ($segments -join '\')
}

function Get-MimeType([string]$Path) {
  $extension = [System.IO.Path]::GetExtension($Path).ToLowerInvariant()
  if ($MimeTypes.ContainsKey($extension)) { return $MimeTypes[$extension] }
  return $DefaultMime
}

function Send-FileBody($Response, [string]$Path, [int]$Status, [bool]$WithBody) {
  $stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
  try {
    $Response.StatusCode = $Status
    $Response.ContentType = (Get-MimeType $Path)
    $Response.ContentLength64 = $stream.Length
    if ($WithBody) {
      $stream.CopyTo($Response.OutputStream, 81920)
    }
  } finally {
    $stream.Dispose()
  }
}

function Send-Text($Response, [int]$Status, [string]$Text, [bool]$WithBody) {
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
  $Response.StatusCode = $Status
  $Response.ContentType = 'text/plain; charset=utf-8'
  $Response.ContentLength64 = $bytes.Length
  if ($WithBody) { $Response.OutputStream.Write($bytes, 0, $bytes.Length) }
}

function Send-NotFound($Response, [bool]$WithBody) {
  $page = Join-Path $RootFull '404.html'
  if ([System.IO.File]::Exists($page)) {
    Send-FileBody $Response $page 404 $WithBody
  } else {
    Send-Text $Response 404 '404 — 이 주소에는 파일이 없어요.' $WithBody
  }
}

function Invoke-Request($Context) {
  $request = $Context.Request
  $response = $Context.Response
  $status = 0
  try {
    $response.Headers.Set('Cache-Control', 'no-cache')
    $response.Headers.Set('X-Content-Type-Options', 'nosniff')
    # 이 서버라는 표시 — 시작하기.bat를 한 번 더 누르면 새 서버를 열지 않고 이 서버를 브라우저로 연다(Test-ExistingServer)
    $response.Headers.Set('X-APC-Offline', $VersionToken)
    $method = $request.HttpMethod
    $withBody = ($method -eq 'GET')
    # 주소창의 이름이 localhost·127.0.0.1일 때만 답한다(다른 이름으로 이 컴퓨터를 가리키게 꾸민 웹 페이지가 읽어 가지 못하게 — DNS 리바인딩 막기)
    $hostHeader = [string]$request.UserHostName
    if (-not $AllowedHosts.Contains($hostHeader.ToLowerInvariant())) {
      Send-Text $response 421 '421 — 이 서버는 localhost 주소로만 열어요.' $withBody
      $status = 421
      return
    }
    if ($method -ne 'GET' -and $method -ne 'HEAD') {
      $response.Headers.Set('Allow', 'GET, HEAD')
      Send-Text $response 405 '405 — GET과 HEAD만 받아요.' $true
      $status = 405
      return
    }
    $absolutePath = $request.Url.AbsolutePath
    $relative = Resolve-SitePath $absolutePath
    if ($null -eq $relative) {
      Send-NotFound $response $withBody
      $status = 404
      return
    }
    $full = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($RootFull, $relative))
    if (-not ($full -eq $RootFull -or $full.StartsWith($RootPrefix, [System.StringComparison]::OrdinalIgnoreCase))) {
      Send-NotFound $response $withBody
      $status = 404
      return
    }
    if ([System.IO.Directory]::Exists($full)) {
      if (-not $absolutePath.EndsWith('/')) {
        # 폴더 주소는 /로 끝나게(GitHub Pages와 같게 — 사이트의 상대 주소가 맞게)
        $response.StatusCode = 301
        $response.RedirectLocation = $absolutePath + '/' + $request.Url.Query
        $response.ContentLength64 = 0
        $status = 301
        return
      }
      $full = Join-Path $full 'index.html'
    }
    if (-not [System.IO.File]::Exists($full)) {
      Send-NotFound $response $withBody
      $status = 404
      return
    }
    Send-FileBody $response $full 200 $withBody
    $status = 200
  } catch [System.Net.HttpListenerException] {
    $status = -1 # 브라우저가 받는 도중에 끊음(쪽을 옮기는 등) — 흔한 일이라 알리지 않는다
  } catch [System.IO.IOException] {
    $status = -1
  } catch {
    $status = 500
    Write-Host ("[서버 오류] " + $request.Url.AbsolutePath + " — " + $_.Exception.Message) -ForegroundColor Red
    try { Send-Text $response 500 '500 — 서버가 이 파일을 주지 못했어요.' $true } catch { }
  } finally {
    try { $response.Close() } catch { }
    if ($Log) { Write-Host ("{0} {1} {2}" -f $request.HttpMethod, $request.Url.PathAndQuery, $status) }
  }
}

# ───────── 서버 열기(포트가 쓰이는 중이면 다음 번호) ─────────
try {
  if (-not [System.Net.HttpListener]::IsSupported) { throw 'HttpListener를 쓸 수 없는 환경이에요.' }
} catch {
  Stop-WithMessage @(
    '[안내] 이 컴퓨터에서는 PowerShell 작은 서버를 열 수 없어요(학교 보안 정책이 .NET 기능을 막았을 수 있어요).',
    '       읽어보세요.txt의 "다른 방법으로 시작하기"(파이썬 등)를 봐 주세요.',
    ("       까닭: " + $_.Exception.Message)
  )
}

function Get-ExistingServerVersion([int]$CandidatePort) {
  # 그 포트에서 이미 오프라인판 서버가 돌고 있으면 그 판 표시(응답 머리말 X-APC-Offline), 아니면 $null.
  # 먼저 TCP 연결만 0.3초 안에 되는지 본다 — Windows는 닫힌 포트로의 연결을 곧바로 거절하지 않고 1초쯤 다시 시도해서
  # (2026-09-26 실측: localhost·127.0.0.1 두 곳이면 약 2초) 빈 포트에서 HTTP로 바로 물으면 창이 늦게 뜬다.
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $pending = $client.BeginConnect('127.0.0.1', $CandidatePort, $null, $null)
    if (-not $pending.AsyncWaitHandle.WaitOne(300) -or -not $client.Connected) { return $null }
  } catch {
    return $null
  } finally {
    $client.Close()
  }
  try {
    $probe = [System.Net.WebRequest]::Create("http://127.0.0.1:$CandidatePort/")
    $probe.Method = 'HEAD'
    $probe.Timeout = 1500
    $probe.Proxy = $null
    $reply = $probe.GetResponse()
    try {
      $value = $reply.Headers['X-APC-Offline']
      if ([string]::IsNullOrEmpty($value)) { return $null }
      return $value
    } finally {
      $reply.Close()
    }
  } catch {
    return $null
  }
}

$listener = $null
$lastError = ''
for ($i = 0; $i -lt $PortTries; $i++) {
  $candidate = $Port + $i
  $existingVersion = Get-ExistingServerVersion $candidate
  if ($existingVersion -eq $VersionToken) {
    # 시작하기.bat를 두 번 눌렀을 때: 두 번째 서버(다른 포트 = 저장한 코드가 따로인 다른 주소)를 열지 않고 켜져 있는 같은 판 서버를 연다
    $existing = "http://localhost:$candidate/"
    Write-Host ''
    Write-Host ("  이미 켜져 있는 서버가 있어요: {0}" -f $existing) -ForegroundColor Green
    Write-Host '  그 주소를 브라우저로 열게요. 이 창은 닫아도 돼요(먼저 연 서버 창은 닫지 마세요).'
    if (-not $NoBrowser) {
      try { Start-Process $existing } catch { }
    }
    exit 0
  }
  if ($null -ne $existingVersion) {
    Write-Host ("  (포트 {0}에는 다른 판({1})의 오프라인판 서버가 켜져 있어요 — 다음 번호로 열어요.)" -f $candidate, $existingVersion) -ForegroundColor Yellow
    continue
  }
  $attempt = New-Object System.Net.HttpListener
  $attempt.Prefixes.Add("http://localhost:$candidate/")
  $attempt.Prefixes.Add("http://127.0.0.1:$candidate/")
  $attempt.IgnoreWriteExceptions = $true
  try {
    $attempt.Start()
    $listener = $attempt
    $Port = $candidate
    break
  } catch {
    $lastError = $_.Exception.Message
    try { $attempt.Close() } catch { }
  }
}
if ($null -eq $listener) {
  Stop-WithMessage @(
    ("[안내] 포트 {0}~{1}을(를) 모두 열지 못했어요. 다른 프로그램이 쓰고 있거나 보안 정책이 막았을 수 있어요." -f $Port, ($Port + $PortTries - 1)),
    '       다른 서버 창이 이미 열려 있지 않은지 확인하고, 컴퓨터를 다시 켠 뒤 시작하기.bat를 다시 실행해 보세요.',
    ("       까닭: " + $lastError)
  )
}

$address = "http://localhost:$Port/"
$AllowedHosts = New-Object 'System.Collections.Generic.HashSet[string]'
[void]$AllowedHosts.Add("localhost:$Port")
[void]$AllowedHosts.Add("127.0.0.1:$Port")
Write-Host ''
Write-Host ("  AI 피지컬 컴퓨팅 오픈랩 — 오프라인판 (판 {0})" -f $SiteVersion) -ForegroundColor Cyan
Write-Host ''
Write-Host ("  서버가 켜졌어요:  {0}" -f $address) -ForegroundColor Green
Write-Host ''
Write-Note '  - 브라우저(Chrome 또는 Edge)에서 위 주소를 열어요. 인터넷 연결은 필요 없어요.'
Write-Note '  - 이 창을 닫으면 사이트가 멈춰요. 수업하는 동안에는 창을 닫지 말고 작게 줄여 두세요.'
Write-Note '  - 이 서버는 이 컴퓨터 안에서만 열려요. 다른 컴퓨터에서는 접속할 수 없어요.'
Write-Note '  - 끝낼 때는 이 창을 닫거나 Ctrl+C를 눌러요.'
Write-Host ''

if (-not $NoBrowser) {
  try {
    Start-Process $address
  } catch {
    Write-Host '  (브라우저를 저절로 열지 못했어요. Chrome이나 Edge 주소창에 위 주소를 직접 적어 주세요.)' -ForegroundColor Yellow
  }
}

# ───────── 요청 받기(하나씩 차례로 — 이 컴퓨터 안이라 충분히 빨라요) ─────────
try {
  while ($listener.IsListening) {
    $pending = $listener.GetContextAsync()
    # 0.5초마다 한 번씩 돌아와 Ctrl+C를 받을 수 있게 한다
    while (-not $pending.Wait(500)) { }
    Invoke-Request $pending.Result
  }
} finally {
  try { $listener.Stop() } catch { }
  try { $listener.Close() } catch { }
  Write-Host '  서버를 멈췄어요.'
}
