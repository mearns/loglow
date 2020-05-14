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
        setRootConfigurator(propertySetter("is-root", "yeh"));
        const { config } = getImplementation("a/b/c");
        expect(config).to.include({
            "is-root": "yeh"
        });
        expect(config).to.not.haveOwnProperty("enabled");
    });

    it("should get the same implementation twice", () => {
        setConfigurator("a", propertySetter("a", true));

        const firstImp = getImplementation("a/b/c/d/e/f/g/h");
        const secondImp = getImplementation("a/b/c/d/e/f/g/h");

        expect(firstImp).to.deep.equal(secondImp);
    });

    it("should give a new configuration when configurators change", () => {
        setConfigurator("a/b/c/d", propertySetter("d", true));
        const firstConfig = getImplementation("a/b/c/d/e/f");

        setConfigurator("a/b", propertySetter("b", true));
        const secondConfig = getImplementation("a/b/c/d/e/f");

        setConfigurator("a/b/c/d", propertySetter("d", 2));
        const thirdConfig = getImplementation("a/b/c/d/e/f");

        expect(firstConfig.config).to.include({
            d: true,
            enabled: true
        });
        expect(secondConfig.config).to.include({
            d: true,
            b: true,
            enabled: true
        });
        expect(thirdConfig.config).to.include({
            d: 2,
            b: true,
            enabled: true
        });
    });

    it("should handle errors thrown by configurators", () => {
        setConfigurator("a/b/c", () => {
            const error = new Error("test configurator error");
            error.name = "TestError";
            error.foo = "bar";
            throw error;
        });
        expect(() => getImplementation("a/b/c/d")).to.throw;
        try {
            getImplementation("a/b/c/d");
            assert.fail("getImplementation() should have thrown an Error");
        } catch (error) {
            expect(error.message).to.deep.equal("test configurator error");
            expect(error).to.have.haveOwnProperty("name", "TestError");
            expect(error).to.have.haveOwnProperty("foo", "bar");
        }
    });

    describe("locking", () => {
        let key;

        beforeEach(() => {
            setConfigurator("a/b/c", propertySetter("c", true));
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
            api.setConfigurator("a/b/c", propertySetter("c", false));
            const { config } = getImplementation("a/b/c");
            expect(config).to.include({
                c: true,
                enabled: true
            });
        });

        whenLockedIt(
            "should not allow the root configurator to be changed",
            api => {
                api.setRootConfigurator(propertySetter("root", true));
                const { config } = getImplementation("a/b/c");
                expect(config).to.include({
                    c: true,
                    enabled: true
                });
                expect(config).to.not.haveOwnProperty("root");
            }
        );

        whenLockedIt("should not allow configuration to be reset", api => {
            api.resetConfig();
            const { config } = getImplementation("a/b/c");
            expect(config).to.include({
                c: true,
                enabled: true
            });
        });

        whenLockedIt("should not allow configuration to be unlocked", api => {
            api.unlock();
            setConfigurator("a/b/c", propertySetter("c", false));
            const { config } = getImplementation("a/b/c");
            expect(config).to.include({
                c: true,
                enabled: true
            });
        });
    });
});
