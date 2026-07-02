#!/usr/bin/env python3
"""
Wallet76 — Port availability check.

Verifica se uma porta TCP local já está ocupada, para evitar arrancar dois
backends em simultâneo (ou colidir com outro processo) antes do dev começar.

Usage:
    python scripts/check_port.py <porta>

Exit code 0 = porta livre.
Exit code 1 = porta ocupada.
"""
import socket
import sys


def port_in_use(port: int, host: str = "127.0.0.1") -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex((host, port)) == 0


def main():
    if len(sys.argv) != 2:
        print("Uso: python scripts/check_port.py <porta>")
        sys.exit(2)

    try:
        port = int(sys.argv[1])
    except ValueError:
        print(f"Porta inválida: {sys.argv[1]!r}")
        sys.exit(2)

    if port_in_use(port):
        print(f"✗ Porta {port} já está ocupada — provavelmente outro processo (ex: uvicorn) já a correr.")
        print(f"  Termina esse processo antes de continuar, ou muda a porta em backend/.env / start_dev.sh.")
        sys.exit(1)

    print(f"✓ Porta {port} está livre.")
    sys.exit(0)


if __name__ == "__main__":
    main()
