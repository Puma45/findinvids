// server.js (backend + static frontend)
const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const { insertOrUpdateVideo } = require('./db');

const app = express();
const PORT = 5000;

const CACHE_DIR = path.join(__dirname, 'cache');
const TEMP_DIR = path.join(__dirname, 'temp');
const PUBLIC_DIR = path.join(__dirname, 'public');

app.use(cors());
app.use(express.json());
app.use(express.static(PUBLIC_DIR));

fs.ensureDirSync(CACHE_DIR);
fs.ensureDirSync(TEMP_DIR);

// Charger la clé API YouTube
let YOUTUBE_API_KEY = null;
async function loadApiKey() {
    try {
        // Essayer d'abord dans le dossier public
        let apiKeyPath = path.join(PUBLIC_DIR, 'api-key.txt');
        
        if (await fs.pathExists(apiKeyPath)) {
            const apiKey = await fs.readFile(apiKeyPath, 'utf8');
            YOUTUBE_API_KEY = apiKey.trim();
            console.log('✅ YouTube API key loaded from public folder');
            return;
        }
        
        // Essayer ensuite dans le dossier racine
        apiKeyPath = path.join(__dirname, 'api-key.txt');
        if (await fs.pathExists(apiKeyPath)) {
            const apiKey = await fs.readFile(apiKeyPath, 'utf8');
            YOUTUBE_API_KEY = apiKey.trim();
            console.log('✅ YouTube API key loaded from root folder');
            return;
        }
        
        console.log('⚠️ api-key.txt not found in public or root folder - video data collection disabled');
    } catch (error) {
        console.log('⚠️ Could not load API key - video data collection disabled');
    }
}

// Fonction pour récupérer les données de la vidéo via YouTube API
async function getVideoDataFromYouTube(videoId) {
    if (!YOUTUBE_API_KEY) {
        console.log('⚠️ No API key - using default video data');
        return {
            title: 'Titre non disponible',
            duration: 0,
            views: 0,
            age_restricted: 0
        };
    }

    try {
        const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${videoId}&key=${YOUTUBE_API_KEY}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.items && data.items.length > 0) {
            const video = data.items[0];
            
            // Convertir la durée ISO 8601 en secondes
            const duration = parseDuration(video.contentDetails.duration);
            
            return {
                title: video.snippet.title,
                duration: duration,
                views: parseInt(video.statistics.viewCount) || 0,
                age_restricted: video.contentDetails.contentRating ? 1 : 0
            };
        } else {
            throw new Error('Video not found');
        }
    } catch (error) {
        console.error('❌ Erreur lors de la récupération des données YouTube:', error);
        return {
            title: 'Erreur de récupération',
            duration: 0,
            views: 0,
            age_restricted: 0
        };
    }
}

// Fonction pour convertir la durée ISO 8601 (PT1H2M10S) en secondes
function parseDuration(isoDuration) {
    const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    
    const hours = parseInt(match[1]) || 0;
    const minutes = parseInt(match[2]) || 0;
    const seconds = parseInt(match[3]) || 0;
    
    return hours * 3600 + minutes * 60 + seconds;
}

// === API route: Collect video data ===
app.post('/api/video/collect', express.json(), async (req, res) => {
    const { videoId, timestamps } = req.body;
    
    if (!videoId) {
        return res.status(400).json({ error: 'Video ID is required' });
    }
    
    try {
        console.log("🔍 Collecte des données vidéo via YouTube API :", videoId);
        const videoData = await getVideoDataFromYouTube(videoId);

        console.log("💾 Tentative d'enregistrement vidéo :", videoId);
        
        await insertOrUpdateVideo({
            video_id: videoId,
            title: videoData.title,
            thumbnail_url: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
            duration_seconds: videoData.duration,
            timestamp_count: timestamps ? timestamps.length : 0,
            age_restricted: videoData.age_restricted,
            views: videoData.views
        });
        
        console.log("✅ Vidéo enregistrée avec succès :", {
            id: videoId,
            title: videoData.title.substring(0, 50) + '...',
            duration: videoData.duration + 's',
            views: videoData.views,
            timestamps: timestamps ? timestamps.length : 0
        });
        
        res.json({ success: true, message: 'Video data collected and saved' });
        
    } catch (error) {
        console.error("❌ Erreur lors de la collecte/insertion :", error);
        res.status(500).json({ error: 'Data collection error', details: error.message });
    }
});

// === API route: Get thumbnail at a specific timestamp ===
app.get('/api/thumbnail/:videoId/:seconds', async (req, res) => {
    const { videoId, seconds } = req.params;
    const sec = parseInt(seconds);
    if (!videoId || isNaN(sec)) return res.status(400).send('Invalid input');

    const imgName = `${videoId}_${sec}.jpg`;
    const imgPath = path.join(CACHE_DIR, imgName);
    if (await fs.pathExists(imgPath)) return res.sendFile(imgPath);

    const videoPath = path.join(TEMP_DIR, `${videoId}_${sec}.mp4`);
    const startTime = Math.max(sec - 1, 0);
    const duration = 3;

    try {
        // Log avant téléchargement
        console.log("▶ yt-dlp lancé :", videoId, startTime, videoPath);

        // Étape 1 : Télécharger le clip
        await execPromise(
            `yt-dlp -f best --download-sections "*${startTime}-${startTime + duration}" -o "${videoPath}" https://www.youtube.com/watch?v=${videoId}`
        );

        // Étape 2 : Récupérer les vraies données de la vidéo via YouTube API
        console.log("🔍 Récupération des données vidéo via YouTube API :", videoId);
        const videoData = await getVideoDataFromYouTube(videoId);

        // Étape 3 : Insertion dans la base avec les vraies données
        console.log("💾 Tentative d'enregistrement vidéo :", videoId);
        
        try {
            await insertOrUpdateVideo({
                video_id: videoId,
                title: videoData.title,
                thumbnail_url: `/api/thumbnail/${videoId}/${sec}`,
                duration_seconds: videoData.duration,
                timestamp_count: 0, // Sera mis à jour plus tard si nécessaire
                age_restricted: videoData.age_restricted,
                views: videoData.views
            });
            console.log("✅ Vidéo enregistrée avec succès :", {
                id: videoId,
                title: videoData.title.substring(0, 50) + '...',
                duration: videoData.duration + 's',
                views: videoData.views
            });
        } catch (dbError) {
            console.error("❌ Erreur lors de l'insertion en base :", dbError);
            // On continue quand même pour générer la miniature
        }

        // Étape 4 : Générer la miniature avec ffmpeg
        await execPromise(
            `ffmpeg -ss ${sec - startTime} -i "${videoPath}" -frames:v 1 -q:v 2 -vf scale=160:-1 "${imgPath}"`
        );

        await fs.remove(videoPath);
        res.sendFile(imgPath);

    } catch (error) {
        console.error('Thumbnail error:', error);
        res.status(500).send('Could not generate thumbnail');
    }
});

// === Util: Promisified exec ===
function execPromise(command) {
    return new Promise((resolve, reject) => {
        exec(command, (err, stdout, stderr) => {
            if (err) reject(stderr || stdout);
            else resolve(stdout);
        });
    });
}

// === Start server ===
loadApiKey().then(() => {
    app.listen(PORT, () => {
        console.log(`✅ Server running on http://localhost:${PORT}`);
    });
});