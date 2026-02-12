# midilog

I wanted a low-stakes way of recording from my midi keyboard and making
it easy to go back over historical recordings and tag bits I like and filter out bits I don't like.

`old-commandline-tool/midilog.js` was the oldest version of this code, using some midi node module

The stuff now in the toplevel directory uses the web midi api.

The soundfont in `soundfont/gm-good.sf3` is what I got by running `sf3convert`
  on [Arachno_SoundFont_Version_1.0.sf2](https://archive.org/download/free-soundfonts-sf2-2019-04/Arachno_SoundFont_Version_1.0.sf2) which was linked from [this reddit thread](https://www.reddit.com/r/midi/comments/pmh94q/whats_the_best_allaround_soundfont/)
  (I also tried [Jnsgm.sf2](https://archive.org/download/free-soundfonts-sf2-2019-04/Jnsgm.sf2) which was ok)
