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

const chain = load('./src/chain');

for (let {_, mod} of chain) {
    mod(1,2);
}

