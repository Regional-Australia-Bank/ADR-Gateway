import _ from "lodash";
import { Neuron, AbstractNeuron, CompoundNeuron } from "./Neuron";

export const PathwayGeneratorSymbol = Symbol()

export const NameCompoundNeurons = (root:object,prefix:string = "") => {
    for (let [k,generator] of Object.entries(root)) {
        if (generator && generator[PathwayGeneratorSymbol]) {
            (<any>generator).Named(k)
        }
    }    
}

export class PathwayFactory {
    static GenerateOnce = <FN extends (...args: any[]) => AbstractNeuron<Input, any>,Input extends any>(fn: FN): FN => {
        let compoundName:string;

        let paramMap: {
            args: any[];
            value: AbstractNeuron<Input, any>;
        }[] = [];
        let onceWrapper = (...onceArgs: any[]) => {
            let values = paramMap.filter(m => _.isEqual(m.args, onceArgs));
            if (values.length > 1)
                throw 'Did not expect more than one matching paramMap';
            if (values.length == 1) {
                return values[0].value;
            }
            else {
                let value: AbstractNeuron<Input, any> | undefined = fn.apply(undefined,onceArgs);
                if (value instanceof CompoundNeuron) {
                    value.Named(compoundName)
                }
                paramMap.push({ args:onceArgs, value });
                return value;
            }
        };
        let resultFn = <FN>onceWrapper.bind(undefined);
        (<any>resultFn).Named = name => compoundName = name;
        (<any>resultFn)[PathwayGeneratorSymbol] = true
        return resultFn;
    };

    static Parameterize = <FN extends (...args: any[]) => AbstractNeuron<Input, any>,Input extends any>(fn: FN): FN => {
        let compoundName:string;
        let onceWrapper = (...onceArgs: any[]) => {
            let value: AbstractNeuron<Input, any> | undefined = fn.apply(undefined,onceArgs);
            if (value instanceof CompoundNeuron) {
                value.Named(compoundName)
            }
            return value;
        };
        let resultFn = <FN>onceWrapper.bind(undefined);
        (<any>resultFn).Named = name => compoundName = name;
        (<any>resultFn)[PathwayGeneratorSymbol] = true
        return resultFn;
    };
}
