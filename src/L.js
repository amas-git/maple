const moment = require('moment');
const colors = require('colors');

const options = {
    printer: console.log,
    color: (level) => {
        let c = {
            E: 'red',
            I: 'white',
            W: 'yellow',
            D: 'green',
        }[level];
        return c || 'white'
    },
    timestamp: 'YYYY-MM-DD HH:mm:ss'
};

function _log(level = 'D', tag, text) {
    if (typeof text === 'object') {
        text = JSON.stringify(text);
    }
    const xs = text.split('\n');
    const time = moment().format(options.timestamp);
    for (let x of xs) {
        options.printer(`[${level}] ${time} ${tag} : ${x}`[options.color(level)]);
    }
}

module.exports = function (tag='main') {
    tag = tag.toUpperCase();
    return {
        w: (message) => _log('W', tag, message),
        d: (message) => _log('D', tag, message),
        e: (message) => _log('E', tag, message),
        i: (message) => _log('I', tag, message)
    };
};
