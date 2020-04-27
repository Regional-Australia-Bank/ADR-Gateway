import { TestContext, currentlyExecutingContextStack } from "./TestContext";

interface TestActionResult {
    // _test_action_result_type_placeholder?: string;
}

abstract class TestAction<ResultType> {

    private resultPromise?: Promise<ResultType>;
    public taskId: any;

    abstract async Perform(): Promise<ResultType>;
    abstract parameters:unknown;

    prev?:() => Promise<any>

    constructor(public testContext:TestContext) {


    }
    GetResult = async (): Promise<ResultType> => {
        // call Perform if it has bot been performed (GetResult may be called multiple times).

        currentlyExecutingContextStack.push(this.testContext);

        if (this.prev) {
            await(this.prev())
        }

        try {
            if (typeof this.resultPromise == 'undefined') {

                // before calling Perform, make sure parameters is an object, invoking the preparation callback if necessary            
                if (typeof this.parameters != 'object') {
                    if (this.parameters instanceof Function) {
                        this.parameters = this.parameters.call(this,this.testContext);
                        if (this.parameters instanceof Promise) {
                            this.parameters = await this.parameters;
                        }
                    } else {
                        
                        // throw `TestAction.parameters is not an object or a function`
                    }
                }
    
                this.resultPromise = this.Perform();
            }
    
            return await this.resultPromise;
        } finally {
            currentlyExecutingContextStack.pop();
        }

    }
}

interface GetTransactionsResult extends TestActionResult {
    data: {
        transactionId: string;
    }[]
}

interface GetTransactionDetailResult extends TestActionResult {
    data: {
        transactionDetailId: string;
    }
}

class GetBalances extends TestAction<TestActionResult> {
    parameters: any;
    Perform = async (): Promise<TestActionResult> => {
        throw new Error("Method not implemented.");
    }
}

class GetTransactions extends TestAction<GetTransactionsResult> {
    parameters!: Promise<{
        accountId: string
    }>;
    Perform = async(): Promise<GetTransactionsResult> => {
        let transactions = {
            data: [{transactionId: "asdasd123123"}]
        }
        return transactions;
    }
}

class GetTransactionDetail extends TestAction<GetTransactionDetailResult> {
    parameters: any;
    Perform = async (): Promise<GetTransactionDetailResult> => {
        let transactionDetail = {
            data: {transactionDetailId: "asdasd123123"}
        }
        return transactionDetail;
    }
}

interface VoidResult extends TestActionResult {

}


class DoSomething extends TestAction<VoidResult> {
    parameters!: void;
    Perform = async (): Promise<VoidResult> => {
        return {}
    }
}


export {GetBalances,GetTransactions,GetTransactionDetail,TestAction,TestActionResult}