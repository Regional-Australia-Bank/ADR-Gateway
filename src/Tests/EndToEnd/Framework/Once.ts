const cache:{
    _id: any,
    result: any
}[] = []

export const Once = <T extends any[]>(fn: (...args:T) => any, ...args:T) => {
    return Promise.resolve(fn.apply(undefined,args))
}