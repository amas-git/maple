#!/usr/bin/env node
'use strict';
const program = require('commander');
const maple = require('../src/maple');
const $package = require('../package');
const fs = require('fs');
const stdin = require('get-stdin-with-tty');
const mcore  = require('../src/mcore');


function error(message) {
    console.error(`[ERROR] : ${message}`);
}

program
    .version($package.version)
    .description($package.description);

// run
program.command('run')
    .alias('r')
    .option('-f,--file <path>','The input seed file, treat as yaml by default')
    .option('-t,--test', 'Run in test mode, use seed in target script')
    .description('run <script>')
    .action(async (script, cmd) => {

        let input = "";
        if(cmd.file) {
            input = fs.readFileSync(cmd.file);
        } else {
            if(!cmd.test) {
                stdin.tty = process.stdin.isTTY;
                input = await stdin();
            }
        }

        let seed  = mcore.objectFromYamlString(input);
        maple.run_maple(script, seed);
    });

program.command('seed')
    .alias('s')
    .description('show seed of <script>')
    .action((script) => {
        let seed = maple.getSeed(script);
        console.log(seed);
    });

program.command('edit')
    .alias('e')
    .description('edit <script> file')
    .action((script) => {

        let c = fs.readFileSync(process.stdin.fd);
        console.log(c.toString());
    });

program.parse(process.argv);
