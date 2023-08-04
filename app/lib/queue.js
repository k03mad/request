import _debug from 'debug';
import PQueue from 'p-queue';

const debug = _debug('mad:queue');

// const rps = num => ({intervalCap: num, interval: 1000});
const concurrency = num => ({concurrency: num});

// first level — host
// second level — method
// third level — p-queue options
const requestQueue = {
    '*': {
        '*': concurrency(3),
    },
};

/**
 * @param {string} host
 * @param {string} method
 * @param {object} opts
 * @returns {object}
 */
const getLoggedQueue = (host, method, opts) => {
    const queue = requestQueue[host][method];

    queue.on('active', () => {
        const {pending, size} = queue;
        const {concurrency: concurrent, interval, intervalCap} = opts;

        const parallel = concurrent
            ? `${concurrent} concurrent`
            : `${intervalCap} rp ${interval} ms`;

        const logMessage = `[${
            method === '*' ? '' : `${method}: `
        }${host}] ${parallel} | queue: ${size} | running: ${pending}`;

        debug(logMessage);
    });

    return queue;
};

/**
 * @param {string} host
 * @param {string} method
 * @returns {object}
 */
export default (host, method = 'GET') => {
    for (const elem of [method, '*']) {
        if (requestQueue[host]?.[elem]?._events) {
            return requestQueue[host][elem];
        }

        if (requestQueue[host]?.[elem]) {
            const opts = requestQueue[host][elem];
            requestQueue[host][elem] = new PQueue(opts);
            return getLoggedQueue(host, elem, opts);
        }
    }

    if (requestQueue[host]) {
        const opts = requestQueue['*']['*'];
        requestQueue[host]['*'] = new PQueue(opts);
        return getLoggedQueue(host, '*', opts);
    }

    if (requestQueue['*'][method]) {
        const opts = requestQueue['*'][method];
        requestQueue[host] = {[method]: new PQueue(opts)};
        return getLoggedQueue(host, method, opts);
    }

    const opts = requestQueue['*']['*'];
    requestQueue[host] = {'*': new PQueue(opts)};
    return getLoggedQueue(host, '*', opts);
};
