const Path = require('path');
const Chalk = require('chalk');
const FileSystem = require('fs');
const Vite = require('vite');
const compileTs = require('./private/tsc');

function buildRenderer() {
    return Vite.build({
        configFile: Path.join(__dirname, '..', 'vite.config.mjs'),
        base: './',
        mode: 'production'
    });
}

function buildMain() {
    const mainPath = Path.join(__dirname, '..', 'src', 'main');
    return compileTs(mainPath);
}

FileSystem.rmSync(Path.join(__dirname, '..', 'build'), {
    recursive: true,
    force: true,
})

console.log(Chalk.blueBright('Transpiling renderer & main...'));

Promise.allSettled([
    buildRenderer(),
    buildMain(),
]).then(results => {
    const failures = results.filter(result => result.status === 'rejected');
    if (failures.length) {
        for (const failure of failures) {
            console.error(Chalk.redBright('Build failed:'), failure.reason);
        }
        process.exitCode = 1;
    } else {
        console.log(Chalk.greenBright('Renderer & main successfully transpiled! (ready to be built with electron-builder)'));
    }
});
