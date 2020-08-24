import chai from 'chai';
import { expect } from "chai";
import { Dependency } from '../../../Common/Connectivity/Dependency';
import { CommsDependencyEvaluator } from '../../../Common/Connectivity/CommsDependencyEvaluator';
import { InMemoryCache } from '../../../Common/Connectivity/Cache/InMemoryCache';
import winston from 'winston';
import moment from 'moment';


export const Tests = (() => {

    describe('Dependency Evaluation', async () => {

        const silent = winston.createLogger({
            level:"silent",
            transports: new winston.transports.Console()
        })

        const inMemoryCache = (store?:object) => new InMemoryCache(store);

        it('Evaluates a trivial chain', async () => {

            let ctx = new CommsDependencyEvaluator(inMemoryCache(),silent)

            let dependency = new Dependency({
                name: "Number3",
                parameters: {},
                evaluator: ($:{}) => 3,
                cacheTrail: [],
            })

            let v = ctx.get(dependency,{})
            expect(v).to.be.fulfilled;
            let result = await v;
            expect(result).to.equal(3);
            
        })

        it('Evaluates a chain correctly', async () => {

            let ctx = new CommsDependencyEvaluator(inMemoryCache(),silent)

            let step1 = new Dependency<{Number: number},{},number>({
                name: "NumberId",
                parameters: {Number: o => o.toString()},
                evaluator: $ => $.Number,
                cacheTrail: [],
            })

            let step2_1 = new Dependency<{Number: number},{NumberId:number},number>({
                name: "Plus1",
                parameters: {Number: o => o.toString()},
                evaluator: $ => $.NumberId + 1,
                dependencies: [step1],
                cacheTrail: [],
            })

            let step2_2 = new Dependency<{Number: number},{NumberId:number},number>({
                name: "Minus1",
                parameters: {Number: o => o.toString()},
                evaluator: $ => $.NumberId - 1,
                dependencies: [step1],
                cacheTrail: [],
            })

            let step3 = new Dependency<{Number: number},{Plus1:number,Minus1:number},number>({
                name: "Product",
                parameters: {Number: o => o.toString()},
                evaluator: $ => $.Minus1*$.Plus1,
                dependencies: [step2_1,step2_2],
                cacheTrail: [],
            })

            let v = ctx.get(step3,{Number:3})

            expect(v).to.be.fulfilled;
            let result = await v;
            expect(result).to.equal(8);

            
        })

        it('Parameter transforms are projected onto dependencies before evaluation', async () => {

            let ctx = new CommsDependencyEvaluator(inMemoryCache(),silent)

            let step1 = new Dependency<{Number: number},{},number>({
                name: "NumberId",
                parameters: {Number: o => o.toString()},
                evaluator: $ => $.Number,
                cacheTrail: [],
            })

            let step2 = new Dependency<{NumberString: string},{NumberId:number},number>({
                name: "Plus1",
                parameters: {NumberString: o => o.toString()},
                project: {
                    Number: p => parseInt(p.NumberString)
                },
                evaluator: $ => $.NumberId + 1,
                dependencies: [step1],
                cacheTrail: [],
            })

            let v = ctx.get(step2,{NumberString:"3"})

            expect(v).to.be.fulfilled;
            let result = await v;
            expect(result).to.equal(4);


        })

        it('Evaluates duplicated dependancies only once', async () => {
           
            let ctx = new CommsDependencyEvaluator(inMemoryCache({}),silent)

            const idFn = chai.spy($ => $.Number);

            let step1 = new Dependency<{Number: number},{},number>({
                name: "NumberId",
                parameters: {Number: o => o.toString()},
                evaluator: idFn,
                cacheTrail: [],
            })

            let step2 = new Dependency<{Number: number},{NumberId:number},number>({
                name: "Plus1",
                parameters: {Number: o => o.toString()},
                evaluator: $ => $.NumberId + 1,
                dependencies: [step1],
                cacheTrail: [],
            })
    
            let step3 = new Dependency<{Number: number},{Plus1:number,NumberId:number},number>({
                name: "Product",
                parameters: {Number: o => o.toString()},
                evaluator: $ => $.NumberId*$.Plus1,
                dependencies: [step2,step1],
                cacheTrail: [],
            })

            let v = ctx.get(step3,{Number:3})

            let result = await v;

            expect(result).to.equal(12);        
            expect(idFn).to.be.called.once;
            
        })

        it('Populates cache and detects and recovers from healable error condition', async () => {
            
            const cache:any = {};
            const cachingImplementation = inMemoryCache(cache);

            let ctx1 = new CommsDependencyEvaluator(cachingImplementation,silent)

            let step1 = new Dependency<{Number: number},{},number>({
                name: "NumberId",
                parameters: {Number: o => o.toString()},
                evaluator: $ => $.Number,
                cacheTrail: [],
            })

            let step2 = new Dependency<{Number: number},{NumberId:number},number>({
                name: "Plus1",
                parameters: {Number: o => o.toString()},
                evaluator: $ => $.NumberId + 1,
                dependencies: [step1],
                cacheTrail: [step1],
            })


            
            let firstResultPromise = await ctx1.get(step2,{Number:3});
            let firstResult = await firstResultPromise;
            expect(firstResult).to.equal(4);
            expect(cache["Plus1_3"]).to.equal(InMemoryCache.Serialize(step2,4));

            // change the stored value of v1
            await cachingImplementation.UpdateCache(step2,{Number:3},5);
            expect(cache["Plus1_3"]).to.equal(InMemoryCache.Serialize(step2,5));

            const validator = chai.spy((v:number) => {return v == 4});

            let finalResult:number = 0;
            try {
                finalResult = await ctx1.get(step2,{Number:3},{validator});
            } catch(e) {

            }
            expect(finalResult).to.equal(4);

            expect(validator).on.nth(1).be.called.with(5);
            expect(validator).on.nth(2).be.called.with(4);
            expect(validator).to.have.been.called.exactly(2);

        })
        
        it('Recovers from multiple failures in a complex chain', async () => {

            const cache:any = {};
            const cachingImplementation = inMemoryCache(cache);

            let number6 = new Dependency<{},{},number>({name: "number6", parameters: {}, evaluator: $ => 6, cacheTrail: [],})
            let number3 = new Dependency<{},{},number>({name: "number3", parameters: {}, evaluator: $ => 3, cacheTrail: [],cache:{noCache:true}})
            
            let do6plus3 = new Dependency<{},{number6:number,number3:number},number>({
                name: "do6plus3",
                dependencies:[number6,number3],
                parameters: {},
                evaluator: $ => $.number3 + $.number6,
                cacheTrail: [],
                cache:{noCache:true}
            })

            let do6times3 = new Dependency<{},{number6:number,number3:number},number>({
                name: "do6times3",
                dependencies:[number6,number3],
                parameters: {},
                evaluator: $ => $.number3 * $.number6,
                cacheTrail: [],
                cache:{noCache:true}
            })

            let do6plus3plus1 = new Dependency<{},{do6plus3:number},number>({
                name: "do6plus3plus1",
                dependencies:[do6plus3],
                parameters: {},
                evaluator: $ => $.do6plus3 + 1,
                cacheTrail: [number6],
                cache:{noCache:true}
            })

            let do6plus3plus1plus1_cached = new Dependency<{},{do6plus3plus1:number},number>({
                name: "do6plus3plus1plus1_cached",
                dependencies:[do6plus3plus1],
                parameters: {},
                evaluator: $ => $.do6plus3plus1 + 1,
                cacheTrail: [number6]
            })

            let do18minus12 = new Dependency<{},{do6plus3plus1plus1_cached:number,do6times3:number},number>({
                name: "do6plus3plus1plus1_cached",
                dependencies:[do6times3,do6plus3plus1plus1_cached],
                parameters: {},
                evaluator: $ => $.do6plus3plus1plus1_cached - $.do6times3,
                cacheTrail: [number6,do6plus3plus1plus1_cached],
                cache:{noCache:true}
            })

            let ctx1 = new CommsDependencyEvaluator(cachingImplementation,silent)
            let firstResultPromise = await ctx1.get(do18minus12,{});

            let firstResult = await firstResultPromise;
            expect(firstResult).to.equal(-7);
            expect(cache.number6).to.equal(InMemoryCache.Serialize(number6,6));
            expect(cache.do6plus3plus1plus1_cached).to.equal(InMemoryCache.Serialize(do6plus3plus1plus1_cached,11));

            // // change the cached values
            await cachingImplementation.UpdateCache(number6,{},5);
            await cachingImplementation.UpdateCache(do6plus3plus1plus1_cached,{},5);
            expect(cache.number6).to.equal(InMemoryCache.Serialize(number6,5));
            expect(cache.do6plus3plus1plus1_cached).to.equal(InMemoryCache.Serialize(do6plus3plus1plus1_cached,5));

            const validator = chai.spy((v:number) => {return v == -7});

            let finalResult:number = 0;
            try {
                finalResult = await ctx1.get(do18minus12,{},{maxHealingIterations:10, validator});
            } catch(e) {

            }
            expect(finalResult).to.equal(-7);

            expect(validator).on.nth(1).be.called.with(-10);
            expect(validator).on.nth(2).be.called.with(-5);
            expect(validator).on.nth(3).be.called.with(-7);
            expect(validator).to.have.been.called.exactly(3);

        })

        it('Setting minAge causes cache to resolve (i.e. the evaluator is not called) even when healing', async () => {
            const cache:any = {};
            const cachingImplementation = inMemoryCache(cache);

            const six = chai.spy($ => 6)
            const validator = chai.spy($ => $ == 6)

            const number6 = new Dependency<{},{},number>({
                name: "number6",
                parameters: {},
                evaluator: six,
                cacheTrail: [],
                cache: {minAge:10}
            })

            const ctx1 = new CommsDependencyEvaluator(cachingImplementation,silent)

            // cause healing on the next evaluation by manually changing the cache
            cache.number6 = InMemoryCache.Serialize(number6,7)

            const r2_fromFreshCache = await ctx1.get(number6,{},{validator}).catch(() => {return})
            expect(six).to.have.been.called.exactly(0)
            expect(validator).to.have.been.called.exactly(2)
            expect(validator).on.nth(1).be.called.with(7);
            expect(validator).on.nth(2).be.called.with(7);

        })

        it('Setting maxAge and waiting until expiry to reevaluate causes cache miss (i.e. the evaluator is called)', async () => {

            const cache:any = {};
            const cachingImplementation = inMemoryCache(cache);

            const six = chai.spy($ => 6)
            const validator = chai.spy($ => $ == 6)

            const number6 = new Dependency<{},{},number>({
                name: "number6",
                parameters: {},
                evaluator: six,
                cacheTrail: [],
                cache: {maxAge:0.5}
            })

            const ctx1 = new CommsDependencyEvaluator(cachingImplementation,silent)

            // pre-populate the cache
            cache.number6 = JSON.stringify({
                expiresAt: moment().utc().add(1,'minute'),
                value:6
            })

            // get while cache is current
            const r1_currentCache = await ctx1.get(number6,{},{validator}).catch(() => {return})
            expect(six).to.have.been.called.exactly(0)
            expect(r1_currentCache).to.equal(6)
            expect(validator).to.have.been.called.exactly(1)

            // make the cache expired
            cache.number6 = JSON.stringify({
                expiresAt: moment().utc().subtract(1,'second'),
                value:6
            })

            // re-get
            const r2_expiredCache = await ctx1.get(number6,{},{validator}).catch(() => {return})
            expect(six).to.have.been.called.exactly(1)
            expect(r2_expiredCache).to.equal(6)
            expect(validator).to.have.been.called.exactly(2)

        })

        it('Invalid value from the cache causes evalution', async () => {

            const cache:any = {};
            const cachingImplementation = inMemoryCache(cache);

            const validator = chai.spy($ => $ === 6);
            const six = chai.spy($ => 6)

            const number6 = new Dependency<{},{},number>({
                name: "number6",
                parameters: {},
                evaluator: six,
                validator,
                cacheTrail: [],
            })

            const ctx1 = new CommsDependencyEvaluator(cachingImplementation,silent)

            const r1 = await ctx1.get(number6,{})
            expect(six).to.have.been.called.exactly(1)
            expect(validator).to.have.been.called.exactly(1)
            expect(validator).on.nth(1).be.called.with(6);

            cache.number6 = InMemoryCache.Serialize(number6,7)

            const r2_fromCache = await ctx1.get(number6,{})
            expect(six).to.have.been.called.exactly(2)
            expect(validator).to.have.been.called.exactly(3)
            expect(validator).on.nth(2).be.called.with(7);
            expect(validator).on.nth(3).be.called.with(6);
        })


        it('Throwing validator on a dependency causes evaluator not to be called', async () => {

            const cache:any = {};
            const cachingImplementation = inMemoryCache(cache);

            const validator = chai.spy(() => {throw new Error()});
            const plus1 = chai.spy($ => $.number6 + 1)
            const six = chai.spy($ => 6)

            const number6 = new Dependency<{},{},number>({
                name: "number6",
                parameters: {},
                evaluator: six,
                validator,
                cacheTrail: [],
            })


            const do6plus1 = new Dependency<{},{number6:number},number>({name: "do6plus1", parameters: {}, dependencies:[number6], evaluator: plus1, cacheTrail: [],cache:{noCache:true}})

            const ctx1 = new CommsDependencyEvaluator(cachingImplementation,silent)

            const r = ctx1.get(do6plus1,{})
            expect(r).to.be.rejected;
            await r.catch(() => {return})

            expect(six).to.have.been.called.exactly(1)
            expect(validator).to.have.been.called.exactly(1)
            expect(plus1).to.have.been.called.exactly(0)

        })

        it('Failing validator on a dependency causes evaluator not to be called', async () => {

            const cache:any = {};
            const cachingImplementation = inMemoryCache(cache);

            const validator = chai.spy(() => false);
            const plus1 = chai.spy($ => $.number6 + 1)
            const six = chai.spy($ => 6)

            const number6 = new Dependency<{},{},number>({
                name: "number6",
                parameters: {},
                evaluator: six,
                validator,
                cacheTrail: [],
            })


            const do6plus1 = new Dependency<{},{number6:number},number>({name: "do6plus1", parameters: {}, dependencies:[number6], evaluator: plus1, cacheTrail: [],cache:{noCache:true}})

            const ctx1 = new CommsDependencyEvaluator(cachingImplementation,silent)

            const r = ctx1.get(do6plus1,{})
            expect(r).to.be.rejected;
            await r.catch(() => {return})

            expect(six).to.have.been.called.exactly(1)
            expect(validator).to.have.been.called.exactly(1)
            expect(plus1).to.have.been.called.exactly(0)

        })

        
        it('Rejects when unhealable - i.e. when validator returns false after all healing attempts', async () => {
        
            let ctx = new CommsDependencyEvaluator(inMemoryCache(),silent)

            const validator = chai.spy((v:number) => {return v == 5});

            let dependency = new Dependency({
                name: "Number3",
                parameters: {},
                evaluator: ($:{}) => 3,
                validator,
                cacheTrail: [],
                cache: {noCache: true}
            })

            let v = ctx.get(dependency,{})

            return expect(v).to.be.rejectedWith('CommsDependency: Get: Final iteration 0 failed');

        })

        it('Preassertions are evaluated before dependencies', async () => {
            const cache:any = {};
            const cachingImplementation = inMemoryCache(cache);

            const evaluations:string[] = []

            const six = () => {
                evaluations.push("six");
                return 6;
            }
            const seven = () => {
                evaluations.push("seven");
                return 7;
            }

            const number6 = new Dependency<{},{},number>({
                name: "number6",
                parameters: {},
                evaluator: six,
                cacheTrail: [],
                cache:{noCache:true}
            })

            const number7 = new Dependency<{},{},number>({
                name: "number7",
                parameters: {},
                evaluator: seven,
                cacheTrail: [],
                cache:{noCache:true}
            })

            const doAdd = new Dependency<{},{number7:number},number>({
                name: "doAdd",
                parameters: {},
                preassertions:[number6],
                dependencies:[number7],
                evaluator: $ => $.number7 + 1,
                cacheTrail: [],
                cache:{noCache:true}})

            const ctx1 = new CommsDependencyEvaluator(cachingImplementation,silent);

            await ctx1.get(doAdd,{})

            expect(evaluations[0]).to.eql("six")
            expect(evaluations[1]).to.eql("seven")
            expect(evaluations[2]).to.be.undefined // no more evaluations

        })

        it('Preassertions are not re-evaluated if they are also a dependency', async () => {
            const cache:any = {};
            const cachingImplementation = inMemoryCache(cache);

            const evaluations:string[] = []

            const six = () => {
                evaluations.push("six");
                return 6;
            }
            const seven = () => {
                evaluations.push("seven");
                return 7;
            }

            const number6 = new Dependency<{},{},number>({
                name: "number6",
                parameters: {},
                evaluator: six,
                cacheTrail: [],
                cache:{noCache:true}
            })

            const number7 = new Dependency<{},{},number>({
                name: "number7",
                parameters: {},
                evaluator: seven,
                cacheTrail: [],
                cache:{noCache:true}
            })

            const doAdd = new Dependency<{},{number6:number,number7:number},number>({
                name: "doAdd",
                parameters: {},
                preassertions:[number6],
                dependencies:[number6,number7],
                evaluator: $ => $.number6 + $.number7,
                cacheTrail: [],
                cache:{noCache:true}})

            const ctx1 = new CommsDependencyEvaluator(cachingImplementation,silent);

            await ctx1.get(doAdd,{})

            expect(evaluations[0]).to.eql("six")
            expect(evaluations[1]).to.eql("seven")
            expect(evaluations[2]).to.be.undefined // no more evaluations
        })

        it('Conditional dependencies are evaluated iff their condition returns true', async () => {

            const cache:any = {};
            const cachingImplementation = inMemoryCache(cache);

            const Number = new Dependency<{Number:number},{},number>({
                name: "Number",
                parameters: {},
                evaluator: $ => $.Number,
                cacheTrail: [],
                cache:{noCache:true}
            })

            const isEven = new Dependency<{Number:number},{Number:number},boolean>({
                name: "isEven",
                parameters: {},
                evaluator: $ => $.Number % 2 == 0,
                dependencies: [Number],
                cacheTrail: [],
                cache:{noCache:true}
            })

            const halve = chai.spy(($:{Number:number}) => $.Number/2)

            const halfOf = new Dependency<{Number:number},{Number:number},number>({
                name: "halfOf",
                parameters: {},
                evaluator: halve,
                dependencies: [Number],
                cacheTrail: [],
                cache:{noCache:true}
            })

            const NumberReport = new Dependency<{Number:number},{isEven:boolean,halfOf?:number},{isEven:boolean,halfOf?:number,Number:number}>({
                name: "NumberReport",
                parameters: {},
                dependencies:[
                    isEven,
                    {
                        do: halfOf,
                        when: $ => $.intermediate.isEven
                    }
                ], 
                evaluator: $ => $,
                cacheTrail: []
                ,cache:{noCache:true}
            })

            const ctx1 = new CommsDependencyEvaluator(cachingImplementation,silent)

            const result1 = await ctx1.get(NumberReport,{Number:14})
            expect(result1.Number).to.eq(14)
            expect(result1.isEven).to.eq(true)
            expect(result1.halfOf).to.eq(7)
            
            expect(halve).to.be.called.exactly(1);

            // do the evaluation again with 13 as input. Number of calls should stay at 1

            const result2 = await ctx1.get(NumberReport,{Number:13})
            expect(result2.Number).to.eq(13)
            expect(result2.isEven).to.eq(false)
            expect(result2.halfOf).to.be.undefined;
            
            expect(halve).to.be.called.exactly(1);
            
        })


    })

})