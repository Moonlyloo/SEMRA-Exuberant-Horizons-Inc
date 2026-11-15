@echo off
title Astronaut Health Monitoring System - Web Server
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1" -Port 8080
