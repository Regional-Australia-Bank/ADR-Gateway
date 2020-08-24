import * as Types from "./Types"
import { Dictionary } from "./Types";

export type EvaluatorInputArgs<Params,DependencyOutput> = Params extends {} ? (DependencyOutput extends {} ? [DependencyOutput & Params] : [Params]): (DependencyOutput extends {} ? [DependencyOutput] : [])

type CommsDependencyEvaluatorAtDependency<DependencyOutput,Params> = {
  intermediate: Partial<DependencyOutput>
  parameters: Params
}

type NodeDependencySpec<DependencyOutput,Params> = {
  do: Dependency<any,any,any>,
  when?:(ctx:CommsDependencyEvaluatorAtDependency<DependencyOutput,Params>) => boolean,
  disableCache?: boolean
}
export type NodeDependency<DependencyOutput,Params> = Dependency<any,any,any> | NodeDependencySpec<DependencyOutput,Params>;

export type DependencyOutput<P> = P extends Dependency<any,any,infer Output> ? Output: never;

const JSONEncodeUndefinedAsNull = ($) => {
  if (typeof $ == "undefined") return "null"
  return JSON.stringify($);
}

export class Dependency<Params,DependencyOutput,Output> {
  serializer: {
    Serialize: (o:Output) => string,
    Deserialize: (s:string) => Output
  }

  constructor(public spec: {
    name: string,
    evaluator: (...args:EvaluatorInputArgs<Params,DependencyOutput>) => Promise<Output>|Output,
    validator?: (output:Output) => Promise<boolean> | boolean
    dependencies?: NodeDependency<DependencyOutput,Params>[],
    parameters: Dictionary<(o:any) => string>,
    preassertions?: NodeDependency<DependencyOutput,Params>[],
    cacheTrail: (Dependency<any,any,any>)[],
    cache?: {
      noCache?: boolean
      minAge?: number
      maxAge?: number
    }
    serializer?: {
      Serialize: (o:Output) => string,
      Deserialize: (s:string) => Output
    }
    project?:{ [key:string]: (p:Params) => any }
  }) {
    this.serializer = spec.serializer || {
      Serialize: JSONEncodeUndefinedAsNull,
      Deserialize: JSON.parse
    }
  }

  public hasCache = () => {
    return (!this.spec.cache?.noCache);
  }
}