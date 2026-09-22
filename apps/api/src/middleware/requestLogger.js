import { logger } from '../utils/logger.js';
export function requestLogger(req, _res, next) {
    logger.debug(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
    });
    next();
}
//# sourceMappingURL=requestLogger.js.map