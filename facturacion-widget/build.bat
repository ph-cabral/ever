@echo off
REM ============================================================
REM  Construye Facturacion.exe (Windows, un solo archivo).
REM  - Si hay un entorno virtual ACTIVADO, usa ese Python.
REM  - Si no, usa el Python del sistema.
REM  El .exe resultante NO necesita Python en las otras PCs.
REM ============================================================
setlocal
cd /d "%~dp0"

if defined VIRTUAL_ENV (
  set "PY=python"
  echo Usando entorno virtual: %VIRTUAL_ENV%
) else (
  where py >nul 2>nul && (set "PY=py") || (set "PY=python")
  echo Usando Python del sistema ^(no hay venv activado^).
)

echo.
echo Instalando PyInstaller en el entorno actual ^(si hace falta^)...
%PY% -m pip install --upgrade pyinstaller || goto :error

echo.
echo Compilando Facturacion.exe ...
%PY% -m PyInstaller --onefile --noconsole --name Facturacion facturacion.py || goto :error

echo.
echo ============================================================
echo  LISTO. El ejecutable quedo en:  dist\Facturacion.exe
echo  Copialo a cualquier PC Windows y ejecutalo (no instala nada).
echo  Acordate de poner credenciales.json al lado del .exe.
echo ============================================================
pause
exit /b 0

:error
echo.
echo *** Ocurrio un error en la compilacion. Revisa el mensaje de arriba. ***
pause
exit /b 1
