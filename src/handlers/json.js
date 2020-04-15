  async function json(env, section, params, input) {
    let name = params[0];
    let obj = JSON.parse(await input.text().join(""));
    env.setupContext(obj, name);
    return [];
  }
