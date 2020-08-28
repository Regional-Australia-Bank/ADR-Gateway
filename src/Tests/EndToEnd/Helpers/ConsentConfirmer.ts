import { TestContext } from "../Framework/TestContext";

export interface OAuthHybridFlowResult {
    unredirectableError: boolean
    hash?: {
        error?: string | undefined;
        error_description?: string | undefined;
        state: string;
        code?: string | undefined;
        id_token?: string | undefined;    
    }
}

export abstract class ConsentConfirmer {
    abstract Confirm (params: {redirectUrl: string, consentId: number, context: TestContext}):Promise<OAuthHybridFlowResult>;
}
