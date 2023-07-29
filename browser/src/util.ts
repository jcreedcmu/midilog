export async function getText(url: string): Promise<string> {
  const resp = await fetch(new Request(url));
  return await resp.text();
}

export function unreachable(v: never): void { }

export function allNotesOff(output: WebMidi.MIDIOutput, channel: number = 0) {
  // Got these values from
  // https://www.cs.cmu.edu/~music/cmsip/readings/MIDI%20tutorial%20for%20programmers.html
  output.send([176 + channel, 121, 0]); // all controllers off, specifically turn pedal off
  output.send([176 + channel, 123, 0]); // turn all notes off
}
