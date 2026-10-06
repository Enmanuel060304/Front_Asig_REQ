"""Arranca el backend en modo demo (sin SQL Server, datos ficticios en memoria).

Uso (desde backend/):  python -m scripts.demo     — usuario: demo / contraseña: demo
"""
import os
import threading
import webbrowser

os.environ.setdefault("ENV_FILE", ".env.demo")

import uvicorn  # noqa: E402

if __name__ == "__main__":
    threading.Timer(2, webbrowser.open, ["http://localhost:8000"]).start()
    uvicorn.run("app.main:app", port=8000, reload=True)
