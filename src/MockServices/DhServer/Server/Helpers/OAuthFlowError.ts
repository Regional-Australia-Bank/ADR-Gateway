import {Response} from "express-serve-static-core"
import _ from "lodash"

export const SendOAuthError = (res:Response, redirect_uri:string, state:string, error: string, error_description?: string) => {
    let responseData:any = _.omitBy({
        state,
        error,
        error_description: error_description !== "" ? error_description : undefined,
    }, _.isNil);
    
    let fragment = _.map(responseData,(v,k) => encodeURIComponent(k)+"="+encodeURIComponent(v)).join("&")
    let newUrl = redirect_uri + "#" + fragment;
    return res.redirect(newUrl)    
}