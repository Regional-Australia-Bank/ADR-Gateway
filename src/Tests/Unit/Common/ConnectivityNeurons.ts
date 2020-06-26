import chai from 'chai';
import { expect } from "chai";
import { PathwayFactory } from '../../../Common/Connectivity/PathwayFactory';
import { ValueNeuron, Neuron, CompoundNeuron, EvaluationContext } from '../../../Common/Connectivity/Neuron';


export const Tests = (() => {

    describe('Connectivity Neurons', async () => {

        it('Evaluates a trivial chain', async () => {

            let pathway = ValueNeuron.Create(3).Extend(Neuron.Passthru<number>());
            
            let v = pathway.Evaluate();
            expect(v).to.be.fulfilled;
            let result = await v;
            expect(result).to.equal(3);

            
        })

        it('Evaluates a chain correctly', async () => {

            let pathway = Neuron
                .NeuronZero()
                .Extend(ValueNeuron.Create(3),ValueNeuron.Create(7))
                .Extend(
                    Neuron.CreateSimple(([a,b]:[number,number]) => {return a + b}),
                    Neuron.CreateSimple(([a,b]:[number,number]) => {return Promise.resolve(a * b)})
                )
                .Extend(Neuron.CreateSimple(([a,b]:[number,number]) => {return a - b}))
            
            let v = pathway.Evaluate();
            expect(v).to.be.fulfilled;
            let result = await v;
            expect(result).to.equal(-11);

            
        })

        it('Support expansion', async () => {

            let n1 = ValueNeuron.Create(3);
            // let n2 = n1.Extend(
            //     Neuron.CreateSimple((a:number) => {
            //         return a+1
            //     }),
            //     Neuron.CreateSimple((x:number) => {
            //         return x
            //     }),
            //     Neuron.Passthru<number>()
            // )

            let plusOne = Neuron.CreateSimple((a:number) => {
                return a+1
            });
            let add = Neuron.CreateSimple(([a,b]:[number,number]) => {
                return a+b
            });

            // let pathway1 = n1.Expand(
            //     plusOne.Expand(
            //         plusOne.Expand(plusOne).Extend(add)
            //     ).Extend(add)
            // ).Extend(add);

            let e1 = plusOne.Expand(plusOne); //Compound-Neuron7
            let e2 = e1.Extend(add);
            let e3 = n1.Expand(e2).Extend(add);

            let pathway2 = e3;

            let v2 = pathway2.Evaluate();
            expect(v2).to.be.fulfilled;
            let result2 = await v2;
            expect(result2).to.equal(12);


            return;
        
            // let v = pathway1.Evaluate();
            // expect(v).to.be.fulfilled;
            // let result = await v;
            // expect(result).to.equal(18);

            // let p = n1.Expand(plusOne.Expand(plusOne));

        })

        describe('Evaluates duplicated dependancies only once', async () => {
            
            it('Simple inputs', async () => {
            
                let v1 = ValueNeuron.Create(3);
        
                const spy2 = chai.spy.on(v1,'evaluator');
        
                let pathway = Neuron
                    .NeuronZero()
                    .Extend(v1)
                    .Extend(
                        Neuron.CreateSimple((a:number) => {return a}),
                        Neuron.CreateSimple((a:number) => {return a})
                    )
                
                let v = pathway.Evaluate();
                let result = await v;
                expect(result[0]).to.equal(3);
                expect(result[1]).to.equal(3);
        
                expect(spy2).to.be.called.once;
                return expect(v).to.be.fulfilled;
                
            })
            
        })

        describe('Combined dependencies and padding',async () => {
            it('PadRight adds the correct number of passthru neurons and evaluates correctly',async () => {
                let n1 = Neuron.NeuronZero().Extend(Neuron.CreateSimple(() => {return 3}));
                expect(n1.GetMaxLength()).to.equal(2);
                let n1_pad_right = n1.PadRight(5);
                expect(n1_pad_right.GetMaxLength()).to.equal(5);
                let v1 = await n1.Evaluate();
                let v2 = await n1_pad_right.Evaluate();
                expect(v1).to.equal(3);
                expect(v2).to.equal(3);
            })

            it('Combining dependencies results in a Neuron with length of the largest, and evaluates correctly',async () => {
                let n2 = Neuron.NeuronZero().Extend(Neuron.CreateSimple(() => {return 1})).PadRight(2);
                let n4 = Neuron.NeuronZero().Extend(Neuron.CreateSimple(() => {return 2})).PadRight(4);
                let n5 = Neuron.NeuronZero().Extend(Neuron.CreateSimple(() => {return 3})).PadRight(5);

                expect(n2.GetMaxLength()).to.equal(2);
                expect(n4.GetMaxLength()).to.equal(4);
                expect(n5.GetMaxLength()).to.equal(5);

                let combined = Neuron.NeuronZero().Extend(Neuron.Combined(n5,n4,n2));
                let [v5,v4,v2]:[number,number,number] = await combined.Evaluate()
                expect(v2).to.equal(1);
                expect(v4).to.equal(2);
                expect(v5).to.equal(3);
            })
        
            it('When pathways with a common neuron (n1) are combined, n1 is evaluated only once',async () => {
                const e = chai.spy(() => {
                    return 1;
                });
                let n1 = Neuron.CreateSimple(e);
                (<any>n1).marker = "MARK";
                const ne = Neuron.NeuronZero().Extend(n1);


                let n2 = ne.PadRight(2);
                let n4 = ne.PadRight(2);

                expect(n2.GetMaxLength()).to.equal(2);
                expect(n4.GetMaxLength()).to.equal(2);

                let combined = Neuron.Combined(n2,n2);
                let [v2,v4]:[number,number] = await combined.Evaluate()
                expect(v2).to.equal(1);
                expect(v4).to.equal(1);

                expect(e).to.be.called.exactly(1)
            })

        })

        describe('Pathway generation',async () => {
            it('Pathways GenerateOnced by the factory are identical iff the paramaters are the same',async () => {

                const ConstantNumberFnGenerator = (x:number) => () => x

                let YourNumber = PathwayFactory.GenerateOnce(() => Neuron.NeuronZero().Extend(Neuron.CreateSimple(ConstantNumberFnGenerator(3))))
                let MyNumber = PathwayFactory.GenerateOnce((x:number) => Neuron.NeuronZero().Extend(Neuron.CreateSimple(ConstantNumberFnGenerator(x))))

                let n1_1 = YourNumber();
                let n1_2 = YourNumber();
                let n2_1 = MyNumber(5);
                let n2_2 = MyNumber(5);
                let n3_1 = MyNumber(6);
                let n3_2 = MyNumber(6);

                expect(n1_1 === n1_2).to.be.true
                expect(n2_1 === n2_2).to.be.true
                expect(n3_1 === n3_2).to.be.true

                expect(n2_1 === n3_1).to.be.false

            })

            it('Pathways from the pathway factory, containing neurons in common, neuron is evaluated only once',async () => {
                const evaluator = chai.spy(() => 3);
                
                const CommonNeuron = PathwayFactory.GenerateOnce(() => Neuron.NeuronZero().Extend(Neuron.CreateSimple(evaluator)))

                let cn = CommonNeuron()

                const DependsOnCommonNeuronOnce = PathwayFactory.GenerateOnce(() => Neuron.Combined(
                    CommonNeuron()
                ))

                const DependsOnCommonNeuronTwice = PathwayFactory.GenerateOnce(() => Neuron.Combined(
                    DependsOnCommonNeuronOnce(),
                    CommonNeuron()
                ))


                let [a,b] = await DependsOnCommonNeuronTwice().Evaluate()

                expect(a).to.equal(3)
                expect(b).to.equal(3)

                expect(evaluator).to.be.called.exactly(1);

            })

            it('Neuron.Require giving tuple outputs, dependent neuron executed only once in evaluation traversal',async () => {
                const evaluator = chai.spy(() => 3);
                const dependentEvaluator = chai.spy(([a,b]:[number,number]) => a+b);
                
                const CommonNeuron = PathwayFactory.GenerateOnce(() => Neuron.NeuronZero().Extend(Neuron.CreateSimple(evaluator)))
                const CommonDependentNueron = Neuron.CreateSimple(dependentEvaluator)

                const DependsOnCommonNeuronOnce = PathwayFactory.GenerateOnce(() => Neuron.Combined(
                    CommonNeuron()
                ))

                const DependsOnCommonNeuronTwice = PathwayFactory.GenerateOnce(() => Neuron.Combined(
                    DependsOnCommonNeuronOnce(),
                    CommonNeuron()
                ))

                const requiredTuple = PathwayFactory.GenerateOnce(() => Neuron.Combined(
                    DependsOnCommonNeuronTwice().Extend(CommonDependentNueron),
                    DependsOnCommonNeuronTwice().Extend(CommonDependentNueron)
                ))

                let x = await requiredTuple().Evaluate()

                expect(evaluator).to.be.called.exactly(1);
                expect(dependentEvaluator).to.be.called.exactly(1);

            })        
        
        })

        describe('Describes max length of neuron pathway (chain) accurately',async () => {

            it('Length of simple chain of 3 is 2', async () => {
                let v1 = ValueNeuron.Create(1);
                let v2 = Neuron.CreateSimple((a:number) => a);
                let v3 = Neuron.CreateSimple((a:number) => a);

                expect(v1.Extend(v2).Extend(v3).GetMaxLength()).to.equal(3);
                expect(v1.Extend(v2.Extend(v3)).GetMaxLength()).to.equal(3); // check for distributivity
            })

            it('Length of simple diverging chain of 3 is 2', async () => {
                let v1 = ValueNeuron.Create(1);
                let v2 = Neuron.CreateSimple((a:number) => a);
                let v3 = Neuron.CreateSimple((a:number) => a);

                let pathway = v1.Extend(v2,v3);

                expect(pathway.GetMaxLength()).to.equal(2);
            })


            it('Length of simple converging chain of 4 is 3', async () => {
                let v1 = ValueNeuron.Create(1);
                let v2 = Neuron.CreateSimple((a:number) => a);
                let v3 = Neuron.CreateSimple((a:number) => a);
                let v4 = Neuron.CreateSimple(([a,b]:[number,number]) => a + b);

                let pathway = v1.Extend(v2,v3).Extend(v4);

                expect(pathway.GetMaxLength()).to.equal(3);
            })

            it('Length of nested extension chain of 4 is 3', async () => {
                let v1 = ValueNeuron.Create(1);
                let v2_1 = Neuron.CreateSimple((a:number) => a);
                let v2_2 = Neuron.CreateSimple((a:number) => a);
                let v2 = v2_1.Extend(v2_2);

                let pathway = v1.Extend(v2);

                expect(pathway.GetMaxLength()).to.equal(3);
            })

            it('Length of complex converging chain of 5 is 4', async () => {
                let v1 = ValueNeuron.Create(1);
                let v2_1 = Neuron.CreateSimple((a:number) => a);
                let v2_2 = Neuron.CreateSimple((a:number) => a);
                let v2 = v2_1.Extend(v2_2);
                let v3 = Neuron.CreateSimple((a:number) => a);
                let v4 = Neuron.CreateSimple(([a,b]:[number,number]) => a + b);

                let pathway = v1.Extend(v2,v3).Extend(v4);

                expect(pathway.GetMaxLength()).to.equal(4);
            })


            it('Length of a complex neuron pathway', async () => {

                const n0 = Neuron.NeuronZero();
                const n1 = ValueNeuron.Create(3);
                const n2 = Neuron.CreateSimple(([a,b]:[number,number]) => {return a + b});
                const n3 = Neuron.CreateSimple((a:number) => {return a + 1})
                const n4 = Neuron.CreateSimple((a:number) => {return a + 1})
                const n5 = Neuron.CreateSimple(([a,b]:[number,number]) => {return a - b});

                let pathway = n0 //0th neuron
                .Extend(n1,ValueNeuron.Create(3)) // 1st neuron
                .Extend(
                    n2 // 2nd neuron
                        .Extend(n3) // 3rd neuron
                        .Extend(n4), // 4th neuron
                    Neuron.CreateSimple(([a,b]:[number,number]) => {return Promise.resolve(a * b)}) // also a 2nd neuron
                )
                .Extend(n5) // 5th neuron

                expect(pathway.GetMaxLength()).to.equal(6);

            })

        })

        it('Populates cache and detects and recovers from healable error condition', async () => {
            
            const cache:any = {};
            const cachingImplementation = {
                EmptyCache: async ():Promise<void> => {
                    cache.value = undefined;
                    return;
                },
                FetchCache: async ():Promise<number> => {
                    if (typeof cache.value == 'undefined') throw 'Not in cache'
                    return cache.value
                },
                UpdateCache: async (a:number) => {
                    cache.value = a;
                },
            };

            let v1 = ValueNeuron.Create(3);
            let v2 = Neuron.CreateSimple((a:number) => a+1,{cache:cachingImplementation});

            let pathway1 = v1.Extend(v2)
            
            let firstResultPromise = pathway1.Evaluate();
            let firstResult = await firstResultPromise;
            expect(firstResult).to.equal(4);
            expect(cache.value).to.equal(4);

            // change the stored value of v1
            await cachingImplementation.UpdateCache(3);
            expect(cache.value).to.equal(3);

            const validator = chai.spy((v:number) => {return v == 4});

            let finalResult:number = 0;
            try {
                finalResult = await pathway1.GetWithHealing(validator);
            } catch(e) {

            }
            expect(finalResult).to.equal(4);

            expect(validator).on.nth(1).be.called.with(3);
            expect(validator).on.nth(2).be.called.with(4);

        })
        
        it('Recovers from multiple failures in a complex chain', async () => {

            const cache_n1:any = {};
            const cache_n4:any = {};
            const cachingImplementation_n1 = {
                EmptyCache: async ():Promise<void> => {
                    cache_n1.value = undefined;
                    return;
                },
                FetchCache: async ():Promise<number> => {
                    if (typeof cache_n1.value == 'undefined') throw 'Not in cache'
                    return cache_n1.value
                },
                UpdateCache: async (a:number) => {
                    cache_n1.value = a;
                },
            };

            const cachingImplementation_n4 = {
                EmptyCache: async ():Promise<void> => {
                    cache_n4.value = undefined;
                    return;
                },
                FetchCache: async ():Promise<number> => {
                    if (typeof cache_n4.value == 'undefined') throw 'Not in cache'
                    return cache_n4.value
                },
                UpdateCache: async (a:number) => {
                    cache_n4.value = a;
                },
            };

            const n0 = Neuron.NeuronZero();
            const n1 = Neuron.CreateSimple((() => 6),{cache:cachingImplementation_n1});
            const n2 = Neuron.CreateSimple(([a,b]:[number,number]) => {return a + b});
            const n3 = Neuron.CreateSimple((a:number) => {return a + 1})
            const n4 = Neuron.CreateSimple((a:number) => a+1,{cache:cachingImplementation_n4});
            const n5 = Neuron.CreateSimple(([a,b]:[number,number]) => {return a - b});

            let pathway = n0 //0th neuron
            .Extend(n1,ValueNeuron.Create(3)) // 1st neuron
            .Extend(
                n2 // 2nd neuron
                    .Extend(n3) // 3rd neuron
                    .Extend(n4), // 4th neuron
                Neuron.CreateSimple(([a,b]:[number,number]) => {return Promise.resolve(a * b)}) // also a 2nd neuron
            )
            .Extend(n5) // 5th neuron

            
            // let pathway = n0 //0th neuron
            // .Extend(ValueNeuron.Create(3)) // 1st neuron
            // .Extend(n3.Extend(n4))
            

            expect(pathway.GetMaxLength()).to.equal(6);

            let firstResultPromise = pathway.Evaluate();
            let firstResult = await firstResultPromise;
            expect(firstResult).to.equal(-7);
            expect(cache_n1.value).to.equal(6);
            expect(cache_n4.value).to.equal(11);

            // // change the cached values
            await cachingImplementation_n1.UpdateCache(5);
            await cachingImplementation_n4.UpdateCache(5);
            expect(cache_n1.value).to.equal(5);
            expect(cache_n4.value).to.equal(5);

            const validator = chai.spy((v:number) => {return v == -7});

            let finalResult:number = 0;
            try {
                finalResult = await pathway.GetWithHealing(validator);
            } catch(e) {

            }
            expect(finalResult).to.equal(-7);

            expect(validator).on.nth(1).be.called.with(-10);
            expect(validator).on.nth(2).be.called.with(-10);
            expect(validator).on.nth(3).be.called.with(-5);
            expect(validator).on.nth(4).be.called.with(-5);
            expect(validator).on.nth(5).be.called.with(-5);
            expect(validator).on.nth(6).be.called.with(-7);
            expect(validator).to.have.been.called.exactly(6);

        })

        it('Validators on earlier neurons cause fewer evaluations on later neurons (LTR)', async () => {

            // TODO RTL test case

            const makeCache = <T>(v: T) => {
                const cache:any = {
                    value: v
                };
        
                const cachingImplementation = {
                    EmptyCache: async ():Promise<void> => {
                        cache.value = undefined;
                        return;
                    },
                    FetchCache: async ():Promise<number> => {
                        if (typeof cache.value == 'undefined') throw 'Not in cache'
                        return cache.value
                    },
                    UpdateCache: async (a:number) => {
                        cache.value = a;
                    },
                };

                return cachingImplementation;
            }

            const testContext = (pathwayConstructor: (n1:Neuron<void,number>,n2:Neuron<number,number>) => CompoundNeuron<void,number>) => {
                const n1_cache = makeCache(5);
                const n1 = Neuron.CreateSimple(() => 6,{cache:n1_cache});
                const n2_cache = makeCache(5);
                const n2 = Neuron.CreateSimple((n:number) => n+1,{cache:n2_cache})

                let n1_Eval_Spy = chai.spy.on(n1,'evaluator')
                let n2_Eval_Spy = chai.spy.on(n2,'evaluator')
                let n1_FetchCache_Spy = chai.spy.on(n1_cache,'FetchCache')
                let n2_FetchCache_Spy = chai.spy.on(n2_cache,'FetchCache')
                let n1_UpdateCache_Spy = chai.spy.on(n1_cache,'UpdateCache')
                let n2_UpdateCache_Spy = chai.spy.on(n2_cache,'UpdateCache')

                return {
                    n1_Eval_Spy,
                    n2_Eval_Spy,
                    n1_FetchCache_Spy,
                    n2_FetchCache_Spy,
                    n1_UpdateCache_Spy,
                    n2_UpdateCache_Spy,
                    pathway: pathwayConstructor(n1,n2)
                }
                    
            }

            // For simple evaluation, the evaluators will not be called because the cache is populated
            let context = testContext((n1,n2) => n1.Extend(n2))
            let evaluationPromise = context.pathway.Evaluate(undefined,{context:{direction:"ltr"}});
            await new Promise(resolve=>evaluationPromise.then(resolve,resolve))
            expect(context.n1_Eval_Spy).to.be.called.exactly(0);
            expect(context.n2_Eval_Spy).to.be.called.exactly(0);
            expect(context.n1_FetchCache_Spy).to.be.called.exactly(1);
            expect(context.n2_FetchCache_Spy).to.be.called.exactly(1);

            // New test context for the basic healing process (neurons have no validators)
            context = testContext((n1,n2) => n1.Extend(n2)); // refresh the testing condition
            let pathwayValidator = (o:number) => o == 7;
            let healingPromise = context.pathway.GetWithHealing(pathwayValidator,"ltr");
            let healingResult = await healingPromise;
            expect(context.n1_Eval_Spy).to.be.called.exactly(1);
            expect(context.n2_Eval_Spy).to.be.called.exactly(2);
            expect(context.n1_FetchCache_Spy).to.be.called.exactly(2);
            expect(context.n2_FetchCache_Spy).to.be.called.exactly(1); // this is the critical point. n2 depends on n1 and is cached on the output of n1. If n1 has a validator and invalidates it's output, then n2.FetchCache should never be called. This is the design of early failure.
            expect(context.n1_UpdateCache_Spy).to.be.called.exactly(1);
            expect(context.n2_UpdateCache_Spy).to.be.called.exactly(2);
            expect(healingResult).to.equal(7);

            // New test context for the smart healing process (n1 has a validator, which means an error in the cache is detected earlier, causing n2)
            context = testContext((n1,n2) => n1.AddValidator(v => v == 6).Extend(n2)); // refresh the testing condition
            pathwayValidator = (o:number) => o == 7;
            healingPromise = context.pathway.GetWithHealing(pathwayValidator,"ltr");
            healingResult = await healingPromise;
            expect(context.n1_Eval_Spy).to.be.called.exactly(1);
            expect(context.n2_Eval_Spy).to.be.called.exactly(1);
            expect(context.n1_FetchCache_Spy).to.be.called.exactly(2);
            expect(context.n2_FetchCache_Spy).to.be.called.exactly(0); // this is the critical point. n2 depends on n1 and is cached on the output of n1. If n1 has a validator and invalidates it's output, then n2.FetchCache should never be called. This is the design of early failure.
            expect(context.n1_UpdateCache_Spy).to.be.called.exactly(1); // only updated after successful validation
            expect(context.n2_UpdateCache_Spy).to.be.called.exactly(1);
            expect(healingResult).to.equal(7);

        })

        it('GetWithHealing validators can set values in the containing function', async () => {

            let v = <number|undefined>undefined;

            let n = Neuron.CreateSimple(() => 3).Extend(Neuron.Passthru<number>());
            let result = await n.GetWithHealing((o) => {
                v = o + 1;
                return true;
            })

            expect(result).to.equal(3)
            expect(v).to.equal(4)

        })

        it('Extend() can be distributive for evaluation', async () => {

            const n1 = ValueNeuron.Create(3);
            const n2 = Neuron.CreateSimple((a:number) => {return a + 1})
            const n3 = Neuron.CreateSimple((a:number) => a+1);

            let pathway1 = n1.Extend(n2.Extend(n3))
            let pathway2 = n2.Extend(n2).Extend(n3)
        })
        
        it('Rejects when unhealable - i.e. when validator returns false after all healing attempts', async () => {
        
            const cache:any = {};
            const cachingImplementation = {
                EmptyCache: async ():Promise<void> => {
                    cache.value = undefined;
                    return;
                },
                FetchCache: async ():Promise<number> => {
                    if (typeof cache.value == 'undefined') throw 'Not in cache'
                    return cache.value
                },
                UpdateCache: async (a:number) => {
                    cache.value = a;
                },
            };

            let v1 = ValueNeuron.Create(3);
            let v2 = Neuron.CreateSimple((a:number) => a+1,{cache:cachingImplementation});

            let pathway1 = v1.Extend(v2)
            
            let firstResultPromise = pathway1.Evaluate();
            let firstResult = await firstResultPromise;
            expect(firstResult).to.equal(4);
            expect(cache.value).to.equal(4);

            // change the stored value of v1
            await cachingImplementation.UpdateCache(3);
            expect(cache.value).to.equal(3);

            const validator = chai.spy((v:number) => {return v == 5});
            const healingPromise = pathway1.GetWithHealing(validator);

            let finalResult:number = 0;
            try {
                finalResult = await healingPromise;
            } catch(e) {

            }
            expect(finalResult).to.equal(0);

            expect(validator).on.nth(1).be.called.with(3);
            expect(validator).on.nth(2).be.called.with(4);

            return expect(healingPromise).to.be.rejectedWith('GetWithHealing: Maximum depth reached with no valid output.');

        })    


        describe('Pathway isolation', () => {
            it('NoCache isolation Neurons are evaluated the expected number of times (LTR)', async () => {
                // TODO RTL test case
                const cache:any = {};
                const cachingImplementation = {
                    EmptyCache: async ():Promise<void> => {
                        cache.value = undefined;
                        return;
                    },
                    FetchCache: async ():Promise<number> => {
                        if (typeof cache.value == 'undefined') throw 'Not in cache'
                        return cache.value
                    },
                    UpdateCache: async (a:number) => {
                        cache.value = a;
                    },
                };

                let e1 = chai.spy(() => 3);
                let e2 = chai.spy((i:number) => i+1);

                let n1 = Neuron.CreateSimple(e1)
                let n2 = Neuron.CreateSimple(e2, {cache:cachingImplementation})

                let pathway1 = Neuron.Presume(
                    n1.Extend(n2) // cache.value == 4, first evaluatrion
                    .Extend(n2).Extend(n2) // still cache.value == 4 and output = 4
                ).Extend(Neuron.Require(
                    n1.Extend(Neuron.Isolate(n2,'NoCache')) // second evaluation: 4
                    .Extend(Neuron.Isolate(n2,'NoCache')) // third evaluation: 5
                    .Extend(Neuron.Isolate(n2,'NoCache')) // fourth evaluation: 6 (cache.value == 6)
                ))

                let output = await pathway1.Evaluate(undefined,{context:{direction:"ltr"}});

                expect(output).to.equal(6);
                expect(e2).on.nth(1).to.be.called.with(3)
                expect(e2).on.nth(2).to.be.called.with(3)
                expect(e2).on.nth(3).to.be.called.with(4)
                expect(e2).on.nth(4).to.be.called.with(5)

                expect(e2).to.be.called.exactly(4);        
            })
        })


        describe('Pathway encapsulations for conditional execution/evaluation', () => {

            it('Can be described and evaluated', async () => {
                let e1 = chai.spy(() => 3);
                let e1_alt = chai.spy(() => 5);
                let e2 = chai.spy((i:number) =>{
                    return i+1
                });
                let e3 = chai.spy((i:number) => i+15);

                let n1 = Neuron.CreateSimple(e1)
                let n1_alt = Neuron.CreateSimple(e1_alt)
                let n2 = Neuron.CreateSimple(e2)

                let capsule = Neuron.Encapsulate({
                    when: (o) => o == 5,
                    "do": n2.Extend(Neuron.Passthru<number>())
                });

                let p = n1.Extend(capsule)

                let p_alt = n1_alt.Extend(capsule)

                let r = await p.Evaluate();

                let r_alt = await p_alt.Evaluate();

                expect(r).to.be.undefined;
                expect(r_alt).to.equal(6);

                expect(capsule.GetEncapsulatedPath().extensionMaxLength).to.eq(2)
                expect(p.GetMaxLength()).to.eq(3)
                
            })

            it.skip('Consistent in healing scenario', async () => {
                // Spy on the calls to Evaluate to ensure that cacheIgnoranceLength starts at zero and ends at the max length of the encapsulated pathway
                throw "Test case needs rewriting. See notes."
                const brokenCache = {
                    EmptyCache: async ():Promise<void> => {
                        return;
                    },
                    FetchCache: async ():Promise<number> => {
                        return <any>'Naughty cache'
                    },
                    UpdateCache: async (a:number) => {
                        return;
                    },
                };

                let e1 = chai.spy(() => {
                    return 3
                });
                let e2 = chai.spy(() => {
                    return 4
                });

                let n1 = Neuron.CreateSimple(e1,{cache:brokenCache})
                let n2 = Neuron.CreateSimple(e2,{cache:brokenCache})

                let capsule = n1.Extend(Neuron.Ignore()).Extend(n1).Extend(Neuron.Ignore()).Extend(n1).Extend(Neuron.Ignore()).Extend(n1)

                /**
                 * This pathway will recover quickly, because the cache is ignored and an i-o cache is not available for the last instance of n2.
                 * In the last round of changes, An "i-o cache" is only updated if the input is retrieved. There could be a use case for demanding that
                 * in the LTR scenario, but this case does not test it.
                 * 
                 * Probably needed is a separate test case for the RTL scenario.
                 * 
                 * WARNING. This is not a complete test case of the handling of cacheIgnoranceLength
                 */
                let pathway = n2.Extend(Neuron.Ignore()).Extend(Neuron.Encapsulate({when:() => true,do:capsule})).Extend(Neuron.Ignore()).Extend(n2)

                let capsule_e = capsule.Evaluate;
                let pathway_e = pathway.Evaluate;

                let cache_ignorance_spy = chai.spy((s:string,l:any) => {return})

                capsule.Evaluate = (input?:any,options?:{cacheIgnoranceLength?:number,context?:EvaluationContext}) => {
                    cache_ignorance_spy('capsule',options?.cacheIgnoranceLength)
                    return capsule_e(input,options)
                }

                pathway.Evaluate = (input?:any,options?:{cacheIgnoranceLength?:number,context?:EvaluationContext}) => {
                    cache_ignorance_spy('pathway',options?.cacheIgnoranceLength)
                    return pathway_e(input,options)
                }

                let result = await pathway.GetWithHealing((o) => <any>o != 'Naughty cache', "ltr")

                expect(result).to.eq(4)

                expect(pathway.GetMaxLength()).to.eq(11);

                expect(cache_ignorance_spy).on.nth(1).to.be.called.with('pathway',0)
                expect(cache_ignorance_spy).on.nth(2).to.be.called.with('capsule',0)
                expect(cache_ignorance_spy).on.nth(3).to.be.called.with('capsule',0)
                expect(cache_ignorance_spy).on.nth(4).to.be.called.with('pathway',1)
                expect(cache_ignorance_spy).on.nth(5).to.be.called.with('capsule',0)
                expect(cache_ignorance_spy).on.nth(6).to.be.called.with('capsule',0)
                expect(cache_ignorance_spy).on.nth(7).to.be.called.with('capsule',0)
                expect(cache_ignorance_spy).to.be.called.exactly(7)


            })

            it('Traversal cache extends to the encapsulated pathway', async () => {
                // let e1 = chai.spy(() => 3);
                let e2 = chai.spy(() => 4);

                // let n1 = Neuron.CreateSimple(e1).Extend(Neuron.Passthru<number>())
                let n2 = Neuron.CreateSimple(e2).Extend(Neuron.Passthru<number>())

                // let pathway1 = n1.Extend(Neuron.Ignore()).Extend(n1)
                let pathway2 = n2.Extend(Neuron.Ignore()).Extend(Neuron.Encapsulate({when:() => true,do:n2}))

                // let output1 = await pathway1.Evaluate(undefined,{context:{direction:"ltr"}});
                let output2 = await pathway2.Evaluate(undefined,{context:{direction:"ltr"}});

                // expect(output1).to.equal(3);
                expect(output2).to.equal(4);

                // expect(e1).to.be.called.exactly(1);
                expect(e2).to.be.called.exactly(1);
                
            })

            /**
             * Note this is only a design-time type-mapping test
             */
            it('Works with do/when/else', () => {
                let e1 = chai.spy(() => 3);
                let n1 = Neuron.CreateSimple(e1).Extend(Neuron.Passthru<number>());

                let do_step = n1.Do(Neuron.CreateSimple((i:number)=>i+1).Extend(Neuron.Passthru<number>()))
                let when_step = do_step.When(i => i==3)
                let else_neuron = Neuron.CreateSimple((i:number)=>i+2).Extend(Neuron.Passthru<number>())
                let else_step = when_step.Else(else_neuron)

                let pw = else_step.Extend(Neuron.CreateSimple((n:number) => `I have the number ${n}`));

            })

            /**
             * Note this is only a design-time type-mapping test
             */
            it('Works with do/when (no else)', () => {
                let e1 = chai.spy(() => 3);
                let n1 = Neuron.CreateSimple(e1).Extend(Neuron.Passthru<number>());

                let do_step = n1.Do(Neuron.CreateSimple((i:number)=>i+1).Extend(Neuron.Passthru<number>()))
                let when_step = do_step.When(i => i==3)

                let pw = when_step.EndDo();

            })

        })


        describe('Assertions', () => {
            it('Assertions pass through the result of the preceeding neuron', async () => {
                let v1 = Neuron.NeuronZero().Extend(ValueNeuron.Create(3));
        
                let assertionEvaluator = chai.spy((x:number) => {
                    return `Here is you number: ${x}`
                })
        
                let assertionValidator = chai.spy((s:string) => {
                    return s == 'Here is you number: 3'
                })
        
                let assertionNeuron = Neuron.CreateSimple(assertionEvaluator).AddValidator(assertionValidator)
                let v2 = v1.Assert(assertionNeuron);
        
                let r1 = await v1.Evaluate();
                let r2 = await v2.Evaluate();
        
                expect(assertionEvaluator).to.be.called.exactly(1);
                expect(assertionValidator).to.be.called.exactly(1);
        
                expect(r1).to.equal(r2);
            })
            it('Assertions evaluations fail when the validator throws', async () => {
                let v1 = Neuron.NeuronZero().Extend(ValueNeuron.Create(3));
                let v2 = Neuron.NeuronZero().Extend(ValueNeuron.Create(4));
        
                let assertionEvaluator = chai.spy((x:number) => {
                    return `Here is you number: ${x}`
                })
        
                let assertionValidator = chai.spy((s:string) => {
                    let valid = s == 'Here is you number: 3';
                    if (!valid) throw 'Number is not 3'
                    return valid;
                })
        
                let assertionNeuron = Neuron.CreateSimple(assertionEvaluator).AddValidator(assertionValidator)
                let a1 = v1.Assert(assertionNeuron);
                let a2 = v2.Assert(assertionNeuron);
        
                let r1 = await a1.Evaluate();
                expect(r1).to.equal(3);
        
                let r2 = a2.Evaluate();
                let error = await r2.catch((err) => err)
                expect(error.innerError.error).to.equal('Number is not 3')
        
            })
        
            it('Assertions evaluations fail when the validator returns false', async () => {
                let v1 = Neuron.NeuronZero().Extend(ValueNeuron.Create(3));
                let v2 = Neuron.NeuronZero().Extend(ValueNeuron.Create(4));
        
                let assertionEvaluator = chai.spy((x:number) => {
                    return `Here is you number: ${x}`
                })
        
                let assertionValidator = chai.spy((s:string) => {
                    let valid = s == 'Here is you number: 3';
                    return valid;
                })
        
                let assertionNeuron = Neuron.CreateSimple(assertionEvaluator).AddValidator(assertionValidator)
                let a1 = v1.Assert(assertionNeuron);
                let a2 = v2.Assert(assertionNeuron);
        
                let r1 = await a1.Evaluate();
                expect(r1).to.equal(3);
        
                let r2 = a2.Evaluate();
                let error = await r2.catch((err) => err)
                expect(error.innerError.error).to.equal('Validation failed without throwing')
        
            })


            it('Void-input assertions behave the same as output-input assertions', async () => {
                let v1 = Neuron.NeuronZero().Extend(ValueNeuron.Create(3));
        
                let voidInputAssertionEvaluator = chai.spy(() => {
                    return `Here is you number: 3`
                })

                let outputInputAssertionEvaluator = chai.spy((x:number) => {
                    return `Here is you number: ${x}`
                })


                let assertionValidator = chai.spy((s:string) => {
                    return s == 'Here is you number: 3'
                })
        
                let voidInputAssertionNeuron = Neuron.CreateSimple(voidInputAssertionEvaluator).AddValidator(assertionValidator)
                let outputInputAssertionNeuron = Neuron.CreateSimple(outputInputAssertionEvaluator).AddValidator(assertionValidator)

                let a1_1 = v1.Assert(voidInputAssertionNeuron);
                let a1_2 = v1.Assert(outputInputAssertionNeuron);
        
                let r1_1 = await a1_1.Evaluate();
                let r1_2 = await a1_2.Evaluate();
        
                expect(voidInputAssertionEvaluator).to.be.called.exactly(1);
                expect(outputInputAssertionEvaluator).to.be.called.exactly(1);

                expect(r1_1).to.equal(3);    
                expect(r1_1).to.equal(r1_2);
            })

            it('Presumptions are evaluated and the entire pathway is evaluated as expected', async () => {
                let e1 = chai.spy(() => 3);
                let e2 = chai.spy(() => 4);

                let p = Neuron.Presume(
                    Neuron.CreateSimple(e1)
                ).Extend(Neuron.CreateSimple(e2))

                let o = await p.Evaluate();

                expect(o).to.equal(4);
                expect(e1).to.be.called.exactly(1)
                expect(e2).to.be.called.exactly(1)

            })
        
        

        })
    })

})