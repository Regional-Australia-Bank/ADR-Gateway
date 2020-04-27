import moment from "moment"
import _ from "lodash"
import { ConsumerForbiddenError } from "../../MockServices/DhServer/Server/Middleware/OAuth2ScopeAuth"

type URIString = string
type MaskedAccountString = string
type ASCIIString = string
type DateString = string
type NaturalNumber = number
type PositiveInteger = number

interface Validatable<T> extends String {
    validate(): boolean;
}

interface ResponseBodyList<DataType> {
    data: DataType
    links: {
        self: URIString
        first?: URIString
        prev?: URIString
        next?: URIString
        last?: URIString
    }
    meta: {
        totalRecords: NaturalNumber
        totalPages: NaturalNumber
    }
}

interface PaginationFilters {
    page: PositiveInteger,
    "page-size": PositiveInteger
}

enum ProductCategory {
    TRANS_AND_SAVINGS_ACCOUNTS = "TRANS_AND_SAVINGS_ACCOUNTS",
    TERM_DEPOSITS = "TERM_DEPOSITS"
}

enum AccountOpenStatus {
    "OPEN", "CLOSED", "ALL"
}


interface GetAccountsFilters {
    "product-category": ProductCategory
    "open-status": AccountOpenStatus
    "is-owned": boolean
}

type GetAccountsResponse = ResponseBodyList<{accounts: BankAccount[]}>

interface BankAccount {
    accountId: ASCIIString
    creationDate?: DateString
    displayName: string
    nickname: string
    openStatus?: AccountOpenStatus
    isOwned: boolean
    maskedNumber: MaskedAccountString
    productCategory: ProductCategory
    productName: string
    consentStatus: AccountConsentStatus
}

interface BankAccountDetail extends BankAccount{
    bsb: string,
    accountNumber: string
}

interface BankAccountBalance {
    accountId: ASCIIString
    currentBalance: String
    availableBalance: String
}

interface BankAccountTransaction {
    accountId: ASCIIString
    transactionId: ASCIIString
    isDetailAvailable: boolean
    type: "FEE" | "PAYMENT" | "TRANSFER_INCOMING" | "TRANSFER_OUTGOING"
    status: "PENDING" | "POSTED"
    description: string
    postingDateTime: string // Mandatory if posted
    amount: string
    reference: string
}

interface BankAccountTransactionInternal extends BankAccountTransaction {
    _detail: any
}

const padLeft = (n:number,width:number,decWidth=0,padChar='0') => {
    let right = n.toFixed(decWidth);
    let padWidth = width - right.length;
    if (padWidth <= 0) {
        return right.substring(-padWidth);
    } else {
        let left = padChar.repeat(padWidth)
        return left + right;
    }
}

const masked = (s:string) => {
    if (s.length <= 4) return s;
    let left = s.substr(0,s.length - 4)
    let right = s.substr(s.length - 4)
    left = _.map(left,s => /^\s$/.test(s)? " " : "x" ).join("");
    return left + right;
}

export enum AccountConsentStatus {
    "CONSENTED",
    "INVALID",
    "NOT_CONSENTED"
}

const DetermineAccountConsentStatus = (accountId:string):AccountConsentStatus => {
    if (accountId == 'account-5') {
        return AccountConsentStatus.NOT_CONSENTED
    }
    if (accountId == 'account-78') {
        return AccountConsentStatus.INVALID
    }
    return AccountConsentStatus.CONSENTED
}

export const testAccountDetailList:BankAccountDetail[] = _.map(_.range(1,6),ind => {
   
    let accountDetail = {
        accountId: `account-${ind}`,
        creationDate: moment().subtract(5,'months').format('YYYY-MM-DD'),
        displayName: `John Smith ${ind}`,
        maskedNumber: "",
        productCategory: (ind % 2 == 1) ? ProductCategory.TRANS_AND_SAVINGS_ACCOUNTS : ProductCategory.TERM_DEPOSITS,
        productName: `S${ind}`,
        nickname: `my savings ${ind}`,
        isOwned: true,
        bsb: "000000",
        accountNumber: padLeft(ind,6),
        consentStatus: DetermineAccountConsentStatus(`account-${ind}`)
    }
    accountDetail.maskedNumber = masked(accountDetail.accountId)

    return accountDetail
})

export const testCustomer = {
    customerUType: "person",
    person: {
        lastUpdateTime: moment().subtract(1,'hour'),
        firstName: "John",
        lastName: "Smith",
        middleNames: [],
        prefix: "Dr.",
        suffix: "Jr",
        occupationCode: "121111"
    }
}

export const testBalanceList:BankAccountBalance[] = _.map(testAccountDetailList,acc => ({
    accountId: acc.accountId,
    currentBalance: ((Math.random()-0.5)*5000).toFixed(2),
    availableBalance: ((Math.random()-0.5)*5000).toFixed(2)
}))

const testAccountList:BankAccount[] = _.map(testAccountDetailList,det => _.pick(det,'accountId','displayName','nickname','isOwned','maskedNumber','productCategory','productName','consentStatus'));

const NUMBER_OF_TRANSACTIONS = 50;
const MIN_AMOUNT = -5000
const MAX_AMOUNT = 5000
const MIN_DATE = moment("2019-07-01")
const MAX_DATE = moment();
const dateInterval = Math.abs(MIN_DATE.diff(MAX_DATE,'seconds'))

const range = _.range(0,NUMBER_OF_TRANSACTIONS-1)
const rMax = _.max(range); if (typeof rMax !== 'number') throw 'rMax is undefined';
const transactionAmounts = _.shuffle(_.map(_.map(range, r => r/(rMax)),z => MIN_AMOUNT + (MAX_AMOUNT - MIN_AMOUNT)*z))
const transactionDates = _.shuffle(_.map(_.map(range, r => r/(rMax)),z => {
    return moment(MIN_DATE).add(z*dateInterval,'seconds')
}))

export const testTransactionList:BankAccountTransactionInternal[] = _.flatten(_.map(testAccountList, acc => {
    return _.map(range, r => {

        let amount = Math.abs(transactionAmounts[r]).toFixed(2);
        let type:"TRANSFER_INCOMING"|"TRANSFER_OUTGOING" = transactionAmounts[r] >= 0 ? "TRANSFER_INCOMING" : "TRANSFER_OUTGOING";
        let _detail:any = undefined;

        if (type == "TRANSFER_INCOMING") {
            _detail = {
                extendedData: {
                    payer: "Payer",
                    service: "X2P1.01"
                }
            }
        }
    
        if (type == "TRANSFER_OUTGOING") {
            _detail = {
                extendedData: {
                    payee: "Payee",
                    service: "X2P1.01"
                }
            }        
        }

        let status:"POSTED" = "POSTED"
    
        let transaction = (
            {
                accountId: acc.accountId,
                transactionId: `t-${r}`,
                amount,
                description: "Transaction description",
                isDetailAvailable: _detail && true,
                postingDateTime: transactionDates[r].toISOString(),
                reference: "Reference for you",
                status,
                type,
                _detail
            }
        )

        return transaction;
    })
}))

export const ConsentedAccounts = (subjectId:string) => {
    return testAccountList
}

export const GetTransactions = (subjectId:string, accountId: string) => {
    let accounts = ConsentedAccounts(subjectId)
    if (!_.find(accounts, acc => acc.accountId == accountId)) {
        throw new ConsumerForbiddenError("Account does not exist",{
            code: "NO_ACCOUNT",
            detail: "The account does not exist or is not consented",
            meta: {}
        })
    }

    let transactions = _.filter(testTransactionList, t => t.accountId == accountId)
    return transactions;
}

export const TransactionDetail = (subjectId:string, accountId: string, transactionId: string) => {
    if (!_.find(testAccountList, acc => acc.accountId == accountId)) {
        throw new ConsumerForbiddenError("Account does not exist",{
            code: "NO_ACCOUNT",
            detail: "The account does not exist or is not consented",
            meta: {}
        })
    }

    let transactionInt = _.find(testTransactionList, t => t.transactionId == transactionId)
    if (!(transactionInt?.isDetailAvailable)) {
        throw new ConsumerForbiddenError("Transaction detail does not exist",{
            code: "NO_TRANSACTION_DETAIL",
            detail: "The transaction detail does not exist",
            meta: {}
        })
    }

    let detail = transactionInt._detail

    let transaction = _.merge(_.omit(transactionInt,'_detail'),detail)

    return transaction

}


class Resource<ElementType> {
    constructor(private elements:ElementType[]){}

    ApplyFilter<ParameterType>(filter: Filter<ElementType,ParameterType>): Resource<ElementType> {
        return this;
    }
}

// A filter operates on a result set. A filter takes a
abstract class Filter<ElementType,ParameterType> {
    constructor(protected params: ParameterType) {
    }
    abstract filter(elements: ElementType[],params: ParameterType): ElementType[];
}

class ProductCategoryAccountsFilter extends Filter<BankAccount,ProductCategory|undefined> {
    filter(elements: BankAccount[]): BankAccount[] {
        let filtered = elements.filter((account) => {
            return account.productCategory == this.params;
        })
        return filtered;
    }
}

interface FilterableRequest {
    Filters: {
        queryParam: string,
        filterImplementation: Class<Filter<unknown,unknown>>,
        filterParamTransformer?: Function;
    }[]
}

class GetAccountsRequest implements FilterableRequest {
    Filters = [
        {
            queryParam: "product-category",
            filterImplementation: ProductCategoryAccountsFilter
        }
    ]
}

// results.ApplyFilter(new ProductCategoryAccountsFilter(ProductCategory.TRANS_AND_SAVINGS_ACCOUNTS),"productCategory")
// results.ApplyFilter(ProductCategoryFilter,"openStatus",params["open-status"])
// results.ApplyFilter(ProductCategoryFilter,"isOwned",params["is-owned"])

export {testAccountList}