class UIManager {
    constructor() {
        this.timestamps = [];
        this.currentIndex = -1;
        this.timestampComments = {};
        this.videoId = null;
        
        this.initializeElements();
        this.bindEvents();
    }

    initializeElements() {
        this.urlInput = document.getElementById('urlInput');
        this.loadBtn = document.getElementById('loadBtn');
        this.pasteLoadBtn = document.getElementById('pasteLoadBtn');
        this.videoContainer = document.getElementById('videoContainer');
        this.videoPlayer = document.getElementById('videoPlayer');
        this.prevBtn = document.getElementById('prevBtn');
        this.nextBtn = document.getElementById('nextBtn');
        this.timestampList = document.getElementById('timestampList');
        this.timestampListContainer = document.getElementById('timestampListContainer');
        this.loading = document.getElementById('loading');
        this.manualInput = document.getElementById('manualInput');
        this.timestampTextarea = document.getElementById('timestampTextarea');
        this.parseBtn = document.getElementById('parseBtn');
    }

    bindEvents() {
        // Events will be bound by the main class
        this.loadBtn.addEventListener('click', () => this.onLoadVideo());
        this.pasteLoadBtn.addEventListener('click', () => this.onPasteAndLoad());
        this.urlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.onLoadVideo();
        });
        this.prevBtn.addEventListener('click', () => this.onNavigateTimestamp(-1));
        this.nextBtn.addEventListener('click', () => this.onNavigateTimestamp(1));
        this.parseBtn.addEventListener('click', () => this.onParseManualTimestamps());
        
        // Keyboard shortcut Ctrl+V to paste and load
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'v' && !e.target.matches('input, textarea')) {
                e.preventDefault();
                this.onPasteAndLoad();
            }
        });
    }

    // Event handlers - these will be overridden by the main class
    onLoadVideo() {}
    onPasteAndLoad() {}
    onNavigateTimestamp(direction) {}
    onParseManualTimestamps() {}
    onTimestampClick(index, seconds, event) {}

    async pasteAndLoad() {
        try {
            this.pasteLoadBtn.disabled = true;
            this.pasteLoadBtn.innerHTML = '📋 Pasting...';
            
            // Check if Clipboard API is available
            if (!navigator.clipboard || !navigator.clipboard.readText) {
                this.showMessage('❌ Clipboard not accessible in this browser', 'error');
                this.fallbackPasteMethod();
                return false;
            }
            
            // Read from clipboard
            const clipboardText = await navigator.clipboard.readText();
            
            if (!clipboardText || clipboardText.trim() === '') {
                this.showMessage('📋 Clipboard is empty', 'warning');
                this.resetPasteButton();
                return false;
            }
            
            // Clear current field and paste new URL
            this.urlInput.value = '';
            await new Promise(resolve => setTimeout(resolve, 100));
            this.urlInput.value = clipboardText.trim();
            
            // Successful paste animation
            this.pasteLoadBtn.innerHTML = '✅ Pasted!';
            this.showMessage('📋 URL pasted from clipboard', 'success');
            
            this.resetPasteButton();
            return true;
            
        } catch (error) {
            console.error('Error during paste:', error);
            
            if (error.name === 'NotAllowedError') {
                this.showMessage('🔒 Clipboard access permission denied', 'error');
                this.fallbackPasteMethod();
            } else {
                this.showMessage('❌ Error during paste', 'error');
                this.resetPasteButton();
            }
            return false;
        }
    }

    fallbackPasteMethod() {
        // Alternative method: focus on field and suggest Ctrl+V
        this.urlInput.focus();
        this.urlInput.select();
        this.showMessage('💡 Use Ctrl+V to paste in the field', 'info');
        this.resetPasteButton();
    }

    resetPasteButton() {
        setTimeout(() => {
            this.pasteLoadBtn.disabled = false;
            this.pasteLoadBtn.innerHTML = '📋 Paste & Load';
        }, 1000);
    }

    showLoading(show = true) {
        if (show) {
            this.loading.classList.add('show');
        } else {
            this.loading.classList.remove('show');
        }
    }

    setLoadButtonState(disabled = false) {
        this.loadBtn.disabled = disabled;
    }

    showVideoContainer(show = true) {
        this.videoContainer.style.display = show ? 'block' : 'none';
    }

    getUrlInput() {
        return this.urlInput.value.trim();
    }

    setTimestamps(timestamps, comments, videoId) {
        this.timestamps = timestamps;
        this.timestampComments = comments;
        this.videoId = videoId;
        this.renderTimestamps();
        this.updateNavigationButtons();
    }

    renderTimestamps() {
        if (this.timestamps.length === 0) {
            this.timestampList.innerHTML = '<div class="no-timestamps">No timestamps found in comments</div>';
            return;
        }

        this.timestampList.innerHTML = this.timestamps.map((seconds, index) => {
            const time = this.formatTime(seconds);
            const comment = this.timestampComments[seconds] || '';
            
            return `
                <button class="timestamp-item" data-index="${index}" data-seconds="${seconds}">
                    <img class="timestamp-thumbnail" 
                         src="/api/thumbnail/${this.videoId}/${seconds}" 
                         alt="Thumbnail at ${time}"
                         onerror="this.src='https://img.youtube.com/vi/${this.videoId}/mqdefault.jpg';">
                    <div class="timestamp-content">
                        <div class="timestamp-time">${time}</div>
                        <div class="timestamp-comment">${this.escapeHtml(comment)}</div>
                    </div>
                </button>
            `;
        }).join('');

        // Add click events
        this.timestampList.querySelectorAll('.timestamp-item').forEach(item => {
            item.addEventListener('click', (event) => {
                const index = parseInt(item.dataset.index);
                const seconds = parseInt(item.dataset.seconds);
                this.onTimestampClick(index, seconds, event);
            });
            
            // Handle right click for YouTube opening
            item.addEventListener('contextmenu', (event) => {
                event.preventDefault();
                const seconds = parseInt(item.dataset.seconds);
                this.onTimestampClick(-1, seconds, { forceYoutube: true });
            });
        });
    }

    updateActiveTimestamp() {
        this.timestampList.querySelectorAll('.timestamp-item').forEach((item, index) => {
            item.classList.toggle('active', index === this.currentIndex);
        });
        
        // Scroll the active timestamp into view within the container
        if (this.currentIndex >= 0 && this.currentIndex < this.timestamps.length) {
            const activeItem = this.timestampList.querySelector('.timestamp-item.active');
            if (activeItem) {
                // Calculate position relative to the scrollable container
                const container = this.timestampListContainer;
                const itemTop = activeItem.offsetTop;
                const itemHeight = activeItem.offsetHeight;
                const containerHeight = container.clientHeight;
                const scrollTop = container.scrollTop;
                
                // Check if item is fully visible
                if (itemTop < scrollTop || itemTop + itemHeight > scrollTop + containerHeight) {
                    // Scroll to center the item
                    const scrollTo = itemTop - (containerHeight / 2) + (itemHeight / 2);
                    container.scrollTo({
                        top: Math.max(0, scrollTo),
                        behavior: 'smooth'
                    });
                }
            }
        }
    }

    setCurrentIndex(index) {
        this.currentIndex = index;
        this.updateActiveTimestamp();
        this.updateNavigationButtons();
    }

    updateNavigationButtons() {
        this.prevBtn.disabled = this.currentIndex <= 0 || this.timestamps.length === 0;
        this.nextBtn.disabled = this.currentIndex >= this.timestamps.length - 1 || this.timestamps.length === 0;
    }

    showMessage(message, type) {
        // Remove old messages
        const existingMessages = document.querySelectorAll('.status-message');
        existingMessages.forEach(msg => msg.remove());
        
        const statusDiv = document.createElement('div');
        statusDiv.className = `status-message ${type}`;
        statusDiv.textContent = message;
        
        document.body.appendChild(statusDiv);
        
        setTimeout(() => {
            if (statusDiv.parentNode) {
                statusDiv.parentNode.removeChild(statusDiv);
            }
        }, 3000);
    }

    showPopupBlockedMessage(result) {
        // Remove old messages
        const existingMessages = document.querySelectorAll('.status-message');
        existingMessages.forEach(msg => msg.remove());
        
        const messageDiv = document.createElement('div');
        messageDiv.className = 'status-message warning';
        messageDiv.innerHTML = `
            <div>${result.message}</div>
            <a href="${result.url}" target="_blank" style="color: #fff; text-decoration: underline; font-weight: bold;">
                Open ${result.time} in YouTube
            </a>
        `;
        
        document.body.appendChild(messageDiv);
        
        // Auto-remove after longer time since it contains a link
        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.parentNode.removeChild(messageDiv);
            }
        }, 8000);
    }

    showManualInput(show = true) {
        this.manualInput.style.display = show ? 'block' : 'none';
    }

    getManualTimestampText() {
        return this.timestampTextarea.value.trim();
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    formatTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        } else {
            return `${minutes}:${secs.toString().padStart(2, '0')}`;
        }
    }

    getCurrentTimestamp() {
        if (this.currentIndex >= 0 && this.currentIndex < this.timestamps.length) {
            return this.timestamps[this.currentIndex];
        }
        return null;
    }

    getTimestampByDirection(direction) {
        const newIndex = this.currentIndex + direction;
        if (newIndex >= 0 && newIndex < this.timestamps.length) {
            return { index: newIndex, seconds: this.timestamps[newIndex] };
        }
        return null;
    }
}