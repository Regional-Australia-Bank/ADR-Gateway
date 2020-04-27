import { IncomingMessage } from "http";

function SingleHeader(req:IncomingMessage,headerName:string): string {
    let val = req.headers[headerName];
    if (typeof val != 'string') {throw `Expected single request header to be supplied: ${headerName}`};
    return val
}

function ExtractBearerToken(val:string): string {
    if (!val.startsWith("Bearer ")) throw new Error("Bearer token expected but not supplied");
    
    let token:string = val.substr("Bearer ".length);  
    return token;  
}

export {ExtractBearerToken,SingleHeader}