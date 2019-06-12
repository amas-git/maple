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
 * LOG OBJECT:
 *    // The object will convert to JSON String automatically
 *    let o = {a:1};
 *    L.w(o);
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
    if (text == undefined || text == null) {
        text = "";
    }

    if (typeof text === 'object') {
        text = JSON.stringify(text);
    }
    const xs = text.toString().split('\n');
    const time = moment().format(options.timestamp);
    for (let x of xs) {
        options.printer(`[${level}] ${time} ${tag} : ${x}`[options.color(level)]);
    }
}

module.exports = function (mainTag = 'MAIN') {
    let  tags = [mainTag];
    let _tags = '';

    function update_tags() {
        _tags = tags.join('/');
    }

    let L = {
        w: (message) => { if(L.enabled) _log('W', _tags, message); return L; },
        d: (message) => { if(L.enabled) _log('D', _tags, message); return L; },
        e: (message) => { if(L.enabled) _log('E', _tags, message); return L; },
        i: (message) => { if(L.enabled) _log('I', _tags, message); return L; },
        tag: (tag) => {
            if(tags.length > 5) {
                return;
            }
            tags.push(tag);
            update_tags();
            return L;
        },
        reset() {
            tags = [tags[0]];
            update_tags();
        },
        enabled: true
    };
    return L;
};