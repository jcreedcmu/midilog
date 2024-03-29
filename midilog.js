const fs = require('fs');
const midi = require('midi');
const format = require('date-format');
const spawn = require('child_process').spawn;
const nt = require('nanotimer');

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
  return {times: {chunkStart: time, last: time}, events: [{message, delta: {midi_us: 0, wall_ms: 0}}]};
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
  const now = Date.now();
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
process.stdin.on('data', function(x) {
  const s = x.toString();
  let m = s.match('^play (.*) (.*)');
  if (m) {
	 playback(m[1], m[2]);
  }
});

function append(data) {
  events.push(data);
}

function debug(...args) {
  if (DEBUG)
	 console.error(...args);
}

// called every GAP_SEC / 4;
function heartbeat() {

  debug(`heartbeat. state: ${state==undefined?'undefined':'defined'}`);
  if (state == undefined) {
    return;
  }
  const gap = ((Date.now() - state.times.last) - GAP_SEC * 1000);
  debug(`   gap excess: ${gap}`);
  if (state != undefined && gap > 0) {
	 ship_out();
  }
}

function ship_out() {
  console.log("shipping out...");
  // ship out a chunk. Precondition: state should not be undefined if you're calling this.
  const filename = format.asString('yyyy-MM-dd.json', state.chunkStart);
  console.log(`filename: ${filename}`);
  fs.appendFileSync(__dirname + '/log/' + filename, JSON.stringify({start: state.times.chunkStart, events: state.events}) + '\n');

  state = undefined;
}

function play(note) {
  setTimeout(() => { output.sendMessage([144, note, 32]); }, 0);
  setTimeout(() => { output.sendMessage([144, note, 0]); }, 300);
}

debug('Listening...');

function playback(date, index) {
  const data = JSON.parse(fs.readFileSync(__dirname + '/log/' + date + '.json', 'utf8').split('\n')[index]);
  playback_chunk(0, data.events);
}

function playback_chunk(ix, events) {
  if (ix < events.length) {
	 debug(events[ix]);
	 output.sendMessage(events[ix].message);
	 const timer = new nt();
	 if (ix < events.length - 1) {
		const delay = Math.floor(1 * events[ix + 1].delta.midi_us);
		timer.setTimeout(() => playback_chunk(ix + 1, events), [], delay + 'u');
	 }
  }
}


// play 2017-12-17 3
