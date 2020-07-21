// Not consistent in healing scenario

import * as _ from "lodash";
import { In, Any } from "typeorm";
import { promises } from "dns";
import { EventEmitter } from "typeorm/platform/PlatformTools";
import {inspect} from "util"

type ExtractOutput<T> = T extends AbstractNeuron<any,any> ? T['output']:never;
type ExtractTupleOfNeuronOutputs<T> = { [K in keyof T]: ExtractOutput<T[K]> }
type TokenCollection = ({neuron:AbstractNeuron<any,any>,token:any})[]
type ExtensionTokenCollection = ({left:any,right:any,out:any})[]
type AggregationTokenCollection = {evaluators:any,out:any}[]
type Optional<T> = T | undefined
type EvaluationPolicy = 'Cache' | 'NoCache' // | 'HealCache'
interface InputOutputMap {
    input:any,
    output:any
}
type NeuronwiseIoCollection = {neuron:AbstractNeuron<any,any>,ioMap:InputOutputMap[]}[]

const sanitizeError = (err:any) => {
    if (err.isAxiosError) {
        let sanitized = inspect(_.pick(err,'config','request','response','data'));
        return sanitized;
    } else {
        return err;
    }
}

export const NO_CACHE_LENGTH = 10000000;

export interface EvaluationContext {
    tokenCache?:TokenCollection,
    extensionTokenCache?:ExtensionTokenCollection,
    aggregationTokenCache?:AggregationTokenCollection,
    neuronWiseIoCache?:NeuronwiseIoCollection,
    direction?:"rtl"|"ltr"
}

export type UnknownToVoid<T> = unknown extends T ? void : T;

export interface CachingImplementation<Output> {
    UpdateCache:(v:Output)=>Promise<void>;
    FetchCache:()=>Promise<Output>;
    EmptyCache:()=>Promise<void>;
}

abstract class ExtensionTree {
    constructor(public readonly extensionMaxLength:number) {}

    static Leaf = (n:Neuron<any,any>):ExtensionTree =>{
        if (!(n instanceof EncapsulationNeuron)) {
            return new ExtensionLeaf(n)
        } else {
            return n.GetEncapsulatedPath();
        }
    } 

    static Branch = (left:ExtensionTree,right:[ExtensionTree,...ExtensionTree[]]):ExtensionBranch => new ExtensionBranch(left,right)

    static LogicBranch = (trees:[ExtensionTree,...ExtensionTree[]]):ExtensionLogicBranch => new ExtensionLogicBranch(trees)

    static Tree = (n:AbstractNeuron<any,any>):ExtensionTree => {
        if (n instanceof Neuron) return ExtensionTree.Leaf(n);
        if (n instanceof CompoundNeuron) return ExtensionTree.Branch(ExtensionTree.Tree(n.GetFirstNeuron()),<any>_.map(n.GetPaths(),p => ExtensionTree.Tree(p)))
        throw 'ExtensionTree.Tree reached unexpected state'
    }

    static CalculateMaxExtensionsLength = (extensions: [ExtensionTree,...ExtensionTree[]]):number => {
        return _.max(_.map(<ExtensionTree[]>extensions,t=>t.extensionMaxLength)) || (() => {throw 'extensions[] is empty'})()
    }
}
class ExtensionBranch extends ExtensionTree {
    private rhsMaxLength:number;

    RhsMaxLength = () => this.rhsMaxLength;

    constructor(public left:ExtensionTree, public right:[ExtensionTree,...ExtensionTree[]]) {
        super(left.extensionMaxLength + ExtensionTree.CalculateMaxExtensionsLength(right));
        this.rhsMaxLength = this.extensionMaxLength - left.extensionMaxLength;
    }
}

class ExtensionLogicBranch extends ExtensionTree {

    constructor(public trees:[ExtensionTree,...ExtensionTree[]]) {
        super(ExtensionTree.CalculateMaxExtensionsLength(trees));
    }

}

class ExtensionLeaf extends ExtensionTree {
    constructor(public basicNeuron:Neuron<any,any>) {super(1)}

}

class OutputValidationException {
    constructor(public error?:any) {}
}

interface Logger {
    debug: (message: string, ...meta: any[]) => any
    info: (message: string, ...meta: any[]) => any
    warn: (message: string, ...meta: any[]) => any
    error: (message: string, ...meta: any[]) => any
}

let ComplainedAlready = false;
const Complain = () => {
    if (ComplainedAlready) return;
    console.warn("ConsoleLogger is in use. This is not recommended. Attach your own loggers with .WithLogger()")
    ComplainedAlready = true;
}

const DummyLogger:()=>Logger = () => {
    
    return {
        debug: (...e) => Complain(),
        info: (...e) => Complain(),
        warn: (...e) => Complain(),
        error: (...e) => Complain(),
    }
}
export interface SimpleNeuronCreationOptions<Output> {
    cache?: CachingImplementation<Output>,
    logger?: Logger
}

let idGenerator = 1

export abstract class AbstractNeuron<Input,Output> {
    public id?:string;

    
    constructor() {
        // setup some identifiers for logging
        let className = Object.getPrototypeOf(this).constructor.name
        this.id = `${className}-${idGenerator}`;
        idGenerator++;
    }

    logger:Logger = DummyLogger();;
    Logger = (logger:Logger) => {this.logger = logger; return this;}

    public input!:Input;
    public output!:Output;

    // Creates a new neuron by extending the output of this neuron to compatible other neurons supplied as arguments
    // Results in a new Neuron, which is evaluated by evaluating and concatenating the argument Neurons
    Extend = <N extends AbstractNeuron<Output,any>[]>(...neurons:N): N[1] extends undefined ? CompoundNeuron<Input,N[0]['output']>: CompoundNeuron<Input,ExtractTupleOfNeuronOutputs<N>> => {

        if (neurons.length < 1) throw 'May not call Extend with 0 arguments';

        let thisNeuron = this;

        let existingExtension = ExistingExtension(thisNeuron,neurons);
        if (existingExtension) {
            return <any>existingExtension
        }

        let newCompoundNeuron = new CompoundNeuron<any,any>();
        newCompoundNeuron.SetPaths(neurons);
        newCompoundNeuron.SetFirstNeuron(thisNeuron);
        newCompoundNeuron.Logger(this.logger);

        extensionCache.push({left:thisNeuron,right:neurons,extension:newCompoundNeuron})

        return <any>newCompoundNeuron;
    }

    Assert = <N extends AbstractNeuron<Output,any> | AbstractNeuron<void,any>>(neuron:N):CompoundNeuron<Input,Output> => {
        
        let assertionExpansion = this.Expand(<AbstractNeuron<Output,any>>neuron)        
        let assertionContraction = <CompoundNeuron<Input,Output>>assertionExpansion.Extend(Neuron.CreateSimple(async ([o,a]:[Output,ExtractOutput<N>]) => {
            return o;
        }))

        return assertionContraction;
    }

    Assume = this.Assert

    Expand = <N extends AbstractNeuron<otherIn,any>, otherIn extends Output>(otherNeuron:N):CompoundNeuron<Input,[Output,ExtractOutput<N>]>=> {
        let thisNeuron = this;

        let newCompoundNeuron = new CompoundNeuron<any,any>();
        newCompoundNeuron.SetPaths([Neuron.Passthru(),otherNeuron]);
        newCompoundNeuron.SetFirstNeuron(thisNeuron);
        newCompoundNeuron.Logger(this.logger);

        return <any>newCompoundNeuron;
    }

}

export class Neuron<Input,Output> extends AbstractNeuron<Input,Output> {

    static OutputValidationException(message?:string) {
        throw new OutputValidationException(message)
    }

    static Value = <P>(params:P):CompoundNeuron<void,P> => {
        return Neuron.NeuronZero().Extend(ValueNeuron.Create(params))
    }

    private validators:((o:Output) => Promise<boolean>|boolean)[] =[]

    public AddValidator(validator:(o:Output) => Promise<boolean>|boolean) {
        this.validators.push(validator);
        return this;
    }

    public Validate = async (o:Output):Promise<Output> => {
        try {
            let validStatuses = await Promise.all(_.map(this.validators,async v=>await v(o)))
            if (_.every(validStatuses)) {
                return o
            } else {
                throw 'Validation failed without throwing'
            } 
        } catch (err) {
            throw Neuron.OutputValidationException(err)
        }
    }

    protected isBasicNeuron:boolean = true;

    protected evaluator?:((arg0:Input) => Promise<Output>);

    protected cache: undefined | CachingImplementation<Output> = undefined

    public GetCache = () => this.cache

    protected inputNeuron?:Neuron<any,Input>

    protected outputPromise: Promise<Output>|undefined // stores ouput promises for successive values of traversalDepth

    public GetFirstNeuron = ():Neuron<Input,any> => {return this}
    public GetLastNeurons = ():Neuron<any,Output>[] => {return [this]}

    static NeuronZero(){
        return n0;
    }


    static Passthru<T>():Neuron<T,T> {
        return <any>nId
    }

    static Ignore():Neuron<any,void> {
        return <any>nIgnore
    }

    static Clip = Neuron.Ignore;
    
    static CreateSimple<NewInput,NewOutput>(f:(arg0:NewInput) => Promise<NewOutput> | NewOutput, options?: SimpleNeuronCreationOptions<NewOutput>):Neuron<UnknownToVoid<NewInput>,NewOutput>
    {
        let n = new Neuron<NewInput,NewOutput>();
        n.SetEvaluator((i:NewInput) => {
            const result = f(i);
            return Promise.resolve(result);
        });

        if (typeof options?.cache != 'undefined') n.WithCache(options?.cache)
        if (typeof options?.logger != 'undefined') n.Logger(options?.logger)
       
        return <any>n;
    }

    WithCache = (cachingImplementation:CachingImplementation<Output>) => {
        if (typeof this.cache != 'undefined') throw 'Cache implementation is already defined and cannot be overwritten'
        this.cache = cachingImplementation;
        return this;
    }



    static Presume = <N extends AbstractNeuron<void,any>>(neuron:N):CompoundNeuron<void,void> => {
        return Neuron.NeuronZero().Assert(neuron)
    }

    /**
     * Combines a set of Neuron pathways, attempting to evaluate in parallel with the shortest pathways evaluating first.
     * Assumes that the basic neurons in the pathway are not duplicated in order to preserve traversal cache.
     * Evaluating shortest pathways first is achieved by padding the shorter pathways until they reach the maximum MaxDepth
     */
    static Combined = <N extends CompoundNeuron<void,any>[]>(...neurons:N): N[1] extends undefined ? CompoundNeuron<void,N[0]['output']>: CompoundNeuron<void,ExtractTupleOfNeuronOutputs<N>> => {
        
        const targetMaxLength = _.max(_.map(neurons, n => n.GetMaxLength()))
        if (typeof targetMaxLength == 'undefined') {
            throw 'Combined was apparently called without arguments'
        }
        const paddedNeurons = neurons.map(n => n.PadRight(targetMaxLength))
        const n0 = Neuron.NeuronZero();
        return <any>n0.Extend.apply(undefined,paddedNeurons);
    }

    static Require = Neuron.Combined

    /**
     * Isolates a Neuron pathways into a single neuron, removing it from the traversal context of the containing pathway.
     * Evaluation of the Isolated neuron occurs in a new traversal context. As a result, caching can be separately controlled.
     */
    static Isolate = <Out,In>(IsolatedNeuron:Neuron<In,Out>, evaluationPolicy: EvaluationPolicy = 'Cache'): Neuron<In,Out> => {
        
        let input:In;

        let initNeuron = <Neuron<void,In>>Neuron.CreateSimple(() => input)
        let IsolatedPathway = initNeuron.Extend(IsolatedNeuron);

        let containerNeuron = Neuron.CreateSimple((i:In):Promise<Out> => {
            input = i;
            if (evaluationPolicy == 'Cache') return Promise.resolve(IsolatedPathway.Evaluate())
            if (evaluationPolicy == 'NoCache') return Promise.resolve(IsolatedPathway.Evaluate(undefined,{cacheIgnoranceLength:IsolatedPathway.GetMaxLength()}))
            //if (evaluationPolicy == 'HealCache')
            throw 'Not Implemented yet'
        })

        return <Neuron<In,Out>><unknown>containerNeuron;

    }

    /**
     * Neuron pathways can be encapsulated for the purpose of conditional execution.
     */
    static Encapsulate = <In,Out,Else extends CompoundNeuron<In,ElseOut>|CompoundNeuron<void,ElseOut>|undefined,ElseOut extends any>(logic:{when:((i:In)=>boolean),do:CompoundNeuron<In,Out>|CompoundNeuron<void,Out>,else?:Else}): Else extends undefined ? EncapsulationNeuron<In,Out,undefined> : EncapsulationNeuron<In,Out,ElseOut> => {

        if (logic.else instanceof CompoundNeuron) {

            let n = new EncapsulationNeuron<In,Out,ElseOut>(logic.do,logic.when,logic.else)
            return <any>n;
        } else {

            let elseNeuron = Neuron.CreateSimple((i:In) => undefined).Extend(Neuron.Passthru<undefined>())
            let n = new EncapsulationNeuron<In,Out,undefined>(logic.do,logic.when,<any>elseNeuron)
            return <any>n;
        }
    }

    // RemoveCaches = ():Neuron<Input,Output> => {
    //     return this;
    // }



    SetEvaluator = (f:(arg0:Input) => Promise<Output>) => {
        if (typeof this.evaluator !== 'undefined') throw 'Cannot set an evaluator as one already exists.'
        this.evaluator = f;
    }

    GetEvaluator = () => {
        if (typeof this.evaluator == 'undefined') throw 'No evaluator is defined'
        return this.evaluator;
    }

}

class EncapsulationNeuron<Input,Output,ElseOutput> extends Neuron<Input,Output> {

    constructor(
        private doNeuron:(CompoundNeuron<Input,Output>|CompoundNeuron<void,Output>),
        private conditionFn:((i:Input)=>boolean),
        private elseNeuron:(CompoundNeuron<Input,ElseOutput>|CompoundNeuron<void,ElseOutput>)
    ) {super()}

    GetEncapsulatedPath = ():ExtensionTree => {
        return ExtensionTree.LogicBranch([ExtensionTree.Tree(this.doNeuron),ExtensionTree.Tree(this.elseNeuron)])
    }

    EvaluateEncapsulated = async (i:Input,cacheIgnoranceLength:number,context:EvaluationContext):Promise<Output|ElseOutput> => {
        if (this.conditionFn(i)) {
            return await this.doNeuron.Evaluate(<any>i,{cacheIgnoranceLength,context})
        } else {
            return await this.elseNeuron.Evaluate(<any>i,{cacheIgnoranceLength,context});
        }

    }

}

const extensionCache:{left:AbstractNeuron<any,any>,right:AbstractNeuron<any,any>[],extension:CompoundNeuron<any,any>}[] = []

const ExistingExtension = (left:AbstractNeuron<any,any>,right:AbstractNeuron<any,any>[]):CompoundNeuron<any,any>|undefined => {
    for (let i = extensionCache.length - 1; i >= 0; i--) {
        let ext = extensionCache[i];
        if (left !== ext.left) continue;
        if (right.length !== ext.right.length) continue;
        let rightMatching:boolean = true;
        for (let j = 0; j < right.length; j++) {
            if (right[j] !== ext.right[j]) {
                rightMatching = false;
                continue;
            };
        }
        if (!rightMatching) continue;
        return ext.extension
    }
    return undefined
}


type Diff<T, U> = T extends U ? never : T;
type NotUndefined<T> = Diff<T, undefined>

export class CompoundNeuron<Input,Output> extends AbstractNeuron<Input,Output> {
    public events = new EventEmitter();

    constructor(protected isBasicNeuron:boolean = false) { super() }

    public AssertNotUndefined = ():CompoundNeuron<Input,NotUndefined<Output>> => {
        let n = <Neuron<Output,NotUndefined<Output>>><any>Neuron.CreateSimple((o) => o).AddValidator((o) => !_.isUndefined(o))
        return this.Extend(n);
    }

    public Clip = () => {
        return this.Extend(Neuron.Ignore());
    }

    public pathwayName?:string
    public Named = (pathwayName:string):CompoundNeuron<Input,Output> => {
        this.pathwayName = pathwayName;
        return this;
    }

    // TODO this is an anti-pattern. Should refactor Neuron and CompountNeuron to be siblings
    public Validate:never; // we won't permit a validator on a CompoundNeuron. 
    public AddValidator:never; // we won't permit a validator on a CompoundNeuron. 

    protected firstNeuron?:AbstractNeuron<Input,any>;
    protected paths?:AbstractNeuron<Input,any>[];

    public SetPaths = (paths:AbstractNeuron<Input,any>[]) => {
        if (typeof this.paths != 'undefined') {throw 'SetPaths may only be called once.'}
        this.paths = paths;
    }

    public GetPaths = ():AbstractNeuron<Input,any>[] => {
        if (typeof this.paths == 'undefined' || this.paths.length < 1) throw 'Compound neuron paths have not been defined'
        return this.paths;
    }

    public SetFirstNeuron = (neuron:AbstractNeuron<Input,any>) => {
        if (typeof this.firstNeuron != 'undefined') {throw 'SetFirstNeuron may only be called once.'}
        this.firstNeuron = neuron;
    }

    public GetFirstNeuron = ():AbstractNeuron<Input,any> => {
        if (typeof this.firstNeuron == 'undefined') throw 'SetFirstNeuron must be called before GetFirstNeuron.'
        return this.firstNeuron
    }

    public TraverseSync =  <O,L,Rel,lar,Agg>(
        leftFn:(o:O|undefined,n:AbstractNeuron<any,any>)=>L,
        rightFn:(o:O|undefined,n:AbstractNeuron<any,any>)=>Rel,
        leftAndRightFn:(l:L,rel:Rel)=>lar,
        agg:(lar:lar[],l:L)=>Agg,
        output:(agg:Agg)=>O,
        direction:'leftToRight'|'rightToLeft'='leftToRight'
    ):O => {
        let left = this.GetFirstNeuron();
        let right = this.GetPaths();
        let leftO:O|undefined;
        let rels:Rel[]
        let l:L;
        let a:Agg;

        const leftApply = () => {
            if (left instanceof CompoundNeuron) {
                leftO = left.TraverseSync(leftFn,rightFn,leftAndRightFn,agg,output,direction);
            } else {
                leftO = undefined;
            }
            return leftFn(leftO,left);
        }

        const rightApply = () => {
            rels = _.map(right,rel => {
                let relO:O|undefined
                if (rel instanceof CompoundNeuron) {
                    relO = rel.TraverseSync(leftFn,rightFn,leftAndRightFn,agg,output,direction);
                } else {
                    relO = undefined;
                }
                return rightFn(relO,rel)
            })

            return _.map(rels,leftAndRightFn.bind(undefined,l))
        }

        if (direction == 'leftToRight') {
            l = leftApply()
            const lar = rightApply()
            a = agg(lar,l)
        } else { // direction == 'rightToLeft'
            const lar = rightApply()
            l = leftApply()
            a = agg(lar,l)
        }

        let o = output(a)

        return o;
    }

    public Do = <ActionOut extends any>(action:CompoundNeuron<Output,ActionOut>|CompoundNeuron<void,ActionOut>):LogicBranchContext<Input,Output,ActionOut,any> => {
        return new LogicBranchContext(this,action);
    }

    public GetMaxLength = ():number => {
        return this.TraverseSync(
            (o,n) => (n instanceof CompoundNeuron) ? <number>o : (n instanceof EncapsulationNeuron) ? n.GetEncapsulatedPath().extensionMaxLength: 1,
            (o,n) => (n instanceof CompoundNeuron) ? <number>o : (n instanceof EncapsulationNeuron) ? n.GetEncapsulatedPath().extensionMaxLength: 1,
            (l,r)=> l + r,
            (lars) => <number>_.max(lars),
            x=>x,
        )
    }

    public PadRight = (targetLength:number):CompoundNeuron<Input,Output> => {
        let currentLength = this.GetMaxLength();
        if (currentLength > targetLength) throw 'Target length is less than currentLength';
        let neuron:CompoundNeuron<Input,Output> = this;
        for (let length = currentLength; length < targetLength; length++) {
            neuron = neuron.Extend(Neuron.Passthru<Output>())
        }
        return neuron;
    }

    // /**
    //  * Evaluate the output of this neuron by traversing dependencies.
    //  * Neurons may appear as a dependency more than once in the traversal tree. E.g. N2 depnds on N1, N3 depends on N1.
    //  * N1.Evaluate() will be called twice, but it's evaluator() will only be called once. This is ensured by the traversalCache.
    //  */
    public Evaluate = async (input?:Input,options?:{
        cacheIgnoranceLength?:number,
        context?: EvaluationContext
    }):Promise<Output> => {

        options = options || {}
        
        let context = options.context || {}

        const cacheIgnoranceLength = options.cacheIgnoranceLength || 0
        let tokenCache:TokenCollection = context.tokenCache || []
        let extensionTokenCache:ExtensionTokenCollection = context.extensionTokenCache || []
        let aggregationTokenCache:AggregationTokenCollection = context.aggregationTokenCache || []
        let neuronWiseIoCache:NeuronwiseIoCollection = context.neuronWiseIoCache || []
        let direction = context.direction || "rtl"

        context = {
            tokenCache,extensionTokenCache,aggregationTokenCache,neuronWiseIoCache,direction
        }
        
        let tokenEvaluationCache:{input:any,neuron:AbstractNeuron<any,any>,output:Promise<any>}[] = [];
        const alreadyPathEvaluated = (input:any,neuron:AbstractNeuron<any,any>):{already:true, result:Promise<any>}|{already:false} => {
            let ind = _.findIndex(tokenEvaluationCache,c => c.input === input.uniquenessTag && c.neuron === neuron);
            if (ind >= 0) {
                return {already:true,result:tokenEvaluationCache[ind].output}
            } else {
                return {already:false}
            }
        }
        const savePathEvaluation = (input:any,neuron:AbstractNeuron<any,any>,output:any) => {
            tokenEvaluationCache.push({input:input.uniquenessTag,neuron,output});
        }

        const alreadyIoEvaluated = (input:any,neuron:AbstractNeuron<any,any>):{already:true, result:Promise<any>}|{already:false} => {
            let thisNeuronIoCacheMap = _.find(neuronWiseIoCache,c=>c.neuron === neuron)?.ioMap;
            if (typeof thisNeuronIoCacheMap === 'undefined') return {already:false};

            let ind = _.findIndex(thisNeuronIoCacheMap,c => _.isEqual(c.input,input));
            if (ind >= 0) {
                return {already:true,result:thisNeuronIoCacheMap[ind].output}
            } else {
                return {already:false}
            }
        }
        const saveIoEvaluation = (input:any,neuron:AbstractNeuron<any,any>,output:any) => {
            let thisNeuronIoCache = _.find(neuronWiseIoCache,c=>c.neuron === neuron);
            if (!thisNeuronIoCache) {
                thisNeuronIoCache = {neuron,ioMap:[]}
                neuronWiseIoCache.push(thisNeuronIoCache)
            }

            thisNeuronIoCache.ioMap.push({input,output})
        }


        const tokenize = (o:Optional<{path:ExtensionTree,branchEvaluator:(input:()=>Promise<any>,maxLengthToRight:number) => Promise<any>}>,n:AbstractNeuron<any,any>) => {
            let token:NonNullable<typeof o>;

            let existingToken = _.find(tokenCache,tc=>tc.neuron === n);
            if (existingToken) return existingToken.token;
            
            if (typeof o == 'undefined') {
                if (!(n instanceof Neuron)) throw 'CompoundNeuron at the leaf';
                let thisPath = ExtensionTree.Leaf(n)
                let neuronOutputValidator = n.Validate;

                token = {
                    path: thisPath,
                    branchEvaluator: async (inputFn:()=>Promise<any>,maxLengthToRight:number):Promise<any> => {

                        const logContext = {inputFn,maxLengthToRight,neuronId:n.id};

                        // short cut. if this is NeuronZero, pass the input directly.
                        if (n === Neuron.NeuronZero()) {
                            this.logger.debug("NeuronZero evaluated",logContext)
                            return Promise.resolve(undefined);
                        }
                        if (n === Neuron.Passthru()) {
                            this.logger.debug("Passthru Neuron evaluated",logContext)
                            return await inputFn()
                        }

                        if (n instanceof EncapsulationNeuron) {
                            this.logger.debug("Passing evalutation through to encapsulation neuron",logContext)
                            return Promise.resolve(n.EvaluateEncapsulated(await inputFn(),Math.max(cacheIgnoranceLength - maxLengthToRight,0),context))
                        }
                        let neuronEvaluator = n.GetEvaluator();

                        this.logger.debug("Neuron: Evaluating branch",logContext)

                        // if already evaluated in this traversal, output from traversalCache
                        let pathE = alreadyPathEvaluated(inputFn,n)
                        if (pathE.already) {
                            this.logger.debug("Neuron: Path cache hit",logContext)
                            return await pathE.result;
                        } else {
                            this.logger.debug("Neuron: Path cache miss",logContext)
                        }

                        let ioE = alreadyIoEvaluated(input,n)
                        if (ioE.already) {
                            this.logger.debug("Neuron: Io cache hit",logContext)
                            return ioE.result;
                        } else {
                            this.logger.debug("Neuron: Io cache miss",logContext)
                        }

                        let staticInput:any;
                        let evaluatedByInputValue:boolean = false;

                        const evaluationPromise = new Promise<any>((resolve,reject) => {

                            const neuronCacheImpl = n.GetCache();

                            // if this neuron has a cache implementation, use it.
                            let neuronCachePromise = new Promise<any>((cacheResolve,cacheReject) => {                                
                                if (typeof neuronCacheImpl == 'undefined'){
                                    this.logger.debug("Neuron: No caching implementation",logContext)
                                    return cacheReject('Neuron: No caching implementation');
                                }
                                if (maxLengthToRight < cacheIgnoranceLength) {
                                    this.logger.debug("Neuron: Caching ignored for this evaluation",logContext)
                                    return cacheReject('Neuron: Caching ignored for this evaluation')
                                }
                                neuronCacheImpl.FetchCache().then(cachedValue => {
                                    // check for lazy cache implementations - we eould never expect an undefined value from a cache
                                    if (typeof cachedValue == 'undefined') {
                                        this.logger.warn("Neuron: Cache value was undefined",logContext)
                                        return cacheReject('Neuron: Cache value was undefined')
                                    }
                                    this.logger.debug("Neuron: Fulfilling from cache",logContext,{output:cachedValue})
                                    return cacheResolve(cachedValue)
                                },cacheReject)                                
                            });

                            let noCacheFallbackPromise = new Promise<any>((fallbackResolve,fallbackReject) => {
                                neuronCachePromise
                                .then(fallbackResolve)
                                .catch(async reason => {
                                    this.logger.debug("Neuron: No cache available, Proceed to evaluate.",logContext)
                                    inputFn().then((inp)=> {
                                        this.events.emit('input_evaluated',n,inp)
                                        saveIoEvaluation(inp,n,evaluationPromise)
                                        return inp
                                    }).then(neuronEvaluator).then((output) => {
                                        this.events.emit('output_evaluated',n,output)
                                        this.logger.debug("Neuron: Evaluation completed",logContext,{inputFn,output})
                                        fallbackResolve(output)
                                    },(err) => {
                                        this.events.emit('evaluation_error',n, err)
                                        this.logger.info("Neuron: Evaluation failed",logContext,{err})
                                        fallbackReject(err)
                                    })
                                })
                            })

                            let validationPromise = noCacheFallbackPromise.then(neuronOutputValidator);

                            validationPromise.then(() => {
                                this.logger.debug("Neuron: Validated",logContext)
                            }, err => {
                                this.logger.info("Neuron: Output validation failed",logContext,{err})
                            })

                            let cacheUpdatePromise = validationPromise.then(async output => {
                                if (typeof neuronCacheImpl == 'undefined') return output; // if no cache, return output
                                
                                // Only update if the cache was not used
                                await neuronCachePromise.catch(() => {
                                    return neuronCacheImpl.UpdateCache(output).then(success => {
                                        this.logger.debug("Neuron: Cache update success",logContext)
                                        return output
                                    }, failure => {
                                        this.logger.warn("Neuron: Cache update failed",logContext,{failure})
                                        return output
                                    })       
                                })

                                return output;

                            })
                            cacheUpdatePromise.then(resolve,reject);               
                        });


                        savePathEvaluation(inputFn,n,evaluationPromise)
                        return evaluationPromise
                        
                    }
                }
            } else {
                token = o;
            }

            (<any>token).neuron = n; // TODO remove

            tokenCache.push({neuron:n,token})

            return token;
        }

        // We will traverse the patway to build an async function which evaluates the chain
        // TODO onceify this is the context of a CompoundNeuron so that it does not need to be traversed on every evaluation.
        const pathwayToken = this.TraverseSync(
            tokenize,
                tokenize,
                (l,r) => {
                    let existingToken = _.find(extensionTokenCache,tc=>_.isEqual(tc.left,l.branchEvaluator) && _.isEqual(tc.right,r.branchEvaluator));
                    if (existingToken) return existingToken.out;

                    let evaluator = async (input:() => Promise<any>,maxLengthToRight:number) => {

                        if (typeof r.branchEvaluator === 'undefined') throw 'Right hand side is not defined'
                        let evaluationPromise = await r.branchEvaluator(input,maxLengthToRight).catch((err:any) => {
                            throw err;
                        })
                        return evaluationPromise;
                    }

                    let out = {
                        r,
                        evaluator
                    }

                    extensionTokenCache.push({left:l.branchEvaluator,right:r.branchEvaluator,out})

                    return out;
                },
                (rs,l) => {
                    // consider the left token
                    // the left token has an evaluator and a path of basic Neurons
                    // the right token has an evaluator and a path of basic Neurons
                    // the task is to create a higher level path and evaluator from the left and right

                    let rPaths = _.map(rs,t=>t.r.path);
                    let aggregatePath = ExtensionTree.Branch(l.path,<[ExtensionTree,...ExtensionTree[]]>rPaths)

                    let rEvaluators = _.map(rs,t=>t.evaluator);

                    let existingEvaluator = _.find(aggregationTokenCache,tc=>_.isEqual(tc.evaluators,rEvaluators));
                    if (existingEvaluator) return {
                        path: aggregatePath,
                        branchEvaluator: existingEvaluator.out
                    };

                    let rightAggregateEvaluator = async (input:() => Promise<any>,maxLengthToRight:number) => {
                        return async () => {
                            let evaluated = await Promise.all(_.map(rEvaluators,async rEvaluator => await rEvaluator(input,maxLengthToRight)))
    
                            if (evaluated.length == 0) throw 'At least 1 output expected';
                            if (evaluated.length == 1) {
                                return evaluated[0]
                            }
                            return evaluated;
                        }
                        
                    }

                    let extensionEvaluator = async (input:() => Promise<any>,maxLengthToRight:number) => {
                        try {
                            let leftEvalFn = async () => { // there is a new leftEvalFn for each evaluation, this is a problem if the function is used to index a cache.
                                let leftOutput = await l.branchEvaluator(input,maxLengthToRight + aggregatePath.RhsMaxLength());
                                return leftOutput
                            }

                            (<any>leftEvalFn).uniquenessTag = extensionEvaluator

                            let rightAggOutput:() => Promise<any>;
                            if (direction == "ltr") {
                                // always evaluate the left output before calling the right evaluator
                                let leftOutput = await leftEvalFn();
                                rightAggOutput = await rightAggregateEvaluator(leftEvalFn,maxLengthToRight);
                            } else {
                                // direction == "rtl"
                                // evaluate the right output with the left output function as an argument

                                rightAggOutput = await rightAggregateEvaluator(leftEvalFn,maxLengthToRight);
                            }

                            return await rightAggOutput();                           
                        } catch (err) {
                            // console.error(err);
                            throw err;
                        }
                    }

                    let token = {
                        path: aggregatePath,
                        branchEvaluator: extensionEvaluator
                    }

                    // using rEvaluators could be the cause of a weird BUG in the future
                    aggregationTokenCache.push({evaluators:rEvaluators,out:extensionEvaluator})

                    return token;
                },
                agg => agg,
                'leftToRight'
            )

        this.logger.debug("CompoundNeuron: Evaluating",{cacheIgnoranceLength,neuronId:this.id,name: this.pathwayName})

        
        const inputFn = () => Promise.resolve(input)


        const pathwayEvaluationPromise = pathwayToken.branchEvaluator(inputFn,0); //undefined because the leaves of the tree expect an undefined input
        // return await pathwayEvaluationPromise;
        let result = pathwayEvaluationPromise.then(output => {
            this.logger.debug("CompoundNeuron: Evaluated",{cacheIgnoranceLength,neuronId:this.id,name: this.pathwayName, output})
            return output;
        },err => {
            let innerError = sanitizeError(err)
            this.logger.debug("CompoundNeuron: Evaluation failed",{cacheIgnoranceLength,neuronId:this.id,name: this.pathwayName, innerError})            
            return Promise.reject({message:`Evaluation failed for ${this.pathwayName} (id: ${this.id})`,cacheIgnoranceLength,neuronId:this.id,name: this.pathwayName, innerError});
        });

        return await result;
    }



    
    public GetWithHealing = async (validator?:((output:Output) => Promise<boolean>|boolean),direction:"ltr"|"rtl" = "rtl"):Promise<Output> => {
        // TODO test with healers at all points along the chain. Not sure about the boundary values for depth

        validator = validator || (() => true);

        this.logger.debug("CompoundNeuron: GetWithHealing started",{neuronId:this.id,name: this.pathwayName})

        let maxHealingLength = this.GetMaxLength();
        if (process.env.DISABLE_HEALING && process.env.DISABLE_HEALING === "true") {
            maxHealingLength = 0;
        }
        for (let cacheIgnoranceLength = 0; cacheIgnoranceLength <= maxHealingLength; cacheIgnoranceLength++) {
            this.logger.debug("CompoundNeuron: GetWithHealing: Setting healing depth.",{neuronId:this.id,name: this.pathwayName, cacheIgnoranceLength})

            try {
                let output = await this.Evaluate(undefined,{cacheIgnoranceLength,context:{direction}})
                let valid = await validator(output);
                if (valid) {
                    this.logger.debug("CompoundNeuron: GetWithHealing: Validated and healed",{neuronId:this.id,name: this.pathwayName, cacheIgnoranceLength, output})
                    return output;
                }
            } catch (e) {
                if (e instanceof OutputValidationException) {
                    this.logger.debug("CompoundNeuron: GetWithHealing: Failed validation",{neuronId:this.id,name: this.pathwayName, cacheIgnoranceLength})
                    // Do nothing - this is an expected part of the healing process
                    // console.log(JSON.stringify(e)) // TODO remove console reference
                } else {
                    this.logger.error("CompoundNeuron: Unexpected error",{neuronId:this.id,name: this.pathwayName, cacheIgnoranceLength})
                    // We will not throw e, but allow healing to continue
                }
            }
        }

        throw 'GetWithHealing: Maximum depth reached with no valid output.'
    }

}

export class ValueNeuron<T> extends Neuron<void,T> {
    private value!: T;
    hasDependency = false;

    init = (v:T) => {
        this.value = v;
    }

    protected evaluator:(() => Promise<T>) = () => {
        if (typeof this.value == 'undefined') throw 'No value. ValueNeuron.init() was not called. Create with ValueNeuron.Create()'
        return Promise.resolve(this.value)
    };

    static Create<V>(v:V) {
        let n = new ValueNeuron<V>();
        n.init(v);
        return n;
    }
}

const n0 = Neuron.CreateSimple(() => {
    return;
});

const nId = Neuron.CreateSimple<any,any>((x:any) => x);

const nIgnore = Neuron.CreateSimple((x:any) => undefined);

class LogicBranchContext<BaseIn,BaseOut,ActionOut,ElseOut> {
    constructor(private baseNeuron: CompoundNeuron<BaseIn,BaseOut>, private action: CompoundNeuron<void, ActionOut>|CompoundNeuron<BaseOut, ActionOut>) {}
    
    private conditionFn!:((i:BaseOut)=>boolean)

    When = (conditionFn:(i:BaseOut) => boolean):LogicBranchContext<BaseIn,BaseOut,ActionOut,undefined> => {
        if (typeof this.conditionFn != 'undefined') throw 'conditionFn has already been set'
        this.conditionFn = conditionFn;
        return this;
    }

    Else = <Else extends CompoundNeuron<void, eOut>|CompoundNeuron<BaseOut, eOut>,eOut extends any>(elseAction:Else):CompoundNeuron<BaseIn,ActionOut|Else["output"]> => {
        let capsule = Neuron.Encapsulate({when:this.conditionFn,do:this.action,else:elseAction});
        return <any>this.baseNeuron.Extend(capsule)
    }

    EndDo = ():CompoundNeuron<BaseIn,ActionOut|undefined> => {
        let pw = this.Else(Neuron.CreateSimple(() => undefined).Extend(Neuron.Passthru<undefined>()))
        return pw;
    }
        

}