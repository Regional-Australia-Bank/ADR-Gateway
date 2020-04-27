import express from "express";
import { NextFunction } from "connect";
export const CatchPromiseRejection = (fn:((req:express.Request,res:express.Response) => Promise<any>)) => {
    let middleware = async (req:express.Request,res:express.Response,next: NextFunction) => {
        try {
            let result = await fn(req,res);
            next()
        } catch (err) {
            next(err)
        }    
    }
    return middleware
}