import _ from "lodash";
import { Neuron, AbstractNeuron } from "./Neuron";
export class PathwayFactory {
    static GenerateOnce = <FN extends (...args: any[]) => AbstractNeuron<Input, any>,Input extends any>(fn: FN, tag?:string): FN => {
        let paramMap: {
            args: any[];
            value: AbstractNeuron<Input, any>;
        }[] = [];
        let onceWrapper = (tag:string|undefined,...onceArgs: any[]) => {
            let values = paramMap.filter(m => _.isEqual(m.args, onceArgs));
            if (values.length > 1)
                throw 'Did not expect more than one matching paramMap';
            if (values.length == 1) {
                return values[0].value;
            }
            else {
                let value: AbstractNeuron<Input, any> | undefined = fn.apply(undefined,onceArgs);
                paramMap.push({ args:onceArgs, value });
                return value;
            }
        };
        return <FN>onceWrapper.bind(undefined,tag);
    };

    static Parameterize = <FN extends (...args: any[]) => AbstractNeuron<Input, any>,Input extends any>(fn: FN): FN => {
        let onceWrapper = (...onceArgs: any[]) => {
            let value: AbstractNeuron<Input, any> | undefined = fn.apply(undefined,onceArgs);
            return value;
        };
        return <FN>onceWrapper.bind(undefined);
    };
}
