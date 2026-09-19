@echo off
chcp 65001 >nul
title DoH 一键设置（Win10/11 通用）
color 0A

echo ============================================
echo   DoH 一键设置 - 绕过 DNS 污染
echo   适用: Windows 10 21H2+ / Windows 11
echo   参考: zhuanlan.zhihu.com/p/590105276
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

:: ===== 检查系统版本 =====
for /f "usebackq delims=" %%v in (`powershell -NoProfile -Command "[Environment]::OSVersion.Version.Build"`) do set "build=%%v"
echo 系统 Build 号: %build%
if %build% LSS 19044 (
    echo [警告] 当前系统低于 Win10 21H2 (Build 19044)，不支持原生 DoH。
    echo        将仅设置 DNS 服务器，无法启用加密。
    echo.
) else (
    echo [OK] 系统支持原生 DoH
    echo.
)

:: ===== 获取活动网络适配器 =====
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(Get-NetAdapter | Where-Object {$_.Status -eq 'Up'} | Select-Object -First 1).Name"`) do set "adapter=%%i"

if "%adapter%"=="" (
    echo [错误] 未找到已连接的网络适配器
    echo        请手动在网络设置中配置 DNS
    pause
    exit /b 1
)

echo 检测到网络适配器: %adapter%
echo.

:: ===== IPv4 DNS =====
echo [1/5] 设置 IPv4 首选 DNS: 119.29.29.29 (腾讯DNSPod) ...
netsh interface ip set dns name="%adapter%" static 119.29.29.29 primary >nul 2>&1

echo [2/5] 设置 IPv4 备用 DNS: 223.5.5.5 (阿里) ...
netsh interface ip add dns name="%adapter%" 223.5.5.5 index=2 >nul 2>&1

:: ===== IPv6 DNS =====
echo [3/5] 设置 IPv6 DNS: 2402:4e00:: (腾讯) + 2400:3200::1 (阿里) ...
netsh interface ipv6 set dns name="%adapter%" static 2402:4e00:: primary >nul 2>&1
netsh interface ipv6 add dns name="%adapter%" 2400:3200::1 index=2 >nul 2>&1

:: ===== 启用 DoH（注册表策略，Win10 21H2+ / Win11 通用） =====
if %build% GEQ 19044 (
    echo [4/5] 启用 DoH 加密 (腾讯+阿里) ...
    reg add "HKLM\SOFTWARE\Policies\Microsoft\Windows\DnsClient" /v EnableAutoDoh /t REG_DWORD /d 2 /f >nul 2>&1
    reg add "HKLM\SOFTWARE\Policies\Microsoft\Windows\DnsClient" /v DohTemplate /t REG_SZ /d "https://doh.pub/dns-query https://dns.alidns.com/dns-query" /f >nul 2>&1
    reg add "HKLM\SOFTWARE\Policies\Microsoft\Windows\DnsClient" /v DohFallback /t REG_DWORD /d 0 /f >nul 2>&1

    :: 重启 DNS 客户端服务使注册表生效
    net stop dnscache >nul 2>&1
    net start dnscache >nul 2>&1
) else (
    echo [4/5] 跳过 DoH 配置 (系统不支持)
)

:: ===== 刷新缓存 =====
echo [5/5] 刷新本地 DNS 缓存 ...
ipconfig /flushdns >nul 2>&1

echo.
echo ============================================
echo   设置完成！
echo ============================================
echo.
echo   IPv4 首选:  119.29.29.29  (腾讯DNSPod, DoH)
echo   IPv4 备用:  223.5.5.5     (阿里, DoH)
echo   IPv6 首选:  2402:4e00::   (腾讯DNSPod, DoH)
echo   IPv6 备用:  2400:3200::1  (阿里, DoH)
echo.
echo   Do
