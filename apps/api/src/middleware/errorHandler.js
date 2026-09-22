import { logger } from '../utils/logger.js';
export function errorHandler(err, req, res, _next) {
    logger.error('Unhandled error', {
        message: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method,
    });
    const statusCode = err.statusCode ?? 500;
    res.status(statusCode).json({
        success: false,
        error: {
            message: process.env.NODE_ENV === 'production'
                ? 'An internal server error occurred'
                : err.message,
            ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
        },
    });
}
export class AppError extends Error {
    statusCode;
    constructor(message, statusCode = 500) {
        super(message);
        this.statusCode = statusCode;
        this.name = 'AppError';
    }
}
//# sourceMappingURL=errorHandler.js.map