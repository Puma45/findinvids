class VideoManager {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.videoId = null;
        this.originalUrl = null;
        this.videoDuration = null;
        this.isVideoRestricted = false;
        this.youtubeTab = null;
        this.videoPlayer = null;
        this.videoContainer = null;
    }

    setElements(videoPlayer, videoContainer) {
        this.videoPlayer = videoPlayer;
        this.videoContainer = videoContainer;
    }

    isYouTubeUrl(url) {
        const youtubeRegex = /^https?:\/\/(www\.)?(youtube\.com\/(watch\?v=|embed\/|v\/)|youtu\.be\/)/i;
        return youtubeRegex.test(url.trim());
    }

    extractVideoId(url) {
        const regex = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/;
        const match = url.match(regex);
        return match ? match[1] : null;
    }

    async loadVideo(url) {
        const videoId = this.extractVideoId(url);
        if (!videoId) {
            throw new Error('Invalid YouTube URL');
        }

        // Reset previous video state
        this.isVideoRestricted = false;
        this.youtubeTab = null;
        this.videoId = videoId;
        this.originalUrl = url;
        this.videoDuration = null;
        
        // Load video
        this.loadYouTubeVideo(videoId);
        this.videoContainer.style.display = 'block';

        // Get video duration
        await this.getVideoDuration(videoId);
        
        return { videoId, duration: this.videoDuration };
    }

    loadYouTubeVideo(videoId) {
        const embedUrl = `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`;
        this.videoPlayer.src = embedUrl;
        
        // Detect if video is restricted after loading
        setTimeout(() => {
            this.checkVideoRestriction();
        }, 3000);
    }

    checkVideoRestriction() {
        setTimeout(() => {
            const iframe = this.videoPlayer;
            
            const isRestricted = (
                iframe.offsetHeight === 0 || 
                iframe.offsetWidth === 0 ||
                !iframe.src ||
                iframe.src.includes('restricted')
            );
            
            if (isRestricted) {
                this.isVideoRestricted = true;
                console.log('🔒 Video marked as restricted - all clicks will open YouTube');
                return 'restricted';
            } else {
                this.isVideoRestricted = false;
                console.log('✅ Video appears to be embeddable - clicks will use embedded player');
                return 'embeddable';
            }
        }, 1500);
    }

    async getVideoDuration(videoId) {
        if (!this.apiKey) {
            console.log('No API key - cannot get video duration');
            return null;
        }

        try {
            const url = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${videoId}&key=${this.apiKey}`;
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`API Error: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.items && data.items.length > 0) {
                const duration = data.items[0].contentDetails.duration;
                this.videoDuration = this.parseDuration(duration);
                console.log(`📹 Video duration: ${this.formatTime(this.videoDuration)}`);
                return this.videoDuration;
            }
        } catch (error) {
            console.error('Error getting video duration:', error);
            this.videoDuration = null;
            return null;
        }
    }

    parseDuration(duration) {
        const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
        if (!match) return null;
        
        const hours = parseInt(match[1]) || 0;
        const minutes = parseInt(match[2]) || 0;
        const seconds = parseInt(match[3]) || 0;
        
        return hours * 3600 + minutes * 60 + seconds;
    }

    jumpToTimestamp(seconds) {
        console.log(`🎯 Jumping to ${this.formatTime(seconds)} in embedded player`);
        
        const newSrc = `https://www.youtube.com/embed/${this.videoId}?start=${seconds}&autoplay=1&rel=0`;
        this.videoPlayer.src = newSrc;
        
        this.scrollToPlayer();
    }

    scrollToPlayer() {
        this.videoContainer.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'start' 
        });
    }

    openTimestampInNewTab(seconds) {
        const timestampUrl = `${this.originalUrl}&t=${seconds}s`;
        console.log(`🚀 Opening ${this.formatTime(seconds)} in YouTube tab`);
        
        try {
            if (this.youtubeTab && !this.youtubeTab.closed) {
                this.youtubeTab.location.href = timestampUrl;
                this.youtubeTab.focus();
                return { success: true, message: `Switching to ${this.formatTime(seconds)} in existing YouTube tab` };
            }
        } catch(error) {
            this.youtubeTab = null;
        }
        
        try {
            this.youtubeTab = window.open(timestampUrl, '_blank');
            if (!this.youtubeTab || this.youtubeTab.closed || typeof this.youtubeTab.closed === 'undefined') {
                return this.handlePopupBlocked(timestampUrl, seconds);
            } else {
                return { success: true, message: `Opening ${this.formatTime(seconds)} in new YouTube tab` };
            }
        } catch(error) {
            return this.handlePopupBlocked(timestampUrl, seconds);
        }
    }

    handlePopupBlocked(timestampUrl, seconds) {
        this.youtubeTab = null;
        
        console.log(`🚫 Popup blocked for ${this.formatTime(seconds)} - showing manual link`);
        
        return {
            success: false,
            blocked: true,
            message: `🚫 Popup blocked! Click here to open ${this.formatTime(seconds)} in YouTube:`,
            url: timestampUrl,
            time: this.formatTime(seconds)
        };
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

    getVideoInfo() {
        return {
            videoId: this.videoId,
            originalUrl: this.originalUrl,
            videoDuration: this.videoDuration,
            isVideoRestricted: this.isVideoRestricted
        };
    }

    // ✅ Ajout pour permettre à ui-manager.js d’accéder à videoId
    getCurrentVideoId() {
        return this.videoId;
    }
}
