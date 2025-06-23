# Rclone WebGUI

This is a Flask-based web interface for Rclone, allowing you to manage Rclone configurations, upload files, and perform Rclone operations through a user-friendly GUI. It has been enhanced with several new features for improved security, data persistence, and user experience.

## Features

*   **Enhanced Login Security:** Implemented brute-force attack prevention with login attempt tracking and temporary blocking.
*   **Persistent Data Storage (SQLite):** All application data, including Rclone transfer history, web terminal command history, and notepad content, is now stored in an SQLite database for redundancy and cross-device synchronization. Process states are also persisted.
*   **Rclone Configuration Upload:** Easily upload your `rclone.conf` and Service Account (SA) JSON files (in a ZIP archive).
*   **Dynamic Rclone Commands:** Select various Rclone modes (`sync`, `copy`, `move`, `lsd`, `lsf`, `tree`, `mkdir`, `purge`, `delete`, `dedupe`, `cleanup`, `listremotes`, `serve`, `checksum`, `version`) with dynamic input fields.
*   **Non-blocking Rclone Transfers:** Rclone commands in the transfer tab now run in a separate process, preventing the web app from freezing.
*   **Live Output Monitoring:** Monitor Rclone transfer and web terminal output in real-time, showing the last 1000 lines with smart auto-scrolling (pauses when user scrolls up).
*   **Interactive Web Terminal:** Execute shell commands directly in your browser with live streaming output. Command input field retains value after execution.
*   **Command History:** Web terminal now includes a history button to easily access and copy previous 10 commands.
*   **Enhanced Recent Commands History:**
    *   Displays the latest 5 Rclone transfers and terminal commands, with an option to "Show More".
    *   Includes "Delete" and "Fill" buttons for individual history items.
    *   Rclone history items show detailed information (mode, source, destination, protocol, flags).
    *   Data is synced bi-directionally, with the most recent timestamp taking precedence. Displays data from the last 7 days.
*   **Notepad with Default Content:** Notepad content is saved server-side and comes pre-populated with useful Rclone flags and Linux commands.
*   **Modern & Responsive UI:** Built with Tailwind CSS for a clean and professional look, optimized for various screen sizes (desktop and mobile). Includes animated background graphics on the login page and improved header layout for mobile.
*   **Authentication:** Basic username/password login for secure access.
*   **Download Logs:** Download full Rclone and terminal log files.
*   **Optimized for Container Deployment:** Designed to run efficiently on platforms like Render.com with minimal resources.

## Project Structure
```
rclone-webgui/
├── .env                  # Environment variables (e.g., login credentials)
├── .dockerignore         # Files to ignore during Docker build
├── app.py                # Main Flask application logic
├── Dockerfile            # Docker build instructions
├── README.md             # This file
├── requirements.txt      # Python dependencies
├── static/
│   ├── css/              # CSS files (e.g., style.css)
│   │   └── style.css
│   ├── js/               # JavaScript files (e.g., script.js)
│   │   └── script.js
│   └── favicon.svg       # Favicon used as logo
└── templates/
    ├── index.html        # Main WebGUI interface
    └── login.html        # User login page
```

## Setup and Deployment

### Local Development

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-repo/rclone-webgui.git
    cd rclone-webgui
    ```
2.  **Create a virtual environment and install dependencies:**
    ```bash
    python -m venv venv
    source venv/bin/activate  # On Windows: `venv\Scripts\activate`
    pip install -r requirements.txt
    ```
3.  **Configure environment variables:**
    Create a `.env` file in the root directory (if it doesn't exist) and set your desired login credentials and Flask secret key:
    ```
    FLASK_SECRET_KEY="your_super_secret_key_here"
    LOGIN_USERNAME="admin"
    LOGIN_PASSWORD="your_secure_password"
    PORT=5000
    ```
    **IMPORTANT:** Change `FLASK_SECRET_KEY` and `LOGIN_PASSWORD` to strong, unique values for production.
4.  **Run the Flask application:**
    ```bash
    python app.py
    ```
    The application will be accessible at `http://127.0.0.1:5000`.

### Docker Deployment

1.  **Build the Docker image:**
    ```bash
    docker build -t rclone-webgui .
    ```
2.  **Run the Docker container:**
    ```bash
    docker run -d -p 5000:5000 --env-file .env --name rclone-webgui-app rclone-webgui
    ```
    The application will be accessible at `http://localhost:5000`.

    To ensure persistent storage for `rclone.conf`, service accounts, and the SQLite database, you can mount a volume:
    ```bash
    docker run -d -p 5000:5000 \
      --env-file .env \
      -v rclone_config_data:/app/.config/rclone \
      --name rclone-webgui-app rclone-webgui
    ```
    This will create a named Docker volume `rclone_config_data` to store your configuration and database.

### Deployment on Render.com (or similar PaaS)

1.  **Connect your GitHub repository** to Render.com.
2.  **Create a new Web Service** on Render.com.
3.  **Configure build and start commands:**
    *   Build Command: `pip install -r requirements.txt`
    *   Start Command: `gunicorn --bind 0.0.0.0:$PORT --workers 1 --timeout 300 app:app`
4.  **Add Environment Variables:**
    Set `FLASK_SECRET_KEY`, `LOGIN_USERNAME`, `LOGIN_PASSWORD`, and `PORT` (e.g., `5000`) in Render's environment variables section.
    **Note:** Render.com typically handles persistent storage for certain directories (like `/app/.config/rclone` if it's written to by the app) automatically, but verify their documentation for specific persistent disk configurations if needed. The `VOLUME` instruction in the Dockerfile is a good practice for general Docker environments.

## Contributing

Feel free to fork the repository, open issues, and submit pull requests.
