import { axios } from "../../../../Common/Axios/axios"

export const GetRegisterJWKS = async (registerJwksUri:string):Promise<object> => {
    return (await axios.get(registerJwksUri,{responseType:"json"})).data
}