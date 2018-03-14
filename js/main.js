class App {
    constructor(container, mediaStream) {
        try
        {
            let self = this;
            
            this.container = container;
            this.mediaStream = mediaStream;
            
            // create canvas
            this.canvas = document.createElement('canvas');
            this.canvas.width = window.innerWidth; 
            this.canvas.height = window.innerHeight;
            this.container.appendChild(this.canvas);
            this.canvasContext = this.canvas.getContext( '2d' );

            // register size change event
            function resizeCanvas(){
                self.canvas.width = window.innerWidth;
                self.canvas.height = window.innerHeight;
            }
            window.onorientationchange = resizeCanvas;
            window.onresize = resizeCanvas;

            // create worker thread
            this.worker = new Worker("js/worker.js");
            this.worker.onmessage = function(e){
                if(e.data.command == "tick") {
                    self.tick();
                }
                else {
                    console.log("unknown command received: " + e.data);
                }
            };
            this.interval = 25.0;
    
            // initialize metronome settings
            this.version = "ver.20180314";
            this.quaterNoteCount = 4;
            this.quaterNoteDivision = 1;
            this.noteSoundLength = 0.05;
            this.totalNoteCount = this.quaterNoteCount * this.quaterNoteDivision;
            this.scheduleMargin = 0.1;  // seconds
            this.isPlaying = false;
            this.isAudioInitialized = false;
            this.currentTime = 0;
            this.currentPositionInBar = 0;

            // initialize beat detector settings
            this.beatsQueue = [];
            this.lastBeatDetectedTime = 0;

            // start animation frame loop
            function frameLoop() {
                self.calc();
                self.draw();
                requestAnimationFrame(frameLoop);
            }
            this.requestId = requestAnimationFrame(frameLoop);

            // initialize user interface
            this.canvas.onclick = function(){
                self.togglePlay();
            };

            this.readSettings();
        }
        catch(error)
        {
            alert("failed: " + error.message + ":" + error.stack);
        }
    }

    initializeAudio(){
        try
        {
            // call here from user operation (e.g. button click, touch, etc...)
            this.audioContext = new AudioContext({ latencyHint:'interactive', sampleRate:96000 });

            // play dummy sounds to enable audio
            var buffer = this.audioContext.createBuffer(1, 1, 22050);
            var node = this.audioContext.createBufferSource();
            node.buffer = buffer;
            node.start(0);

            this.scriptProcessor = this.audioContext.createScriptProcessor(256, 1, 1);
            this.scriptProcessor.connect(this.audioContext.destination);
            this.mediaStreamSource = this.audioContext.createMediaStreamSource(this.mediaStream);
            this.mediaStreamSource.connect(this.scriptProcessor);

            let self = this;
            this.scriptProcessor.onaudioprocess = function(event) {
                self.updateBeats(event);
            };
        }
        catch(error)
        {
            alert("failed: " + error.message + ":" + error.stack);
        }
    }

    readSettings() {
        this.bpm = parseFloat(document.getElementById('bpm').value);
        this.beatDelay = parseFloat(document.getElementById('beatDelay').value);
        this.secondsPerNote = 60 / this.bpm / this.quaterNoteDivision;
        this.secondsPerBar = 60 / this.bpm * this.quaterNoteCount;
        this.beatThreshold = parseFloat(document.getElementById('beatThreshold').value);
        this.beatIntervalMin = parseFloat(document.getElementById('beatIntervalMin').value);
    }

    start() {
        try
        {
            if(this.isPlaying){
                return;
            }
            this.isPlaying = true;

            if(!this.isAudioInitialized){
                this.initializeAudio();
                this.isAudioInitialized = true;
            }

            this.readSettings();
    
            this.beatsQueue = [];
            this.startTime = this.audioContext.currentTime + this.scheduleMargin;
            this.nextScheduleNote = 0;
            this.nextScheduleNoteTime = this.startTime;

            this.worker.postMessage({ command:"start", interval:this.interval });
        }
        catch(error)
        {
            alert("failed: " + error.message + ":" + error.stack);
        }
    }

    stop() {
        try
        {
            if(!this.isPlaying){
                return;
            }
            this.isPlaying = false;

            this.worker.postMessage({ command:"stop" });
        }
        catch(error)
        {
            alert("failed: " + error.message + ":" + error.stack);
        }
    }

    togglePlay() {
        if(!this.isPlaying) {
            this.start();
        }
        else {
            this.stop();
        }
    }

    updateBeats(e) {
        try
        {
            let inputs = e.inputBuffer.getChannelData(0);

            let maxValue = Math.max.apply(null, inputs);
            let value = maxValue > this.beatThreshold ? maxValue : 0;

            let currentTime = e.playbackTime;
            if(value > 0 && (this.lastBeatDetectedTime + this.beatIntervalMin) < currentTime) {
                this.beatsQueue.push({ volume:value, time:currentTime });
                this.lastBeatDetectedTime = currentTime;
            }
        }
        catch(error)
        {
            alert("failed: " + error.message + ":" + error.stack);
        }
    }

    calc() {
        try
        {
            if(this.isPlaying)
            {
                this.currentTime = this.audioContext.currentTime;
                this.currentPositionInBar = Math.max(0, ((this.currentTime - this.startTime) % this.secondsPerBar) / this.secondsPerBar);
            }
        }
        catch(error)
        {
            alert("failed: " + error.message + ":" + error.stack);
        }
    }

    draw() {
        try
        {
            // clear screen
            this.canvasContext.fillStyle = "cornsilk";
            this.canvasContext.fillRect(0, 0, this.canvas.width, this.canvas.height);

            // draw version
            this.canvasContext.fillStyle = "black";
            this.canvasContext.font = `${this.canvas.width / 50}px Meyro`;
            this.canvasContext.textBaseline = "top"; 
            this.canvasContext.textAlign = "left";
            this.canvasContext.fillText(`${this.version}`, 0, 0);

            // draw bpm
            this.canvasContext.fillStyle = "black";
            this.canvasContext.font = `${this.canvas.height / 3}px Meyro`;
            this.canvasContext.textBaseline = "middle"; 
            this.canvasContext.textAlign = "center";
            this.canvasContext.fillText(`${this.bpm}`, this.canvas.width / 2, this.canvas.height / 3);

            // draw marker
            let xmargin = this.canvas.width / 10;
            let barWidth = this.canvas.width - xmargin * 2;
            let noteOffset = barWidth / this.totalNoteCount;
            {
                let x = this.currentPositionInBar * barWidth + xmargin;
                let y = this.canvas.height / 4 * 3;
                let radius = this.canvas.width / 200;

                this.canvasContext.beginPath();
                this.canvasContext.arc(x, y, radius, 0, Math.PI * 2, false);
                this.canvasContext.fill();
            }

            // draw notes
            {
                let radius_base = this.canvas.width / 100;
                let currentNote = Math.floor(this.currentPositionInBar * this.totalNoteCount);
                for(let i = 0; i < this.totalNoteCount + 1; i++) {
                    let x = xmargin + noteOffset * i;
                    let y = this.canvas.height / 4 * 3;
                    let radius = i % this.quaterNoteDivision == 0 ? radius_base * 2 : radius_base;

                    this.canvasContext.beginPath();
                    this.canvasContext.arc(x, y, radius, 0, Math.PI * 2, false);
                    if(i == currentNote) {
                        this.canvasContext.fillStyle = "black";
                        this.canvasContext.fill();
                    }
                    else {
                        this.canvasContext.stroke();
                    }
                }
            }

            // draw user beats
            let currentBarNumber = Math.floor((this.currentTime - this.startTime - this.beatDelay) / this.secondsPerBar);
            for(let i = 0; i < this.beatsQueue.length; i++){
                let time = this.beatsQueue[i].time;
                let positionInBar = Math.max(0, ((time - this.startTime - this.beatDelay) % this.secondsPerBar) / this.secondsPerBar);
                let barNumber = Math.floor((time - this.startTime - this.beatDelay) / this.secondsPerBar);
                let radius = 10;
                let x = positionInBar * barWidth + xmargin;
                let y = this.canvas.height / 5 * 3 - (currentBarNumber - barNumber) * radius * 3;
                
                this.canvasContext.beginPath();
                this.canvasContext.arc(x, y, radius, 0, Math.PI * 2, false);
                this.canvasContext.fill();
            }
        }
        catch(error)
        {
            alert("failed: " + error.message + ":" + error.stack);
        }
    }

    tick() {
        while(this.nextScheduleNoteTime < this.audioContext.currentTime + this.scheduleMargin){
            this.scheduleNote();
        }
    }

    scheduleNote() {
        try
        {
            var osc = this.audioContext.createOscillator();
            osc.connect(this.audioContext.destination);

            if (this.nextScheduleNote == 0){
                osc.frequency.setValueAtTime(880.0, 0);
            }
            else if (this.nextScheduleNote % this.quaterNoteDivision == 0 ) {
                osc.frequency.setValueAtTime(440.0, 0);
            }
            else {
                osc.frequency.setValueAtTime(220.0, 0);
            }
        
            osc.start(this.nextScheduleNoteTime);
            osc.stop(this.nextScheduleNoteTime + this.noteSoundLength);

            this.nextScheduleNote = (this.nextScheduleNote + 1) % this.totalNoteCount;
            this.nextScheduleNoteTime += this.secondsPerNote;
        }
        catch(e)
        {
            alert("failed: " + e.message + ":" + e.stack);
        }
    }
}

window.onload = function() {
    window.requestAnimationFrame = (function() {
        return window.requestAnimationFrame ||
        window.webkitRequestAnimationFrame ||
        window.mozRequestAnimationFrame ||
        window.oRequestAnimationFrame ||
        window.msRequestAnimationFrame ||
        function(callback, element) {
            window.setTimeout(callback, 1000 / 60);
        };
    })();
    window.cancelAnimationFrame = (function() {
        return window.cancelAnimationFrame ||
        window.webkitCancelAnimationFrame ||
        window.mozCancelAnimationFrame ||
        window.msCancelAnimationFrame ||
        window.oCancelAnimationFrame ||
        function(requestId) {
            window.clearTimeout(requestId);
        };
    })();

    window.AudioContext = window.AudioContext || window.webkitAudioContext;

    navigator.getUserMedia = (navigator.getUserMedia ||
        navigator.webkitGetUserMedia ||
        navigator.mozGetUserMedia ||
        navigator.msGetUserMedia);

    let container = document.getElementById('container');

    navigator.getUserMedia (
        {
            audio: true
        },
        function(mediaStream) {
            let app = new App(container, mediaStream);
        },
        function(e) {
            alert("failed to getUserMedia(): " + e.name);
        }
    );
}
