// --- DOM Element References ---
const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');

const setupSection = document.getElementById('setup-section');
const rcloneSection = document.getElementById('rclone-section');
const webTerminalSection = document.getElementById('web-terminal-section');
const recentCommandsSection = document.getElementById('recent-commands-section');
const notepadSection = document.getElementById('notepad-section');

const navButtons = document.querySelectorAll('.nav-button');

const modeSelect = document.getElementById('mode');
const modeDescription = document.getElementById('mode-description');
const sourceInput = document.getElementById('source');
const destinationInput = document.getElementById('destination');
const destinationField = document.getElementById('destination-field');
const serveOptions = document.getElementById('serve-options');

const transfersInput = document.getElementById('transfers');
const transfersValueSpan = document.getElementById('transfers-value');
const checkersInput = document.getElementById('checkers');
const checkersValueSpan = document.getElementById('checkers-value');

const startRcloneBtn = document.getElementById('start-rclone-btn');
const stopRcloneBtn = document.getElementById('stop-rclone-btn');
const rcloneLiveOutput = document.getElementById('rclone-live-output');
const rcloneMajorStepsOutput = document.getElementById('rclone-major-steps');
const rcloneSpinner = document.getElementById('rclone-spinner');

const terminalCommandInput = document.getElementById('terminal-command');
const executeTerminalBtn = document.getElementById('execute-terminal-btn');
const stopTerminalBtn = document.getElementById('stop-terminal-btn');
const terminalOutput = document.getElementById('terminal-output');
const terminalSpinner = document.getElementById('terminal-spinner');

const rcloneLogDownloadBtn = document.getElementById('rclone-log-download-btn');
const terminalLogDownloadBtn = document.getElementById('terminal-log-download-btn');

const recentRcloneCommandsDiv = document.getElementById('recent-rclone-commands');
const recentTerminalCommandsDiv = document.getElementById('recent-terminal-commands');
const notepadContent = document.getElementById('notepad-content');

// --- Global State ---
let rcloneProcess = { running: false, command: '' };
let terminalProcess = { running: false, command: '' };

// --- Mode Definitions ---
const RcloneModeDescriptions = {
    sync: 'Makes source and destination identical, modifying destination only.',
    copy: 'Copies files from source to destination, skipping already copied.',
    move: 'Moves files from source to destination.',
    check: 'Checks for differences between source and destination.',
    lsd: 'Lists directories in the path.',
    ls: 'Lists all files in the path.',
    listremotes: 'Lists all configured remotes.',
    serve: 'Serves a remote over a protocol (e.g., HTTP, WebDAV).',
    delete: 'Deletes files from the destination.',
    purge: 'Deletes all files and directories from the destination.',
    version: 'Shows the Rclone version.',
};

const modesWithTwoRemotes = ['sync', 'copy', 'move', 'check'];
const modesWithOneRemote = ['lsd', 'ls', 'delete', 'purge'];
const modesWithNoRemotes = ['listremotes', 'version'];
const modesServe = ['serve'];

// --- Core Functions ---

document.addEventListener('DOMContentLoaded', () => {
    initializeUI();
    setInterval(checkStatus, 2000); // Poll every 2 seconds
});

function initializeUI() {
    // Set default section
    showSection('rclone');

    // Setup event listeners
    navButtons.forEach(btn => btn.addEventListener('click', () => showSection(btn.dataset.section)));
    modeSelect.addEventListener('change', updateModeUI);
    startRcloneBtn.addEventListener('click', executeRcloneCommand);
    stopRcloneBtn.addEventListener('click', stopRcloneProcess);
    executeTerminalBtn.addEventListener('click', executeTerminalCommand);
    stopTerminalBtn.addEventListener('click', stopTerminalProcess);
    rcloneLogDownloadBtn.addEventListener('click', () => downloadLog('rclone'));
    terminalLogDownloadBtn.addEventListener('click', () => downloadLog('terminal'));

    // Sliders
    transfersInput.addEventListener('input', () => transfersValueSpan.textContent = transfersInput.value);
    checkersInput.addEventListener('input', () => checkersValueSpan.textContent = checkersInput.value);

    // Load content from local storage
    loadRecentCommands();
    loadNotepadContent();

    // Initial UI setup based on mode
    updateModeUI();
}

async function checkStatus() {
    try {
        const response = await fetch('/get-status');
        if (!response.ok) throw new Error('Failed to fetch status');
        const data = await response.json();

        rcloneProcess = data.rclone;
        terminalProcess = data.terminal;

        updateStatusIndicator();
        updateProcessControls();
    } catch (error) {
        console.error('Status check failed:', error);
        setDisconnectedStatus('Error connecting to backend.');
    }
}

// --- UI Update Functions ---

function showSection(sectionId) {
    document.querySelectorAll('.content-section').forEach(s => s.classList.add('hidden'));
    document.getElementById(`${sectionId}-section`).classList.remove('hidden');
    navButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.section === sectionId));
}

function updateModeUI() {
    const mode = modeSelect.value;
    modeDescription.textContent = RcloneModeDescriptions[mode] || 'Select a mode.';

    destinationField.classList.toggle('hidden', !modesWithTwoRemotes.includes(mode));
    serveOptions.classList.toggle('hidden', !modesServe.includes(mode));

    if (modesWithNoRemotes.includes(mode)) {
        source.classList.add('hidden');
        destinationField.classList.add('hidden');
    } else {
        source.classList.remove('hidden');
    }
}

function updateStatusIndicator() {
    if (rcloneProcess.running || terminalProcess.running) {
        statusIndicator.className = 'connected';
        statusText.textContent = 'Process Running';
    } else {
        statusIndicator.className = 'ok';
        statusText.textContent = 'Idle';
    }
}

function setDisconnectedStatus(message) {
    statusIndicator.className = 'disconnected';
    statusText.textContent = message;
    rcloneProcess.running = false;
    terminalProcess.running = false;
    updateProcessControls();
}

function updateProcessControls() {
    // Rclone controls
    startRcloneBtn.classList.toggle('hidden', rcloneProcess.running);
    stopRcloneBtn.classList.toggle('hidden', !rcloneProcess.running);
    rcloneSpinner.classList.toggle('hidden', !rcloneProcess.running);

    // Terminal controls
    executeTerminalBtn.disabled = terminalProcess.running;
    stopTerminalBtn.disabled = !terminalProcess.running;
    terminalSpinner.classList.toggle('hidden', !terminalProcess.running);
}

function appendOutput(element, text) {
    element.textContent += text;
    element.scrollTop = element.scrollHeight; // Auto-scroll
}

function logMessage(element, message, type = 'info') {
    element.innerHTML = `<span class="${type}">${message}</span>`;
}

// --- Command Execution ---

async function executeRcloneCommand() {
    rcloneLiveOutput.textContent = '';
    logMessage(rcloneMajorStepsOutput, 'Starting Rclone...', 'info');

    const payload = {
        mode: modeSelect.value,
        source: sourceInput.value,
        destination: destinationInput.value,
        flags: document.getElementById('additional_flags').value,
        transfers: transfersInput.value,
        checkers: checkersInput.value,
        dry_run: document.getElementById('dry_run').checked,
        log_level: document.getElementById('loglevel').value,
    };

    if (payload.mode === 'serve') {
        payload.serve_protocol = document.getElementById('serve_protocol').value;
    }

    saveCommandToHistory('rclone', payload);
    streamProcess('/execute-rclone-command', payload, rcloneLiveOutput, rcloneMajorStepsOutput);
}

async function executeTerminalCommand() {
    const command = terminalCommandInput.value;
    if (!command) return;

    terminalOutput.textContent = '';
    saveCommandToHistory('terminal', { command });
    streamProcess('/execute-terminal-command', { command }, terminalOutput);
    terminalCommandInput.value = '';
}

async function streamProcess(endpoint, payload, outputEl, messageEl = null) {
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Request failed');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop(); // Keep partial line

            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const data = JSON.parse(line);
                    if (data.output) appendOutput(outputEl, data.output);
                    if (messageEl && data.message) logMessage(messageEl, data.message, data.status);
                } catch (e) {
                    console.warn('Failed to parse JSON line:', line);
                }
            }
        }
    } catch (error) {
        const message = `Error: ${error.message}`;
        if (messageEl) logMessage(messageEl, message, 'error');
        else appendOutput(outputEl, message);
    }
    checkStatus(); // Final status update
}

// --- Process Control ---

async function stopRcloneProcess() {
    await stopProcess('/stop-rclone-process', rcloneMajorStepsOutput);
}

async function stopTerminalProcess() {
    await stopProcess('/stop-terminal-process', terminalOutput);
}

async function stopProcess(endpoint, messageEl) {
    try {
        const response = await fetch(endpoint, { method: 'POST' });
        const data = await response.json();
        logMessage(messageEl, data.message, data.status);
    } catch (error) {
        logMessage(messageEl, `Error stopping process: ${error.message}`, 'error');
    }
    checkStatus();
}

// --- File & Log Handling ---

function downloadLog(type) {
    window.location.href = `/download-log?type=${type}`;
}

async function uploadFile(inputId, endpoint) {
    const fileInput = document.getElementById(inputId);
    if (fileInput.files.length === 0) return;

    const formData = new FormData();
    formData.append('file', fileInput.files[0]);

    try {
        const response = await fetch(endpoint, { method: 'POST', body: formData });
        const result = await response.json();
        alert(result.message);
    } catch (error) {
        alert(`Upload failed: ${error.message}`);
    }
}

// --- Local Storage ---

function getHistory(type) {
    return JSON.parse(localStorage.getItem(`${type}CommandHistory`)) || [];
}

function saveCommandToHistory(type, command) {
    const history = getHistory(type);
    history.unshift(command); // Add to the beginning
    if (history.length > 10) history.pop(); // Limit to 10 items
    localStorage.setItem(`${type}CommandHistory`, JSON.stringify(history));
    loadRecentCommands();
}

function loadRecentCommands() {
    loadHistoryInto('rclone', recentRcloneCommandsDiv);
    loadHistoryInto('terminal', recentTerminalCommandsDiv);
}

function loadHistoryInto(type, element) {
    const history = getHistory(type);
    element.innerHTML = '';
    if (history.length === 0) {
        element.innerHTML = '<p>No recent commands.</p>';
        return;
    }

    history.forEach(cmd => {
        const btn = document.createElement('button');
        btn.className = 'history-item';
        btn.textContent = type === 'rclone' ? `${cmd.mode} ${cmd.source || ''}` : cmd.command;
        btn.onclick = () => populateCommand(type, cmd);
        element.appendChild(btn);
    });
}

function populateCommand(type, cmd) {
    if (type === 'rclone') {
        modeSelect.value = cmd.mode;
        sourceInput.value = cmd.source || '';
        destinationInput.value = cmd.destination || '';
        document.getElementById('additional_flags').value = cmd.flags || '';
        showSection('rclone');
        updateModeUI();
    } else {
        terminalCommandInput.value = cmd.command;
        showSection('web-terminal');
    }
}

function loadNotepadContent() {
    notepadContent.value = localStorage.getItem('notepadContent') || '';
}

notepadContent.addEventListener('input', () => {
    localStorage.setItem('notepadContent', notepadContent.value);
});

                    logMessage(rcloneMajorStepsOutput, `Error: ${data.message}`, 'error');
                    appendOutput(rcloneLiveOutput, '\n--- Rclone Command Finished (Error) ---\n');
                    appendOutput(rcloneLiveOutput, data.output, 'error');
                    saveRcloneTransferToHistory(mode, source, destination, 'Failed');
                }
             } catch (e) {
                 // Ignore if not a valid JSON object
             }
        }
    }
}

async function stopRcloneTransfer() {
    if (!isRcloneProcessRunning) {
        logMessage(rcloneMajorStepsOutput, "No Rclone process is currently running.", 'info');
        return;
    }

    logMessage(rcloneMajorStepsOutput, "Sending stop signal to Rclone process...", 'info');
    try {
        const response = await fetch('/stop-rclone-process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const result = await response.json();
        if (result.status === 'success') {
            logMessage(rcloneMajorStepsOutput, result.message, 'success');
        } else {
            logMessage(rcloneMajorStepsOutput, `Failed to stop Rclone: ${result.message}`, 'error');
        }
    } catch (error) {
        logMessage(rcloneMajorStepsOutput, `Network error stopping Rclone: ${error.message}`, 'error');
    }
}

function appendOutput(element, text, status = 'default') {
    const span = document.createElement('span');
    span.textContent = text + '\n';
    if (status === 'success') span.style.color = 'var(--success-color)';
    if (status === 'error') span.style.color = 'var(--error-color)';
    if (status === 'warning') span.style.color = 'var(--warning-color)';
    if (status === 'info') span.style.color = 'var(--info-color)'; // Added info color

    element.appendChild(span);
    element.scrollTop = element.scrollHeight; // Auto-scroll to bottom
}

function logMessage(element, message, type = 'info') {
    const msgElement = document.createElement('div');
    msgElement.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    msgElement.classList.add(type); // Add class for styling
    element.appendChild(msgElement);
    element.scrollTop = element.scrollHeight;
}

function clearRcloneOutput() {
    rcloneLiveOutput.textContent = '';
    rcloneMajorStepsOutput.innerHTML = '';
    rcloneMajorStepsOutput.style.display = 'none';
    logMessage(majorStepsOutput, "Rclone output cleared.", 'info');
}

// --- Log Download ---
async function downloadLogs() {
    try {
        const response = await fetch('/download-rclone-log'); // Renamed endpoint for clarity
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            // Get filename from Content-Disposition header if available, otherwise default
            const contentDisposition = response.headers.get('Content-Disposition');
            const filenameMatch = contentDisposition && contentDisposition.match(/filename="?([^"]+)"?/);
            a.download = filenameMatch ? filenameMatch[1] : `rclone_webgui_log_${new Date().toISOString().slice(0,10)}.txt`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
            logMessage(rcloneMajorStepsOutput, "Rclone log download initiated.", 'info');
        } else {
            const errorData = await response.json();
            logMessage(rcloneMajorStepsOutput, `Failed to download log: ${errorData.message}`, 'error');
        }
    } catch (error) {
        logMessage(rcloneMajorStepsOutput, `Network error during log download: ${error.message}`, 'error');
    }
}

async function downloadTerminalLogs() {
    try {
        const response = await fetch('/download-terminal-log');
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            const contentDisposition = response.headers.get('Content-Disposition');
            const filenameMatch = contentDisposition && contentDisposition.match(/filename="?([^"]+)"?/);
            a.download = filenameMatch ? filenameMatch[1] : `terminal_log_${new Date().toISOString().slice(0,10)}.txt`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
            logMessage(terminalOutput, "Terminal log download initiated.", 'info');
        } else {
            const errorData = await response.json();
            logMessage(terminalOutput, `Failed to download terminal log: ${errorData.message}`, 'error');
        }
    } catch (error) {
        logMessage(terminalOutput, `Network error during terminal log download: ${error.message}`, 'error');
    }
}


// --- Web Terminal Logic ---
async function executeTerminalCommand(command = null) {
    const cmdToExecute = command || terminalCommandInput.value.trim();
    if (!cmdToExecute) {
        logMessage(terminalOutput, "Please enter a command.", 'error');
        return;
    }

    logMessage(terminalOutput, `Executing: ${cmdToExecute}`, 'info');
    showTerminalSpinner();
    terminalOutput.textContent = ''; // Clear previous output
    isTerminalProcessRunning = true;
    executeTerminalBtn.classList.add('hidden');
    stopTerminalBtn.classList.remove('hidden');

    try {
        const response = await fetch('/execute_terminal_command', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: cmdToExecute })
        });
        const result = await response.json();

        if (result.status === 'success') {
            logMessage(terminalOutput, result.message, 'success');
            saveCommandToHistory(cmdToExecute); // Save command on successful execution start
            startTerminalPolling(); // Start polling immediately after command execution starts
            terminalCommandInput.value = ''; // Clear input field
        } else if (result.status === 'warning' && result.message.includes("already running")) {
            // Show confirmation modal
            terminalConfirmMessage.innerHTML = `A command is currently running: <code class="bg-input-bg-color p-1 rounded-md text-sm">${escapeHtml(result.running_command)}</code>. Do you want to stop it and start a new one?`;
            terminalConfirmModal.classList.remove('hidden');
            pendingTerminalCommand = cmdToExecute; // Store the new command
        } else {
            logMessage(terminalOutput, `Error: ${result.message}`, 'error');
            hideTerminalSpinner();
            isTerminalProcessRunning = false;
            executeTerminalBtn.classList.remove('hidden');
            stopTerminalBtn.classList.add('hidden');
        }
    } catch (error) {
        logMessage(terminalOutput, `Network error: ${error.message}`, 'error');
        hideTerminalSpinner();
        isTerminalProcessRunning = false;
        executeTerminalBtn.classList.remove('hidden');
        stopTerminalBtn.classList.add('hidden');
    }
}

async function getTerminalOutput() {
    try {
        const response = await fetch('/get_terminal_output');
        const result = await response.json();
        terminalOutput.textContent = result.output; // Update with full content
        terminalOutput.scrollTop = terminalOutput.scrollHeight; // Auto-scroll

        if (!result.is_running && isTerminalProcessRunning) {
            // Process has finished on the backend
            logMessage(terminalOutput, "Terminal command finished.", 'info');
            hideTerminalSpinner();
            isTerminalProcessRunning = false;
            executeTerminalBtn.classList.remove('hidden');
            stopTerminalBtn.classList.add('hidden');
            stopTerminalPolling(); // Stop polling when command is done
        }
    } catch (error) {
        // Log error but don't stop polling immediately, might be a transient network issue
        console.error("Error fetching terminal output:", error);
        // If the backend is truly down, polling will naturally stop as requests fail
    }
}

async function stopTerminalProcess() {
    if (!isTerminalProcessRunning) {
        logMessage(terminalOutput, "No terminal process is currently running.", 'info');
        return;
    }

    logMessage(terminalOutput, "Sending stop signal to terminal process...", 'info');
    try {
        const response = await fetch('/stop_terminal_process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const result = await response.json();
        if (result.status === 'success') {
            logMessage(terminalOutput, result.message, 'success');
            hideTerminalSpinner();
            isTerminalProcessRunning = false;
            executeTerminalBtn.classList.remove('hidden');
            stopTerminalBtn.classList.add('hidden');
            stopTerminalPolling(); // Stop polling when process is stopped
        } else {
            logMessage(terminalOutput, `Failed to stop terminal process: ${result.message}`, 'error');
        }
    } catch (error) {
        logMessage(terminalOutput, `Network error stopping terminal process: ${error.message}`, 'error');
    }
}

function clearTerminalOutput() {
    terminalOutput.textContent = '';
    logMessage(terminalOutput, "Terminal output cleared.", 'info');
}

function startTerminalPolling() {
    if (terminalPollingInterval) {
        clearInterval(terminalPollingInterval);
    }
    terminalPollingInterval = setInterval(getTerminalOutput, 1000); // Poll every 1 second
}

function stopTerminalPolling() {
    if (terminalPollingInterval) {
        clearInterval(terminalPollingInterval);
        terminalPollingInterval = null;
    }
}


// --- Recent Commands History ---
function saveCommandToHistory(command) {
    let commands = JSON.parse(localStorage.getItem('terminalCommands')) || [];
    commands.unshift({ command: command, timestamp: new Date().toLocaleString() }); // Add to beginning
    if (commands.length > 20) { // Keep last 20 commands
        commands.pop();
    }
    localStorage.setItem('terminalCommands', JSON.stringify(commands));
}

function saveRcloneTransferToHistory(mode, source, destination, status) {
    let transfers = JSON.parse(localStorage.getItem('rcloneTransfers')) || [];
    transfers.unshift({
        mode: mode,
        source: source,
        destination: destination,
        status: status,
        timestamp: new Date().toLocaleString()
    });
    if (transfers.length > 20) { // Keep last 20 transfers
        transfers.pop();
    }
    localStorage.setItem('rcloneTransfers', JSON.stringify(transfers));
}


function loadRecentCommands() {
    const terminalCommands = JSON.parse(localStorage.getItem('terminalCommands')) || [];
    const rcloneTransfers = JSON.parse(localStorage.getItem('rcloneTransfers')) || [];

    recentTerminalCommandsDiv.innerHTML = '';
    if (terminalCommands.length === 0) {
        recentTerminalCommandsDiv.innerHTML = '<p class="text-text-color">No recent terminal commands.</p>';
    } else {
        terminalCommands.forEach(item => {
            const div = document.createElement('div');
            div.className = 'bg-input-bg-color p-3 rounded-md border border-border-color flex justify-between items-center';
            div.innerHTML = `
                <div>
                    <code class="text-primary-color text-sm">${escapeHtml(item.command)}</code>
                    <p class="text-xs text-gray-400 mt-1">${item.timestamp}</p>
                </div>
                <button class="btn-secondary btn-copy-command px-3 py-1 text-xs" data-command="${escapeHtml(item.command)}">
                    <i class="fas fa-copy"></i> Copy
                </button>
            `;
            recentTerminalCommandsDiv.appendChild(div);
        });
    }

    recentRcloneTransfersDiv.innerHTML = '';
    if (rcloneTransfers.length === 0) {
        recentRcloneTransfersDiv.innerHTML = '<p class="text-text-color">No recent Rclone transfers.</p>';
    } else {
        rcloneTransfers.forEach(item => {
            const statusClass = item.status === 'Success' ? 'text-success-color' : (item.status === 'Failed' ? 'text-error-color' : 'text-warning-color');
            const div = document.createElement('div');
            div.className = 'bg-input-bg-color p-3 rounded-md border border-border-color space-y-1';
            div.innerHTML = `
                <p><span class="font-semibold text-accent-color">${item.mode}:</span> <code class="text-primary-color text-sm">${escapeHtml(item.source)}</code> ${item.destination ? `<i class="fas fa-arrow-right mx-1 text-gray-500"></i> <code class="text-primary-color text-sm">${escapeHtml(item.destination)}</code>` : ''}</p>
                <p class="text-xs text-gray-400">Status: <span class="${statusClass}">${item.status}</span> | ${item.timestamp}</p>
                <div class="flex flex-wrap gap-2 mt-2">
                    <button class="btn-secondary btn-copy-rclone-source px-3 py-1 text-xs" data-source="${escapeHtml(item.source)}"><i class="fas fa-copy"></i> Copy Source</button>
                    ${item.destination ? `<button class="btn-secondary btn-copy-rclone-destination px-3 py-1 text-xs" data-destination="${escapeHtml(item.destination)}"><i class="fas fa-copy"></i> Copy Destination</button>` : ''}
                </div>
            `;
            recentRcloneTransfersDiv.appendChild(div);
        });
    }

    // Add event listeners for copy buttons (must be done after content is loaded)
    document.querySelectorAll('.btn-copy-command').forEach(button => {
        button.onclick = (e) => copyToClipboard(e.target.dataset.command || e.target.closest('button').dataset.command);
    });
    document.querySelectorAll('.btn-copy-rclone-source').forEach(button => {
        button.onclick = (e) => copyToClipboard(e.target.dataset.source || e.target.closest('button').dataset.source);
    });
    document.querySelectorAll('.btn-copy-rclone-destination').forEach(button => {
        button.onclick = (e) => copyToClipboard(e.target.dataset.destination || e.target.closest('button').dataset.destination);
    });
}


function clearAllRecentCommands() {
    // Replaced confirm with a custom modal if needed, but for simplicity, keeping this as is for now.
    // In a full production app, this would be a custom modal/dialog.
    if (confirm("Are you sure you want to clear all recent commands and transfers history? This cannot be undone.")) {
        localStorage.removeItem('terminalCommands');
        localStorage.removeItem('rcloneTransfers');
        loadRecentCommands(); // Reload to show empty state
        logMessage(majorStepsOutput, "All recent commands and transfers history cleared.", 'info');
    }
}

// --- Notepad Logic ---
function saveNotepadContent() {
    localStorage.setItem('notepadContent', notepadContent.value);
}

function loadNotepadContent() {
    notepadContent.value = localStorage.getItem('notepadContent') || '';
}

// Utility to escape HTML for display
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}

// --- Clipboard Copy Utility ---
function copyToClipboard(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    try {
        const successful = document.execCommand('copy');
        // A simple visual feedback for copy
        const copyFeedback = document.createElement('span');
        copyFeedback.textContent = successful ? "Copied!" : "Failed to copy!";
        copyFeedback.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background-color: rgba(var(--card-bg-color-rgb), 0.9);
            color: var(--primary-color);
            padding: 10px 20px;
            border-radius: 8px;
            z-index: 1001;
            opacity: 0;
            transition: opacity 0.3s ease-in-out;
        `;
        document.body.appendChild(copyFeedback);
        setTimeout(() => {
            copyFeedback.style.opacity = 1;
        }, 10); // Small delay to trigger transition
        setTimeout(() => {
            copyFeedback.style.opacity = 0;
            copyFeedback.remove();
        }, 1500); // Hide after 1.5 seconds

    } catch (err) {
        logMessage(majorStepsOutput, "Failed to copy to clipboard (unsupported by browser).", 'error');
    }
    document.body.removeChild(textarea);
}


// --- Logout ---
function logout() {
    window.location.href = '/logout';
}

// --- Theme Changer ---
document.addEventListener('DOMContentLoaded', () => {
    const themeChangerBtn = document.getElementById('themeChangerBtn');
    const themeDropdown = document.getElementById('themeDropdown');

    // Toggle dropdown visibility
    themeChangerBtn.addEventListener('click', (event) => {
        event.stopPropagation(); // Prevent click from bubbling to document and closing immediately
        themeDropdown.classList.toggle('hidden');
    });

    // Close dropdown if clicked outside
    document.addEventListener('click', (event) => {
        if (!themeDropdown.contains(event.target) && !themeChangerBtn.contains(event.target)) {
            themeDropdown.classList.add('hidden');
        }
    });

    // Apply selected theme
    themeDropdown.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            const theme = event.target.dataset.theme;
            document.body.className = theme; // Set the class on the body
            localStorage.setItem('theme', theme); // Save theme preference
            themeDropdown.classList.add('hidden'); // Hide dropdown after selection
        });
    });

    // Load saved theme on initial page load - Moved to <head> for login.html to prevent flash
    // For index.html, this will still apply on DOMContentLoaded
    const savedTheme = localStorage.getItem('theme') || 'dark-mode'; // Default to dark-mode
    document.body.className = savedTheme;
});


// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    // Initial UI setup
    showSection('rclone-transfer'); // Show Rclone Transfer section by default
    updateModeDescription(); // Set initial mode description
    toggleRemoteField(); // Set initial destination field visibility

    // Header scroll behavior
    window.addEventListener('scroll', handleScroll);


    // Listen for file input changes to display file name
    rcloneConfFileInput.addEventListener('change', (event) => {
        rcloneConfFileNameDisplay.textContent = event.target.files[0] ? event.target.files[0].name : 'No file chosen';
    });
    saZipFileInput.addEventListener('change', (event) => {
        saZipFileNameDisplay.textContent = event.target.files[0] ? event.target.files[0].name : 'No file chosen';
    });


    // Rclone Form Events
    modeSelect.addEventListener('change', () => {
        updateModeDescription();
        toggleRemoteField();
    });
    transfersInput.addEventListener('input', () => {
        transfersValueSpan.textContent = transfersInput.value;
    });
    checkersInput.addEventListener('input', () => {
        checkersValueSpan.textContent = checkersInput.value;
    });
    startRcloneBtn.addEventListener('click', startRcloneTransfer);
    stopRcloneBtn.addEventListener('click', stopRcloneTransfer);

    // Terminal Events
    executeTerminalBtn.addEventListener('click', () => executeTerminalCommand());
    stopTerminalBtn.addEventListener('click', stopTerminalProcess);
    terminalCommandInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault(); // Prevent default form submission
            executeTerminalCommand();
        }
    });

    confirmStopAndStartBtn.addEventListener('click', async () => {
        terminalConfirmModal.classList.add('hidden');
        await stopTerminalProcess(); // Ensure the current process is stopped
        if (pendingTerminalCommand) {
            executeTerminalCommand(pendingTerminalCommand); // Execute the new command
            pendingTerminalCommand = null;
        }
    });

    cancelStopAndStartBtn.addEventListener('click', () => {
        terminalConfirmModal.classList.add('hidden');
        pendingTerminalCommand = null; // Clear pending command
        hideTerminalSpinner();
        isTerminalProcessRunning = false; // Reset state if cancelled
        executeTerminalBtn.classList.remove('hidden');
        stopTerminalBtn.classList.add('hidden');
    });

    // Notepad auto-save
    notepadContent.addEventListener('input', saveNotepadContent);

    // Close modal on Escape key press
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            if (!terminalConfirmModal.classList.contains('hidden')) {
                terminalConfirmModal.classList.add('hidden');
                pendingTerminalCommand = null; // Clear pending command
                hideTerminalSpinner();
                isTerminalProcessRunning = false; // Reset state if cancelled
                executeTerminalBtn.classList.remove('hidden');
                stopTerminalBtn.classList.add('hidden');
            }
        }
    });

    // Event listener for Recent Commands tab to load content when clicked
    document.querySelector('.nav-button[onclick*="recent-commands"]').addEventListener('click', loadRecentCommands);
});
