// ------------------------------------------------------------
// Idle Species v9.0 - COMPLETE RENDERER
// Features: Native CPU Sync, Square Shockwaves, Terminal UI,
// Audio Engine, Cam/Mic Input, White Meteor.
// ------------------------------------------------------------

// --- 0. INTEGRAZIONE NODE.JS (SOLO ELECTRON) ---
const os = require('os'); 

let previousCpuInfo = getCpuSnapshot();
let currentCpuUsage = 0; 

function getCpuSnapshot() {
    const cpus = os.cpus();
    let idle = 0;
    let total = 0;
    for (const cpu of cpus) {
        for (const type in cpu.times) {
            total += cpu.times[type];
        }
        idle += cpu.times.idle;
    }
    return { idle, total };
}

function updateCpuUsage() {
    const currentCpuInfo = getCpuSnapshot();
    const idleDiff = currentCpuInfo.idle - previousCpuInfo.idle;
    const totalDiff = currentCpuInfo.total - previousCpuInfo.total;
    
    if (totalDiff > 0) {
        const usage = 1 - (idleDiff / totalDiff);
        currentCpuUsage = usage * 100; 
    }
    previousCpuInfo = currentCpuInfo;
}

setInterval(updateCpuUsage, 1000);


// --- 1. SETUP AMBIENTE ---
const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d", { alpha: true });

let DPR = 1, W = 0, H = 0;
let COLS = 0, ROWS = 0; 

const GRID_STEP = 7;
const CELL_SIZE = 4;
const FADE_SPEED = 0.02;  

// --- 2. IMPOSTAZIONI ---
let SETTING_MATURITY = 0.0;
let SETTING_AUTO_MATURITY = true;
let SETTING_MAX_POP = 150;
let SETTING_CPU_SYNC = false; 
let SETTING_STEP_TIME = 0.12;
let SETTING_GLITCH_OVERRIDE = 0.0;
let SETTING_VOLUME = 0.2; 
let SETTING_MUTED = false;

// Parametri Fissi
const FREE_GROWTH_THRESHOLD = 50; 
const START_HARD_CAP = 150;       
const END_HARD_CAP = 300;         
const MIN_AGE = 40;       
const MAX_AGE_CAP = 300;  
const MUTATION_BASE = 0.005; 
const MATURITY_RATE = 0.0005; 

// Stato
let cells = [];
let acc = 0;
let lastTS = 0;
let currentAgeLimit = MIN_AGE;
let currentHardCap = START_HARD_CAP;
let currentBirthChance = 1.0;
let fps = 60, frameCount = 0, lastFpsTime = 0;

// --- STATO METEORITE ---
let meteor = {
    active: false,
    x: 0, y: 0, 
    targetX: 0, targetY: 0, 
    speedX: 0, speedY: 0,
    impactRadius: 0, 
    impactMaxRadius: 0
};

// --- 3. SISTEMA SENSORI & AUDIO ---
let audioCtx = null;
let masterGain = null;
let audioEnabled = false;

let currentStream = null;
let micSource = null;
let micAnalyser = null;
let micData = null;
let camVideo = null;
let camCanvas = null;
let camCtx = null;

let lightLevel = 0.1;
let noiseLevel = 0.0;

// --- 4. GESTIONE DISPOSITIVI ---
async function getDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioSelect = document.getElementById('selAudio');
    const videoSelect = document.getElementById('selVideo');
    
    audioSelect.innerHTML = '';
    videoSelect.innerHTML = '';
    
    devices.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        if (d.kind === 'audioinput') {
            opt.text = d.label || `Mic ${audioSelect.length + 1}`;
            audioSelect.appendChild(opt);
        } else if (d.kind === 'videoinput') {
            opt.text = d.label || `Cam ${videoSelect.length + 1}`;
            videoSelect.appendChild(opt);
        }
    });
}

async function startStream(audioId, videoId) {
    if (currentStream) {
        currentStream.getTracks().forEach(t => t.stop());
    }

    const constraints = {
        audio: audioId ? { deviceId: { exact: audioId } } : true,
        video: videoId ? { deviceId: { exact: videoId }, width: 320, height: 240 } : { width: 320, height: 240 }
    };

    try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        currentStream = stream;

        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            masterGain = audioCtx.createGain();
            masterGain.gain.value = SETTING_VOLUME; 
            masterGain.connect(audioCtx.destination);
        }
        
        if (micSource) micSource.disconnect();
        micSource = audioCtx.createMediaStreamSource(stream);
        micAnalyser = audioCtx.createAnalyser();
        micAnalyser.fftSize = 256;
        micData = new Uint8Array(micAnalyser.fftSize);
        micSource.connect(micAnalyser);

        if (!camVideo) {
            camVideo = document.createElement("video");
            camCanvas = document.createElement("canvas");
            camCanvas.width = 32; camCanvas.height = 24; 
            camCtx = camCanvas.getContext("2d");
        }
        camVideo.srcObject = stream;
        camVideo.muted = true;
        camVideo.play();

        audioEnabled = true;

    } catch (e) {
        console.error("Stream Error:", e);
    }
}

async function initSystem() {
    try {
        await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        await getDevices();
        
        const audioId = document.getElementById('selAudio').value;
        const videoId = document.getElementById('selVideo').value;
        await startStream(audioId, videoId);

        const btn = document.getElementById('btnInit');
        btn.innerText = "[ ONLINE ]";
        btn.style.background = "#00FF00";
        btn.style.color = "#000";

        playTone(440, 'sine', 0.2); 

    } catch (e) {
        alert("Permessi negati. Impossibile avviare sensori.");
    }
}

function sampleSensors() {
    if (!audioEnabled) return;

    if (micAnalyser) {
        micAnalyser.getByteTimeDomainData(micData);
        let sum = 0;
        for(let i=0; i<micData.length; i++) {
            const v = (micData[i] - 128) / 128;
            sum += v*v;
        }
        const rms = Math.sqrt(sum / micData.length);
        const targetNoise = Math.min(1, rms * 5);
        noiseLevel = noiseLevel * 0.9 + targetNoise * 0.1;
    }

    if (camVideo && camVideo.readyState === 4) {
        camCtx.drawImage(camVideo, 0, 0, 32, 24);
        const data = camCtx.getImageData(0,0,32,24).data;
        let sum = 0;
        let samples = 0;
        
        // CORREZIONE MATEMATICA: Contiamo i campioni reali
        for(let i=0; i<data.length; i+=16) { 
            sum += (data[i] + data[i+1] + data[i+2]) / 3;
            samples++;
        }
        
        if (samples > 0) {
            const avg = sum / samples; 
            // Gain per sensibilità luce
            const targetLight = Math.min(1.0, (avg / 255) * 2.5); 
            lightLevel = lightLevel * 0.90 + targetLight * 0.10;
        }
    }
}

// --- 5. UI GENERATOR ---
function createUI() {
    const ui = document.createElement('div');
    ui.id = 'controlPanel'; 
    Object.assign(ui.style, {
        position: 'fixed', top: '10px', left: '10px', 
        width: '260px', padding: '15px',
        backgroundColor: 'rgba(5, 5, 5, 0.9)',
        border: '1px solid #00FF00',
        color: '#00FF00',
        fontFamily: 'monospace', fontSize: '11px',
        zIndex: '99999', userSelect: 'none',
        maxHeight: '95vh', overflowY: 'auto' 
    });

    ui.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #333; padding-bottom:5px; margin-bottom:10px;">
            <span style="font-weight:bold;">SPECIES v9.0</span>
            <div>
                <span style="color:#555; font-size:9px; margin-right:10px;">Press 'H' to Hide</span>
                <span id="btnClose" style="cursor:pointer; font-weight:bold;">[ X ]</span>
            </div>
        </div>
        
        <div style="margin-bottom:10px;">
            <button id="btnInit" style="width:100%; background:#003300; color:#00FF00; border:1px solid #00FF00; padding:5px; cursor:pointer;">[ INIT SYSTEM ]</button>
        </div>

        <div style="margin-bottom:10px; border:1px solid #333; padding:5px;">
            <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                <span>AUDIO VOL (Limit)</span>
                <label><input type="checkbox" id="chkMute"> MUTE</label>
            </div>
            <input type="range" id="rngVol" min="0" max="1" step="0.01" value="0.2" style="width:100%; accent-color:#00FF00;">
        </div>

        <div style="margin-bottom:5px;">AUDIO INPUT:</div>
        <select id="selAudio" style="width:100%; margin-bottom:10px; background:#111; color:#0f0; border:1px solid #333;"></select>
        
        <div style="margin-bottom:5px;">VIDEO INPUT:</div>
        <select id="selVideo" style="width:100%; margin-bottom:10px; background:#111; color:#0f0; border:1px solid #333;"></select>

        <div style="margin-bottom:10px; border:1px solid #333; padding:5px;">
            <div style="display:flex; justify-content:space-between;">
                <span>NOISE</span> <span id="dispNoise">0%</span>
            </div>
            <div style="width:100%; height:4px; background:#111; margin-bottom:4px;">
                <div id="barNoise" style="width:0%; height:100%; background:#F00;"></div>
            </div>
            <div style="display:flex; justify-content:space-between;">
                <span>LIGHT</span> <span id="dispLight">0%</span>
            </div>
            <div style="width:100%; height:4px; background:#111;">
                <div id="barLight" style="width:0%; height:100%; background:#FF0;"></div>
            </div>
        </div>

        <div style="margin-bottom:8px;">
            <div style="display:flex; justify-content:space-between;">
                <span>MATURITY</span>
                <label><input type="checkbox" id="chkAuto" checked> AUTO</label>
            </div>
            <input type="range" id="rngMat" min="0" max="1" step="0.01" value="0" style="width:100%; accent-color:#00FF00;">
            <div id="valMat" style="text-align:right; color:#888;">0%</div>
        </div>

        <div style="margin-bottom:8px;">
            <div style="display:flex; justify-content:space-between;">
                <span>MAX POPULATION</span>
                <label style="color:#00FF00;"><input type="checkbox" id="chkCpu"> CPU SYNC</label>
            </div>
            <input type="range" id="rngPop" min="50" max="2500" step="10" value="150" style="width:100%; accent-color:#00FF00;">
            <div id="valPop" style="text-align:right; color:#888;">150</div>
        </div>

        <div style="margin-bottom:8px;">
            <div>SIM SPEED</div>
            <input type="range" id="rngSpd" min="0.01" max="0.3" step="0.01" value="0.12" style="width:100%; accent-color:#00FF00;">
            <div id="valSpd" style="text-align:right; color:#888;">0.12s</div>
        </div>

        <div style="margin-bottom:8px;">
            <div>GLITCH CHANCE</div>
            <input type="range" id="rngGli" min="0" max="1" step="0.01" value="0" style="width:100%; accent-color:#00FF00;">
            <div id="valGli" style="text-align:right; color:#888;">AUTO</div>
        </div>

        <div style="border-top:1px solid #333; margin-top:20px; padding-top:10px; color:#aaa; line-height:1.4em;" id="uiStats">
            Waiting...
        </div>

        <div style="margin-top: 20px; margin-bottom: 10px;">
            <button id="btnMeteor" style="
                width: 100%;
                background:#003300; 
                color:#00FF00; 
                border:1px solid #00FF00; 
                padding:15px; 
                font-family: monospace;
                font-weight: bold;
                font-size: 14px;
                cursor:pointer;
                transition: background 0.1s;
            " onmouseover="this.style.background='#004400'" onmouseout="this.style.background='#003300'">[ DANGER RESET ]</button>
        </div>
    `;

    document.body.appendChild(ui);

    // --- BINDING EVENTS ---
    document.getElementById('btnInit').onclick = initSystem;
    
    document.getElementById('btnClose').onclick = () => {
        ui.style.display = 'none';
    };

    window.addEventListener('keydown', (e) => {
        if (e.key === 'h' || e.key === 'H') {
            ui.style.display = (ui.style.display === 'none') ? 'block' : 'none';
        }
    });

    document.getElementById('selAudio').onchange = (e) => {
        startStream(e.target.value, document.getElementById('selVideo').value);
    };
    document.getElementById('selVideo').onchange = (e) => {
        startStream(document.getElementById('selAudio').value, e.target.value);
    };

    document.getElementById('rngVol').oninput = (e) => {
        SETTING_VOLUME = parseFloat(e.target.value);
    };
    document.getElementById('chkMute').onchange = (e) => {
        SETTING_MUTED = e.target.checked;
    };

    document.getElementById('chkAuto').onchange = (e) => {
        SETTING_AUTO_MATURITY = e.target.checked;
        document.getElementById('rngMat').disabled = SETTING_AUTO_MATURITY;
    };
    document.getElementById('rngMat').oninput = (e) => {
        SETTING_MATURITY = parseFloat(e.target.value);
        document.getElementById('valMat').innerText = (SETTING_MATURITY*100).toFixed(0) + "%";
    };
    
    document.getElementById('chkCpu').onchange = (e) => { 
        SETTING_CPU_SYNC = e.target.checked; 
        document.getElementById('rngPop').disabled = SETTING_CPU_SYNC;
    };
    document.getElementById('rngPop').oninput = (e) => { 
        SETTING_MAX_POP = parseInt(e.target.value); 
        document.getElementById('valPop').innerText = SETTING_MAX_POP; 
    };

    document.getElementById('rngSpd').oninput = (e) => {
        SETTING_STEP_TIME = parseFloat(e.target.value);
        document.getElementById('valSpd').innerText = SETTING_STEP_TIME.toFixed(2) + "s";
    };
    document.getElementById('rngGli').oninput = (e) => {
        SETTING_GLITCH_OVERRIDE = parseFloat(e.target.value);
        document.getElementById('valGli').innerText = SETTING_GLITCH_OVERRIDE > 0 ? (SETTING_GLITCH_OVERRIDE*100).toFixed(0) + "%" : "AUTO";
    };

    document.getElementById('btnMeteor').onclick = triggerMeteor;
}

function updateStats() {
    const el = document.getElementById('uiStats');
    if(!el) return;

    document.getElementById('barNoise').style.width = (noiseLevel * 100) + "%";
    document.getElementById('dispNoise').innerText = (noiseLevel * 100).toFixed(0) + "%";
    document.getElementById('barLight').style.width = (lightLevel * 100) + "%";
    document.getElementById('dispLight').innerText = (lightLevel * 100).toFixed(0) + "%";

    if (SETTING_AUTO_MATURITY) {
        document.getElementById('rngMat').value = SETTING_MATURITY;
        document.getElementById('valMat').innerText = (SETTING_MATURITY*100).toFixed(0) + "%";
    }

    if (SETTING_CPU_SYNC) {
        document.getElementById('rngPop').value = SETTING_MAX_POP;
        document.getElementById('valPop').innerText = SETTING_MAX_POP.toFixed(0) + " (CPU: " + currentCpuUsage.toFixed(0) + "%)";
    } else {
        if (document.getElementById('valPop').innerText.includes("CPU")) {
             document.getElementById('valPop').innerText = SETTING_MAX_POP.toFixed(0);
        }
    }

    let phaseStr = "INIT";
    if (SETTING_MATURITY < 0.3) phaseStr = "CLOUD";
    else if (SETTING_MATURITY < 0.7) phaseStr = "SOLID";
    else phaseStr = "GLITCH";

    let fpsC = "#00FF00"; if(fps < 30) fpsC = "#FF0000";

    el.innerHTML = `
        FPS: <span style="color:${fpsC}">${fps}</span><br>
        COUNT: ${cells.length} / ${currentHardCap.toFixed(0)}<br>
        PHASE: ${phaseStr}<br>
        CPU: ${currentCpuUsage.toFixed(1)}%<br>
        BIRTH CHANCE: ${(currentBirthChance*100).toFixed(0)}%
    `;
}

// --- 6. AUDIO ENGINE ---
function playTone(freq, type, duration, vol = 0.1) {
    if (!audioEnabled || !audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
}

function soundBirth(y) {
    if (!audioEnabled) return;
    const normY = 1 - (y / H);
    const type = SETTING_MATURITY < 0.5 ? 'sine' : 'triangle';
    const freq = 200 + (normY * 600) + (Math.random() * 20);
    playTone(freq, type, 0.12);
}

function soundGlitch() {
    if (!audioEnabled) return;
    playTone(80 + Math.random()*40, 'sawtooth', 0.08);
}

function soundImpact() {
    if (!audioEnabled || !audioCtx) return;
    const bufferSize = audioCtx.sampleRate * 0.5;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.8, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    noise.start();
}

// --- 7. CORE LOGIC ---
function toGrid(x, y) {
    let gx = Math.round(x / GRID_STEP);
    let gy = Math.round(y / GRID_STEP);
    if (COLS > 0) gx = (gx % COLS + COLS) % COLS;
    if (ROWS > 0) gy = (gy % ROWS + ROWS) % ROWS;
    return { gx, gy };
}

function fromGrid(gx, gy) {
    return { x: gx * GRID_STEP, y: gy * GRID_STEP };
}

function getKey(gx, gy) {
    if (COLS > 0) gx = (gx % COLS + COLS) % COLS;
    if (ROWS > 0) gy = (gy % ROWS + ROWS) % ROWS;
    return `${gx},${gy}`;
}

function resize() {
    DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    W = Math.floor(window.innerWidth * DPR);
    H = Math.floor(window.innerHeight * DPR);
    COLS = Math.ceil(W / GRID_STEP);
    ROWS = Math.ceil(H / GRID_STEP);
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = (W / DPR) + "px";
    canvas.style.height = (H / DPR) + "px";
}
window.addEventListener("resize", resize);

function makeCell(gx, gy, isNew = true) {
    if (COLS > 0) gx = (gx % COLS + COLS) % COLS;
    if (ROWS > 0) gy = (gy % ROWS + ROWS) % ROWS;
    const { x, y } = fromGrid(gx, gy);
    if (isNew) soundBirth(y);
    return { x, y, gx, gy, alive: true, age: 0, alpha: isNew ? 0 : 1, fadeTarget: 1 };
}

function initSeed() {
    const randCX = Math.floor(Math.random() * COLS);
    const randCY = Math.floor(Math.random() * ROWS);
    cells = [];
    for(let i=0; i<12; i++) {
        cells.push(makeCell(randCX + Math.floor(Math.random()*10)-5, randCY + Math.floor(Math.random()*10)-5, true));
    }
}

function triggerMeteor() {
    if (meteor.active) return; 
    meteor.targetX = Math.random() * W;
    meteor.targetY = Math.random() * H;
    const side = Math.floor(Math.random() * 4);
    if (side === 0) { meteor.x = Math.random() * W; meteor.y = -50; }
    else if (side === 1) { meteor.x = W + 50; meteor.y = Math.random() * H; }
    else if (side === 2) { meteor.x = Math.random() * W; meteor.y = H + 50; }
    else { meteor.x = -50; meteor.y = Math.random() * H; }

    const dx = meteor.targetX - meteor.x;
    const dy = meteor.targetY - meteor.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const speed = Math.max(W, H) * 1.5; 
    meteor.speedX = (dx / dist) * speed;
    meteor.speedY = (dy / dist) * speed;

    meteor.active = true;
    meteor.impactRadius = 0;
    meteor.impactMaxRadius = Math.min(W, H) * 0.35; 
}

function updateMeteor(dt) {
    if (!meteor.active) return;
    if (meteor.impactRadius === 0) {
        meteor.x += meteor.speedX * dt;
        meteor.y += meteor.speedY * dt;
        const dx = meteor.targetX - meteor.x;
        const dy = meteor.targetY - meteor.y;
        const distToTarget = Math.sqrt(dx*dx + dy*dy);
        
        if (distToTarget < 20 || (dx * meteor.speedX + dy * meteor.speedY < 0)) {
            meteor.x = meteor.targetX;
            meteor.y = meteor.targetY;
            meteor.impactRadius = 1; 
            soundImpact();
            const blastRadius = meteor.impactMaxRadius;
            cells = cells.filter(c => {
                const dx = c.x - meteor.targetX;
                const dy = c.y - meteor.targetY;
                const dist = Math.sqrt(dx*dx + dy*dy);
                let deathChance = 1.0 - (dist / blastRadius);
                if (deathChance < 0) deathChance = 0;
                return Math.random() > deathChance;
            });
            if (cells.length === 0) SETTING_MATURITY = 0;
            else SETTING_MATURITY *= 0.8;
        }
    } else {
        meteor.impactRadius += (meteor.impactMaxRadius - meteor.impactRadius) * 4 * dt;
        if (meteor.impactRadius > meteor.impactMaxRadius * 0.95) {
            meteor.active = false;
        }
    }
}

function drawMeteor() {
    if (!meteor.active) return;
    if (meteor.impactRadius === 0) {
        const size = CELL_SIZE * 3;
        ctx.fillStyle = '#FFFFFF'; 
        ctx.globalAlpha = 0.7;
        ctx.fillRect(meteor.x - size/2, meteor.y - size/2, size, size);
        ctx.globalAlpha = 1.0;
        ctx.fillRect(meteor.x - size/4, meteor.y - size/4, size/2, size/2);
    } else {
        const numWaves = 3;
        const spacing = meteor.impactMaxRadius / numWaves;
        for (let i = 0; i < numWaves; i++) {
            let r = meteor.impactRadius - (i * spacing * 0.6);
            if (r <= CELL_SIZE * 2) continue;
            let gridR = Math.floor(r / GRID_STEP) * GRID_STEP;
            if (gridR < GRID_STEP) continue;
            let alpha = 1.0 - (r / meteor.impactMaxRadius);
            if (alpha <= 0) continue;
            ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
            const cx = meteor.targetX;
            const cy = meteor.targetY;
            for (let px = -gridR; px <= gridR; px += GRID_STEP) {
                ctx.fillRect(cx + px, cy - gridR, CELL_SIZE, CELL_SIZE); 
                ctx.fillRect(cx + px, cy + gridR, CELL_SIZE, CELL_SIZE); 
            }
            for (let py = -gridR + GRID_STEP; py <= gridR - GRID_STEP; py += GRID_STEP) {
                ctx.fillRect(cx - gridR, cy + py, CELL_SIZE, CELL_SIZE); 
                ctx.fillRect(cx + gridR, cy + py, CELL_SIZE, CELL_SIZE); 
            }
        }
    }
}

function buildGridMap() {
    const map = new Map();
    for (const c of cells) if(c.alive && c.alpha > 0.1) map.set(getKey(c.gx, c.gy), c);
    return map;
}

function countNeighbors(map, gx, gy) {
    let n = 0;
    for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
            if (dx === 0 && dy === 0) continue;
            if (map.has(getKey(gx + dx, gy + dy))) n++;
        }
    }
    return n;
}

function lifeStep() {
    if (SETTING_CPU_SYNC) {
        const minPop = 50;
        const maxPop = 2500;
        let targetPop = minPop + (currentCpuUsage / 100) * (maxPop - minPop);
        SETTING_MAX_POP = SETTING_MAX_POP + (targetPop - SETTING_MAX_POP) * 0.1;
    }

    if (SETTING_AUTO_MATURITY) {
        if (noiseLevel < 0.2) {
            SETTING_MATURITY += MATURITY_RATE; 
        } else {
            SETTING_MATURITY -= 0.002; 
        }
        SETTING_MATURITY = Math.max(0, Math.min(1, SETTING_MATURITY));
    }

    currentHardCap = START_HARD_CAP + (SETTING_MATURITY * (SETTING_MAX_POP - START_HARD_CAP));
    currentAgeLimit = MIN_AGE + (SETTING_MATURITY * (MAX_AGE_CAP - MIN_AGE));

    const pop = cells.length;
    if (pop < FREE_GROWTH_THRESHOLD) currentBirthChance = 1.0;
    else {
        const range = currentHardCap - FREE_GROWTH_THRESHOLD;
        const progress = pop - FREE_GROWTH_THRESHOLD;
        currentBirthChance = range > 0 ? (1.0 - (progress / range)) : 0;
    }
    if (currentBirthChance < 0) currentBirthChance = 0;

    const map = buildGridMap();
    if (map.size === 0) return;
    
    const candidates = new Map();
    for (const c of cells) {
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                const k = getKey(c.gx + dx, c.gy + dy);
                if (!candidates.has(k)) candidates.set(k, { gx: c.gx + dx, gy: c.gy + dy });
            }
        }
    }

    const nextCells = [];
    let dynamicMutation = MUTATION_BASE;
    if (noiseLevel > 0.3) dynamicMutation *= 4;

    for (const cand of candidates.values()) {
        const k = getKey(cand.gx, cand.gy);
        const exists = map.get(k);
        const n = countNeighbors(map, cand.gx, cand.gy);
        let alive = false;
        let age = exists ? exists.age : 0;

        if (exists) {
            if (n === 2 || n === 3) alive = true;
            else if (SETTING_MATURITY > 0.4 && (n === 1 || n === 4 || n === 5)) {
                if (Math.random() < SETTING_MATURITY * 0.95) alive = true;
            }
            if (alive) {
                age++;
                const stress = noiseLevel > 0.5 ? 0.1 : 0;
                if (age > currentAgeLimit && Math.random() < (0.3 + stress)) alive = false;
            }
        } else {
            if (n === 3) {
                if (Math.random() < currentBirthChance) alive = true;
            } else if (Math.random() < dynamicMutation) {
                if (Math.random() < currentBirthChance) alive = true;
            }
        }

        if (alive) {
            if (exists) {
                exists.age = age;
                nextCells.push(exists);
            } else {
                nextCells.push(makeCell(cand.gx, cand.gy, true));
            }
        }
    }
    cells = nextCells;
}

function tectonic() {
    if (cells.length === 0) return;
    let chance = 0;
    if (SETTING_GLITCH_OVERRIDE > 0) chance = SETTING_GLITCH_OVERRIDE;
    else if (SETTING_MATURITY > 0.7) chance = ((SETTING_MATURITY - 0.7) / 0.3) * 0.5;

    if (noiseLevel > 0.4) chance += 0.1;
    if (Math.random() > chance) return;
    soundGlitch();

    const w = 5 + Math.floor(Math.random()*15);
    const h = 5 + Math.floor(Math.random()*15);
    const sx = Math.floor(Math.random()*COLS);
    const sy = Math.floor(Math.random()*ROWS);
    const dir = Math.floor(Math.random()*4);
    let dx=0, dy=0;
    if(dir===0) dy=-2; if(dir===1) dx=2; if(dir===2) dy=2; if(dir===3) dx=-2;

    for (const c of cells) {
        let lx = c.gx - sx;
        let ly = c.gy - sy;
        if (lx < -COLS/2) lx += COLS; if (lx > COLS/2) lx -= COLS;
        if (ly < -ROWS/2) ly += ROWS; if (ly > ROWS/2) ly -= ROWS;
        if (lx >= 0 && lx < w && ly >= 0 && ly < h) {
            c.gx += dx;
            c.gy += dy;
            if (COLS > 0) c.gx = (c.gx % COLS + COLS) % COLS;
            if (ROWS > 0) c.gy = (c.gy % ROWS + ROWS) % ROWS;
            c.alpha = 0.5; 
        }
    }
}

function draw() {
    ctx.clearRect(0, 0, W, H);
    if (SETTING_MATURITY > 0.5) {
        const sat = SETTING_MATURITY * 20;
        ctx.fillStyle = `hsl(180, ${sat}%, 100%)`;
    } else {
        ctx.fillStyle = "white";
    }

    // --- NUOVA LOGICA DI VISIBILITÀ ---
    // Se Luce > 50% (0.5), diventa invisibile.
    // Se Luce < 50%, scala da 1.0 (buio) a 0.0 (mezza luce).
    let lightMod = 0;
    if (lightLevel < 0.5) {
        // Al buio (0) -> 1.0 - 0 = 1.0 (visibile)
        // A metà luce (0.5) -> 1.0 - 1.0 = 0.0 (invisibile)
        lightMod = 1.0 - (lightLevel * 2);
    } else {
        lightMod = 0; // Invisibile con troppa luce
    }

    for (const c of cells) {
        if (c.alpha < 0.01) continue;
        ctx.globalAlpha = c.alpha * lightMod;
        ctx.fillRect(c.x, c.y, CELL_SIZE, CELL_SIZE);
    }
    ctx.globalAlpha = 1;
    drawMeteor();
}

function update(dt) {
    sampleSensors();
    if (cells.length === 0 && !meteor.active) initSeed();
    updateMeteor(dt);

    acc += dt;
    while (acc >= SETTING_STEP_TIME) {
        lifeStep();
        tectonic();
        acc -= SETTING_STEP_TIME;
    }

    for (const c of cells) {
        const pos = fromGrid(c.gx, c.gy);
        if (Math.abs(pos.x - c.x) > 100) c.x = pos.x; else c.x += (pos.x - c.x) * 0.1;
        if (Math.abs(pos.y - c.y) > 100) c.y = pos.y; else c.y += (pos.y - c.y) * 0.1;

        if (c.alpha < c.fadeTarget) c.alpha += FADE_SPEED;
        if (c.alpha > c.fadeTarget) c.alpha -= FADE_SPEED;
        
        const noiseEffect = noiseLevel > 0.2 ? 0.3 : 0.1;
        const flicker = Math.sin(performance.now() * 0.01 * c.gx + performance.now() * 0.1);
        c.currentAlpha = c.alpha * (0.8 + flicker * noiseEffect);
    }

    // GESTIONE AUDIO DINAMICO
    if (masterGain && audioCtx) {
        let darkness = 1.0 - lightLevel;
        let audioMod = 0;
        
        if (darkness > 0.5) {
            audioMod = (darkness - 0.5) * 2; 
        }

        const baseVol = SETTING_MUTED ? 0 : SETTING_VOLUME;
        const targetVol = baseVol * audioMod;
        
        masterGain.gain.setTargetAtTime(targetVol, audioCtx.currentTime, 0.1);
    }
}

function loop(ts) {
    if (ts > lastFpsTime + 1000) { fps = frameCount; frameCount = 0; lastFpsTime = ts; }
    frameCount++;
    const dt = (ts - lastTS) / 1000;
    lastTS = ts;
    
    update(Math.min(dt, 0.1));
    draw();
    updateStats();
    
    requestAnimationFrame(loop);
}

// --- BOOTSTRAP ---
createUI();
resize();
initSeed();
requestAnimationFrame(loop);