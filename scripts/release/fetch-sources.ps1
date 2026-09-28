<#
.SYNOPSIS
  Download and check the corresponding-source copies listed in scripts\release\sources-manifest.json.

.DESCRIPTION
  AI Physical Computing Open Lab - operator task 26 (PROGRESS.md). Guide in Korean: scripts\release\README.md.

  The site redistributes two unmodified binaries whose licenses ask that their source can be obtained:
    - cv2.so in the OpenCV wheel, which contains FFmpeg 4.4.1 (LGPL-2.1-or-later),
    - the search engine wasm, which contains the GPL-3.0-only crate pagefind_microjson 0.1.4.
  This script downloads every file of the list from its official address into .cache\release-sources\
  (a folder git ignores), checks the size and SHA-256 (or MD5) against the official values written in the
  list, and writes SHA256SUMS.txt, fetch-result.json and fetch-result.txt next to the files.
  It changes nothing else on this PC and uploads nothing. Claude uploads the files to a GitHub release only
  after the operator says yes.

  One result word per file:
    PASS     matches the official value in the list
    RECORD   the list has no official value (GitHub builds that archive on request) - its SHA-256 is written down
    FAIL     download failed, or the size or hash differs from the official value (the file is not kept)
    MISSING  (-VerifyOnly) the file is not in the folder

.PARAMETER OutDir
  Folder for the files. Default: .cache\release-sources (inside the project folder).
.PARAMETER Manifest
  The list to use. Default: scripts\release\sources-manifest.json (tests pass another list).
.PARAMETER Force
  Download again even when a file that passed is already in the folder.
.PARAMETER ListOnly
  Only print what would be downloaded. Nothing is downloaded or written.
.PARAMETER VerifyOnly
  Never download. Only check the files that are already in the folder.
.PARAMETER Retries
  Tries per address when the network fails (default 3).

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\release\fetch-sources.ps1
  Run it in the project root folder (the folder that has package.json). Takes about 5 to 15 minutes.

.NOTES
  Keep this file ASCII only. Windows PowerShell 5.1 reads a UTF-8 file without BOM in the ANSI code page
  (CP949 on Korean Windows), so a non-ASCII character could break the script (tests/unit/release checks this).
  Exit codes: 0 = no FAIL or MISSING, 1 = at least one FAIL or MISSING, 2 = wrong folder or bad list.
#>
[CmdletBinding()]
param(
  [string]$OutDir = '.cache\release-sources',
  [string]$Manifest = 'scripts\release\sources-manifest.json',
  [switch]$Force,
  [switch]$ListOnly,
  [switch]$VerifyOnly,
  [ValidateRange(1, 10)][int]$Retries = 3
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
# Invoke-WebRequest draws a progress bar that makes big downloads very slow in Windows PowerShell 5.1.
$ProgressPreference = 'SilentlyContinue'

$ProjectName = 'ai-physical-computing'
$UserAgent = 'apc-release-sources/1 (+https://github.com/songdocomputerpark-lang/ai-physical-computing)'
$MetaFiles = @('SHA256SUMS.txt', 'fetch-result.json', 'fetch-result.txt', 'release-notes.md', 'uploaded.json')

function Write-Line([string]$Text, [string]$Color) {
  if ($Color) { Write-Host $Text -ForegroundColor $Color } else { Write-Host $Text }
}

function Stop-Script([string[]]$Lines, [int]$Code) {
  foreach ($line in $Lines) { Write-Line $line 'Yellow' }
  exit $Code
}

# Value of a JSON field, or $null when the field is not there (Set-StrictMode would throw otherwise).
function Get-Field($Object, [string]$Name) {
  if ($null -eq $Object) { return $null }
  $property = $Object.PSObject.Properties[$Name]
  if ($null -eq $property) { return $null }
  return $property.Value
}

# Emit the elements of a JSON array (nothing for null). Always call it as @(Get-List ...): PowerShell unrolls what a
# function returns, so a one-element array would otherwise arrive as a single value without .Count (Set-StrictMode).
function Get-List($Value) {
  if ($null -eq $Value) { return }
  foreach ($entry in @($Value)) { $entry }
}

# ---------------------------------------------------------------------------------------------------------
# 1. The current folder must be the project root (outputs go to .cache\release-sources\ of this project).
# ---------------------------------------------------------------------------------------------------------
$here = (Get-Location).ProviderPath
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$isRoot = $false
if ($here.TrimEnd('\') -ieq $projectRoot.TrimEnd('\')) {
  $packageJson = Join-Path $here 'package.json'
  if (Test-Path -LiteralPath $packageJson -PathType Leaf) {
    try {
      $package = Get-Content -LiteralPath $packageJson -Raw -Encoding UTF8 | ConvertFrom-Json
      $isRoot = ((Get-Field $package 'name') -eq $ProjectName)
    } catch {
      $isRoot = $false
    }
  }
}
if (-not $isRoot) {
  Stop-Script @(
    'STOP  Run this script from the project root folder (the folder that has package.json).',
    '      1. Open the project folder in File Explorer.',
    '      2. Click the address bar, type powershell and press Enter.',
    '      3. In the blue window, run:',
    '         powershell -NoProfile -ExecutionPolicy Bypass -File scripts\release\fetch-sources.ps1'
  ) 2
}

# ---------------------------------------------------------------------------------------------------------
# 2. Read and check the list.
# ---------------------------------------------------------------------------------------------------------
$manifestPath = $Manifest
if (-not [IO.Path]::IsPathRooted($manifestPath)) { $manifestPath = Join-Path $here $manifestPath }
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
  Stop-Script @("STOP  The list was not found: $Manifest") 2
}
try {
  $list = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
} catch {
  Stop-Script @("STOP  The list is not valid JSON: $Manifest", ('      ' + $_.Exception.Message)) 2
}

function Test-SourceUrl([string]$Url) {
  if ($Url -match '^https://[^\s/]+/\S*$') { return $true }
  # Plain http is accepted only for a test server on this PC.
  return ($Url -match '^http://(127\.0\.0\.1|localhost)(:\d+)?/\S*$')
}

$problems = New-Object 'System.Collections.Generic.List[string]'
$releaseTag = Get-Field $list 'releaseTag'
if ((Get-Field $list 'schema') -ne 1) { $problems.Add('schema must be 1') }
if (-not ($releaseTag -is [string]) -or $releaseTag -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]*$') { $problems.Add('releaseTag is missing') }
$items = @(Get-List (Get-Field $list 'items'))
if ($items.Count -eq 0) { $problems.Add('items is empty') }
$seenFiles = @{}
foreach ($item in $items) {
  $id = Get-Field $item 'id'
  $file = Get-Field $item 'file'
  $label = "item $id"
  if (-not ($file -is [string]) -or $file -notmatch '^[A-Za-z0-9][A-Za-z0-9._+-]*$' -or $file.EndsWith('.part')) {
    $problems.Add("$label - file must be a plain file name")
  } elseif ($MetaFiles -contains $file) {
    $problems.Add("$label - file name $file is used by this script")
  } elseif ($seenFiles.ContainsKey($file.ToLowerInvariant())) {
    $problems.Add("$label - file name $file appears twice")
  } else {
    $seenFiles[$file.ToLowerInvariant()] = $true
  }
  $urls = @(Get-List (Get-Field $item 'urls'))
  if ($urls.Count -eq 0) { $problems.Add("$label - urls is empty") }
  foreach ($url in $urls) {
    if (-not ($url -is [string]) -or -not (Test-SourceUrl $url)) { $problems.Add("$label - not an https address: $url") }
  }
  $sha = Get-Field $item 'sha256'
  $md5 = Get-Field $item 'md5'
  $size = Get-Field $item 'size'
  if ($null -ne $sha -and -not (($sha -is [string]) -and $sha -cmatch '^[0-9a-f]{64}$')) { $problems.Add("$label - sha256 must be 64 lowercase hex digits") }
  if ($null -ne $md5 -and -not (($md5 -is [string]) -and $md5 -cmatch '^[0-9a-f]{32}$')) { $problems.Add("$label - md5 must be 32 lowercase hex digits") }
  if ($null -ne $size -and -not ("$size" -match '^[1-9][0-9]*$')) { $problems.Add("$label - size must be a positive whole number") }
}
if ($problems.Count -gt 0) {
  $lines = @("STOP  The list has problems: $Manifest")
  foreach ($problem in $problems) { $lines += "      - $problem" }
  Stop-Script $lines 2
}

function Get-CheckText($Item) {
  $parts = @()
  $size = Get-Field $Item 'size'
  if ($null -ne (Get-Field $Item 'sha256')) { $parts += 'official sha256' }
  if ($null -ne (Get-Field $Item 'md5')) { $parts += 'official md5' }
  if ($null -ne $size) { $parts += "size $size" }
  if ($parts.Count -eq 0) { return 'no official hash - SHA-256 will be recorded' }
  return ($parts -join ', ')
}

# ---------------------------------------------------------------------------------------------------------
# 3. -ListOnly: print the list and stop. This block comes before any download code on purpose.
# ---------------------------------------------------------------------------------------------------------
if ($ListOnly) {
  Write-Line ("fetch-sources: {0} files in {1} (release tag {2}). List only - nothing is downloaded." -f $items.Count, $Manifest, $releaseTag) ''
  $index = 0
  foreach ($item in $items) {
    $index++
    $urls = @(Get-List (Get-Field $item 'urls'))
    Write-Line ("[{0}/{1}] {2}  ({3})" -f $index, $items.Count, (Get-Field $item 'file'), (Get-CheckText $item)) ''
    Write-Line ("      from {0}" -f $urls[0]) ''
  }
  exit 0
}

# ---------------------------------------------------------------------------------------------------------
# 4. Folder, hashing and download helpers.
# ---------------------------------------------------------------------------------------------------------
$outFull = $OutDir
if (-not [IO.Path]::IsPathRooted($outFull)) { $outFull = Join-Path $here $outFull }
$outFull = [IO.Path]::GetFullPath($outFull)
if ($VerifyOnly) {
  if (-not (Test-Path -LiteralPath $outFull -PathType Container)) {
    Stop-Script @("STOP  The folder does not exist: $OutDir") 1
  }
} else {
  [void][IO.Directory]::CreateDirectory($outFull)
}

function Get-Hashes([string]$Path, [bool]$WantMd5) {
  $result = @{
    Size = [int64](Get-Item -LiteralPath $Path).Length
    Sha256 = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
    Md5 = $null
  }
  if ($WantMd5) {
    try {
      $result.Md5 = (Get-FileHash -LiteralPath $Path -Algorithm MD5).Hash.ToLowerInvariant()
    } catch {
      $result.Md5 = 'unavailable'
    }
  }
  return $result
}

# Compare measured values with the official values of one list item.
function Test-SourceFile($Item, $Hashes) {
  $reasons = @()
  $basis = 'recorded'
  $size = Get-Field $Item 'size'
  $sha = Get-Field $Item 'sha256'
  $md5 = Get-Field $Item 'md5'
  if ($null -ne $size -and [int64]$size -ne [int64]$Hashes.Size) {
    $reasons += ("size is {0} bytes, the list says {1}" -f $Hashes.Size, $size)
  }
  if ($null -ne $sha) {
    $basis = 'sha256'
    if ($Hashes.Sha256 -ne $sha.ToLowerInvariant()) { $reasons += ("sha256 is {0}, the list says {1}" -f $Hashes.Sha256, $sha) }
  }
  if ($null -ne $md5) {
    if ($basis -eq 'recorded') { $basis = 'md5' }
    if ($Hashes.Md5 -ne $md5.ToLowerInvariant()) { $reasons += ("md5 is {0}, the list says {1}" -f $Hashes.Md5, $md5) }
  }
  $status = 'PASS'
  if ($reasons.Count -gt 0) { $status = 'FAIL' } elseif ($basis -eq 'recorded') { $status = 'RECORD' }
  return @{ Status = $status; Basis = $basis; Reasons = $reasons }
}

function Get-HttpStatus($ErrorRecord) {
  $exception = $ErrorRecord.Exception
  if ($exception -is [System.Net.WebException]) {
    $response = $exception.Response
    if ($null -ne $response -and ($response -is [System.Net.HttpWebResponse])) { return [int]$response.StatusCode }
  }
  return 0
}

# Antivirus software may hold a just-downloaded archive for a moment, so moving it is tried a few times.
function Move-FileWithRetry([string]$From, [string]$To) {
  for ($attempt = 1; $attempt -le 5; $attempt++) {
    try {
      Move-Item -LiteralPath $From -Destination $To -Force
      return
    } catch {
      if ($attempt -eq 5) { throw }
      Start-Sleep -Milliseconds (400 * $attempt)
    }
  }
}

# Download one address into <file>.part. A 404 or 410 is not tried again.
function Invoke-Fetch([string]$Url, [string]$Destination) {
  $part = $Destination + '.part'
  $message = ''
  for ($attempt = 1; $attempt -le $Retries; $attempt++) {
    if (Test-Path -LiteralPath $part) { Remove-Item -LiteralPath $part -Force }
    try {
      Invoke-WebRequest -Uri $Url -OutFile $part -UseBasicParsing -UserAgent $UserAgent -MaximumRedirection 10 -TimeoutSec 900
      return @{ Ok = $true; Part = $part; Error = '' }
    } catch {
      $message = $_.Exception.Message
      $status = Get-HttpStatus $_
      Write-Line ("      try {0}/{1} failed: {2}" -f $attempt, $Retries, $message) 'DarkYellow'
      if ($status -eq 404 -or $status -eq 410) { break }
      if ($attempt -lt $Retries) { Start-Sleep -Seconds (5 * $attempt) }
    }
  }
  if (Test-Path -LiteralPath $part) { Remove-Item -LiteralPath $part -Force }
  return @{ Ok = $false; Part = ''; Error = $message }
}

if (-not $VerifyOnly) {
  # Make sure TLS 1.2 can be used (older .NET defaults). SystemDefault already lets Windows choose.
  try {
    $protocols = [Net.ServicePointManager]::SecurityProtocol
    if ($protocols -ne [Net.SecurityProtocolType]::SystemDefault) {
      [Net.ServicePointManager]::SecurityProtocol = $protocols -bor [Net.SecurityProtocolType]::Tls12
    }
  } catch {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  }
}

# ---------------------------------------------------------------------------------------------------------
# 5. Download (or only check) every file.
# ---------------------------------------------------------------------------------------------------------
$mode = 'download'
if ($VerifyOnly) { $mode = 'verify-only' }
Write-Line ("fetch-sources: {0} files, release tag {1}, folder {2} ({3})" -f $items.Count, $releaseTag, $OutDir, $mode) ''
$results = New-Object 'System.Collections.Generic.List[object]'
$index = 0
foreach ($item in $items) {
  $index++
  $file = Get-Field $item 'file'
  $urls = @(Get-List (Get-Field $item 'urls'))
  $wantMd5 = ($null -ne (Get-Field $item 'md5'))
  $destination = Join-Path $outFull $file
  $watch = [Diagnostics.Stopwatch]::StartNew()
  Write-Line ("[{0}/{1}] {2}" -f $index, $items.Count, $file) ''

  $hashes = $null
  $check = $null
  $from = 'folder'
  $usedUrl = ''
  $attemptNotes = @()
  $present = $false
  $crashed = $false
  try {
    if (Test-Path -LiteralPath $destination -PathType Container) {
      # Move-Item would put the file inside that folder instead of replacing it.
      throw "a folder named $file is in the way - move or delete that folder"
    }
    $present = Test-Path -LiteralPath $destination -PathType Leaf
    if ($present -and $Force -and -not $VerifyOnly) {
      Remove-Item -LiteralPath $destination -Force
      $present = $false
    }
    if ($present) {
      $hashes = Get-Hashes $destination $wantMd5
      $check = Test-SourceFile $item $hashes
      if ($check.Status -eq 'FAIL' -and -not $VerifyOnly) {
        Write-Line '      the file already in the folder does not match - downloading it again' 'DarkYellow'
        Remove-Item -LiteralPath $destination -Force
        $present = $false
        $hashes = $null
        $check = $null
      }
    }
    if (-not $present -and -not $VerifyOnly) {
      foreach ($url in $urls) {
        Write-Line ("      GET {0}" -f $url) 'Gray'
        $fetch = Invoke-Fetch $url $destination
        if (-not $fetch.Ok) {
          $attemptNotes += ("{0}: download failed: {1}" -f $url, $fetch.Error)
          continue
        }
        $hashes = Get-Hashes $fetch.Part $wantMd5
        $check = Test-SourceFile $item $hashes
        if ($check.Status -eq 'FAIL') {
          Remove-Item -LiteralPath $fetch.Part -Force
          $mismatch = ($check.Reasons -join '; ')
          $attemptNotes += ("{0}: {1}" -f $url, $mismatch)
          Write-Line ("      this address gave a different file: {0}" -f $mismatch) 'DarkYellow'
          continue
        }
        Move-FileWithRetry $fetch.Part $destination
        $from = 'download'
        $usedUrl = $url
        break
      }
    }
  } catch {
    # Anything else (disk full, a file locked by antivirus ...) fails only this file; the other files go on
    # and the result files are still written.
    $crashed = $true
    $attemptNotes += ('unexpected error: ' + $_.Exception.Message)
    try {
      if (Test-Path -LiteralPath ($destination + '.part')) { Remove-Item -LiteralPath ($destination + '.part') -Force }
    } catch {
    }
  }

  $status = 'FAIL'
  $basis = ''
  $reasons = @()
  if ($crashed) {
    $reasons = @($attemptNotes)
    $hashes = $null
  } else {
    if ($null -ne $check) {
      $status = $check.Status
      $basis = $check.Basis
      $reasons = @($check.Reasons)
    }
    if (-not $present -and $VerifyOnly) {
      $status = 'MISSING'
      $reasons = @('the file is not in the folder')
    } elseif ($status -eq 'FAIL' -and $attemptNotes.Count -gt 0) {
      # Every address was tried: say what each one gave (a later 404 must not hide an earlier hash mismatch).
      $reasons = @($attemptNotes)
    }
  }
  if ($status -eq 'FAIL' -and -not $VerifyOnly) {
    # A failed file is never kept, so SHA256SUMS.txt can only list checked files.
    $hashes = $null
  }
  $seconds = [Math]::Round($watch.Elapsed.TotalSeconds, 1)

  $size = $null
  $sha = $null
  $md5 = $null
  if ($null -ne $hashes) {
    $size = $hashes.Size
    $sha = $hashes.Sha256
    $md5 = $hashes.Md5
  }
  $color = 'Green'
  if ($status -eq 'RECORD') { $color = 'Cyan' }
  if ($status -eq 'FAIL' -or $status -eq 'MISSING') { $color = 'Red' }
  if ($status -eq 'PASS' -or $status -eq 'RECORD') {
    $how = 'official ' + $basis
    if ($status -eq 'RECORD') { $how = 'no official hash, recorded' }
    Write-Line ("      {0,-7} {1} bytes, sha256 {2} ({3}, {4}, {5} s)" -f $status, $size, $sha, $how, $from, $seconds) $color
  } else {
    Write-Line ("      {0,-7} {1}" -f $status, ($reasons -join '; ')) $color
  }

  $results.Add([pscustomobject][ordered]@{
    id = Get-Field $item 'id'
    file = $file
    status = $status
    basis = $basis
    bytes = $size
    sha256 = $sha
    md5 = $md5
    expectedBytes = Get-Field $item 'size'
    expectedSha256 = Get-Field $item 'sha256'
    expectedMd5 = Get-Field $item 'md5'
    from = $from
    url = $usedUrl
    seconds = $seconds
    problem = ($reasons -join '; ')
  })
}

# ---------------------------------------------------------------------------------------------------------
# 6. SHA256SUMS.txt, fetch-result.json, fetch-result.txt and the summary.
# ---------------------------------------------------------------------------------------------------------
$pass = @($results | Where-Object { $_.status -eq 'PASS' }).Count
$record = @($results | Where-Object { $_.status -eq 'RECORD' }).Count
$fail = @($results | Where-Object { $_.status -eq 'FAIL' }).Count
$missing = @($results | Where-Object { $_.status -eq 'MISSING' }).Count
$kept = @($results | Where-Object { $_.status -eq 'PASS' -or $_.status -eq 'RECORD' })
$totalBytes = [int64]0
foreach ($result in $kept) { $totalBytes += [int64]$result.bytes }
$finishedAt = [DateTime]::UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'", [Globalization.CultureInfo]::InvariantCulture)

$utf8 = New-Object System.Text.UTF8Encoding($false)
$sums = New-Object System.Text.StringBuilder
foreach ($result in $kept) { [void]$sums.Append(("{0}  {1}`n" -f $result.sha256, $result.file)) }
[IO.File]::WriteAllText((Join-Path $outFull 'SHA256SUMS.txt'), $sums.ToString(), $utf8)

$report = [ordered]@{
  tool = 'scripts/release/fetch-sources.ps1'
  schema = 1
  releaseTag = $releaseTag
  mode = $mode
  finishedAt = $finishedAt
  powershell = $PSVersionTable.PSVersion.ToString()
  counts = [ordered]@{ pass = $pass; record = $record; fail = $fail; missing = $missing; total = $results.Count }
  keptBytes = $totalBytes
  files = @($results.ToArray())
}
[IO.File]::WriteAllText((Join-Path $outFull 'fetch-result.json'), (ConvertTo-Json -InputObject $report -Depth 6), $utf8)

$block = New-Object 'System.Collections.Generic.List[string]'
$block.Add('===== BEGIN fetch-sources result =====')
$block.Add(("fetch-sources {0} tag={1} mode={2} powershell={3}" -f $finishedAt, $releaseTag, $mode, $report.powershell))
foreach ($result in $results) {
  $size = '-'
  $sha = '-'
  if ($null -ne $result.bytes) { $size = $result.bytes }
  if ($null -ne $result.sha256) { $sha = $result.sha256 }
  $line = "{0,-7} {1} {2} {3}" -f $result.status, $result.file, $size, $sha
  if ($result.problem) { $line = "$line | $($result.problem)" }
  $block.Add($line)
}
$block.Add(("SUMMARY pass={0} record={1} fail={2} missing={3} total={4} bytes={5}" -f $pass, $record, $fail, $missing, $results.Count, $totalBytes))
$block.Add('===== END fetch-sources result =====')
[IO.File]::WriteAllText((Join-Path $outFull 'fetch-result.txt'), (($block.ToArray() -join "`n") + "`n"), $utf8)

Write-Line '' ''
$summaryColor = 'Green'
if ($fail -gt 0 -or $missing -gt 0) { $summaryColor = 'Red' }
Write-Line ("Summary: {0} PASS, {1} RECORD, {2} FAIL, {3} MISSING - {4:N1} MB kept in {5}" -f $pass, $record, $fail, $missing, ($totalBytes / 1MB), $OutDir) $summaryColor
if ($fail -gt 0 -or $missing -gt 0) {
  Write-Line 'Some files are not ready. Run the same command again later; if it still fails, tell Claude the lines above.' 'Yellow'
} else {
  Write-Line 'Next: tell Claude that fetch-sources finished. Claude reads .cache\release-sources\fetch-result.json.' 'Green'
}
Write-Line '(You can also copy everything from BEGIN to END below and paste it to Claude.)' ''
foreach ($line in $block) { Write-Line $line '' }
if ($fail -gt 0 -or $missing -gt 0) { exit 1 }
exit 0
