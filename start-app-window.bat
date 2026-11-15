@echo off
title Astronaut Health Monitoring System - Standalone App Mode
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1" -Port 8080 -AppWindow
