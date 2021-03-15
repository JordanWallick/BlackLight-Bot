@echo off
color 0b
title BlackLight-Bot Update
git pull
cd ./BlackLight_Bot_Source
call npm install
cls
call RunBot.bat