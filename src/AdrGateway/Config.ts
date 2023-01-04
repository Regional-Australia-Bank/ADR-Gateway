import convict = require("convict");
import _ from "lodash"
import { AdrConnectivityConfig, ConnectivityConvictOptions, LoadMtls } from "../Common/Config";


export interface AdrGatewayConfig extends AdrConnectivityConfig { // TODO This will be the new configuration
    Port: number,
    Logging?: { logfile?: string },
    BackEndBaseUri: string,
    DefaultAPIVersion?: {
        getAccounts: number,
        getBulkBalance: number,
        getBalancesForSpecificAccount: number,
        getAccountBalance: number,
        getAccountDetail: number,
        getTransactionsForAccount: number,
        getTransactionDetail: number,
        getDirectDebitsForAccount: number,
        getBulkDirectDebits: number,
        getDirectDebitsForSpecificAccounts: number,
        getScheduledPaymentsForAccount: number,
        getScheduledPaymentsBulk: number,
        getScheduledPaymentsForSpecificAccount: number,
        getPayees: number,
        getPayeeDetail: number,
        getProduct: number,
        getProductDetail: number,
        getCustomer: number,
        getCustomerDetail: number,
        getStatus: number
    }
}

export const GetBackendConfig = async (configFile?: string): Promise<AdrGatewayConfig> => {

    const config = convict(_.merge({
        Port: {
            doc: 'The port to bind.',
            format: 'port',
            default: 8101,
            env: 'ADR_BACKEND_PORT'
        },
        Logging: {
            logfile: {
                doc: 'File to log out to',
                format: 'String',
                default: undefined,
                env: 'ADR_GW_LOG_FILE'
            }
        },
        BackEndBaseUri: {
            doc: 'Exposed Uri of the Backend (used to change links from DH paginated endpoints)',
            format: 'url',
            default: 'https://localhost:9101/',
            env: 'ADR_GW_BACKEND_BASE'
        },
        DefaultAPIVersion: {
            getAccounts: {
                doc: 'Get Accounts endpoint',
                format: Number,
                default: 1,
                env: 'API_GET_ACCOUNTS'
            },
            getBulkBalance: {
                doc: 'Get Bulk Balances endpoint',
                format: Number,
                default: 1,
                env: 'API_GET_BULK_BALANCES'
            },
            getBalancesForSpecificAccount: {
                doc: 'Get Balances For Specific Accounts endpoint',
                format: Number,
                default: 1,
                env: 'API_GET_BALANCES_FOR_SPECIFIC_ACCOUNTS'
            },
            getAccountBalance: {
                doc: 'Get Account Balance endpoint',
                format: Number,
                default: 1,
                env: 'API_GET_ACCOUNT_BALANCE'
            },
            getAccountDetail: {
                doc: 'Get Account Detail endpoint',
                format: Number,
                default: 1,
                env: 'API_GET_ACCOUNT_DETAIL'
            },
            getTransactionsForAccount: {
                doc: 'Get Transactions For Account endpoint',
                format: Number,
                default: 1,
                env: 'API_GET_TRANSACTIONS_FOR_ACCOUNT'
            },
            getTransactionDetail: {
                doc: 'Get Transaction Detail endpoint',
                format: Number,
                default: 1,
                env: 'API_GET_TRANSACTION_DETAIL'
            },
            getDirectDebitsForAccount: {
                doc: 'Get Direct Debits For Account endpoint',
                format: Number,
                default: 1,
                env: 'API_GET_DIRECT_DEBITS_FOR_ACCOUNT'
            },
            getBulkDirectDebits: {
                doc: 'Get Bulk Direct Debits endpoint',
                format: Number,
                default: 1,
                env: 'API_GET_BULK_DIRECT_DEBITS'
            },
            getDirectDebitsForSpecificAccounts: {
                doc: 'Get Direct Debits For Specific Accounts endpoint',
                format: Number,
                default: 1,
                env: 'API_GET_DIRECT_DEBITS_FOR_SPECIFIC_ACCOUNTS'
            },
            getScheduledPaymentsForAccount: {
                doc: 'Get Scheduled Payments for Account endpoint',
                format: Number,
                default: 1,
                env: 'API_GET_SCHEDULED_PAYMENTS_FOR_ACCOUNT'
            },
            getScheduledPaymentsBulk: {
                doc: 'Get Scheduled Payments Bulk endpoint',
                format: Number,
                default: 1,
                env: 'API_GET_SCHEDULED_PAYMENTS_BULK'
            },
            getScheduledPaymentsForSpecificAccount: {
                doc: 'Get Scheduled Payments For Specific Accounts endpoint',
                format: Number,
                default: 1,
                env: 'API_GET_SCHEDULED_PAYMENTS_FOR_SPECIFIC_ACCOUNT'
            },
            getPayees: {
                doc: 'Get Payees endpoint',
                format: Number,
                default: 1,
                env: 'API_GET_PAYEES'
            },
            getPayeeDetail: {
                doc: 'Get Payee Detail endpoint',
                format: Number,
                default: 1,
                env: 'API_GET_PAYEE_DETAIL'
            },
            getProduct: {
                doc: 'Get Products endpoint',
                format: Number,
                default: 1,
                env: 'API_GET_PRODUCTS'
            },
            getProductDetail: {
                doc: 'Get Product Detail endpoint',
                format: Number,
                default: 1,
                env: 'API_GET_PRODUCT_DETAIL'
            },
            getCustomer: {
                doc: 'Get Customer endpoint',
                format: Number,
                default: 1,
                env: 'API_GET_CUSTOMER'
            },
            getCustomerDetail: {
                doc: 'Get Customer Detail endpoint',
                format: Number,
                default: 1,
                env: 'API_GET_CUSTOMER_DETAIL'
            },
            getStatus: {
                doc: 'Get Status endpoint',
                format: Number,
                default: 1,
                env: 'API_GET_STATUS'
            }
        }

    }, ConnectivityConvictOptions()))

    config.load({ Database: (process.env.ADR_DATABASE_OPTIONS && JSON.parse(process.env.ADR_DATABASE_OPTIONS)) || {} })

    await LoadMtls(config)

    config.validate({ allowed: <convict.ValidationMethod>process.env.CONVICT_ALLOWED || 'strict' });

    if (typeof configFile === 'string') {
        config.loadFile(configFile)
    }

    return config.get();
}

export const GetHousekeeperConfig = async (configFile?: string): Promise<AdrConnectivityConfig> => {

    const config = convict(_.merge({
        Logging: {
            logfile: {
                doc: 'File to log out to',
                format: 'String',
                default: undefined,
                env: 'ADR_GW_LOG_FILE'
            }
        },

    }, ConnectivityConvictOptions()))

    config.load({ Database: (process.env.ADR_DATABASE_OPTIONS && JSON.parse(process.env.ADR_DATABASE_OPTIONS)) || {} })

    await LoadMtls(config)

    config.validate({ allowed: <convict.ValidationMethod>process.env.CONVICT_ALLOWED || 'strict' });

    if (typeof configFile === 'string') {
        config.loadFile(configFile)
    }

    return config.get();
}

export const GetRegisterAPIVersionConfig = () => {
    const config = convict({
        DefaultAPIVersion: {
            getDataHolder: {
                doc: 'Get Data Holder Brands endpoint',
                format: Number,
                default: 1,
                env: 'API_GET_DATA_HOLDER_BRANDS'
            },
            getSoftwareStatementAssertion: {
                doc: 'Get Software Statement Assertion endpoint',
                format: Number,
                default: 1,
                env: 'API_GET_SSA'
            },
            getDataHolderStatus: {
                doc: 'Get Data Holder Status endpoint',
                format: Number,
                default: 1,
                env: 'API_GET_DATA_HOLDER_STATUS'
            },
            getSoftwareProductStatus: {
                doc: 'Get Software Prodcut Status endpoint',
                format: Number,
                default: 1,
                env: 'API_GET_SOFTWARE_PRODUCT_STATUS'
            },
            getDataRecipientStatus: {
                doc: 'Get Data Recipient Status endpoint',
                format: Number,
                default: 1,
                env: 'API_GET_DATA_RECIPIENT_STATUS'
            },
            getDataRecipient: {
                doc: 'Get Data Recipient endpoint',
                format: Number,
                default: 1,
                env: 'API_GET_DATA_RECIPIENT'
            }
        }
    })
    
    return config.get();
}