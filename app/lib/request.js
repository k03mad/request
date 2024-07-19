import chalk from 'chalk';
import _debug from 'debug';
import got from 'got';
import stripAnsi from 'strip-ansi';

import {getCurl} from './curl.js';
import {getQueue} from './queue.js';

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
    headers: {'user-agent': 'curl/7.81.0'},
    timeout: {request: 10_000},
});

const cacheDebug = msgArr => {
    if (process.env.DEBUG) {
        debug(msgArr.join(' :: '));
    }
};

/**
 * @param {string} url
 * @param {object} opts
 * @returns {Promise<import('got').Response>}
 */
const sendRequest = async (url, opts) => {
    try {
        const response = await gotDefaultOpts(url, opts);

        if (!opts.responseType && response.body) {
            try {
                response.body = JSON.parse(response.body);
            } catch {}
        }

        debug(getCurl(response, opts));
        return response;
    } catch (err) {
        if (!opts.responseType && err.response?.body) {
            try {
                err.response.body = JSON.parse(err.response.body);
            } catch {}
        }

        const curl = getCurl(err, opts, {skipResponse: true});
        debug(curl);

        err.__ = {
            debug: stripAnsi(curl).split(' \n'),
        };

        if (err?.response?.body) {
            try {
                err.__.response = JSON.stringify(JSON.parse(err.response.body));
            } catch {
                err.__.response = JSON.stringify(err.response.body);
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
 * @returns {Promise<import('got').Response>}
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
 * @returns {Promise<import('got').Response>}
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

        gotCache.set(cacheKey, {cachedResponse, date: Date.now()});
        cacheDebug([cyan('CACHE SAVED'), urlLog]);

        return res;
    });
};
