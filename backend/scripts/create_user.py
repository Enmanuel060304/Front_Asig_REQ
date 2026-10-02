"""Crea o actualiza un usuario de la app.

Uso (desde backend/):  python -m scripts.create_user <usuario>
"""
import getpass
import sys

from app.db import get_connection
from app.security import hash_password


def main():
    if len(sys.argv) != 2:
        sys.exit("Uso: python -m scripts.create_user <usuario>")
    username = sys.argv[1]
    password = getpass.getpass("Contraseña: ")
    if password != getpass.getpass("Repite la contraseña: "):
        sys.exit("Las contraseñas no coinciden")

    with get_connection() as conn:
        conn.cursor().execute(
            "MERGE dbo.AppUsuarios AS t USING (SELECT ? AS Username, ? AS PasswordHash) AS s "
            "ON t.Username = s.Username "
            "WHEN MATCHED THEN UPDATE SET PasswordHash = s.PasswordHash, Activo = 1 "
            "WHEN NOT MATCHED THEN INSERT (Username, PasswordHash) VALUES (s.Username, s.PasswordHash);",
            username, hash_password(password),
        )
        conn.commit()
    print(f"Usuario '{username}' guardado.")


if __name__ == "__main__":
    main()
