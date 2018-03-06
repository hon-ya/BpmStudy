let intervalId;

self.onmessage = function(e) {
    if (e.data.command == "start") {
        intervalId = setInterval(function(){
            postMessage({ command:"tick"});
        }, e.data.interval);
    } 
    else if (e.data.command == "stop") {
        clearInterval(intervalId);
    }
}
