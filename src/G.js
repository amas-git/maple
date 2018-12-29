const mcore  = require('./mcore');
const L = require('./L')('G');



let o = mcore.objectFromYamlString(require('fs').readFileSync('./script/TYPE.mp', 'utf8').toString());

L.d(/\d/.test('1'));


function runner(fn) {
  let running   = false;
  let interval  = 0;
  let stopped   = false;
  let maxErrors = Number.MAX_SAFE_INTEGER;
  let counter   = {
    success: 0,
    errors: 0
  };

  /**
   * 执行屏障, 如果函数处于运行中, 则立刻返回, 不会触发新的调用
   * @returns {Promise<void>}
   */
  async function run() {
    if (!running) {
      running = true;
      try {
        await fn();
        running = false;
        counter.success += 1;
      } catch (e) {
        // FIXME:
        console.log(e.toString());
        running = false;
        counter.errors  += 1;
      }
    }
  }

  /**
   * 尽可能以固定间隔调用函数, 如果函数的执行时间超过间隔时间, 则立刻调用. 否则将等待下一次执行时间
   * @param msec
   * @returns {Promise<void>}
   */
  async function runFixedInterval(msec) {
    interval = Math.abs(msec);
    if (running) {
      return;
    }

    let f = async () => {
      if (stopped) {
        return;
      }

      const startTime = new Date().getTime();
      await run();
      let next = Math.max(0, interval - (new Date().getTime() - startTime));
      setTimeout(async () => { await f(); }, next);
    };

    await f();
  }

  /**
   * 查看工作状态
   */
  function dump() {
    console.log(`errors: ${counter.errors}  success: ${counter.success}`)
  }

  function shutdown() {
      stopped = true;
  }

  function exitOnErrors(max) {
      maxErrors = max
  }

  return {
    run,
    runFixedInterval,
    exitOnErrors,
    shutdown,
    dump
  };
}

async function sleep(msec) {
  return new Promise((resolve => {
    setTimeout(() => resolve(), msec);
  }));
}

const r = runner(async () => {
  await sleep(4000);
  console.log(new Date());
});



(async () => {
  await r.runFixedInterval(2000);
})();
