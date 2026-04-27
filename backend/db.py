import os
from contextlib import contextmanager
from datetime import date, datetime, time, timedelta
from pathlib import Path

import mysql.connector


def load_env_file():
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if not env_path.exists():
        return

    for raw_line in env_path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


load_env_file()


def get_connection():
    return mysql.connector.connect(
        host=os.getenv("MYSQL_HOST", "127.0.0.1"),
        port=int(os.getenv("MYSQL_PORT", "3306")),
        database=os.getenv("MYSQL_DATABASE", "DB Project"),
        user=os.getenv("MYSQL_USER", "root"),
        password=os.getenv("MYSQL_PASSWORD", ""),
    )


@contextmanager
def db_cursor(commit=False):
    connection = get_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        yield connection, cursor
        if commit:
            connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        cursor.close()
        connection.close()


def to_json_value(value):
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d %H:%M:%S")
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, time):
        return value.strftime("%H:%M:%S")
    if isinstance(value, timedelta):
        total_seconds = int(value.total_seconds())
        hours = total_seconds // 3600
        minutes = (total_seconds % 3600) // 60
        seconds = total_seconds % 60
        return f"{hours:02d}:{minutes:02d}:{seconds:02d}"
    return value


def serialize_row(row):
    return {key: to_json_value(value) for key, value in row.items()}


def fetch_all(sql, params=None):
    with db_cursor() as (_, cursor):
        cursor.execute(sql, params or ())
        return [serialize_row(row) for row in cursor.fetchall()]


def fetch_one(sql, params=None):
    with db_cursor() as (_, cursor):
        cursor.execute(sql, params or ())
        row = cursor.fetchone()
        return serialize_row(row) if row else None
