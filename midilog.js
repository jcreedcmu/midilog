const fs = require('fs');
const midi = require('midi');
const format = require('date-format');
const spawn = require('child_process').spawn;

const DEBUG = true;
const GAP_SEC = 10;
const LOW_NOTE = 36;
const HIGH_NOTE = 60;

const input = new midi.input();
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
  debug(JSON.stringify({message, deltaTime}));
  // ignore these messages
  if (message[0] == 176 && message[1] == 0) return;
  if (message[0] == 176 && message[1] == 32) return;

  if (message[0] == 192) {
	 // a way of detecting whether the server is running by just
	 // manipulating the piano keyboard itself; if the intstrument is set
	 // to the default instrument, try to git push, and echo a 'hello world' note.
	 if (message[1] == 0) {
		if (state != undefined) {
		  ship_out();
		}
		debug('Pushing upstream...');
		const shell = spawn(__dirname + '/push.sh', []);
		shell.stdout.on('data', data =>  console.log(data.toString()));
		shell.stderr.on('data', data =>  console.error(data.toString()));
		shell.on('exit', code => {
		  console.log('child process exited with code ' + code.toString());
		  play((code == 0) ? LOW_NOTE : HIGH_NOTE);
		});
	 }
	 return;
  }

  // Most stuff ends up here
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
	 ship_out();
  }
}

function ship_out() {
  // ship out a chunk. Precondition: state should not be undefined if you're calling this.
  const filename = format.asString('yyyy-MM-dd.json', state.chunkStart);
  fs.appendFileSync(__dirname + '/log/' + filename, JSON.stringify({start: state.times.chunkStart, events: state.events}) + '\n');

  state = undefined;
}

function play(note) {
  setTimeout(() => { output.sendMessage([144, note, 32]); }, 0);
  setTimeout(() => { output.sendMessage([144, note, 0]); }, 300);
}

debug('Listening...');
