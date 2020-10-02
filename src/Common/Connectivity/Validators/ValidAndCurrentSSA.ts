import { Validator } from "class-validator";
import { JWT } from "jose";
import moment from "moment";

export const ValidAndCurrentSSA = (ssa: string) => {
  if (! new Validator().isJWT(ssa) ) {
    throw `SSA is not a valid JWT`
  }

  let decoded = <any>JWT.decode(ssa,{complete:true});
  let diff = moment(decoded.payload.exp*1000).utc().diff(moment().utc(),'seconds');
  if (diff < 60) throw "The SSA is expiring too soon";
  return true;
}

