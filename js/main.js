class App {
    constructor(container) {
        this.container = container;
        
        // create canvas
        this.canvas = document.createElement('canvas');
        this.canvas.width = window.innerWidth; 
        this.canvas.height = window.innerHeight;
        this.container.appendChild(this.canvas);
        this.canvasContext = this.canvas.getContext( '2d' );

        // register size change event
        let self = this;
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
        this.audioContext = new AudioContext();
        
        // initialize application settings
        this.bpm = 80;  // beats per seconds
        this.quaterNoteCount = 4;
        this.quaterNoteDivision = 2;
        this.noteSoundLength = 0.05;
        this.totalNoteCount = this.quaterNoteCount * this.quaterNoteDivision;
        this.secondsPerNote = 60 / this.bpm / this.quaterNoteDivision;
        this.scheduleMargin = 0.1;  // seconds
        this.notesQueue = [];
        this.isPlaying = false;
        
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
    }

    start() {
        if(this.isPlaying){
            return;
        }
        this.isPlaying = true;

        this.currentNote = 0;
        this.nextScheduleNote = 0;
        this.nextScheduleNoteTime = this.audioContext.currentTime + this.secondsPerNote;
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

    calc() {
    }

    draw() {
        while(this.notesQueue.length > 0 && this.notesQueue[0].time < this.audioContext.currentTime){
            this.currentNote = this.notesQueue[0].note;
            this.notesQueue.splice(0, 1);
        }

        // clear screen
        this.canvasContext.fillStyle = "cornsilk";
        this.canvasContext.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // draw bpm
        this.canvasContext.fillStyle = "black";
        this.canvasContext.font = `${this.canvas.height / 3}px Meyro`;
        this.canvasContext.textBaseline = "middle"; 
        this.canvasContext.textAlign = "center";
        this.canvasContext.fillText(`${this.bpm}`, this.canvas.width / 2, this.canvas.height / 3);

        // draw notes
        let xunit = this.canvas.width / (this.totalNoteCount + 1);
        let x = xunit;
        let y = this.canvas.height / 4 * 3;
        for(let i = 0; i < this.totalNoteCount; i++) {
            let radius = 20;
            if(i % this.quaterNoteDivision == 0) {
                radius *= 2;
            }

            this.canvasContext.beginPath();
            this.canvasContext.arc(x + xunit * i, y, radius, 0, Math.PI * 2, false);
            if(i == this.currentNote) {
                this.canvasContext.fillStyle = "black";
                this.canvasContext.fill();
            }
            else {
                this.canvasContext.stroke();
            }
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

        this.notesQueue.push({ note: this.nextScheduleNote, time: this.nextScheduleNoteTime });
        
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
    let app = new App(container);
}
