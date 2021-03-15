@echo off
color 0b
title BlackLight-Bot Update
git fetch
git reset --hard HEAD
git merge '@{u}'
cd ./BlackLight_Bot_Source
call npm install
cls
call RunBot.bat