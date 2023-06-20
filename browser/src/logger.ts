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

type SongEvent = {
  message: number[],
  delta: {
    midi_us: number,
    wall_us: number,
  }
}

type Song = {
  start: string, // date
  events: SongEvent[],
};

async function getText(url: string): Promise<string> {
  const resp = await fetch(new Request(url));
  return await resp.text();
}

type Index = { file: string, lines: number }[];

function htmlOfIndex(index: Index): { html: string, bindings: { id: string, file: string, ix: number }[] } {
  let rv = '';
  rv += '<table>';
  const bindings: { id: string, file: string, ix: number }[] = [];
  index.forEach((row, rix) => {
    rv += '<tr>';
    rv += `<td>${row.file}</td>`;
    for (let i = 0; i < row.lines; i++) {
      const id = `link_${rix}_${i}`;
      bindings.push({ id, file: row.file, ix: i });
      rv += `<td><a id="${id}" href="#">${i}</a></td>`;
    }
    rv += '</tr>';
  });
  rv += '</table>';
  return { html: rv, bindings };
}

async function go() {
  try {

    const midi = await navigator.requestMIDIAccess({ sysex: true });
    const input = getInput(midi);
    const output = getOutput(midi);

    console.log(`success`);
    const ijson = await getText('/logIndex.json');
    console.log(ijson);
    const index: Index = JSON.parse(ijson);
    const { html, bindings } = htmlOfIndex(index);
    document.getElementById('index')!.innerHTML = html;


    bindings.forEach(({ id, file, ix }) => {
      const link = document.getElementById(id)!;
      link.onclick = async (e) => {
        console.log(file, ix);
        const lines = (await getText(`/log/${file}`)).split('\n');
        const song: Song = JSON.parse(lines[ix]);
        const t = window.performance.now();
        let tp = t;
        song.events.forEach(event => {
          tp += event.delta.midi_us / 1000;
          output.send(event.message, tp);
        });

      }
    });

    input.addEventListener('midimessage', e => {
      console.log(e);
      console.log(e.data);
      console.log(e.timeStamp);
    });
  }
  catch (e) {
    console.log(e);
    console.log(`error: ${e} <br>`);
  }
}

go();
