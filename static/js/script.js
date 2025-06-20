// --- DOM Element References ---
const setupSection = document.getElementById('setup-section');
const rcloneTransferSection = document.getElementById('rclone-transfer-section');
const webTerminalSection = document.getElementById('web-terminal-section');
const recentCommandsSection = document.getElementById('recent-commands-section');
const notepadSection = document.getElementById('notepad-section');

const navButtons = document.querySelectorAll('.nav-button');

const modeSelect = document.getElementById('mode');
const modeDescription = document.getElementById('mode-description');
const sourceFieldContainer = document.getElementById('source-field-container');
const sourceLabel = document.getElementById('source-label');
const sourceInput = document.getElementById('source');
const urlInput = document.getElementById('url-input');
const serveProtocolSelect = document.getElementById('serve-protocol-select');
const servePortInput = document.getElementById('serve-port-input');
const servePathInput = document.getElementById('serve-path-input');
const destinationField = document.getElementById('destination-field');
const destinationInput = document.getElementById('destination');
const transfersInput = document.getElementById('transfers');
const transfersValueSpan = document.getElementById('transfers-value');
const checkersInput = document.getElementById('checkers');
const checkersValueSpan = document.getElementById('checkers-value');
const bufferSizeSelect = document.getElementById('buffer_size');
const orderSelect = document.getElementById('order');
const loglevelSelect = document.getElementById('loglevel');
const additionalFlagsInput = document.getElementById('additional_flags');
const useDriveTrashCheckbox = document.getElementById('use_drive_trash');
const serviceAccountCheckbox = document.getElementById('service_account');
const dryRunCheckbox = document.getElementById('dry_run');

const startRcloneBtn = document.getElementById('start-rclone-btn');
const stopRcloneBtn = document.getElementById('stop-rclone-btn');
const rcloneLiveOutput = document.getElementById('rcloneLiveOutput');
const rcloneMajorStepsOutput = document.getElementById('rclone-major-steps');
const rcloneSpinner = document.getElementById('rclone-spinner');
const rcloneSpinnerText = document.getElementById('rclone-spinner-text');

const rcloneConfFileInput = document.getElementById('rclone_conf_file_input');
const rcloneConfFileNameDisplay = document.getElementById('rclone-conf-file-name');
const saZipFileInput = document.getElementById('sa_zip_file_input');
const saZipFileNameDisplay = document.getElementById('sa-zip-file-name');
const majorStepsOutput = document.getElementById('majorStepsOutput');

const terminalCommandInput = document.getElementById('terminalCommand');
const executeTerminalBtn = document.getElementById('execute-terminal-btn');
const stopTerminalBtn = document.getElementById('stop-terminal-btn');
const terminalOutput = document.getElementById('terminalOutput');
const terminalSpinner = document.getElementById('terminal-spinner');
const terminalSpinnerText = document.getElementById('terminal-spinner-text');
const terminalConfirmModal = document.getElementById('terminalConfirmModal');
const terminalConfirmMessage = document.getElementById('terminalConfirmMessage');
const confirmStopAndStartBtn = document.getElementById('confirmStopAndStartBtn');
const cancelStopAndStartBtn = document.getElementById('cancelStopAndStartBtn');

const recentRcloneTransfersDiv = document.getElementById('recentRcloneTransfers');
const recentTerminalCommandsDiv = document.getElementById('recentTerminalCommands');

const notepadContent = document.getElementById('notepad-content');

// --- Global State Variables ---
let rclonePollingInterval = null;
let terminalPollingInterval = null;
let processStatePollingInterval = null;
let isRcloneProcessRunning = false;
let isTerminalProcessRunning = false;
let pendingTerminalCommand = null;

// Auto-scrolling state
let rcloneAutoScrollEnabled = true;
let terminalAutoScrollEnabled = true;
let rcloneUserScrolledUp = false;
let terminalUserScrolledUp = false;

// For header scroll behavior
let lastScrollY = 0;
const header = document.querySelector('header');
const headerHeight = header ? header.offsetHeight : 0;

const RcloneModeDescriptions = {
    "sync": "Make source and destination identical.",
    "copy": "Copy files from source to destination.",
    "move": "Move files from source to destination.",
    "copyurl": "Copy a URL content to destination.",
    "check": "Check files in the source match the files in the destination.",
    "cryptcheck": "Cryptcheck the vault.",
    "lsd": "List directories/containers in the path.",
    "ls": "List all files in the path.",
    "tree": "List contents of remote in a tree-like fashion.",
    "listremotes": "List all remotes in the config file.",
    "mkdir": "Create new directory.",
    "size": "Counts objects and their sizes in a remote.",
    "serve": "Serve a remote over HTTP/WebDAV/FTP/etc.",
    "dedupe": "Remove duplicate files.",
    "cleanup": "Clean up the remote.",
    "delete": "Remove files in the path.",
    "deletefile": "Remove a single file from remote.",
    "purge": "Remove all content in the path.",
    "version": "Show version and exit."
};

// Modes requiring two remotes (source and destination)
const modesTwoRemotes = ["sync", "copy", "move", "check", "cryptcheck"];
// Modes requiring a URL and a destination
const modesCopyUrl = ["copyurl"];
// Modes requiring one remote (source as path/remote)
const modesOneRemote = ["lsd", "ls", "tree", "mkdir", "size", "dedupe", "cleanup", "delete", "deletefile", "purge"];
// Modes for serving a remote
const modesServe = ["serve"];
// Modes requiring no arguments other than --config
const modesNoArgs = ["listremotes", "version"];

const potentiallyDestructiveModes = ["delete", "purge", "move", "cleanup", "dedupe"];

// --- Process State Management ---
async function checkProcessStates() {
    try {
        const response = await fetch('/get-process-states');
        const states = await response.json();
        
        // Update Rclone button state
        if (states.rclone.running !== isRcloneProcessRunning) {
            isRcloneProcessRunning = states.rclone.running;
            if (isRcloneProcessRunning) {
                startRcloneBtn.classList.add('hidden');
                stopRcloneBtn.classList.remove('hidden');
                showRcloneSpinner("Command running...");
            } else {
                startRcloneBtn.classList.remove('hidden');
                stopRcloneBtn.classList.add('hidden');
                hideRcloneSpinner();
            }
        }
        
        // Update Terminal button state
        if (states.terminal.running !== isTerminalProcessRunning) {
            isTerminalProcessRunning = states.terminal.running;
            if (isTerminalProcessRunning) {
                executeTerminalBtn.classList.add('hidden');
                stopTerminalBtn.classList.remove('hidden');
                showTerminalSpinner("Command running...");
            } else {
                executeTerminalBtn.classList.remove('hidden');
                stopTerminalBtn.classList.add('hidden');
                hideTerminalSpinner();
            }
        }
    } catch (error) {
        console.error("Error checking process states:", error);
    }
}

function startProcessStatePolling() {
    if (processStatePollingInterval) {
        clearInterval(processStatePollingInterval);
    }
    processStatePollingInterval = setInterval(checkProcessStates, 2000); // Poll every 2 seconds
}

function stopProcessStatePolling() {
    if (processStatePollingInterval) {
        clearInterval(processStatePollingInterval);
        processStatePollingInterval = null;
    }
}

// --- Auto-scrolling Functions ---
function setupAutoScrolling(outputElement, autoScrollEnabledVar, userScrolledUpVar) {
    let isAtBottom = true;
    
    outputElement.addEventListener('scroll', () => {
        const threshold = 50; // pixels from bottom
        isAtBottom = outputElement.scrollTop + outputElement.clientHeight >= outputElement.scrollHeight - threshold;
        
        if (outputElement === rcloneLiveOutput) {
            rcloneUserScrolledUp = !isAtBottom;
        } else if (outputElement === terminalOutput) {
            terminalUserScrolledUp = !isAtBottom;
        }
    });
    
    return {
        scrollToBottom: () => {
            if (isAtBottom || (!rcloneUserScrolledUp && outputElement === rcloneLiveOutput) || (!terminalUserScrolledUp && outputElement === terminalOutput)) {
                outputElement.scrollTop = outputElement.scrollHeight;
            }
        },
        isAtBottom: () => isAtBottom
    };
}

// --- UI Toggling Functions ---
function showSection(sectionId) {
    // Hide all sections
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.add('hidden');
        section.classList.remove('active');
    });
    // Deactivate all nav buttons
    navButtons.forEach(button => button.classList.remove('active'));

    // Show the selected section
    const selectedSection = document.getElementById(`${sectionId}-section`);
    if (selectedSection) {
        selectedSection.classList.remove('hidden');
        selectedSection.classList.add('active');
    }

    // Activate the corresponding nav button
    const activeButton = document.querySelector(`.nav-button[onclick*="${sectionId}"]`);
    if (activeButton) {
        activeButton.classList.add('active');
    }

    // Manage polling based on active section
    if (sectionId === 'web-terminal') {
        startTerminalPolling();
    } else {
        stopTerminalPolling();
    }

    // Load notepad content if switching to notepad section
    if (sectionId === 'notepad') {
        loadNotepadContent();
    } else if (sectionId === 'recent-commands') {
        loadRecentCommands();
    }
}

function showRcloneSpinner(message = "Transferring...") {
    if (rcloneSpinnerText) {
        rcloneSpinnerText.textContent = message;
    }
    if (rcloneSpinner) {
        rcloneSpinner.classList.remove('hidden');
    }
}

function hideRcloneSpinner() {
    if (rcloneSpinner) {
        rcloneSpinner.classList.add('hidden');
    }
}

function showTerminalSpinner(message = "Executing command...") {
    if (terminalSpinnerText) {
        terminalSpinnerText.textContent = message;
    }
    if (terminalSpinner) {
        terminalSpinner.classList.remove('hidden');
    }
}

function hideTerminalSpinner() {
    if (terminalSpinner) {
        terminalSpinner.classList.add('hidden');
    }
}

// --- Header Scroll Behavior ---
function handleScroll() {
    if (!header) return;
    
    if (window.scrollY > lastScrollY && window.scrollY > headerHeight) {
        header.classList.remove('header-visible');
        header.classList.add('header-hidden');
    } else {
        header.classList.remove('header-hidden');
        header.classList.add('header-visible');
    }
    lastScrollY = window.scrollY;
}

// --- Rclone Mode Logic ---
function updateModeDescription() {
    const selectedMode = modeSelect.value;
    const description = RcloneModeDescriptions[selectedMode] || "No description available.";
    if (modeDescription) {
        modeDescription.textContent = description;
    }

    // Warn about destructive modes
    if (potentiallyDestructiveModes.includes(selectedMode)) {
        if (rcloneMajorStepsOutput) {
            rcloneMajorStepsOutput.innerHTML = `<span class="warning"><i class="fas fa-exclamation-triangle mr-2"></i> WARNING: This mode (${selectedMode}) can lead to data loss! Use with caution.</span>`;
            rcloneMajorStepsOutput.style.display = 'block';
        }
    } else {
        if (rcloneMajorStepsOutput) {
            rcloneMajorStepsOutput.style.display = 'none';
            rcloneMajorStepsOutput.innerHTML = '';
        }
    }
    toggleRemoteField();
}

function toggleRemoteField() {
    const selectedMode = modeSelect.value;

    // Hide all mode-specific inputs initially
    if (sourceInput) sourceInput.classList.add('hidden');
    if (urlInput) urlInput.classList.add('hidden');
    if (serveProtocolSelect) serveProtocolSelect.classList.add('hidden');
    if (servePortInput) servePortInput.classList.add('hidden');
    if (servePathInput) servePathInput.classList.add('hidden');
    if (sourceLabel) sourceLabel.textContent = 'Source Path';

    // Reset required attributes
    if (sourceInput) sourceInput.removeAttribute('required');
    if (urlInput) urlInput.removeAttribute('required');
    if (destinationInput) destinationInput.removeAttribute('required');

    // Show/hide source and destination fields based on mode type
    if (modesTwoRemotes.includes(selectedMode)) {
        if (sourceInput) {
            sourceInput.classList.remove('hidden');
            sourceInput.setAttribute('required', 'true');
        }
        if (destinationField) destinationField.classList.remove('hidden');
        if (destinationInput) destinationInput.setAttribute('required', 'true');
        if (sourceLabel) sourceLabel.textContent = 'Source Path';
    } else if (modesCopyUrl.includes(selectedMode)) {
        if (urlInput) {
            urlInput.classList.remove('hidden');
            urlInput.setAttribute('required', 'true');
        }
        if (destinationField) destinationField.classList.remove('hidden');
        if (destinationInput) destinationInput.setAttribute('required', 'true');
        if (sourceLabel) sourceLabel.textContent = 'URL';
    } else if (modesOneRemote.includes(selectedMode)) {
        if (sourceInput) {
            sourceInput.classList.remove('hidden');
            sourceInput.setAttribute('required', 'true');
        }
        if (destinationField) destinationField.classList.add('hidden');
        if (sourceLabel) sourceLabel.textContent = 'Path/Remote';
    } else if (modesServe.includes(selectedMode)) {
        if (serveProtocolSelect) serveProtocolSelect.classList.remove('hidden');
        if (servePortInput) servePortInput.classList.remove('hidden');
        if (servePathInput) servePathInput.classList.remove('hidden');
        if (sourceInput) {
            sourceInput.classList.remove('hidden');
            sourceInput.setAttribute('required', 'true');
        }
        if (destinationField) destinationField.classList.add('hidden');
        if (sourceLabel) sourceLabel.textContent = 'Path to serve';
    } else if (modesNoArgs.includes(selectedMode)) {
        if (sourceInput) sourceInput.classList.add('hidden');
        if (destinationField) destinationField.classList.add('hidden');
        if (sourceInput) sourceInput.removeAttribute('required');
        if (destinationInput) destinationInput.removeAttribute('required');
    }
}

// --- Generic File Upload ---
async function uploadFile(fileInput, fileNameDisplay, endpoint, outputElement, successMessage) {
    const file = fileInput.files[0];
    if (!file) {
        logMessage(outputElement, "No file selected.", 'error');
        return;
    }

    const formData = new FormData();
    formData.append(fileInput.name, file);

    logMessage(outputElement, `Uploading ${file.name}...`, 'info');

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            body: formData,
        });

        const result = await response.json();
        if (result.status === 'success') {
            logMessage(outputElement, `${successMessage}: ${result.message}`, 'success');
        } else {
            logMessage(outputElement, `Upload failed: ${result.message}`, 'error');
        }
    } catch (error) {
        logMessage(outputElement, `Network error during upload: ${error.message}`, 'error');
    } finally {
        fileInput.value = '';
        if (fileNameDisplay) fileNameDisplay.textContent = 'No file chosen';
    }
}

function uploadRcloneConf() {
    uploadFile(rcloneConfFileInput, rcloneConfFileNameDisplay, '/upload-rclone-conf', majorStepsOutput, 'Rclone config uploaded');
}

function uploadSaZip() {
    uploadFile(saZipFileInput, saZipFileNameDisplay, '/upload-sa-zip', majorStepsOutput, 'Service accounts uploaded');
}

// --- Rclone Transfer Logic ---
async function startRcloneTransfer() {
    if (isRcloneProcessRunning) {
        logMessage(rcloneMajorStepsOutput, "Rclone process is already running. Please stop it first.", 'warning');
        return;
    }

    const mode = modeSelect.value;
    let source = '';
    const destination = destinationInput ? destinationInput.value.trim() : '';
    let serveProtocol = '';
    let servePort = '';
    let servePath = '';

    // Handle source/URL/path-to-serve based on selected mode
    if (modesCopyUrl.includes(mode)) {
        source = urlInput ? urlInput.value.trim() : '';
        if (!source) {
            logMessage(rcloneMajorStepsOutput, "URL is required for copyurl mode.", 'error');
            return;
        }
    } else if (modesServe.includes(mode)) {
        source = sourceInput ? sourceInput.value.trim() : '';
        serveProtocol = serveProtocolSelect ? serveProtocolSelect.value : '';
        servePort = servePortInput ? servePortInput.value.trim() : '8080';
        servePath = servePathInput ? servePathInput.value.trim() : '/';
        if (!source) {
            logMessage(rcloneMajorStepsOutput, "Path to serve is required for serve mode.", 'error');
            return;
        }
    } else if (modesTwoRemotes.includes(mode) || modesOneRemote.includes(mode)) {
        source = sourceInput ? sourceInput.value.trim() : '';
        if (!source && (modesTwoRemotes.includes(mode) || modesOneRemote.includes(mode))) {
            logMessage(rcloneMajorStepsOutput, "Source (path/remote) is required for this Rclone mode.", 'error');
            return;
        }
    } else if (modesNoArgs.includes(mode)) {
        // No arguments needed
    } else {
        logMessage(rcloneMajorStepsOutput, `Unknown Rclone mode: ${mode}`, 'error');
        return;
    }

    // Validate destination for modes that require it
    if ((modesTwoRemotes.includes(mode) || modesCopyUrl.includes(mode)) && !destination) {
        logMessage(rcloneMajorStepsOutput, "Destination is required for this Rclone mode.", 'error');
        return;
    }

    if (rcloneLiveOutput) rcloneLiveOutput.textContent = '';
    logMessage(rcloneMajorStepsOutput, 'Initializing Rclone transfer...', 'info');
    showRcloneSpinner();
    isRcloneProcessRunning = true;
    if (startRcloneBtn) startRcloneBtn.classList.add('hidden');
    if (stopRcloneBtn) stopRcloneBtn.classList.remove('hidden');

    const payload = {
        mode: mode,
        source: source,
        destination: destination,
        transfers: transfersInput ? parseInt(transfersInput.value) : 2,
        checkers: checkersInput ? parseInt(checkersInput.value) : 3,
        buffer_size: bufferSizeSelect ? bufferSizeSelect.value : '16M',
        order: orderSelect ? orderSelect.value : 'size,mixed,50',
        loglevel: loglevelSelect ? loglevelSelect.value : 'Info',
        additional_flags: additionalFlagsInput ? additionalFlagsInput.value.trim() : '',
        use_drive_trash: useDriveTrashCheckbox ? useDriveTrashCheckbox.checked : false,
        service_account: serviceAccountCheckbox ? serviceAccountCheckbox.checked : false,
        dry_run: dryRunCheckbox ? dryRunCheckbox.checked : false,
        serve_protocol: serveProtocol,
        serve_port: servePort,
        serve_path: servePath
    };

    try {
        const response = await fetch('/execute-rclone', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorData = await response.json();
            logMessage(rcloneMajorStepsOutput, `Error: ${errorData.message}`, 'error');
            resetRcloneButtons();
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            let newlineIndex;
            while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                const line = buffer.substring(0, newlineIndex);
                buffer = buffer.substring(newlineIndex + 1);

                if (line.trim()) {
                    try {
                        const data = JSON.parse(line);
                        if (data.status === 'progress') {
                            appendOutput(rcloneLiveOutput, data.output);
                        } else if (data.status === 'complete') {
                            logMessage(rcloneMajorStepsOutput, data.message, 'success');
                            appendOutput(rcloneLiveOutput, '\n--- Rclone Command Finished (Success) ---\n');
                            appendOutput(rcloneLiveOutput, data.output, 'success');
                            saveRcloneTransferToHistory(mode, source, destination, 'Success');
                        } else if (data.status === 'error') {
                            logMessage(rcloneMajorStepsOutput, `Error: ${data.message}`, 'error');
                            appendOutput(rcloneLiveOutput, '\n--- Rclone Command Finished (Error) ---\n');
                            appendOutput(rcloneLiveOutput, data.output, 'error');
                            saveRcloneTransferToHistory(mode, source, destination, 'Failed');
                        } else if (data.status === 'stopped') {
                            logMessage(rcloneMajorStepsOutput, data.message, 'info');
                            appendOutput(rcloneLiveOutput, '\n--- Rclone Command Stopped by User ---\n');
                            saveRcloneTransferToHistory(mode, source, destination, 'Stopped');
                        }
                    } catch (parseError) {
                        // Handle non-JSON lines or partial JSON
                        console.warn('Could not parse JSON line:', line, parseError);
                    }
                }
            }
        }
    } catch (error) {
        logMessage(rcloneMajorStepsOutput, `Network or Rclone execution error: ${error.message}`, 'error');
        appendOutput(rcloneLiveOutput, `\nError during stream: ${error.message}`, 'error');
        saveRcloneTransferToHistory(mode, source, destination, 'Failed');
    } finally {
        resetRcloneButtons();
    }
}

function resetRcloneButtons() {
    hideRcloneSpinner();
    isRcloneProcessRunning = false;
    if (startRcloneBtn) startRcloneBtn.classList.remove('hidden');
    if (stopRcloneBtn) stopRcloneBtn.classList.add('hidden');
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
    if (!element) return;
    
    const span = document.createElement('span');
    span.textContent = text + '\n';
    if (status === 'success') span.style.color = 'var(--success-color)';
    if (status === 'error') span.style.color = 'var(--error-color)';
    if (status === 'warning') span.style.color = 'var(--warning-color)';
    if (status === 'info') span.style.color = 'var(--info-color)';

    element.appendChild(span);
    
    // Auto-scroll with smart pause/resume
    if (element === rcloneLiveOutput && !rcloneUserScrolledUp) {
        element.scrollTop = element.scrollHeight;
    } else if (element === terminalOutput && !terminalUserScrolledUp) {
        element.scrollTop = element.scrollHeight;
    }
}

function logMessage(element, message, type = 'info') {
    if (!element) return;
    
    const msgElement = document.createElement('div');
    msgElement.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    msgElement.classList.add(type);
    element.appendChild(msgElement);
    element.scrollTop = element.scrollHeight;
}

async function clearRcloneOutput() {
    try {
        const response = await fetch('/clear-rclone-output', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const result = await response.json();
        
        if (result.status === 'success') {
            if (rcloneLiveOutput) rcloneLiveOutput.textContent = '';
            if (rcloneMajorStepsOutput) {
                rcloneMajorStepsOutput.innerHTML = '';
                rcloneMajorStepsOutput.style.display = 'none';
            }
            logMessage(majorStepsOutput, "Rclone output cleared.", 'info');
        } else {
            logMessage(majorStepsOutput, `Failed to clear output: ${result.message}`, 'error');
        }
    } catch (error) {
        logMessage(majorStepsOutput, `Network error clearing output: ${error.message}`, 'error');
    }
}

// --- Log Download ---
async function downloadLogs() {
    try {
        const response = await fetch('/download-rclone-log');
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
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
    const cmdToExecute = command || (terminalCommandInput ? terminalCommandInput.value.trim() : '');
    if (!cmdToExecute) {
        logMessage(terminalOutput, "Please enter a command.", 'error');
        return;
    }

    logMessage(terminalOutput, `Executing: ${cmdToExecute}`, 'info');
    showTerminalSpinner();
    if (terminalOutput) terminalOutput.textContent = '';
    isTerminalProcessRunning = true;
    if (executeTerminalBtn) executeTerminalBtn.classList.add('hidden');
    if (stopTerminalBtn) stopTerminalBtn.classList.remove('hidden');

    try {
        const response = await fetch('/execute_terminal_command', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: cmdToExecute })
        });
        const result = await response.json();

        if (result.status === 'success') {
            logMessage(terminalOutput, result.message, 'success');
            saveCommandToHistory(cmdToExecute);
            startTerminalPolling();
            if (terminalCommandInput) terminalCommandInput.value = '';
        } else if (result.status === 'warning' && result.message.includes("already running")) {
            // Show confirmation modal
            if (terminalConfirmMessage) {
                terminalConfirmMessage.innerHTML = `A command is currently running: <code class="bg-input-bg-color p-1 rounded-md text-sm">${escapeHtml(result.running_command)}</code>. Do you want to stop it and start a new one?`;
            }
            if (terminalConfirmModal) terminalConfirmModal.classList.remove('hidden');
            pendingTerminalCommand = cmdToExecute;
        } else {
            logMessage(terminalOutput, `Error: ${result.message}`, 'error');
            hideTerminalSpinner();
            isTerminalProcessRunning = false;
            if (executeTerminalBtn) executeTerminalBtn.classList.remove('hidden');
            if (stopTerminalBtn) stopTerminalBtn.classList.add('hidden');
        }
    } catch (error) {
        logMessage(terminalOutput, `Network error: ${error.message}`, 'error');
        hideTerminalSpinner();
        isTerminalProcessRunning = false;
        if (executeTerminalBtn) executeTerminalBtn.classList.remove('hidden');
        if (stopTerminalBtn) stopTerminalBtn.classList.add('hidden');
    }
}

async function getTerminalOutput() {
    try {
        const response = await fetch('/get_terminal_output');
        const result = await response.json();
        if (terminalOutput) terminalOutput.textContent = result.output;
        
        // Auto-scroll with smart pause/resume
        if (terminalOutput && !terminalUserScrolledUp) {
            terminalOutput.scrollTop = terminalOutput.scrollHeight;
        }

        if (!result.is_running && isTerminalProcessRunning) {
            logMessage(terminalOutput, "Terminal command finished.", 'info');
            hideTerminalSpinner();
            isTerminalProcessRunning = false;
            if (executeTerminalBtn) executeTerminalBtn.classList.remove('hidden');
            if (stopTerminalBtn) stopTerminalBtn.classList.add('hidden');
            stopTerminalPolling();
        }
    } catch (error) {
        console.error("Error fetching terminal output:", error);
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
            if (executeTerminalBtn) executeTerminalBtn.classList.remove('hidden');
            if (stopTerminalBtn) stopTerminalBtn.classList.add('hidden');
            stopTerminalPolling();
        } else {
            logMessage(terminalOutput, `Failed to stop terminal process: ${result.message}`, 'error');
        }
    } catch (error) {
        logMessage(terminalOutput, `Network error stopping terminal process: ${error.message}`, 'error');
    }
}

async function clearTerminalOutput() {
    try {
        const response = await fetch('/clear-terminal-output', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const result = await response.json();
        
        if (result.status === 'success') {
            if (terminalOutput) terminalOutput.textContent = '';
            logMessage(terminalOutput, "Terminal output cleared.", 'info');
        } else {
            logMessage(terminalOutput, `Failed to clear output: ${result.message}`, 'error');
        }
    } catch (error) {
        logMessage(terminalOutput, `Network error clearing output: ${error.message}`, 'error');
    }
}

function startTerminalPolling() {
    if (terminalPollingInterval) {
        clearInterval(terminalPollingInterval);
    }
    terminalPollingInterval = setInterval(getTerminalOutput, 1000);
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
    commands.unshift({ command: command, timestamp: new Date().toLocaleString() });
    if (commands.length > 20) {
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
    if (transfers.length > 20) {
        transfers.pop();
    }
    localStorage.setItem('rcloneTransfers', JSON.stringify(transfers));
}

function loadRecentCommands() {
    const terminalCommands = JSON.parse(localStorage.getItem('terminalCommands')) || [];
    const rcloneTransfers = JSON.parse(localStorage.getItem('rcloneTransfers')) || [];

    if (recentTerminalCommandsDiv) {
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
    }

    if (recentRcloneTransfersDiv) {
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
    }

    // Add event listeners for copy buttons
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
    if (confirm("Are you sure you want to clear all recent commands and transfers history? This cannot be undone.")) {
        localStorage.removeItem('terminalCommands');
        localStorage.removeItem('rcloneTransfers');
        loadRecentCommands();
        logMessage(majorStepsOutput, "All recent commands and transfers history cleared.", 'info');
    }
}

// --- Notepad Logic ---
function saveNotepadContent() {
    if (notepadContent) {
        localStorage.setItem('notepadContent', notepadContent.value);
    }
}

function loadNotepadContent() {
    if (notepadContent) {
        notepadContent.value = localStorage.getItem('notepadContent') || '';
    }
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
        }, 10);
        setTimeout(() => {
            copyFeedback.style.opacity = 0;
            copyFeedback.remove();
        }, 1500);
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

    if (themeChangerBtn && themeDropdown) {
        // Toggle dropdown visibility
        themeChangerBtn.addEventListener('click', (event) => {
            event.stopPropagation();
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
                document.body.className = theme;
                localStorage.setItem('theme', theme);
                themeDropdown.classList.add('hidden');
            });
        });
    }

    // Load saved theme on initial page load
    const savedTheme = localStorage.getItem('theme') || 'dark-mode';
    document.body.className = savedTheme;
});

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    // Initial UI setup
    showSection('rclone-transfer');
    updateModeDescription();
    toggleRemoteField();

    // Start process state polling for cross-device synchronization
    startProcessStatePolling();

    // Header scroll behavior
    if (header) {
        window.addEventListener('scroll', handleScroll);
    }

    // Setup auto-scrolling for output areas
    if (rcloneLiveOutput) {
        setupAutoScrolling(rcloneLiveOutput, rcloneAutoScrollEnabled, rcloneUserScrolledUp);
    }
    if (terminalOutput) {
        setupAutoScrolling(terminalOutput, terminalAutoScrollEnabled, terminalUserScrolledUp);
    }

    // Listen for file input changes to display file name
    if (rcloneConfFileInput && rcloneConfFileNameDisplay) {
        rcloneConfFileInput.addEventListener('change', (event) => {
            rcloneConfFileNameDisplay.textContent = event.target.files[0] ? event.target.files[0].name : 'No file chosen';
        });
    }
    if (saZipFileInput && saZipFileNameDisplay) {
        saZipFileInput.addEventListener('change', (event) => {
            saZipFileNameDisplay.textContent = event.target.files[0] ? event.target.files[0].name : 'No file chosen';
        });
    }

    // Rclone Form Events
    if (modeSelect) {
        modeSelect.addEventListener('change', () => {
            updateModeDescription();
            toggleRemoteField();
        });
    }
    if (transfersInput && transfersValueSpan) {
        transfersInput.addEventListener('input', () => {
            transfersValueSpan.textContent = transfersInput.value;
        });
    }
    if (checkersInput && checkersValueSpan) {
        checkersInput.addEventListener('input', () => {
            checkersValueSpan.textContent = checkersInput.value;
        });
    }
    if (startRcloneBtn) {
        startRcloneBtn.addEventListener('click', startRcloneTransfer);
    }
    if (stopRcloneBtn) {
        stopRcloneBtn.addEventListener('click', stopRcloneTransfer);
    }

    // Terminal Events
    if (executeTerminalBtn) {
        executeTerminalBtn.addEventListener('click', () => executeTerminalCommand());
    }
    if (stopTerminalBtn) {
        stopTerminalBtn.addEventListener('click', stopTerminalProcess);
    }
    if (terminalCommandInput) {
        terminalCommandInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                executeTerminalCommand();
            }
        });
    }

    if (confirmStopAndStartBtn) {
        confirmStopAndStartBtn.addEventListener('click', async () => {
            if (terminalConfirmModal) terminalConfirmModal.classList.add('hidden');
            await stopTerminalProcess();
            if (pendingTerminalCommand) {
                executeTerminalCommand(pendingTerminalCommand);
                pendingTerminalCommand = null;
            }
        });
    }

    if (cancelStopAndStartBtn) {
        cancelStopAndStartBtn.addEventListener('click', () => {
            if (terminalConfirmModal) terminalConfirmModal.classList.add('hidden');
            pendingTerminalCommand = null;
            hideTerminalSpinner();
            isTerminalProcessRunning = false;
            if (executeTerminalBtn) executeTerminalBtn.classList.remove('hidden');
            if (stopTerminalBtn) stopTerminalBtn.classList.add('hidden');
        });
    }

    // Notepad auto-save
    if (notepadContent) {
        notepadContent.addEventListener('input', saveNotepadContent);
    }

    // Close modal on Escape key press
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            if (terminalConfirmModal && !terminalConfirmModal.classList.contains('hidden')) {
                terminalConfirmModal.classList.add('hidden');
                pendingTerminalCommand = null;
                hideTerminalSpinner();
                isTerminalProcessRunning = false;
                if (executeTerminalBtn) executeTerminalBtn.classList.remove('hidden');
                if (stopTerminalBtn) stopTerminalBtn.classList.add('hidden');
            }
        }
    });

    // Event listener for Recent Commands tab to load content when clicked
    const recentCommandsNavButton = document.querySelector('.nav-button[onclick*="recent-commands"]');
    if (recentCommandsNavButton) {
        recentCommandsNavButton.addEventListener('click', loadRecentCommands);
    }
});
