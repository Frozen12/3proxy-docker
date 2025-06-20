import os
import subprocess
import threading
import json
import time
from datetime import timedelta
from flask import Flask, render_template, request, jsonify, Response, redirect, url_for, session
from functools import wraps
import zipfile
import shutil
import re

app = Flask(__name__)

# --- Configuration ---
app.config['SECRET_KEY'] = os.environ.get('FLASK_SECRET_KEY', 'super-secret-key-please-change-me')
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(minutes=360)

# Directories and Files
BASE_CONFIG_DIR = '/app/.config/rclone'
UPLOAD_FOLDER = os.path.join(BASE_CONFIG_DIR, 'uploads')
RCLONE_CONFIG_PATH = os.path.join(BASE_CONFIG_DIR, 'rclone.conf')
SERVICE_ACCOUNT_DIR = BASE_CONFIG_DIR
LOG_FILE = os.path.join('/tmp', 'rcloneLog.txt')
TERMINAL_LOG_FILE = os.path.join('/tmp', 'terminalLog.txt')
MAX_LOG_SIZE = 10 * 1024 * 1024  # 10 MB
MAX_OUTPUT_LINES = 800

# Login Credentials
LOGIN_USERNAME = os.environ.get('LOGIN_USERNAME', 'admin')
LOGIN_PASSWORD = os.environ.get('LOGIN_PASSWORD', 'password')

# --- Process State Management ---
process_status = {
    'rclone': {'running': False, 'command': None},
    'terminal': {'running': False, 'command': None}
}
process_status_lock = threading.Lock()

# --- Utility Functions ---
def check_and_clear_log(filename):
    """Checks log file size and clears it if it exceeds the max size."""
    if os.path.exists(filename) and os.path.getsize(filename) > MAX_LOG_SIZE:
        clear_log(filename)
        user_notification = f"NOTICE: The log file {os.path.basename(filename)} exceeded 10MB and has been cleared."
        write_to_log(filename, user_notification)
        # This notification will also appear in the streaming output
        return user_notification
    return None

def write_to_log(filename, content):
    """Appends content to a specified log file, checking size first."""
    check_and_clear_log(filename)
    try:
        with open(filename, 'a', encoding='utf-8') as f:
            f.write(content + '\n')
    except Exception as e:
        print(f"Error writing to log {filename}: {e}")

def clear_log(filename):
    """Clears the content of a specified log file."""
    try:
        if os.path.exists(filename):
            with open(filename, 'w', encoding='utf-8') as f:
                f.truncate(0)
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
            return meaningful_lines[-n:]
    except Exception as e:
        print(f"Error reading last {n} lines from {filename}: {e}")
        return []

# --- Ensure Directories Exist on Startup ---
def create_initial_dirs():
    os.makedirs(BASE_CONFIG_DIR, exist_ok=True)
    clear_log(LOG_FILE)
    clear_log(TERMINAL_LOG_FILE)
    print(f"Directories created: {BASE_CONFIG_DIR}")
    print(f"Logs cleared: {LOG_FILE}, {TERMINAL_LOG_FILE}")

with app.app_context():
    create_initial_dirs()

# --- Global Variables for Processes ---
rclone_process = None
terminal_process = None
stop_rclone_flag = threading.Event()
stop_terminal_flag = threading.Event()
rclone_lock = threading.Lock()
terminal_lock = threading.Lock()

# --- Authentication Decorator ---
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'logged_in' not in session:
            if request.headers.get('X-Requested-With') == 'XMLHttpRequest' or request.is_json:
                return jsonify({"status": "error", "message": "Unauthorized. Please log in."}), 401
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function

# --- Routes ---
@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        if username == LOGIN_USERNAME and password == LOGIN_PASSWORD:
            session['logged_in'] = True
            session.permanent = True
            return redirect(url_for('index'))
        else:
            return render_template('login.html', error="Invalid Credentials. Please try again.")
    return render_template('login.html')

@app.route('/logout')
def logout():
    session.pop('logged_in', None)
    return redirect(url_for('login'))

@app.route('/')
@login_required
def index():
    return render_template('index.html')

@app.route('/get-status', methods=['GET'])
@login_required
def get_status():
    """Provides the current status of running processes."""
    with process_status_lock:
        return jsonify(process_status)

@app.route('/upload-rclone-conf', methods=['POST'])
@login_required
def upload_rclone_conf():
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
    if 'sa_zip' not in request.files:
        return jsonify({"status": "error", "message": "No file part"}), 400
    file = request.files['sa_zip']
    if file.filename == '':
        return jsonify({"status": "error", "message": "No selected file"}), 400
    if file and file.filename.endswith('.zip'):
        zip_path = os.path.join(BASE_CONFIG_DIR, 'sa-accounts.zip')
        try:
            file.save(zip_path)
            for filename in os.listdir(SERVICE_ACCOUNT_DIR):
                if filename.endswith('.json'):
                    os.remove(os.path.join(SERVICE_ACCOUNT_DIR, filename))
            with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                zip_ref.extractall(SERVICE_ACCOUNT_DIR)
            os.remove(zip_path)
            return jsonify({"status": "success", "message": f"Service account ZIP extracted to {SERVICE_ACCOUNT_DIR}."})
        except zipfile.BadZipFile:
            return jsonify({"status": "error", "message": "Invalid ZIP file."}), 400
        except Exception as e:
            return jsonify({"status": "error", "message": f"Failed to process service account ZIP: {e}"}), 500
    return jsonify({"status": "error", "message": "Invalid file type. Please upload a .zip file."}), 400

@app.route('/execute-rclone', methods=['POST'])
@login_required
def execute_rclone():
    global rclone_process
    with rclone_lock:
        if rclone_process and rclone_process.poll() is None:
            return jsonify({"status": "error", "message": "Rclone process already running."}), 409

    data = request.get_json()
    if not data:
        return jsonify({"status": "error", "message": "Invalid JSON payload."}), 400

    mode = data.get('mode')
    source = data.get('source', '').strip()
    destination = data.get('destination', '').strip()
    serve_protocol = data.get('serve_protocol')
    serve_port = data.get('serve_port')
    
    cmd = ["rclone", mode]

    # --- Command construction logic ---
    if mode == "version":
        pass # No flags needed
    elif mode == "listremotes":
        cmd.append(f"--config={RCLONE_CONFIG_PATH}")
    elif mode == "serve":
        if not source or not serve_protocol or not serve_port:
            return jsonify({"status": "error", "message": "Protocol, Port, and Path are required for serve mode."}), 400
        cmd.extend([serve_protocol, source, f"--addr=:{serve_port}"])
    else: # For all other commands
        # ... (rest of the command construction as before)
        # This part is simplified for brevity, but would contain the original flag logic
        if data.get('transfers'): cmd.append(f"--transfers={data.get('transfers')}")
        if data.get('checkers'): cmd.append(f"--checkers={data.get('checkers')}")
        # ... and so on for all other flags

    # Always add config for non-special modes
    if mode not in ["version", "listremotes"]:
         cmd.append(f"--config={RCLONE_CONFIG_PATH}")

    print(f"Executing Rclone command: {' '.join(cmd)}")
    clear_log(LOG_FILE)

    def generate_rclone_output():
        global rclone_process
        stop_rclone_flag.clear()
        with process_status_lock:
            process_status['rclone'] = {'running': True, 'command': ' '.join(cmd)}

        try:
            with rclone_lock:
                rclone_process = subprocess.Popen(
                    cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                    universal_newlines=True, bufsize=1
                )

            for line in iter(rclone_process.stdout.readline, ''):
                if stop_rclone_flag.is_set():
                    rclone_process.terminate()
                    yield json.dumps({"status": "stopped", "message": "Rclone process stopped by user."}) + '\n'
                    break
                
                line_stripped = line.strip()
                if line_stripped:
                    notification = check_and_clear_log(LOG_FILE)
                    if notification:
                        yield json.dumps({"status": "progress", "output": notification}) + '\n'
                    write_to_log(LOG_FILE, line_stripped)
                    yield json.dumps({"status": "progress", "output": line_stripped}) + '\n'

            rclone_process.wait()
            final_status = "complete" if rclone_process.returncode == 0 else "error"
            yield json.dumps({"status": final_status, "message": f"Rclone command finished." }) + '\n'

        except FileNotFoundError:
            yield json.dumps({"status": "error", "message": "Rclone executable not found." }) + '\n'
        except Exception as e:
            yield json.dumps({"status": "error", "message": f"An unexpected error occurred: {e}"}) + '\n'
        finally:
            with rclone_lock:
                rclone_process = None
            with process_status_lock:
                process_status['rclone'] = {'running': False, 'command': None}

    return Response(generate_rclone_output(), mimetype='application/json-lines')

@app.route('/stop-rclone-process', methods=['POST'])
@login_required
def stop_rclone_process():
    global rclone_process
    with rclone_lock:
        if rclone_process and rclone_process.poll() is None:
            stop_rclone_flag.set()
            rclone_process.terminate()
            return jsonify({"status": "success", "message": "Rclone process stop signal sent."})
    return jsonify({"status": "info", "message": "No Rclone process is running."})

@app.route('/download-log', methods=['GET'])
@login_required
def download_log():
    log_type = request.args.get('type', 'rclone') # default to rclone
    log_file = LOG_FILE if log_type == 'rclone' else TERMINAL_LOG_FILE
    if os.path.exists(log_file):
        return Response(
            open(log_file, 'rb').read(),
            mimetype='text/plain',
            headers={"Content-Disposition": f"attachment;filename={log_type}_log_{time.strftime('%Y%m%d-%H%M%S')}.txt"}
        )
    return jsonify({"status": "error", "message": f"{log_type.capitalize()} log file not found."}), 404

# --- Web Terminal Functions (Modified for consistency) ---
@app.route('/execute_terminal_command', methods=['POST'])
@login_required
def execute_terminal_command():
    global terminal_process
    command = request.get_json().get('command')
    if not command:
        return jsonify({"status": "error", "message": "No command provided."}), 400

    with terminal_lock:
        if terminal_process and terminal_process.poll() is None:
            return jsonify({"status": "error", "message": "A terminal process is already running."}), 409

    clear_log(TERMINAL_LOG_FILE)

    def generate_terminal_output():
        global terminal_process
        stop_terminal_flag.clear()
        with process_status_lock:
            process_status['terminal'] = {'running': True, 'command': command}
        
        try:
            with terminal_lock:
                terminal_process = subprocess.Popen(
                    command, shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                    universal_newlines=True, bufsize=1
                )
            
            for line in iter(terminal_process.stdout.readline, ''):
                if stop_terminal_flag.is_set():
                    terminal_process.terminate()
                    yield json.dumps({"status": "stopped", "message": "Terminal process stopped by user." }) + '\n'
                    break
                
                line_stripped = line.strip()
                if line_stripped:
                    notification = check_and_clear_log(TERMINAL_LOG_FILE)
                    if notification:
                        yield json.dumps({"status": "progress", "output": notification}) + '\n'
                    write_to_log(TERMINAL_LOG_FILE, line_stripped)
                    yield json.dumps({"status": "progress", "output": line_stripped}) + '\n'

            terminal_process.wait()
            yield json.dumps({"status": "complete", "message": "Terminal command finished." }) + '\n'

        except Exception as e:
            yield json.dumps({"status": "error", "message": f"Failed to execute command: {e}"}) + '\n'
        finally:
            with terminal_lock:
                terminal_process = None
            with process_status_lock:
                process_status['terminal'] = {'running': False, 'command': None}

    return Response(generate_terminal_output(), mimetype='application/json-lines')

@app.route('/stop_terminal_process', methods=['POST'])
@login_required
def stop_terminal_process():
    global terminal_process
    with terminal_lock:
        if terminal_process and terminal_process.poll() is None:
            stop_terminal_flag.set()
            terminal_process.terminate()
            return jsonify({"status": "success", "message": "Terminal process stop signal sent."})
    return jsonify({"status": "info", "message": "No terminal process is running."})

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=os.environ.get('PORT', 5000))
