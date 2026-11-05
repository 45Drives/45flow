const ChildProcess = require('child_process');
const Chalk = require('chalk');

function compile(directory) {
  console.log("compileDir:", directory);

  return new Promise((resolve, reject) => {
    const tscProcess = ChildProcess.spawn(process.execPath, [require.resolve('typescript/bin/tsc')], {
      cwd: directory,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Handle stdout
    tscProcess.stdout.on('data', data => {
      process.stdout.write(Chalk.yellowBright(`[tsc] `) + Chalk.white(data.toString()));
    });

    // Handle stderr
    tscProcess.stderr.on('data', data => {
      process.stderr.write(Chalk.red(`[tsc ERROR] `) + Chalk.white(data.toString()));
    });

    // Handle process errors
    tscProcess.on('error', (err) => {
      console.error(Chalk.red('Error starting the process:', err));
      reject(err);
    });

    // Wait for process completion and drained output before settling the build.
    tscProcess.on('close', (exitCode, signal) => {
      if (exitCode !== 0) {
        const reason = signal ? `signal: ${signal}` : `exit code: ${exitCode}`;
        console.log(Chalk.red(`TypeScript compilation failed with ${reason}`));
        reject(new Error(`TypeScript compilation failed with ${reason}`));
      } else {
        console.log(Chalk.green('TypeScript compilation completed successfully.'));
        resolve();
      }
    });
  });
}

module.exports = compile;
