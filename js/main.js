class App {
    constructor(container, mediaStream) {
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

        // create audio context 
        this.audioContext = new AudioContext({ latencyHint:'interactive', sampleRate:96000 });
        this.scriptProcessor = this.audioContext.createScriptProcessor(256, 1, 1);
        this.scriptProcessor.connect(this.audioContext.destination);
        this.mediaStreamSource = this.audioContext.createMediaStreamSource(this.mediaStream);
        this.mediaStreamSource.connect(this.scriptProcessor);

        // initialize metronome settings
        this.bpm = 120;  // beats per seconds
        this.quaterNoteCount = 4;
        this.quaterNoteDivision = 1;
        this.noteSoundLength = 0.05;
        this.totalNoteCount = this.quaterNoteCount * this.quaterNoteDivision;
        this.secondsPerNote = 60 / this.bpm / this.quaterNoteDivision;
        this.secondsPerBar = 60 / this.bpm * this.quaterNoteCount;
        this.scheduleMargin = 0.1;  // seconds
        this.isPlaying = false;
        this.currentTime = 0;
        this.currentPositionInBar = 0;
        //this.microphoneInputDelay = 0;   // seconds
        this.microphoneInputDelay = 0.12;   // for my pc setting

        // initialize beat detector settings
        this.beatsQueue = [];
        this.lastBeatDetectedTime = 0;
        this.beatThreshold = 0.10;
        this.beatIntervalMin = 0.1;

        // start animation frame loop
        function frameLoop() {
            self.calc();
            self.draw();
            requestAnimationFrame(frameLoop);
        }
        this.requestId = requestAnimationFrame(frameLoop);

        // start beat detecting
        this.scriptProcessor.onaudioprocess = function(event) {
            self.updateBeats(event);
        };

        // initialize user interface
        this.canvas.onclick = function(){
            self.togglePlay();
        };
    }

    start() {
        if(this.isPlaying){
            return;
        }
        this.isPlaying = true;

        this.beatsQueue = [];
        this.startTime = this.audioContext.currentTime + this.scheduleMargin;
        this.nextScheduleNote = 0;
        this.nextScheduleNoteTime = this.startTime;
        this.worker.postMessage({ command:"start", interval:this.interval });
    }

    stop() {
        if(!this.isPlaying){
            return;
        }
        this.isPlaying = false;

        this.worker.postMessage({ command:"stop" });
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
        let inputs = new Float32Array(e.inputBuffer.length);
        e.inputBuffer.copyFromChannel(inputs, 0, 0);

        let maxValue = Math.max.apply(null, inputs);
        let value = maxValue > this.beatThreshold ? maxValue : 0;

        let currentTime = e.playbackTime;
        if(value > 0 && (this.lastBeatDetectedTime + this.beatIntervalMin) < currentTime) {
            this.beatsQueue.push({ volume:value, time:currentTime });
            this.lastBeatDetectedTime = currentTime;
        }
    }

    calc() {
        if(this.isPlaying)
        {
            this.currentTime = this.audioContext.currentTime;
            this.currentPositionInBar = Math.max(0, ((this.currentTime - this.startTime) % this.secondsPerBar) / this.secondsPerBar);

            if(this.microphoneInputDelay == 0 && this.beatsQueue.length > 1)
            {
                this.microphoneInputDelay = this.beatsQueue[0].time - this.startTime;
                console.log(`microphoneInputDelay = ${this.microphoneInputDelay}`);
            }
        }
    }

    draw() {
        // clear screen
        this.canvasContext.fillStyle = "cornsilk";
        this.canvasContext.fillRect(0, 0, this.canvas.width, this.canvas.height);

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
        let currentBarNumber = Math.floor((this.currentTime - this.startTime - this.microphoneInputDelay) / this.secondsPerBar);
        for(let i = 0; i < this.beatsQueue.length; i++){
            let time = this.beatsQueue[i].time;
            let positionInBar = Math.max(0, ((time - this.startTime - this.microphoneInputDelay) % this.secondsPerBar) / this.secondsPerBar);
            let barNumber = Math.floor((time - this.startTime - this.microphoneInputDelay) / this.secondsPerBar);
            let radius = 10;
            let x = positionInBar * barWidth + xmargin;
            let y = this.canvas.height / 5 * 3 - (currentBarNumber - barNumber) * radius * 3;
            
            this.canvasContext.beginPath();
            this.canvasContext.arc(x, y, radius, 0, Math.PI * 2, false);
            this.canvasContext.fill();
        }
    }

    tick() {
        while(this.nextScheduleNoteTime < this.audioContext.currentTime + this.scheduleMargin){
            this.scheduleNote();
        }
    }

    scheduleNote() {
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
            w.clearTimeout(requestId);
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
