class YouTubeTimestampNavigator {
    constructor() {
        this.apiKey = null;
        this.isMobile = window.innerWidth <= 768;
        
        // Initialize modules
        this.videoManager = null;
        this.timestampExtractor = null;
        this.uiManager = new UIManager();
        
        this.initializeModules();
        this.bindEventHandlers();
        this.loadSavedApiKey();
        this.detectMobile();
    }

    initializeModules() {
        // UI Manager is already initialized
        // Video Manager and Timestamp Extractor will be initialized when API key is loaded
    }

    bindEventHandlers() {
        // Override UI Manager event handlers
        this.uiManager.onLoadVideo = () => this.loadVideo();
        this.uiManager.onPasteAndLoad = () => this.pasteAndLoad();
        this.uiManager.onNavigateTimestamp = (direction) => this.navigateTimestamp(direction);
        this.uiManager.onParseManualTimestamps = () => this.parseManualTimestamps();
        this.uiManager.onTimestampClick = (index, seconds, event) => this.handleTimestampClick(index, seconds, event);
    }

    detectMobile() {
        // More precise mobile detection
        this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;
        
        // Listen for orientation changes
        window.addEventListener('resize', () => {
            this.isMobile = window.innerWidth <= 768;
        });
    }

    async loadSavedApiKey() {
        try {
            const response = await fetch('./api-key.txt');
            if (response.ok) {
                const apiKey = await response.text();
                const cleanKey = apiKey.trim();
                
                if (cleanKey && cleanKey.length > 10) {
                    this.apiKey = cleanKey;
                    
                    // Initialize modules that need API key
                    this.videoManager = new VideoManager(this.apiKey);
                    this.timestampExtractor = new TimestampExtractor(this.apiKey);
                    
                    // Set video elements
                    this.videoManager.setElements(this.uiManager.videoPlayer, this.uiManager.videoContainer);
                    
                    console.log('✅ API key loaded from file - all modules initialized');
                } else {
                    console.log('❌ Invalid API key in file');
                    this.initializeWithoutApiKey();
                }
            } else {
                console.log('📁 api-key.txt file not found - manual mode only');
                this.initializeWithoutApiKey();
            }
        } catch (error) {
            console.log('📁 api-key.txt file not accessible - manual mode only');
            this.initializeWithoutApiKey();
        }
    }

    initializeWithoutApiKey() {
        // Initialize modules without API key (limited functionality)
        this.videoManager = new VideoManager(null);
        this.timestampExtractor = new TimestampExtractor(null);
        this.videoManager.setElements(this.uiManager.videoPlayer, this.uiManager.videoContainer);
    }

    async pasteAndLoad() {
        const pasted = await this.uiManager.pasteAndLoad();
        if (pasted) {
            // Automatically load the video after paste
            setTimeout(() => {
                this.loadVideo();
            }, 500);
        }
    }

    async loadVideo() {
        const url = this.uiManager.getUrlInput();
        if (!url) return;

        if (!this.videoManager.isYouTubeUrl(url)) {
            this.uiManager.showMessage('⚠️ Invalid YouTube URL', 'error');
            return;
        }

        this.uiManager.setLoadButtonState(true);
        this.uiManager.showLoading(true);

        try {
            // Load video and get duration
            const { videoId, duration } = await this.videoManager.loadVideo(url);
            this.uiManager.showVideoContainer(true);
            
            // Set duration in timestamp extractor
            if (this.timestampExtractor) {
                this.timestampExtractor.setVideoDuration(duration);
            }

            // Start timestamp extraction
            await this.startTimestampExtraction(videoId);

        } catch (error) {
            console.error('Error loading video:', error);
            this.uiManager.showMessage('❌ Error loading video: ' + error.message, 'error');
        } finally {
            this.uiManager.setLoadButtonState(false);
            this.uiManager.showLoading(false);
        }
    }

    async startTimestampExtraction(videoId) {
        if (!this.timestampExtractor || !this.apiKey) {
            console.log('No API key - switching to manual mode');
            this.handleTimestamps([]);
            return;
        }

        try {
            const timestamps = await this.timestampExtractor.extractTimestampsFromAPI(videoId);
            this.handleTimestamps(timestamps, this.timestampExtractor.timestampComments, videoId);
        } catch (error) {
            console.error('API extraction error:', error);
            this.handleTimestamps([]);
        }
    }

   handleTimestamps(timestamps, comments = {}, videoId = null) {
    const currentVideoId = videoId || this.videoManager.getCurrentVideoId();

    if (timestamps.length === 0) {
        this.uiManager.setTimestamps([], {}, currentVideoId);
        this.uiManager.showMessage('No timestamps found in the comments for this video.', 'info');
    } else {
        this.uiManager.setTimestamps(timestamps, comments, currentVideoId);
        console.log(`🎉 ${timestamps.length} timestamps loaded successfully!`);
        // Collecter et sauvegarder les données de la vidéo en base
if (currentVideoId && timestamps.length > 0) {
    console.log('💾 Collecte des données vidéo pour insertion en base...');
    
    fetch('/api/video/collect', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            videoId: currentVideoId,
            timestamps: timestamps
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            console.log('✅ Données vidéo collectées et sauvegardées avec succès');
        } else {
            console.error('❌ Erreur lors de la collecte:', data.error);
        }
    })
    .catch(error => {
        console.error('❌ Erreur réseau lors de la collecte:', error);
    });
}
    }
}


    parseManualTimestamps() {
        const text = this.uiManager.getManualTimestampText();
        if (!text) return;

        const videoInfo = this.videoManager.getVideoInfo();
        const result = this.timestampExtractor.parseManualTimestamps(text, videoInfo.videoDuration);
        
        this.handleTimestamps(result.timestamps, result.comments, videoInfo.videoId);
        this.uiManager.showManualInput(false);
    }

    handleTimestampClick(index, seconds, event) {
        const videoInfo = this.videoManager.getVideoInfo();
        
        // Handle different click types
        if (event.forceYoutube || event.ctrlKey || event.metaKey || event.button === 2) {
            // Force open in YouTube
            this.openInYouTube(seconds);
        } else if (videoInfo.isVideoRestricted) {
            // Video is restricted - open in YouTube
            this.openInYouTube(seconds);
        } else {
            // Normal click - use embedded player
            this.jumpToTimestamp(index, seconds);
        }
    }

    jumpToTimestamp(index, seconds) {
        this.videoManager.jumpToTimestamp(seconds);
        this.uiManager.setCurrentIndex(index);
    }

    openInYouTube(seconds) {
        const result = this.videoManager.openTimestampInNewTab(seconds);
        
        if (result.success) {
            this.uiManager.showMessage(result.message, 'info');
        } else if (result.blocked) {
            this.uiManager.showPopupBlockedMessage(result);
        } else {
            this.uiManager.showMessage('❌ Error opening YouTube tab', 'error');
        }
    }

    navigateTimestamp(direction) {
        const nextTimestamp = this.uiManager.getTimestampByDirection(direction);
        if (nextTimestamp) {
            this.jumpToTimestamp(nextTimestamp.index, nextTimestamp.seconds);
        }
    }

    // Handle video restriction detection result
    handleVideoRestriction(status) {
        if (status === 'restricted') {
            this.uiManager.showMessage('⚠️ Restricted video - All timestamps will open in YouTube', 'warning');
        }
    }
}

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
    new YouTubeTimestampNavigator();
});