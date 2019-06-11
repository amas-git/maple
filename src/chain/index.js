const fs = require('fs');

const SKIP_SET = new Set(['index.js']);
function load(target) {

    let xs = fs.readdirSync(target)
        .filter((x) => !SKIP_SET.has(x) && x.endsWith('.js'))
        .map((name) => {
            return {name, mod:require(`./${name}`) };
        } );
    return xs;
}


function run_chain(chain, ...params) {
    let status = null;
    for (let {_, mod} of chain) {
        status = mod(status, ...params);
    }
}


const chain = load('./src/chain');


run_chain(chain, 1,2,3);

