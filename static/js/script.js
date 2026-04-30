// --- Theme Switcher ---
document.addEventListener('DOMContentLoaded', () => {
    // Theme dropdown
    const themeBtn = document.getElementById('themeChangerBtn');
    const themeDropdown = document.getElementById('themeDropdown');
    
    if (themeBtn && themeDropdown) {
        themeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            themeDropdown.classList.toggle('hidden');
        });
        
        document.addEventListener('click', (e) => {
            if (!themeDropdown.contains(e.target) && !themeBtn.contains(e.target)) {
                themeDropdown.classList.add('hidden');
            }
        });
        
        themeDropdown.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const theme = e.target.dataset.theme;
                document.documentElement.className = theme;
                localStorage.setItem('theme', theme);
                themeDropdown.classList.add('hidden');
            });
        });
    }
});

// --- Toast Notifications ---
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type} flex items-center gap-2`;
    toast.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        <span class="flex-1">${message}</span>
        <button onclick="this.parentElement.remove()" class="hover:opacity-75">&times;</button>
    `;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// --- Helper to add flag to input ---
function addFlag(flag) {
    const input = document.getElementById('additional_flags');
    if (!input) return;
    
    const current = input.value.trim();
    if (!current.includes(flag)) {
        input.value = current ? `${current} ${flag}` : flag;
    }
}

// --- Clear Output Functions ---
async function clearRcloneOutput() {
    if (!confirm('Clear Rclone output?')) return;
    const output = document.getElementById('rclone-output');
    if (output) output.innerHTML = '<p class="text-gray-400 text-sm italic">Output cleared</p>';
    await fetch('/save-form-state', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({field_name: 'rclone_output', field_value: ''})
    });
}

async function clearTerminalOutput() {
    if (!confirm('Clear Terminal output?')) return;
    const output = document.getElementById('terminal-output');
    if (output) output.innerHTML = '<p class="text-gray-400 text-sm italic">Output cleared</p>';
    await fetch('/save-form-state', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({field_name: 'terminal_output', field_value: ''})
    });
}

// --- HTMX Events ---
document.body.addEventListener('htmx:afterRequest', (e) => {
    // Show toast on successful form submissions
    if (e.detail.successful) {
        const target = e.detail.target;
        if (target && target.id === 'rclone-output') {
            showToast('Rclone transfer started', 'success');
        }
        if (target && target.id === 'terminal-output') {
            showToast('Terminal command executed', 'success');
        }
    }
});

// --- SSE Status ---
function updateSSEStatus(connected) {
    const status = document.getElementById('sse-status');
    if (!status) return;
    status.textContent = connected ? 'Connected' : 'Disconnected';
    status.className = `sse-status ${connected ? 'sse-status-connected' : 'sse-status-disconnected'}`;
}
