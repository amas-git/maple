#!/usr/bin/env node
'use strict';
const program = require('commander');
const M = require('../src/maple');
const $package = require('../package');
const fs = require('fs');
const stdin = require('get-stdin-with-tty');
const mcore  = require('../src/mcore');


function error(message) {
    console.error(`[ERROR] : ${message}`);
}

program
    .version($package.version)
    .description($package.description)
    .option('-s,--seed <path>', 'Run with specify seed')
    .option('-S,--noseed',      'Run without seed');

// run
program.command('run')
    .alias('r')
    .description('run <script>')
    .action(async (script, cmd) => {
        let seed = undefined;
        if(!program.noseed) {
            if (program.seed) {
                seed = M.fromFile(program.seed);
            } else {
                seed = M.fromText(await stdin());
            }
        }

        let target = M.searchMaple(script);
        console.log(`${target}`);
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

(async()=> {
    stdin.tty = process.stdin.isTTY;
    program.parse(process.argv);
    // read the seed
    if(program.seed) {

        //console.log(`${program.seed}`)
    }
    // let input = await stdin();
    // let maple = M.fromText(input);
    // console.log(maple.text());
})();

/*
 maple run -s seed.mp xxx

 cat seed | maple run xxx


        let input = "";
        if(cmd.file) {
            input = fs.readFileSync(cmd.file);
        } else {
            if(!cmd.noseed) {
                stdin.tty = process.stdin.isTTY;
                input = await stdin();
            }
        }

        let seed  = mcore.objectFromYamlString(input);
        M.run_maple(script, seed);
 */
