export class HttpError extends Error {
    constructor(
        public readonly status: number,
        message: string,
        public readonly fields?: Record<string, string>,
    ) {
        super(message);
    }
}
