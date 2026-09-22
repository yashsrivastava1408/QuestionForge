interface RateLimiterOptions {
    windowMs: number;
    max: number;
    message?: string;
}
export declare function createRateLimiter(options: RateLimiterOptions): import("express-rate-limit").RateLimitRequestHandler;
export declare const generateRateLimiter: import("express-rate-limit").RateLimitRequestHandler;
export {};
//# sourceMappingURL=rateLimiter.d.ts.map