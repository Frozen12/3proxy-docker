"""
Database abstraction layer with PostgreSQL primary and SQLite fallback.
Stores all data: logs, commands, state, and rclone config contents.
"""

import os
import sqlite3
import json
from datetime import datetime
from typing import Optional, Dict, Any, List, Tuple

# Try to import psycopg2 for PostgreSQL
try:
    import psycopg2
    import psycopg2.extras
    POSTGRESQL_AVAILABLE = True
except ImportError:
    POSTGRESQL_AVAILABLE = False
    print("psycopg2 not available, using SQLite fallback")

# Database paths
BASE_CONFIG_DIR = os.path.join(os.path.expanduser('~'), '.config', 'rclone')
SQLITE_PATH = os.path.join(BASE_CONFIG_DIR, 'webgui.db')

# Ensure base config dir exists
os.makedirs(BASE_CONFIG_DIR, exist_ok=True)


def get_db_connection():
    """
    Get database connection. Tries PostgreSQL first, falls back to SQLite.
    Returns (connection, db_type) where db_type is 'postgresql' or 'sqlite'.
    """
    # Try PostgreSQL first
    database_url = os.environ.get('DATABASE_URL')
    if database_url and POSTGRESQL_AVAILABLE:
        try:
            conn = psycopg2.connect(database_url)
            conn.autocommit = True
            return conn, 'postgresql'
        except Exception as e:
            print(f"PostgreSQL connection failed: {e}. Falling back to SQLite.")
    
    # Fallback to SQLite
    os.makedirs(BASE_CONFIG_DIR, exist_ok=True)
    conn = sqlite3.connect(SQLITE_PATH)
    conn.row_factory = sqlite3.Row
    return conn, 'sqlite'


def init_db():
    """Initialize database with all required tables."""
    conn, db_type = get_db_connection()
    cursor = conn.cursor()
    
    if db_type == 'postgresql':
        _init_postgresql(cursor)
    else:
        _init_sqlite(cursor)
    
    conn.commit()
    conn.close()
    print(f"Database initialized (using {db_type})")


def _init_postgresql(cursor):
    """Initialize PostgreSQL tables."""
    # Login attempts table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS login_attempts (
            id SERIAL PRIMARY KEY,
            username TEXT NOT NULL,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            success BOOLEAN NOT NULL
        )
    ''')
    
    # Rclone transfers table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS rclone_transfers (
            id SERIAL PRIMARY KEY,
            mode TEXT NOT NULL,
            source TEXT,
            destination TEXT,
            protocol TEXT,
            flags TEXT,
            status TEXT NOT NULL,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Terminal commands table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS terminal_commands (
            id SERIAL PRIMARY KEY,
            command TEXT NOT NULL,
            status TEXT NOT NULL,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Notepad content table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS notepad_content (
            id SERIAL PRIMARY KEY,
            content TEXT,
            last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Process states table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS process_states (
            process_type TEXT PRIMARY KEY,
            running BOOLEAN NOT NULL,
            command TEXT,
            start_time DOUBLE PRECISION,
            last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Rclone config storage table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS rclone_config (
            id SERIAL PRIMARY KEY,
            config_content TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Tasks table for resumption
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS tasks (
            id SERIAL PRIMARY KEY,
            command TEXT NOT NULL,
            command_type TEXT NOT NULL,
            full_command TEXT NOT NULL,
            status TEXT NOT NULL,
            retry_count INTEGER DEFAULT 0,
            max_retries INTEGER DEFAULT 5,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMP
        )
    ''')
    
    # Form state table for sticky fields
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS form_state (
            id SERIAL PRIMARY KEY,
            field_name TEXT UNIQUE NOT NULL,
            field_value TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # App logs table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS app_logs (
            id SERIAL PRIMARY KEY,
            log_type TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Insert default values
    cursor.execute('''
        INSERT INTO process_states (process_type, running, command, start_time)
        VALUES ('rclone', FALSE, '', NULL)
        ON CONFLICT (process_type) DO NOTHING
    ''')
    
    cursor.execute('''
        INSERT INTO process_states (process_type, running, command, start_time)
        VALUES ('terminal', FALSE, '', NULL)
        ON CONFLICT (process_type) DO NOTHING
    ''')
    
    cursor.execute('''
        INSERT INTO notepad_content (id, content)
        VALUES (1, '')
        ON CONFLICT (id) DO NOTHING
    ''')


def _init_sqlite(cursor):
    """Initialize SQLite tables."""
    # Login attempts table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS login_attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            success BOOLEAN NOT NULL
        )
    ''')
    
    # Rclone transfers table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS rclone_transfers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            mode TEXT NOT NULL,
            source TEXT,
            destination TEXT,
            protocol TEXT,
            flags TEXT,
            status TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Terminal commands table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS terminal_commands (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            command TEXT NOT NULL,
            status TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Notepad content table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS notepad_content (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT,
            last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Process states table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS process_states (
            process_type TEXT PRIMARY KEY,
            running BOOLEAN NOT NULL,
            command TEXT,
            start_time REAL,
            last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Rclone config storage table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS rclone_config (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            config_content TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Tasks table for resumption
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            command TEXT NOT NULL,
            command_type TEXT NOT NULL,
            full_command TEXT NOT NULL,
            status TEXT NOT NULL,
            retry_count INTEGER DEFAULT 0,
            max_retries INTEGER DEFAULT 5,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            completed_at DATETIME
        )
    ''')
    
    # App logs table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS app_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            log_type TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Insert default values
    cursor.execute("INSERT OR IGNORE INTO process_states (process_type, running, command, start_time) VALUES ('rclone', 0, '', NULL)")
    cursor.execute("INSERT OR IGNORE INTO process_states (process_type, running, command, start_time) VALUES ('terminal', 0, '', NULL)")
    cursor.execute("INSERT OR IGNORE INTO notepad_content (id, content) VALUES (1, '')")


def save_rclone_config(config_content: str) -> bool:
    """Save rclone config content to database."""
    try:
        conn, db_type = get_db_connection()
        cursor = conn.cursor()
        
        if db_type == 'postgresql':
            cursor.execute('''
                INSERT INTO rclone_config (config_content, updated_at)
                VALUES (%s, CURRENT_TIMESTAMP)
                RETURNING id
            ''', (config_content,))
        else:
            cursor.execute('''
                INSERT INTO rclone_config (config_content, updated_at)
                VALUES (?, CURRENT_TIMESTAMP)
            ''', (config_content,))
        
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"Error saving rclone config: {e}")
        return False


def get_latest_rclone_config() -> Optional[str]:
    """Get the latest rclone config content from database."""
    try:
        conn, db_type = get_db_connection()
        cursor = conn.cursor()
        
        if db_type == 'postgresql':
            cursor.execute('''
                SELECT config_content FROM rclone_config
                ORDER BY updated_at DESC LIMIT 1
            ''')
        else:
            cursor.execute('''
                SELECT config_content FROM rclone_config
                ORDER BY updated_at DESC LIMIT 1
            ''')
        
        result = cursor.fetchone()
        conn.close()
        
        if result:
            return result[0]
        return None
    except Exception as e:
        print(f"Error getting rclone config: {e}")
        return None


def save_task(command: str, command_type: str, full_command: Dict[str, Any]) -> Optional[int]:
    """Save a task for potential resumption. Returns task ID."""
    try:
        conn, db_type = get_db_connection()
        cursor = conn.cursor()
        
        full_command_json = json.dumps(full_command)
        
        if db_type == 'postgresql':
            cursor.execute('''
                INSERT INTO tasks (command, command_type, full_command, status, retry_count, max_retries)
                VALUES (%s, %s, %s, 'running', 0, 5)
                RETURNING id
            ''', (command, command_type, full_command_json))
            task_id = cursor.fetchone()[0]
        else:
            cursor.execute('''
                INSERT INTO tasks (command, command_type, full_command, status, retry_count, max_retries)
                VALUES (?, ?, ?, 'running', 0, 5)
            ''', (command, command_type, full_command_json))
            task_id = cursor.lastrowid
        
        conn.commit()
        conn.close()
        return task_id
    except Exception as e:
        print(f"Error saving task: {e}")
        return None


def update_task_status(task_id: int, status: str, increment_retry: bool = False) -> bool:
    """Update task status. Optionally increment retry count."""
    try:
        conn, db_type = get_db_connection()
        cursor = conn.cursor()
        
        if increment_retry:
            if db_type == 'postgresql':
                cursor.execute('''
                    UPDATE tasks
                    SET status = %s, retry_count = retry_count + 1,
                        updated_at = CURRENT_TIMESTAMP,
                        completed_at = CASE WHEN %s IN ('completed', 'failed') THEN CURRENT_TIMESTAMP ELSE completed_at END
                    WHERE id = %s
                ''', (status, status, task_id))
            else:
                cursor.execute('''
                    UPDATE tasks
                    SET status = ?, retry_count = retry_count + 1,
                        updated_at = CURRENT_TIMESTAMP,
                        completed_at = CASE WHEN ? IN ('completed', 'failed') THEN CURRENT_TIMESTAMP ELSE completed_at END
                    WHERE id = ?
                ''', (status, status, task_id))
        else:
            if db_type == 'postgresql':
                cursor.execute('''
                    UPDATE tasks
                    SET status = %s, updated_at = CURRENT_TIMESTAMP,
                        completed_at = CASE WHEN %s IN ('completed', 'failed') THEN CURRENT_TIMESTAMP ELSE completed_at END
                    WHERE id = %s
                ''', (status, status, task_id))
            else:
                cursor.execute('''
                    UPDATE tasks
                    SET status = ?, updated_at = CURRENT_TIMESTAMP,
                        completed_at = CASE WHEN ? IN ('completed', 'failed') THEN CURRENT_TIMESTAMP ELSE completed_at END
                    WHERE id = ?
                ''', (status, status, task_id))
        
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"Error updating task: {e}")
        return False


def get_incomplete_tasks() -> List[Dict[str, Any]]:
    """Get tasks that are running with retry count < max_retries."""
    try:
        conn, db_type = get_db_connection()
        cursor = conn.cursor()
        
        if db_type == 'postgresql':
            cursor.execute('''
                SELECT * FROM tasks
                WHERE status = 'running' AND retry_count < max_retries
                ORDER BY created_at ASC
            ''')
            columns = [desc[0] for desc in cursor.description]
            rows = cursor.fetchall()
            tasks = [dict(zip(columns, row)) for row in rows]
        else:
            cursor.execute('''
                SELECT * FROM tasks
                WHERE status = 'running' AND retry_count < max_retries
                ORDER BY created_at ASC
            ''')
            columns = [desc[0] for desc in cursor.description]
            rows = cursor.fetchall()
            tasks = [dict(zip(columns, row)) for row in rows]
        
        conn.close()
        return tasks
    except Exception as e:
        print(f"Error getting incomplete tasks: {e}")
        return []


def save_log(log_type: str, content: str) -> bool:
    """Save log to database for persistence."""
    try:
        conn, db_type = get_db_connection()
        cursor = conn.cursor()
        
        if db_type == 'postgresql':
            cursor.execute('''
                INSERT INTO app_logs (log_type, content, created_at)
                VALUES (%s, %s, CURRENT_TIMESTAMP)
            ''', (log_type, content))
        else:
            cursor.execute('''
                INSERT INTO app_logs (log_type, content, created_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
            ''', (log_type, content))
        
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"Error saving log: {e}")
        return False


def get_recent_logs(log_type: str = None, limit: int = 100) -> List[Dict[str, Any]]:
    """Get recent logs from database."""
    try:
        conn, db_type = get_db_connection()
        cursor = conn.cursor()
        
        if log_type:
            if db_type == 'postgresql':
                cursor.execute('''
                    SELECT * FROM app_logs
                    WHERE log_type = %s
                    ORDER BY created_at DESC LIMIT %s
                ''', (log_type, limit))
            else:
                cursor.execute('''
                    SELECT * FROM app_logs
                    WHERE log_type = ?
                    ORDER BY created_at DESC LIMIT ?
                ''', (log_type, limit))
        else:
            if db_type == 'postgresql':
                cursor.execute('''
                    SELECT * FROM app_logs
                    ORDER BY created_at DESC LIMIT %s
                ''', (limit,))
            else:
                cursor.execute('''
                    SELECT * FROM app_logs
                    ORDER BY created_at DESC LIMIT ?
                ''', (limit,))
        
        columns = [desc[0] for desc in cursor.description]
        rows = cursor.fetchall()
        logs = [dict(zip(columns, row)) for row in rows]
        
        conn.close()
        return logs
    except Exception as e:
        print(f"Error getting logs: {e}")
        return []


def get_db_info() -> Dict[str, Any]:
    """Get database information."""
    info = {
        'type': 'unknown',
        'postgresql_available': POSTGRESQL_AVAILABLE,
        'sqlite_path': SQLITE_PATH
    }
    
    try:
        conn, db_type = get_db_connection()
        info['type'] = db_type
        
        cursor = conn.cursor()
        
        # Get table counts
        tables = ['login_attempts', 'rclone_transfers', 'terminal_commands', 
                  'process_states', 'rclone_config', 'tasks', 'app_logs', 'form_state']
        
        for table in tables:
            try:
                cursor.execute(f"SELECT COUNT(*) FROM {table}")
                info[f'{table}_count'] = cursor.fetchone()[0]
            except:
                info[f'{table}_count'] = 0
        
        conn.close()
    except Exception as e:
        info['error'] = str(e)
    
    return info


# --- Form State Functions ---

def save_form_state(field_name: str, field_value: str) -> bool:
    """Save form field state to database."""
    try:
        conn, db_type = get_db_connection()
        cursor = conn.cursor()
        
        if db_type == 'postgresql':
            cursor.execute('''
                INSERT INTO form_state (field_name, field_value, updated_at)
                VALUES (%s, %s, CURRENT_TIMESTAMP)
                ON CONFLICT(field_name) DO UPDATE
                SET field_value = EXCLUDED.field_value, updated_at = CURRENT_TIMESTAMP
            ''', (field_name, field_value))
        else:
            cursor.execute('''
                INSERT OR REPLACE INTO form_state (field_name, field_value, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
            ''', (field_name, field_value))
        
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"Error saving form state: {e}")
        return False


def load_form_state(field_name: str = None) -> Dict[str, str]:
    """Load form field state from database. Returns dict of {field_name: value}."""
    try:
        conn, db_type = get_db_connection()
        cursor = conn.cursor()
        
        if field_name:
            if db_type == 'postgresql':
                cursor.execute('''
                    SELECT field_name, field_value FROM form_state WHERE field_name = %s
                ''', (field_name,))
            else:
                cursor.execute('''
                    SELECT field_name, field_value FROM form_state WHERE field_name = ?
                ''', (field_name,))
            row = cursor.fetchone()
            conn.close()
            if row:
                return {row[0]: row[1]}
            return {}
        else:
            if db_type == 'postgresql':
                cursor.execute(''SELECT field_name, field_value FROM form_state'')
            else:
                cursor.execute(''SELECT field_name, field_value FROM form_state'')
            rows = cursor.fetchall()
            conn.close()
            return {row[0]: row[1] for row in rows}
    except Exception as e:
        print(f"Error loading form state: {e}")
        return {}


def clear_form_state(field_name: str = None) -> bool:
    """Clear form state. If field_name is None, clears all."""
    try:
        conn, db_type = get_db_connection()
        cursor = conn.cursor()
        
        if field_name:
            if db_type == 'postgresql':
                cursor.execute(''DELETE FROM form_state WHERE field_name = %s'', (field_name,))
            else:
                cursor.execute(''DELETE FROM form_state WHERE field_name = ?'', (field_name,))
        else:
            cursor.execute(''DELETE FROM form_state'')
        
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"Error clearing form state: {e}")
        return False
