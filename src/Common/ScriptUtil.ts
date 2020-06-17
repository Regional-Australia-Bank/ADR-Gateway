export const TryOrUndefined = (fn:() => any) => {
    try {
        return fn()
    } catch (e) {
        return undefined;
    }
}