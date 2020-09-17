import { Dependency, NodeDependency, DependencyOutput } from "./Dependency"
import _ from "lodash"
import { AbstractCache, CacheImplementationStatus } from "./Cache/AbstractCache";
import winston from "winston";
import { Dictionary } from "tsyringe/dist/typings/types";

const InnerError = (message, innerError) => ({
  message,
  innerError
})

type CacheResult = {
  disabledInConfig: true
} | ({
  disabledForHealing?: boolean,
  disabledInConfig: false,
} & CacheImplementationStatus)

export class CommsDependencyEvaluator {

  public intermediate:object = {};
  public parameters:object;
  private cachingDependencies:Dependency<any,any,any>[] = []

  public evaluationCache:Dictionary<any> = {}

  private cacheEnabled = (node:Dependency<any,any,any>) => {
    return (_.indexOf(this.cachingDependencies,node) >= 0)
  }

  constructor(private cache:AbstractCache, private logger:winston.Logger) {}

  private isEvaluated = (key: Dependency<any,any,any>):boolean => {
    if (Object.keys(this.evaluationCache).indexOf(key.spec.name) >= 0) {
      return true;
    } else {
      return false;
    }
  }

  private getExecutionValue = (key: Dependency<any,any,any>):any => {
    if (this.isEvaluated(key)) {
      return this.evaluationCache[key.spec.name];
    } else {
      throw 'Unexpected condition: key is not in cache'
    }
  }

  public fromCache = async (node: Dependency<any,any,any>, parameterValues: any):Promise<CacheResult> => {

    const cacheDisabled = node.spec.cache && node.spec.cache.noCache
    if (cacheDisabled) {
      return {
        disabledInConfig: true
      }
    } else {
      let status = await this.cache.FetchCache(node,parameterValues)
      return _.merge({disabledInConfig:<false>false},status)
    }

  }

  public updateCache = async (node: Dependency<any,any,any>, parameterValues: any, result:any):Promise<void> => {
    // only use the direct parameters of the node
    await this.cache.UpdateCache(node,parameterValues,result)
  }

  private evaluateDependencies = async (node: Dependency<any,any,any>) => {
    const out = {}
    for (let dep of node.spec.dependencies || []) {
      let {depName,value} = await this.evaluateNodeDependency(dep)
      if (depName) {
        out[depName] = value
      }
    }
    return out;
  }

  private evaluatePreassertions = async (node: Dependency<any,any,any>) => {
    for (let dep of node.spec.preassertions || []) {
      await this.evaluateNodeDependency(dep)
    }
  }

  private evaluateNodeDependency = async (dep: NodeDependency<any,any>) => {
    if (dep instanceof Dependency) {
      let depName = dep.spec.name
      this.intermediate[depName] = await this.evaluate(dep,this.parameters)
      return {depName, value:this.intermediate[depName]}
    } else {
      let conditionSatisfied = true
      if (dep.when) {
        conditionSatisfied = dep.when(this)
      }
      let depName = dep.do.spec.name
      if (conditionSatisfied) {
        this.intermediate[depName] = await this.evaluate(dep.do,this.parameters)
        return {depName, value:this.intermediate[depName]}  
      } else {
        return {}
      }
    }
  }

  private expandParameters = (node: Dependency<any,any,any>) => {
    if (node.spec.project) {
      for (let [k,f] of Object.entries(node.spec.project)) {
        let v = f(this.parameters);
        this.parameters[k] = v;
      }
    }
  }

  private remember = (key: Dependency<any,any,any>, result:any) => {
    this.evaluationCache[key.spec.name] = result;
    return result;
  }

  private evaluate = async (node: Dependency<any,any,any>, parameters:any) => {

    this.parameters = parameters;
    this.expandParameters(node);


    const logContext:{
      node: string,
      parameters:any,
      output?: any,
      intermediate?:object,
      dependencyValues?: any
    } = {node:node.spec.name, parameters};
    this.logger.silly("CommsDependency: Evaluation start",logContext)

    // Evaluate preassertions
    this.logger.silly("CommsDependency: Evaluating preassertions",logContext)
    await this.evaluatePreassertions(node)

    // Do not run evaluations twice in the same context. Check if the CommsDependencyEvaluator already has a result. If so, return.
    if (this.isEvaluated(node)) {
      this.logger.silly("CommsDependency: cache hit",logContext)
      return this.getExecutionValue(node);
    } else {
      this.logger.silly("CommsDependency: cache miss",logContext)
    }

    // Check the cache before evaluating
    const cacheResult = await this.fromCache(node,parameters);
    if (cacheResult.disabledInConfig === false) {
      if (cacheResult.inCache) {

        let outputIsValid = true;
        try {
          if (node.spec.validator) {
            outputIsValid = await Promise.resolve(node.spec.validator(cacheResult.value))
          }
        } catch {
          outputIsValid = false;
        }

        if (outputIsValid) {
          if (cacheResult.tooFreshToUpdate) {
            // tooFreshToUpdate will be set if the cache has a minimumValidity period and that period is still not expired. For example: We will avoid excessive communication with the register in case of some unrecoverable data holder error by setting a minimum validity period on the Register resources.
            this.logger.silly("CommsDependency: Cache is too fresh to update. Fulfilling from cache.",_.merge(logContext,{output:cacheResult.value}))
            return this.remember(node,cacheResult.value)
          } else {
            if (cacheResult.expired) {
              this.logger.silly("CommsDependency: Cache expired. Proceed to re-evaluate.",_.merge(logContext,{output:cacheResult.value}))
            } else {
              if (this.cacheEnabled(node)) {
                this.logger.silly("CommsDependency: Cache is not expired and allowed for this iteration. Fulfilling from cache.",_.merge(logContext,{output:cacheResult.value}))
                return this.remember(node,cacheResult.value)
              } else {
                this.logger.silly("CommsDependency: Cache is not expired but expressly ignored for this iteration for healing. Proceed to re-evaluate.",_.merge(logContext,{output:cacheResult.value}))
              }
            }  
          }
        } else {
          this.logger.silly("CommsDependency: Cache output could not be validated",logContext)
        }
        // if the output is not valid, we will never use the cached value  
      } else {
        this.logger.silly("CommsDependency: No value in cache",logContext)
      }
    } else {
      this.logger.silly("CommsDependency: No caching implementation. Proceed to evaluate.",logContext)
    }

    // Do a full evaluation if the cache could not fulfill the request.
    this.logger.silly("CommsDependency: Evaluating dependencies",logContext)
    let dependencyValues:any;
    try {
      dependencyValues = await this.evaluateDependencies(node)
      logContext.dependencyValues = dependencyValues
      this.logger.debug("CommsDependency: Evaluated dependencies",logContext)  
    } catch (error) {
      this.logger.debug("CommsDependency: Evaluating dependencies failed",_.merge(logContext,{error}))  
      throw InnerError("CommsDependency:  Evaluating dependencies failed",error);
    }
    let result:any;
    try {
      result = await node.spec.evaluator(_.merge({},dependencyValues,parameters))
      logContext.output = result
      this.logger.debug("CommsDependency: Evaluation completed",logContext)  
    } catch (error) {
      this.logger.debug("CommsDependency: Evaluation failed",_.merge(logContext,{error}));
      error = _.merge(error,logContext)
      throw InnerError("CommsDependency: Evaluation failed",error)
    }
    let outputIsValid;
    try {
      outputIsValid = ((!node.spec.validator) || await node.spec.validator(result))
      if (!outputIsValid) throw 'Validator returned false'
      this.logger.debug("CommsDependency: Output Validated",logContext)
    } catch (error) {
      this.logger.debug("CommsDependency: Output validation failed",logContext,{error})
      throw InnerError("CommsDependency: Output validation failed",error);
    }


    // Update the cache
    if (node.hasCache()) {
      try {
        await this.updateCache(node,parameters,result)
        this.logger.info("CommsDependency: Cache update success",logContext,{newValue:result})
      } catch (error){
        this.logger.error("CommsDependency: Cache update failed",logContext,{error})
      }
    } else {
      this.logger.debug("CommsDependency: No cache to update",logContext)
    }

    return this.remember(node,result);

  }

  public get = async <P extends Dependency<any,any,any>>(node: P, parameters:any, options?:{
    maxHealingIterations?: number,
    ignoreCache?: "top" | "all",
    validator?:((output:any) => Promise<boolean>|boolean)
  }):Promise<DependencyOutput<P>> => {

    const validator = (options?.validator) || (() => true);

    // Get the list of dependencies that have caches enabled in Dependencies.yml
    let cacheTrail:Dependency<any,any,any>[] = _.clone(node.spec.cacheTrail);

    if (!(node.spec.cache && node.spec.cache.noCache)) {
      // apply ignoreCache
      if (options?.ignoreCache !== "top") {
        cacheTrail.push(node)
      }
    }
      // apply ignoreCache == all
      if (options?.ignoreCache == "all") {
      cacheTrail = []
    }

    // Can be any number >= 1
    const maximumHealingIterations = Math.min(
      (options?.maxHealingIterations) || parseInt(process.env.MAXIMUM_HEALING_ITERATIONS || "3"), // from config
      cacheTrail.length // Don't have maximumHealingIterations > cacheTrail.length, as this would cause redundant retries with no change in the enabled cachingDependencies
    )


    const logMeta:{
      node: string,
      cacheTrail: string[]
      maximumHealingIterations: number,
      iteration?: number,
      caches?: string[],
      result?: any
    } = {node: node.spec.name, cacheTrail: cacheTrail.map(t => t.spec.name), maximumHealingIterations}
    this.logger.debug("CommsDependency: Get: started",logMeta)

    // the first iteration 0 is not a "healing"
    // healing is controlled by gradually switching caches off, i.e. setting this.cachingDependencies to cacheTrail and gradually trimming off the later caches
    let lastError:any;
    for (let i = 0; i <= maximumHealingIterations; i++) {
      this.cachingDependencies = cacheTrail.slice(0,Math.max(0,cacheTrail.length - Math.ceil(cacheTrail.length*i/maximumHealingIterations)))
      logMeta.iteration = i;
      logMeta.caches = this.cachingDependencies.map(p => p.spec.name)

      this.logger.silly(`CommsDependency: Get: iteration ${i}`,logMeta)
      try {
        this.evaluationCache = {}
        let result = await this.evaluate(node,parameters)
        logMeta.result = result;
        this.logger.debug(`CommsDependency: Get: iteration ${i} success`,logMeta)

        let validationError:any;
        let valid = await Promise.resolve(validator(result)).catch(err => {validationError = err; return false;});
        if (valid) {
          this.logger.debug(`CommsDependency: Get: iteration ${i} output is valid. Returning.`,logMeta)
          return result;
        } else {
          this.logger.debug(`CommsDependency: Get: iteration ${i} output is invalid. Continue healing.`,logMeta)
          throw InnerError('Validation failed.',validationError);
        }
      } catch (error) {
        lastError = error
        this.logger.warn(`CommsDependency: Get: iteration ${i} failed`,_.merge({},logMeta,{error}))
      }
    }

    this.logger.error(`CommsDependency: Get: no more healing iterations after ${maximumHealingIterations}`,_.merge({},logMeta,{lastError}))
    throw InnerError(`CommsDependency: Get: Final iteration ${maximumHealingIterations} failed`,_.merge({},logMeta,{lastError}))

  }

}