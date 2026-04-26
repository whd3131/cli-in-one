const { app } = require('electron');

app.whenReady().then(() => {
  const pty = require('node-pty');
  const shell = process.platform === 'win32'
    ? process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe'
    : process.env.SHELL || '/bin/sh';
  const args = process.platform === 'win32'
    ? ['/C', 'echo cli-in-one-smoke']
    : ['-lc', 'echo cli-in-one-smoke'];
  const term = pty.spawn(shell, args, {
    cols: 80,
    rows: 24,
    cwd: process.cwd(),
    env: process.env
  });

  let output = '';
  const timeout = setTimeout(() => {
    console.error('smoke timed out');
    try {
      term.kill();
    } catch {}
    app.exit(1);
  }, 6000);

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
