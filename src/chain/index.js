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

/**
 * 测试输入是否匹配
 * @param {*} mod 
 * @param {*} event 
 * @param  {...any} params 
 */
async function matched(mod, event, ...params) {
    if (Array.isArray(mod.type)) {
        return new Set(mod.type).has(event.type);
    } else if (mod.matched && typeof mod.matched === 'function') {
        return mod.matched(event, ...params);
    }

    return false;
}

async function run_chain(chain, ...params) {
    let rs = {};
    for (let {_, mod} of chain) {
        if (await matched(mod, ...params)) {
            rs[mod.name] = await mod.process(...params);
        }
    }
    return rs;
}


const chain = load('./src/chain');


console.log(run_chain(chain, 1,2,3));

