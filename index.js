const axios = require('axios');
const qs = require('qs');
const fs = require('fs');
const { google } = require('googleapis');
const OAuth2 = google.auth.OAuth2;
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const { createCanvas, loadImage } = require('canvas');
const { subMonths, format } = require('date-fns');
require('dotenv').config()

const streameur = process.env.streameur;
const TWITCH_ID = process.env.TWITCH_ID;
const TWITCH_SECRET = process.env.TWITCH_SECRET;
const YOUTUBE_ID = process.env.YOUTUBE_ID;
const YOUTUBE_SECRET = process.env.YOUTUBE_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const REFRESH_TOKEN = process.env.REFRESH_TOKEN;

const oauth2Client = new OAuth2(
  YOUTUBE_ID,
  YOUTUBE_SECRET,
  REDIRECT_URI
);


function getVideoDuration(filePath) {
    return new Promise((resolve, reject) => {
        ffmpeg.ffprobe(filePath, (err, metadata) => {
            if (err) {
                reject(err);
            } else {
                const duration = metadata.format.duration;
                resolve(duration);
            }
        });
    });
}
/*
const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.force-ssl'],
});
console.log('Authorize this app by visiting this url:', authUrl);

oauth2Client.getToken('4/0ATx3LY4utxM4EBZrrO5xHywr23VaRjuDWKA5VzNAXW3a6_EdpKgzwrP_o5NM7Hkw133h8Q', (err, tokens) => {
    if (err) return console.error('Error retrieving access token', err);
    console.log('Refresh token:', tokens.refresh_token);
});
*/
oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

const youtube = google.youtube({
  version: 'v3',
  auth: oauth2Client,
});

const canvasWidth = 1280;
const canvasHeight = 720;

const lineWidth = 15;

const borderRadius = 25;

const videoData = [];

function removeChevrons(text) {
    return text.replace(/<|>/g, '');
}

function cleanText(text) {
    const regex = /[\p{Emoji}\p{Punctuation}]/gu;
  

    const cleanText = text.replace(regex, "");

    const index = cleanText.indexOf('|')
    if(index !== -1){
        return cleanText.slice(0, index)
    }else{
        return cleanText
    }
}

async function addTextToVideo(videoData, index) {
    return new Promise((resolve, reject) => {
        const { path: videoPath, text } = videoData;
        const cleanedText = cleanText(text);

        const outputPath = path.resolve(__dirname, `output_${index}_${Date.now()}.mp4`);

        console.log(`Processing video: ${videoPath} -> ${outputPath}`);

        ffmpeg(videoPath)
            .videoFilter([
                'scale=2560:1440',
                {
                    filter: 'drawtext',
                    options: {
                        fontfile: 'fonts/Montserrat-Bold.ttf',
                        text: cleanedText,
                        fontsize: 72,
                        fontcolor: 'white',
                        x: '(w-text_w)/2',
                        y: '(text_h+10)',
                        bordercolor: 'black',
                        borderw: 2
                    }
                }
            ])
            .outputOptions([
                '-c:a copy',
                '-c:v libx264',
                '-crf 18',
                '-preset veryfast'
            ])
            .output(outputPath)
            .on('end', () => {
                console.log(`Text added to ${videoPath}`);
                resolve(outputPath);
            })
            .on('error', (err) => {
                console.error(`Error adding text to video ${videoPath}:`, err);
                reject(err);
            })
            .run();
    });
}

async function createFinalVideo(videoData) {
    try {
        const processedVideos = await Promise.all(videoData.map((video, index) => addTextToVideo(video, index)));
        console.log('All videos processed:', processedVideos);

        const fileList = 'fileList.txt';
        fs.writeFileSync(fileList, processedVideos.map(video => `file '${video}'`).join('\n'));

        const finalOutputPath = path.resolve(__dirname, `final.mp4`);

        ffmpeg()
            .input(fileList)
            .inputOptions(['-f concat', '-safe 0'])
            .outputOptions('-c copy')
            .output(finalOutputPath)
            .on('end', () => {
                console.log('Final video created:', finalOutputPath);
                processedVideos.forEach(video => {
                    fs.unlink(video, err => {
                        if (err) console.error('Error deleting file:', err);
                    });
                });
                fs.unlink(fileList, err => {
                    if (err) console.error('Error deleting file list:', err);
                });
            })
            .on('error', (err) => {
                console.error('Error creating final video:', err.message);
            })
            .run();
    } catch (err) {
        console.error('Error processing videos:', err.message);
    }
}

function oneMonthAgo() {
    let currentDate = new Date();
    let dateOneMonthAgo = subMonths(currentDate, 1);
    let formattedDate = format(dateOneMonthAgo, "yyyy-MM-dd'T'00:00:00XXX");
    return formattedDate;
}

async function getToken() {
    const options = {
        method: 'POST',
        url: 'https://id.twitch.tv/oauth2/token',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        data: qs.stringify({
            client_id: TWITCH_ID,
            client_secret: TWITCH_SECRET,
            grant_type: 'client_credentials'
        })
    };

    const response = await axios.request(options);
    return response.data.access_token;
}

function convertSecondsToMinutes(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    const formattedSeconds = remainingSeconds < 10 ? `0${remainingSeconds}` : remainingSeconds;

    return `${minutes}:${formattedSeconds}`;
}

async function construireTexte(truc) {
    let texteFormaté = `https://twitch.tv/${streameur}\n\n`;
  
    await truc.forEach(async (item, index) => {
        const text = await removeChevrons(item.text) 
        console.log(text)
      texteFormaté += `${item.start} - ${text}`;
      if (index < truc.length - 1) {
        texteFormaté += "\n";
      }
    });
  
    return texteFormaté;
  }

async function uploadVideo(name) {
    const filePath = 'final.mp4'
    const thumbnailPath = 'output.png';
    const fileSize = fs.statSync(filePath).size;
    const minutesClips = []
    clipStart.forEach(element => {
        const minutes = convertSecondsToMinutes(element.duration)
        minutesClips.push({ text: element.text, start: minutes })
    });
    const a = await construireTexte(minutesClips)
    console.log(a)
    
    try {
      const res = await youtube.videos.insert({
        part: 'snippet,status',
        requestBody: {
          snippet: {
            title: `${name} | Best Of ${streameur}`,
            description: `${a}`
          },
          status: {
            privacyStatus: 'unlisted', // 'private', 'public'
          },
        },
        media: {
          body: fs.createReadStream(filePath),
        },
      }, {
        onUploadProgress: evt => {
          const progress = (evt.bytesRead / fileSize) * 100;
          console.log(`${Math.round(progress)}% completed`);
        },
      });
  
      const videoId = res.data.id;
      console.log(`Vidéo téléchargée avec succès: https://youtube.com/watch?v=${videoId}`);
  
      await youtube.thumbnails.set({
        videoId: videoId,
        media: {
          body: fs.createReadStream(thumbnailPath),
        },
      });
  
      console.log('Miniature téléchargée avec succès');
    } catch (err) {
      console.error('Erreur lors de l\'upload:', err);
    }
  }

function supprimerFichier(filePath) {
    fs.unlink(filePath, (err) => {
        if (err) {
            console.error(`Erreur lors de la suppression du fichier ${filePath}:`, err);
            return;
        }
        console.log(`Fichier supprimé: ${filePath}`);
    });
}

function supprimerDossier(dirPath) {
    fs.rmdir(dirPath, { recursive: true }, (err) => {
        if (err) {
            console.error(`Erreur lors de la suppression du dossier ${dirPath}:`, err);
            return;
        }
        console.log(`Dossier supprimé: ${dirPath}`);
    });
}

async function downloadClip(clip) {
    const index = clip.thumbnail_url.indexOf('-preview');
    const clipUrl = clip.thumbnail_url.slice(0, index) + '.mp4';

    try {
        const response = await axios.get(clipUrl, {
            responseType: 'arraybuffer'
        });

        if (response.headers['content-type'] === 'binary/octet-stream') {
            const directory = 'clips';
            if (!fs.existsSync(directory)) {
                fs.mkdirSync(directory, { recursive: true });
            }

            const filePath = path.resolve(directory, clip.path);
            fs.writeFileSync(filePath, response.data);
            console.log(`Clip downloaded successfully: ${clipUrl}`);
            return filePath;
        } else {
            console.log(`Failed to download clip from thumb: ${clip.thumbnail_url}`);
            return null;
        }
    } catch (error) {
        console.error('Error downloading clip:', error.message);
        return null;
    }
}

async function downloadThumbnail(theurl, outputPath) {
    const index = theurl.indexOf('-preview')
    const url = theurl.slice(0, index) + '-preview.jpg'
    try {
      const response = await axios({
        url,
        responseType: 'stream',
      });
      const directory = 'thumbnails';

      if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, { recursive: true });
    }
  
      const writer = fs.createWriteStream(outputPath);
  
      response.data.pipe(writer);
  
      return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });
    } catch (error) {
      console.error('Erreur lors de la requête:', error);
      throw error;
    }
}


const createCompositeImage = async () => {
    const canvas = createCanvas(canvasWidth, canvasHeight);
    const ctx = canvas.getContext('2d');
  
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  
    const image1 = await loadImage('thumbnails/0.jpg');
    const image2 = await loadImage('thumbnails/1.jpg');
    const image3 = await loadImage('thumbnails/2.jpg');
    const image4 = await loadImage('thumbnails/3.jpg');
    const centerImage = await loadImage('images/twitch.png');
  
  const cornerWidth = (canvasWidth - lineWidth) / 2;
  const cornerHeight = (canvasHeight - lineWidth) / 2;

  const drawImageWithSpecificRoundedCorners = (ctx, image, x, y, width, height, excludeCorner) => {
    ctx.save();
    ctx.beginPath();
    if (excludeCorner !== 'topLeft') {
      ctx.moveTo(x + borderRadius, y);
    } else {
      ctx.moveTo(x, y);
    }
    if (excludeCorner !== 'topRight') {
      ctx.arcTo(x + width, y, x + width, y + borderRadius, borderRadius);
    } else {
      ctx.lineTo(x + width, y);
    }
    if (excludeCorner !== 'bottomRight') {
      ctx.arcTo(x + width, y + height, x + width - borderRadius, y + height, borderRadius);
    } else {
      ctx.lineTo(x + width, y + height);
    }
    if (excludeCorner !== 'bottomLeft') {
      ctx.arcTo(x, y + height, x, y + height - borderRadius, borderRadius);
    } else {
      ctx.lineTo(x, y + height);
    }
    if (excludeCorner !== 'topLeft') {
      ctx.arcTo(x, y, x + borderRadius, y, borderRadius);
    } else {
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(image, x, y, width, height);
    ctx.restore();
  };

  drawImageWithSpecificRoundedCorners(ctx, image1, 0, 0, cornerWidth, cornerHeight, 'topLeft');
  drawImageWithSpecificRoundedCorners(ctx, image2, cornerWidth + lineWidth, 0, cornerWidth, cornerHeight, 'topRight');
  drawImageWithSpecificRoundedCorners(ctx, image3, 0, cornerHeight + lineWidth, cornerWidth, cornerHeight, 'bottomLeft');
  drawImageWithSpecificRoundedCorners(ctx, image4, cornerWidth + lineWidth, cornerHeight + lineWidth, cornerWidth, cornerHeight, 'bottomRight');

  ctx.fillStyle = 'white';
  ctx.fillRect(cornerWidth, 0, lineWidth, canvasHeight);
  ctx.fillRect(0, cornerHeight, canvasWidth, lineWidth);

  const centerX = (canvasWidth - centerImage.width) / 2;
  const centerY = (canvasHeight - centerImage.height) / 2;
  ctx.drawImage(centerImage, centerX, centerY);

  const out = fs.createWriteStream('output.png');
  const stream = canvas.createPNGStream();
  stream.pipe(out);
  out.on('finish', () => console.log('L\'image a été créée avec succès.'));
};

const clipStart = []
let start = 0

async function getClips(first = 10) {
    const token = await getToken();
    const broadcasterId = await getTwitchStreamerId(streameur, token)
    const ilyaunmois = oneMonthAgo();
    const url = `https://api.twitch.tv/helix/clips`;

    try {
        const options = {
            method: 'GET',
            url: url,
            params: {
                started_at: ilyaunmois,
                broadcaster_id: broadcasterId,
                first: first
            },
            headers: {
                'Client-Id': TWITCH_ID,
                'Authorization': `Bearer ${token}`
            }
        };

        const response = await axios.request(options);
        const clips = response.data.data;
        const mostViewedClipTitle = clips[0].title;
        console.log(clips)
        for (const [index, clip] of clips.entries()) {
            if(index <= 3){
                await downloadThumbnail(clip.thumbnail_url, `thumbnails/${index}.jpg`)
            }
            const filePath = await downloadClip({ ...clip, path: `${index + 1}.mp4` });
            if (filePath) {
                const duration = await getVideoDuration(filePath)
                const duration2 = parseInt(start) + parseInt(duration)
                clipStart.push({ text: clip.title, duration: start })
                start = duration2;
                videoData.push({ path: filePath, text: clip.title });
            }
        }

        const cheminsASupprimer = [
            "clips",
            "final.mp4",
            "output.png",
            "thumbnails"
        ]

        setTimeout(async () => {
            await createFinalVideo(videoData);
            await createCompositeImage();
            setTimeout(async () => {
                await uploadVideo(mostViewedClipTitle);
                cheminsASupprimer.forEach((chemin) => {
                    const stats = fs.lstatSync(chemin);
                    if (stats.isDirectory()) {
                        supprimerDossier(chemin);
                    } else if (stats.isFile()) {
                        supprimerFichier(chemin);
                    }
                });
            }, 3000)
        }, 7000);
    } catch (error) {
        console.error('Erreur lors de la récupération des clips :', error.response ? error.response.data : error.message);
    }
}

async function getTwitchStreamerId(username, accessToken) {
    try {
        const clientId = TWITCH_ID;
        const twitchApiUrl = `https://api.twitch.tv/helix/users?login=${username}`;
  
        const response = await fetch(twitchApiUrl, {
            headers: {
                'Client-ID': clientId,
                'Authorization': `Bearer ${accessToken}`
            }
        });
  
        const data = await response.json();
        console.log(accessToken)
        console.log(data)
        const user = data.data[0];
        return user ? user.id : null;
    } catch (error) {
        console.error('Erreur lors de la récupération de l\'ID du streamer:', error.message);
        throw error;
    }
}
getClips();