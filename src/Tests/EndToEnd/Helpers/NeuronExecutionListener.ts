import { CompoundNeuron, Neuron } from "../../../Common/Connectivity/Neuron";

export const AttachExecutionListener = <T extends Neuron<any,any>>(pathway:CompoundNeuron<any,any>, neuronType: Class<T>):{input?:T["input"],output?:T["output"],error?:any} => {

    let execution:{input?:any,output?:any, error?:any} = {};

    pathway.events.addListener('input_evaluated',(n:CompoundNeuron<any,any>, input:any, output:any) => {
        if (n instanceof neuronType) {
            execution.input = input
        }
    })
    pathway.events.addListener('output_evaluated',(n:CompoundNeuron<any,any>, output:any) => {
        if (n instanceof neuronType) {
            execution.output = output
        }
    })
    pathway.events.addListener('evaluation_error',(n:CompoundNeuron<any,any>,error:any) => {
        if (n instanceof neuronType) {
            execution.error = error
        }
    })

    return execution

}

