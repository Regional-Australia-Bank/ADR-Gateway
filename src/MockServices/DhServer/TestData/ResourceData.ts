import moment from "moment"
import _ from "lodash"
import { ConsumerForbiddenError } from "../Server/Middleware/OAuth2ScopeAuth"
import { EnumType } from "typescript"

type URIString = string
type MaskedAccountString = string
type MaskedPANString = string
type ASCIIString = string
type DateString = string
type NaturalNumber = number
type PositiveInteger = number
type ExternalRef = string

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

interface BankingAuthorisedEntity {
    description: string
    financialInstitution: string
    abn: string
    acn: string
    arbn: string
}

interface BankingDirectDebit {
    accountId: ASCIIString
    authorisedEntity: BankingAuthorisedEntity
    lastDebitDateTime: DateString
    lastDebitAmount: string
    consentStatus: AccountConsentStatus
}

interface BankingScheduledPaymentFrom {
    accountId: string
}

interface BankingDomesticPayeeAccount {
    accountName?: string
    bsb: string
    accountNumber: string
}

interface BankingDomesticPayeeCard {
    cardNumber: MaskedPANString
}

enum BankingDomesticPayeePayIdTypes {
    Abn = 'ABN',
    Email = 'EMAIL',
    Org_identifier = 'ORG_IDENTIFIER',
    Telephone = 'TELEPHONE'
}

interface BankingDomesticPayeePayId {
    name?: string
    identifier: string
    type: BankingDomesticPayeePayIdTypes
}

enum BankingDomesticPayeeUTypes {
    Account = 'account',
    Card = 'card',
    PayId = 'payId'
}

interface BankingDomesticPayee {
    payeeAccountUType: BankingDomesticPayeeUTypes
    account?: BankingDomesticPayeeAccount
    card?: BankingDomesticPayeeCard
    payId?: BankingDomesticPayeePayId
}

interface BankingBillerPayee {
    billerCode: string
    crn?: string
    billerName: string
}

interface BankingInternationalPayeeBeneficiaryDetails {
    name?: string
    country: ExternalRef
    message?: string
}

interface BankingInternationalPayeeBankDetails {
    country: ExternalRef
    accountNumber: string
    bankAddress?: {
        name: string
        address: string
    }
    beneficiaryBankBIC?: ExternalRef
    fedWireNumber?: string
    sortCode?: string
    chipNumber?: string
    routingNumber?: string
    legalEntityIdentifier?: ExternalRef
}

interface BankingInternationalPayee {
    beneficiaryDetails: BankingInternationalPayeeBeneficiaryDetails
    bankDetails: BankingInternationalPayeeBankDetails
}

enum BankingScheduledPaymentToUTypes {
    AccountId = 'accountId',
    PayeeId = 'payeeId',
    Domestic = 'domestic',
    Biller = 'biller',
    International = 'international'
}

interface BankingScheduledPaymentTo {
    toUType: BankingScheduledPaymentToUTypes
    accountId?: ASCIIString
    payeeId?: ASCIIString
    domestic?: BankingDomesticPayee
    biller?: BankingBillerPayee
    international?: BankingInternationalPayee
}

interface BankingScheduledPaymentSet {
    to: BankingScheduledPaymentTo
    isAmountCalculated?: boolean
    amount?: string
    currency?: string
}

interface BankingScheduledPaymentRecurrenceOnceOff {
    paymentDate: DateString
}

interface BankingScheduledPaymentInterval {
    interval: ExternalRef
    dayInInterval?: ExternalRef
}

enum BankingScheduledPaymentRecurrenceIntervalScheduleNonBusinessDayTreatments {
    After = 'AFTER',
    Before = 'BEFORE',
    On = 'ON',
    Only = 'ONLY'
}

interface BankingScheduledPaymentRecurrenceIntervalSchedule {
    finalPaymentDate?: DateString
    paymentsRemaining?: PositiveInteger
    nonBusinessDayTreatment?: BankingScheduledPaymentRecurrenceIntervalScheduleNonBusinessDayTreatments
    intervals: BankingScheduledPaymentInterval[]

}

enum BankingScheduledPaymentRecurrenceLastWeekdayLastWeekDays {
    Mon = 'MON',
    Tue = 'TUE',
    Wed = 'WED',
    Thu = 'THU',
    Fri = 'FRI',
    Sat = 'SAT',
    Sum = 'SUN'
}

enum BankingScheduledPaymentRecurrenceLastWeekdayNonBusinessDayTreatment {
    After = 'AFTER',
    Before = 'BEFORE',
    On = 'ON',
    Only = 'ONLY'
}

interface BankingScheduledPaymentRecurrenceLastWeekday {
    finalPaymentDate?: DateString
    paymentsRemaining?: PositiveInteger
    interval: ExternalRef
    lastWeekDay: BankingScheduledPaymentRecurrenceLastWeekdayLastWeekDays
    nonBusinessDayTreatment?: BankingScheduledPaymentRecurrenceLastWeekdayNonBusinessDayTreatment
}

interface BankingScheduledPaymentRecurrenceEventBased {
    desription: string
}

enum BankingScheduledPaymentRecurrenceUTypes {
    OnceOff = 'onceOff',
    IntervalSchedule = 'intervalSchedule',
    LastWeekDay = 'lastWeekDay',
    EventBased = 'eventBased'
}

interface BankingScheduledPaymentRecurrence {
    nextPaymentDate?: DateString
    recurrenceUType: BankingScheduledPaymentRecurrenceUTypes
    onceOff?: BankingScheduledPaymentRecurrenceOnceOff
    intervalSchedule?: BankingScheduledPaymentRecurrenceIntervalSchedule
    lastWeekDay?: BankingScheduledPaymentRecurrenceLastWeekday
    eventBased?: BankingScheduledPaymentRecurrenceEventBased
}

enum BankScheduledPaymentStatus {
    Active = 'ACTIVE',
    Inactive = 'INACTIVE',
    Skip = 'SKIP'
}

interface BankScheduledPayment {
    scheduledPaymentId: ASCIIString
    nickname?: string
    payerReference: string
    payeeReference: string
    status: BankScheduledPaymentStatus
    from: BankingScheduledPaymentFrom
    paymentSet: BankingScheduledPaymentSet[]
    recurrence: BankingScheduledPaymentRecurrence
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
    Consented = "CONSENTED",
    Invalid = "INVALID",
    Not_consented = "NOT_CONSENTED"
}

const DetermineAccountConsentStatus = (accountId:string):AccountConsentStatus => {
    if (accountId == 'account-5') {
        return AccountConsentStatus.Not_consented
    }
    if (accountId == 'account-78') {
        return AccountConsentStatus.Invalid
    }
    return AccountConsentStatus.Consented
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

export const testDirectDebitList:BankingDirectDebit[] = _.map(_.range(1,6),ind => {
    let directDebits = {
        accountId: `account-${ind}`,
        authorisedEntity: {
            description: `Telstra-${ind}`,
            financialInstitution: "ANZ",
            abn: (123456789*ind).toString(),
            acn: (987654321*ind).toString(),
            arbn: (192837465*ind).toString()
        },
        lastDebitDateTime: moment().subtract(5,'months').format('YYYY-MM-DD'),
        lastDebitAmount: "123.45",
        consentStatus: DetermineAccountConsentStatus(`account-${ind}`)
    }

    return directDebits;
})

export const testScheduledPaymentsList:BankScheduledPayment[] = _.map(_.range(1,16),ind => {
    let scheduledPayment = {
        scheduledPaymentId: `payment-${ind}`,
        nickname: `payment-${ind}-nickname`,
        payerReference: `payer-ref-${ind}`,
        payeeReference: `payee-ref-${ind}`,
        status: BankScheduledPaymentStatus[Math.floor(Math.random() * 3)],
        from: {
            accountId: `account-${ind}`
        },
        paymentSet: [{
            to: {
                toUType: BankingScheduledPaymentToUTypes.AccountId,
                accountId: (12345 * ind).toString()
            },
            isAmountCalculated: false,
            amount: '123.45',
            currency: 'AUD'
        }],
        recurrence: {
            recurrenceUType: BankingScheduledPaymentRecurrenceUTypes.OnceOff,
            onceOff: {
                paymentDate: moment().add(1,'months').format('YYYY-MM-DD')
            }
        }
    }

    return scheduledPayment;
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

export const testCustomerDetail = {
    customerUType: "person",
    person: {
        lastUpdateTime: testCustomer.person.lastUpdateTime,
        firstName: testCustomer.person.firstName,
        lastName: testCustomer.person.lastName,
        middleNames: testCustomer.person.middleNames,
        prefix: testCustomer.person.prefix,
        suffix: testCustomer.person.suffix,
        occupationCode: testCustomer.person.occupationCode,
        phoneNumbers: [{
            isPreferred: true,
            purpose: "MOBILE", //MOBILE, HOME, INTERNATIONAL, WORK, OTHER, UNSPECIFIED
            countryCode: "+61",
            number: "0412345678",
            fullNumber: "tel:+61-412-345-678"
        },
        {
            purpose: "HOME", //MOBILE, HOME, INTERNATIONAL, WORK, OTHER, UNSPECIFIED
            countryCode: "+61",
            areaCode: "2",
            number: "67786778",
            fullNumber: "tel:+61-2-6778-6778"
        }],
        emailAddresses: [{
            isPreferred: true,
            purpose: "HOME", //WORK, HOME, OTHER, UNSPECIFIED
            address: "jsmith@example.com"
        },
        {
            purpose: "WORK", //WORK, HOME, OTHER, UNSPECIFIED
            address: "jsmith2@examplework.com.au"
        }],
        physicalAddresses: [{
            addressUType: "simple", //simple, paf
            addressLine1: "Amaroo",
            addressLine2: "12345 Wingwabinda Road",
            postcode: "2345",
            city:   "Whoop Whoop",
            state: "NSW",
            purpose: "PHYSICAL" //MAIL, PHYSICAL, REGISTERED, WORK, OTHER
        },
        {
            addressUType: "simple", //simple, paf
            addressLine1: "PO Box 123",
            postcode: "2345",
            city:   "Whoop Whoop",
            state: "NSW",
            purpose: "MAIL" //MAIL, PHYSICAL, REGISTERED, WORK, OTHER
        }]
    }
}

export const testBalanceList:BankAccountBalance[] = _.map(testAccountDetailList,acc => ({
    accountId: acc.accountId,
    currentBalance: ((Math.random()-0.5)*5000).toFixed(2),
    availableBalance: ((Math.random()-0.5)*5000).toFixed(2)
}))

const testAccountList:BankAccount[] = _.map(testAccountDetailList,det => _.pick(det,'accountId','displayName','nickname','isOwned','maskedNumber','productCategory','productName','consentStatus'));

const NUMBER_OF_TRANSACTIONS = 500;
const MIN_AMOUNT = -5000
const MAX_AMOUNT = 5000
const MIN_DATE = moment().subtract(12,'months')
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
                    service: "X2P1.01",
                    extensionUType: "x2p101Payload",
                    extendedDescription: `${r} - An extended message as sent by the payer, up to 250 characters.`,
                    endToEndId: `abcd123${r}`
                }
            }
        }
    
        if (type == "TRANSFER_OUTGOING") {
            _detail = {
                extendedData: {
                    payee: "Payee",
                    service: "X2P1.01",
                    extensionUType: "x2p101Payload",
                    extendedDescription: `${r} - An extended message as sent to the payee, up to 250 characters.`,
                    endToEndId: `abcd123${r}`
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

    let transactions = _.map(_.filter(testTransactionList, t => t.accountId == accountId), (t) => _.omit(t,'_detail'))
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

enum BankingDomesticPayeeTypes {
    Biller = 'BILLER',
    Domestic = 'DOMESTIC',
    International = 'INTERNATIONAL'
}

enum BankingPayeeDetailPayeeUTypes {
    Biller = 'biller',
    Domestic = 'domestic',
    International = 'international'
}

interface BankingPayee {
    payeeId: ASCIIString
    nickname: string
    description?: string
    type: BankingDomesticPayeeTypes
    creationDate: DateString
    _detail: {
        payeeUType: BankingPayeeDetailPayeeUTypes,
        domestic?: BankingDomesticPayee,
        biller?: BankingBillerPayee,
        international?: BankingInternationalPayee
    }
}

export const testPayeesList:BankingPayee[] = _.map(_.range(1,16),ind => {
    let getType = ():BankingDomesticPayeeTypes => { switch(ind % (Object.keys(BankingDomesticPayeeTypes).length)) {
        case 0: return BankingDomesticPayeeTypes.Biller; break;
        case 1: return BankingDomesticPayeeTypes.Domestic; break;
        case 2: return BankingDomesticPayeeTypes.International; break;
        default: return BankingDomesticPayeeTypes.Domestic; break;
    }};
    let type = getType();

    let getDetails = (type: BankingDomesticPayeeTypes) => {
        switch(type) {
            case BankingDomesticPayeeTypes.Biller:
                return {
                    payeeUType: BankingPayeeDetailPayeeUTypes.Biller,
                    biller: {
                        billerCode: "123456",
                        crn: '987654321',
                        billerName: 'Big Bad Biller'
                    }
                }
            break;

            case BankingDomesticPayeeTypes.Domestic:
                return {
                    payeeUType: BankingPayeeDetailPayeeUTypes.Domestic,
                    domestic: {
                        payeeAccountUType: BankingDomesticPayeeUTypes.Account,
                        account: {
                            accountName: 'J & J Smith',
                            bsb: '012-345',
                            accountNumber: '123456789'
                        }
                    }
                }
            break;

            case BankingDomesticPayeeTypes.International:
                return {
                    payeeUType: BankingPayeeDetailPayeeUTypes.International,
                    international: {
                        beneficiaryDetails: {
                            name: 'Kiwi Joe',
                            country: 'NZ'
                        },
                        bankDetails: {
                            country: 'NZ',
                            accountNumber: '123456789'
                        }
                    }
                }
            break;

            default:
                throw "Unrecognised value for BankingDomesticPayeeTypes: " + type
            break;
        }
    }

    let payee = {
        payeeId: `payee-${ind}`,
        nickname: `payee-${ind}-nickname`,
        description: `payee-description-${ind}`,
        type: type,
        creationDate: moment().subtract(5,'months').format('YYYY-MM-DD'),
        _detail: getDetails(type)
    }

    return payee;
})

export const PayeeDetail = (subjectId:string, payeeId: string) => {
    let payeeInt = _.find(testPayeesList, t => t.payeeId == payeeId)

    let detail = payeeInt._detail

    let payeeDetail = _.merge(_.omit(payeeInt,'_detail'),detail)

    return payeeDetail

}


// results.ApplyFilter(new ProductCategoryAccountsFilter(ProductCategory.TRANS_AND_SAVINGS_ACCOUNTS),"productCategory")
// results.ApplyFilter(ProductCategoryFilter,"openStatus",params["open-status"])
// results.ApplyFilter(ProductCategoryFilter,"isOwned",params["is-owned"])

export {testAccountList}