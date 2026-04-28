const { app } = require('electron');
const fs = require('fs');

let term;
const timeout = setTimeout(() => {
  console.error('smoke timed out');
  try {
    term?.kill();
  } catch {}
  app.exit(1);
}, 10000);

function getSmokeShell() {
  if (process.platform === 'win32') {
    return process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe';
  }

  const envShell = typeof process.env.SHELL === 'string'
    ? process.env.SHELL.trim()
    : '';

  if (envShell) {
    try {
      fs.accessSync(envShell, fs.constants.X_OK);
      return envShell;
    } catch {
      // Fall through to a known-good shell.
    }
  }

  const shellCandidates = process.platform === 'darwin'
    ? ['/bin/zsh', '/bin/bash', '/bin/sh']
    : ['/bin/bash', '/bin/sh'];

  for (const candidate of shellCandidates) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }

  return '/bin/sh';
}

app.whenReady().then(() => {
  const pty = require('node-pty');
  const shell = getSmokeShell();
  const args = process.platform === 'win32'
    ? ['/C', 'echo cli-in-one-smoke']
    : ['-lc', 'echo cli-in-one-smoke'];
  try {
    term = pty.spawn(shell, args, {
      cols: 80,
      rows: 24,
      cwd: process.cwd(),
      env: process.env
    });
  } catch (error) {
    clearTimeout(timeout);
    console.error(`smoke spawn failed: shell=${shell} error=${error.message}`);
    app.exit(1);
    return;
  }

  let output = '';

  term.onData((data) => {
    output += data;
  });

  term.onExit(({ exitCode }) => {
    clearTimeout(timeout);
    if (exitCode === 0 && output.includes('cli-in-one-smoke')) {
      console.log('electron smoke ok');
      app.exit(0);
    } else {
      console.error(`smoke failed: exit=${exitCode} output=${JSON.stringify(output)}`);
      app.exit(1);
    }
  });
});
