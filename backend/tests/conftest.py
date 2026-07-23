"""Shared pytest setup for the backend test suite.

Puts backend/ on sys.path so unit tests can `import broker_connectors...` /
`import routes...`, and sets placeholder env vars so that importing `core`
(pulled in transitively by the route modules) doesn't KeyError on a machine
without a real .env. Motor connects lazily, so the placeholder Mongo URL is
never actually dialled by the pure-logic unit tests. Uses setdefault, so a
real .env / CI value always wins for the live integration tests.
"""
import os
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "wallet76_test")
os.environ.setdefault("JWT_SECRET", "test-secret-not-used")
