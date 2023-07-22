import chalk from 'chalk';
import _debug from 'debug';
import got from 'got';

import getCurl from './curl.js';
import getQueue from './queue.js';

const {blue, cyan, dim, green, red, yellow} = chalk;
const debug = _debug('mad:request');

/**
 * @param {object} opts
 * @returns {object}
 */
const prepareRequestOpts = (opts = {}) => {
    const UA = 'curl/8.1.2';

    const preparedOpts = {...opts};

    if (!preparedOpts.dnsCache) {
        preparedOpts.dnsCache = true;
    }

    if (!preparedOpts.timeout) {
        preparedOpts.timeout = {request: 10_000};
    }

    if (!preparedOpts.headers) {
        preparedOpts.headers = {'user-agent': UA};
    } else if (!preparedOpts.headers['user-agent']) {
        preparedOpts.headers['user-agent'] = UA;
    }

    return preparedOpts;
};

/**
 * Отправить запрос
 * @param {string} url
 * @param {object} opts
 * @returns {object}
 */
const sendRequest = async (url, opts) => {
    const preparedOpts = prepareRequestOpts(opts);

    try {
        const response = await got(url, preparedOpts);

        if (!preparedOpts.responseType) {
            try {
                response.body = JSON.parse(response.body);
            } catch {}
        }

        debug(getCurl(url, preparedOpts, response));
        return response;
    } catch (err) {
        debug(getCurl(url, preparedOpts, err));

        err.__pretty = {};

        err.__pretty.req = [
            err?.response?.statusCode,
            err?.options?.method,
            url,
            err?.response?.ip ? `(${err.response.ip})` : '',
        ].join(' ');

        if (Object.keys(opts).length > 0) {
            err.__pretty.opts = opts;
        }

        if (err?.response?.body) {
            try {
                err.__pretty.body = JSON.parse(err.response.body);
            } catch {
                err.__pretty.body = err.response.body;
            }
        }

        delete err.timings;
        delete err.options;
        delete err.input;

        throw err;
    }
};

export const cache = new Map();

/**
 * Отправить запрос c выбором использования очереди
 * @param {string} url
 * @param {object} [opts]
 * @param {object} [params]
 * @param {boolean} [params.skipQueue]
 * @returns {Promise<object>}
 */
export const request = (url, opts = {}, {skipQueue} = {}) => {
    if (skipQueue) {
        return sendRequest(url, opts);
    }

    const queue = getQueue(new URL(url).host, opts.method);
    return queue.add(() => sendRequest(url, opts));
};

/**
 * @param {string} url
 * @param {object} [opts]
 * @param {object} [params]
 * @param {number} [params.expire] seconds
 * @param {object} [params.cacheBy]
 * @returns {Promise<object>}
 */
export const requestCache = (url, opts = {}, {cacheBy, expire = 43_200} = {}) => {
    const queue = getQueue(new URL(url).host, opts.method);

    return queue.add(async () => {
        const preparedOpts = prepareRequestOpts(opts);

        const cacheGotResponseKeys = [
            'body',
            'headers',
            'method',
            'statusCode',
            'statusMessage',
            'timings',
        ];

        const cacheKey = `${url}::${JSON.stringify(cacheBy || preparedOpts)}`;
        const log = `${blue(url)}\n${dim(cacheKey)}`;

        try {
            if (cache.has(cacheKey)) {
                const {cachedResponse, date} = cache.get(cacheKey);

                const measurement = 'seconds';
                const currentDiff = Math.round((Date.now() - date) / 1000);

                if (currentDiff < expire) {
                    debug(`${green('FROM CACHE')} :: ${currentDiff}/${expire} ${measurement} left :: ${log}`);
                    return {cacheKey, ...cachedResponse};
                }

                debug(`${red('CACHE EXPIRED')} :: ${currentDiff}/${expire} ${measurement} left :: ${log}`);
            } else {
                debug(`${yellow('CACHE NOT FOUND')} :: ${log}`);
            }
        } catch (err) {
            debug(`${red('CACHE ERROR')} :: ${dim(err)} :: ${log}`);
        }

        const res = await request(url, preparedOpts, {skipQueue: true});

        const cachedResponse = {};

        cacheGotResponseKeys.forEach(key => {
            cachedResponse[key] = res[key];
        });

        cache.set(cacheKey, {date: Date.now(), cachedResponse});
        debug(`${cyan('CACHE SAVED')} :: ${log}`);

        return res;
    });
};
