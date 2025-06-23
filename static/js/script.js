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
const servePathContainer = document.getElementById('serve-path-container'); // New reference
const serveProtocolPortContainer = document.getElementById('serve-protocol-port-container'); // New reference
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
const terminalHistoryBtn = document.getElementById('terminal-history-btn');
const terminalHistoryBox = document.getElementById('terminalHistoryBox'); // New reference for the history box
const terminalHistoryContent = document.getElementById('terminalHistoryContent');
const hideTerminalHistoryBtn = document.getElementById('hideTerminalHistoryBtn'); // New reference for hide button

const recentRcloneTransfersDiv = document.getElementById('recentRcloneTransfers');
const recentTerminalCommandsDiv = document.getElementById('recentTerminalCommands');

const notepadContent = document.getElementById('notepad-content');

// --- Global State Variables ---
let rclonePollingInterval = null;
let terminalPollingInterval = null;
let processStatePollingInterval = null;
let rcloneAutoScrollEnabled = true;
let terminalAutoScrollEnabled = true;
let rcloneUserScrolledUp = false;
let terminalUserScrolledUp = false;
let pendingTerminalCommand = null;
let terminalCommandHistory = []; // For client-side history display
let terminalHistoryVisible = false; // Track visibility of terminal history box

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
        if (states.rclone.running) {
            startRcloneBtn.classList.add('hidden');
            stopRcloneBtn.classList.remove('hidden');
            showRcloneSpinner("Command running...");
        } else {
            startRcloneBtn.classList.remove('hidden');
            stopRcloneBtn.classList.add('hidden');
            hideRcloneSpinner();
        }
        
        // Update Terminal button state
        if (states.terminal.running) {
            executeTerminalBtn.classList.add('hidden');
            stopTerminalBtn.classList.remove('hidden');
            showTerminalSpinner("Command running...");
            // Hide history box if a new command starts and it wasn't explicitly opened/filled
            if (terminalHistoryVisible && !terminalHistoryBox.dataset.manualOpen) {
                hideTerminalHistory();
            }
        } else {
            executeTerminalBtn.classList.remove('hidden');
            stopTerminalBtn.classList.add('hidden');
            hideTerminalSpinner();
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
function setupAutoScrolling(outputElement) {
    outputElement.addEventListener('scroll', () => {
        const threshold = 50; // pixels from bottom
        const isAtBottom = outputElement.scrollTop + outputElement.clientHeight >= outputElement.scrollHeight - threshold;
        
        if (outputElement === rcloneLiveOutput) {
            rcloneUserScrolledUp = !isAtBottom;
        } else if (outputElement === terminalOutput) {
            terminalUserScrolledUp = !isAtBottom;
        }
    });
}

function autoScroll(element) {
    if (element === rcloneLiveOutput && !rcloneUserScrolledUp) {
        element.scrollTop = element.scrollHeight;
    } else if (element === terminalOutput && !terminalUserScrolledUp) {
        element.scrollTop = element.scrollHeight;
    }
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
    // Hide terminal history box when switching sections
    if (terminalHistoryBox && sectionId !== 'web-terminal') {
        hideTerminalHistory();
    }
}

function showRcloneSpinner(message = "Transferring...") {
    if (rcloneSpinnerText) {
        rcloneSpinnerText.textContent = message;
    }
    if (rcloneSpinner) {
        rcloneSpinner.classList.remove('hidden');
    }
    document.getElementById('rclone-tab-spinner').classList.remove('hidden');
}

function hideRcloneSpinner() {
    if (rcloneSpinner) {
        rcloneSpinner.classList.add('hidden');
    }
    document.getElementById('rclone-tab-spinner').classList.add('hidden');
}

function showTerminalSpinner(message = "Executing command...") {
    if (terminalSpinnerText) {
        terminalSpinnerText.textContent = message;
    }
    if (terminalSpinner) {
        terminalSpinner.classList.remove('hidden');
    }
    document.getElementById('terminal-tab-spinner').classList.remove('hidden');
}

function hideTerminalSpinner() {
    if (terminalSpinner) {
        terminalSpinner.classList.add('hidden');
    }
    document.getElementById('terminal-tab-spinner').classList.add('hidden');
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
    if (servePathContainer) servePathContainer.classList.add('hidden'); // Hide new serve containers
    if (serveProtocolPortContainer) serveProtocolPortContainer.classList.add('hidden'); // Hide new serve containers

    if (sourceLabel) sourceLabel.textContent = 'Source Path'; // Reset label text
    if (sourceLabel) sourceLabel.classList.remove('hidden'); // Ensure label is visible by default

    // Reset required attributes
    if (sourceInput) sourceInput.removeAttribute('required');
    if (urlInput) urlInput.removeAttribute('required');
    if (destinationInput) destinationInput.removeAttribute('required');
    if (servePathInput) servePathInput.removeAttribute('required'); // Reset for serve path

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
        if (sourceInput) sourceInput.classList.add('hidden'); // Hide general source input
        if (sourceLabel) sourceLabel.classList.add('hidden'); // Hide general source label

        if (servePathContainer) servePathContainer.classList.remove('hidden'); // Show serve path container
        if (serveProtocolPortContainer) serveProtocolPortContainer.classList.remove('hidden'); // Show serve protocol/port container
        if (servePathInput) servePathInput.setAttribute('required', 'true'); // Set serve path as required

        if (destinationField) destinationField.classList.add('hidden');
    } else if (modesNoArgs.includes(selectedMode)) {
        if (sourceInput) sourceInput.classList.add('hidden');
        if (destinationField) destinationField.classList.add('hidden');
        if (sourceInput) sourceInput.removeAttribute('required');
        if (destinationInput) destinationInput.removeAttribute('required');
        if (sourceLabel) sourceLabel.classList.add('hidden'); // Hide label for no-args modes
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
    const mode = modeSelect.value;
    let source = '';
    const destination = destinationInput ? destinationInput.value.trim() : '';
    let serveProtocol = '';
    let servePort = '';

    // Handle source/URL/path-to-serve based on selected mode
    if (modesCopyUrl.includes(mode)) {
        source = urlInput ? urlInput.value.trim() : '';
        if (!source) {
            logMessage(rcloneMajorStepsOutput, "URL is required for copyurl mode.", 'error');
            return;
        }
    } else if (modesServe.includes(mode)) {
        source = servePathInput ? servePathInput.value.trim() : ''; // Corrected to use servePathInput
        serveProtocol = serveProtocolSelect ? serveProtocolSelect.value : '';
        servePort = servePortInput ? servePortInput.value.trim() : '8080';
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
        serve_path: source // This is correct, as 'source' now holds the path to serve
    };

    try {
        const response = await fetch('/execute-rclone', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        const result = await response.json();
        if (result.status === 'success') {
            logMessage(rcloneMajorStepsOutput, result.message, 'success');
            startRclonePolling();
            // saveRcloneTransferToHistory is now handled by backend
        } else {
            logMessage(rcloneMajorStepsOutput, `Error: ${result.message}`, 'error');
            resetRcloneButtons();
        }
    } catch (error) {
        logMessage(rcloneMajorStepsOutput, `Network or Rclone execution error: ${error.message}`, 'error');
        resetRcloneButtons();
    }
}

function resetRcloneButtons() {
    hideRcloneSpinner();
    if (startRcloneBtn) startRcloneBtn.classList.remove('hidden');
    if (stopRcloneBtn) stopRcloneBtn.classList.add('hidden');
}

async function stopRcloneTransfer() {
    logMessage(rcloneMajorStepsOutput, "Sending stop signal to Rclone process...", 'info');
    try {
        const response = await fetch('/stop-rclone-process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const result = await response.json();
        if (result.status === 'success') {
            logMessage(rcloneMajorStepsOutput, result.message, 'success');
            stopRclonePolling();
        } else {
            logMessage(rcloneMajorStepsOutput, `Failed to stop Rclone: ${result.message}`, 'error');
        }
    } catch (error) {
        logMessage(rcloneMajorStepsOutput, `Network error stopping Rclone: ${error.message}`, 'error');
    }
}

function startRclonePolling() {
    if (rclonePollingInterval) {
        clearInterval(rclonePollingInterval);
    }
    rclonePollingInterval = setInterval(getRcloneOutput, 1000);
}

function stopRclonePolling() {
    if (rclonePollingInterval) {
        clearInterval(rclonePollingInterval);
        rclonePollingInterval = null;
    }
}

async function getRcloneOutput() {
    try {
        const response = await fetch('/get-rclone-output');
        const result = await response.json();
        if (rcloneLiveOutput) {
            rcloneLiveOutput.textContent = result.output;
            autoScroll(rcloneLiveOutput);
        }
        
        if (!result.is_running) {
            logMessage(rcloneMajorStepsOutput, "Rclone command finished.", 'info');
            resetRcloneButtons();
            stopRclonePolling();
            loadRecentCommands(); // Refresh recent commands after Rclone task finishes
        }
    } catch (error) {
        console.error("Error fetching Rclone output:", error);
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
    autoScroll(element);
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
    if (executeTerminalBtn) executeTerminalBtn.classList.add('hidden');
    if (stopTerminalBtn) stopTerminalBtn.classList.remove('hidden');

    // Hide history box if a new command starts and it wasn't explicitly opened/filled
    if (terminalHistoryVisible && !terminalHistoryBox.dataset.manualOpen) {
        hideTerminalHistory();
    }

    try {
        const response = await fetch('/execute_terminal_command', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: cmdToExecute })
        });
        const result = await response.json();

        if (result.status === 'success') {
            logMessage(terminalOutput, result.message, 'success');
            // saveTerminalCommandToHistory is now handled by backend
            startTerminalPolling();
            // Keep command in field: terminalCommandInput.value = ''; // REMOVED
            addCommandToLocalHistory(cmdToExecute); // Add to local history
        } else if (result.status === 'warning' && result.message.includes("already running")) {
            // Show confirmation modal
            if (terminalConfirmMessage) {
                terminalConfirmMessage.innerHTML = `A command is currently running: <code class="bg-input-bg-color p-1 rounded-md text-sm">${escapeHtml(result.running_command)}</code>. Do you want to stop it and start a new one?`;
            }
            if (terminalConfirmModal) terminalConfirmModal.classList.remove('hidden');
            pendingTerminalCommand = cmdToExecute;
        } else {
            logMessage(terminalOutput, `Error: ${result.message}`, 'error');
            resetTerminalButtons();
        }
    } catch (error) {
        logMessage(terminalOutput, `Network error: ${error.message}`, 'error');
        resetTerminalButtons();
    }
}

function resetTerminalButtons() {
    hideTerminalSpinner();
    if (executeTerminalBtn) executeTerminalBtn.classList.remove('hidden');
    if (stopTerminalBtn) stopTerminalBtn.classList.add('hidden');
}

async function getTerminalOutput() {
    try {
        const response = await fetch('/get_terminal_output');
        const result = await response.json();
        if (terminalOutput) {
            terminalOutput.textContent = result.output;
            autoScroll(terminalOutput);
        }
        
        if (!result.is_running) {
            logMessage(terminalOutput, "Terminal command finished.", 'info');
            resetTerminalButtons();
            stopTerminalPolling();
            loadRecentCommands(); // Refresh recent commands after Terminal task finishes
        }
    } catch (error) {
        console.error("Error fetching terminal output:", error);
    }
}

async function stopTerminalProcess() {
    logMessage(terminalOutput, "Sending stop signal to terminal process...", 'info');
    try {
        const response = await fetch('/stop_terminal_process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const result = await response.json();
        if (result.status === 'success') {
            logMessage(terminalOutput, result.message, 'success');
            resetTerminalButtons();
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

// --- Recent Commands History (Database Integrated) ---
// saveTerminalCommandToHistory and saveRcloneTransferToHistory are now handled by backend

async function loadRecentCommands() {
    try {
        const response = await fetch('/get-recent-commands');
        const data = await response.json();
        const terminalCommands = data.terminal_commands;
        const rcloneTransfers = data.rclone_transfers;

        // Populate Recent Commands tab
        if (recentTerminalCommandsDiv) {
            recentTerminalCommandsDiv.innerHTML = '';
            if (terminalCommands.length === 0) {
                recentTerminalCommandsDiv.innerHTML = '<p class="text-text-color">No recent terminal commands.</p>';
            } else {
                terminalCommands.slice(0, 5).forEach((item, index) => { // Show latest 5
                    const div = document.createElement('div');
                    div.className = 'bg-input-bg-color p-3 rounded-md border border-border-color flex justify-between items-center';
                    div.innerHTML = `
                        <div>
                            <code class="text-primary-color text-sm">${escapeHtml(item.command)}</code>
                            <p class="text-xs text-gray-400 mt-1">Status: <span class="${item.status === 'Success' ? 'text-success-color' : (item.status === 'Failed' ? 'text-error-color' : (item.status === 'Running' ? 'text-info-color' : 'text-warning-color'))}">${item.status}</span> | ${new Date(item.timestamp).toLocaleString()}</p>
                        </div>
                        <div class="flex gap-2">
                            <button class="btn-secondary btn-fill-command px-3 py-1 text-xs" data-command="${escapeHtml(item.command)}">
                                <i class="fas fa-fill"></i> Fill
                            </button>
                            <button class="btn-danger btn-delete-command px-3 py-1 text-xs" data-id="${item.id}">
                                <i class="fas fa-trash"></i> Delete
                            </button>
                        </div>
                    `;
                    recentTerminalCommandsDiv.appendChild(div);
                });
                if (terminalCommands.length > 5) {
                    const moreButton = document.createElement('button');
                    moreButton.className = 'btn-secondary mt-3 w-full';
                    moreButton.textContent = 'Show More Terminal Commands';
                    moreButton.onclick = () => displayAllCommands(terminalCommands, 'terminal');
                    recentTerminalCommandsDiv.appendChild(moreButton);
                }
            }
        }

        if (recentRcloneTransfersDiv) {
            recentRcloneTransfersDiv.innerHTML = '';
            if (rcloneTransfers.length === 0) {
                recentRcloneTransfersDiv.innerHTML = '<p class="text-text-color">No recent Rclone transfers.</p>';
            } else {
                rcloneTransfers.slice(0, 5).forEach((item, index) => { // Show latest 5
                    const statusClass = item.status === 'Success' ? 'text-success-color' : (item.status === 'Failed' ? 'text-error-color' : (item.status === 'Running' ? 'text-info-color' : 'text-warning-color'));
                    const div = document.createElement('div');
                    div.className = 'bg-input-bg-color p-3 rounded-md border border-border-color space-y-1';
                    div.innerHTML = `
                        <p><span class="font-semibold text-accent-color">${item.mode}:</span> <code class="text-primary-color text-sm">${escapeHtml(item.source)}</code> ${item.destination ? `<i class="fas fa-arrow-right mx-1 text-gray-500"></i> <code class="text-primary-color text-sm">${escapeHtml(item.destination)}</code>` : ''}</p>
                        ${item.protocol ? `<p class="text-xs text-gray-400">Protocol: ${escapeHtml(item.protocol)}</p>` : ''}
                        ${item.flags ? `<p class="text-xs text-gray-400">Flags: ${escapeHtml(item.flags)}</p>` : ''}
                        <p class="text-xs text-gray-400">Status: <span class="${statusClass}">${item.status}</span> | ${new Date(item.timestamp).toLocaleString()}</p>
                        <div class="flex flex-wrap gap-2 mt-2">
                            <button class="btn-secondary btn-fill-rclone px-3 py-1 text-xs" 
                                data-mode="${escapeHtml(item.mode)}" 
                                data-source="${escapeHtml(item.source)}" 
                                data-destination="${escapeHtml(item.destination || '')}"
                                data-protocol="${escapeHtml(item.protocol || '')}"
                                data-flags="${escapeHtml(item.flags || '')}">
                                <i class="fas fa-fill"></i> Fill
                            </button>
                            <button class="btn-danger btn-delete-rclone px-3 py-1 text-xs" data-id="${item.id}">
                                <i class="fas fa-trash"></i> Delete
                            </button>
                        </div>
                    `;
                    recentRcloneTransfersDiv.appendChild(div);
                });
                if (rcloneTransfers.length > 5) {
                    const moreButton = document.createElement('button');
                    moreButton.className = 'btn-secondary mt-3 w-full';
                    moreButton.textContent = 'Show More Rclone Transfers';
                    moreButton.onclick = () => displayAllCommands(rcloneTransfers, 'rclone');
                    recentRcloneTransfersDiv.appendChild(moreButton);
                }
            }
        }

        // Populate Terminal History Box
        if (terminalHistoryBox && terminalHistoryContent) {
            terminalHistoryContent.innerHTML = ''; // Clear previous content
            if (terminalCommands.length === 0) {
                terminalHistoryContent.innerHTML = '<p class="text-text-color">No recent terminal commands.</p>';
            } else {
                terminalCommands.slice(0, 5).forEach((item) => { // Show latest 5
                    const div = document.createElement('div');
                    div.className = 'bg-input-bg-color p-3 rounded-md border border-border-color flex justify-between items-center';
                    div.innerHTML = `
                        <div>
                            <code class="text-primary-color text-sm">${escapeHtml(item.command)}</code>
                            <p class="text-xs text-gray-400 mt-1">Status: <span class="${item.status === 'Success' ? 'text-success-color' : (item.status === 'Failed' ? 'text-error-color' : (item.status === 'Running' ? 'text-info-color' : 'text-warning-color'))}">${item.status}</span> | ${new Date(item.timestamp).toLocaleString()}</p>
                        </div>
                        <div class="flex gap-2">
                            <button class="btn-secondary btn-fill-command px-3 py-1 text-xs" data-command="${escapeHtml(item.command)}">
                                <i class="fas fa-fill"></i> Fill
                            </button>
                            <button class="btn-danger btn-delete-command px-3 py-1 text-xs" data-id="${item.id}">
                                <i class="fas fa-trash"></i> Delete
                            </button>
                        </div>
                    `;
                    terminalHistoryContent.appendChild(div);
                });
            }
        }

        // Add event listeners for fill and delete buttons (for both recent commands tab and terminal history box)
        document.querySelectorAll('.btn-fill-command').forEach(button => {
            button.onclick = (e) => {
                fillTerminalCommand(e.target.dataset.command || e.target.closest('button').dataset.command);
                hideTerminalHistory(); // Hide history after filling
            };
        });
        document.querySelectorAll('.btn-delete-command').forEach(button => {
            button.onclick = (e) => deleteTerminalCommand(e.target.dataset.id || e.target.closest('button').dataset.id);
        });
        document.querySelectorAll('.btn-fill-rclone').forEach(button => {
            button.onclick = (e) => fillRcloneTransfer(e.target.dataset);
        });
        document.querySelectorAll('.btn-delete-rclone').forEach(button => {
            button.onclick = (e) => deleteRcloneTransfer(e.target.dataset.id || e.target.closest('button').dataset.id);
        });

    } catch (error) {
        console.error("Error loading recent commands:", error);
        if (recentTerminalCommandsDiv) recentTerminalCommandsDiv.innerHTML = '<p class="text-error-color">Error loading recent terminal commands.</p>';
        if (recentRcloneTransfersDiv) recentRcloneTransfersDiv.innerHTML = '<p class="text-error-color">Error loading recent Rclone transfers.</p>';
        if (terminalHistoryContent) terminalHistoryContent.innerHTML = '<p class="text-error-color">Error loading terminal history.</p>';
    }
}

function displayAllCommands(items, type) {
    const container = type === 'terminal' ? recentTerminalCommandsDiv : recentRcloneTransfersDiv;
    container.innerHTML = ''; // Clear current view

    items.forEach(item => {
        if (type === 'terminal') {
            const div = document.createElement('div');
            div.className = 'bg-input-bg-color p-3 rounded-md border border-border-color flex justify-between items-center';
            div.innerHTML = `
                <div>
                    <code class="text-primary-color text-sm">${escapeHtml(item.command)}</code>
                    <p class="text-xs text-gray-400 mt-1">Status: <span class="${item.status === 'Success' ? 'text-success-color' : (item.status === 'Failed' ? 'text-error-color' : (item.status === 'Running' ? 'text-info-color' : 'text-warning-color'))}">${item.status}</span> | ${new Date(item.timestamp).toLocaleString()}</p>
                </div>
                <div class="flex gap-2">
                    <button class="btn-secondary btn-fill-command px-3 py-1 text-xs" data-command="${escapeHtml(item.command)}">
                        <i class="fas fa-fill"></i> Fill
                    </button>
                    <button class="btn-danger btn-delete-command px-3 py-1 text-xs" data-id="${item.id}">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
            `;
            container.appendChild(div);
        } else { // rclone
            const statusClass = item.status === 'Success' ? 'text-success-color' : (item.status === 'Failed' ? 'text-error-color' : (item.status === 'Running' ? 'text-info-color' : 'text-warning-color'));
            const div = document.createElement('div');
            div.className = 'bg-input-bg-color p-3 rounded-md border border-border-color space-y-1';
            div.innerHTML = `
                <p><span class="font-semibold text-accent-color">${item.mode}:</span> <code class="text-primary-color text-sm">${escapeHtml(item.source)}</code> ${item.destination ? `<i class="fas fa-arrow-right mx-1 text-gray-500"></i> <code class="text-primary-color text-sm">${escapeHtml(item.destination)}</code>` : ''}</p>
                ${item.protocol ? `<p class="text-xs text-gray-400">Protocol: ${escapeHtml(item.protocol)}</p>` : ''}
                ${item.flags ? `<p class="text-xs text-gray-400">Flags: ${escapeHtml(item.flags)}</p>` : ''}
                <p class="text-xs text-gray-400">Status: <span class="${statusClass}">${item.status}</span> | ${new Date(item.timestamp).toLocaleString()}</p>
                <div class="flex flex-wrap gap-2 mt-2">
                    <button class="btn-secondary btn-fill-rclone px-3 py-1 text-xs" 
                        data-mode="${escapeHtml(item.mode)}" 
                        data-source="${escapeHtml(item.source)}" 
                        data-destination="${escapeHtml(item.destination || '')}"
                        data-protocol="${escapeHtml(item.protocol || '')}"
                        data-flags="${escapeHtml(item.flags || '')}">
                        <i class="fas fa-fill"></i> Fill
                    </button>
                    <button class="btn-danger btn-delete-rclone px-3 py-1 text-xs" data-id="${item.id}">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
            `;
            container.appendChild(div);
        }
    });

    // Add a "Show Less" button
    const showLessButton = document.createElement('button');
    showLessButton.className = 'btn-secondary mt-3 w-full';
    showLessButton.textContent = `Show Less ${type === 'terminal' ? 'Terminal Commands' : 'Rclone Transfers'}`;
    showLessButton.onclick = loadRecentCommands; // Reloads the initial 5 items
    container.appendChild(showLessButton);

    // Re-add event listeners for newly created buttons
    document.querySelectorAll('.btn-fill-command').forEach(button => {
        button.onclick = (e) => fillTerminalCommand(e.target.dataset.command || e.target.closest('button').dataset.command);
    });
    document.querySelectorAll('.btn-delete-command').forEach(button => {
        button.onclick = (e) => deleteTerminalCommand(e.target.dataset.id || e.target.closest('button').dataset.id);
    });
    document.querySelectorAll('.btn-fill-rclone').forEach(button => {
        button.onclick = (e) => fillRcloneTransfer(e.target.dataset);
    });
    document.querySelectorAll('.btn-delete-rclone').forEach(button => {
        button.onclick = (e) => deleteRcloneTransfer(e.target.dataset.id || e.target.closest('button').dataset.id);
    });
}


async function deleteTerminalCommand(id) {
    if (confirm("Are you sure you want to delete this terminal command?")) {
        try {
            const response = await fetch(`/delete-terminal-command/${id}`, { method: 'POST' });
            const result = await response.json();
            if (result.status === 'success') {
                logMessage(majorStepsOutput, result.message, 'success');
                loadRecentCommands(); // Reload history
            } else {
                logMessage(majorStepsOutput, `Failed to delete command: ${result.message}`, 'error');
            }
        } catch (error) {
            logMessage(majorStepsOutput, `Network error deleting command: ${error.message}`, 'error');
        }
    }
}

async function deleteRcloneTransfer(id) {
    if (confirm("Are you sure you want to delete this Rclone transfer record?")) {
        try {
            const response = await fetch(`/delete-rclone-transfer/${id}`, { method: 'POST' });
            const result = await response.json();
            if (result.status === 'success') {
                logMessage(majorStepsOutput, result.message, 'success');
                loadRecentCommands(); // Reload history
            } else {
                logMessage(majorStepsOutput, `Failed to delete transfer: ${result.message}`, 'error');
            }
        } catch (error) {
            logMessage(majorStepsOutput, `Network error deleting transfer: ${error.message}`, 'error');
        }
    }
}

function fillTerminalCommand(command) {
    if (terminalCommandInput) {
        terminalCommandInput.value = command;
        showSection('web-terminal'); // Switch to terminal tab
        terminalHistoryBox.dataset.manualOpen = 'true'; // Mark as manually opened
    }
}

function fillRcloneTransfer(data) {
    if (modeSelect) modeSelect.value = data.mode;
    
    // Handle source based on mode
    if (data.mode === 'serve') {
        if (servePathInput) servePathInput.value = data.source;
        if (serveProtocolSelect) serveProtocolSelect.value = data.protocol;
        // Assuming servePort is not part of data.flags, it might need to be handled if it was saved.
        // For now, it will retain its default or last manually set value.
    } else if (data.mode === 'copyurl') {
        if (urlInput) urlInput.value = data.source;
    } else {
        if (sourceInput) sourceInput.value = data.source;
    }

    if (destinationInput) destinationInput.value = data.destination;
    if (additionalFlagsInput) additionalFlagsInput.value = data.flags;
    
    updateModeDescription(); // Re-evaluate UI based on new mode
    toggleRemoteField(); // Re-evaluate UI based on new mode
    showSection('rclone-transfer'); // Switch to rclone transfer tab
}

async function clearAllRecentCommands() {
    if (confirm("Are you sure you want to clear all recent commands and transfers history? This cannot be undone.")) {
        try {
            const response = await fetch('/clear-all-history', { method: 'POST' });
            const result = await response.json();
            if (result.status === 'success') {
                logMessage(majorStepsOutput, result.message, 'success');
                loadRecentCommands(); // Reload history
            } else {
                logMessage(majorStepsOutput, `Failed to clear history: ${result.message}`, 'error');
            }
        } catch (error) {
            logMessage(majorStepsOutput, `Network error clearing history: ${error.message}`, 'error');
        }
    }
}

// --- Terminal Command History (Client-side for quick access) ---
function addCommandToLocalHistory(command) {
    terminalCommandHistory.unshift(command);
    if (terminalCommandHistory.length > 10) {
        terminalCommandHistory.pop();
    }
}

function showTerminalHistory() {
    if (terminalHistoryBox) {
        terminalHistoryBox.classList.remove('hidden');
        terminalHistoryVisible = true;
        terminalHistoryBox.dataset.manualOpen = 'true'; // Mark as manually opened
        loadRecentCommands(); // Load content from backend
    }
}

function hideTerminalHistory() {
    if (terminalHistoryBox) {
        terminalHistoryBox.classList.add('hidden');
        terminalHistoryVisible = false;
        terminalHistoryBox.removeAttribute('data-manual-open'); // Remove manual open flag
    }
}

// --- Notepad Logic (Database Integrated) ---
async function saveNotepadContent() {
    if (notepadContent) {
        try {
            await fetch('/save-notepad-content', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: notepadContent.value })
            });
            // logMessage(majorStepsOutput, "Notepad content saved.", 'info'); // Too frequent, remove
        } catch (error) {
            console.error("Error saving notepad content:", error);
            // logMessage(majorStepsOutput, "Failed to save notepad content.", 'error'); // Too frequent, remove
        }
    }
}

async function loadNotepadContent() {
    if (notepadContent) {
        try {
            const response = await fetch('/get-notepad-content');
            const result = await response.json();
            if (result.status === 'success') {
                if (!result.content) {
                    // Default content if empty
                    notepadContent.value = `
- Commonly used rclone flags with their function:
  --bwlimit <RATE>        Limit bandwidth usage to RATE.
  --checksum              Skip based on checksum & size, not modtime.
  --dry-run               Do a trial run with no permanent changes.
  --fast-list             Use fast listing for cloud remotes.
  --ignore-existing       Skip files that exist on destination.
  --max-age <DURATION>    Only transfer files older than this duration.
  --min-size <SIZE>       Only transfer files bigger than this size.
  --progress              Show progress during transfer.
  --stats <DURATION>      Print transfer statistics every duration.
  --v                     Verbose logging.
  --vv                    Very verbose logging.
  --exclude <PATTERN>     Exclude files matching pattern.
  --include <PATTERN>     Include files matching pattern.

- Commonly used Linux Commands:
  ls -la                  List all files and directories in long format.
  pwd                     Print working directory.
  cd <DIR>                Change directory.
  mkdir <DIR>             Create a new directory.
  rm <FILE>               Remove a file.
  rm -rf <DIR>            Recursively remove a directory and its contents.
  cp <SOURCE> <DEST>      Copy files or directories.
  mv <SOURCE> <DEST>      Move/rename files or directories.
  cat <FILE>              Concatenate and display file content.
  grep <PATTERN> <FILE>   Search for patterns in files.
  df -h                   Display free disk space in human readable format.
  du -sh <DIR>            Estimate file space usage of a directory.
  top                     Display Linux processes.
  htop                    Interactive process viewer.
  ping <HOST>             Send ICMP ECHO_REQUEST to network hosts.
  curl <URL>              Transfer data from or to a server.
  wget <URL>              Non-interactive network downloader.
  chmod <PERMS> <FILE>    Change file permissions.
  chown <USER>:<GROUP> <FILE> Change file ownership.
  ps aux                  Display running processes.
  kill <PID>              Terminate a process.
  history                 Show command history.
  echo <TEXT>             Display a line of text.
  man <COMMAND>           Display the manual page for a command.
                    `;
                } else {
                    notepadContent.value = result.content;
                }
            }
        } catch (error) {
            console.error("Error loading notepad content:", error);
            notepadContent.value = "Error loading notepad content.";
        }
    }
}

// Utility to escape HTML for display
function escapeHtml(text) {
    const map = {
        '&': '&',
        '<': '<',
        '>': '>',
        '"': '"',
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
        setupAutoScrolling(rcloneLiveOutput);
    }
    if (terminalOutput) {
        setupAutoScrolling(terminalOutput);
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
    if (terminalHistoryBtn) {
        terminalHistoryBtn.addEventListener('click', showTerminalHistory); // Changed to showTerminalHistory
    }
    if (hideTerminalHistoryBtn) { // New hide button for terminal history
        hideTerminalHistoryBtn.addEventListener('click', hideTerminalHistory);
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
            resetTerminalButtons();
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
                resetTerminalButtons();
            }
            if (terminalHistoryBox && !terminalHistoryBox.classList.contains('hidden')) { // Changed from modal to box
                hideTerminalHistory();
            }
        }
    });

    // Event listener for Recent Commands tab to load content when clicked
    const recentCommandsNavButton = document.querySelector('.nav-button[onclick*="recent-commands"]');
    if (recentCommandsNavButton) {
        recentCommandsNavButton.addEventListener('click', loadRecentCommands);
    }
});
