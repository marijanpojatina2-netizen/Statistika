"""Upravljanje korisnicima aplikacije (var/users.json).

    python3 tools/users.py add <ime>       # pita lozinku
    python3 tools/users.py list
"""
import getpass
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from api import auth, db  # noqa: E402

if __name__ == "__main__":
    db.VAR.mkdir(parents=True, exist_ok=True)
    if len(sys.argv) >= 3 and sys.argv[1] == "add":
        pw = sys.argv[3] if len(sys.argv) > 3 else getpass.getpass("lozinka: ")
        auth.set_user(sys.argv[2], pw)
        print("spremljeno:", sys.argv[2])
    elif len(sys.argv) >= 2 and sys.argv[1] == "list":
        print("\n".join(auth.list_users()) or "(nema korisnika)")
    else:
        print(__doc__)
