import { TestAction, TestActionResult } from "./Framework/TestActions";

interface BankAccount {
    id: string;
}

interface GetAccountsResult extends TestActionResult {
    a: string;
    TestProp: string;
    data: BankAccount[]

}

class GetAccounts extends TestAction<GetAccountsResult> {
    parameters!: {
        "product-category": string
    }

    Perform = async (): Promise<GetAccountsResult> => {
        let accessToken = undefined;
        if (typeof this.testContext.persona == 'string') {
            accessToken = (await this.testContext.TestData()).personas[this.testContext.persona].accessToken;
        }
        if (typeof accessToken != 'string') throw 'Access token could not be found for persona';

        // throw new Error("Method not implemented.");
        let accounts = {
            data: [{id: "asdasd123123"}],
            a: "blahblh",
            TestProp: "adasd"
        }
        return accounts;
    }
}

export {GetAccounts}