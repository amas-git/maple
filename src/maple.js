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

    static ROOT() {
        return new Section(0, 2048);
    }

    static fromMEXPR(id, text, level) {
        let pipes = mcore.parseMEXPR(text);
        let section = new Section(id, level, pipes);
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
        let name = params[0] || "main";
        env.src[name] = M(`module.exports={${input.get().join("")}}`);
        env.changeContext(env.src.main);
        return [];
    },

    var(env, section, params, input) {
        let name  = params[0];
        let value = input.get();
        env.var[name] = value;
        return value;
    },

    json(env, section, params, input) {
        let name      = params[0] || "main";
        env.src[name] = JSON.parse(input.get().join(""));
        env.changeContext(env.src.main);
        return [];
    },

    yml(env, section, params, input) {
        let name      = params[0] || "main";
        env.src[name] = mcore.objectFromYamlString(input.get().join("\n"));
        env.changeContext(env.src.main);
        return [];
    },

    srcfile(env, section, params, input) {
        let rs = input.get();
        let name = params[0] || "main";
        let c = [];

        rs.forEach( f => {
            let text = mcore.object(env.mpath, f);
            if(text) {
                c.push(text);
            }
        });
        env.src[name] = M(`module.exports={${c.join(",")}}`);
        env.changeContext(env.src.main);
        return [];
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
    constructor(file) {
        this.seq       = 1;
        this.file      = file;
        this.src       = {};    // data source
        this.mod       = {};    // modules
        this.var       = {};    // 缓存状态
        this.root      = {};
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

        let scriptd = path.dirname(file);
        if(scriptd) {
            this.mpath.unshift(scriptd);
        }
    }

    get context() {
        return _.last(this.__context.stack);
    }

    _changeContextToChild(key) {
        this.changeContext(_.pick(this.context, key));
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

    addSection(mexpr, level=0) {
        let section = Section.fromMEXPR(this.seq++,mexpr, level);
        this.sections.push(section);
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

    addContent(content) {
        this._current().contents.push(content);
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
}

function run_maple(script) {
    const file  = mcore.search_mp(maple_path, script);
    if(!file) {
        return;
    }
    const maple = new Maple(file);
    readline(file, (line, num) => {
        if(line == null) {
            maple.tree();
            console.log(Maple.printrs(maple.eval()));
            //maple.showTime();
            return;
        }

        let match;
        if(line.startsWith('#----')) {
            match = /^#([-]{4,2048})[|][\s]*(.*)/.exec(line);
            if (match) {
                let [,level, mexpr] = match;
                maple.addSection(mexpr, level.length);
                return;
            }
        }
        maple.addContent(line);
    });
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
    run_maple,
    Maple
};

