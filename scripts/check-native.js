const path = require('path');

try {
  require('node-pty');
  console.log('node-pty native module is available.');
} catch (error) {
  console.warn('');
  console.warn('node-pty could not be loaded yet. The app can still start with a pipe-based fallback,');
  console.warn('but ConPTY-backed terminals need node-pty to build successfully on Windows.');
  console.warn(`Reason: ${error.message}`);
  console.warn(`Project: ${path.resolve(__dirname, '..')}`);
  console.warn('');
}
