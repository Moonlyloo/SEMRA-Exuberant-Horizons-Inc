@echo off
title Stop Astronaut Health Monitoring System
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$pidFile = Join-Path '%~dp0' '.server.pid'; " ^
  "if (Test-Path $pidFile) { " ^
  "  $info = (Get-Content $pidFile -ErrorAction SilentlyContinue) -split ':'; " ^
  "  Remove-Item $pidFile -Force -ErrorAction SilentlyContinue; " ^
  "  if ($info[0]) { Stop-Process -Id ([int]$info[0]) -Force -ErrorAction SilentlyContinue } " ^
  "} " ^
  "Write-Host 'Astronaut Health System web server stopped.' -ForegroundColor Green; " ^
  "Start-Sleep -Seconds 1"
