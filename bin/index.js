#!/usr/bin/env node
'use strict';
const _ = require('lodash');
const program = require('commander');
const MP = require('../src/maple');
const $package = require('../package');
const fs = require('fs');
const stdin = require('get-stdin-with-tty');
const mcore  = require('../src/mcore');


function error(message) {
    console.error(`[ERROR] : ${message}`);
}

program
    .version($package.version)
    .description(`version: ${$package.version}\n${$package.description}`);
//    .option('-s,--seed <path>', 'Run with specify seed')
//    .option('-S,--noseed',      'Run without seed');

// run
program.command('run')
    .alias('r')
    .description('run <script>')
    .action(async (script, cmd) => {
        let maple = _.isString(script) ? MP.fromFile(MP.searchMaple(script)) : MP.fromText(await stdin());
        if (maple == undefined) {
            error(`script not found: '${script}'`)
            return
        }
        console.log(await maple.text());
    });

program.command('seed')
    .alias('s')
    .description('show seed of <script>')
    .action((script) => {
        let seed = MP.getSeed(script);
        console.log(seed);
    });

program.command('edit')
    .alias('e')
    .description('edit <script> file')
    .action((script) => {
        console.log(MP.searchMaple(script));
    });

(async()=> {
    stdin.tty = process.stdin.isTTY;
    program.parse(process.argv);
})();