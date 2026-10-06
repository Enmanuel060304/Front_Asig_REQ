"""Arranca el backend en modo demo (sin SQL Server, datos ficticios en memoria).

Uso (desde backend/):  python -m scripts.demo     — usuario: demo / contraseña: demo
"""
import os
import socket
import sys
import threading
import webbrowser

os.environ.setdefault("ENV_FILE", ".env.demo")

import uvicorn  # noqa: E402

PUERTO = 8000

if __name__ == "__main__":
    with socket.socket() as s:
        if s.connect_ex(("127.0.0.1", PUERTO)) == 0:
            sys.exit(
                f"El puerto {PUERTO} ya está en uso (probablemente una demo anterior que no se cerró, y el navegador "
                "abriría esa versión vieja).\nCierra ese proceso y vuelve a ejecutar. En PowerShell: "
                f"Stop-Process -Id (Get-NetTCPConnection -LocalPort {PUERTO} -State Listen).OwningProcess"
            )
    threading.Timer(2, webbrowser.open, [f"http://localhost:{PUERTO}"]).start()
    uvicorn.run("app.main:app", port=PUERTO, reload=True)
