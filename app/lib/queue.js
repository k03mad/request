import _debug from 'debug';
import PQueue from 'p-queue';

const debug = _debug('mad:queue');

const intervals = {
    concurrency: num => ({concurrency: num}),
    rpm: num => ({interval: 60_000, intervalCap: num}),
    rps: num => ({interval: 1000, intervalCap: num}),
};

// host: p-queue options
const requestQueue = {
    // default
    '*': intervals.concurrency(3),
};

/**
 * @param {string} host
 * @param {object} opts
 * @returns {object}
 */
const getLoggedQueue = (host, opts) => {
    const queue = requestQueue[host];

    queue.on('active', () => {
        const {pending, size} = queue;
        const {concurrency: concurrent, interval, intervalCap} = opts;

        const parallel = concurrent
            ? `${concurrent} concurrent`
            : `${intervalCap} rp ${interval} ms`;

        const logMessage = `[${host}] ${parallel} | queue: ${size} | running: ${pending}`;

        debug(logMessage);
    });

    return queue;
};

/**
 * @param {string} host
 * @param {object} [params]
 * @param {number} [params.concurrency]
 * @param {number} [params.rpm]
 * @param {number} [params.rps]
 * @returns {object}
 */
export const getQueue = (host, params = {}) => {
    if (requestQueue[host]?._events) {
        return requestQueue[host];
    }

    for (const [key, value] of Object.entries(params)) {
        if (intervals[key] && value) {
            requestQueue[host] = intervals[key](value);
            break;
        }
    }

    if (requestQueue[host]) {
        const opts = requestQueue[host];
        requestQueue[host] = new PQueue(opts);
        return getLoggedQueue(host, opts);
    }

    const opts = requestQueue['*'];
    requestQueue[host] = new PQueue(opts);
    return getLoggedQueue(host, opts);
};
