import { injectable, inject } from "tsyringe";
import winston from "winston"
import { Neuron, AbstractNeuron } from "../../../Common/Connectivity/Neuron";
import { PathwayFactory } from "../../../Common/Connectivity/PathwayFactory";

type NeuronCreationParameters<C> = C extends SomeConstructor ? ConstructorParameters<C>:(C extends SomeFunction ? Parameters<C> : never);
type SomeConstructor = new(...args:any) => Neuron<any,any>
type SomeFunction = (...args:any) => any
type MakeResult<C> = C extends new(...args:any) => Neuron<infer I, infer O> ? Neuron<I,O> : (C extends (...args:any) => Neuron<infer fI,infer fO> ? Neuron<fI,fO>: never)

@injectable()
export class NeuronFactory {
    constructor(
        @inject("Logger") private logger: winston.Logger
    ) {}
    
    Simple = <I,O>(f:(arg0:I) => Promise<O> | O) => {
        return Neuron.CreateSimple(f).Logger(this.logger)
    }

    Make = <C extends (SomeConstructor|SomeFunction)>(c:C,...args:NeuronCreationParameters<C>):MakeResult<C> => {
        let newArgs = <any[]>(args || [])
        // If a class is supplied, return a new instance
        let neuron:Neuron<any,any>
        if (Object.getPrototypeOf(c).name == "Neuron") {
            neuron = new (<any>c)(...newArgs)
        } else {
            // Otherwise, it is a function, so wrap it in a Neuron
            neuron = (<any>c)(...newArgs)
        }
        return <any>neuron.Logger(this.logger)
    }

    Passthru = <T>() => {
        return Neuron.Passthru<T>().Extend(Neuron.Passthru<T>());
    }

    Input = this.Passthru

    GenerateOnce = <FN extends (...args: any[]) => AbstractNeuron<Input, any>,Input extends any>(fn: FN, tag?:string): FN => {
        return <any>PathwayFactory.GenerateOnce((...innerArgs:any[]) => fn.apply(undefined,innerArgs).Logger(this.logger),tag)
    }

    Parameterize = <FN extends (...args: any[]) => AbstractNeuron<Input, any>,Input extends any>(fn: FN): FN => {
        return <any>PathwayFactory.Parameterize((...innerArgs:any[]) => fn.apply(undefined,innerArgs).Logger(this.logger))
    }

}