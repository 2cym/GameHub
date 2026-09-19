@echo off
chcp 65001 >nul
title DNS 恢复脚本（Win10/11 通用）
color 0C

echo ============================================
echo   DNS 恢复脚本 - 恢复为自动获取
echo   适用: Windows 10 21H2+ / Windows 11
echo ============================================
echo.

:: ===== 检查管理员权限 =====
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 请以管理员身份运行本脚本！
    echo        右键本文件 - 以管理员身份运行
    echo.
    pause
    exit /b 1
)

:: ===== 获取活动网络适配器 =====
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(Get-NetAdapter | Where-Object {$_.Status -eq 'Up'} | Select-Object -First 1).Name"`) do set "adapter=%%i"

if "%adapter%"=="" (
    echo [错误] 未找到已连接的网络适配器
    pause
    exit /b 1
)

echo 检测到网络适配器: %adapter%
echo.

:: ===== 恢复 DNS 为自动获取 =====
echo [1/3] 恢复 IPv4 DNS 为自动获取 ...
netsh interface ip set dns name="%adapter%" dhcp >nul 2>&1

echo [2/3] 恢复 IPv6 DNS 为自动获取 ...
netsh interface ipv6 set dns name="%adapter%" dhcp >nul 2>&1

:: ===== 移除 DoH 注册表策略 =====
echo [3/3] 移除 DoH 加密策略 ...
reg delete "HKLM\SOFTWARE\Policies\Microsoft\Windows\DnsClient" /v EnableAutoDoh /f >nul 2>&1
reg delete "HKLM\SOFTWARE\Policies\Microsoft\Windows\DnsClient" /v DohTemplate /f >nul 2>&1
reg delete "HKLM\SOFTWARE\Policies\Microsoft\Windows\DnsClient" /v DohFallback /f >nul 2>&1

:: 重启 DNS 客户端服务
net stop dnscache >nul 2>&1
net start dnscache >nul 2>&1

:: 刷新缓存
ipconfig /flushdns >nul 2>&1

echo.
echo ============================================
echo   已恢复为自动获取 DNS
echo ============================================
echo.
pause
