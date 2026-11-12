#!/usr/bin/env python3
"""Synthetic in-memory SQLite JSON-lines test bridge. No user data, files or network."""
import json
import sqlite3
import sys

conn = sqlite3.connect(':memory:', isolation_level=None)
conn.row_factory = sqlite3.Row

def params(values):
    return [bytes.fromhex(v['hex']) if isinstance(v, dict) and set(v) == {'hex'} else v for v in values]

for raw in sys.stdin:
    try:
        request = json.loads(raw)
        command = request['command']
        if command == 'begin':
            conn.execute('BEGIN IMMEDIATE')
            result = None
        elif command == 'commit':
            conn.execute('COMMIT')
            result = None
        elif command == 'rollback':
            conn.execute('ROLLBACK')
            result = None
        elif command in ('run', 'get', 'all'):
            cursor = conn.execute(request['sql'], params(request.get('params', [])))
            if command == 'run':
                result = {'changes': max(0, cursor.rowcount)}
            elif command == 'get':
                row = cursor.fetchone()
                result = dict(row) if row else None
            else:
                result = [dict(row) for row in cursor.fetchall()]
        else:
            raise RuntimeError('UNKNOWN_COMMAND')
        print(json.dumps({'id': request['id'], 'result': result}), flush=True)
    except Exception as error:
        print(json.dumps({'id': request.get('id'), 'error': str(error)[:400]}), flush=True)
