const M = require('./M');
const _ = require('lodash');
const path = require('path');
const mcore  = require('./mcore');
var maple_path = (() => {
    return process.env.MAPLE_PATH ? process.env.MAPLE_PATH.split(':') : [];
})() ;

/**
 * TODO:
 *  用maple script扩展maple script的能力, maple命令stdin接受一个输入可以是yml/xml/..., 然后作为main obj
 *  参数的处理
 *  foreach循环的处理
 *  section链接符的支持
 *
 *  1. 用array.some()改写正则匹配部分
 *  3. 性能统计: eval求值时间，次数，产生的字符数量等等
 *  4. 实现pipe
 * HISTORY:
 *  1. 2018.06.18: Finished Core Design
 *  2. use function all instead of eval&let, the function parmas limit will be a problems
 * @param text
 *  6. 用迭代代替mktree|printrs递归方式
 *  7. 提供一些打印上下文信息的调试函数，方便定位问题
 *  8. **可以把section编译成js函数
 *  FIXME:
 *
 *  结果正确 != 过程正确
 */


const DEBUG = false;

function print(o, tag="") {
    if(o && DEBUG) {
        let c = JSON.stringify(o, null, 2).split("\n");
        c = c.map((s) =>{ return `[${tag}] : ${s}`; } );
        console.error(c.join("\n"));
    }
}

function println(o, tag="") {
    if(o && DEBUG) {
        let c = JSON.stringify(o).split("\n");
        c = c.map((s) =>{ return `[${tag}] : ${s}`; } );
        console.error(c.join("\n"));
    }
}

class Section {
    constructor(id, level, pipes=[["@part"]]) {
        this.id       = id;
        this.level    = level;
        this.contents = [];
        this.sections = [];
        this.pipes    = pipes; // 级联函数序列
        this.time     = 0;
        this.sep      = "\n";
        this.meta     = {
                           start:0 // start line number
                          ,end:0   // end line number
                        };
    }

    /**
     * any section which contains @seed will treat as seed  section
     * @returns {boolean}
     */
    isseed() {
        for(let [cmd, ...params] of this.pipes) {
            if (cmd === '@seed') {
                return true;
            }
        }
        return false;
    }

    /**
     * assign a section to current section
     * 1. the section will be the child of current one
     * @param section
     */
    replace(section) {
        if (!section) {
            return;
        }
        this.contents = [];
        this.sections = section.sections;
        // TODO: adjust the level value
    }

    test(env, $expr) {
        if(_.isEmpty($expr)) {
            return true;
        }

        let r = mcore.exeval(env.expose(), `return ${$expr};`);
        return (r) ? true : false;
    }

    join(c='\n') {
        return this.contents.join(c);
    }

    /**
     *
     * @param env
     * @param params formal params
     * @param args actual params
     * @param this object
     * @returns {Array}
     */
    apply(env, params, args, thisArg = null) {
        env.changeContext(_.zipObject(params, args));
        let rs = this.map(env, [], true, thisArg);
        env.restoreContext();
        return Maple.printrs(rs);
    }

    /**
     * @param env
     * @param rs 保存求值结果
     * @param template 是否在env下求值template
     * @param thisArg this object in section body
     * @returns {Array}
     */
    map(env, rs=[], template=true, thisArg = null) {
        mcore.push(rs, mcore.template(env, this.join("\n"), template, thisArg));
        this.sections.forEach((s) => {
            rs.push(s.eval(env));
        });
        return rs;
    }

    mapFlat(env, rs=[], template=true, thisArg = null) {
        return mcore.flat(this.map(env,rs,template, thisArg));
    }

    eval(env) {
        let start = Date.now();
        let rs = this.runpipe(env);
        let time = Date.now() - start;
        this.time = time;
        return rs;
    }

    /**
     * TODO:
     *  1.
     */
    runpipe(env) {
        let rs = [];
        let input = {
            fns: {},
            put(id, srcFn) {
                this.fns[id]=srcFn;
            },
            // 优先取管道, 实例化模板字符次之
            get(ids="pT") {
                for (let id of ids) {
                    let fn = this.fns[id];
                    if(fn) {
                        return fn();
                    }
                }
            }
        };

        // 模板化之后的文字
        input.put('T', () => this.mapFlat(env));

        // 原文字
        input.put('t', () => this.mapFlat(env, [], false));

        this.pipes.forEach(cmd => {
            let [cn, ...params] = cmd;
            if (cn.startsWith('@')) {
                cn = cn.slice(1);
                // 1. call handler
                let h = env.handlers[cn];
                if (h) {
                    rs = h(env, this, params, input);
                } else {
                    // 2. call inner template function
                    let func = env.functions[cn];
                    if(func) {
                        // 模板函数
                        //rs = func(...params);
                        rs = func.bind(input)(...params);
                    } else {
                        // 3. call externel commands
                        params.unshift(cn);
                        rs = env.handlers['exec'](env, this, params, input);
                    }
                }
                // 管道
                input.put("p", () => rs );
            }
        });
        return rs;
    }

    // get the most last line of specify section
    _meta_max() {
        if(_.isEmpty(this.sections)) {
            return this.meta.end;
        }
        let last = this.sections[this.sections.length - 1];
        return last._meta_max();
    }

    metainfo() {
        return {
            start: this.meta.start,
            end:   this.meta.end,
            max:   this._meta_max()
        };
    }


    static ROOT() {
        return new Section(0, 2048);
    }

    static fromMEXPR(id, text, level, line) {
        let pipes = mcore.parseMEXPR(text);
        let section = new Section(id, level, pipes);
        section.meta.start = line;
        return section;
    }
}



const BASE_HANDLER = {
    func(env, section, params) {
        let [fname,  ...fparams] = params;
        let fn = function(...args) { return section.apply(env, fparams, args, this); };
        env.addFunction(fname, fn, "");
        return [];
    },

    part(env, section, params, input) {
        return (section.test(env, params.join(" "))) ? input.get() : [];
    },

    foreach(env, section, params, input) {
        let rs = [];

        function getIterable() {
            // @foreach x:xs
            // @foreach xs -> @foreach $:xs
            // @foreach x:_range(1,100)

            if (_.isEmpty(params)) {
                return undefined;
            }

            let forExpr = mcore.template(env, params.join("").trim());
            let match   = /([_]*[a-zA-Z0-9_]+):(.*)/.exec(forExpr.trim());
            let xname   = "$";
            let expr    = forExpr;

            if(match) {
                [ ,xname, expr] = match;
                expr  = expr  || forExpr;
            }
            // FIXME: 当对象为a.b这种形式的时候会无法获取
            let os = env.searchTarget(expr) || eval(expr);
            return {xname: xname, os: os};
        }

        let {xname, os} = getIterable();
        if(!os) {
            return rs;
        }

        let LENGTH = Object.keys(os).length;
        let n = 0;

        _.forEach(os, (value, key) => {
            let $o = {};
            n += 1;
            $o[xname]    = value;
            $o["$key"]   = key;
            $o["$first"] = n === 1;
            $o["$last"]  = n === LENGTH;

            env.changeContext($o);
            //section.map(env, rs);
            rs.push(input.get());
            env.restoreContext();
        });
        return mcore.flat(rs);
    },

    src(env, section, params, input) {
        let name = params[0];
        let obj  = M(`module.exports={${input.get().join("")}}`);
        env.addsrc(obj, name);
        return [];
    },

    var(env, section, params, input) {
        let name  = params[0];
        let value = input.get();
        env.var[name] = value;
        return value;
    },

    json(env, section, params, input) {
        let name = params[0];
        let obj  = JSON.parse(input.get().join(""));
        env.addsrc(obj, name);
        return [];
    },

    yml(env, section, params, input) {
        let name = params[0];
        let obj  = mcore.objectFromYamlString(input.get().join("\n"));
        env.addsrc(obj, name);
        return [];
    },

    srcfile(env, section, params, input) {
        let rs = input.get();
        let name = params[0];
        let c = [];

        rs.forEach( f => {
            let text = mcore.object(env.mpath, f);
            if(text) {
                c.push(text);
            }
        });
        let obj = M(`module.exports={${c.join(",")}}`);
        env.addsrc(obj, name);
        return [];
    },

    seed(env, section, params, input) {
        let type = params[0] || 'yml';
        return BASE_HANDLER[type](env, section, params, input);
    },

    mod(env, section, params, input) {
        let content = input.get("pt");
        let name = params[0];
        let mod = M(`${content.join('\n')}`);
        if (name) {
            env.mod[name] = mod;
        } else {
            _.assign(env.functions, mod);
        }
        return [];
    },

    upper(env, section, params, input) {
        return [input.get().join("\n").toUpperCase()];
    },

    join(env, section, params, input) {
        return [input.get().join('\n').split('\n').join(params[0])];
    },

    exec(env, section, params, input) {
        let [cmd, ...args] = params;
        let rs = input.get();
        let r = mcore.exec(cmd, args, rs.join('\n'));
        return [r];
    },

    echo(env, section, params, input) {
        return [ input.get('pt') ];
    },

    save(env, section, params, input) {
        let rs = input.get();
        let name = mcore.template(env, params[0].trim());
        mcore.write(name, Maple.printrs(rs));
        return [];
    }
};

class Maple {
    constructor() {
        this.seq       = 1;
        this.src       = {};    // the source file content
        this.mod       = {};    // modules
        this.var       = {};    // 缓存状态
        this.root      = {};
        this.source    = [];    // source file
        this.seedsec   = undefined;
        this.handlers  = BASE_HANDLER;
        this.sections  = [ Section.ROOT() ];
        this.functions = {};
        this.__context = {stack:[{}]};
        this.mpath     = [...maple_path];
        this.export    = {
            $src       : this.src,
            $mod       : this.mod,
            $var       : this.var,
            $func      : this.functions
        };
    }

    /**
     * Set seed section
     * @param seed
     */
    seed(seed) {
        if (!seed instanceof Section) {
            return;
        }

        // no seed section, just put ahead
        if (!this.seedsec) {
            // TODO: what' should I do without seed ?
            return;
        }

        this.seedsec.replace(seed);
    }

    addsrc(object, name='main') {
        if (!name) {
            name = 'main';
        }

        this.src[name] = object;
        this.setupContext(object);
    }

    get context() {
        return _.last(this.__context.stack);
    }

    _changeContextToChild(key) {
        this.changeContext(_.pick(this.context, key));
    }

    setupContext(ctx={}) {
        this.__context.stack = [];
        this.changeContext(ctx);
    }

    changeContext(ctx={}) {
        this.__context.stack.push(ctx); //println(this.__context, "+CTX");
    }

    /**
     * Search the target object in the current context
     * NOTE: This method is a bit slow
     */
    searchTarget(name) {
        let chunk = name.split(".");
        let r = this.context;
        if (!r)  {
            return null;
        }
        // search child
        for(let i=1; i<chunk.length; ++i) {
            r = r[chunk[i]];
        }
        try {
            r = mcore.exeval(this.expose(), `return ${name};`);
        } catch (e) {
            //console.error(e);
        }
        return r;
    }

    restoreContext() {
        this.__context.stack.pop(); //console.log(`[CHANGE CTX -] : CTX = ${JSON.stringify(this.context)} TYPE:${(typeof this.context)}`);
    }

    expose() {
        let os = [];

        // export function for easy to use
        os.push(this.export.$func);

        // export the maple state
        os.push(this.export);

        // export the stack objects
        os.push(...this.__context.stack);
        return os;
    }

    addSection(mexpr, level=0, line=0) {
        let section = Section.fromMEXPR(this.seq++,mexpr, level, line);
        this.sections.push(section);
        if (section.isseed()) {
            this.seedsec = section;
        }
    }

    _current() {
        return _.last(this.sections);
    }

    addFunction(fname, f, module) {
        if(module) {
            if(!this.functions[module]) {
                this.functions[module] = {};
            }
            this.functions[module][fname] = f;
        } else {
            this.functions[fname] = f;
        }
    }

    addContent(content, line=0) {
        this._current().contents.push(content);
        this._current().meta.end = line;
    }

    tree() {
        this.root = mcore.mktree(this.sections, this.sections[0], "level", "sections");
        return this;
    }

    eval() {
        let rs = this.root.eval(this);
        print("==============================");
        print(rs, "RS");
        return rs;
    }

    showTime() {
        this.sections.forEach((s) => {
            console.log(`${s.id} : ${s.time}` );
        });
    }

    static printrs(xs) {
        return mcore.flat(xs).join("\n");
    }

    text() {
       return Maple.printrs(this.eval());
    }
}

/***
 * @param script the script name
 * @param seed the input object of script (we call it `seed`)
 */
function run_maple(name, seed) {
    const file  = mcore.search_mp(maple_path, name);
    if(!file) {
        return;
    }

    const maple = fromFile(file, seed);
    console.log(maple.text());
}

function getSeed(script, seed=undefined) {
    const file  = mcore.search_mp(maple_path, script);
    if(!file) {
        return;
    }
    const maple = fromFile(file, seed, true);
    let seedsec = maple.seedsec;
    if(seedsec) {
        let {start, end, max} = seedsec.metainfo();
        return maple.source.slice(start, max+1).join('\n');
    }
    return "";
}


function fromFile(file, seed, withSrc = false) {
    const text  = require('fs').readFileSync(file, 'utf8').toString().trim();
    return fromText(text)
}

function fromText(text, withSrc = false) {
    const maple = new Maple();
    const lines = text.trim().split('\n');
    if(withSrc) {
        maple.source = lines;
    }

    let num = -1;
    for(let line of lines) {
        num+=1;
        let match;
        if(line.startsWith('#----')) {
            match = /^#([-]{4,2048})[|][\s]*(.*)/.exec(line);
            if (match) {
                let [,level, mexpr] = match;
                maple.addSection(mexpr, level.length, num);
                continue;
            }
        }
        maple.addContent(line, num);
    }
    maple.tree();
    return maple;
}

module.exports = {
    run_maple,
    fromFile,
    fromText,
    getSeed,
    searchMaple: (name) => mcore.search_mp(maple_path, name),
    Maple
};

