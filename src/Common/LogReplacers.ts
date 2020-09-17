import { AxiosRequestConfig, AxiosResponse } from "axios"
import _ from "lodash"

export const requestFormatter = (c:AxiosRequestConfig) => {
  return {
      url: c?.url,
      method: c?.method,
      headers: c?.headers,
      data: c?.data,
  }
}

export const responseFormatter = (o:AxiosResponse) => {
  return {
      status:o?.status,
      statusText:o?.statusText,
      headers:o?.headers,
      data:o?.data
  }
}


export const combineReplacers = (...replacers) => {
  return (k,v) => {
    for (let r of replacers) {
      v = r(k,v)
    }
    return v;
  }
}

export const axiosReplacer = (k,v) => {
  if (v && v.isAxiosError) {
    let result = _.merge({
      request: requestFormatter(v.config),
      response: responseFormatter(v.response),
    },_.pick(v,"message","name","description","number","fileName","lineNumber","columnNumber","stack","code"));
    return result;
  } else {
    return v
  }
}

export const configReplacer = (k,v) => {
  if (k == "mtls" && v && v.key) {
    return "<MTLS configuration>"
  } else if (typeof k == "string" && k.toLowerCase() == "password") {
    return "<Password>"
  } else if (typeof k == "string" && k.toLowerCase() == "keys") {
    return "<JWK[]>"
  } else {
    return v
  }
}

export const errorReplacer = (k,v) => {
	if (v instanceof Error) {
    const replaced = {}
    _.merge(replaced,_.pick(v,'message','name','stack'))
    _.merge(replaced,v)
		return replaced
	} else {
    return v
  }
}

const CredType = $ => {
  if (typeof $ == "undefined") {
      return undefined
  }
  if (typeof $ == "string") {
      return "<string>"
  }
  if (Buffer.isBuffer($)) {
      return "<Buffer>"
  }
  if (Array.isArray($)) {
      if (typeof $[0] === "string") {
          return "<string[]>"
      } else {
          return "<Buffer[]>"
      }
  }
  return `<${typeof $}>`
}