const log = (msg, isError = false) => {
  console.log('got msg: ', msg);
  instruction(msg);

  let pre = document.createElement('pre');
  if (isError) {
    pre.classList.add('error');
  }
  pre.innerText = msg;

  document.querySelector('#log').appendChild(pre)
};

const instruction = msg => {
  let instruction = document.querySelector('.js-instruction');
  instruction.innerText = msg;
};

const dd = {
  props: {
    logselector: '#log',
    tableselector: '.js-datatable'
  },

  clearLog: () => {
    [dd.props.logselector, dd.props.tableselector]
      .forEach(select => document.querySelector(select).innerHTML = '');
  },

  tabulateData: () => {
    dd.clearLog();
    document.querySelector(dd.props.tableselector).innerHTML = Store.asHTML();
  }

};


const scanState = {
  module: 'scanState',
  seq: null,
  id: null,
  name: null,
  lastScan: null,

  started: () => !!(scanState.seq || scanState.id || scanState.name),

  complete: () => !!(scanState.seq && scanState.id && scanState.name),

  reset: () => {
    scanState.seq = null;
    scanState.id = null;
    scanState.name = null;
    document.querySelector('.js-scan-started').classList.remove('background-light-red');
  },

  render: () => {
    [...document.querySelectorAll('.js-scan-name')].forEach(e => e.value = scanState.name);
    [...document.querySelectorAll('.js-scan-id')].forEach(e => e.value = scanState.id);
    [...document.querySelectorAll('.js-scan-seq')].forEach(e => e.value = scanState.seq);
  },

  capture: () => {
    let scan = {
      seq: scanState.seq,
      name: scanState.name,
      id: scanState.id,
      timestamp: new Date().toISOString()
    };
    Store.addScan(scan);

    scanState.lastScan = `(${scan.seq}) ${scan.name}`;

    log(`Scan captured: (${scan.seq}) ${scan.name}`);

    scanState.reset();
  },

  onScan: (content) => {
    Optics.stopScan();
    Journal.capture('onScan.content', content);

    navigator.vibrate(50);

    let scanResult = scanState.handlers
      .filter(h => h.test(content))
      .map(h => [h.name, h.fn(content)])
      .filter(x => x);

    if (scanResult.length === 0) {
      Journal.capture('onScan.no-scan-result', content);

      let colAct = {
        ['background-light-red']: 'add',
        ['background-light-green']: 'remove'
      };

      Object.keys(colAct).forEach(key => {
        document.querySelector('.js-scan-started').classList[colAct[key]](key)
      });

      UI.showDisplays(UI.scene.scanStarted);

      log(`No scan result! Got: ${content}`, true);
      document.dispatchEvent(new CustomEvent('doSpeak', {detail: `Oh dear! Issue capturing input: ${content}`}));
      navigator.vibrate([100, 50, 100, 50, 100]);
    } else {
      document.querySelector('.js-scan-started').classList.remove('background-light-red');
      log(scanResult);
    }

    if (scanState.complete()) {
      scanState.render();
      // capture scan
      scanState.capture();
      UI.showDisplays(UI.scene.scanComplete);

      document.dispatchEvent(new CustomEvent('doSpeak', {detail: `Just captured: ${scanState.lastScan}`}))

      let msg = `Just captured: ${scanState.lastScan}\nNext: Scan user or sequence token.`;

      document.querySelector('.js-scan-started').classList.remove('background-light-red');
      instruction(msg);
      navigator.vibrate(400);
    }

    if (scanState.started()) {
      UI.showDisplays(UI.scene.scanStarted);
      scanState.render();
    }
  },

  handlers: [{
    name: 'Set Session',
    test: function (x = '') {
      return x.match(/\[cmd:session:(\d{4}-\d{2}-\d{2})\]/);
    },
    fn: function (content) {
      let result = this.test(content);
      console.info('set session result: ', result);
      if (result[1]) {
        Store.saveSessionId(result[1]);
        instruction(`session set from scan: ${result[1]}`);
        location.reload(false);
        return true;
      }
      return false;
    }
  },

    {
      name: 'Capture user token',
      test: function (x = '') {
        return x.match(/^([\w\ \-'`]+){1}:(.+){1}$/);
      },
      fn: function (content) {
        let result = this.test(content);
        // if (!result) {
        //   console.warn('failed to test content: ', content);
        // }
        if (result[1] && result[2]) {
          scanState.id = result[2];
          scanState.name = result[1];
          return scanState.name;
        }
        return false;
      }
    },

    {
      name: 'Capture sequence token',
      test: function (x = '') {
        return x.match(/^(\d+)$/);
      },
      fn: function (content) {
        let result = this.test(content);
        if (result[1]) {
          scanState.seq = Number(result[1]);
          return scanState.seq;
        }
        return false;
      }
    },

    {
      name: 'Toast',
      test: function (x = '') {
        return x.match(/\[cmd:toast:(.+)\]/);
      },
      fn: function (content) {
        let result = this.test(content);
        console.info('toast result: ', result);
        if (result[1]) {
          Toast.show(result[1]);
          return result[1];
        }
        return false;
      }
    },

    {
      name: 'Lap: ping',
      test: function (x = '') {
        return x.match(/\[cmd:lap:ping\]/);
      },
      fn: function (content) {
        if (this.test(content)) {
          // capture lap timestamp
          return true;
        }
        return false;
      }
    }
  ]
};


window.addEventListener('load', () => {

  Optics.scanner = new Instascan.Scanner({
    video: document.getElementById('preview'),
    mirror: false
  });
  Optics.scanner.addListener('scan', scanState.onScan);

  let camSelect = document.querySelector('select.js-camera-options');
  camSelect.addEventListener('change', e => {
    console.info('camera changed', e);
    let targetCamera = e.target.value;

    Optics.selectCamera(targetCamera);
  });

  Instascan.Camera.getCameras()
    .then(cameras => {
      cameras.forEach(camera => {
        let camOption = document.createElement('option');
        camOption.value = camera.id;
        camOption.text = camera.name || 'no name';
        camSelect.appendChild(camOption);
      });

      console.info('cameraid: ', Store.getCameraId());

      if (Store.getCameraId()) {
        camSelect.value = Store.getCameraId();
        Optics.selectCamera(Store.getCameraId());
      }
      instruction('Scan user or sequence token.')
    });

  Toast.hookup('.js-toast');

  let sessionDisplay = document.querySelector('[data-session-display]');
  sessionDisplay.innerText = Store.currentSession();

  let sessionSelect = document.querySelector('[data-date]');
  sessionSelect.value = Store.currentSession();
  console.info('attaching event listener to sessionSelect: ', sessionSelect);
  sessionSelect.addEventListener('input', e => {
    let session = (e.target.value || Store.maidenSession);
    instruction(`Session changed: ${session}`);
    sessionDisplay.innerText = session;
    Store.saveSessionId(session);
    UI.toggleNav(e);
  });

  Timer.resume();
  setTimeout(() => window.speechSynthesis.speak(new SpeechSynthesisUtterance("Tie your laces and get set!")), 1000)
});

document.addEventListener('doSpeak', e => {
  if (e.detail) {
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(e.detail));
  }
});

document.addEventListener('click', e => {

  if (e.target.dataset.action === 'make-cmd') {
    let cmd = e.target.dataset.cmd;

    const cmds = {
      toast: (dataset = {}) => `[cmd:toast:${dataset.text ? dataset.text : '<text>'}]`,

      ['sync-session']: (dataset = {}) => `[cmd:session:${Store.currentSession()}]`
    };

    let cmdfn = cmds[cmd];
    if (cmdfn) {
      let cmdtext = cmdfn(e.target.dataset);
      qrinput.value = cmdtext;
      QR.makeCode(cmdtext, {qrid: 'qr-generate'});
    }
  }
});
