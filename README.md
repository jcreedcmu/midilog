# midilog

This is an attempt to make some very light-weight, convenient way of
recording and playing back midi from a keyboard.

- `midilog.js` is the oldest attempt, using some midi node module

- The stuff in `browser/` is an attempt to use the web midi api. I was
  thinking I might be able to deploy this on my phone, even. That way
  I might be able to throw some controls on the screen. They'd be
  easier to reach for given the way my office is laid out right now
  --- the computer is not right next to the keyboard.

- the soundfont in `soundfont/gm-good.sf3` is what I got by running `sf3convert`
  on [Arachno_SoundFont_Version_1.0.sf2](https://archive.org/download/free-soundfonts-sf2-2019-04/Arachno_SoundFont_Version_1.0.sf2) which was linked from [this reddit thread](https://www.reddit.com/r/midi/comments/pmh94q/whats_the_best_allaround_soundfont/)
  (I also tried [Jnsgm.sf2](https://archive.org/download/free-soundfonts-sf2-2019-04/Jnsgm.sf2) which was ok)
