const FFmpeg = FFmpeg.FFmpeg;
const fetchFile = FFmpeg.fetchFile;

let ffmpeg;
let videoFile;
let videoDuration;

// Initialize FFmpeg
async function initFFmpeg() {
if (ffmpeg?.isLoaded()) return;

ffmpeg = new FFmpeg();  
ffmpeg.on('log', ({ message }) => {  
    console.log('[FFmpeg]', message);  
});  
ffmpeg.on('progress', (progress) => {  
    updateProgress(progress.progress * 100);  
});  

try {  
    await ffmpeg.load({  
        coreURL: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/ffmpeg-core.js',  
    });  
    console.log('FFmpeg loaded successfully');  
    return true;  
} catch (error) {  
    console.error('Failed to load FFmpeg:', error);  
    showError('Failed to initialize video processing. Please refresh the page.');  
    return false;  
}

}

// Get video duration
async function getVideoDuration(file) {
return new Promise((resolve, reject) => {
const video = document.createElement('video');
const blob = URL.createObjectURL(file);

video.addEventListener('loadedmetadata', () => {  
        URL.revokeObjectURL(blob);  
        resolve(video.duration);  
    });  

    video.addEventListener('error', () => {  
        URL.revokeObjectURL(blob);  
        reject(new Error('Failed to load video'));  
    });  

    video.src = blob;  
});

}

// Format seconds to readable time
function formatTime(seconds) {
const hrs = Math.floor(seconds / 3600);
const mins = Math.floor((seconds % 3600) / 60);
const secs = Math.floor(seconds % 60);

if (hrs > 0) {  
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;  
}  
return `${mins}:${secs.toString().padStart(2, '0')}`;

}

// Handle file upload
const uploadArea = document.getElementById('uploadArea');
const videoFileInput = document.getElementById('videoFile');

uploadArea.addEventListener('click', () => videoFileInput.click());

uploadArea.addEventListener('dragover', (e) => {
e.preventDefault();
uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => {
uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
e.preventDefault();
uploadArea.classList.remove('dragover');
if (e.dataTransfer.files.length > 0) {
videoFileInput.files = e.dataTransfer.files;
handleFileSelect();
}
});

videoFileInput.addEventListener('change', handleFileSelect);

async function handleFileSelect() {
const file = videoFileInput.files[0];
if (!file) return;

// Validate file size (500MB limit)  
if (file.size > 500 * 1024 * 1024) {  
    showError('Video file is too large. Maximum size is 500MB.');  
    videoFileInput.value = '';  
    return;  
}  

videoFile = file;  

try {  
    // Get video duration  
    videoDuration = await getVideoDuration(file);  

    // Show file info  
    const fileInfo = document.getElementById('fileInfo');  
    fileInfo.innerHTML = `  
        <p>✅ Video selected: <span class="filename">${file.name}</span></p>  
        <p class="duration">Duration: ${formatTime(videoDuration)}</p>  
    `;  
    fileInfo.classList.remove('hidden');  

    // Show settings section  
    document.getElementById('settingsSection').classList.remove('hidden');  
    uploadArea.classList.add('hidden');  
    document.getElementById('videoFile').classList.add('hidden');  
} catch (error) {  
    showError('Failed to read video file: ' + error.message);  
    videoFileInput.value = '';  
}

}

// Generate clips
async function generateClips() {
if (!videoFile) {
showError('Please select a video first.');
return;
}

// Get settings  
const clipLength = parseInt(document.querySelector('input[name="clipLength"]:checked').value);  
const overlap = parseInt(document.getElementById('clipOverlap').value);  

// Validate settings  
if (overlap >= clipLength) {  
    showError('Overlap must be less than clip length.');  
    return;  
}  

// Disable button  
document.getElementById('generateBtn').disabled = true;  

// Show loading  
document.getElementById('settingsSection').classList.add('hidden');  
document.getElementById('loadingSection').classList.remove('hidden');  

try {  
    // Initialize FFmpeg  
    const initialized = await initFFmpeg();  
    if (!initialized) return;  

    // Load video file  
    updateProgressText('Loading video...');  
    await ffmpeg.writeFile('input', await fetchFile(videoFile));  
    updateProgressText('Processing video...');  

    // Calculate clips  
    const step = clipLength - overlap;  
    const clips = [];  
    let startTime = 0;  

    while (startTime + clipLength <= videoDuration) {  
        clips.push({  
            start: startTime,  
            end: startTime + clipLength,  
            index: clips.length + 1,  
        });  
        startTime += step;  
    }  

    // Add final clip if there's remaining video  
    if (startTime < videoDuration) {  
        const endTime = Math.min(startTime + clipLength, videoDuration);  
        clips.push({  
            start: startTime,  
            end: endTime,  
            index: clips.length + 1,  
        });  
    }  

    if (clips.length === 0) {  
        showError(`Video is too short. Minimum length is ${clipLength} seconds.`);  
        resetApp();  
        return;  
    }  

    // Generate clips  
    const clipFiles = [];  
    const videoExt = videoFile.name.split('.').pop().toLowerCase();  

    for (let i = 0; i < clips.length; i++) {  
        const clip = clips[i];  
        const outputName = `clip_${clip.index}.${videoExt}`;  

        updateProgressText(`Generating clip ${i + 1} of ${clips.length}...`);  
        updateProgress((i / clips.length) * 100);  

        try {  
            await ffmpeg.exec([  
                '-i', 'input',  
                '-ss', clip.start.toString(),  
                '-to', clip.end.toString(),  
                '-c', 'copy',  
                '-y',  
                outputName,  
            ]);  

            const data = await ffmpeg.readFile(outputName);  
            const blob = new Blob([data.buffer], { type: videoFile.type });  
            const url = URL.createObjectURL(blob);  

            clipFiles.push({  
                name: outputName,  
                url: url,  
                blob: blob,  
                duration: clip.end - clip.start,  
                startTime: clip.start,  
            });  

            await ffmpeg.deleteFile(outputName);  
        } catch (error) {  
            console.error(`Failed to generate clip ${i + 1}:`, error);  
        }  
    }  

    // Clean up  
    await ffmpeg.deleteFile('input');  

    // Show results  
    updateProgress(100);  
    updateProgressText('Complete!');  
    setTimeout(() => {  
        displayResults(clipFiles);  
    }, 1000);  
} catch (error) {  
    console.error('Error generating clips:', error);  
    showError('Error generating clips: ' + error.message);  
} finally {  
    document.getElementById('generateBtn').disabled = false;  
}

}

// Display results
function displayResults(clipFiles) {
document.getElementById('loadingSection').classList.add('hidden');
document.getElementById('resultsSection').classList.remove('hidden');
document.getElementById('clipCount').textContent = clipFiles.length;

const clipsList = document.getElementById('clipsList');  
clipsList.innerHTML = '';  

clipFiles.forEach((clip, index) => {  
    const item = document.createElement('div');  
    item.className = 'clip-item';  
    item.innerHTML = `  
        <div class="clip-info">  
            <div class="clip-name">📹 Clip ${index + 1}</div>  
            <div class="clip-duration">${formatTime(clip.startTime)} - ${formatTime(clip.startTime + clip.duration)}</div>  
        </div>  
        <div class="clip-actions">  
            <button class="clip-btn" onclick="previewClip('${clip.url}')">👁️ Preview</button>  
            <button class="clip-btn" onclick="downloadClip('${clip.url}', '${clip.name}')">⬇️ Download</button>  
        </div>  
    `;  
    clipsList.appendChild(item);  
});

}

// Preview clip
function previewClip(url) {
const modal = document.createElement('div');
modal.style.cssText =   position: fixed;   top: 0;   left: 0;   right: 0;   bottom: 0;   background: rgba(0, 0, 0, 0.8);   display: flex;   align-items: center;   justify-content: center;   z-index: 1000;  ;

const video = document.createElement('video');  
video.src = url;  
video.controls = true;  
video.autoplay = true;  
video.style.cssText = `  
    max-width: 90vw;  
    max-height: 90vh;  
    border-radius: 8px;  
`;  

const closeBtn = document.createElement('button');  
closeBtn.textContent = '✕';  
closeBtn.style.cssText = `  
    position: absolute;  
    top: 20px;  
    right: 20px;  
    background: white;  
    border: none;  
    width: 40px;  
    height: 40px;  
    border-radius: 50%;  
    font-size: 24px;  
    cursor: pointer;  
    z-index: 1001;  
`;  
closeBtn.onclick = () => modal.remove();  

modal.appendChild(video);  
modal.appendChild(closeBtn);  
modal.onclick = (e) => e.target === modal && modal.remove();  

document.body.appendChild(modal);

}

// Download clip
function downloadClip(url, filename) {
const link = document.createElement('a');
link.href = url;
link.download = filename;
document.body.appendChild(link);
link.click();
document.body.removeChild(link);
}

// Update progress
function updateProgress(percent) {
document.getElementById('progressFill').style.width = percent + '%';
document.getElementById('progressText').textContent = Math.round(percent) + '%';
}

function updateProgressText(text) {
document.getElementById('loadingText').textContent = text;
}

// Show error
function showError(message) {
document.getElementById('settingsSection').classList.add('hidden');
document.getElementById('loadingSection').classList.add('hidden');
document.getElementById('resultsSection').classList.add('hidden');
document.getElementById('errorSection').classList.remove('hidden');
document.getElementById('errorMessage').textContent = message;
}

// Reset app
function resetApp() {
videoFile = null;
videoDuration = null;
document.getElementById('videoFile').value = '';
document.getElementById('clipOverlap').value = '2';
document.querySelector('input[name="clipLength"][value="15"]').checked = true;

document.getElementById('uploadArea').classList.remove('hidden');  
document.getElementById('fileInfo').classList.add('hidden');  
document.getElementById('settingsSection').classList.add('hidden');  
document.getElementById('loadingSection').classList.add('hidden');  
document.getElementById('resultsSection').classList.add('hidden');  
document.getElementById('errorSection').classList.add('hidden');  

updateProgress(0);

}

// Initialize on load
window.addEventListener('load', () => {
console.log('Application loaded');
});
