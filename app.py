import os
import subprocess
import threading
import json
import time
from datetime import timedelta, datetime
from flask import Flask, render_template, request, jsonify, Response, redirect, url_for, session
from functools import wraps
import zipfile
import shutil
import re
import sqlite3

app = Flask(__name__, 
            template_folder=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'templates'),
            static_folder=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'static'))

# --- Configuration (from Environment Variables for Render.com) ---
app.config['SECRET_KEY'] = os.environ.get('FLASK_SECRET_KEY', 'super-secret-key-please-change-me')
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(minutes=360) # Remember user for 6 hours

# Directories and Files
BASE_CONFIG_DIR = '/app/.config/rclone'
# UPLOAD_FOLDER is not explicitly used for conf/sa, but could be for other general uploads if needed
UPLOAD_FOLDER = os.path.join(BASE_CONFIG_DIR, 'uploads')
RCLONE_CONFIG_PATH = os.path.join(BASE_CONFIG_DIR, 'rclone.conf')
# SERVICE_ACCOUNT_DIR now points to the same location as BASE_CONFIG_DIR for SA JSONs
SERVICE_ACCOUNT_DIR = BASE_CONFIG_DIR
LOG_FILE = os.path.join('/tmp', 'rcloneLog.txt') # Use /tmp for ephemeral logs on Render
TERMINAL_LOG_FILE = os.path.join('/tmp', 'terminalLog.txt') # Use /tmp for ephemeral logs on Render

# SQLite Database Path
DB_PATH = os.path.join(BASE_CONFIG_DIR, 'webgui.db')

# Login attempt tracking
MAX_LOGIN_ATTEMPTS = 10
LOGIN_BLOCK_DURATION_MINUTES = 15

# File size limits (10MB)
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB in bytes
MAX_OUTPUT_LINES = 1000  # Maximum lines in output (changed from 800 to 1000)

# Login Credentials
LOGIN_USERNAME = os.environ.get('LOGIN_USERNAME', 'admin')
LOGIN_PASSWORD = os.environ.get('LOGIN_PASSWORD', 'password') # IMPORTANT: Change in production!

# --- Utility Functions for Logging (Moved to top for early availability) ---
def check_file_size_and_clear(filename, max_size=MAX_FILE_SIZE):
    """Check if file exceeds max size and clear if necessary."""
    try:
        if os.path.exists(filename) and os.path.getsize(filename) > max_size:
            clear_log(filename)
            write_to_log(filename, f"[SYSTEM] Log file cleared due to size limit ({max_size} bytes)")
            return True
    except Exception as e:
        print(f"Error checking file size for {filename}: {e}")
    return False

def write_to_log(filename, content):
    """Appends content to a specified log file with size checking."""
    try:
        # Check file size before writing
        check_file_size_and_clear(filename)
        
        with open(filename, 'a', encoding='utf-8') as f:
            f.write(content + '\n')
            f.flush() # Ensure content is written to disk immediately
    except Exception as e:
        print(f"Error writing to log {filename}: {e}")

def clear_log(filename):
    """Clears the content of a specified log file."""
    try:
        if os.path.exists(filename):
            with open(filename, 'w', encoding='utf-8') as f:
                f.truncate(0) # Truncate to 0 bytes
    except Exception as e:
        print(f"Error clearing log {filename}: {e}")

def read_last_n_lines(filename, n):
    """Reads the last n meaningful (non-empty) lines from a log file."""
    try:
        if not os.path.exists(filename):
            return []
        with open(filename, 'r', encoding='utf-8') as f:
            lines = f.readlines()
            meaningful_lines = [line.strip() for line in lines if line.strip()]
            # Limit to MAX_OUTPUT_LINES
            if len(meaningful_lines) > MAX_OUTPUT_LINES:
                meaningful_lines = meaningful_lines[-MAX_OUTPUT_LINES:]
            return meaningful_lines[-n:]
    except Exception as e:
        print(f"Error reading last {n} lines from {filename}: {e}")
        return []

def limit_output_lines(filename, max_lines=MAX_OUTPUT_LINES):
    """Limit the number of lines in a log file."""
    try:
        if not os.path.exists(filename):
            return
        
        with open(filename, 'r', encoding='utf-8') as f:
            lines = f.readlines()
        
        if len(lines) > max_lines:
            # Keep only the last max_lines
            with open(filename, 'w', encoding='utf-8') as f:
                f.writelines(lines[-max_lines:])
                f.write(f"[SYSTEM] Output truncated to {max_lines} lines\n")
    except Exception as e:
        print(f"Error limiting output lines for {filename}: {e}")

# --- Ensure Directories Exist on Startup ---
def create_initial_dirs():
    """Creates necessary directories for the application."""
    os.makedirs(BASE_CONFIG_DIR, exist_ok=True)
    # SERVICE_ACCOUNT_DIR is now the same as BASE_CONFIG_DIR, so no separate creation needed

    # Ensure logs are cleared on startup for a fresh start each deployment/restart
    clear_log(LOG_FILE)
    clear_log(TERMINAL_LOG_FILE)
    print(f"Directories created: {BASE_CONFIG_DIR}")
    print(f"Logs cleared: {LOG_FILE}, {TERMINAL_LOG_FILE}")
# --- SQLite Database Initialization ---
def init_db():
    """Initializes the SQLite database and creates tables if they don't exist."""
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        
        # Table for login attempts
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS login_attempts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                success BOOLEAN NOT NULL
            )
        ''')
        
        # Table for rclone transfer history
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
        
        # Table for terminal command history
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS terminal_commands (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                command TEXT NOT NULL,
                status TEXT NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # Table for notepad content
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS notepad_content (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content TEXT,
                last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        # Ensure only one row for notepad content
        cursor.execute("INSERT OR IGNORE INTO notepad_content (id, content) VALUES (1, '')")

        # Table for persisting process states
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS process_states (
                process_type TEXT PRIMARY KEY,
                running BOOLEAN NOT NULL,
                command TEXT,
                start_time REAL,
                last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        # Initialize default process states if not present
        cursor.execute("INSERT OR IGNORE INTO process_states (process_type, running, command, start_time) VALUES ('rclone', 0, '', NULL)")
        cursor.execute("INSERT OR IGNORE INTO process_states (process_type, running, command, start_time) VALUES ('terminal', 0, '', NULL)")
        
        conn.commit()
    print(f"SQLite database initialized at {DB_PATH}")

# Call database initialization on app startup
with app.app_context():
    create_initial_dirs()
    init_db()

# --- Global Variables for Rclone and Terminal Processes ---
# Rclone process management
rclone_process = None
rclone_output_buffer = []
rclone_lock = threading.Lock() # Protects rclone_process and rclone_output_buffer
stop_rclone_flag = threading.Event() # Flag to signal rclone process to stop

# Terminal process management
terminal_process = None
terminal_output_buffer = []
terminal_lock = threading.Lock() # Protects terminal_process and terminal_output_buffer
stop_terminal_flag = threading.Event() # Flag to signal terminal process to stop

# --- Process State Management (Database Integrated) ---
def update_process_state(process_type, running, command=''):
    """Update process state in the database."""
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        start_time = time.time() if running else None
        cursor.execute('''
            INSERT OR REPLACE INTO process_states (process_type, running, command, start_time, last_updated)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ''', (process_type, int(running), command, start_time))
        conn.commit()

def get_process_state(process_type):
    """Get current process state from the database."""
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT running, command, start_time FROM process_states WHERE process_type = ?', (process_type,))
        state = cursor.fetchone()
        if state:
            return {'running': bool(state[0]), 'command': state[1], 'start_time': state[2]}
        return {'running': False, 'command': '', 'start_time': None}

# Load initial process states from DB on app startup
def load_initial_process_states():
    global rclone_process, terminal_process
    rclone_state = get_process_state('rclone')
    terminal_state = get_process_state('terminal')

    # Re-establish process objects if they were running before restart (though actual subprocess won't be)
    # This ensures the UI reflects the last known state, even if the actual process is gone.
    # The client-side polling will eventually detect the process is not truly running.
    if rclone_state['running']:
        print(f"Rclone was running with command: {rclone_state['command']}")
        # We can't re-attach to a subprocess, so we just set the state for UI sync
        # The client will eventually see it's not running and update.
    if terminal_state['running']:
        print(f"Terminal was running with command: {terminal_state['command']}")
        # Same for terminal

with app.app_context():
    load_initial_process_states()

# --- Authentication Decorator ---
def login_required(f):
    """Decorator to protect routes requiring an active session."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'logged_in' not in session:
            # If it's an API call, return JSON error
            if request.headers.get('X-Requested-With') == 'XMLHttpRequest' or request.is_json:
                return jsonify({"status": "error", "message": "Unauthorized. Please log in."}), 401
            # Otherwise, redirect to login page
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function

# --- Login Attempt Tracking Functions ---
def record_login_attempt(username, success):
    """Records a login attempt in the database."""
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute('INSERT INTO login_attempts (username, success) VALUES (?, ?)', (username, int(success)))
        conn.commit()

def get_failed_login_attempts(username, time_window_minutes):
    """Gets the number of failed login attempts for a user within a time window."""
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        time_threshold = datetime.now() - timedelta(minutes=time_window_minutes)
        cursor.execute('''
            SELECT COUNT(*) FROM login_attempts
            WHERE username = ? AND success = 0 AND timestamp >= ?
        ''', (username, time_threshold.strftime('%Y-%m-%d %H:%M:%S')))
        count = cursor.fetchone()[0]
        return count

def is_user_blocked(username):
    """Checks if a user is currently blocked due to too many failed login attempts."""
    failed_attempts = get_failed_login_attempts(username, LOGIN_BLOCK_DURATION_MINUTES)
    if failed_attempts >= MAX_LOGIN_ATTEMPTS:
        # Check if the last failed attempt was within the block duration
        with sqlite3.connect(DB_PATH) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT timestamp FROM login_attempts
                WHERE username = ? AND success = 0
                ORDER BY timestamp DESC LIMIT 1
            ''', (username,))
            last_attempt_str = cursor.fetchone()
            if last_attempt_str:
                last_attempt_time = datetime.strptime(last_attempt_str[0], '%Y-%m-%d %H:%M:%S')
                if (datetime.now() - last_attempt_time).total_seconds() < (LOGIN_BLOCK_DURATION_MINUTES * 60):
                    return True
    return False

# --- Routes ---
@app.route('/login', methods=['GET', 'POST'])
def login():
    """Handles user login."""
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')

        if is_user_blocked(username):
            return render_template('login.html', error=f"Too many failed login attempts. Please try again in {LOGIN_BLOCK_DURATION_MINUTES} minutes.")

        if username == LOGIN_USERNAME and password == LOGIN_PASSWORD:
            record_login_attempt(username, True)
            session['logged_in'] = True
            session.permanent = True # Make the session permanent
            return redirect(url_for('index'))
        else:
            record_login_attempt(username, False)
            return render_template('login.html', error="Invalid Credentials. Please try again.")
    return render_template('login.html')

@app.route('/logout')
def logout():
    """Handles user logout."""
    session.pop('logged_in', None)
    return redirect(url_for('login'))

@app.route('/')
@login_required
def index():
    """Renders the main Rclone WebGUI application page."""
    return render_template('index.html')

@app.route('/get-process-states', methods=['GET'])
@login_required
def get_process_states():
    """Returns current process states for cross-device synchronization."""
    return jsonify({
        "rclone": get_process_state('rclone'),
        "terminal": get_process_state('terminal')
    })

@app.route('/upload-rclone-conf', methods=['POST'])
@login_required
def upload_rclone_conf():
    """Uploads and replaces the rclone.conf file."""
    if 'rclone_conf' not in request.files:
        return jsonify({"status": "error", "message": "No file part"}), 400
    file = request.files['rclone_conf']
    if file.filename == '':
        return jsonify({"status": "error", "message": "No selected file"}), 400
    if file:
        try:
            file.save(RCLONE_CONFIG_PATH)
            return jsonify({"status": "success", "message": f"rclone.conf uploaded successfully to {RCLONE_CONFIG_PATH}"})
        except Exception as e:
            return jsonify({"status": "error", "message": f"Failed to save rclone.conf: {e}"}), 500
    return jsonify({"status": "error", "message": "Unknown error"}), 500

@app.route('/upload-sa-zip', methods=['POST'])
@login_required
def upload_sa_zip():
    """Uploads and extracts service account JSONs from a ZIP file."""
    if 'sa_zip' not in request.files:
        return jsonify({"status": "error", "message": "No file part"}), 400
    file = request.files['sa_zip']
    if file.filename == '':
        return jsonify({"status": "error", "message": "No selected file"}), 400
    if file and file.filename.endswith('.zip'):
        # Save the zip file directly in BASE_CONFIG_DIR as per request
        zip_path = os.path.join(BASE_CONFIG_DIR, 'sa-accounts.zip')
        try:
            file.save(zip_path)

            # Clear existing JSON files directly in BASE_CONFIG_DIR (now SERVICE_ACCOUNT_DIR)
            for filename in os.listdir(SERVICE_ACCOUNT_DIR):
                if filename.endswith('.json'):
                    os.remove(os.path.join(SERVICE_ACCOUNT_DIR, filename))

            # Extract new ZIP contents directly into BASE_CONFIG_DIR (now SERVICE_ACCOUNT_DIR)
            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                zip_ref.extractall(SERVICE_ACCOUNT_DIR) # This extracts into /app/.config/rclone/

            os.remove(zip_path) # Clean up the temporary zip file
            return jsonify({"status": "success", "message": f"Service account ZIP extracted to {SERVICE_ACCOUNT_DIR}. Existing JSONs cleared."})
        except zipfile.BadZipFile:
            return jsonify({"status": "error", "message": "Invalid ZIP file."}), 400
        except Exception as e:
            return jsonify({"status": "error", "message": f"Failed to process service account ZIP: {e}"}), 500
    return jsonify({"status": "error", "message": "Invalid file type. Please upload a .zip file."}), 400

# --- Helper for updating command status in DB ---
def update_command_status_in_db(table_name, command_id, status):
    """Updates the status of a command in the specified database table."""
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute(f'UPDATE {table_name} SET status = ? WHERE id = ?', (status, command_id))
        conn.commit()

# --- Rclone Command Execution (Backend) ---
def _stream_rclone_output_to_log(process, log_file, stop_flag, command_id):
    """Internal function to stream rclone subprocess output to a log file in a separate thread."""
    for line in iter(process.stdout.readline, ''):
        write_to_log(log_file, line.strip())
        limit_output_lines(log_file)
        if stop_flag.is_set():
            break
    process.wait() # Wait for the process to truly finish
    # Update process state when it finishes
    update_process_state('rclone', False)
    final_status = "Success" if process.returncode == 0 else "Failed"
    update_command_status_in_db('rclone_transfers', command_id, final_status)


@app.route('/execute-rclone', methods=['POST'])
@login_required
def execute_rclone():
    """Executes an Rclone command as a subprocess and returns status."""
    global rclone_process
    with rclone_lock:
        if rclone_process and rclone_process.poll() is None:
            return jsonify({"status": "error", "message": "Rclone process already running. Please stop it first."}), 409

    try:
        data = request.get_json()
        if not data:
            return jsonify({"status": "error", "message": "Invalid JSON data"}), 400
    except Exception as e:
        return jsonify({"status": "error", "message": f"JSON parsing error: {str(e)}"}), 400

    mode = data.get('mode')
    source = data.get('source', '').strip()
    destination = data.get('destination', '').strip()
    transfers = data.get('transfers')
    checkers = data.get('checkers')
    buffer_size = data.get('buffer_size')
    order = data.get('order')
    loglevel = data.get('loglevel')
    additional_flags_str = data.get('additional_flags', '').strip()
    use_drive_trash = data.get('use_drive_trash')
    use_service_account = data.get('service_account')
    dry_run = data.get('dry_run')
    serve_protocol = data.get('serve_protocol')
    serve_port = data.get('serve_port', '8080')
    serve_path = data.get('serve_path', '/')

    # Define command categories
    two_remote_modes = ["sync", "copy", "move", "check", "cryptcheck"]
    copyurl_mode = "copyurl"
    one_remote_modes = ["lsd", "ls", "tree", "mkdir", "size", "dedupe", "cleanup", "delete", "deletefile", "purge"]
    serve_mode = "serve"
    no_args_modes = ["listremotes", "version"]

    cmd = ["rclone", mode]

    # Handle command arguments based on mode
    if mode in two_remote_modes:
        if not source or not destination:
            return jsonify({"status": "error", "message": "Source and Destination are required for this mode."}), 400
        cmd.extend([source, destination])
    elif mode == copyurl_mode:
        if not source or not destination:
            return jsonify({"status": "error", "message": "URL and Destination are required for copyurl mode."}), 400
        cmd.extend([source, destination])
    elif mode in one_remote_modes:
        if not source:
            return jsonify({"status": "error", "message": "Source (path/remote) is required for this mode."}), 400
        cmd.append(source)
    elif mode == serve_mode:
        if not source or not serve_protocol:
            return jsonify({"status": "error", "message": "Serve protocol and Path to serve are required for serve mode."}), 400
        cmd.extend([serve_protocol, source])
        if serve_port:
            cmd.extend(["--addr", f":{serve_port}"])
        if serve_path and serve_path != '/':
            cmd.extend(["--baseurl", serve_path])
    elif mode in no_args_modes:
        pass
    else:
        return jsonify({"status": "error", "message": f"Unknown or unsupported Rclone mode: {mode}"}), 400

    # Special handling for version and listremotes as per requirements
    if mode == "version":
        pass
    elif mode == "listremotes":
        pass
    else:
        if transfers:
            cmd.append(f"--transfers={transfers}")
        if checkers:
            cmd.append(f"--checkers={checkers}")
        if buffer_size:
            cmd.append(f"--buffer-size={buffer_size}")
            cmd.append(f"--drive-chunk-size={buffer_size}")
        if order:
            cmd.append(f"--order-by={order}")

        loglevel_map = {"ERROR": "ERROR", "Info": "INFO", "DEBUG": "DEBUG"}
        cmd.append(f"--log-level={loglevel_map.get(loglevel, 'INFO')}")

        if use_service_account and os.path.exists(SERVICE_ACCOUNT_DIR) and any(f.endswith('.json') for f in os.listdir(SERVICE_ACCOUNT_DIR)):
            cmd.append(f"--drive-service-account-directory={SERVICE_ACCOUNT_DIR}")
        elif use_service_account and not os.path.exists(SERVICE_ACCOUNT_DIR):
            return jsonify({"status": "error", "message": "Service account directory does not exist or is empty. Please upload service accounts."}), 400

        if use_drive_trash:
            cmd.append("--drive-use-trash")
        else:
            cmd.append("--drive-skip-gdocs=true")

        if dry_run:
            cmd.append("--dry-run")

        if additional_flags_str:
            flags_split = re.findall(r'(?:[^\s"]|"[^"]*")+', additional_flags_str)
            cmd.extend([flag.strip('"') for flag in flags_split])

        if mode not in no_args_modes:
            cmd.append("--progress")
            cmd.append("--stats=3s")
            cmd.append("--stats-one-line-date")
    
    if mode != "version":
        cmd.append(f"--config={RCLONE_CONFIG_PATH}")

    rclone_env = os.environ.copy()
    rclone_env['RCLONE_CONFIG'] = RCLONE_CONFIG_PATH
    # rclone_env['RCLONE_FAST_LIST'] = 'true'
    rclone_env['RCLONE_DRIVE_TPSLIMIT'] = '3'
    rclone_env['RCLONE_DRIVE_ACKNOWLEDGE_ABUSE'] = 'true'
    rclone_env['RCLONE_LOG_FILE'] = LOG_FILE
    rclone_env['RCLONE_DRIVE_PACER_MIN_SLEEP'] = '50ms'
    rclone_env['RCLONE_DRIVE_PACER_BURST'] = '2'
    rclone_env['RCLONE_SERVER_SIDE_ACROSS_CONFIGS'] = 'true'

    full_command_str = ' '.join(cmd)
    print(f"Executing Rclone command: {full_command_str}")
    clear_log(LOG_FILE)
    
    try:
        # Save initial status to DB and get ID
        with sqlite3.connect(DB_PATH) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO rclone_transfers (mode, source, destination, protocol, flags, status)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (mode, source, destination, serve_protocol, additional_flags_str, 'Running'))
            rclone_command_id = cursor.lastrowid
            conn.commit()

        stop_rclone_flag.clear()
        with rclone_lock:
            rclone_process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                universal_newlines=True,
                bufsize=1,
                env=rclone_env
            )
        # Store command for reference and update state in DB
        update_process_state('rclone', True, full_command_str)
        
        # Start a separate thread to consume output, passing command_id
        threading.Thread(
            target=_stream_rclone_output_to_log,
            args=(rclone_process, LOG_FILE, stop_rclone_flag, rclone_command_id),
            daemon=True
        ).start()

        return jsonify({"status": "success", "message": f"Rclone command '{mode}' started."})
    except FileNotFoundError:
        update_process_state('rclone', False)
        # If command failed to start, update status in DB
        if 'rclone_command_id' in locals():
            update_command_status_in_db('rclone_transfers', rclone_command_id, 'Failed')
        return jsonify({"status": "error", "message": "Rclone executable not found. Ensure it's installed and in PATH."}), 500
    except Exception as e:
        update_process_state('rclone', False)
        # If command failed to start, update status in DB
        if 'rclone_command_id' in locals():
            update_command_status_in_db('rclone_transfers', rclone_command_id, 'Failed')
        return jsonify({"status": "error", "message": f"An unexpected error occurred: {e}"}), 500

@app.route('/get-rclone-output', methods=['GET'])
@login_required
def get_rclone_output():
    """Returns the most recent Rclone output."""
    with rclone_lock:
        is_running = rclone_process and rclone_process.poll() is None
        if not is_running and rclone_process:
            update_process_state('rclone', False)
        output_lines = read_last_n_lines(LOG_FILE, MAX_OUTPUT_LINES)
        return jsonify({"status": "success", "output": "\n".join(output_lines), "is_running": is_running})

@app.route('/stop-rclone-process', methods=['POST'])
@login_required
def stop_rclone_process():
    """Terminates the active Rclone process."""
    global rclone_process
    with rclone_lock:
        if rclone_process and rclone_process.poll() is None:
            stop_rclone_flag.set()
            rclone_process.terminate()
            try:
                rclone_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                rclone_process.kill()
            rclone_process = None
            update_process_state('rclone', False)
            # Update status in DB to 'Stopped'
            # This requires knowing the command_id, which is tricky if not passed.
            # For simplicity, we'll rely on the polling mechanism to eventually mark it as 'Failed' if it doesn't exit cleanly.
            # A more robust solution would involve storing the command_id in the process_state table.
            return jsonify({"status": "success", "message": "Rclone process stopped."})
        return jsonify({"status": "info", "message": "No Rclone process is currently running."})

@app.route('/clear-rclone-output', methods=['POST'])
@login_required
def clear_rclone_output():
    """Clears the Rclone output log file."""
    try:
        clear_log(LOG_FILE)
        return jsonify({"status": "success", "message": "Rclone output cleared successfully."})
    except Exception as e:
        return jsonify({"status": "error", "message": f"Failed to clear Rclone output: {e}"}), 500

@app.route('/download-rclone-log', methods=['GET'])
@login_required
def download_rclone_log():
    """Allows downloading the full Rclone LOG_FILE as an attachment."""
    try:
        if os.path.exists(LOG_FILE):
            with open(LOG_FILE, 'rb') as f:
                content = f.read()
            return Response(
                content,
                mimetype='text/plain',
                headers={"Content-Disposition": f"attachment;filename=rclone_webgui_log_{time.strftime('%Y%m%d-%H%M%S')}.txt"}
            )
        return jsonify({"status": "error", "message": "Rclone log file not found."}), 404
    except Exception as e:
        return jsonify({"status": "error", "message": f"Failed to download log: {e}"}), 500

# --- Web Terminal Functions ---
def _stream_terminal_output_to_buffer(process, buffer, stop_flag, command_id):
    """Internal function to stream subprocess output to a buffer in a separate thread."""
    for line in iter(process.stdout.readline, ''):
        with terminal_lock:
            buffer.append(line.strip())
            if len(buffer) > MAX_OUTPUT_LINES:
                buffer.pop(0)
        write_to_log(TERMINAL_LOG_FILE, line.strip())
        limit_output_lines(TERMINAL_LOG_FILE)
        if stop_flag.is_set():
            break
    process.wait()
    update_process_state('terminal', False)
    final_status = "Success" if process.returncode == 0 else "Failed"
    update_command_status_in_db('terminal_commands', command_id, final_status)


@app.route('/execute_terminal_command', methods=['POST'])
@login_required
def execute_terminal_command():
    """Executes a terminal command."""
    global terminal_process
    try:
        data = request.get_json()
        if not data:
            return jsonify({"status": "error", "message": "Invalid JSON data"}), 400
        command = data.get('command')
    except Exception as e:
        return jsonify({"status": "error", "message": f"JSON parsing error: {str(e)}"}), 400

    if not command:
        return jsonify({"status": "error", "message": "No command provided."}), 400

    with terminal_lock:
        if terminal_process and terminal_process.poll() is None:
            return jsonify({
                "status": "warning",
                "message": "A terminal process is already running. Do you want to stop it and start a new one?",
                "running_command": getattr(terminal_process, 'args', 'Unknown command')
            }), 409

        if terminal_process and terminal_process.poll() is not None:
            terminal_process = None

        clear_log(TERMINAL_LOG_FILE)
        
        try:
            # Save initial status to DB and get ID
            with sqlite3.connect(DB_PATH) as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    INSERT INTO terminal_commands (command, status)
                    VALUES (?, ?)
                ''', (command, 'Running'))
                terminal_command_id = cursor.lastrowid
                conn.commit()

            stop_terminal_flag.clear()
            terminal_process = subprocess.Popen(
                command,
                shell=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                universal_newlines=True,
                bufsize=1
            )
            # Store command for reference and update state in DB
            update_process_state('terminal', True, command)
            
            threading.Thread(
                target=_stream_terminal_output_to_buffer,
                args=(terminal_process, terminal_output_buffer, stop_terminal_flag, terminal_command_id),
                daemon=True
            ).start()

            return jsonify({"status": "success", "message": f"Command '{command}' started."})
        except Exception as e:
            update_process_state('terminal', False)
            # If command failed to start, update status in DB
            if 'terminal_command_id' in locals():
                update_command_status_in_db('terminal_commands', terminal_command_id, 'Failed')
            return jsonify({"status": "error", "message": f"Failed to execute command: {e}"}), 500

@app.route('/get_terminal_output', methods=['GET'])
@login_required
def get_terminal_output():
    """Returns the most recent terminal output."""
    with terminal_lock:
        is_running = terminal_process and terminal_process.poll() is None
        if not is_running and terminal_process:
            update_process_state('terminal', False)
        output_lines = read_last_n_lines(TERMINAL_LOG_FILE, MAX_OUTPUT_LINES)
        return jsonify({"status": "success", "output": "\n".join(output_lines), "is_running": is_running})

@app.route('/stop_terminal_process', methods=['POST'])
@login_required
def stop_terminal_process():
    """Terminates any active terminal process."""
    global terminal_process
    with terminal_lock:
        if terminal_process and terminal_process.poll() is None:
            stop_terminal_flag.set()
            terminal_process.terminate()
            try:
                terminal_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                terminal_process.kill()
            terminal_process = None
            update_process_state('terminal', False)
            # Similar to Rclone, rely on polling or store command_id in process_state for explicit 'Stopped' status
            return jsonify({"status": "success", "message": "Terminal process stopped."})
        return jsonify({"status": "info", "message": "No terminal process is currently running."})

@app.route('/clear-terminal-output', methods=['POST'])
@login_required
def clear_terminal_output():
    """Clears the terminal output log file."""
    try:
        clear_log(TERMINAL_LOG_FILE)
        return jsonify({"status": "success", "message": "Terminal output cleared successfully."})
    except Exception as e:
        return jsonify({"status": "error", "message": f"Failed to clear terminal output: {e}"}), 500

@app.route('/download-terminal-log', methods=['GET'])
@login_required
def download_terminal_log():
    """Allows downloading the full Terminal LOG_FILE as an attachment."""
    try:
        if os.path.exists(TERMINAL_LOG_FILE):
            with open(TERMINAL_LOG_FILE, 'rb') as f:
                content = f.read()
            return Response(
                content,
                mimetype='text/plain',
                headers={"Content-Disposition": f"attachment;filename=terminal_log_{time.strftime('%Y%m%d-%H%M%S')}.txt"}
            )
        return jsonify({"status": "error", "message": "Terminal log file not found."}), 404
    except Exception as e:
        return jsonify({"status": "error", "message": f"Failed to download terminal log: {e}"}), 500

# --- Recent Commands History (Database Integrated) ---
# save_rclone_transfer_to_db and save_terminal_command_to_db are now integrated directly into execute functions
# to get the lastrowid. They are no longer separate functions.

@app.route('/get-recent-commands', methods=['GET'])
@login_required
def get_recent_commands():
    """Fetches recent Rclone transfers and terminal commands from the database."""
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row # Return rows as dict-like objects
        cursor = conn.cursor()
        
        # Fetch Rclone transfers for the last 7 days, ordered by most recent
        seven_days_ago = datetime.now() - timedelta(days=7)
        cursor.execute('''
            SELECT id, mode, source, destination, protocol, flags, status, timestamp
            FROM rclone_transfers
            WHERE timestamp >= ?
            ORDER BY timestamp DESC
        ''', (seven_days_ago.strftime('%Y-%m-%d %H:%M:%S'),))
        rclone_transfers = [dict(row) for row in cursor.fetchall()]

        # Fetch terminal commands for the last 7 days, ordered by most recent
        cursor.execute('''
            SELECT id, command, status, timestamp
            FROM terminal_commands
            WHERE timestamp >= ?
            ORDER BY timestamp DESC
        ''', (seven_days_ago.strftime('%Y-%m-%d %H:%M:%S'),))
        terminal_commands = [dict(row) for row in cursor.fetchall()]

        return jsonify({
            "rclone_transfers": rclone_transfers,
            "terminal_commands": terminal_commands
        })

@app.route('/delete-rclone-transfer/<int:item_id>', methods=['POST'])
@login_required
def delete_rclone_transfer(item_id):
    """Deletes a specific Rclone transfer record from the database."""
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute('DELETE FROM rclone_transfers WHERE id = ?', (item_id,))
        conn.commit()
        if cursor.rowcount > 0:
            return jsonify({"status": "success", "message": "Rclone transfer deleted."})
        return jsonify({"status": "error", "message": "Rclone transfer not found."}), 404

@app.route('/delete-terminal-command/<int:item_id>', methods=['POST'])
@login_required
def delete_terminal_command(item_id):
    """Deletes a specific terminal command record from the database."""
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute('DELETE FROM terminal_commands WHERE id = ?', (item_id,))
        conn.commit()
        if cursor.rowcount > 0:
            return jsonify({"status": "success", "message": "Terminal command deleted."})
        return jsonify({"status": "error", "message": "Terminal command not found."}), 404

@app.route('/clear-all-history', methods=['POST'])
@login_required
def clear_all_history():
    """Clears all Rclone transfer and terminal command history from the database."""
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute('DELETE FROM rclone_transfers')
        cursor.execute('DELETE FROM terminal_commands')
        conn.commit()
        return jsonify({"status": "success", "message": "All history cleared."})

# --- Notepad (Database Integrated) ---
@app.route('/save-notepad-content', methods=['POST'])
@login_required
def save_notepad_content():
    """Saves notepad content to the database."""
    data = request.get_json()
    content = data.get('content', '')
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute('''
            INSERT OR REPLACE INTO notepad_content (id, content, last_updated)
            VALUES (1, ?, CURRENT_TIMESTAMP)
        ''', (content,))
        conn.commit()
    return jsonify({"status": "success", "message": "Notepad content saved."})

@app.route('/get-notepad-content', methods=['GET'])
@login_required
def get_notepad_content():
    """Retrieves notepad content from the database."""
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT content FROM notepad_content WHERE id = 1')
        result = cursor.fetchone()
        content = result[0] if result else ""
    return jsonify({"status": "success", "content": content})

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=os.environ.get('PORT', 5000))
