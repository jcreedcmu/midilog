const fs = require('fs');
const midi = require('midi');
const input = new midi.input();
const format = require('date-format');

format.asString('hh:mm:ss.SSS', new Date());

const DEBUG = false;
const GAP_SEC = 3;

debug(count = input.getPortCount());
for(let i = 0; i < count; i++)
  debug(i + ' ' + input.getPortName(i));
debug('input openPort result:', input.openPort(1));

const output = new midi.output();
count = output.getPortCount();
for(let i = 0; i < count; i++)
  debug(i + ' ' + output.getPortName(i));
debug('output openPort result:', output.openPort(1));

function init_state(time, message) {
  return {times: {chunkStart: time, last: time}, events: [{message, delta: {midi_us: 0, wall_us: 0}}]};
}

let state = undefined;

setInterval(heartbeat, GAP_SEC * 250);

input.on('message', function(deltaTime, message) {

  // a way of detecting whether the server is running by just
  // manipulating the piano keyboard itself; if the intstrument is set
  // to the default instrument, echo a 'hello world' note.
  if (message[0] == 192 && message[1] == 0) {
	 setTimeout(() => { output.sendMessage([144, 36, 32]); }, 0);
	 setTimeout(() => { output.sendMessage([144, 36, 0]); }, 300);
  }

  const now = new Date();
  if (state == undefined) {
	 state = init_state(now, message);
  }
  else {
	 let delta = {midi_us: Math.round(deltaTime * 1e6), wall_ms: now - state.times.last};
	 state.events.push({message, delta});
	 state.times.last = now;
  }
});
input.ignoreTypes(false, false, false);
process.stdin.on('data', function(x) { });

function append(data) {
  events.push(data);
}

function debug(...args) {
  if (DEBUG)
	 console.error(...args);
}

// called every GAP_SEC / 4;
function heartbeat() {
  if (state != undefined && ((new Date() - state.times.last) > GAP_SEC * 1000)) {
	 // ship out a chunk
	 const filename = format.asString('yyyy-MM-dd.json', state.chunkStart);
	 fs.appendFileSync(__dirname + '/log/' + filename, JSON.stringify({start: state.times.chunkStart, events: state.events}) + '\n');
	 state = undefined;
  }
}
