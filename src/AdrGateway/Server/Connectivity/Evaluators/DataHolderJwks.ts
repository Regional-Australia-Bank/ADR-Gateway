import { ClientCertificateInjector } from "../../../Services/ClientCertificateInjection";
import { DataholderOidcResponse, DataHolderRegisterMetadata } from "../Types";
import { axios } from "../../../../Common/Axios/axios";
import { JSONWebKeySet, JWKS } from "jose";
import _ from "lodash"

export const GetDataHolderJwks = (async (cert:ClientCertificateInjector, _: {DataHolderOidc: DataholderOidcResponse}) => {
  let url = _.DataHolderOidc.jwks_uri;

  let jwksObj = new Promise<JSONWebKeySet>((resolve,reject) => {
      axios.get(url,cert.injectCa({responseType:"json", timeout: 10000})).then(value => { // TODO configure timeout value
          resolve(value.data)
      },err => {
          reject(err)
      })
  })

  return JWKS.asKeyStore(await jwksObj)
})

export const GetDataHolderRevocationJwks = async ($:{DataHolderBrandMetadata:DataHolderRegisterMetadata}) => {
  let jwksEndpoints = _.map(_.filter($.DataHolderBrandMetadata.authDetails, d => d.registerUType == "SIGNED-JWT"),d => d.jwksEndpoint);

  let jwksObjs = await Promise.all(_.map(jwksEndpoints, url => new Promise<JSONWebKeySet>((resolve,reject) => {
      axios.get(url,{responseType:"json", timeout: 10000}).then(value => { // TODO configure timeout value
          resolve(value.data)
      },err => {
          reject(err)
      })
  })))

  let aggregated = {keys:_.flatten(jwksObjs.map(j => j.keys))}

  return JWKS.asKeyStore(aggregated)
}