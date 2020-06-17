import { TestAction, TestActionResult } from "./TestActions";
import request = require("request");
import { response } from "express";

interface SetValueResult extends TestActionResult {
    value: any
}

class SetValue extends TestAction<SetValueResult> {
    Perform = async (): Promise<SetValueResult> => {
        return new Promise<SetValueResult>((resolve,reject) => {
            resolve({value: this.parameters})
        });
    }
    parameters!: any
}

export {SetValue}