/* eslint-env mocha */
/* eslint no-unused-expressions:0 */

// Module under test
const {
    resetConfig,
    setConfigurator,
    getImplementation,
    lock
} = require("../../../src/lib/config");

// Support
const { expect } = require("chai");
const { propertySetter } = require("../../../src/lib/config-util");

describe("config module", () => {
    beforeEach(() => {
        resetConfig();
    });

    it("should give the default configuration when nothing is configured", () => {
        const { config } = getImplementation("any/logger/at/all");
        expect(config).to.deep.equal({});
    });

    it("should apply all configurators above the logger", () => {
        setConfigurator("a", propertySetter("a", true));
        setConfigurator("a/b", propertySetter("b", true));
        setConfigurator("a/b/c/d/e", propertySetter("e", true));

        const { config } = getImplementation("a/b/c/d/e/f/g/h");

        expect(config).to.include({
            a: true,
            b: true,
            e: true,
            enabled: true
        });
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

    describe("locking", () => {
        let key;

        beforeEach(() => {
            setConfigurator("a/b/c", propertySetter("c", true));
            key = lock();
        });

        afterEach(() => {
            key.unlock();
        });

        it("should not allow config changes when locked", () => {
            setConfigurator("a/b/c", propertySetter("c", false));
            const { config } = getImplementation("a/b/c");
            expect(config).to.include({
                c: true,
                enabled: true
            });
        });

        it("should not allow a new lock to change configuration when already locked", () => {
            const notKey = lock();
            notKey.setConfigurator("a/b/c", propertySetter("c", false));
            const { config } = getImplementation("a/b/c");
            expect(config).to.include({
                c: true,
                enabled: true
            });
        });

        it("should not allow a new lock to reset configuration when already locked", () => {
            const notKey = lock();
            notKey.resetConfig();
            const { config } = getImplementation("a/b/c");
            expect(config).to.include({
                c: true,
                enabled: true
            });
        });

        it("should not allow a new lock to unlock configuration when already locked", () => {
            const notKey = lock();
            notKey.unlock();
            setConfigurator("a/b/c", propertySetter("c", false));
            const { config } = getImplementation("a/b/c");
            expect(config).to.include({
                c: true,
                enabled: true
            });
        });

        it("should allow config changes using the lock", () => {
            key.setConfigurator("a/b/c", propertySetter("c", false));
            const { config } = getImplementation("a/b/c");
            expect(config).to.include({
                c: false,
                enabled: true
            });
        });

        it("should not allow an old key to change configuration when locked", () => {
            const oldKey = key;
            oldKey.unlock();
            key = lock();
            oldKey.setConfigurator("a/b/c", propertySetter("c", false));
            const { config } = getImplementation("a/b/c");
            expect(config).to.include({
                c: true,
                enabled: true
            });
        });

        it("should not allow an old key to reset configuration when locked", () => {
            const oldKey = key;
            oldKey.unlock();
            key = lock();
            oldKey.resetConfig();
            const { config } = getImplementation("a/b/c");
            expect(config).to.include({
                c: true,
                enabled: true
            });
        });

        it("should not allow an old key to unlock configuration when locked", () => {
            const oldKey = key;
            oldKey.unlock();
            key = lock();
            oldKey.unlock();
            setConfigurator("a/b/c", propertySetter("c", false));
            const { config } = getImplementation("a/b/c");
            expect(config).to.include({
                c: true,
                enabled: true
            });
        });
    });
});
