/* eslint-env mocha */
/* eslint no-unused-expressions:0 */

// Module under test
const config = require("../../../src/lib/config");
const {
    on,
    log,
    resetConfig,
    setConfigurator,
    setRootConfigurator,
    lock,
    getImplementation,
    LOG
} = config;

// Support
const chai = require("chai");
const { expect, assert } = chai;
const {
    compose,
    propertySetter,
    addDecorator
} = require("../../../src/lib/config-util");
const sinon = require("sinon");
const sinonChai = require("sinon-chai");

chai.use(sinonChai);

describe("config module", () => {
    let logSpy;

    beforeEach(() => {
        logSpy = sinon.spy();
        on(LOG, logSpy);
    });

    afterEach(() => {
        resetConfig();
    });

    it("should be disabled when nothing is configured", () => {
        log({ loggerName: "any/logger/at/all", message: "any message" });
        expect(logSpy).not.to.have.been.called;
    });

    it("should apply all configurators above the logger", () => {
        setConfigurator("a", addDecorator({ a: true }));
        setConfigurator("a/b", addDecorator({ b: true }));
        setConfigurator("a/b/c/d/e", addDecorator({ e: true }));

        log({
            loggerName: "a/b/c/d/e/f/g/h",
            message: "what-ever",
            metas: [{ orig: true }]
        });

        expect(logSpy).to.have.been.calledOnce;
        expect(logSpy).to.have.been.calledWithExactly(
            sinon.match({
                loggerName: "a/b/c/d/e/f/g/h",
                message: "what-ever",
                metadata: {
                    a: true,
                    b: true,
                    e: true,
                    orig: true
                }
            })
        );
    });

    it("should apply the root configurator to all implementations", () => {
        setRootConfigurator(
            compose(
                addDecorator({ "is-root": "yeh" }),
                propertySetter("enabled", true)
            )
        );
        log({
            loggerName: "a/b/c",
            message: "what-ever",
            metas: [{ orig: true }]
        });
        expect(logSpy).to.have.been.calledOnce;
        expect(logSpy).to.have.been.calledWithExactly(
            sinon.match({
                loggerName: "a/b/c",
                message: "what-ever",
                metadata: {
                    orig: true,
                    "is-root": "yeh"
                }
            })
        );
    });

    it("should be fine if the root configurator is null", () => {
        setRootConfigurator(null);
        setConfigurator("a/b", addDecorator({ b: true }));
        log({ loggerName: "a/b/c", metas: [{ orig: true }] });
        expect(logSpy).to.have.been.calledOnce;
        expect(logSpy).to.have.been.calledWithExactly(
            sinon.match({
                loggerName: "a/b/c",
                metadata: {
                    orig: true,
                    b: true
                }
            })
        );
    });

    it("should not set enabled if only the root configurator applies", () => {
        setRootConfigurator(addDecorator({ "is-root": true }));
        log({ loggerName: "a/b/c", metas: [{ orig: true }] });
        expect(logSpy).to.not.have.been.called;
    });

    it("should apply the new configuration when configurators change", () => {
        setConfigurator("a/b/c/d", addDecorator({ d: true }));
        log({ loggerName: "a/b/c/d/e", metas: [{ orig: true }] });

        setConfigurator("a/b", addDecorator({ b: true }));
        setConfigurator("a/b/c/d", addDecorator({ d: 2 }));
        log({ loggerName: "a/b/c/d/e", metas: [{ orig: 2 }] });

        expect(logSpy).to.have.been.calledTwice;
        expect(logSpy).to.have.been.calledWithExactly(
            sinon.match({
                loggerName: "a/b/c/d/e",
                metadata: {
                    orig: true,
                    d: true
                }
            })
        );
        expect(logSpy).to.have.been.calledWithExactly(
            sinon.match({
                loggerName: "a/b/c/d/e",
                metadata: {
                    orig: 2,
                    b: true,
                    d: 2
                }
            })
        );
    });

    it("should handle errors thrown by configurators", () => {
        setConfigurator("a/b/c", () => {
            const error = new Error("test configurator error");
            error.name = "TestError";
            error.foo = "bar";
            throw error;
        });
        expect(() =>
            log({
                loggerName: "a/b/c/d",
                message: "test-message",
                metas: [{ orig: true }]
            })
        ).to.throw;
        try {
            log({
                loggerName: "a/b/c/d",
                message: "test-message",
                metas: [{ orig: true }]
            });
            assert.fail("log() should have thrown an Error");
        } catch (error) {
            expect(error.message).to.deep.equal("test configurator error");
            expect(error).to.have.haveOwnProperty("name", "TestError");
            expect(error).to.have.haveOwnProperty("foo", "bar");
        }
    });

    describe("locking", () => {
        let key;

        beforeEach(() => {
            setConfigurator("a/b/c", addDecorator({ c: 1 }));
            key = lock();
        });

        afterEach(() => {
            key.unlock();
        });

        function whenLockedIt(should, testFunc) {
            it(`${should} when locked`, () => {
                const api = {
                    resetConfig,
                    setConfigurator,
                    setRootConfigurator,
                    lock,
                    unlock: () => {}
                };
                return testFunc(api);
            });
            it(`${should} with a dummy lock`, () => {
                const notKey = lock();
                return testFunc(notKey);
            });
            it(`${should} with an old lock`, () => {
                const oldKey = key;
                oldKey.unlock();
                key = lock();
                return testFunc(oldKey);
            });
        }

        whenLockedIt("should not allow config changes", api => {
            api.setConfigurator("a/b/c", addDecorator({ c: 2 }));
            log({
                loggerName: "a/b/c/d",
                message: "test message",
                metas: [{ orig: true }]
            });
            expect(logSpy).to.have.been.calledOnce;
            expect(logSpy).to.have.been.calledWithExactly(
                sinon.match({
                    loggerName: "a/b/c/d",
                    metadata: {
                        orig: true,
                        c: 1
                    }
                })
            );
        });

        whenLockedIt(
            "should not allow the root configurator to be changed",
            api => {
                api.setRootConfigurator(addDecorator({ root: 2 }));
                log({
                    loggerName: "a/b/c/d",
                    message: "test message",
                    metas: [{ orig: true }]
                });
                expect(logSpy).to.have.been.calledOnce;
                expect(logSpy).to.have.been.calledWithExactly(
                    sinon.match({
                        loggerName: "a/b/c/d",
                        metadata: {
                            orig: true,
                            c: 1
                        }
                    })
                );
            }
        );

        whenLockedIt("should not allow configuration to be reset", api => {
            api.resetConfig();
            log({
                loggerName: "a/b/c/d",
                message: "test message",
                metas: [{ orig: true }]
            });
            expect(logSpy).to.have.been.calledOnce;
            expect(logSpy).to.have.been.calledWithExactly(
                sinon.match({
                    loggerName: "a/b/c/d",
                    metadata: {
                        orig: true,
                        c: 1
                    }
                })
            );
        });

        whenLockedIt("should not allow configuration to be unlocked", api => {
            api.unlock();
            setConfigurator("a/b/c", addDecorator({ c: 2 }));
            log({
                loggerName: "a/b/c/d",
                message: "test message",
                metas: [{ orig: true }]
            });
            expect(logSpy).to.have.been.calledOnce;
            expect(logSpy).to.have.been.calledWithExactly(
                sinon.match({
                    loggerName: "a/b/c/d",
                    metadata: {
                        orig: true,
                        c: 1
                    }
                })
            );
        });
    });
});
