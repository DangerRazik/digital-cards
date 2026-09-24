const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const children = [];
let stopping = false;

function stop(code = 0) {
  if (stopping) {
    return;
  }

  stopping = true;

  for (const child of children) {
    if (child.exitCode !== null || child.signalCode !== null) {
      continue;
    }

    if (process.platform === 'win32') {
      // На Windows завершаем также дочерние процессы сборщика этого приложения.
      spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
        stdio: 'ignore',
        windowsHide: true,
      });
    } else {
      child.kill('SIGTERM');
    }
  }

  process.exitCode = code;
}

function run(folder, argumentsList) {
  const child = spawn(process.execPath, argumentsList, {
    cwd: path.join(root, folder),
    stdio: 'inherit',
    windowsHide: true,
  });

  children.push(child);

  child.on('error', error => {
    console.error(error.message);
    stop(1);
  });

  child.on('exit', code => {
    if (!stopping) {
      stop(code || 0);
    }
  });
}

process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());

run('backend', ['--env-file=.env', 'dist/main.js']);
run('public-web', [
  'node_modules/@angular/cli/bin/ng.js',
  'serve',
  '--host',
  '127.0.0.1',
  '--port',
  '4200',
]);

run('admin-web', [
  'node_modules/@angular/cli/bin/ng.js',
  'serve',
  '--host',
  '127.0.0.1',
  '--port',
  '4201',
]);

console.log('Личный кабинет: http://127.0.0.1:4201');
console.log('Публичную ссылку визитки можно открыть из личного кабинета.');
console.log('Ctrl+C остановит приложения. Остановка базы: .\\stop-db.ps1');
