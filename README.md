# Rclone WebUI - Enhanced Flask Web Interface

A lightweight, feature-rich Flask-based web interface for Rclone with PostgreSQL/SQLite support, task resumption, real-time streaming, and optimized performance for low-resource hardware.

## Features

### Core Features
* **Enhanced Security:** Brute-force protection with login attempt tracking and temporary blocking
* **Dual Database Support:** PostgreSQL primary with SQLite fallback - all data persisted (logs, commands, state, rclone config)
* **Task Resumption:** Automatically resume tasks after restart (up to 5 retries), with user notifications on login
* **Rclone v1.73.5:** Updated to latest tagged version with `archive` command support
* **Real-Time Output:** Server-Sent Events (SSE) instead of polling for efficient live output streaming
* **Dynamic Flag Suggestions:** Context-aware flag autocomplete based on selected rclone command

### Rclone Operations
* **Multiple Modes:** sync, copy, move, check, cryptcheck, archive, ls, ls, tree, mkdir, size, dedupe, cleanup, delete, deletefile, purge, serve, copyurl, listremotes, version
* **Dynamic UI:** Input fields adapt based on selected mode (source/destination/URL/protocol)
* **Service Account Support:** Upload and manage service account ZIP files
* **Config Management:** Upload rclone.conf directly through the web interface

### Web Terminal
* **Interactive Terminal:** Execute shell commands with live output streaming
* **Command History:** Access last 10 commands with one-click fill
* **Process Management:** Start/stop processes with proper state tracking

### User Interface
* **Responsive Design:** Optimized for both mobile and desktop browsers
* **8 Theme Options:** Dark Green, Black, Blue, Purple, Orange, Red, Teal, Indigo
* **Toast Notifications:** Real-time feedback for task status and resumption
* **Auto-Save Notepad:** Server-side content persistence with useful defaults
* **Recent Commands:** View last 7 days of rclone transfers and terminal commands with filtering

## Project Structure

```
RcloneWebUI_lagacy/
├── .env                    # Environment variables (credentials)
├── .gitignore             # Git ignore rules
├── app.py                  # Main Flask application (SSE, tasks, DB integration)
├── db.py                   # Database abstraction layer (PostgreSQL + SQLite)
├── Dockerfile              # Multi-stage Docker build (Python 3.13, rclone v1.73.5)
├── requirements.txt        # Python dependencies (Flask 3.1.3, gunicorn 23.0.0)
├── README.md               # This file
├── SUMMARY.md              # Implementation summary
├── static/
│   ├── css/
│   │   └── style.css      # Enhanced styles (SSE, toasts, accessibility)
│   ├── js/
│   │   └── script.js     # Frontend logic (SSE client, notifications, flag suggestions)
│   └── favicon.svg        # SVG icon
└── templates/
    ├── index.html        # Main WebUI interface
    └── login.html        # Login page
```

## Quick Start

### Local Development

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Frozen12/3proxy-docker.git
   cd 3proxy-docker/RcloneWebUI_lagacy
   ```

2. **Create virtual environment and install dependencies:**
   ```bash
   python3 -m venv venv
   source venv/bin/activate  # Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

3. **Configure environment variables:**
   Create `.env` file:
   ```bash
   FLASK_SECRET_KEY="your_super_secret_key_here"
   LOGIN_USERNAME="admin"
   LOGIN_PASSWORD="your_secure_password"
   PORT=5000
   # Optional: DATABASE_URL="postgresql://user:pass@localhost/dbname"
   ```
   **IMPORTANT:** Change credentials for production!

4. **Run the application:**
   ```bash
   python app.py
   # or with Flask CLI:
   flask run --host 0.0.0.0 --port 5000
   ```
   Access at `http://127.0.0.1:5000`

### Docker Deployment

1. **Build the image:**
   ```bash
   docker build -t rclone-webui .
   ```

2. **Run the container:**
   ```bash
   docker run -d -p 5000:5000 \
     --env-file .env \
     --name rclone-webui-app \
     rclone-webui
   ```
   Access at `http://localhost:5000`

3. **With persistent storage:**
   ```bash
   docker run -d -p 5000:5000 \
     --env-file .env \
     -v rclone_data:/root/.config/rclone \
     --name rclone-webui-app \
     rclone-webui
   ```

### Deploy on Render.com (or similar PaaS)

1. Connect your GitHub repository to Render.com
2. Create a new Web Service
3. Configure:
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `gunicorn --bind 0.0.0.0:$PORT --workers 1 --timeout 300 app:app`
4. Add environment variables: `FLASK_SECRET_KEY`, `LOGIN_USERNAME`, `LOGIN_PASSWORD`, `PORT`
5. Optional: Set `DATABASE_URL` for PostgreSQL support

## Database Configuration

The application supports two database backends:

| Database | Use Case | Configuration |
|-----------|----------|----------------|
| **PostgreSQL** | Production/High-availability | Set `DATABASE_URL` environment variable |
| **SQLite** | Development/Low-resource | Default fallback, stores at `~/.config/rclone/webgui.db` |

Data stored:
- Login attempts (brute-force protection)
- Rclone transfers history
- Terminal commands history
- Notepad content
- Process states (cross-device sync)
- Rclone config contents
- Tasks (for resumption after restart)
- Application logs

## New Features Details

### Task Resumption
- Tasks are saved when executed
- On restart, checks for incomplete tasks (status='running' AND retry_count < 5)
- Automatically attempts to resume (with increment retry_count)
- Notifies user on next login about resumed/failed tasks
- Prevents infinite retry loops

### Server-Sent Events (SSE)
- Replaces 1-second polling with efficient server push
- Reduces server load and improves real-time performance
- Endpoints: `/stream-rclone-output`, `/stream-terminal-output`
- Auto-reconnects on connection loss

### Dynamic Flag Suggestions
- Select a rclone mode to see relevant flags
- Autocomplete support for additional flags input
- Flags mapped per command: sync, copy, move, archive, etc.
- Example: Selecting "sync" shows `--bwlimit`, `--checksum`, `--fast-list`, etc.

## Environment Variables

| Variable | Description | Default |
|-----------|-------------|---------|
| `FLASK_SECRET_KEY` | Secret key for sessions | `super-secret-key` |
| `LOGIN_USERNAME` | Login username | `admin` |
| `LOGIN_PASSWORD` | Login password | `password` |
| `PORT` | Application port | `5000` |
| `DATABASE_URL` | PostgreSQL connection (optional) | None (uses SQLite) |

## Updating

```bash
git pull origin main
pip install -r requirements.txt --upgrade
docker build -t rclone-webui .
```

## Troubleshooting

**Permission denied errors:**
- Ensure `/app/.config/rclone` (or `~/.config/rclone`) is writable
- Check Docker volume mounts

**Database connection issues:**
- Verify `DATABASE_URL` format: `postgresql://user:pass@host:port/dbname`
- App automatically falls back to SQLite if PostgreSQL unavailable

**rclone not found:**
- Ensure rclone v1.73.5 is installed
- Check Docker build logs for installation errors

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - feel free to use, modify, and distribute.

## Acknowledgments

- [Rclone](https://rclone.org/) - The amazing cloud storage sync tool
- [Flask](https://flask.palletsprojects.com/) - Lightweight WSGI web framework
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS framework
