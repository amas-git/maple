const M = require('./M');
const _ = require('lodash');
const path = require('path');
const mcore = require('./mcore');
const L = require('./L')('maple');

var maple_path = (() => {
  return process.env.MAPLE_PATH ? process.env.MAPLE_PATH.split(':') : [];
})();

/**
 *
 * RULE:
 *  不断去掉非必须
 *  结果正确 != 过程正确
 *  Repeat yourself more
 * TODO:
 *  用maple script扩展maple script的能力, maple命令stdin接受一个输入可以是yml/xml/..., 然后作为main obj
 *  参数的处理
 *  foreach循环的处理
 *  section链接符的支持
 *
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
 *
 */


const DEBUG = false;

class Section {
  constructor(id, level, pipes = [["@part"]]) {
    this.id = id;
    this.level = level;
    this.contents = [];
    this.sections = [];
    this.pipes = pipes; // 级联函数序列
    this.time = 0;
    this.sep = "\n";
    this.meta = {
      start: 0 // start line number
      , end: 0   // end line number
    };
  }

  /**
   * Test the section contains specify command
   * @param name
   * @returns {boolean}
   */
  hasCommand(name) {
    for (let [cmd, ...params] of this.pipes) {
      if (cmd === name) {
        return true;
      }
    }
    return false;
  }

  /**
   *
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
    if (_.isEmpty($expr)) {
      return true;
    }

    let r = mcore.exeval(env.expose(), `return ${$expr};`);
    return (r) ? true : false;
  }

  join(c = '\n') {
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
  async apply(env, params, args, thisArg = null) {
    env.changeContext(_.zipObject(params, args));
    let rs = await this.map(env, [], true, thisArg);
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
  async map(env, rs = [], template = true, thisArg = null) {
    mcore.push(rs, await mcore.template(env, this.join("\n"), template, thisArg));
    for (let s of this.sections) {
      rs.push(await s.eval(env));
    }
    return rs;
  }

  async mapFlat(env, rs = [], template = true, thisArg = null) {
    return mcore.flat(await this.map(env, rs, template, thisArg));
  }

  async eval(env) {
    let start = Date.now();
    let rs = await this.runpipe(env);
    let time = Date.now() - start;
    this.time = time;
    return rs;
  }

  /**
   * TODO:
   *  1.
   */
  async runpipe(env) {
    let rs = [];
    let input = {
      fns: {},
      put(id, srcFn) {
        this.fns[id] = srcFn;
      },
      // 优先取管道, 实例化模板字符次之
      async get(ids = "pT") {
        for (let id of ids) {
          let fn = this.fns[id];
          if (fn) {
            return await fn();
          }
        }
      },

      async text(split = '\n', ids = "pT") {
        let rs = await this.get(ids);
        return rs.join(split);
      }
    };

    // 模板化之后的文字
    input.put('T', async () => await this.mapFlat(env));

    // 原文字
    input.put('t', async () => await this.mapFlat(env, [], false));

    for (let cmd of this.pipes) {
      let [cn, ...params] = cmd;
      if (cn.startsWith('@')) {
        cn = cn.slice(1);
        // 1. call handler
        let h = env.handlers[cn];
        if (h) {
          rs = await h(env, this, params, input);
        } else {
          // 2. call inner template function
          let func = env.functions[cn];
          if (func) {
            // 模板函数
            //rs = func(...params);
            rs = await (func.bind(input)(...params));
          } else {
            // 3. call externel commands
            params.unshift(cn);
            rs = env.handlers['exec'](env, this, params, input);
          }
        }
        // 管道
        input.put("p", async () => rs);
      }
    }
    return rs;
  }

  // get the most last line of specify section
  _meta_max() {
    if (_.isEmpty(this.sections)) {
      return this.meta.end;
    }
    let last = this.sections[this.sections.length - 1];
    return last._meta_max();
  }

  metainfo() {
    return {
      start: this.meta.start,
      end: this.meta.end,
      max: this._meta_max()
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
  async func(env, section, params) {
    let [fname, ...fparams] = params;
    let fn = async function (...args) {
      return await section.apply(env, fparams, args, this);
    };
    env.addFunction(fname, fn, "");
    return [];
  },

  async part(env, section, params, input) {
    return (section.test(env, params.join(" "))) ? await input.get() : [];
  },

  async foreach(env, section, params, input) {
    let rs = [];

    async function getIterable() {
      // @foreach x:xs
      // @foreach xs -> @foreach $:xs
      // @foreach x:_range(1,100)

      if (_.isEmpty(params)) {
        return undefined;
      }

      let forExpr = await mcore.template(env, params.join("").trim());
      let match = /([_]*[a-zA-Z0-9_]+):(.*)/.exec(forExpr.trim());
      let xname = "$";
      let expr = forExpr;

      if (match) {
        [, xname, expr] = match;
        expr = expr || forExpr;
      }

      // FIXME: 当对象为a.b这种形式的时候会无法获取
      let os = (await env.searchTarget(expr)) || eval(expr);
      return {xname, os};
    }

    let {xname, os} = await getIterable();
    if (!os) {
      return rs;
    }

    let LENGTH = Object.keys(os).length;
    let n = 0;

    for (let key of Object.keys(os)) {
      let value = os[key];

      let $o = {};
      n += 1;
      $o[xname] = value;
      $o["$key"] = key;
      $o["$first"] = n === 1;
      $o["$last"] = n === LENGTH;

      env.changeContext($o);
      //section.map(env, rs);
      rs.push(await input.text());
      env.restoreContext();
    }
    return mcore.flat(rs);
  },

  async src(env, section, params, input) {
    let name = params[0] || 'main';
    let obj = M(`module.exports={${await input.text("")}}`);
    env.setupContext(obj, name);
    return [];
  },

  async var(env, section, params, input) {
    let name = params[0];
    env.var[name] = await input.text();
    return value;
  },

  async json(env, section, params, input) {
    let name = params[0];
    let obj = JSON.parse(await input.text().join(""));
    env.setupContext(obj, name);
    return [];
  },

  async yml(env, section, params, input) {
    let name = params[0];
    let obj = mcore.objectFromYamlString(await input.text("\n"));
    env.setupContext(obj, name);
    return [];
  },

  async run(env, section, params, input) {
    // FIXME: 自我调用的时候会出问题
    let rs = [];
    let obj = mcore.objectFromYamlString(await input.text("\n"));
    L.tag('@run').d(`with ${params} ${JSON.stringify(obj)}`);
    // FIXEME: 如果调用自己改怎么办?
    for (let name of params) {
      let mp = await Maple.searchMaple(name);
      if (!mp) {
        L.e(`@run the ${name} can't find`);
        continue;
      }
      let maple = Maple.fromFile(mp);
      maple.setupContext(obj);
      rs.push(await maple.text());
    }
    L.reset();
    return rs;
  },

  async srcfile(env, section, params, input) {
    let rs = input.get();
    let name = params[0];
    let c = [];

    rs.forEach(f => {
      let text = mcore.object(env.mpath, f);
      if (text) {
        c.push(text);
      }
    });
    let obj = M(`module.exports={${c.join(",")}}`);
    env.setupContext(obj, name);
    return [];
  },

  async seed(env, section, params, input) {
    let type = params[0] || 'yml';
    return BASE_HANDLER[type](env, section, params, input);
  },

  async mod(env, section, params, input) {
    let name = params[0];
    let mod = M(`${await input.text('\n', 't')}`);

    if (name) {
      env.mod[name] = mod;
    } else {
      _.assign(env.functions, mod);
    }
    return [];
  },

  async upper(env, section, params, input) {
    return [(await input.text('\n')).toUpperCase()];
  },

  async join(env, section, params, input) {
    return [await input.text(params[0])];
  },

  async exec(env, section, params, input) {
    let [cmd, ...args] = params;
    let r = mcore.exec(cmd, args, await input.text('\n'));
    return [r];
  },

  async echo(env, section, params, input) {
    return [await input.text('pt')];
  },

  async save(env, section, params, input) {
    let rs = input.text();
    let name = await mcore.template(env, params[0].trim());
    mcore.write(name, Maple.printrs(rs));
    return [];
  }
};

class Maple {
  constructor() {
    this.seq = 1;
    this.src = {};    // the source file content
    this.mod = {};    // modules
    this.var = {};    // 缓存状态
    this.root = {};
    this.source = [];    // source file
    this.handlers = BASE_HANDLER;
    this.sections = [Section.ROOT()];
    this.functions = {};
    this.__context = {stack: [{}]};
    this.mpath = [...maple_path];
    this.export = {
      $src: this.src,
      $mod: this.mod,
      $var: this.var,
      $func: this.functions
    };
  }

  /**
   * Set replaceSeed section
   * @param seed
   */
  replaceSeed(seed) {
    if (!seed instanceof Section) {
      L.e(`The seed must be an instance of Section`);
      return;
    }

    // no replaceSeed section, just put ahead
    let s = this.getSourceByCommand('@replaceSeed');
    if (s) {
      this.s.replace(seed);
    }
  }

  /**
   * Get the source code of specify section
   * @param id
   */
  getSourceBySectionId(id) {
    let s = this.sections[id];
    if (s) {
      let {start, end, max} = s.metainfo();
      return this.source.slice(start, max + 1).join('\n');
    }
    return "";
  }

  getSectionByCommand(cmd) {
    return this.sections.find((s) => {
      return s.hasCommand(cmd);
    });
  }

  getSourceByCommand(cmd) {
    let section = this.getSectionByCommand(cmd);
    return section ? this.getSourceBySectionId(section.id) : undefined;
  }

  get context() {
    return _.last(this.__context.stack);
  }

  _changeContextToChild(key) {
    this.changeContext(_.pick(this.context, key));
  }

  setupContext(ctx = {}, name = 'main') {
    this.src[name] = ctx;
    this.__context.stack = [];
    this.changeContext(ctx);
  }

  changeContext(ctx = {}) {
    this.__context.stack.push(ctx); //println(this.__context, "+CTX");
  }

  /**
   * Search the target object in the current context
   * NOTE: This method is a bit slow
   */
  async searchTarget(name) {
    let chunk = name.split(".");
    let r = this.context;
    if (!r) {
      return null;
    }
    // search child
    for (let i = 1; i < chunk.length; ++i) {
      r = r[chunk[i]];
    }
    try {
      r = await mcore.exeval(this.expose(), `return ${name};`);
    } catch (e) {
      //console.error(e);
    }
    return r;
  }

  restoreContext() {
    this.__context.stack.pop();
  }

  expose() {
    let os = [];
    // TODO: 性能优化, 避免重复加载不可变化的对象
    // process env
    os.push(process.env);

    // export function for easy to use
    os.push(this.export.$func);

    // export the maple state
    os.push(this.export);

    // export the stack objects
    os.push(...this.__context.stack);
    return os;
  }

  addSection(mexpr, level = 0, line = 0) {
    let section = Section.fromMEXPR(this.seq++, mexpr, level, line);
    this.sections.push(section);
  }

  _current() {
    return _.last(this.sections);
  }

  addFunction(fname, f, module) {
    if (module) {
      if (!this.functions[module]) {
        this.functions[module] = {};
      }
      this.functions[module][fname] = f;
    } else {
      this.functions[fname] = f;
    }
  }

  addContent(content, line = 0) {
    this._current().contents.push(content);
    this._current().meta.end = line;
  }

  tree() {
    this.root = mcore.mktree(this.sections, this.sections[0], "level", "sections");
    return this;
  }

  async eval() {
    let rs = await this.root.eval(this);
    return rs;
  }

  showTime() {
    this.sections.forEach((s) => {
      console.log(`${s.id} : ${s.time}`);
    });
  }

  static printrs(xs) {
    return mcore.flat(xs).join("\n");
  }

  async text() {
    return Maple.printrs(await this.eval());
  }


  static run(name) {
    const mp = mcore.search_mp(maple_path, name);
    if (!mp) {
      L.w(`NOT found '${name}' maple script`);
    }
    const maple = Maple.fromFile(mp);
    return maple.text();
  }


  static getSeed(script, seed = undefined) {
    const file = mcore.search_mp(maple_path, script);
    if (!file) {
      return;
    }
    const maple = fromFile(file, seed, true);
    return maple.getSourceByCommand('@seed');
  }


  static fromFile(file, withSrc = false) {
    L.tag('fromFile').d(`run ${file}`).reset();
    const text = require('fs').readFileSync(file, 'utf8').toString().trim();
    return Maple.fromText(text, withSrc)
  }

  static fromText(text, withSrc = false) {
    if (_.isEmpty(text)) {
      return null;
    }

    const maple = new Maple();
    const lines = text.trim().split('\n');
    if (withSrc) {
      maple.source = lines;
    }

    let num = -1;
    for (let line of lines) {
      num += 1;
      let match;
      if (line.startsWith('#----')) {
        match = /^#([-]{4,2048})[|][\s]*(.*)/.exec(line);
        if (match) {
          let [, level, mexpr] = match;
          maple.addSection(mexpr, level.length, num);
          continue;
        }
      }
      maple.addContent(line, num);
    }
    maple.tree();
    return maple;
  }

  static searchMaple(name) {
    return mcore.search_mp(maple_path, name);
  }
}

module.exports = Maple;
