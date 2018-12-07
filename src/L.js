const moment = require('moment');
const colors = require('colors');

/**
 * USAGE:
 *    const L = require('L')('HTTP');
 *    L.w(...); // WARNNING
 *    L.d(...); // DEBUG
 *    L.i(...); // INFORMATIONS
 *    L.e(...); // ERROR
 *
 * USE TAG:
 * function hello() {
 *    L.tag('hello');
 *    L.d(...);
 *    L.reset();
 *
 *    // OR
 *    L.tag('some-tag').d(..).reset();
 * }
 * @type {{printer: (message?: any, ...optionalParams: any[]) => void, color: (function(*): (*|string)), timestamp: string}}
 */
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

module.exports = function (tag = 'MAIN') {
    let  tags = [tag];
    let _tags = '';

    function update_tags() {
        _tags = tags.join('/');
    }

    let L = {
        w: (message) => { _log('W', _tags, message); return L; },
        d: (message) => { _log('D', _tags, message); return L; },
        e: (message) => { _log('E', _tags, message); return L; },
        i: (message) => { _log('I', _tags, message); return L; },
        tag: (tag) => {
            tags.push(tag);
            update_tags();
            return L;
        },
        reset() {
            tags = [tags[0]];
            update_tags();
        }
    };
    return L;
};
