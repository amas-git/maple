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

/**
 * TODO:
 * 1. name:tag
 * 2. search name:tag
 * 3. if dir, load main.mp
 * 4. if file, load name:tag.mp founded
 * @param maple_path
 * @param name
 * @returns {string}
 */
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

/**
 * @param os the context objects
 * @param code the code to be eval
 * @param thisArg this object
 * @returns {*} the eval result
 */
function mcall(os, code, thisArg = null) {
    return new Function(convertId(Object.keys(os)), code).apply(thisArg, Object.values(os));
}

function exeval($os, $code, thisArg = null) {
    return mcall(joinObjects($os), `${$code}`, thisArg);
}

/***
 * eval the template string
 * @param env Maple object
 * @param template the template strings
 * @param enabled eval template or not (default tue)
 * @param thisArg bind thisArg object when eval template
 * @returns {*} the eval result
 */
function template(env, template, enabled=true, thisArg = null) {
    if(!enabled) {
        return template;
    }
    let $T       = template.replace(/`/g, '\\`');
    return exeval(env.expose(), `return \`${$T}\`;`, thisArg);
}

/**
 * FIXEME: 这个函数有可能导致内存耗尽
 * @param input
 * @returns {*[]}
 */
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


/**
 * n
 * n.mp
 * n/main.mp
 *
 * maple run n
 * maple run n
 * maple run n/m:1.2.1
 * @param mp_path
 */
function search_mp(mp_path, target="main") {
    let base = "";
    let norm = path.normalize(target);
    if(fs.existsSync(norm)){
        return norm;
    }

    if(target.startsWith("/")) {
        base   = path.dirname(norm);
        target = path.basename(norm);
    }

    if (target.endsWith('.mp')) {
        target = target.replace(/.mp$/,'');
    }


    let r = "";
    for(mpath of [base,...mp_path]) {
        let mdir  = path.join(mpath,`${target}`);
        let mfile = path.join(mpath,`${target}.mp`);

        // target.mp
        if(fs.existsSync(mfile)) {
            r = mfile.toString();
            break;
        }

        // target
        if(fs.existsSync(mdir) && fs.lstatSync(mdir).isDirectory()) {
            let main = path.join(mdir,"main.mp");
            if(fs.existsSync(main) && fs.lstatSync(main).isFile()) {
                r = main.toString();
                break;
            }
        }
    }
    return r;
}



function parse(text) {
    const Q = {
        "'":"'",
        '"':'"',
        '`':"`"
    };

    function WS(c) {
        return /\s/.test(c);
    }

    function eatQuoted(text, start, target) {
        if (!target) {
            return {};
        }
        let skip = 0;
        let r    = [];
        let i    = start + 1;
        let ch   = text[i];

        while (ch !== target && i < text.length) {
            r.push(ch);
            skip++;
            ch = text[++i];
        }

        // found quote
        if(ch === target) {
            skip++;
        } else {
            console.log(`NOT FOUND`);
        }

        return { quote:target, value:r.join(""), skip:skip};
    }

    let words = [];
    let word  = [];
    for (let i = 0; i < text.length; ++i) {
        let ch = text[i];
        if(WS(ch)) {
            if(word.length > 0) {
                words.push(word.join(""));
                word = [];
            }
            continue;
        }

        let {quote, value, skip = 0} = eatQuoted(text, i, Q[ch]);
        i += skip;
        if(!skip) {
            word.push(ch);
        } else {
            words.push(value);
        }
    }
    if(word.length > 0) {
        words.push(word.join(""));
    }

    console.log(words);
}

function readline(file, cb) {
    let num = 0;
    require('readline').createInterface({
        input: require('fs').createReadStream(file)
    }).on('line', function (line) {
        cb(line, num++);
    }).on('close', () => {
        cb(null, num++);
    });
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
    parseMEXPR,
    search_mp
};