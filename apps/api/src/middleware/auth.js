import jwt from 'jsonwebtoken';
import { AppError } from './errorHandler.js';
export function authenticate(req, _res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token)
        throw new AppError('Authentication required', 401);
    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        req.user = payload;
        next();
    }
    catch {
        throw new AppError('Invalid or expired token', 401);
    }
}
export function authorize(...roles) {
    return (req, _res, next) => {
        if (!req.user)
            throw new AppError('Authentication required', 401);
        if (!roles.includes(req.user.role)) {
            throw new AppError('You do not have permission to perform this action', 403);
        }
        next();
    };
}
//# sourceMappingURL=auth.js.map