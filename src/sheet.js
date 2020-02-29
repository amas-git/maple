const L = require('../L')('SHEET');
const math = require('mathjs');
const _ = require('lodash');

math.config({
  number: 'BigNumber', // Default type of number:
  // 'number' (default), 'BigNumber', or 'Fraction'
  precision: 20 // Number of significant digits for BigNumbers
});


function pad(str,pad='                     ', padLeft=true) {
  if (typeof str === 'undefined')
    return pad;
  if (padLeft) {
    return str.padStart(pad.length - strLen(str, true));
  } else {
    return str.padEnd(pad.length - strLen(str,true));
  }
}

function fill(length) {
  return "                                                                                     ".substring(0,length);
}

function strLen(str, getChineseCodeLen = false) {
  var count = 0;
  for (var i = 0, len = str.length; i < len; i++) {
    if(getChineseCodeLen) {
      count += str.charCodeAt(i) < 256 ? 0 : 1;
    } else {
      count += str.charCodeAt(i) < 256 ? 1 : 2;
    }    
  }
  return count;
}

// 调整为合适的间距
function column(input=[[]], split='\t') {
  function calcPaddings(xs) {
    return xs.reduce((rs,x) => {
      let len = x.map((elem) => strLen(elem));

      for (let i=0; i<len.length; ++i) {
        rs[i] = math.max(len[i], rs[i]||0);
      }
      return rs;
    },[]);
  }

  let paddings = calcPaddings(input);
  let rs = [];

  for (let i=0; i<input.length; ++i) {
    let line = [];
    for (let j=0; j<input[i].length; ++j) {
      line.push(pad(input[i][j], fill(paddings[j])));
    }
    rs.push(line.join(split));
  }
  return rs.join('\n');
}


class Cell {
  constructor(value = null) {
    this.value = value;
    this.meta  = undefined;
  }

  toString() {
    let s = "";
    if (_.isObjectLike(this.value)) {
      s = JSON.stringify(this.value);
    } else {
      s = this.value ? this.value.toString() : "";
    }
    return s;
  }

  static create(n) {
    let rs = [];
    for(let i=0; i<n; ++i) {
      rs.push(new Cell());
    }
    return rs;
  }
}

Cell.prototype.hello = () => {
  console.log(`HELLO`);
};

class S {
  constructor(name, cols=[], options={}) {
    this.cindex  = [];
    this.name  = name;
    this.c     = cols;
    this.r     = {};
    this.group = 'default';
    this.options = {
      split: '  ',     // 打印时的分隔符
      show_head: true, // 是否显示head line
    };
    Object.assign(this.options, options);
    this.meta = {
      ctime : 0,
    };
  }

  foreach_row(fn) {
    let i = 1;
    for(let id of this.cindex) {
      fn(this.r[id], `${i}`, id);
      i+=1;
    }
  }

  async foreach_row_async(fn) {
    let i = 1;
    for(let id of this.cindex) {
      await fn(this.r[id], `${i}`, id);
      i+=1;
    }
  }

  foreach_col(fn, row) {
    if (!row) {
      return;
    }

    // TODO: 遍历整个列
    if (_.isString(row)) {
      // TODO: 不在this.c中指定的列也可以打印出来
    } else {
      for (let key of this.c) {
        fn(key, row[key]);
      }
    }
  }

  length() {
    return this.cindex.length;
  }

  /**
   *  row(undefined) : 创建个新row
   *  row(-1)        : 倒数第一行
   *  row(1)         : 正数第一行
   *  row('test')    : 如果没有叫test的行就创建一个新行名字为test, 否则返回已经有的名为test的row
   */
  row(id = undefined) {
    if (id === undefined) {
      id = this.cindex.length + 1;
    }

    if (id < 0) {
      id = this.cindex.length + id + 1;
    }

    let row = this.r[id];
    if (!row) {
      this.r[id] = row = S._row_proxy(id);
      this.cindex.push(id);
    }
    return row;
  }

  hasRow(id) {
    return this.r.hasOwnProperty(id);
  }

  static _row_proxy(name, cell_obj) {
    // row proxy
    let proxy = {
      add(name, expr, precision, notation='fixed') {
        let value = 0;
        let option = {notation};
        if (precision >= 0) {
           option.precision = precision;
        }
        if (!expr) {
          // FIXME: expr不合法时也返回
          return this;
        }

        if (!this.hasOwnProperty(name)) {
          this[name] = '0';
        } else {
          value = this[name].value;
        }

        if (!math.hasNumericValue(value)) {
          return this;
        }

        const r = math.eval(`${value} + (${expr})`);
        this[name].value = math.format(r, option);
        return this;
      },

      sub(name, expr,  precision, notation='fixed') {
        return this.add(name, `-(${expr})`, precision, notation);
      },

      put(name, value, meta) {
        if (value == undefined) {
          return this;
        }
        
        this[name] = value;
        this[name].meta  = meta;
        return this;
      },

      mul(name, expr, precision, notation='fixed') {
        let value  = 0;
        let option = {notation};
        if (precision >= 0) {
           option.precision = precision;
        }
        if (!this.hasOwnProperty(name)) {
          this[name] = '0';
        } else {
          value = this[name].value;
        }

        const r = math.eval(`${value} * (${expr})`);
        this[name].value = math.format(r, option);
        return this;
      },

      num(name, failed = 0) {
        let value = 0;
        if (!this.hasOwnProperty(name)) {
          return failed;
        }
        value = this[name].value;
        return (math.hasNumericValue(value)) ? value : failed;
      },

      value(name) {
        return this[name].value;
      },

      /**
       * get meta info
       * @param {*} name 
       */
      meta(name) {
        return this[name].meta;
      }
    };

    if (cell_obj) {
      for (let k of Object.keys(cell_obj)) {
        proxy[k] = Object.assign(new Cell, cell_obj[k]);
      }
    }

    let _ = new Proxy(proxy, {
      set: (target, prop, value) => {
        // 如果value是一个Cell对象， 则可疑直接使用
        let cell = (value instanceof Cell) ? value : new Cell(value);
        Reflect.set(target, prop, cell);
        return true;
      }
    });
    _.name = name;
    return _;
  }

  col(name) {
    let rs = [];
    for (let row of this.cindex) {
     rs.push(row[name]);
    }
    return rs;
  }

  append(row) {
    let r = this.row();

    if (Array.isArray(row)) {
      row = _.zipObject(this.c, row);
    }

    _.forEach(row, (value, key) => {
      r[key] = value;
    });
    return r;
  }

  pair(key, value) {
    return this.put(value, key);
  }

  put(value, key, colname='value') {
    if(!this.c.includes(colname)) {
      this.c.push(colname);
    }
    this.row(key).put(colname, value);
    return this;
  }
  sum(name='@sum', options={}) {
    let cols = this.c; 
    this.foreach_row((row, i, id) => {
      if (id === name) {
        return;
      }
      for(let c of cols) {
        this.row(name).add(c, row[c] || '0');        
      }
    });
  }

  get(key, colname='value', failover = undefined) {
    if (!this.hasRow(key)) {
      return failover;
    }
    let cellVal = this.row(key)[colname];
    return cellVal ? cellVal : failover;
  }

  cp(src, dst) {
    this.foreach_row((row, index) => {
      row[dst] = row[src];
      L.e(row[dst]);
    });
  }

  toString() {
    let rs = [];
    if (this.options.show_head) {
      rs.push(['ID', ...this.c]);
    }

    this.foreach_row((row, id) => {
      let _row = [];
      if (this.options.show_head) {
        _row.push(`${row.name}`);
      }
      this.foreach_col((key, cell) => {
        _row.push(cell ? cell.toString() : "");
      }, row);
      rs.push(_row);
    });
    let body = column(rs, this.options.split);
    return `-----------------------------------------------------------------------------------------------[ ${this.name} ]\n${body}`;
  }

  JSON() {
    return JSON.stringify(this, (key, value) => {
        if (typeof value === 'function') {
          return undefined;
        }
        return value;
    },2);
  }

  static fromCSV() {

  }

  static fromJSON(json) {
    return Object.assign(new S, JSON.parse(json, (key, value) => {
      if (key === 'r') {
        let r = {};
        for (let k of Object.keys(value)) {
          r[k] = S._row_proxy(k, value[k]);
        }
        return r;
      }
      return value;
    }));
  }
}

function TEST() {
  let s = new S('name', ['a', 'b', '年龄', 'bb']);
  s.row(1).a = 1;
  s.row().a = 1;
  s.row(1).a = 13;
  s.row(3).b = '333';
  s.row().b = 1799;
  s.row().a = 1798;
  s.row()['年龄'] = "二十八";
  s.append({a: 199, b: 'b'});
  s.append([11, 'c', 199]);
  s.row(-1).a = 110;
  s.row('hello').a = 1;
  s.row('hello').b = 2;
  s.row('cool').a = 111;
  s.row('cool').add('b', 9898989);
  s.row('cool').add('b', 1);
  s.row(1).add('a', '19000099999999999');
  s.row(1).sub('b', '19000099999999999');

  //s.dupTo('b', 'bb');

  //L.d(s.toString());
  // L.d(s.JSON());

  //L.w(s);
  L.w(s.toString());
  const s2  = S.fromJSON(s.JSON());

  s2.row(-1).bb = 'xxxx';
  s2.cp('a', 'bb');
  L.e(s2.toString());
  L.i(_.isEmpty(s2.row('1')['aqweqw']))
  L.i(s2.row('1')['a'].toString())
  L.i(s2.row('1')['a'])
  //L.d(s2.toString());
  // L.d(s.row(1));
  // L.d(s.row('hello'));
  // L.e(s.row(3));

  let o = { f1 : (x) => `${x}`};
  let old = o.f1
  o.f1 = (x) => old(`[${x}]`);

  console.log(o.f1(11111111111111));
  const BN = require('bignumber.js');
  L.i(s2.get('2', 'a').toString() === '1')
  L.i(parseInt(s2.get('2', 'a')))
  L.i(new BN(s2.get('2', 'a')).plus(33).toNumber())
  L.i(parseInt(s2.get('2', 'a')));
}

// TEST();
if (!module.parent) {
  TEST();
}

module.exports = {S};