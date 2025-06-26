class TimestampExtractor {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.videoDuration = null;
        this.timestampComments = {};
    }

    setVideoDuration(duration) {
        this.videoDuration = duration;
    }

    async extractTimestampsFromAPI(videoId) {
        const timestampData = new Map();
        let nextPageToken = '';
        let totalComments = 0;
        const maxComments = 500;

       

        try {
            do {
                const url = `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&key=${this.apiKey}&maxResults=50${nextPageToken ? '&pageToken=' + nextPageToken : ''}`;
                
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`API Error: ${response.status}`);
                }

                const data = await response.json();
                
                data.items?.forEach(item => {
                    const rawCommentText = item.snippet.topLevelComment.snippet.textDisplay;
                    const authorName = item.snippet.topLevelComment.snippet.authorDisplayName;
                    
                    // Decode HTML entities first
                    const commentText = this.decodeHtmlEntities(rawCommentText);
                    
                    let foundTimestamps = 0;
                    
                    // Check if comment contains any URL-like patterns
                    const hasUrl = /youtube\.com\/watch|youtu\.be|href=/i.test(commentText);
                    const hasTimestamp = /\d{1,2}:\d{2}/g.test(commentText);
                    
                    if (hasUrl || hasTimestamp) {
                        console.log(`🔍 Analyzing comment by ${authorName}:`);
                        console.log(`   Raw: "${rawCommentText.substring(0, 100)}..."`);
                        console.log(`   Decoded: "${commentText.substring(0, 100)}..."`);
                        console.log(`   Contains URL: ${hasUrl}, Contains timestamps: ${hasTimestamp}`);
                    }
                    
                    // Method 1: Extract timestamps from HTML links
                    foundTimestamps += this.extractFromHtmlLinks(commentText, timestampData);
                    
                    // Method 2: Extract from direct URL patterns (fallback)
                    foundTimestamps += this.extractFromDirectUrls(commentText, timestampData);
                    
                    // Method 3: Look for text timestamp patterns (as final fallback)
                    foundTimestamps += this.extractFromTextPatterns(commentText, timestampData);
                    
                    if (foundTimestamps > 0) {
                        console.log(`📊 Total: ${foundTimestamps} timestamps found in this comment`);
                    }
                });

                totalComments += data.items?.length || 0;
                nextPageToken = data.nextPageToken;
                
                if (!nextPageToken || totalComments >= maxComments) {
                    break;
                }
                
                await new Promise(resolve => setTimeout(resolve, 100));
                
            } while (nextPageToken);

        } catch (error) {
            console.error('Error during extraction:', error);
            throw error;
        }

        // Sort and deduplicate timestamps
        const deduplicated = this.processTimestamps(timestampData);

        console.log(`🎉 Enhanced HTML extraction completed: ${deduplicated.length} timestamps found from ${totalComments} comments`);
        console.log(`📋 All timestamps: ${deduplicated.map(t => this.formatTime(t)).join(', ')}`);
        
        return deduplicated;
    }

    extractFromHtmlLinks(commentText, timestampData) {
        const hrefRegex = /href="([^"]*youtube\.com\/watch\?[^"]*&t=(\d+)[^"]*)"/gi;
        let foundCount = 0;
        let hrefMatch;
        
        while ((hrefMatch = hrefRegex.exec(commentText)) !== null) {
            const fullUrl = hrefMatch[1];
            const totalSeconds = parseInt(hrefMatch[2]);
            
            console.log(`🔗 Found href link: "${fullUrl}" -> ${totalSeconds}s (${this.formatTime(totalSeconds)})`);
            
            if (this.isValidTimestamp(totalSeconds)) {
                // Extract text content between <a> tags
                const linkTextRegex = new RegExp(`<a href="${hrefMatch[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>([^<]+)</a>`, 'i');
                const linkTextMatch = commentText.match(linkTextRegex);
                const linkText = linkTextMatch ? linkTextMatch[1] : this.formatTime(totalSeconds);
                
                let comment = commentText.replace(/<a[^>]*>.*?<\/a>/gi, '').trim();
                comment = this.cleanCommentText(comment) || `Link to ${linkText}`;
                
                timestampData.set(totalSeconds, comment + ' (from HTML link)');
                this.timestampComments[totalSeconds] = comment + ' (from HTML link)';
                foundCount++;
                console.log(`✅ Stored HTML link timestamp: ${this.formatTime(totalSeconds)} - "${linkText}"`);
            } else {
                console.log(`⚠️ Skipped HTML link timestamp ${this.formatTime(totalSeconds)} - beyond video duration`);
            }
        }
        
        return foundCount;
    }

    extractFromDirectUrls(commentText, timestampData) {
        const urlRegex = /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=[a-zA-Z0-9_-]+(?:&[^&\s]*)*&t=(\d+)s?(?:&[^&\s]*)*|(?:https?:\/\/)?youtu\.be\/[a-zA-Z0-9_-]+\?t=(\d+)s?/gi;
        let foundCount = 0;
        let urlMatch;
        
        while ((urlMatch = urlRegex.exec(commentText)) !== null) {
            const totalSeconds = parseInt(urlMatch[1] || urlMatch[2]);
            
            if (!timestampData.has(totalSeconds)) { // Only if not already found from href
                console.log(`🔗 Found direct URL: "${urlMatch[0]}" -> ${totalSeconds}s (${this.formatTime(totalSeconds)})`);
                
                if (this.isValidTimestamp(totalSeconds)) {
                    let comment = commentText.replace(/(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?[^\s]+/gi, '').trim();
                    comment = this.cleanCommentText(comment) || `URL timestamp ${this.formatTime(totalSeconds)}`;
                    
                    timestampData.set(totalSeconds, comment + ' (from direct URL)');
                    this.timestampComments[totalSeconds] = comment + ' (from direct URL)';
                    foundCount++;
                    console.log(`✅ Stored direct URL timestamp: ${this.formatTime(totalSeconds)}`);
                } else {
                    console.log(`⚠️ Skipped direct URL timestamp ${this.formatTime(totalSeconds)} - beyond video duration`);
                }
            }
        }
        
        return foundCount;
    }

    extractFromTextPatterns(commentText, timestampData) {
        // Regex ultra-permissive pour capturer TOUT ce qui ressemble à un timestamp
        const ultraPermissiveRegex = /(\d{1,3}):(\d{1,2})(?::(\d{1,2}))?/g;
        let foundCount = 0;
        const candidateTimestamps = [];
        let textMatch;
        
        
        while ((textMatch = ultraPermissiveRegex.exec(commentText)) !== null) {
            // Parse the full match to determine the correct format
            const fullMatch = textMatch[0];
            const parts = fullMatch.split(':');
            
            let parsedHours = 0;
            let parsedMinutes = 0;
            let parsedSeconds = 0;
            
            if (parts.length === 3) {
                // Format H:MM:SS or HH:MM:SS
                parsedHours = parseInt(parts[0]);
                parsedMinutes = parseInt(parts[1]);
                parsedSeconds = parseInt(parts[2]);
            } else if (parts.length === 2) {
                // Format MM:SS
                parsedMinutes = parseInt(parts[0]);
                parsedSeconds = parseInt(parts[1]);
            }
            
            candidateTimestamps.push({
                match: fullMatch,
                hours: parsedHours,
                minutes: parsedMinutes,
                seconds: parsedSeconds,
                index: textMatch.index,
                context: this.getTimestampContext(commentText, textMatch.index, fullMatch)
            });
            

        }
        
        // Maintenant, filtrage intelligent de chaque candidat
        candidateTimestamps.forEach(candidate => {
            const validation = this.validateTimestampCandidate(candidate, commentText);
            
            if (validation.isValid) {
                const totalSeconds = validation.totalSeconds;
                
                if (!timestampData.has(totalSeconds)) { // Only if not already found from URLs
                    const comment = this.extractTimestampComment(commentText, candidate.match, candidate.index);
                    timestampData.set(totalSeconds, comment);
                    this.timestampComments[totalSeconds] = comment;
                    foundCount++;
                    
                    console.log(`✅ Valid timestamp: ${candidate.match} → ${this.formatTime(totalSeconds)} (${validation.reason})`);
                } else {
                    console.log(`🔄 Duplicate timestamp: ${candidate.match} → ${this.formatTime(totalSeconds)}`);
                }
            } else {
                console.log(`❌ Rejected timestamp: ${candidate.match} (${validation.reason})`);
            }
        });
        
        return foundCount;
    }

    getTimestampContext(text, index, match) {
        const before = text.substring(Math.max(0, index - 10), index);
        const after = text.substring(index + match.length, index + match.length + 10);
        return { before, after };
    }

    validateTimestampCandidate(candidate, fullText) {
        const { minutes, seconds, hours, match, context } = candidate;
        
        // Test 1: Basic format validation
        if (seconds >= 60) {
            return { isValid: false, reason: `Invalid seconds: ${seconds} >= 60` };
        }
        
        if (minutes >= 60 && hours === 0) {
            return { isValid: false, reason: `Invalid minutes without hours: ${minutes} >= 60` };
        }
        
        if (hours >= 100) {
            return { isValid: false, reason: `Unrealistic hours: ${hours}` };
        }
        
        // Calculate total seconds - now with correct parsing
        let totalSeconds;
        let detectedFormat;
        
        if (hours > 0) {
            // Format H:MM:SS or HH:MM:SS
            totalSeconds = hours * 3600 + minutes * 60 + seconds;
            detectedFormat = 'H:MM:SS';
        } else {
            // Format MM:SS
            totalSeconds = minutes * 60 + seconds;
            detectedFormat = 'MM:SS';
        }
        
        // Test 2: Reasonable duration (not negative, not more than 24 hours)
        if (totalSeconds <= 0 || totalSeconds >= 86400) {
            return { isValid: false, reason: `Duration out of range: ${totalSeconds}s (${this.formatTime(totalSeconds)})` };
        }
        
        // Test 3: Video duration check (if available)
        if (this.videoDuration && totalSeconds > this.videoDuration) {
            return { isValid: false, reason: `Beyond video duration: ${this.formatTime(totalSeconds)} > ${this.formatTime(this.videoDuration)}` };
        }
        
        // Test 4: Context analysis - check if it's part of a URL or date
        const surroundingText = context.before + match + context.after;
        if (this.isPartOfUrl(surroundingText, match)) {
            return { isValid: false, reason: `Part of URL: "${surroundingText}"` };
        }
        
        if (this.isPartOfDate(surroundingText, match)) {
            return { isValid: false, reason: `Part of date: "${surroundingText}"` };
        }
        
        // Test 5: Pattern analysis - check if it looks like a real timestamp
        if (this.isLikelyFalsePositive(fullText, match, candidate.index)) {
            return { isValid: false, reason: `Pattern analysis: likely false positive` };
        }
        
        // All tests passed!
        return { 
            isValid: true, 
            totalSeconds: totalSeconds,
            reason: `Valid ${detectedFormat} → ${this.formatTime(totalSeconds)}` 
        };
    }

    isPartOfUrl(text, match) {
        // Check if timestamp is part of a URL pattern
        const urlPatterns = [
            /https?:\/\/[^\s]*/, // HTTP URLs
            /www\.[^\s]*/, // www URLs
            /youtube\.com[^\s]*/, // YouTube URLs
            /t=\d+/ // URL timestamp parameter
        ];
        
        return urlPatterns.some(pattern => pattern.test(text));
    }

    isPartOfDate(text, match) {
        // Check if it's part of a date (like 12:30 PM, 2023:12:30, etc.)
        const datePatterns = [
            /\d{4}[-\/]\d{1,2}[-\/]\d{1,2}/, // Date formats
            /\d{1,2}[-\/]\d{1,2}[-\/]\d{4}/, // Date formats
            /(am|pm|AM|PM)/, // Time with AM/PM
            /\d{1,2}:\d{2}\s*(am|pm|AM|PM)/ // 12:30 PM format
        ];
        
        return datePatterns.some(pattern => pattern.test(text));
    }

    isLikelyFalsePositive(fullText, match, index) {
        // Additional heuristics to detect false positives
        
        // Check if it's isolated (good) or part of a larger number sequence (bad)
        const before = fullText.charAt(index - 1);
        const after = fullText.charAt(index + match.length);
        
        // If surrounded by digits, likely part of a larger number
        if (/\d/.test(before) || /\d/.test(after)) {
            return true;
        }
        
        // Check for common false positive contexts
        const context = fullText.substring(Math.max(0, index - 20), index + match.length + 20);
        const falsePositivePatterns = [
            /price.*\d+:\d+/, // Price contexts
            /cost.*\d+:\d+/, // Cost contexts
            /ratio.*\d+:\d+/, // Ratio contexts
            /score.*\d+:\d+/, // Score contexts
            /\d+:\d+.*resolution/, // Resolution specs
            /resolution.*\d+:\d+/ // Resolution specs
        ];
        
        return falsePositivePatterns.some(pattern => pattern.test(context.toLowerCase()));
    }

    isValidTimestamp(totalSeconds) {
        return totalSeconds > 0 && 
               totalSeconds < 86400 && 
               (!this.videoDuration || totalSeconds <= this.videoDuration);
    }

    processTimestamps(timestampData) {
        const sortedTimestamps = Array.from(timestampData.keys()).sort((a, b) => a - b);
        
        // Minimal deduplication - only very close timestamps (within 3 seconds)
        const deduplicated = [];
        for (let i = 0; i < sortedTimestamps.length; i++) {
            const currentTimestamp = sortedTimestamps[i];
            if (i === 0 || currentTimestamp - sortedTimestamps[i-1] >= 3) {
                deduplicated.push(currentTimestamp);
            }
        }
        
        return deduplicated;
    }

    extractTimestampComment(text, timestampStr, timestampIndex) {
        // Smart comment extraction that handles multiple timestamps
        let comment = '';
        
        // Method 1: Look for text around this specific timestamp
        const beforeText = text.substring(Math.max(0, timestampIndex - 80), timestampIndex).trim();
        const afterText = text.substring(timestampIndex + timestampStr.length, timestampIndex + timestampStr.length + 80).trim();
        
        // Check if this is a list of timestamps (multiple timestamps close together)
        const nearbyTimestamps = text.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/g);
        
        if (nearbyTimestamps && nearbyTimestamps.length > 3) {
            // This looks like a timestamp list - try to find a title or description
            
            // Look for text before the first timestamp
            const firstTimestampMatch = text.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
            if (firstTimestampMatch) {
                const beforeFirstTimestamp = text.substring(0, firstTimestampMatch.index).trim();
                if (beforeFirstTimestamp.length > 3) {
                    comment = beforeFirstTimestamp;
                }
            }
            
            // If no good text before, look for text after the last timestamp
            if (!comment) {
                const allMatches = Array.from(text.matchAll(/(\d{1,2}):(\d{2})(?::(\d{2}))?/g));
                const lastTimestampMatch = allMatches[allMatches.length - 1];
                if (lastTimestampMatch) {
                    const afterLastTimestamp = text.substring(lastTimestampMatch.index + lastTimestampMatch[0].length).trim();
                    if (afterLastTimestamp.length > 3) {
                        comment = afterLastTimestamp;
                    }
                }
            }
            
            // If still no good comment, use a generic description
            if (!comment) {
                comment = `Timestamp from list of ${nearbyTimestamps.length} timestamps`;
            }
        } else {
            // Single or few timestamps - use surrounding text
            let surroundingText = (beforeText + ' ' + afterText).trim();
            
            // Remove other timestamps from the surrounding text
            surroundingText = surroundingText.replace(/(\d{1,2}):(\d{2})(?::(\d{2}))?/g, ' ').trim();
            
            if (surroundingText.length > 5) {
                comment = surroundingText;
            } else {
                // Use the beginning of the comment if surrounding text is not useful
                const fullText = text.substring(0, 150).trim();
                comment = fullText.replace(/(\d{1,2}):(\d{2})(?::(\d{2}))?/g, ' ').trim();
            }
        }
        
        // Clean up the comment
        comment = this.decodeHtmlEntities(comment);
        comment = this.cleanCommentText(comment);
        comment = comment.replace(/^\W+|\W+$/g, ''); // Remove leading/trailing punctuation
        comment = comment.replace(/\s+/g, ' ').trim(); // Clean multiple spaces
        comment = comment.substring(0, 150); // Limit length
        
        return comment || 'Timestamp';
    }

    cleanCommentText(text) {
        // Remove URLs from the text
        let cleaned = text.replace(/https?:\/\/[^\s]+/g, '');
        cleaned = cleaned.replace(/www\.[^\s]+/g, '');
        cleaned = cleaned.replace(/youtube\.com[^\s]*/g, '');
        cleaned = cleaned.replace(/youtu\.be[^\s]*/g, '');
        
        // Remove common YouTube-specific patterns
        cleaned = cleaned.replace(/watch\?v=[^\s]*/g, '');
        cleaned = cleaned.replace(/&t=\d+s?/g, '');
        
        // Remove HTML tags
        cleaned = cleaned.replace(/<[^>]*>/g, '');
        
        // Clean up extra characters and spaces
        cleaned = cleaned.replace(/[<>]/g, '');
        cleaned = cleaned.replace(/\s+/g, ' ');
        cleaned = cleaned.trim();
        
        return cleaned;
    }

    decodeHtmlEntities(text) {
        // Create a temporary div element to decode HTML entities
        const div = document.createElement('div');
        div.innerHTML = text;
        let decoded = div.textContent || div.innerText || '';
        
        // Additional cleanup for common issues
        decoded = decoded.replace(/&amp;/g, '&');
        decoded = decoded.replace(/&lt;/g, '<');
        decoded = decoded.replace(/&gt;/g, '>');
        decoded = decoded.replace(/&quot;/g, '"');
        decoded = decoded.replace(/&#39;/g, "'");
        decoded = decoded.replace(/&#x27;/g, "'");
        decoded = decoded.replace(/&nbsp;/g, ' ');
        
        // Clean up multiple spaces
        decoded = decoded.replace(/\s+/g, ' ').trim();
        
        return decoded;
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

    parseManualTimestamps(text, videoDuration) {
        const timestampRegex = /(\d{1,2}):(\d{2})(?::(\d{2}))?/g;
        const timestamps = new Set();
        const comments = {};
        
        const lines = text.split('\n');
        lines.forEach(line => {
            let match;
            timestampRegex.lastIndex = 0; // Reset regex
            
            while ((match = timestampRegex.exec(line)) !== null) {
                const minutes = parseInt(match[1]);
                const seconds = parseInt(match[2]);
                const hours = match[3] ? parseInt(match[3]) : 0;
                
                const totalSeconds = hours * 3600 + minutes * 60 + seconds;
                
                if (totalSeconds > 0) {
                    // Filter out timestamps beyond video duration if we have it
                    if (videoDuration && totalSeconds > videoDuration) {
                        console.log(`⚠️ Skipping manual timestamp ${match[1]}:${match[2]}${match[3] ? ':' + match[3] : ''} (${totalSeconds}s) - beyond video duration (${videoDuration}s)`);
                        continue;
                    }
                    
                    timestamps.add(totalSeconds);
                    // Store manual comment - decode HTML entities
                    const comment = this.extractTimestampComment(line, match[0], match.index);
                    comments[totalSeconds] = comment || 'Manual timestamp';
                }
            }
        });
        
const sortedTimestamps = Array.from(timestamps).sort((a, b) => a - b);

const deduplicated = [];
for (let i = 0; i < sortedTimestamps.length; i++) {
    if (i === 0 || sortedTimestamps[i] - sortedTimestamps[i - 1] >= 5) {
        deduplicated.push(sortedTimestamps[i]);
    }
}

const result = deduplicated.map(seconds => ({
    timestamp: this.formatTime(seconds),
    seconds,
    comment: comments[seconds] || this.timestampComments[seconds] || 'Manual timestamp'
}));

console.log(`📝 Manual extraction completed: ${result.length} timestamps`);
console.log(`📋 All timestamps: ${result.map(t => t.timestamp).join(', ')}`);

return result;
}
}


window.TimestampExtractor = TimestampExtractor;
