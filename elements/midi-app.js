Polymer('midi-app', {

  file: null,

  fileName: '',
  songTitle: '',

  created: function() {
    var me = this;

    window.addEventListener('keypress', function(e) {
      switch (e.keyCode) {
        case 32:
          me.$.playbar.onPlayPause();
          break;
        default:
          break;
      }
    });
  },

  fileChanged: function(oldFile, newFile) {
    var me = this;
    var playbar = this.$.playbar;

    if (newFile) {
      newFile.file(function(file) {
        var reader = new FileReader();

        reader.onloadend = function(e) {
          var data = this.result;

          playbar.player = MIDI.Player;
          playbar.loadMidi(data);

          me.loadFile(newFile.name, data);
          me.loadInstruments();
        };

        reader.readAsBinaryString(file);
      });
    }
    else {
      playbar.player.stop();
      playbar.player = null;
    }
  },

  loadFile: function(filename, data) {
    this.fileName = filename;
    this.parseMetadata();

    MIDI.loader.message('File loaded.');
  },

  parseMetadata: function() {
    var data = MIDI.Player.data;
    var event;

    for (var i = 0; i < data.length; i++) {
      event = data[i][0].event;

      if (event.type === 'meta' && event.subtype === 'trackName') {
        this.songTitle = event.text;
        return;
      }
    }
  },

  loadInstruments: function() {
    var playbar = this.$.playbar;
    var data = playbar.player.data;
    var results = [];

    for (var i = 0; i < data.length; i++) {
      event = data[i][0].event;

      if (event.subtype === 'programChange') {
        results.push(
          MIDI.GeneralMIDI.byId[event.programNumber].id
        );
      }
    }

    if (results.length === 0) {
      // If no instrument is specified, default to program #0 (grand piano).
      results.push(MIDI.GeneralMIDI.byId[0].id);
    }

    var queue = this.createQueue({
      items: results,

      getNext: function(instrumentId) {
        if (MIDI.Soundfont[instrumentId]) {
          // already loaded, so just skip ahead
          return queue.getNext();
        }

        MIDI.loader.message('Loading instrument: ' + instrumentId);

        var req = new XMLHttpRequest();
        var url = 'bower_components/midi/soundfont/' + instrumentId + '-ogg.json';

        req.overrideMimeType("application/json");
        req.open('GET', url, true);

        req.onload = function() {
          MIDI.Soundfont[instrumentId] = JSON.parse(req.responseText);
          queue.getNext();
        };

        req.send(null);
      },

      onComplete: function() {
        MIDI.WebAudio.connect({
          callback: function() {
            MIDI.loader.message('Player loaded.');
          }
        });
      }
    });
  },

  setVolume: function(event) {
    if (MIDI.setVolume) {
      // Channel number -1 is a special value used to
      // indicate that the volume specified is the
      // master volume to be applied over all channels.
      MIDI.setVolume(-1, 127 * event.detail.volume / 100);
    }
  },

  chooseFile: function() {
    var me = this;

    chrome.fileSystem.chooseEntry(
      {
        accepts: [
          {
            description: 'MIDI files',
            mimeTypes: [
              "application/x-midi",
              "audio/midi"
            ],
            extensions: [
              "mid",
              "midi"
            ],
          }
        ],
        acceptsAllTypes: false
      },
      function(entry, entries) {
        me.file = entry;
      }
    );
  },

  createQueue: function(conf) {
    var self = {};
    self.queue = [];

    for (var key in conf.items) {
      if (conf.items.hasOwnProperty(key)) {
        self.queue.push(conf.items[key]);
      }
    }

    self.getNext = function() {
      if (!self.queue.length) {
        return conf.onComplete();
      }

      conf.getNext(self.queue.shift());
    };

    setTimeout(self.getNext, 1);

    return self;
  },

  closeFile: function() {
    this.file = null;
  }
});