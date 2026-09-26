'use strict';
// Desktop bridge: the kit builds window.api from this app's bridge-shape over Electron IPC.
require('../kit/electron/preload').expose(require('./renderer/bridge-shape.js'), 'api');
