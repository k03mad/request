import chalk from 'chalk';
import _debug from 'debug';
import got from 'got';

import getCurl from './curl.js';
import getQueue from './queue.js';

const {blue, cyan, dim, green, red, yellow} = chalk;
const debug = _debug('mad:request');

const gotCache = new Map();

const cacheGotResponseKeys = [
    'body',
    'headers',
    'method',
    'statusCode',
    'statusMessage',
    'timings',
];

const gotDefaultOpts = got.extend({
    dnsCache: true,
    timeout: {request: 15_000},
    headers: {'user-agent': 'curl/8.4.0'},
});

const cacheDebug = msgArr => {
    if (process.env.DEBUG) {
        debug(msgArr.join(' :: '));
    }
};

/**
 * @param {string} url
 * @param {object} opts
 * @returns {object}
 */
const sendRequest = async (url, opts) => {
    try {
        const response = await gotDefaultOpts(url, opts);

        if (!opts.responseType) {
            try {
                response.body = JSON.parse(response.body);
            } catch {}
        }

        debug(getCurl(url, opts, response));
        return response;
    } catch (err) {
        debug(getCurl(url, opts, err));

        err.__req = [
            err?.response?.statusCode || err?.code,
            err?.options?.method,
            url,
        ].join(' ').trim();

        if (err?.response?.ip) {
            err.__ip = err.response.ip;
        }

        if (Object.keys(opts).length > 0) {
            err.__opts = opts;
        }

        if (err?.response?.body) {
            try {
                err.__res = JSON.parse(err.response.body);
            } catch {
                err.__res = err.response.body;
            }
        }

        delete err.timings;
        delete err.options;
        delete err.input;

        throw err;
    }
};

/**
 * @param {string} url
 * @param {object} [opts]
 * @param {object} [params]
 * @param {string} [params.queueBy]
 * @param {number} [params.concurrency]
 * @param {number} [params.rpm]
 * @param {number} [params.rps]
 * @returns {Promise<object>}
 */
export const request = (url, opts = {}, params = {}) => {
    const queue = getQueue(params.queueBy || new URL(url).host, params);
    return queue.add(() => sendRequest(url, opts));
};

/**
 * @param {string} url
 * @param {object} [opts]
 * @param {object} [params]
 * @param {number} [params.expire] seconds
 * @param {object} [params.cacheBy]
 * @param {string} [params.queueBy]
 * @param {number} [params.concurrency]
 * @param {number} [params.rpm]
 * @param {number} [params.rps]
 * @returns {Promise<object>}
 */
export const requestCache = (url, opts = {}, {cacheBy, expire = 43_200, queueBy, ...params} = {}) => {
    const queue = getQueue(queueBy || new URL(url).host, params);

    return queue.add(async () => {
        const cacheKey = `${url}::${JSON.stringify(cacheBy || opts)}`;
        const urlLog = `${blue(url)}\n${dim(cacheKey)}`;

        try {
            if (gotCache.has(cacheKey)) {
                const {cachedResponse, date} = gotCache.get(cacheKey);

                const measurement = 'seconds';
                const currentDiff = Math.round((Date.now() - date) / 1000);
                const diffLog = `${currentDiff}/${expire} ${measurement} left`;

                if (currentDiff < expire) {
                    cacheDebug([green('FROM CACHE'), diffLog, urlLog]);
                    return {cacheKey, ...cachedResponse};
                }

                cacheDebug([yellow('CACHE EXPIRED'), diffLog, urlLog]);
            } else {
                cacheDebug([blue('CACHE NOT FOUND'), urlLog]);
            }
        } catch (err) {
            cacheDebug([red('CACHE ERROR'), dim(err), urlLog]);
        }

        const res = await sendRequest(url, opts);

        const cachedResponse = {};

        cacheGotResponseKeys.forEach(key => {
            cachedResponse[key] = res[key];
        });

        gotCache.set(cacheKey, {date: Date.now(), cachedResponse});
        cacheDebug([cyan('CACHE SAVED'), urlLog]);

        return res;
    });
};
