param(
  [int]$Port = 8080,
  [switch]$NoBrowser,
  [switch]$AppWindow
)

$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$PidFile = Join-Path $RootDir ".server.pid"

$MimeTypes = @{
  ".html" = "text/html; charset=utf-8"
  ".js"   = "application/javascript; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".svg"  = "image/svg+xml"
  ".png"  = "image/png"
  ".jpg"  = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".ico"  = "image/x-icon"
  ".md"   = "text/markdown; charset=utf-8"
}

$Listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
try {
  $Listener.Start()
} catch {
  for ($p = 8081; $p -le 8099; $p++) {
    try {
      $Listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $p)
      $Listener.Start()
      $Port = $p
      break
    } catch {}
  }
}

try {
  Set-Content -Path $PidFile -Value "$PID`:$Port" -Encoding ASCII -Force
} catch {}

try {
  [Console]::TreatControlCAsInput = $true
} catch {}

$Url = "http://localhost:$Port"
Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Astronaut Health Monitoring System - Web App" -ForegroundColor Green
Write-Host "  Running at: $Url" -ForegroundColor Yellow
Write-Host "  To stop: Press Q, Esc, Ctrl+C, or close this window," -ForegroundColor Gray
Write-Host "           or double-click stop-webapp.bat" -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

if (-not $NoBrowser) {
  if ($AppWindow) {
    $edge = Get-Command "msedge.exe" -ErrorAction SilentlyContinue
    if (-not $edge) {
      $edgePath = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
      if (Test-Path $edgePath) { $edge = $edgePath }
    } else {
      $edge = $edge.Source
    }
    if ($edge) {
      Start-Process $edge -ArgumentList "--app=$Url"
    } else {
      Start-Process $Url
    }
  } else {
    Start-Process $Url
  }
}

$Running = $true
try {
  while ($Running) {
    try {
      if ([Console]::KeyAvailable) {
        $Key = [Console]::ReadKey($true)
        if (
          $Key.Key -eq [ConsoleKey]::Q -or
          $Key.Key -eq [ConsoleKey]::Escape -or
          (($Key.Modifiers -band [ConsoleModifiers]::Control) -and $Key.Key -eq [ConsoleKey]::C)
        ) {
          Write-Host "`nStopping Astronaut Health System server..." -ForegroundColor Yellow
          break
        }
      }
    } catch {}

    if (-not (Test-Path $PidFile)) {
      Write-Host "`nStop signal received. Shutting down server..." -ForegroundColor Yellow
      break
    }

    if (-not $Listener.Pending()) {
      Start-Sleep -Milliseconds 50
      continue
    }
    $Client = $Listener.AcceptTcpClient()
    try {
      $Stream = $Client.GetStream()
      $Stream.ReadTimeout = 5000
      $Reader = New-Object System.IO.StreamReader($Stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
      $RequestLine = $Reader.ReadLine()
      if ([string]::IsNullOrEmpty($RequestLine)) {
        $Client.Close()
        continue
      }
      while ($true) {
        $HeaderLine = $Reader.ReadLine()
        if ([string]::IsNullOrEmpty($HeaderLine)) { break }
      }

      $Parts = $RequestLine -split " "
      $RawPath = if ($Parts.Length -ge 2) { $Parts[1] } else { "/" }
      $CleanPath = ($RawPath -split "\?")[0]
      $CleanPath = [System.Uri]::UnescapeDataString($CleanPath)

      if ($CleanPath -eq "/__stop") {
        $StopBytes = [System.Text.Encoding]::UTF8.GetBytes("Server stopped.")
        $Header = "HTTP/1.1 200 OK`r`nContent-Type: text/plain; charset=utf-8`r`nContent-Length: $($StopBytes.Length)`r`nConnection: close`r`n`r`n"
        $HeaderBytes = [System.Text.Encoding]::ASCII.GetBytes($Header)
        $Stream.Write($HeaderBytes, 0, $HeaderBytes.Length)
        $Stream.Write($StopBytes, 0, $StopBytes.Length)
        $Stream.Flush()
        $Running = $false
        break
      }

      if ($CleanPath -eq "/" -or [string]::IsNullOrWhiteSpace($CleanPath)) {
        $CleanPath = "/index.html"
      }

      $RelativePath = $CleanPath.TrimStart("/").Replace("/", [System.IO.Path]::DirectorySeparatorChar)
      $TargetFile = [System.IO.Path]::GetFullPath((Join-Path $RootDir $RelativePath))

      if (-not $TargetFile.StartsWith($RootDir, [System.StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path $TargetFile -PathType Leaf)) {
        $NotFoundBytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
        $Header = "HTTP/1.1 404 Not Found`r`nContent-Type: text/plain; charset=utf-8`r`nContent-Length: $($NotFoundBytes.Length)`r`nConnection: close`r`n`r`n"
        $HeaderBytes = [System.Text.Encoding]::ASCII.GetBytes($Header)
        $Stream.Write($HeaderBytes, 0, $HeaderBytes.Length)
        $Stream.Write($NotFoundBytes, 0, $NotFoundBytes.Length)
      } else {
        $Ext = [System.IO.Path]::GetExtension($TargetFile).ToLowerInvariant()
        $ContentType = if ($MimeTypes.ContainsKey($Ext)) { $MimeTypes[$Ext] } else { "application/octet-stream" }
        $BodyBytes = [System.IO.File]::ReadAllBytes($TargetFile)
        $Header = "HTTP/1.1 200 OK`r`nContent-Type: $ContentType`r`nContent-Length: $($BodyBytes.Length)`r`nCache-Control: no-cache`r`nConnection: close`r`n`r`n"
        $HeaderBytes = [System.Text.Encoding]::ASCII.GetBytes($Header)
        $Stream.Write($HeaderBytes, 0, $HeaderBytes.Length)
        $Stream.Write($BodyBytes, 0, $BodyBytes.Length)
      }
      $Stream.Flush()
    } catch {
      # Ignore transient client disconnect errors
    } finally {
      $Client.Close()
    }
  }
} finally {
  $Listener.Stop()
  Remove-Item -Path $PidFile -Force -ErrorAction SilentlyContinue
}
