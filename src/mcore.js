const cp = require('child_process');
const fs = require('fs');
const path = require('path');
const _ = require('lodash');
const proc = require('process');
const yaml = require('js-yaml');

const type = function(obj) {
    return ({}).toString.call(obj).match(/\s([a-zA-Z]+)/)[1].toLowerCase();
};


function e(e) {
    console.error(e);
}

function objectFromYamlString(string) {
    return yaml.safeLoad(string);
}

function objectFromYamlFile(file) {
    let o = undefined;
    try {
        o = objectFromYamlFile(fs.readFileSync(file));
    } catch (e) {
        e(e);
    }
    return o;
}
/**
 * 遍历指定的objects
 * @param o
 * @param f
 * @param context
 */
function walk(o, f, path="") {
    function isObject(obj) {
        return (typeof obj === "object" && obj !== null) || typeof obj === "function";
    }

    if((o === null) || Object.keys(o).length === 0 || (typeof o === 'string') || (typeof o === 'number')) {
        return;
    }

    let keys = Object.keys(o);

    for(let k of keys) {
        if(f) {
            let value = Array.isArray(o[k]) ? Object.keys(o[k]).join(":") : o[k];
            if(!isObject(value)) {
                f(`${path}/${k}`, k, value);
            }
        }
        walk(o[k],f,`${path}/${k}`);
    }
}

function exec(cmd, args, input, encoding="utf8") {
    let {status, stdout, stderr} = cp.spawnSync(cmd, args, {input: input, encoding: encoding});
    let r = status === 0 ? stdout : stderr;
    return r;
}

function write(file, data) {
    fs.writeFileSync(file, data, {encoding:'utf8',flag:'w'});
}

function mktree(xs, root=xs[0], level="level", child='nodes') {
    function parentOf(xs, x, anchor) {
        for(let i=anchor-1; i>=0; i--) {
            if(xs[i][level] > x[level]) { // TODO: override with isParent function & export it
                return xs[i];
            }
        }
        return null;
    }

    for(let i=1; i<xs.length; ++i) {
        let p = parentOf(xs, xs[i], i);
        p[child].push(xs[i]);
    }

    //console.error(root);
    return root;
}

function object(maple_path, name) {
    let mpath   = [];
    let scriptd = path.dirname(name);
    if(scriptd) {
        mpath.push(scriptd);
    }
    mpath.push(...maple_path);
    let target = search_target(mpath, path.basename(name));
    return target ? fs.readFileSync(target) : "";
}

/**
 * Search specify target file under CWD, SCRIPT_DIR, MAPLE_PATH
 * @param search_path
 * @param name
 * @returns undefined if not found
 */
function search_target(search_path, name) {
    for (let dir of search_path) {
        let fullpath = path.join(dir, name);
        if (fs.existsSync(fullpath)) {
            return fullpath;
        }
    }
    return undefined;
}

function joinObjects(os) {
    let r = os.reduce((r,e) => { return _.assign(r, e); }, {});
    return r;
}

function convertId(keys=[]) {
    //println(keys, "bind");
    return keys.map((key)=>{
        if(key.match(/\d+/)) {
            return `$${key}`;
        }
        // TODO: support more convertion
        // TODO: when the array keys is large, only keep 9 id
        return key;
    });
}

function mcall(os, code) {
    return new Function(convertId(Object.keys(os)), code).apply(null, Object.values(os));
}

function exeval($os, $code) {
    return mcall(joinObjects($os), `${$code}`);
}

function template(env, template, enabled=true) {
    if(!enabled) {
        return template;
    }
    let $T       = template.replace(/`/g, '\\`');
    return exeval(env.expose(), `return \`${$T}\`;`);
}

function flat(input){
    const stack = [...input];
    const res = [];
    while (stack.length) {
        // pop value from stack
        const next = stack.pop();
        if (Array.isArray(next)) {
            // push back array items, won't modify the original input
            stack.push(...next);
        } else {
            res.push(next);
        }
    }
    //reverse to restore input order
    return res.reverse();
}

function shuffle(xs=[]) {
    return xs.sort(() => { return Math.random() - 0.5; });
}

function push(xs, x) {
    x && xs.push(x);
}

// The most ugly code, FUCK YOU
function parseMEXPR(text) {
    text = text.trim();
    function IS_SPACE(c) {
        return /\s+/.test(c);
    }

    function IS_QUOTE(c) {
        return c === "'" || c === '"' || c === "`";
    }

    if(_.isEmpty(text)) {
        return [["@part"]];
    }

    let ts = [];
    let rs = [];

    if(!text.startsWith('@')) {
        rs.push("@part");
    }


    let qs = null;
    let cword = "";

    for (let c of text) {
        if (IS_SPACE(c)) {
            if (qs) {
                cword += c;
                continue;
            }
            if(cword) {
                rs.push(cword);
                cword = "";
            }
        } else if (IS_QUOTE(c)) {
            if (!qs) {
                qs = c;
                continue;
            }
            if (qs === c) {
                qs = null;
                rs.push(cword);
                cword = "";
                continue;
            }
            cword += c;
        } else if (c === '|') {
            if (qs) {
                cword += c;
                continue;
            }
            ts.push(rs);
            rs=[];
        } else {
            cword += c;
        }
    }

    if (qs) {
        throw `parse ERROR, '${qs}' is mismatch`;
    }
    if (cword) {
        rs.push(cword);
    }
    if (rs.length > 0) {
        ts.push(rs);
    }

    return ts;
}

module.exports = {
    exeval,
    template,
    mktree,
    walk,
    exec,
    flat,
    object,
    type,
    shuffle,
    write,
    push,
    objectFromYamlFile,
    objectFromYamlString,
    mcall,
    parseMEXPR
};