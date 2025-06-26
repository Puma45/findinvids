const mysql = require('mysql2');

const pool = mysql.createPool({
    host: 'localhost',
    user: 'u515870946_root',
    password: '|0li37lj]t6T',
    database: 'u515870946_youtube_cache',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

function insertOrUpdateVideo(video) {
    return new Promise((resolve, reject) => {
        const sql = `
            INSERT INTO videos (video_id, title, thumbnail_url, duration_seconds, timestamp_count, age_restricted, views, last_checked)
            VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE
                title = VALUES(title),
                thumbnail_url = VALUES(thumbnail_url),
                duration_seconds = VALUES(duration_seconds),
                timestamp_count = VALUES(timestamp_count),
                age_restricted = VALUES(age_restricted),
                views = VALUES(views),
                last_checked = NOW()
        `;
        const values = [
            video.video_id,
            video.title,
            video.thumbnail_url,
            video.duration_seconds,
            video.timestamp_count,
            video.age_restricted,
            video.views
        ];

        pool.query(sql, values, (err, results) => {
            if (err) {
                console.error('❌ Erreur lors de l\'insertion ou mise à jour de la vidéo :', err);
                reject(err);
            } else {
                console.log('✅ Vidéo enregistrée dans la base de données');
                resolve(results);
            }
        });
    });
}

// Fonction pour récupérer une vidéo par ID
function getVideoById(videoId) {
    return new Promise((resolve, reject) => {
        const sql = 'SELECT * FROM videos WHERE video_id = ?';
        pool.query(sql, [videoId], (err, results) => {
            if (err) {
                reject(err);
            } else {
                resolve(results[0] || null);
            }
        });
    });
}

// Fonction pour récupérer toutes les vidéos
function getAllVideos() {
    return new Promise((resolve, reject) => {
        const sql = 'SELECT * FROM videos ORDER BY last_checked DESC';
        pool.query(sql, (err, results) => {
            if (err) {
                reject(err);
            } else {
                resolve(results);
            }
        });
    });
}

// Fonction pour supprimer une vidéo
function deleteVideo(videoId) {
    return new Promise((resolve, reject) => {
        const sql = 'DELETE FROM videos WHERE video_id = ?';
        pool.query(sql, [videoId], (err, results) => {
            if (err) {
                reject(err);
            } else {
                resolve(results);
            }
        });
    });
}

module.exports = { 
    pool, 
    insertOrUpdateVideo, 
    getVideoById, 
    getAllVideos, 
    deleteVideo 
};