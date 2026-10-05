<#
  Posts the build result and the zipped Playwright report to a Discord channel.
  Called by the Jenkinsfile after every build.

  The webhook URL comes from the DISCORD_WEBHOOK environment variable (Jenkins
  credential "discord-webhook"). Never put it in the repo: anyone who has it
  can post to the channel.

  Try it locally without sending anything (after `npm test`):
    powershell -ExecutionPolicy Bypass -File scripts\notify-discord.ps1 -Status SUCCESS -Build 1 -DryRun
#>
param(
  [Parameter(Mandatory)] [string] $Status, # SUCCESS | UNSTABLE | FAILURE | ABORTED
  [Parameter(Mandatory)] [string] $Build,
  [switch] $DryRun
)

$ErrorActionPreference = 'Stop'

# git prints UTF-8, but under Jenkins the console uses the Windows code page
# (CP852 for Czech), so letters like S-caron in commit authors/messages broke.
# The script itself stays ASCII-only: PowerShell 5.1 misreads BOM-less UTF-8.
# Read program output as UTF-8 instead. try: there may be no console at all.
try { [Console]::OutputEncoding = New-Object Text.UTF8Encoding $false } catch { }

$junitPath = 'test-results\junit.xml'
$reportDir = 'playwright-report'
$zipPath = 'playwright-report.zip'
$maxUpload = 9MB          # Discord refuses webhook files over 10 MB
$maxFailuresListed = 10   # keeps the message short when many tests fail

# --- Test counts and failed test names from the JUnit file Playwright writes ---
$lines = @()
if (Test-Path $junitPath) {
  [xml] $junit = Get-Content -Raw -Encoding UTF8 $junitPath
  $all = $junit.testsuites
  $failedCount = [int] $all.failures + [int] $all.errors
  $passedCount = [int] $all.tests - $failedCount - [int] $all.skipped
  $lines += "**Passed:** $passedCount | **Failed:** $failedCount | **Skipped:** $($all.skipped)"

  # hostname = Playwright project (unit, chromium, firefox, webkit)
  $failed = @(foreach ($suite in $all.testsuite) {
    foreach ($case in $suite.testcase) {
      if ($case.failure -or $case.error) { "- [$($suite.hostname)] $($case.classname): $($case.name)" }
    }
  })
  if ($failed.Count -gt 0) {
    $lines += ''
    $lines += '**Failed tests:**'
    $lines += $failed | Select-Object -First $maxFailuresListed
    if ($failed.Count -gt $maxFailuresListed) { $lines += "...and $($failed.Count - $maxFailuresListed) more (see the report)" }
  }
} else {
  $lines += 'No test results: the build stopped before the tests ran. See the Jenkins log.'
}

# Who and what triggered the build, so the team knows whose change it was.
try {
  $commit = git log -1 --format='%h %s (%an)'
  if ($commit) { $lines = @("**Commit:** $commit", '') + $lines }
} catch { }

# --- Zip the HTML report (it is a folder) ---
$attach = $false
if (Test-Path $reportDir) {
  Compress-Archive -Path "$reportDir\*" -DestinationPath $zipPath -Force
  if ((Get-Item $zipPath).Length -le $maxUpload) {
    $attach = $true
    $lines += ''
    $lines += 'Report attached: unzip it and open index.html.'
  } else {
    $lines += ''
    $lines += 'Report is too big for Discord; it is archived in Jenkins.'
  }
}

$color = switch ($Status) {
  'SUCCESS' { 3066993 }   # green
  'FAILURE' { 15158332 }  # red
  default   { 15105570 }  # orange (UNSTABLE, ABORTED)
}

$payload = @{
  username = 'Jenkins'
  embeds   = @(@{
    title       = "Space_Shooter #$Build - $Status"
    description = ($lines -join "`n")
    color       = $color
  })
} | ConvertTo-Json -Depth 5

if ($DryRun) {
  Write-Output $payload
  Write-Output "Attachment: $(if ($attach) { $zipPath } else { 'none' })"
  exit 0
}

if (-not $env:DISCORD_WEBHOOK) {
  Write-Warning 'DISCORD_WEBHOOK is not set, nothing sent.'
  exit 0
}

# curl reads the JSON from a file (`<file`), which avoids quoting problems.
# UTF-8 without BOM, because Discord rejects JSON that starts with a BOM.
$payloadFile = Join-Path $env:TEMP "discord-payload-$Build.json"
[IO.File]::WriteAllText($payloadFile, $payload, (New-Object Text.UTF8Encoding $false))

$curlArgs = @('-sS', '--fail-with-body', '-F', "payload_json=<$payloadFile")
if ($attach) { $curlArgs += @('-F', "file=@$zipPath") }
& curl.exe @curlArgs $env:DISCORD_WEBHOOK
$curlExit = $LASTEXITCODE
Remove-Item $payloadFile -ErrorAction SilentlyContinue

# A Discord outage must not turn a green build red, so only warn.
if ($curlExit -ne 0) { Write-Warning "Sending to Discord failed (curl exit $curlExit)." }
exit 0
