import _debug from 'debug';
import PQueue from 'p-queue';

const debug = _debug('mad:queue');

// const rps = num => ({intervalCap: num, interval: 1000});
const concurrency = num => ({concurrency: num});

// первый уровень — хост (* — любой, кроме уже перечисленных)
// второй уровень — метод (* — любой, кроме уже перечисленных)
// третий уровень — настройки очереди из p-queue
const requestQueue = {
    '*': {
        '*': concurrency(3),
    },
};

/**
 * Поставить логирование и вернуть очередь
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
 * Получить очередь по хосту и методу
 * @param {string} host
 * @param {string} method
 * @returns {object}
 */
export default (host, method = 'GET') => {
    // проверка на предустановленные настройки очереди для хоста и метода
    for (const elem of [method, '*']) {
        // очередь уже проинициализирована
        if (requestQueue[host]?.[elem]?._events) {
            return requestQueue[host][elem];
        }

        // очередь нужно проинициализировать
        if (requestQueue[host]?.[elem]) {
            const opts = requestQueue[host][elem];
            requestQueue[host][elem] = new PQueue(opts);
            return getLoggedQueue(host, elem, opts);
        }
    }

    // инициализация очереди для хоста без текущего метода в предустановках
    if (requestQueue[host]) {
        const opts = requestQueue['*']['*'];
        requestQueue[host]['*'] = new PQueue(opts);
        return getLoggedQueue(host, '*', opts);
    }

    // инициализация очереди для хоста с методом из предустановок для всех очередей
    if (requestQueue['*'][method]) {
        const opts = requestQueue['*'][method];
        requestQueue[host] = {[method]: new PQueue(opts)};
        return getLoggedQueue(host, method, opts);
    }

    // нет ни хоста не метода в предустановках
    const opts = requestQueue['*']['*'];
    requestQueue[host] = {'*': new PQueue(opts)};
    return getLoggedQueue(host, '*', opts);
};
