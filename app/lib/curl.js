import chalk from 'chalk';
import prettyBytes from 'pretty-bytes';

const {bgWhite, black, blue, dim, green, magenta, red, white, yellow} = chalk;

/**
 * @param {string} url
 * @param {object} [opts]
 * @param {string} [opts.method]
 * @param {object} [opts.headers]
 * @param {string} [opts.body]
 * @param {object} [opts.json]
 * @param {object} [opts.form]
 * @param {object} [opts.searchParams]
 * @param {string} [opts.username]
 * @param {string} [opts.password]
 * @param {object} res
 * @returns {string}
 */
export default (url, {
    body, form,
    headers = {}, json, method = 'GET', password,
    searchParams, username,
}, res) => {
    const msg = [];

    let urlClone = url;
    let resClone = structuredClone(res);

    if (resClone?.response) {
        resClone = resClone.response;
    }

    if (resClone?.statusCode) {
        msg.push(bgWhite(black(resClone.statusCode)));
    }

    if (resClone?.timings) {
        msg.push(`[${resClone.timings.phases.total} ms]`);
    }

    if (resClone?.headers?.['content-length']) {
        msg.push(`[${prettyBytes(Number(resClone.headers['content-length']))}]`);
    }

    if (searchParams) {
        urlClone += `?${new URLSearchParams(searchParams).toString()}`;
    }

    msg.push(white('curl -v -X'), green(method));

    if (username && password) {
        msg.push(dim(red(`-u ${username}:${password}`)));
    }

    msg.push(blue(urlClone));

    let bodyParams;

    if (json) {
        headers['content-type'] = 'application/json';
        bodyParams = `-d '${JSON.stringify(json)}'`;
    } else if (form) {
        headers['content-type'] = 'application/x-www-form-urlencoded';
        bodyParams = `-d '${new URLSearchParams(form).toString()}'`;
    } else if (body) {
        bodyParams = `-d '${body}'`;
    }

    const headersParams = Object.entries(headers);

    if (headersParams.length > 0) {
        msg.push(dim(magenta(headersParams.map(([key, value]) => `-H "${key}: ${value}"`).join(' '))));
    }

    if (bodyParams) {
        msg.push(dim(yellow(bodyParams)));
    }

    if (resClone) {
        const message = JSON.stringify(resClone.body || resClone.message);

        if (message?.length < 1500) {
            msg.push(`\n${dim(green(message))}`);
        }
    }

    return msg.join(' ');
};
