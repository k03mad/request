import chalk from 'chalk';
import prettyBytes from 'pretty-bytes';

const {
    bgGreen,
    bgRed,
    bgWhite,
    bgYellow,
    black,
    blue,
    bold,
    cyan,
    dim,
    gray,
    green,
    magenta,
    yellow,
} = chalk;

const MIN_RESPONSE_SYM_LENGTH_TO_PRINT = 2000;

const SKIP_HEADERS = new Set(['accept-encoding: gzip, deflate, br']);

/**
 * @param {object} res
 * @param {object} [opts]
 * @param {string} [opts.body]
 * @param {object} [opts.json]
 * @param {object} [opts.form]
 * @returns {string}
 */
export default (res, {body, form, json}) => {
    const msg = [];

    const response = res?.response || res;
    const reqOptions = response.request?.options;

    // some info before curl
    if (response.statusCode) {
        const statusCodeStringify = String(response.statusCode);
        let bgColor = bgWhite;

        if ((/^(1|2)/).test(statusCodeStringify)) {
            bgColor = bgGreen;
        } else if (statusCodeStringify.startsWith('3')) {
            bgColor = bgYellow;
        } else if ((/^(4|5)/).test(statusCodeStringify)) {
            bgColor = bgRed;
        }

        msg.push(bgColor(black(bold(response.statusCode))));
    }

    if (response.timings?.phases?.total) {
        msg.push(gray(`[${response.timings.phases.total} ms]`));
    }

    if (response.headers?.['content-length']) {
        msg.push(gray(`[${prettyBytes(Number(response.headers['content-length']))}]`));
    }

    // begin verbose curl with method and url
    msg.push('curl -v');

    if (reqOptions?.method) {
        msg.push(cyan(`-X ${reqOptions.method}`));
    }

    if (reqOptions?.url) {
        msg.push(blue(reqOptions.url));
    }

    // headers
    const headersParams = Object.entries(response.request?.options?.headers || {});

    if (headersParams.length > 0) {
        const headersStringify = headersParams
            .map(([key, value]) => {
                const keyValue = `${key}: ${value}`;

                if (!SKIP_HEADERS.has(keyValue)) {
                    return `-H "${keyValue}"`;
                }
            })
            .filter(Boolean)
            .join(' ');

        msg.push(dim(magenta(headersStringify)));
    }

    // body flags and formatted data
    let bodyParams;

    if (json) {
        bodyParams = `-d '${JSON.stringify(json)}'`;
    } else if (form) {
        bodyParams = `-d '${new URLSearchParams(form).toString()}'`;
    } else if (body) {
        bodyParams = `-d '${body}'`;
    }

    if (bodyParams) {
        msg.push(dim(yellow(bodyParams)));
    }

    // response if any and small length
    if (response) {
        const message = JSON.stringify(response.body || response.message);

        if (message?.length < MIN_RESPONSE_SYM_LENGTH_TO_PRINT) {
            msg.push(`\n${dim(green(message))}`);
        }
    }

    return msg.join(' ');
};
