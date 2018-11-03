#!/usr/bin/env node
'use strict';
const program = require('commander');
const {run_maple} = require('../src/maple');
const $package = require('../package');

program
    .version($package.version)
    .description($package.description);

// run
program.command('run')
    .alias('r')
    .description('run <script>')
    .action((script) => {
        run_maple(script);
    });

program.parse(process.argv);

function cmd_run(name) {
    console.log(`${name}`);
}
