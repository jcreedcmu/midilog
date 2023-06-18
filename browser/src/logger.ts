function getInput(midi: WebMidi.MIDIAccess): WebMidi.MIDIInput {
  for (const input of midi.inputs.entries()) {
    const name = input[1].name;
    if (name !== undefined && name.match(/Turtle Beach/)) {
      return input[1];
    }
  }
  throw 'input not found';
}

function delay(ms: number): Promise<void> {
  return new Promise((res, rej) => {
    setTimeout(() => { res(); }, ms);
  });
}

function getOutput(midi: WebMidi.MIDIAccess): WebMidi.MIDIOutput {
  for (const output of midi.outputs.entries()) {
    const name = output[1].name;
    if (name !== undefined && name.match(/Turtle Beach/)) {
      return output[1];
    }
  }
  throw 'output not found';
}


async function go() {
  document.write('ok here<br>');
  try {
    const midi = await navigator.requestMIDIAccess();
    document.write(`success <br>`);
    const input = getInput(midi);
    const output = getOutput(midi);
    input.addEventListener('midimessage', e => {
      console.log(e);
      console.log(e.data);
      console.log(e.timeStamp);
    });
    const t = window.performance.now();
    output.send([144, 60, 46], t + 1000);
    output.send([144, 60, 0], t + 1200);
  }
  catch (e) {
    document.write(`error: ${e} <br>`);
  }
}

go();
