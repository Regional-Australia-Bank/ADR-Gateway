interface MapsToHttpErrorCode {
    code: number
    reason?: string
}

export class NoneFoundError extends Error implements MapsToHttpErrorCode {
    code = 404

    constructor(message?:string) {
        super(message)
    }
}

export class ConflictError extends Error {
    code = 409

    constructor(message?:string) {
        super(message)
    }
}