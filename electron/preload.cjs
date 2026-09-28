// Bridge between the sandboxed game page and the desktop shell.
// Steam features (achievements, rich presence) will be exposed here.
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  platform: process.platform,
});
